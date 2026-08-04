"use client";

import clsx from "clsx";
import {
  Loader2,
  Power,
  PowerOff,
  SquarePen,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { logError } from "@/core/logger/client-logger";
import {
  HubGrid,
  type HubGridColumn,
  type RowDensity,
} from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { TenantItem } from "@/domains/platform-admin/tenants/tenant-models";
import {
  TenantsPagedResponse,
  normalizeErrorMessage,
  parsePagedTenants,
} from "@/domains/platform-admin/tenants/tenant-utils";

type SortColumn = "Name" | "Email" | "WebsiteUrl";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type TenantStatusFilter = "active" | "inactive" | "all";

export function TenantsPage() {
  const { fetchWithAuth, isHydrating, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<TenantStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteConfirmTenantRef = useRef<TenantItem | null>(null);
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const openTenantDetails = useCallback(
    (tenantId?: number) => {
      if (tenantId) {
        router.push(`/platform-admin/tenants/${tenantId}/`);
      } else {
        router.push("/platform-admin/tenants/new/");
      }
    },
    [router],
  );

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({
      Search: search.trim(),
      PageNumber: String(page),
      PageSize: String(pageSize),
      SortBy: sortBy,
      SortDirection: sortDirection,
    });
    if (statusFilter !== "all") {
      query.set("IsActive", statusFilter === "active" ? "true" : "false");
    }

    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/tenants/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      if (!response) return;

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("tenants.errors.load")),
        );
      }

      const parsed = parsePagedTenants(payload);
      const candidate = payload as TenantsPagedResponse;
      const serverPageNumber =
        typeof candidate.pageNumber === "number" ? candidate.pageNumber : page;
      const rawServerPageSize =
        typeof candidate.pageSize === "number" ? candidate.pageSize : pageSize;
      const serverPageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawServerPageSize)
        ? (rawServerPageSize as PageSizeOption)
        : pageSize;
      const serverTotalItems =
        typeof candidate.totalItems === "number"
          ? candidate.totalItems
          : parsed.totalItems;
      const serverTotalPages =
        typeof candidate.totalPages === "number"
          ? Math.max(1, candidate.totalPages)
          : Math.max(1, Math.ceil(serverTotalItems / serverPageSize));

      setTenants(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(serverPageSize);
    } catch (error) {
      logError("tenants.page.load", "Falha ao carregar tenants", error, {
        search,
        page,
        pageSize,
        sortBy,
        sortDirection,
        statusFilter,
      });
      const message =
        error instanceof Error ? error.message : t("tenants.errors.load");
      setTenants([]);
      setTotalItems(0);
      toast({
        title: t("tenants.toasts.errorTitle"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    fetchWithAuth,
    page,
    pageSize,
    search,
    statusFilter,
    sortBy,
    sortDirection,
    t,
    toast,
  ]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadTenants();
    }
  }, [isAuthenticated, isHydrating, loadTenants]);

  const handleSort = useCallback(
    (columnKey: string) => {
      const column = columnKey as SortColumn;
      setSortDirection((currentDirection) => {
        if (sortBy === column) {
          return currentDirection === "asc" ? "desc" : "asc";
        }
        return "asc";
      });
      setSortBy(column);
      setPage(1);
    },
    [sortBy],
  );

  const handlePageSizeChange = useCallback((value: number) => {
    const validOption = (PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
      ? (value as PageSizeOption)
      : pageSize;
    setPageSize(validOption);
    setPage(1);
  }, [pageSize]);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value as TenantStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleToggleStatus = useCallback(
    async (tenant: TenantItem) => {
      try {
        const endpoint = tenant.isActive
          ? `/api/gerit/v1/tenants/${tenant.id}/deactivate`
          : `/api/gerit/v1/tenants/${tenant.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("tenants.errors.status")),
          );
        }

        toast({
          title: t("tenants.toasts.successTitle"),
          description: tenant.isActive
            ? t("tenants.toasts.deactivated")
            : t("tenants.toasts.activated"),
        });
        void loadTenants();
      } catch (error) {
        logError("tenants.page.toggleStatus", "Falha ao alterar estado do tenant", error, {
          tenantId: tenant.id,
          tenantName: tenant.name,
        });
        toast({
          title: t("tenants.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("tenants.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadTenants, t, toast],
  );

  const handleDeleteTenant = useCallback(
    (tenant: TenantItem) => {
      deleteConfirmTenantRef.current = tenant;
      setDeleteConfirmOpen(true);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    const tenant = deleteConfirmTenantRef.current;
    deleteConfirmTenantRef.current = null;
    setDeleteConfirmOpen(false);
    if (!tenant) return;

    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/tenants/${tenant.id}`,
          {
            method: "DELETE",
          },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("tenants.errors.delete")),
          );
        }

        toast({
          title: t("tenants.toasts.successTitle"),
          description: t("tenants.toasts.deleted"),
        });
        void loadTenants();
      } catch (error) {
        logError("tenants.page.delete", "Falha ao eliminar tenant", error, {
          tenantId: tenant.id,
          tenantName: tenant.name,
        });
        toast({
          title: t("tenants.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("tenants.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadTenants, t, toast],
  );

  const tenantColumns = useMemo<HubGridColumn<TenantItem>[]>(
    () => [
      {
        key: "Name",
        label: t("tenants.table.name"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Email",
        label: t("tenants.table.email"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "WebsiteUrl",
        label: t("tenants.table.websiteUrl"),
        cellClassName: "text-foreground dark:text-foreground",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("tenants.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("tenants.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("tenants.grid.density.expanded"),
      },
    ],
    [t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openTenantDetails()}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
          {t("tenants.actions.add")}
        </button>
      </div>
    ),
    [openTenantDetails, t],
  );

  const pageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: totalItems }),
    [t, totalItems],
  );

  const pageButtons = useMemo(() => {
    const maxVisible = 5;
    const pages: number[] = [];
    const normalTotal = Math.max(1, totalPagesFromServer);
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(normalTotal, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let index = start; index <= end; index += 1) {
      pages.push(index);
    }
    return pages;
  }, [page, totalPagesFromServer]);

  const tenantRowCells = useCallback(
    (tenant: TenantItem) => [
      tenant.name,
      tenant.email ?? "-",
      tenant.websiteUrl ?? "-",
    ],
    [],
  );

  const renderTenantStatus = useCallback(
    (tenant: TenantItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          tenant.isActive
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        )}
      >
        {tenant.isActive
          ? t("tenants.status.active")
          : t("tenants.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderTenantActions = useCallback(
    (tenant: TenantItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openTenantDetails(tenant.id);
          }}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title={t("tenants.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(tenant);
          }}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title={
            tenant.isActive
              ? t("tenants.actions.deactivate")
              : t("tenants.actions.activate")
          }
        >
          {tenant.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />
          }
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteTenant(tenant);
          }}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("tenants.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleDeleteTenant, handleToggleStatus, openTenantDetails, t],
  );

  return (
    <>
      <div data-testid="tenants-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
          <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
              <div>
                <h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">
                  {t("tenants.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {t("tenants.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("tenants.title")}
            subtitle={t("tenants.subtitle")}
            columns={tenantColumns}
            items={tenants}
            renderRowCells={tenantRowCells}
            renderStatus={renderTenantStatus}
            statusColumnLabel={t("tenants.table.status")}
            renderActions={renderTenantActions}
            actionsColumnLabel={t("tenants.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("tenants.filters.active") },
              { value: "inactive", label: t("tenants.filters.inactive") },
              { value: "all", label: t("tenants.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("tenants.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("tenants.filters.search")}
            loading={loading}
            loadingText={t("tenants.loading")}
            emptyText={t("tenants.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("tenants.pagination.previous")}
            paginationNextLabel={t("tenants.pagination.next")}
            paginationPageLabel={t("tenants.pagination.page")}
            paginationPerPageLabel={t("tenants.pagination.perPage")}
            getRowKey={(tenant) => tenant.id}
            onRowClick={(tenant) => openTenantDetails(tenant.id)}
          />
        </div>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("tenants.toasts.validationTitle")}
        description={
          deleteConfirmTenantRef.current
            ? t("tenants.confirm.delete", { name: deleteConfirmTenantRef.current.name })
            : ""
        }
        confirmLabel={t("tenants.actions.delete")}
        cancelLabel={t("tenants.actions.cancel")}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  );
}
