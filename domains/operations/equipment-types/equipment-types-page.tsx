"use client";

import clsx from "clsx";
import { Loader2, Power, PowerOff, SquarePen, Trash2, Wrench, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  buildEquipmentTypesQuery,
  normalizeEquipmentTypePage,
  type EquipmentTypeRecord,
  type EquipmentTypeSortField,
  type EquipmentTypeStatusFilter,
} from "@/domains/operations/equipment-types/equipment-types-contract";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const MANAGER_ROLES = ["admin", "backoffice", "manager"];

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    for (const messages of Object.values(candidate.errors as Record<string, unknown>)) {
      if (Array.isArray(messages) && typeof messages[0] === "string") return messages[0];
    }
  }
  return fallback;
}

export function EquipmentTypesPage() {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManage = normalizedRoles.some((role) => MANAGER_ROLES.includes(role));
  const canCreate = canManage && hasPermission("EquipmentTypes", "Create");
  const canUpdate = canManage && hasPermission("EquipmentTypes", "Update");
  const canActivate = canManage && hasPermission("EquipmentTypes", "Activate");
  const canDeactivate = canManage && hasPermission("EquipmentTypes", "Deactivate");
  const canDelete = canManage && hasPermission("EquipmentTypes", "Delete");
  const canBulkUpload = canManage && hasPermission("EquipmentTypes", "BulkUpload");
  const [items, setItems] = useState<EquipmentTypeRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentTypeStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [sortBy, setSortBy] = useState<EquipmentTypeSortField>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deleteTarget = useRef<EquipmentTypeRecord | null>(null);

  const columns = useMemo<HubGridColumn<EquipmentTypeRecord>[]>(() => [
    { key: "Name", label: t("equipmentTypes.table.name"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("equipmentTypes.grid.density.compact") },
    { key: "medium" as RowDensity, label: t("equipmentTypes.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("equipmentTypes.grid.density.expanded") },
  ], [t]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildEquipmentTypesQuery({ search, status: statusFilter, page, pageSize, sortBy, sortDirection });
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/paged/?${query.toString()}`, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("equipmentTypes.errors.load")));
      const result = normalizeEquipmentTypePage(payload);
      if (!result) throw new Error(t("equipmentTypes.errors.load"));
      setItems(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, result.totalPages));
      if (result.pageNumber !== page) setPage(result.pageNumber);
      if (PAGE_SIZE_OPTIONS.includes(result.pageSize as PageSize)) setPageSize(result.pageSize as PageSize);
    } catch (error) {
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.load"), variant: "destructive" });
    } finally { setLoading(false); }
  }, [fetchWithAuth, page, pageSize, search, sortBy, sortDirection, statusFilter, t, toast]);

  useEffect(() => { if (!isHydrating && isAuthenticated) void loadItems(); }, [isAuthenticated, isHydrating, loadItems]);

  const toggleStatus = useCallback(async (item: EquipmentTypeRecord) => {
    const operation = item.isActive ? "deactivate" : "activate";
    if (item.isActive ? !canDeactivate : !canActivate) return;
    setBusyId(item.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${item.id}/${operation}/`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("equipmentTypes.errors.status")));
      toast({ title: t("equipmentTypes.toasts.successTitle"), description: t(`equipmentTypes.toasts.${operation === "activate" ? "activated" : "deactivated"}`) });
      await loadItems();
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.status"), variant: "destructive" });
    } finally { setBusyId(null); }
  }, [canActivate, canDeactivate, fetchWithAuth, loadItems, t, toast]);

  const removeItem = useCallback(async () => {
    const item = deleteTarget.current;
    if (!item || !canDelete) return;
    setBusyId(item.id);
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/equipment-types/${item.id}/`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("equipmentTypes.errors.delete")));
      toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.deleted") });
      setDeleteOpen(false);
      deleteTarget.current = null;
      await loadItems();
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.delete"), variant: "destructive" });
    } finally { setBusyId(null); setDeleteSubmitting(false); }
  }, [canDelete, fetchWithAuth, loadItems, t, toast]);

  const bulkUpload = useCallback(async (file: File | null) => {
    if (!file || bulkUploading || !canBulkUpload) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: t("equipmentTypes.toasts.validationTitle"), description: t("equipmentTypes.bulk.csvOnly"), variant: "destructive" });
      return;
    }
    setBulkUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/equipment-types/bulk-upload/", { method: "POST", body: data });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok || payload !== true) throw new Error(errorMessage(payload, t("equipmentTypes.errors.bulkUpload")));
      toast({ title: t("equipmentTypes.toasts.successTitle"), description: t("equipmentTypes.toasts.bulkUploaded") });
      await loadItems();
    } catch (error) {
      toast({ title: t("equipmentTypes.toasts.errorTitle"), description: error instanceof Error ? error.message : t("equipmentTypes.errors.bulkUpload"), variant: "destructive" });
    } finally { setBulkUploading(false); }
  }, [bulkUploading, canBulkUpload, fetchWithAuth, loadItems, t, toast]);

  const renderActions = useCallback((item: EquipmentTypeRecord) => {
    const canToggle = item.isActive ? canDeactivate : canActivate;
    if (!canUpdate && !canToggle && !canDelete) return null;
    return <div className="flex items-center justify-end gap-2">
      {canUpdate ? <button type="button" disabled={busyId === item.id} onClick={(event) => { event.stopPropagation(); router.push(`/equipment-types/${item.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("equipmentTypes.actions.edit")} aria-label={t("equipmentTypes.actions.edit")}><SquarePen className="h-4 w-4" aria-hidden="true" /></button> : null}
      {canToggle ? <button type="button" disabled={busyId === item.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(item); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(item.isActive ? "equipmentTypes.actions.deactivate" : "equipmentTypes.actions.activate")} aria-label={t(item.isActive ? "equipmentTypes.actions.deactivate" : "equipmentTypes.actions.activate")}>{busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : item.isActive ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}</button> : null}
      {canDelete ? <button type="button" disabled={busyId === item.id || deleteSubmitting} onClick={(event) => { event.stopPropagation(); deleteTarget.current = item; setDeleteOpen(true); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("equipmentTypes.actions.delete")} aria-label={t("equipmentTypes.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" /></button> : null}
    </div>;
  }, [busyId, canActivate, canDeactivate, canDelete, canUpdate, deleteSubmitting, router, t, toggleStatus]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);
  const toolbar = useMemo(() => <div className="flex flex-wrap items-center gap-2">
    {canBulkUpload ? <label title={t("equipmentTypes.bulk.template")} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
      {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Upload className="h-4 w-4" aria-hidden="true" />}{t("equipmentTypes.bulk.upload")}
      <input id="equipment-types-csv-upload" type="file" accept=".csv,text/csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void bulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
    </label> : null}
    {canCreate ? <button type="button" onClick={() => router.push("/equipment-types/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><Wrench className="h-4 w-4" aria-hidden="true" />{t("equipmentTypes.actions.add")}</button> : null}
  </div>, [bulkUpload, bulkUploading, canBulkUpload, canCreate, router, t]);

  return <div data-testid="equipment-types-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
      <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
          <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">{t("equipmentTypes.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("equipmentTypes.subtitle")}</p></div>
          {toolbar}
        </div>
      </div>
      <HubGrid title={t("equipmentTypes.title")} subtitle={t("equipmentTypes.subtitle")} columns={columns} items={items}
        renderRowCells={(item) => [item.name]}
        renderStatus={(item) => <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", item.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>{t(item.isActive ? "equipmentTypes.status.active" : "equipmentTypes.status.inactive")}</span>}
        statusColumnLabel={t("equipmentTypes.table.status")} renderActions={renderActions} actionsColumnLabel={t("equipmentTypes.table.actions")}
        rowDensity={rowDensity} densityOptions={densityOptions} onDensityChange={setRowDensity} sortBy={sortBy} sortDirection={sortDirection}
        onSort={(key) => { if (!["Name", "IsActive"].includes(key)) return; const field = key as EquipmentTypeSortField; setSortDirection((current) => sortBy === field ? current === "asc" ? "desc" : "asc" : "asc"); setSortBy(field); setPage(1); }}
        statusFilter={statusFilter} statusFilterOptions={[{ value: "active", label: t("equipmentTypes.filters.active") }, { value: "inactive", label: t("equipmentTypes.filters.inactive") }, { value: "all", label: t("equipmentTypes.filters.all") }]}
        onStatusFilterChange={(value) => { setStatusFilter(value as EquipmentTypeStatusFilter); setPage(1); }} statusFilterLabel={t("equipmentTypes.filters.statusLabel")}
        searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("equipmentTypes.filters.search")}
        loading={loading} loadingText={t("equipmentTypes.loading")} emptyText={t("equipmentTypes.empty")}
        pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
        onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]} onPageSizeChange={(value) => { if (PAGE_SIZE_OPTIONS.includes(value as PageSize)) { setPageSize(value as PageSize); setPage(1); } }}
        paginationPreviousLabel={t("equipmentTypes.pagination.previous")} paginationNextLabel={t("equipmentTypes.pagination.next")} paginationPageLabel={t("equipmentTypes.pagination.page")} paginationPerPageLabel={t("equipmentTypes.pagination.perPage")}
        getRowKey={(item) => item.id} onRowClick={(item) => router.push(`/equipment-types/${item.id}/`)} />
    </div>
    <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }} title={t("equipmentTypes.actions.delete")}
      description={t("equipmentTypes.confirm.delete", { name: deleteTarget.current?.name ?? "" })} confirmLabel={t("equipmentTypes.actions.delete")}
      cancelLabel={t("equipmentTypes.actions.cancel")} onConfirm={() => void removeItem()} />
  </div>;
}
