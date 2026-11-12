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
import { buildRolesQuery, normalizeRoleSummary, type RoleRecord, type RoleStatusFilter } from "@/domains/operations/roles/roles-contract";

interface RolesPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

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

function parsePagedRoles(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return { items: [] as RoleRecord[], totalItems: 0 };
  const candidate = payload as RolesPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : Array.isArray(candidate.data) ? candidate.data : [];
  const items = rawItems.map(normalizeRoleSummary).filter((item): item is RoleRecord => item !== null);
  return { items, totalItems: typeof candidate.totalItems === "number" ? candidate.totalItems : items.length };
}

export function RolesPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoleStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [busyRoleId, setBusyRoleId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deleteRoleRef = useRef<RoleRecord | null>(null);

  const columns = useMemo<HubGridColumn<RoleRecord>[]>(() => [
    { key: "Name", label: t("roles.table.name"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("roles.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("roles.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("roles.grid.density.expanded") },
  ], [t]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    const query = buildRolesQuery({ search, page, pageSize, sortDirection, status: statusFilter });
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/paged?${query.toString()}`, { method: "GET" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.load")));
      const parsed = parsePagedRoles(payload);
      const candidate = payload as RolesPagedResponse;
      const serverSize = typeof candidate.pageSize === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(candidate.pageSize)
        ? candidate.pageSize as PageSizeOption : pageSize;
      const count = typeof candidate.totalItems === "number" ? candidate.totalItems : parsed.totalItems;
      setRoles(parsed.items);
      setTotalItems(count);
      setTotalPages(typeof candidate.totalPages === "number" ? Math.max(1, candidate.totalPages) : Math.max(1, Math.ceil(count / serverSize)));
      if (typeof candidate.pageNumber === "number") setPage(candidate.pageNumber);
      setPageSize(serverSize);
    } catch (error) {
      setRoles([]);
      setTotalItems(0);
      setTotalPages(1);
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.load"), variant: "destructive" });
    } finally { setLoading(false); }
  }, [fetchWithAuth, page, pageSize, search, sortDirection, statusFilter, t, toast]);

  useEffect(() => { if (!isHydrating && isAuthenticated) void loadRoles(); }, [isAuthenticated, isHydrating, loadRoles]);

  const toggleStatus = useCallback(async (role: RoleRecord) => {
    const operation = role.isActive ? "deactivate" : "activate";
    setBusyRoleId(role.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/${role.id}/${operation}`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.status")));
      toast({ title: t("roles.toasts.successTitle"), description: t(operation === "activate" ? "roles.toasts.activated" : "roles.toasts.deactivated") });
      await loadRoles();
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.status"), variant: "destructive" });
    } finally { setBusyRoleId(null); }
  }, [fetchWithAuth, loadRoles, t, toast]);

  const requestDelete = useCallback((role: RoleRecord) => {
    deleteRoleRef.current = role;
    setDeleteOpen(true);
  }, []);

  const deleteRole = useCallback(async () => {
    const role = deleteRoleRef.current;
    if (!role) return;
    setDeleteSubmitting(true);
    setBusyRoleId(role.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/roles/${role.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.errors.delete")));
      setDeleteOpen(false);
      deleteRoleRef.current = null;
      toast({ title: t("roles.toasts.successTitle"), description: t("roles.toasts.deleted") });
      await loadRoles();
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.errors.delete"), variant: "destructive" });
    } finally {
      setBusyRoleId(null);
      setDeleteSubmitting(false);
    }
  }, [fetchWithAuth, loadRoles, t, toast]);

  const bulkUpload = useCallback(async (file: File | null) => {
    if (!file || bulkUploading) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: t("roles.toasts.validationTitle"), description: t("roles.bulk.upload.csvOnly"), variant: "destructive" });
      return;
    }
    setBulkUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/roles/bulk-upload", { method: "POST", body });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("roles.bulk.upload.error", { resource: t("roles.title") })));
      toast({ title: t("roles.toasts.successTitle"), description: t("roles.bulk.upload.success", { resource: t("roles.title") }) });
      await loadRoles();
    } catch (error) {
      toast({ title: t("roles.toasts.errorTitle"), description: error instanceof Error ? error.message : t("roles.bulk.upload.error", { resource: t("roles.title") }), variant: "destructive" });
    } finally { setBulkUploading(false); }
  }, [bulkUploading, fetchWithAuth, loadRoles, t, toast]);

  const renderStatus = useCallback((role: RoleRecord) => (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", role.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {role.isActive ? t("roles.status.active") : t("roles.status.inactive")}
    </span>
  ), [t]);

  const renderActions = useCallback((role: RoleRecord) => (
    <div className="flex items-center justify-end gap-2">
      <button type="button" disabled={busyRoleId === role.id} onClick={(event) => { event.stopPropagation(); router.push(`/roles/${role.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("roles.actions.edit")} aria-label={t("roles.actions.edit")}><SquarePen className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" disabled={busyRoleId === role.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(role); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(role.isActive ? "roles.actions.deactivate" : "roles.actions.activate")} aria-label={t(role.isActive ? "roles.actions.deactivate" : "roles.actions.activate")}>{busyRoleId === role.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : role.isActive ? <PowerOff className="h-4 w-4 text-red-500" aria-hidden="true" /> : <Power className="h-4 w-4 text-green-500" aria-hidden="true" />}</button>
      <button type="button" disabled={busyRoleId === role.id} onClick={(event) => { event.stopPropagation(); requestDelete(role); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("roles.actions.delete")} aria-label={t("roles.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" /></button>
    </div>
  ), [busyRoleId, requestDelete, router, t, toggleStatus]);

  const gridToolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary dark:text-muted-foreground">
        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> : null}
        {t("roles.bulk.upload.label")}
        <input type="file" accept=".csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void bulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </label>
      <button type="button" onClick={() => router.push("/roles/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("roles.actions.add")}</button>
    </div>
  ), [bulkUpload, bulkUploading, router, t]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);

  return (
    <div data-testid="roles-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
            <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground">{t("roles.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">{t("roles.subtitle")}</p></div>
            {gridToolbar}
          </div>
        </div>
        <HubGrid
          title={t("roles.title")} subtitle={t("roles.subtitle")} columns={columns} items={roles}
          renderRowCells={(role) => [role.name]} renderStatus={renderStatus} statusColumnLabel={t("roles.table.status")}
          renderActions={renderActions} actionsColumnLabel={t("roles.table.actions")} rowDensity={rowDensity}
          densityOptions={densityOptions} onDensityChange={setRowDensity} sortBy="Name" sortDirection={sortDirection}
          onSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          statusFilter={statusFilter}
          statusFilterOptions={[{ value: "active", label: t("roles.filters.active") }, { value: "inactive", label: t("roles.filters.inactive") }, { value: "all", label: t("roles.filters.all") }]}
          onStatusFilterChange={(value) => { setStatusFilter(value as RoleStatusFilter); setPage(1); }} statusFilterLabel={t("roles.filters.statusLabel")}
          searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("roles.filters.search")}
          loading={loading} loadingText={t("roles.loading")} emptyText={t("roles.empty")}
          pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
          onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
          onPageSizeChange={(value) => { if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) { setPageSize(value as PageSizeOption); setPage(1); } }}
          paginationPreviousLabel={t("roles.pagination.previous")} paginationNextLabel={t("roles.pagination.next")}
          paginationPageLabel={t("roles.pagination.page")} paginationPerPageLabel={t("roles.pagination.perPage")}
          getRowKey={(role) => role.id} onRowClick={(role) => router.push(`/roles/${role.id}/`)}
        />
      </div>
      <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }}
        title={t("roles.actions.delete")} description={t("roles.confirm.delete", { name: deleteRoleRef.current?.name ?? "" })}
        confirmLabel={t("roles.actions.delete")} cancelLabel={t("roles.actions.cancel")} onConfirm={() => void deleteRole()} />
    </div>
  );
}
