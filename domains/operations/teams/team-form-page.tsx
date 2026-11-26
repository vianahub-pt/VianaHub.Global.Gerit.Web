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
import { normalizeTeam, toTeamPayload, type TeamRecord } from "@/domains/operations/teams/teams-contract";

interface TeamFormPageProps { teamId?: string }

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const value = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const item of [value.message, value.error, value.title]) if (typeof item === "string" && item.trim()) return item;
  if (typeof value.errors === "object" && value.errors !== null) {
    const first = Object.values(value.errors as Record<string, unknown>).find((item) => Array.isArray(item) && item.length);
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return fallback;
}

export function TeamFormPage({ teamId }: TeamFormPageProps) {
  const editing = teamId !== undefined;
  const parsedId = editing ? Number(teamId) : null;
  const validId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0;
  const { fetchWithAuth, isAuthenticated, isHydrating, hasPermission, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const allowedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManage = ["admin", "backoffice", "manager"].some((role) => allowedRoles.includes(role));
  const canRead = canManage && hasPermission("Teams", "GetBy");
  const canCreate = canManage && hasPermission("Teams", "Create");
  const canUpdate = canManage && hasPermission("Teams", "Update");
  const canDelete = canManage && hasPermission("Teams", "Delete");
  const canSave = editing ? canUpdate : canCreate;
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const requestSequence = useRef(0);
  const submitLock = useRef(false);
  const deleteLock = useRef(false);

  const loadTeam = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!validId || parsedId === null) {
      setTeam(null);
      setLoadError(t("teams.errors.invalidId"));
      setLoading(false);
      return;
    }
    if (!canRead) {
      setTeam(null);
      setLoadError(t("teams.errors.permission"));
      setLoading(false);
      return;
    }
    setTeam(null);
    setName("");
    setDescription("");
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/teams/${parsedId}/`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.loadDetail")));
      const detail = normalizeTeam(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("teams.errors.loadDetail"));
      setTeam(detail);
      setName(detail.name);
      setDescription(detail.description ?? "");
      setFormIsActive(detail.isActive);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const message = error instanceof Error ? error.message : t("teams.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("teams.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [canRead, fetchWithAuth, parsedId, t, toast, validId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadTeam();
    return () => { requestSequence.current += 1; };
  }, [editing, isAuthenticated, isHydrating, loadTeam]);

  const currentTeam = editing && team?.id === parsedId ? team : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !canSave || (editing && !currentTeam)) return;
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    if (!normalizedName || normalizedName.length > 150 || !normalizedDescription || normalizedDescription.length > 500) {
      toast({ title: t("teams.toasts.validationTitle"), description: t("teams.validation.fields"), variant: "destructive" });
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetchWithAuth(editing && currentTeam ? `/api/gerit/v1/teams/${currentTeam.id}/` : "/api/gerit/v1/teams/", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toTeamPayload(normalizedName, normalizedDescription, formIsActive)),
      });
      if (!response) return;
      const payload = response.status === 204 ? null : await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.save")));
      toast({ title: t("teams.toasts.successTitle"), description: t(editing ? "teams.toasts.updated" : "teams.toasts.created") });
      router.push("/teams/");
    } catch (error) {
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.errors.save"), variant: "destructive" });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTeam || !canDelete || deleteLock.current || submitting) return;
    deleteLock.current = true;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/teams/${currentTeam.id}/`, { method: "DELETE" });
      if (!response) return;
      const payload = response.status === 204 ? null : await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.delete")));
      setDeleteOpen(false);
      toast({ title: t("teams.toasts.successTitle"), description: t("teams.toasts.deleted") });
      router.push("/teams/");
    } catch (error) {
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.errors.delete"), variant: "destructive" });
    } finally {
      deleteLock.current = false;
      setDeleteSubmitting(false);
    }
  };

  const pageTitle = editing ? currentTeam?.name ?? t("teams.form.editTitle") : t("teams.form.newTitle");
  const detailLoading = loading || (editing && (isHydrating || currentTeam === null && loadError === null));
  const formAccessAllowed = editing ? canRead : canCreate;

  return (
    <div data-testid={editing ? "team-details-page-root" : "teams-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{pageTitle}</h1>
              {currentTeam ? <span data-testid="team-persisted-status" className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentTeam.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentTeam.isActive ? "teams.status.active" : "teams.status.inactive")}</span> : null}
            </div>
            <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("teams.form.subtitle")}</p>
          </div>
        </div>

        {detailLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("teams.loadingDetail")}</span></div> : null}
        {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
        {!detailLoading && !loadError && !formAccessAllowed ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("teams.errors.permission")}</section> : null}
        {!detailLoading && !loadError && formAccessAllowed && (!editing || currentTeam) ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="team-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
                <label data-testid="team-name-field" className="block sm:col-span-8 md:col-span-10"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("teams.form.name")}</span><Input id="team-name" required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || !canSave} /></label>
                <div data-testid="team-status-field" className="sm:col-span-4 md:col-span-2"><HubSwitch id="team-is-active-switch" testId="team-is-active-switch" label={t("teams.table.status")} checked={formIsActive} onCheckedChange={setFormIsActive} disabled={submitting || deleteSubmitting || !canSave} /></div>
                <label data-testid="team-description-field" className="block w-full sm:col-span-12"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("teams.form.description")}</span><Textarea id="team-description" required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="min-h-24 resize-y" disabled={submitting || deleteSubmitting || !canSave} /></label>
              </div>
            </section>
            <div className="flex flex-wrap justify-start gap-3">
              <button type="button" onClick={() => router.push("/teams/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("teams.actions.back")}</button>
              {editing && currentTeam && canDelete ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-6 py-2.5 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("teams.actions.delete")}</button> : null}
              <button type="submit" disabled={submitting || deleteSubmitting || !canSave || (editing && currentTeam === null)} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("teams.actions.save")}</button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }}
        title={t("teams.actions.delete")}
        description={t("teams.confirm.delete", { name: currentTeam?.name ?? "" })}
        confirmLabel={t("teams.actions.delete")}
        cancelLabel={t("teams.actions.cancel")}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
