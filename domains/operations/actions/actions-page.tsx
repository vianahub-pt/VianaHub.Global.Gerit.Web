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

interface ActionItem {
  id: number;
  name: string;
  isActive: boolean;
}

interface PagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

type StatusFilter = "active" | "inactive" | "all";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function normalizeAction(payload: unknown): ActionItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const id = typeof candidate.id === "number" ? candidate.id : null;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  if (id === null || !name) return null;
  return { id, name, isActive: typeof candidate.isActive === "boolean" ? candidate.isActive : true };
}

function parseActions(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return { items: [] as ActionItem[], totalItems: 0 };
  const candidate = payload as PagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : Array.isArray(candidate.data) ? candidate.data : [];
  const items = rawItems.map(normalizeAction).filter((item): item is ActionItem => item !== null);
  return { items, totalItems: typeof candidate.totalItems === "number" ? candidate.totalItems : items.length };
}

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

export function ActionsPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteActionRef = useRef<ActionItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  const columns = useMemo<HubGridColumn<ActionItem>[]>(() => [
    { key: "Name", label: t("actions.table.name"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("actions.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("actions.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("actions.grid.density.expanded") },
  ], [t]);

  const loadActions = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({
      Search: search.trim(), PageNumber: String(page), PageSize: String(pageSize),
      SortBy: "Name", SortDirection: sortDirection,
    });
    if (statusFilter !== "all") query.set("IsActive", String(statusFilter === "active"));
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/actions/paged?${query.toString()}`, { method: "GET" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.load")));
      const parsed = parseActions(payload);
      const candidate = payload as PagedResponse;
      const size = typeof candidate.pageSize === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(candidate.pageSize)
        ? candidate.pageSize as PageSizeOption : pageSize;
      const count = typeof candidate.totalItems === "number" ? candidate.totalItems : parsed.totalItems;
      setActions(parsed.items);
      setTotalItems(count);
      setTotalPages(typeof candidate.totalPages === "number" ? Math.max(1, candidate.totalPages) : Math.max(1, Math.ceil(count / size)));
      if (typeof candidate.pageNumber === "number") setPage(candidate.pageNumber);
      setPageSize(size);
    } catch (error) {
      setActions([]);
      setTotalItems(0);
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.errors.load"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, page, pageSize, search, sortDirection, statusFilter, t, toast]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) void loadActions();
  }, [isAuthenticated, isHydrating, loadActions]);

  const toggleStatus = useCallback(async (action: ActionItem) => {
    const operation = action.isActive ? "deactivate" : "activate";
    setActionBusyId(action.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/actions/${action.id}/${operation}`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.status")));
      toast({ title: t("actions.toasts.successTitle"), description: t(operation === "activate" ? "actions.toasts.activated" : "actions.toasts.deactivated") });
      await loadActions();
    } catch (error) {
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.errors.status"), variant: "destructive" });
    } finally {
      setActionBusyId(null);
    }
  }, [fetchWithAuth, loadActions, t, toast]);

  const requestDelete = useCallback((action: ActionItem) => {
    deleteActionRef.current = action;
    setDeleteConfirmOpen(true);
  }, []);

  const deleteAction = useCallback(async () => {
    const action = deleteActionRef.current;
    if (!action) return;
    setDeleteSubmitting(true);
    setActionBusyId(action.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/actions/${action.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.errors.delete")));
      toast({ title: t("actions.toasts.successTitle"), description: t("actions.toasts.deleted") });
      setDeleteConfirmOpen(false);
      deleteActionRef.current = null;
      await loadActions();
    } catch (error) {
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.errors.delete"), variant: "destructive" });
    } finally {
      setActionBusyId(null);
      setDeleteSubmitting(false);
    }
  }, [fetchWithAuth, loadActions, t, toast]);

  const bulkUpload = useCallback(async (file: File | null) => {
    if (!file || bulkUploading) return;
    setBulkUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/actions/bulk-upload", { method: "POST", body });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("actions.bulk.upload.error", { resource: t("actions.title") })));
      toast({ title: t("actions.toasts.successTitle"), description: t("actions.bulk.upload.success", { resource: t("actions.title") }) });
      await loadActions();
    } catch (error) {
      toast({ title: t("actions.toasts.errorTitle"), description: error instanceof Error ? error.message : t("actions.bulk.upload.error", { resource: t("actions.title") }), variant: "destructive" });
    } finally {
      setBulkUploading(false);
    }
  }, [bulkUploading, fetchWithAuth, loadActions, t, toast]);

  const renderStatus = useCallback((action: ActionItem) => (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", action.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {action.isActive ? t("actions.status.active") : t("actions.status.inactive")}
    </span>
  ), [t]);

  const renderActions = useCallback((action: ActionItem) => (
    <div className="flex items-center justify-end gap-2">
      <button type="button" disabled={actionBusyId === action.id} onClick={(event) => { event.stopPropagation(); router.push(`/actions/${action.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("actions.actions.edit")} aria-label={t("actions.actions.edit")}><SquarePen className="h-4 w-4" /></button>
      <button type="button" disabled={actionBusyId === action.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(action); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(action.isActive ? "actions.actions.deactivate" : "actions.actions.activate")} aria-label={t(action.isActive ? "actions.actions.deactivate" : "actions.actions.activate")}>{actionBusyId === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : action.isActive ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}</button>
      <button type="button" disabled={actionBusyId === action.id} onClick={(event) => { event.stopPropagation(); requestDelete(action); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("actions.actions.delete")} aria-label={t("actions.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" /></button>
    </div>
  ), [actionBusyId, requestDelete, router, t, toggleStatus]);

  const gridToolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}{t("actions.bulk.upload.label")}
        <input type="file" accept=".csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void bulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </label>
      <button type="button" onClick={() => router.push("/actions/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("actions.actions.add")}</button>
    </div>
  ), [bulkUpload, bulkUploading, router, t]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);

  return (
    <div data-testid="actions-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
            <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">{t("actions.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("actions.subtitle")}</p></div>
            {gridToolbar}
          </div>
        </div>
        <HubGrid
          title={t("actions.title")} subtitle={t("actions.subtitle")} columns={columns} items={actions}
          renderRowCells={(action) => [action.name]} renderStatus={renderStatus}
          statusColumnLabel={t("actions.table.status")} renderActions={renderActions}
          actionsColumnLabel={t("actions.table.actions")} rowDensity={rowDensity} densityOptions={densityOptions}
          onDensityChange={setRowDensity} sortBy="Name" sortDirection={sortDirection}
          onSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          statusFilter={statusFilter} statusFilterOptions={[{ value: "active", label: t("actions.filters.active") }, { value: "inactive", label: t("actions.filters.inactive") }, { value: "all", label: t("actions.filters.all") }]}
          onStatusFilterChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }} statusFilterLabel={t("actions.filters.statusLabel")}
          searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("actions.filters.search")}
          loading={loading} loadingText={t("actions.loading")} emptyText={t("actions.empty")}
          pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
          onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]} onPageSizeChange={(value) => { if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) { setPageSize(value as PageSizeOption); setPage(1); } }}
          paginationPreviousLabel={t("actions.pagination.previous")} paginationNextLabel={t("actions.pagination.next")} paginationPageLabel={t("actions.pagination.page")} paginationPerPageLabel={t("actions.pagination.perPage")}
          getRowKey={(action) => action.id} onRowClick={(action) => router.push(`/actions/${action.id}/`)}
        />
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("actions.actions.delete")}
        description={t("actions.confirm.delete", { name: deleteActionRef.current?.name ?? "" })}
        confirmLabel={t("actions.actions.delete")}
        cancelLabel={t("actions.actions.cancel")}
        onConfirm={() => void deleteAction()}
      />
    </div>
  );
}
