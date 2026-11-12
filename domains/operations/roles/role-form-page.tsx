"use client";

import clsx from "clsx";
import { ArrowLeft, Loader2, Power, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { Input } from "@/shared/ui/input";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { normalizeRole, toRoleCreatePayload, toRoleUpdatePayload, type RoleRecord } from "@/domains/operations/roles/roles-contract";

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
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [role, setRole] = useState<RoleRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const requestSequence = useRef(0);

  const loadRole = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!validId || parsedId === null) {
      setRole(null);
      setLoadError(t("roles.errors.invalidId"));
      setLoading(false);
      return;
    }
    setRole(null);
    setName("");
    setDescription("");
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/${parsedId}`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.loadDetail")));
      const detail = normalizeRole(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("roles.errors.loadDetail"));
      setRole(detail);
      setName(detail.name);
      setDescription(detail.description ?? "");
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const message = error instanceof Error ? error.message : t("roles.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("roles.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [fetchWithAuth, parsedId, t, toast, validId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadRole();
    return () => { requestSequence.current += 1; };
  }, [editing, isAuthenticated, isHydrating, loadRole]);

  const currentRole = editing && role?.id === parsedId ? role : null;
  const detailLoading = loading || (editing && (isHydrating || currentRole === null && loadError === null));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!editing && !normalizedName) {
      toast({ title: t("roles.toasts.validationTitle"), description: t("roles.validation.required"), variant: "destructive" });
      return;
    }
    if (editing && !currentRole) return;

    setSubmitting(true);
    try {
      const response = await fetchWithAuth(
        editing && currentRole ? `/api/gerit/v1/roles/${currentRole.id}` : "/api/gerit/v1/roles/",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? toRoleUpdatePayload(description) : toRoleCreatePayload(normalizedName, description)),
        },
      );
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.save")));
      toast({ title: t("roles.toasts.successTitle"), description: t(editing ? "roles.toasts.updated" : "roles.toasts.created") });
      if (!editing && typeof payload === "object" && payload !== null && typeof (payload as { id?: unknown }).id === "number") {
        router.push(`/roles/${(payload as { id: number }).id}/`);
      } else {
        router.push("/roles/");
      }
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.save"), variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async () => {
    if (!currentRole) return;
    const operation = currentRole.isActive ? "deactivate" : "activate";
    setStatusSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/${currentRole.id}/${operation}`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.status")));
      setRole((current) => current?.id === currentRole.id ? { ...current, isActive: !current.isActive } : current);
      toast({ title: t("roles.toasts.successTitle"), description: t(operation === "activate" ? "roles.toasts.activated" : "roles.toasts.deactivated") });
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.status"), variant: "destructive" });
    } finally { setStatusSubmitting(false); }
  };

  const deleteRole = async () => {
    if (!currentRole) return;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/${currentRole.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.delete")));
      setDeleteOpen(false);
      toast({ title: t("roles.toasts.successTitle"), description: t("roles.toasts.deleted") });
      router.push("/roles/");
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.delete"), variant: "destructive" });
    } finally { setDeleteSubmitting(false); }
  };

  const pageTitle = editing ? currentRole?.name ?? t("roles.form.editTitle") : t("roles.form.newTitle");

  return (
    <div data-testid={editing ? "role-details-page-root" : "roles-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => router.push("/roles/")} className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" title={t("roles.actions.back")} aria-label={t("roles.actions.back")}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
            <div>
              <nav aria-label={t("roles.breadcrumb.label")} className="mb-1"><ol className="flex items-center gap-1.5 text-xs text-muted-foreground"><li><button type="button" onClick={() => router.push("/roles/")} className="transition-colors hover:text-primary">{t("roles.title")}</button></li><li aria-hidden="true">/</li><li className="font-medium text-foreground" aria-current="page">{pageTitle}</li></ol></nav>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{pageTitle}</h1>
                {currentRole ? <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentRole.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentRole.isActive ? "roles.status.active" : "roles.status.inactive")}</span> : null}
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">{t("roles.form.subtitle")}</p>
            </div>
          </div>
          {currentRole ? <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button type="button" onClick={() => void toggleStatus()} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50">{statusSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}{t(currentRole.isActive ? "roles.actions.deactivate" : "roles.actions.activate")}</button>
            <button type="button" onClick={() => setDeleteOpen(true)} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("roles.actions.delete")}</button>
          </div> : null}
        </div>

        {detailLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" /><span className="ml-3 text-sm text-muted-foreground">{t("roles.loadingDetail")}</span></div> : null}
        {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
        {!detailLoading && (!editing || currentRole) ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="role-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-6">
                <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("roles.form.name")}</span><Input id="role-name" required value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || editing} aria-describedby={editing ? "role-name-read-only" : undefined} /></label>
                {editing ? <p id="role-name-read-only" className="-mt-4 text-xs text-muted-foreground">{t("roles.form.nameReadOnly")}</p> : null}
                <div className="block"><label htmlFor="role-description" className="mb-2 block text-xs font-semibold text-muted-foreground">{t("roles.form.description")}</label><textarea id="role-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="h-24 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring disabled:opacity-50" disabled={submitting || deleteSubmitting} /></div>
              </div>
            </section>
            <div className="flex justify-start gap-3">
              <button type="button" onClick={() => router.push("/roles/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("roles.actions.back")}</button>
              <button type="submit" disabled={submitting || deleteSubmitting || editing && currentRole === null} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{t("roles.actions.save")}</button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }}
        title={t("roles.actions.delete")} description={t("roles.confirm.delete", { name: currentRole?.name ?? "" })}
        confirmLabel={t("roles.actions.delete")} cancelLabel={t("roles.actions.cancel")} onConfirm={() => void deleteRole()} />
    </div>
  );
}
