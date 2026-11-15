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
import { useIdentityPreferences } from "@/domains/identity/preferences";
import {
  buildUsersQuery,
  normalizeUserPage,
  type UserRecord,
  type UserSortField,
  type UserStatusFilter,
} from "@/domains/operations/users/users-contract";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

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

function formatLastAccess(value: string | null, locale: string, timezone: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone || "UTC",
    }).format(parsed);
  } catch {
    return "—";
  }
}

export function UsersPage() {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating, roles } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const preferences = useIdentityPreferences();
  const { locale, timezone } = preferences.state;
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManageUsers = normalizedRoles.some((role) => ["admin", "backoffice", "manager"].includes(role));
  const canDeleteUsers = normalizedRoles.some((role) => ["admin", "backoffice"].includes(role));
  const canCreate = canManageUsers && hasPermission("Users", "Create");
  const canUpdate = canManageUsers && hasPermission("Users", "Update");
  const canActivate = canManageUsers && hasPermission("Users", "Activate");
  const canDeactivate = canManageUsers && hasPermission("Users", "Deactivate");
  const canDelete = canDeleteUsers && hasPermission("Users", "Delete");
  const canBulkUpload = canDeleteUsers && hasPermission("Users", "BulkUpload");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [sortBy, setSortBy] = useState<UserSortField>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [userBusyId, setUserBusyId] = useState<number | null>(null);
  const deleteUserRef = useRef<UserRecord | null>(null);

  const columns = useMemo<HubGridColumn<UserRecord>[]>(() => [
    { key: "Name", label: t("users.table.name"), cellClassName: "text-foreground dark:text-foreground" },
    { key: "Email", label: t("users.table.email"), sortable: false, cellClassName: "text-foreground dark:text-foreground" },
    { key: "PhoneNumber", label: t("users.table.phone"), cellClassName: "text-foreground dark:text-foreground" },
    { key: "LastAccessAt", label: t("users.table.lastAccessAt"), cellClassName: "text-foreground dark:text-foreground" },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("users.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("users.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("users.grid.density.expanded") },
  ], [t]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildUsersQuery({ search, status: statusFilter, page, pageSize, sortBy, sortDirection });
      const response = await fetchWithAuth(`/api/gerit/v1/users/paged?${query.toString()}`, { method: "GET" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.load")));
      const result = normalizeUserPage(payload);
      if (!result) throw new Error(t("users.errors.load"));
      setUsers(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, result.totalPages));
      if (result.pageNumber !== page) setPage(result.pageNumber);
      if (PAGE_SIZE_OPTIONS.includes(result.pageSize as PageSize)) setPageSize(result.pageSize as PageSize);
    } catch (error) {
      setUsers([]);
      setTotalItems(0);
      setTotalPages(1);
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.load"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, page, pageSize, search, sortBy, sortDirection, statusFilter, t, toast]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) void loadUsers();
  }, [isAuthenticated, isHydrating, loadUsers]);

  const toggleStatus = useCallback(async (user: UserRecord) => {
    const operation = user.isActive ? "deactivate" : "activate";
    const allowed = user.isActive ? canDeactivate : canActivate;
    if (!allowed) return;
    setUserBusyId(user.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/users/${user.id}/${operation}`, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.status")));
      toast({ title: t("users.toasts.successTitle"), description: t(operation === "activate" ? "users.toasts.activated" : "users.toasts.deactivated") });
      await loadUsers();
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.status"), variant: "destructive" });
    } finally {
      setUserBusyId(null);
    }
  }, [canActivate, canDeactivate, fetchWithAuth, loadUsers, t, toast]);

  const requestDelete = useCallback((user: UserRecord) => {
    if (!canDelete) return;
    deleteUserRef.current = user;
    setDeleteConfirmOpen(true);
  }, [canDelete]);

  const deleteUser = useCallback(async () => {
    const user = deleteUserRef.current;
    if (!user || !canDelete) return;
    setDeleteSubmitting(true);
    setUserBusyId(user.id);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/users/${user.id}`, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.delete")));
      toast({ title: t("users.toasts.successTitle"), description: t("users.toasts.deleted") });
      setDeleteConfirmOpen(false);
      deleteUserRef.current = null;
      await loadUsers();
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.delete"), variant: "destructive" });
    } finally {
      setUserBusyId(null);
      setDeleteSubmitting(false);
    }
  }, [canDelete, fetchWithAuth, loadUsers, t, toast]);

  const handleBulkUpload = useCallback(async (file: File | null) => {
    if (!file || bulkUploading || !canBulkUpload) return;
    setBulkUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetchWithAuth("/api/gerit/v1/users/bulk-upload", { method: "POST", body: formData });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok || payload === false) throw new Error(errorMessage(payload, t("users.errors.bulkUpload")));
      toast({ title: t("users.toasts.successTitle"), description: t("users.bulk.upload.success", { resource: t("users.title") }) });
      await loadUsers();
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.bulkUpload"), variant: "destructive" });
    } finally {
      setBulkUploading(false);
    }
  }, [bulkUploading, canBulkUpload, fetchWithAuth, loadUsers, t, toast]);

  const renderCells = useCallback((user: UserRecord) => [
    user.name,
    user.email || "—",
    user.phoneNumber || "—",
    formatLastAccess(user.lastAccessAt, locale, timezone),
  ], [locale, timezone]);

  const renderStatus = useCallback((user: UserRecord) => (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", user.isActive
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {t(user.isActive ? "users.status.active" : "users.status.inactive")}
    </span>
  ), [t]);

  const renderActions = useCallback((user: UserRecord) => {
    const canToggle = user.isActive ? canDeactivate : canActivate;
    if (!canUpdate && !canToggle && !canDelete) return null;
    return (
      <div className="flex items-center justify-end gap-2">
        {canUpdate ? <button type="button" disabled={userBusyId === user.id || deleteSubmitting} onClick={(event) => { event.stopPropagation(); router.push(`/users/${user.id}/`); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("users.actions.edit")} aria-label={t("users.actions.edit")}><SquarePen className="h-4 w-4" /></button> : null}
        {canToggle ? <button type="button" disabled={userBusyId === user.id || deleteSubmitting} onClick={(event) => { event.stopPropagation(); void toggleStatus(user); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(user.isActive ? "users.actions.deactivate" : "users.actions.activate")} aria-label={t(user.isActive ? "users.actions.deactivate" : "users.actions.activate")}>{userBusyId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : user.isActive ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}</button> : null}
        {canDelete ? <button type="button" disabled={userBusyId === user.id || deleteSubmitting} onClick={(event) => { event.stopPropagation(); requestDelete(user); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" title={t("users.actions.delete")} aria-label={t("users.actions.delete")}><Trash2 className="h-4 w-4 text-red-500" /></button> : null}
      </div>
    );
  }, [canActivate, canDeactivate, canDelete, canUpdate, deleteSubmitting, requestDelete, router, t, toggleStatus, userBusyId]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, totalPages]);

  const gridToolbar = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      {canBulkUpload ? <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}{t("users.bulk.upload.label")}
        <input id="users-csv-upload" type="file" accept=".csv" className="hidden" disabled={bulkUploading} onChange={(event) => { void handleBulkUpload(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      </label> : null}
      {canCreate ? <button type="button" onClick={() => router.push("/users/new/")} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("users.actions.add")}</button> : null}
    </div>
  ), [bulkUploading, canBulkUpload, canCreate, handleBulkUpload, router, t]);

  return (
    <div data-testid="users-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
            <div><h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">{t("users.title")}</h1><p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("users.subtitle")}</p></div>
            {gridToolbar}
          </div>
        </div>
        <HubGrid
          title={t("users.title")} subtitle={t("users.subtitle")} columns={columns} items={users}
          renderRowCells={renderCells} renderStatus={renderStatus}
          statusColumnLabel={t("users.table.status")} renderActions={renderActions}
          actionsColumnLabel={t("users.table.actions")} rowDensity={rowDensity} densityOptions={densityOptions}
          onDensityChange={setRowDensity} sortBy={sortBy} sortDirection={sortDirection}
          onSort={(key) => {
            if (!["Name", "PhoneNumber", "LastAccessAt", "IsActive"].includes(key)) return;
            const field = key as UserSortField;
            setSortDirection((current) => sortBy === field ? current === "asc" ? "desc" : "asc" : "asc");
            setSortBy(field);
            setPage(1);
          }}
          statusFilter={statusFilter} statusFilterOptions={[{ value: "active", label: t("users.filters.active") }, { value: "inactive", label: t("users.filters.inactive") }, { value: "all", label: t("users.filters.all") }]}
          onStatusFilterChange={(value) => { setStatusFilter(value as UserStatusFilter); setPage(1); }} statusFilterLabel={t("users.filters.statusLabel")}
          searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("users.filters.search")}
          loading={loading} loadingText={t("users.loading")} emptyText={t("users.empty")}
          pageCaption={t("hubgrid.itemsLabel", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons}
          onPageChange={setPage} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZE_OPTIONS]} onPageSizeChange={(value) => { if (PAGE_SIZE_OPTIONS.includes(value as PageSize)) { setPageSize(value as PageSize); setPage(1); } }}
          paginationPreviousLabel={t("users.pagination.previous")} paginationNextLabel={t("users.pagination.next")} paginationPageLabel={t("users.pagination.page")} paginationPerPageLabel={t("users.pagination.perPage")}
          getRowKey={(user) => user.id} onRowClick={(user) => router.push(`/users/${user.id}/`)}
        />
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => { if (!deleteSubmitting) setDeleteConfirmOpen(open); }}
        title={t("users.actions.delete")}
        description={t("users.confirm.delete", { name: deleteUserRef.current?.name ?? "" })}
        confirmLabel={t("users.actions.delete")}
        cancelLabel={t("users.actions.cancel")}
        onConfirm={() => void deleteUser()}
      />
    </div>
  );
}
