"use client";

import clsx from "clsx";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubConfirmDialog } from "@/shared/ui/hub-confirm-dialog";
import { HubSwitch } from "@/shared/ui/hub-switch";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { normalizeEquipmentTypeDetail, toEquipmentTypePayload, validateEquipmentType, type EquipmentTypeDetail } from "@/domains/operations/equipment-types/equipment-types-contract";

interface EquipmentTypeFormPageProps { equipmentTypeId?: string }
const MANAGER_ROLES = ["admin", "backoffice", "manager"];

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const value of [candidate.message, candidate.error, candidate.title]) if (typeof value === "string" && value.trim()) return value;
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    for (const messages of Object.values(candidate.errors as Record<string, unknown>)) {
      if (Array.isArray(messages) && typeof messages[0] === "string") return messages[0];
    }
  }
  return fallback;
}

export function EquipmentTypeFormPage({ equipmentTypeId }: EquipmentTypeFormPageProps) {
  const editing = equipmentTypeId !== undefined;
  const parsedId = editing ? Number(equipmentTypeId) : null;
  const validId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0;
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const canManage = roles.some((role) => MANAGER_ROLES.includes(role.trim().toLowerCase()));
  const canCreate = canManage && hasPermission("EquipmentTypes", "Create");
  const canUpdate = canManage && hasPermission("EquipmentTypes", "Update");
  const canDelete = canManage && hasPermission("EquipmentTypes", "Delete");
  const [item, setItem] = useState<EquipmentTypeDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const submitLock = useRef(false);
  const deleteLock = useRef(false);

  const loadItem = useCallback(async () => {
    if (!validId || parsedId === null) {
      setLoadError(t("equipmentTypes.errors.invalidId"));
      setLoading(false);
      return;
    }
    setItem(null); setName(""); setDescription(""); setFormIsActive(true); setLoading(true); setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${parsedId}/`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, response.status === 404 || response.status === 410 ? t("equipmentTypes.errors.notFound") : t("equipmentTypes.errors.loadDetail")));
      const detail = normalizeEquipmentTypeDetail(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("equipmentTypes.errors.loadDetail"));
      setItem(detail); setName(detail.name); setDescription(detail.description); setFormIsActive(detail.isActive);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("equipmentTypes.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [fetchWithAuth, parsedId, t, toast, validId]);

  useEffect(() => { if (editing && !isHydrating && isAuthenticated) void loadItem(); }, [editing, isAuthenticated, isHydrating, loadItem]);
  const currentItem = editing && item?.id === parsedId ? item : null;
  const detailLoading = loading || (editing && (isHydrating || currentItem === null && loadError === null));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || deleteLock.current || (editing ? !currentItem || !canUpdate : !canCreate)) return;
    if (!validateEquipmentType(name, description)) {
      toast({ title: t("equipmentTypes.toasts.validationTitle"), description: t("equipmentTypes.validation.fields"), variant: "destructive" });
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/gerit/v1/equipment-types/${currentItem!.id}/` : "/api/gerit/v1/equipment-types/", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEquipmentTypePayload(name, description, formIsActive)),
      });
      if (!response) return;
      const payload = response.status === 204 ? null : await response.json().catch(() => null) as unknown;
      if (editing) {
        if (response.status !== 204) throw new Error(errorMessage(payload, t("equipmentTypes.errors.save")));
        toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.updated") });
        router.push("/equipment-types/");
      } else {
        if (response.status !== 201) throw new Error(errorMessage(payload, t("equipmentTypes.errors.save")));
        toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.created") });
        router.push("/equipment-types/");
      }
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.save"), variant: "destructive" });
    } finally { submitLock.current = false; setSubmitting(false); }
  };

  const deleteItem = async () => {
    if (!currentItem || !canDelete || deleteLock.current || submitLock.current) return;
    deleteLock.current = true;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${currentItem.id}/`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (response.status !== 200) throw new Error(errorMessage(payload, t("equipmentTypes.errors.delete")));
      setDeleteOpen(false);
      toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.deleted") });
      router.push("/equipment-types/");
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.delete"), variant: "destructive" });
    } finally { deleteLock.current = false; setDeleteSubmitting(false); }
  };

  const title = editing ? currentItem?.name ?? t("equipmentTypes.form.editTitle") : t("equipmentTypes.form.newTitle");
  return <div data-testid={editing ? "equipment-type-details-page-root" : "equipment-types-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
      <header className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{title}</h1>{currentItem ? <span data-testid="equipment-type-persisted-status" className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentItem.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentItem.isActive ? "equipmentTypes.status.active" : "equipmentTypes.status.inactive")}</span> : null}</div><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("equipmentTypes.form.subtitle")}</p>
        </div>
      </header>
      {detailLoading ? <div role="status" className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("equipmentTypes.loadingDetail")}</span></div> : null}
      {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
      {!detailLoading && (!editing || currentItem) ? <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
        <section data-testid="equipment-type-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
            <label data-testid="equipment-type-name-field" className="block sm:col-span-8 md:col-span-10"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("equipmentTypes.form.name")}</span><Input id="equipment-type-name" required maxLength={200} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></label>
            <div data-testid="equipment-type-status-field" className="sm:col-span-4 md:col-span-2"><HubSwitch id="equipment-type-is-active-switch" testId="equipment-type-is-active-switch" label={t("equipmentTypes.table.status")} checked={formIsActive} onCheckedChange={setFormIsActive} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></div>
            <label data-testid="equipment-type-description-field" className="block w-full sm:col-span-12"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("equipmentTypes.form.description")}</span><Textarea id="equipment-type-description" maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} className="h-20 min-h-[80px] resize-y px-4" /></label>
          </div>
        </section>
        <div className="flex flex-wrap justify-start gap-3">
          <button type="button" onClick={() => router.push("/equipment-types/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("equipmentTypes.actions.back")}</button>
          {editing && currentItem && canDelete ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-6 py-2.5 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("equipmentTypes.actions.delete")}</button> : null}
          {(editing ? canUpdate : canCreate) ? <button type="submit" disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("equipmentTypes.actions.save")}</button> : null}
        </div>
      </form> : null}
    </div>
    <HubConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }} title={t("equipmentTypes.actions.delete")} description={t("equipmentTypes.confirm.delete", { name: currentItem?.name ?? "" })} confirmLabel={t("equipmentTypes.actions.delete")} cancelLabel={t("equipmentTypes.actions.cancel")} variant="destructive" loading={deleteSubmitting} onConfirm={deleteItem} />
  </div>;
}
