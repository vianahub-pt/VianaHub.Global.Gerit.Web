"use client";

import clsx from "clsx";
import {
  Loader2,
  Power,
  SquarePen,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { WorkspaceShell } from "@/shared/layout";
import { useToast } from "@/shared/feedback";
import {
  HubGrid,
  type HubGridColumn,
  type RowDensity,
} from "@/shared/hub-grid";
import { ClientItem } from "@/domains/operations/clients/client-models";
import {
  ClientsPagedResponse,
  normalizeClient,
  normalizeErrorMessage,
  parsePagedClients,
} from "@/domains/operations/clients/client-utils";

type SortColumn = "Name" | "Email" | "Phone" | "ClientType";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type ClientStatusFilter = "active" | "inactive" | "all";

export function ClientsPage() {
  const { fetchWithAuth, isHydrating, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ClientStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsBulkUploading, setClientsBulkUploading] = useState(false);
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const openClientDetails = useCallback(
    (clientId?: number) => {
      if (clientId) {
        router.push(`/clients-details/${clientId}/`);
      } else {
        router.push("/clients/new/");
      }
    },
    [router],
  );

  const loadClients = useCallback(async () => {
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
        `/api/gerit/v1/clients/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("clients.errors.load")),
        );
      }

      const parsed = parsePagedClients(payload);
      const candidate = payload as ClientsPagedResponse;
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

      setClients(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(serverPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("clients.errors.load");
      setClients([]);
      setTotalItems(0);
      toast({
        title: t("clients.toasts.errorTitle"),
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
      void loadClients();
    }
  }, [isAuthenticated, isHydrating, loadClients]);

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
    setStatusFilter(value as ClientStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleToggleStatus = useCallback(
    async (client: ClientItem) => {
      try {
        const endpoint = client.isActive
          ? `/api/gerit/v1/clients/${client.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.errors.status")),
          );
        }

        toast({
          title: t("clients.toasts.successTitle"),
          description: client.isActive
            ? t("clients.toasts.deactivated")
            : t("clients.toasts.activated"),
        });
        void loadClients();
      } catch (error) {
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadClients, t, toast],
  );

  const handleDeleteClient = useCallback(
    async (client: ClientItem) => {
      const confirmed = window.confirm(
        t("clients.confirm.delete", { name: client.name }),
      );
      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}`,
          {
            method: "DELETE",
          },
        );
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.errors.delete")),
          );
        }

        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.toasts.deleted"),
        });
        void loadClients();
      } catch (error) {
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadClients, t, toast],
  );

  const handleBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || clientsBulkUploading) {
        return;
      }

      setClientsBulkUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth(
          "/api/gerit/v1/clients/bulk-upload",
          {
            method: "POST",
            body: formData,
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              payload,
              t("clients.bulk.upload.error", {
                resource: t("clients.title"),
              }),
            ),
          );
        }

        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.bulk.upload.success", {
            resource: t("clients.title"),
          }),
        });
        void loadClients();
      } catch (error) {
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.bulk.upload.error", {
                  resource: t("clients.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setClientsBulkUploading(false);
      }
    },
    [clientsBulkUploading, fetchWithAuth, loadClients, t, toast],
  );

  const clientColumns = useMemo<HubGridColumn<ClientItem>[]>(
    () => [
      {
        key: "ClientType",
        label: t("clients.table.clientType"),
        sortable: true,
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Name",
        label: t("clients.table.name"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Email",
        label: t("clients.table.email"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Phone",
        label: t("clients.table.phone"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("clients.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("clients.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("clients.grid.density.expanded"),
      },
    ],
    [t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-[#d1d9e5] bg-white px-4 text-sm font-medium text-[#1f2f3f] transition-colors hover:border-[#b4c2d9] hover:bg-[#f0f3fb] dark:border-[#405360] dark:bg-[#263844] dark:text-[#c9d8df] dark:hover:bg-[#2c404c]">
          {clientsBulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#08aee5]" />
          ) : null}
          {t("clients.bulk.upload.label")}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={clientsBulkUploading}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void handleBulkUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => openClientDetails()}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-[#08aee5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0cbbf6]"
        >
          <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
          {t("clients.actions.add")}
        </button>
      </div>
    ),
    [clientsBulkUploading, handleBulkUpload, openClientDetails, t],
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

  const clientRowCells = useCallback(
    (client: ClientItem) => [
      client.clientTypeDescription ?? "-",
      client.name,
      client.email ?? "-",
      client.phone,
      client.phone,
    ],
    [],
  );

  const renderClientStatus = useCallback(
    (client: ClientItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          client.isActive
            ? "text-[#3E515B] dark:text-[#84a0c0]"
            : "text-[#3E515B] dark:text-[#84a0c0]",
        )}
      >
        {client.isActive
          ? t("clients.status.active")
          : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderClientActions = useCallback(
    (client: ClientItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openClientDetails(client.id);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#1f2f3f] transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(client);
          }}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={
            client.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteClient(client);
          }}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#ffd7e1]"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
      </div>
    ),
    [handleDeleteClient, handleToggleStatus, openClientDetails, t],
  );

  return (
    <WorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-[#f5f6f8] px-4 py-4 sm:px-6 dark:bg-[#253542]">
          <div className="mb-5 overflow-hidden rounded-sm border border-[#dfe6ed]/80 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-[#142435] dark:bg-[#0d1c29] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#dfe6ed]/70 bg-[#f4f6fb] px-6 py-5 dark:border-[#162235] dark:bg-[#0d1c29]">
              <div>
                <h1 className="text-3xl font-semibold tracking-[0.03em] text-[#0f172a] dark:text-white">
                  {t("clients.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-[#7aa4c0] dark:text-[#84a0c0]">
                  {t("clients.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("clients.title")}
            subtitle={t("clients.subtitle")}
            columns={clientColumns}
            items={clients}
            renderRowCells={clientRowCells}
            renderStatus={renderClientStatus}
            statusColumnLabel={t("clients.table.status")}
            renderActions={renderClientActions}
            actionsColumnLabel={t("clients.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("clients.filters.active") },
              { value: "inactive", label: t("clients.filters.inactive") },
              { value: "all", label: t("clients.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("clients.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("clients.filters.search")}
            loading={loading}
            loadingText={t("clients.loading")}
            emptyText={t("clients.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("clients.pagination.previous")}
            paginationNextLabel={t("clients.pagination.next")}
            paginationPageLabel={t("clients.pagination.page")}
            paginationPerPageLabel={t("clients.pagination.perPage")}
            getRowKey={(client) => client.id}
            onRowClick={(client) => openClientDetails(client.id)}
          />
        </div>
      </div>
    </WorkspaceShell>
  );
}
