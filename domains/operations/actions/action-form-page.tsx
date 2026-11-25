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
  emptyActionCreateFormState,
  isActionForRoute,
  isLatestActionRequest,
  normalizeActionDetail,
  toActionCreatePayload,
  toActionUpdatePayload,
  toActionUpdateFormState,
  type ActionDetailResponse,
} from "@/domains/operations/actions/action-contract";

type ActionRecord = ActionDetailResponse;

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

interface ActionFormPageProps {
  actionId?: string;
}

export function ActionFormPage({ actionId }: ActionFormPageProps) {
  const editing = actionId !== undefined;
  const parsedActionId = editing ? Number(actionId) : null;
  const validActionId = parsedActionId !== null && Number.isInteger(parsedActionId) && parsedActionId > 0;
  const { fetchWithAuth, isAuthenticated, isHydrating, hasPermission, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [action, setAction] = useState<ActionRecord | null>(null);
  const [createFormState, setCreateFormState] = useState(emptyActionCreateFormState);
  const [description, setDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const requestSequence = useRef(0);
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManage = normalizedRoles.some((role) => ["admin", "backoffice"].includes(role));
  const canRead = ["admin", "backoffice", "manager", "operator"].some((role) => normalizedRoles.includes(role)) && hasPermission("Actions", "GetBy");
  const canCreate = canManage && hasPermission("Actions", "Create");
  const canUpdate = canManage && hasPermission("Actions", "Update");
  const canDelete = canManage && hasPermission("Actions", "Delete");
  const canSave = editing ? canUpdate : canCreate;

  const loadAction = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!canRead) {
      setAction(null);
      setLoadError(t("actions.errors.loadDetail"));
      setLoading(false);
      return;
    }
    if (!validActionId || parsedActionId === null) {
      setAction(null);
      setCreateFormState(emptyActionCreateFormState);
      setDescription("");
      setFormIsActive(true);
      setLoadError(t("actions.errors.invalidId"));
      setLoading(false);
      return;
    }
    setAction(null);
    setCreateFormState(emptyActionCreateFormState);
    setDescription("");
    setFormIsActive(true);
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/actions/${parsedActionId}`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!isLatestActionRequest(sequence, requestSequence.current)) return;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.loadDetail")));
      const detail = normalizeActionDetail(payload);
      if (!detail) throw new Error(t("actions.errors.loadDetail"));
      if (!isActionForRoute(detail, parsedActionId)) throw new Error(t("actions.errors.detailIdMismatch"));
      setAction(detail);
      setDescription(toActionUpdateFormState(detail).description);
      setFormIsActive(toActionUpdateFormState(detail).isActive);
    } catch (error) {
      if (!isLatestActionRequest(sequence, requestSequence.current)) return;
      setAction(null);
      const message = error instanceof Error ? error.message : t("actions.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("actions.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (isLatestActionRequest(sequence, requestSequence.current)) setLoading(false);
    }
  }, [canRead, fetchWithAuth, parsedActionId, t, toast, validActionId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadAction();
    return () => {
      requestSequence.current += 1;
    };
  }, [editing, isAuthenticated, isHydrating, loadAction]);

  const currentAction = editing && isActionForRoute(action, parsedActionId) ? action : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createFormState.name.trim();
    const normalizedDescription = description.trim();
    if (!canSave || (editing && !currentAction) || (!editing && (!name || name.length > 50)) || !normalizedDescription || normalizedDescription.length > 255) {
      toast({ title: t("actions.toasts.validationTitle"), description: t(editing ? "actions.validation.description" : "actions.validation.fields"), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithAuth(editing && currentAction ? `/api/gerit/v1/actions/${currentAction.id}` : "/api/gerit/v1/actions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? toActionUpdatePayload(normalizedDescription, formIsActive) : toActionCreatePayload(name, normalizedDescription, formIsActive)),
      });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.save")));
      toast({ title: t("actions.toasts.successTitle"), description: t(editing ? "actions.toasts.updated" : "actions.toasts.created") });
      if (!editing && typeof payload === "object" && payload !== null && typeof (payload as { id?: unknown }).id === "number") {
        router.push(`/actions/${(payload as { id: number }).id}/`);
      } else {
        router.push("/actions/");
      }
    } catch (error) {
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.errors.save"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentAction || !canDelete) return;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/actions/${currentAction.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.delete")));
      toast({ title: t("actions.toasts.successTitle"), description: t("actions.toasts.deleted") });
      setDeleteConfirmOpen(false);
      router.push("/actions/");
    } catch (error) {
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.errors.delete"), variant: "destructive" });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const pageTitle = editing ? currentAction?.name ?? t("actions.form.editTitle") : t("actions.form.newTitle");
  const detailLoading = loading || (editing && (isHydrating || currentAction === null && loadError === null));

  return (
    <div data-testid={editing ? "action-details-page-root" : "actions-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{pageTitle}</h1>
                {editing && currentAction ? <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentAction.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentAction.isActive ? "actions.status.active" : "actions.status.inactive")}</span> : null}
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("actions.form.subtitle")}</p>
            </div>
          </div>
        </div>

        {detailLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("actions.loadingDetail")}</span></div> : null}
        {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
        {!detailLoading && (!editing || currentAction) ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="action-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
                {editing && currentAction ? (
                  <div data-testid="action-name-field" className="block sm:col-span-8 md:col-span-10">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("actions.form.name")}</span>
                    <p data-testid="action-name-value" className="flex h-10 items-center rounded-sm border border-border bg-muted px-3 text-sm text-foreground">{currentAction.name}</p>
                  </div>
                ) : (
                  <label className="block sm:col-span-8 md:col-span-10"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("actions.form.name")}</span><Input required maxLength={50} value={createFormState.name} onChange={(event) => setCreateFormState((current) => ({ ...current, name: event.target.value }))} disabled={submitting || !canCreate} /></label>
                )}
                <div data-testid="action-status-field" className="sm:col-span-4 md:col-span-2">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("actions.table.status")}</span>
                  <div className="flex min-h-10 items-center gap-2">
                    <HubSwitch checked={formIsActive} onCheckedChange={setFormIsActive} disabled={submitting || deleteSubmitting || !canSave} aria-label={t("actions.table.status")} testId="action-is-active-switch" />
                    <span data-testid="action-is-active-label" className="text-sm text-foreground">{t(formIsActive ? "common.yes" : "common.no")}</span>
                  </div>
                </div>
                <label data-testid="action-description-field" className="block w-full sm:col-span-12"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("actions.form.description")}</span><Textarea required maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="min-h-24 resize-y" disabled={submitting || deleteSubmitting || !canSave} /></label>
              </div>
            </section>
            <div className="flex flex-wrap justify-start gap-3">
              <button type="button" onClick={() => router.push("/actions/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("actions.actions.back")}</button>
              {editing && currentAction && canDelete ? <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-6 py-2.5 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("actions.actions.delete")}</button> : null}
              <button type="submit" disabled={submitting || deleteSubmitting || !canSave || (editing && currentAction === null)} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("actions.actions.save")}</button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("actions.actions.delete")}
        description={t("actions.confirm.delete", { name: currentAction?.name ?? "" })}
        confirmLabel={t("actions.actions.delete")}
        cancelLabel={t("actions.actions.cancel")}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
