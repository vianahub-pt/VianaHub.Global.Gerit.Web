"use client";

import clsx from "clsx";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { HubSwitch } from "@/shared/ui/hub-switch";
import {
  emptyResourceCreateFormState,
  isResourceForRoute,
  isLatestResourceRequest,
  normalizeResourceDetail,
  toResourceCreatePayload,
  toResourceUpdatePayload,
  toResourceUpdateFormState,
  type ResourceDetailResponse,
} from "@/domains/operations/resources/resource-contract";

type ResourceRecord = ResourceDetailResponse;

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    const first = Object.values(candidate.errors as Record<string, unknown>).find((value) => Array.isArray(value) && value.length > 0);
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return fallback;
}

interface ResourceFormPageProps {
  resourceId?: string;
}

export function ResourceFormPage({ resourceId }: ResourceFormPageProps) {
  const editing = resourceId !== undefined;
  const parsedResourceId = editing ? Number(resourceId) : null;
  const validResourceId = parsedResourceId !== null && Number.isInteger(parsedResourceId) && parsedResourceId > 0;
  const { fetchWithAuth, isAuthenticated, isHydrating, hasPermission, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [resource, setResource] = useState<ResourceRecord | null>(null);
  const [createFormState, setCreateFormState] = useState(emptyResourceCreateFormState);
  const [description, setDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const requestSequence = useRef(0);
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManage = normalizedRoles.some((role) => ["admin", "backoffice", "manager"].includes(role));
  const canRead = ["admin", "backoffice", "manager"].some((role) => normalizedRoles.includes(role)) && hasPermission("Resources", "GetBy");
  const canCreate = canManage && hasPermission("Resources", "Create");
  const canUpdate = canManage && hasPermission("Resources", "Update");
  const canDelete = canManage && hasPermission("Resources", "Delete");
  const canSave = editing ? canUpdate : canCreate;

  const loadResource = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!canRead) {
      setResource(null);
      setLoadError(t("resources.errors.loadDetail"));
      setLoading(false);
      return;
    }
    if (!validResourceId || parsedResourceId === null) {
      setResource(null);
      setCreateFormState(emptyResourceCreateFormState);
      setDescription("");
      setFormIsActive(true);
      setLoadError(t("resources.errors.invalidId"));
      setLoading(false);
      return;
    }
    setResource(null);
    setCreateFormState(emptyResourceCreateFormState);
    setDescription("");
    setFormIsActive(true);
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/resources/${parsedResourceId}`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!isLatestResourceRequest(sequence, requestSequence.current)) return;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.loadDetail")));
      const detail = normalizeResourceDetail(payload);
      if (!detail) throw new Error(t("resources.errors.loadDetail"));
      if (!isResourceForRoute(detail, parsedResourceId)) throw new Error(t("resources.errors.detailIdMismatch"));
      setResource(detail);
      setDescription(toResourceUpdateFormState(detail).description);
      setFormIsActive(toResourceUpdateFormState(detail).isActive);
    } catch (error) {
      if (!isLatestResourceRequest(sequence, requestSequence.current)) return;
      setResource(null);
      const message = error instanceof Error ? error.message : t("resources.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("resources.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (isLatestResourceRequest(sequence, requestSequence.current)) setLoading(false);
    }
  }, [canRead, fetchWithAuth, parsedResourceId, t, toast, validResourceId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadResource();
    return () => {
      requestSequence.current += 1;
    };
  }, [editing, isAuthenticated, isHydrating, loadResource]);

  const currentResource = editing && isResourceForRoute(resource, parsedResourceId) ? resource : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createFormState.name.trim();
    const normalizedDescription = description.trim();
    if (!canSave || (editing && !currentResource) || (!editing && (!name || name.length > 100)) || !normalizedDescription || normalizedDescription.length > 255) {
      toast({ title: t("resources.toasts.validationTitle"), description: t(editing ? "resources.validation.description" : "resources.validation.fields"), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithAuth(editing && currentResource ? `/api/gerit/v1/resources/${currentResource.id}` : "/api/gerit/v1/resources", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? toResourceUpdatePayload(normalizedDescription, formIsActive) : toResourceCreatePayload(name, normalizedDescription, formIsActive)),
      });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.save")));
      toast({ title: t("resources.toasts.successTitle"), description: t(editing ? "resources.toasts.updated" : "resources.toasts.created") });
      router.push("/resources/");
    } catch (error) {
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.errors.save"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentResource || !canDelete) return;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/resources/${currentResource.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.delete")));
      toast({ title: t("resources.toasts.successTitle"), description: t("resources.toasts.deleted") });
      setDeleteConfirmOpen(false);
      router.push("/resources/");
    } catch (error) {
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.errors.delete"), variant: "destructive" });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const pageTitle = editing ? currentResource?.name ?? t("resources.form.editTitle") : t("resources.form.newTitle");
  const detailLoading = loading || (editing && (isHydrating || currentResource === null && loadError === null));

  return (
    <div data-testid={editing ? "resource-details-page-root" : "resources-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{pageTitle}</h1>
                {editing && currentResource ? <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentResource.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentResource.isActive ? "resources.status.active" : "resources.status.inactive")}</span> : null}
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("resources.form.subtitle")}</p>
            </div>
          </div>
        </div>

        {detailLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("resources.loadingDetail")}</span></div> : null}
        {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
        {!detailLoading && (!editing || currentResource) ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="resource-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
                {editing && currentResource ? (
                  <div data-testid="resource-name-field" className="block sm:col-span-8 md:col-span-10">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("resources.form.name")}</span>
                    <p data-testid="resource-name-value" className="flex h-10 items-center rounded-sm border border-border bg-muted px-3 text-sm text-foreground">{currentResource.name}</p>
                  </div>
                ) : (
                  <label data-testid="resource-name-field" className="block sm:col-span-8 md:col-span-10"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("resources.form.name")}</span><Input required maxLength={100} value={createFormState.name} onChange={(event) => setCreateFormState((current) => ({ ...current, name: event.target.value }))} disabled={submitting || !canCreate} /></label>
                )}
                <div data-testid="resource-status-field" className="sm:col-span-4 md:col-span-2">
                  <HubSwitch label={t("resources.table.status")} checked={formIsActive} onCheckedChange={setFormIsActive} disabled={submitting || deleteSubmitting || !canSave} testId="resource-is-active-switch" />
                </div>
                <label data-testid="resource-description-field" className="block w-full sm:col-span-12"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("resources.form.description")}</span><Textarea data-testid="resource-description-input" required maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="min-h-24 resize-y" disabled={submitting || deleteSubmitting || !canSave} /></label>
              </div>
            </section>
            <div className="flex flex-wrap justify-start gap-3">
              <button type="button" onClick={() => router.push("/resources/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("resources.actions.back")}</button>
              {editing && currentResource && canDelete ? <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-6 py-2.5 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("resources.actions.delete")}</button> : null}
              <button type="submit" disabled={submitting || deleteSubmitting || !canSave || (editing && currentResource === null)} data-testid="resource-save-button" className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("resources.actions.save")}</button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("resources.actions.delete")}
        description={t("resources.confirm.delete", { name: currentResource?.name ?? "" })}
        confirmLabel={t("resources.actions.delete")}
        cancelLabel={t("resources.actions.cancel")}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
