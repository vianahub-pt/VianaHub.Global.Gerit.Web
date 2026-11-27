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

interface ResourceItem {
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

function normalizeResource(payload: unknown): ResourceItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const id = typeof candidate.id === "number" ? candidate.id : null;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  if (id === null || !name) return null;
  return { id, name, isActive: typeof candidate.isActive === "boolean" ? candidate.isActive : true };
}

function parseResources(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return { items: [] as ResourceItem[], totalItems: 0 };
  const candidate = payload as PagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : Array.isArray(candidate.data) ? candidate.data : [];
  const items = rawItems.map(normalizeResource).filter((item): item is ResourceItem => item !== null);
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

export function ResourcesPage() {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating, roles: authRoles } = useAuth();
  const normalizedRoles = authRoles.map((role) => role.trim().toLowerCase());
  const resourceManager = ["admin", "backoffice", "manager"].some((role) => normalizedRoles.includes(role));
  const access = {
    getPaged: resourceManager && hasPermission("Resources", "GetPaged"),
    getBy: resourceManager && hasPermission("Resources", "GetBy"),
    create: resourceManager && hasPermission("Resources", "Create"),
    update: resourceManager && hasPermission("Resources", "Update"),
    activate: resourceManager && hasPermission("Resources", "Activate"),
    deactivate: resourceManager && hasPermission("Resources", "Deactivate"),
    delete: resourceManager && hasPermission("Resources", "Delete"),
    bulkUpload: resourceManager && hasPermission("Resources", "BulkUpload"),
  };
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
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteResourceRef = useRef<ResourceItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [resourceBusyId, setResourceBusyId] = useState<number | null>(null);

  const columns = useMemo<HubGridColumn<ResourceItem>[]>(() => [
    { key: "Name", label: t("resources.table.name"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("resources.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("resources.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("resources.grid.density.expanded") },
  ], [t]);

  const loadResources = useCallback(async () => {
    if (!access.getPaged) {
      setResources([]);
      setTotalItems(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = new URLSearchParams({
      Search: search.trim(), PageNumber: String(page), PageSize: String(pageSize),
      SortBy: "Name", SortDirection: sortDirection,
    });
    if (statusFilter !== "all") query.set("IsActive", String(statusFilter === "active"));
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/resources/paged?${query.toString()}`, { method: "GET" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.load")));
      const parsed = parseResources(payload);
      const candidate = payload as PagedResponse;
      const size = typeof candidate.pageSize === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(candidate.pageSize)
        ? candidate.pageSize as PageSizeOption : pageSize;
      const count = typeof candidate.totalItems === "number" ? candidate.totalItems : parsed.totalItems;
      setResources(parsed.items);
      setTotalItems(count);
      setTotalPages(typeof candidate.totalPages === "number" ? Math.max(1, candidate.totalPages) : Math.max(1, Math.ceil(count / size)));
      if (typeof candidate.pageNumber === "number") setPage(candidate.pageNumber);
      setPageSize(size);
    } catch (error) {
      setResources([]);
      setTotalItems(0);
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.errors.load"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [access.getPaged, fetchWithAuth, page, pageSize, search, sortDirection, statusFilter, t, toast]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated && access.getPaged) void loadResources();
    else if (!isHydrating) setLoading(false);
  }, [access.getPaged, isAuthenticated, isHydrating, loadResources]);

  const toggleStatus = useCallback(async (resource: ResourceItem) => {
    const operation = resource.isActive ? "deactivate" : "activate";
    if (operation === "activate" ? !access.activate : !access.deactivate) return;
    setResourceBusyId(resource.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/resources/${resource.id}/${operation}`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.status")));
      toast({ title: t("resources.toasts.successTitle"), description: t(operation === "activate" ? "resources.toasts.activated" : "resources.toasts.deactivated") });
      await loadResources();
    } catch (error) {
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.errors.status"), variant: "destructive" });
    } finally {
      setResourceBusyId(null);
    }
  }, [access.activate, access.deactivate, fetchWithAuth, loadResources, t, toast]);

  const requestDelete = useCallback((resource: ResourceItem) => {
    deleteResourceRef.current = resource;
    setDeleteConfirmOpen(true);
  }, []);

  const deleteResource = useCallback(async () => {
    const resource = deleteResourceRef.current;
    if (!resource || !access.delete) return;
    setDeleteSubmitting(true);
    setResourceBusyId(resource.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/resources/${resource.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.errors.delete")));
      toast({ title: t("resources.toasts.successTitle"), description: t("resources.toasts.deleted") });
      setDeleteConfirmOpen(false);
      deleteResourceRef.current = null;
      await loadResources();
    } catch (error) {
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.errors.delete"), variant: "destructive" });
    } finally {
      setResourceBusyId(null);
      setDeleteSubmitting(false);
    }
  }, [access.delete, fetchWithAuth, loadResources, t, toast]);

  const bulkUpload = useCallback(async (file: File | null) => {
    if (!access.bulkUpload || !file || bulkUploading) return;
    setBulkUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/resources/bulk-upload", { method: "POST", body });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("resources.bulk.upload.error", { resource: t("resources.title") })));
      toast({ title: t("resources.toasts.successTitle"), description: t("resources.bulk.upload.success", { resource: t("resources.title") }) });
      await loadResources();
    } catch (error) {
      toast({ title: t("resources.toasts.errorTitle"), description: error instanceof Error ? error.message : t("resources.bulk.upload.error", { resource: t("resources.title") }), variant: "destructive" });
    } finally {
      setBulkUploading(false);
    }
  }, [access.bulkUpload, bulkUploading, fetchWithAuth, loadResources, t, toast]);

  const renderStatus = useCallback((resource: ResourceItem) => (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", resource.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {resource.isActive ? t("resources.status.active") : t("resources.status.inactive")}
    </span>
  ), [t]);

  const renderResources = useCallback((resource: ResourceItem) => (
    <div className="flex items-center justify-end gap-2">
      {access.getBy ? <button type="button" disabled={resourceBusyId === resource.id} onClick={(event) => { event.stopPropagation(); router.push(`/resources/${resource.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("resources.actions.edit")} aria-label={t("resources.actions.edit")}><SquarePen className="h-4 w-4" /></button> : null}
      {(resource.isActive ? access.deactivate : access.activate) ? <button type="button" disabled={resourceBusyId === resource.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(resource); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(resource.isActive ? "resources.actions.deactivate" : "resources.actions.activate")} aria-label={t(resource.isActive ? "resources.actions.deactivate" : "resources.actions.activate")}>{resourceBusyId === resource.id ? <Loader2 className="h-4 w-4 animate-spin" /> : resource.isActive ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}</button> : null}
      {access.delete ? <button type="button" disabled={resourceBusyId === resource.id} onClick={(event) => { event.stopPropagation(); requestDelete(resource); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("resources.actions.delete")} aria-label={t("resources.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" /></button> : null}
    </div>
  ), [access.activate, access.deactivate, access.delete, access.getBy, resourceBusyId, requestDelete, router, t, toggleStatus]);

  const gridToolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      {access.bulkUpload ? <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}{t("resources.bulk.upload.label")}
        <input type="file" accept=".csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void bulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </label> : null}
      {access.create ? <button type="button" onClick={() => router.push("/resources/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("resources.actions.add")}</button> : null}
    </div>
  ), [access.bulkUpload, access.create, bulkUpload, bulkUploading, router, t]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);

  return (
    <div data-testid="resources-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
            <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">{t("resources.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("resources.subtitle")}</p></div>
            {gridToolbar}
          </div>
        </div>
        {!loading && !access.getPaged ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("resources.errors.permissionDenied")}</section> : null}
        {access.getPaged ? <HubGrid
          title={t("resources.title")} subtitle={t("resources.subtitle")} columns={columns} items={resources}
          renderRowCells={(resource) => [resource.name]} renderStatus={renderStatus}
          statusColumnLabel={t("resources.table.status")} renderActions={renderResources}
          actionsColumnLabel={t("resources.table.actions")} rowDensity={rowDensity} densityOptions={densityOptions}
          onDensityChange={setRowDensity} sortBy="Name" sortDirection={sortDirection}
          onSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          statusFilter={statusFilter} statusFilterOptions={[{ value: "active", label: t("resources.filters.active") }, { value: "inactive", label: t("resources.filters.inactive") }, { value: "all", label: t("resources.filters.all") }]}
          onStatusFilterChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }} statusFilterLabel={t("resources.filters.statusLabel")}
          searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("resources.filters.search")}
          loading={loading} loadingText={t("resources.loading")} emptyText={t("resources.empty")}
          pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
          onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]} onPageSizeChange={(value) => { if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) { setPageSize(value as PageSizeOption); setPage(1); } }}
          paginationPreviousLabel={t("resources.pagination.previous")} paginationNextLabel={t("resources.pagination.next")} paginationPageLabel={t("resources.pagination.page")} paginationPerPageLabel={t("resources.pagination.perPage")}
          getRowKey={(resource) => resource.id} onRowClick={access.getBy ? (resource) => router.push(`/resources/${resource.id}/`) : undefined}
        /> : null}
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("resources.actions.delete")}
        description={t("resources.confirm.delete", { name: deleteResourceRef.current?.name ?? "" })}
        confirmLabel={t("resources.actions.delete")}
        cancelLabel={t("resources.actions.cancel")}
        onConfirm={() => void deleteResource()}
      />
    </div>
  );
}
