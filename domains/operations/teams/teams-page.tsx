"use client";

import clsx from "clsx";
import { Loader2, Power, PowerOff, SquarePen, Trash2, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { buildTeamsQuery, normalizeTeamSummary, type TeamRecord, type TeamStatusFilter } from "@/domains/operations/teams/teams-contract";

interface TeamsPagedResponse { items?: unknown; data?: unknown; totalItems?: unknown; pageNumber?: number; pageSize?: number; totalPages?: number }
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

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

function parseTeams(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return { items: [] as TeamRecord[], totalItems: 0 };
  const candidate = payload as TeamsPagedResponse;
  const raw = Array.isArray(candidate.items) ? candidate.items : Array.isArray(candidate.data) ? candidate.data : [];
  const items = raw.map(normalizeTeamSummary).filter((item): item is TeamRecord => item !== null);
  return { items, totalItems: typeof candidate.totalItems === "number" ? candidate.totalItems : items.length };
}

export function TeamsPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TeamStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteTeamRef = useRef<TeamRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [teamBusyId, setTeamBusyId] = useState<number | null>(null);

  const columns = useMemo<HubGridColumn<TeamRecord>[]>(() => [
    { key: "Name", label: t("teams.table.name"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("teams.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("teams.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("teams.grid.density.expanded") },
  ], [t]);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    const query = buildTeamsQuery({ search, page, pageSize, sortBy: "Name", sortDirection, status: statusFilter });
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/teams/paged/?${query.toString()}`, { method: "GET" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.load")));
      const parsed = parseTeams(payload);
      const candidate = payload as TeamsPagedResponse;
      const size = typeof candidate.pageSize === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(candidate.pageSize)
        ? candidate.pageSize as PageSizeOption : pageSize;
      const count = typeof candidate.totalItems === "number" ? candidate.totalItems : parsed.totalItems;
      setTeams(parsed.items);
      setTotalItems(count);
      setTotalPages(typeof candidate.totalPages === "number" ? Math.max(1, candidate.totalPages) : Math.max(1, Math.ceil(count / size)));
      if (typeof candidate.pageNumber === "number") setPage(candidate.pageNumber);
      setPageSize(size);
    } catch (error) {
      setTeams([]);
      setTotalItems(0);
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.errors.load"), variant: "destructive" });
    } finally { setLoading(false); }
  }, [fetchWithAuth, page, pageSize, search, sortDirection, statusFilter, t, toast]);

  useEffect(() => { if (!isHydrating && isAuthenticated) void loadTeams(); }, [isAuthenticated, isHydrating, loadTeams]);

  const toggleStatus = useCallback(async (team: TeamRecord) => {
    const operation = team.isActive ? "deactivate" : "activate";
    setTeamBusyId(team.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/teams/${team.id}/${operation}/`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.status")));
      toast({ title: t("teams.toasts.successTitle"), description: t(operation === "activate" ? "teams.toasts.activated" : "teams.toasts.deactivated") });
      await loadTeams();
    } catch (error) {
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.errors.status"), variant: "destructive" });
    } finally { setTeamBusyId(null); }
  }, [fetchWithAuth, loadTeams, t, toast]);

  const requestDelete = useCallback((team: TeamRecord) => {
    deleteTeamRef.current = team;
    setDeleteConfirmOpen(true);
  }, []);

  const deleteTeam = useCallback(async () => {
    const team = deleteTeamRef.current;
    if (!team) return;
    setDeleteSubmitting(true);
    setTeamBusyId(team.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/teams/${team.id}/`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.errors.delete")));
      toast({ title: t("teams.toasts.successTitle"), description: t("teams.toasts.deleted") });
      setDeleteConfirmOpen(false);
      deleteTeamRef.current = null;
      await loadTeams();
    } catch (error) {
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.errors.delete"), variant: "destructive" });
    } finally {
      setTeamBusyId(null);
      setDeleteSubmitting(false);
    }
  }, [fetchWithAuth, loadTeams, t, toast]);

  const bulkUpload = useCallback(async (file: File | null) => {
    if (!file || bulkUploading) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: t("teams.toasts.validationTitle"), description: t("teams.bulk.upload.csvOnly"), variant: "destructive" });
      return;
    }
    setBulkUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/teams/bulk-upload/", { method: "POST", body });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("teams.bulk.upload.error", { resource: t("teams.title") })));
      toast({ title: t("teams.toasts.successTitle"), description: t("teams.bulk.upload.success", { resource: t("teams.title") }) });
      await loadTeams();
    } catch (error) {
      toast({ title: t("teams.toasts.errorTitle"), description: error instanceof Error ? error.message : t("teams.bulk.upload.error", { resource: t("teams.title") }), variant: "destructive" });
    } finally { setBulkUploading(false); }
  }, [bulkUploading, fetchWithAuth, loadTeams, t, toast]);

  const renderStatus = useCallback((team: TeamRecord) => (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", team.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {team.isActive ? t("teams.status.active") : t("teams.status.inactive")}
    </span>
  ), [t]);

  const renderActions = useCallback((team: TeamRecord) => (
    <div className="flex items-center justify-end gap-2">
      <button type="button" disabled={teamBusyId === team.id} onClick={(event) => { event.stopPropagation(); router.push(`/teams/${team.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("teams.actions.edit")} aria-label={t("teams.actions.edit")}><SquarePen className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" disabled={teamBusyId === team.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(team); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(team.isActive ? "teams.actions.deactivate" : "teams.actions.activate")} aria-label={t(team.isActive ? "teams.actions.deactivate" : "teams.actions.activate")}>{teamBusyId === team.id ? <Loader2 className="h-4 w-4 animate-spin" /> : team.isActive ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}</button>
      <button type="button" disabled={teamBusyId === team.id} onClick={(event) => { event.stopPropagation(); requestDelete(team); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("teams.actions.delete")} aria-label={t("teams.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" /></button>
    </div>
  ), [requestDelete, router, t, teamBusyId, toggleStatus]);

  const gridToolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}{t("teams.bulk.upload.label")}
        <input type="file" accept=".csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void bulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </label>
      <button type="button" onClick={() => router.push("/teams/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("teams.actions.add")}</button>
    </div>
  ), [bulkUpload, bulkUploading, router, t]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);

  return (
    <div data-testid="teams-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
            <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">{t("teams.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("teams.subtitle")}</p></div>
            {gridToolbar}
          </div>
        </div>
        <HubGrid
          title={t("teams.title")} subtitle={t("teams.subtitle")} columns={columns} items={teams}
          renderRowCells={(team) => [team.name]} renderStatus={renderStatus}
          statusColumnLabel={t("teams.table.status")} renderActions={renderActions}
          actionsColumnLabel={t("teams.table.actions")} rowDensity={rowDensity} densityOptions={densityOptions}
          onDensityChange={setRowDensity} sortBy="Name" sortDirection={sortDirection}
          onSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          statusFilter={statusFilter} statusFilterOptions={[{ value: "active", label: t("teams.filters.active") }, { value: "inactive", label: t("teams.filters.inactive") }, { value: "all", label: t("teams.filters.all") }]}
          onStatusFilterChange={(value) => { setStatusFilter(value as TeamStatusFilter); setPage(1); }} statusFilterLabel={t("teams.filters.statusLabel")}
          searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("teams.filters.search")}
          loading={loading} loadingText={t("teams.loading")} emptyText={t("teams.empty")}
          pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
          onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]} onPageSizeChange={(value) => { if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) { setPageSize(value as PageSizeOption); setPage(1); } }}
          paginationPreviousLabel={t("teams.pagination.previous")} paginationNextLabel={t("teams.pagination.next")} paginationPageLabel={t("teams.pagination.page")} paginationPerPageLabel={t("teams.pagination.perPage")}
          getRowKey={(team) => team.id} onRowClick={(team) => router.push(`/teams/${team.id}/`)}
        />
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("teams.actions.delete")}
        description={t("teams.confirm.delete", { name: deleteTeamRef.current?.name ?? "" })}
        confirmLabel={t("teams.actions.delete")}
        cancelLabel={t("teams.actions.cancel")}
        onConfirm={() => void deleteTeam()}
      />
    </div>
  );
}
