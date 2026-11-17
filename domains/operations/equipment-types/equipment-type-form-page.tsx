"use client";

import clsx from "clsx";
import { ArrowLeft, Loader2, Power, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { normalizeCreatedEquipmentTypeId, normalizeEquipmentTypeDetail, toEquipmentTypePayload, validateEquipmentType, type EquipmentTypeDetail } from "@/domains/operations/equipment-types/equipment-types-contract";

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
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const canManage = roles.some((role) => MANAGER_ROLES.includes(role.trim().toLowerCase()));
  const canCreate = canManage && hasPermission("EquipmentTypes", "Create");
  const canUpdate = canManage && hasPermission("EquipmentTypes", "Update");
  const canActivate = canManage && hasPermission("EquipmentTypes", "Activate");
  const canDeactivate = canManage && hasPermission("EquipmentTypes", "Deactivate");
  const canDelete = canManage && hasPermission("EquipmentTypes", "Delete");
  const [item, setItem] = useState<EquipmentTypeDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadItem = useCallback(async () => {
    if (!validId || parsedId === null) {
      setLoadError(t("equipmentTypes.errors.invalidId"));
      setLoading(false);
      return;
    }
    setItem(null); setName(""); setDescription(""); setLoading(true); setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${parsedId}/`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, response.status === 404 || response.status === 410 ? t("equipmentTypes.errors.notFound") : t("equipmentTypes.errors.loadDetail")));
      const detail = normalizeEquipmentTypeDetail(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("equipmentTypes.errors.loadDetail"));
      setItem(detail); setName(detail.name); setDescription(detail.description);
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
    if (editing ? !currentItem || !canUpdate : !canCreate) return;
    if (!validateEquipmentType(name, description)) {
      toast({ title: t("equipmentTypes.toasts.validationTitle"), description: t("equipmentTypes.validation.fields"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/gerit/v1/equipment-types/${currentItem!.id}/` : "/api/gerit/v1/equipment-types/", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEquipmentTypePayload(name, description)),
      });
      if (!response) return;
      const payload = response.status === 204 ? null : await response.json().catch(() => null) as unknown;
      if (editing) {
        if (response.status !== 204) throw new Error(errorMessage(payload, t("equipmentTypes.errors.save")));
        toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.updated") });
        await loadItem();
      } else {
        if (response.status !== 201) throw new Error(errorMessage(payload, t("equipmentTypes.errors.save")));
        const newId = normalizeCreatedEquipmentTypeId(payload);
        if (!newId) throw new Error(t("equipmentTypes.errors.createResponse"));
        toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.created") });
        router.push(`/equipment-types/${newId}/`);
      }
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.save"), variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async () => {
    if (!currentItem || statusSubmitting) return;
    const operation = currentItem.isActive ? "deactivate" : "activate";
    if (currentItem.isActive ? !canDeactivate : !canActivate) return;
    setStatusSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${currentItem.id}/${operation}/`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (response.status !== 200) throw new Error(errorMessage(payload, t("equipmentTypes.errors.status")));
      toast({ title: t("equipmentTypes.toasts.successTitle"), description: t(operation === "activate" ? "equipmentTypes.toasts.activated" : "equipmentTypes.toasts.deactivated") });
      await loadItem();
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.status"), variant: "destructive" });
    } finally { setStatusSubmitting(false); }
  };

  const deleteItem = async () => {
    if (!currentItem || !canDelete || deleteSubmitting) return;
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
    } finally { setDeleteSubmitting(false); }
  };

  const title = editing ? currentItem?.name ?? t("equipmentTypes.form.editTitle") : t("equipmentTypes.form.newTitle");
  const createdDate = currentItem?.createdAt ? new Date(currentItem.createdAt) : null;
  const dateLabel = createdDate && !Number.isNaN(createdDate.getTime()) ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(createdDate) : "—";
  return <div data-testid={editing ? "equipment-type-details-page-root" : "equipment-types-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
      <header className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push("/equipment-types/")} className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" title={t("equipmentTypes.actions.back")} aria-label={t("equipmentTypes.actions.back")}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
          <div><div className="flex items-center gap-3"><h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{title}</h1>{currentItem ? <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentItem.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentItem.isActive ? "equipmentTypes.status.active" : "equipmentTypes.status.inactive")}</span> : null}</div><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("equipmentTypes.form.subtitle")}</p></div>
        </div>
        {currentItem && (currentItem.isActive ? canDeactivate : canActivate) || currentItem && canDelete ? <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {(currentItem.isActive ? canDeactivate : canActivate) ? <button type="button" onClick={() => void toggleStatus()} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50">{statusSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}{t(currentItem.isActive ? "equipmentTypes.actions.deactivate" : "equipmentTypes.actions.activate")}</button> : null}
          {canDelete ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("equipmentTypes.actions.delete")}</button> : null}
        </div> : null}
      </header>
      {detailLoading ? <div role="status" className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("equipmentTypes.loadingDetail")}</span></div> : null}
      {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
      {!detailLoading && (!editing || currentItem) ? <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
        <section data-testid="equipment-type-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
            <div className="space-y-5">
              <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("equipmentTypes.form.name")}</span><Input id="equipment-type-name" required maxLength={200} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("equipmentTypes.form.description")}</span><textarea id="equipment-type-description" maxLength={500} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} className="flex w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" /></label>
            </div>
            {currentItem ? <aside className="space-y-3 rounded-sm border border-border bg-card p-4 text-sm"><h2 className="font-semibold">{t("equipmentTypes.detail.metadata")}</h2><p>{t("equipmentTypes.detail.id", { id: currentItem.id })}</p><p>{t("equipmentTypes.detail.createdAt", { date: dateLabel })}</p></aside> : null}
          </div>
        </section>
        {(editing ? canUpdate : canCreate) ? <div className="flex justify-end"><button type="submit" disabled={submitting || deleteSubmitting} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{t("equipmentTypes.actions.save")}</button></div> : null}
      </form> : null}
    </div>
    <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }} title={t("equipmentTypes.actions.delete")} description={t("equipmentTypes.confirm.delete", { name: currentItem?.name ?? "" })} confirmLabel={t("equipmentTypes.actions.delete")} cancelLabel={t("equipmentTypes.actions.cancel")} onConfirm={() => void deleteItem()} />
  </div>;
}
