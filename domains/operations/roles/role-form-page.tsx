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
import {
  buildRoleAccess,
  normalizeRole,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  toRoleCreatePayload,
  toRoleUpdatePayload,
  validateRoleForm,
  type RoleRecord,
} from "@/domains/operations/roles/roles-contract";

interface RoleFormPageProps { roleId?: string }

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    const first = Object.values(candidate.errors as Record<string, unknown>).find((value) => Array.isArray(value) && value.length > 0);
    if (Array.isArray(first) && typeof first[0] === "string" && first[0].trim()) return first[0];
  }
  return fallback;
}

export function RoleFormPage({ roleId }: RoleFormPageProps) {
  const editing = roleId !== undefined;
  const parsedId = editing ? Number(roleId) : null;
  const validId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0;
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const access = buildRoleAccess(roles, hasPermission);
  const canSave = editing ? access.update : access.create;
  const [role, setRole] = useState<RoleRecord | null>(null);
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
  const requestSequence = useRef(0);

  const loadRole = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!validId || parsedId === null) {
      setRole(null);
      setLoadError(t("roles.errors.invalidId"));
      setLoading(false);
      return;
    }
    if (!access.getBy) {
      setRole(null);
      setLoadError(t("roles.errors.permissionDenied"));
      setLoading(false);
      return;
    }
    setRole(null);
    setName("");
    setDescription("");
    setFormIsActive(true);
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/roles/" + parsedId + "/", { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (sequence !== requestSequence.current) return;
      if (!response.ok) {
        const fallback = response.status === 410 || response.status === 404 ? t("roles.errors.notFound") : t("roles.errors.loadDetail");
        throw new Error(errorMessage(payload, fallback));
      }
      const detail = normalizeRole(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("roles.errors.loadDetail"));
      setRole(detail);
      setName(detail.name);
      setDescription(detail.description ?? "");
      setFormIsActive(detail.isActive);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const message = error instanceof Error ? error.message : t("roles.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("roles.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [access.getBy, fetchWithAuth, parsedId, t, toast, validId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadRole();
    else if (!editing && !isHydrating && isAuthenticated) setLoading(false);
    return () => { requestSequence.current += 1; };
  }, [editing, isAuthenticated, isHydrating, loadRole]);

  const currentRole = editing && role?.id === parsedId ? role : null;
  const detailLoading = loading || (editing && (isHydrating || currentRole === null && loadError === null));
  const validationError = validateRoleForm(name, description);
  const canSubmit = canSave && !submitting && !deleteSubmitting && validationError === null && (!editing || currentRole !== null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || deleteLock.current || !canSave || (editing && !currentRole)) return;
    const invalid = validateRoleForm(name, description);
    if (invalid) {
      toast({ title: t("roles.toasts.validationTitle"), description: t("roles.validation." + invalid), variant: "destructive" });
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetchWithAuth(
        editing ? "/api/gerit/v1/roles/" + currentRole!.id + "/" : "/api/gerit/v1/roles/",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing
            ? toRoleUpdatePayload(description, formIsActive)
            : toRoleCreatePayload(name, description, formIsActive)),
        },
      );
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      const expectedStatus = editing ? 200 : 201;
      if (response.status !== expectedStatus) {
        const fallback = response.status === 409 ? t("roles.errors.conflict")
          : response.status === 410 ? t("roles.errors.notFound")
            : t("roles.errors.save");
        throw new Error(errorMessage(payload, fallback));
      }
      toast({
        title: t("roles.toasts.successTitle"),
        description: t(editing ? "roles.toasts.updated" : "roles.toasts.created"),
      });
      router.push("/roles/");
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.save"), variant: "destructive" });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const deleteRole = async () => {
    if (!currentRole || !access.delete || deleteLock.current || submitLock.current) return;
    deleteLock.current = true;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/roles/" + currentRole.id + "/", { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (response.status !== 200) {
        const fallback = response.status === 410 ? t("roles.errors.notFound") : t("roles.errors.delete");
        throw new Error(errorMessage(payload, fallback));
      }
      setDeleteOpen(false);
      toast({ title: t("roles.toasts.successTitle"), description: t("roles.toasts.deleted") });
      router.push("/roles/");
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.delete"), variant: "destructive" });
    } finally {
      deleteLock.current = false;
      setDeleteSubmitting(false);
    }
  };

  const title = editing ? currentRole?.name ?? t("roles.form.editTitle") : t("roles.form.newTitle");
  const showForm = editing ? currentRole !== null : access.create;

  return (
    <div data-testid={editing ? "role-details-page-root" : "roles-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <header className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{title}</h1>
              {currentRole ? (
                <span data-testid="role-persisted-status" className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentRole.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>
                  {t(currentRole.isActive ? "roles.status.active" : "roles.status.inactive")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("roles.form.subtitle")}</p>
          </div>
        </header>

        {detailLoading ? (
          <div role="status" className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <span className="ml-3 text-sm text-muted-foreground">{t("roles.loadingDetail")}</span>
          </div>
        ) : null}
        {!detailLoading && loadError ? (
          <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section>
        ) : null}
        {!detailLoading && !loadError && !editing && !access.create ? (
          <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("roles.errors.permissionDenied")}</section>
        ) : null}
        {!detailLoading && showForm ? (
          <form data-testid="role-form" onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="role-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
                <label data-testid="role-name-field" className="block sm:col-span-8 md:col-span-10">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("roles.form.name")}</span>
                  <Input id="role-name" required maxLength={ROLE_NAME_MAX_LENGTH} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || editing || !access.create} aria-describedby={editing ? "role-name-read-only" : undefined} />
                </label>
                <div data-testid="role-status-field" className="flex justify-end sm:col-span-4 md:col-span-2">
                  <div data-testid="role-status-control">
                    <HubSwitch id="role-is-active-switch" testId="role-is-active-switch" label={t("roles.table.status")} checked={formIsActive} onCheckedChange={setFormIsActive} disabled={submitting || deleteSubmitting || !canSave} className="items-end" />
                  </div>
                </div>
                <label data-testid="role-description-field" className="block w-full sm:col-span-12">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("roles.form.description")}</span>
                  <Textarea id="role-description" required maxLength={ROLE_DESCRIPTION_MAX_LENGTH} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting || deleteSubmitting || !canSave} className="h-20 min-h-[80px] resize-y px-4" />
                </label>
                {editing ? <p id="role-name-read-only" className="sr-only">{t("roles.form.nameReadOnly")}</p> : null}
              </div>
            </section>
            <div className="flex flex-wrap justify-start gap-3">
              <button type="button" onClick={() => router.push("/roles/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("roles.actions.back")}</button>
              {editing && currentRole && access.delete ? (
                <button type="button" onClick={() => setDeleteOpen(true)} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-6 py-2.5 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("roles.actions.delete")}</button>
              ) : null}
              {canSave ? (
                <button data-testid="role-save-button" type="submit" disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {t("roles.actions.save")}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
      <HubConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }}
        title={t("roles.actions.delete")}
        description={t("roles.confirm.delete", { name: currentRole?.name ?? "" })}
        confirmLabel={t("roles.actions.delete")}
        cancelLabel={t("roles.actions.cancel")}
        variant="destructive"
        loading={deleteSubmitting}
        onConfirm={deleteRole}
      />
    </div>
  );
}
