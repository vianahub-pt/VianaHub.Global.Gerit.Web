"use client";

import clsx from "clsx";
import { SquarePen, Trash2, UserRoundPlus, Power, Loader2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { WorkspaceShell } from "@/shared/layout";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/feedback";
import {
  HubGrid,
  type HubGridColumn,
  type RowDensity,
} from "@/shared/hub-grid";

interface VehicleItem {
  id: number;
  licensePlate: string;
  brand: string;
  model: string;
  isActive: boolean;
}

interface VehiclesPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface VehicleFormState {
  licensePlate: string;
  brand: string;
  model: string;
}

type SortColumn = "LicensePlate" | "Brand" | "Model";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type VehicleStatusFilter = "active" | "inactive" | "all";
type VehicleDetailMode = "hidden" | "create" | "edit";

const initialVehicleFormState: VehicleFormState = {
  licensePlate: "",
  brand: "",
  model: "",
};
function normalizeVehicle(payload: unknown): VehicleItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.vehicleId === "number"
        ? candidate.vehicleId
        : null;

  if (rawId === null) {
    return null;
  }

  const licensePlate =
    typeof candidate.licensePlate === "string"
      ? candidate.licensePlate
      : typeof candidate.plate === "string"
        ? candidate.plate
        : "";

  const brand =
    typeof candidate.brand === "string"
      ? candidate.brand
      : typeof candidate.make === "string"
        ? candidate.make
        : "";

  const model =
    typeof candidate.model === "string"
      ? candidate.model
      : typeof candidate.type === "string"
        ? candidate.type
        : "";

  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  if (!licensePlate || !brand) {
    return null;
  }

  return {
    id: rawId,
    licensePlate,
    brand,
    model,
    isActive: Boolean(isActiveValue),
  };
}

function normalizeErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }

  const candidate = payload as {
    message?: unknown;
    error?: unknown;
    title?: unknown;
    errors?: unknown;
  };

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message;
  }

  if (typeof candidate.error === "string" && candidate.error.trim()) {
    return candidate.error;
  }

  if (typeof candidate.title === "string" && candidate.title.trim()) {
    return candidate.title;
  }

  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    const firstErrorGroup = Object.values(
      candidate.errors as Record<string, unknown>,
    ).find((value) => Array.isArray(value) && value.length > 0);

    if (
      Array.isArray(firstErrorGroup) &&
      typeof firstErrorGroup[0] === "string" &&
      firstErrorGroup[0].trim()
    ) {
      return firstErrorGroup[0];
    }
  }

  return fallback;
}

function parsePagedVehicles(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as VehicleItem[], totalItems: 0 };
  }

  const candidate = payload as VehiclesPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeVehicle)
    .filter((item): item is VehicleItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function VehiclesPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<VehicleStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortBy, setSortBy] = useState<SortColumn>("LicensePlate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(
    null,
  );
  const [vehicleDetailMode, setVehicleDetailMode] = useState<
    "hidden" | "create" | "edit"
  >("hidden");
  const [formState, setFormState] = useState<VehicleFormState>(
    initialVehicleFormState,
  );
  const [bulkUploading, setBulkUploading] = useState(false);

  const detailVisible = vehicleDetailMode !== "hidden";

  const vehicleColumns = useMemo<HubGridColumn<VehicleItem>[]>(
    () => [
      {
        key: "LicensePlate",
        label: t("vehicles.table.plate"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Brand",
        label: t("vehicles.table.brand"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Model",
        label: t("vehicles.table.model"),
        cellClassName: "text-foreground dark:text-foreground",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("vehicles.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("vehicles.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("vehicles.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetForm = useCallback(() => {
    setFormState(initialVehicleFormState);
  }, []);

  const hideDetail = useCallback(() => {
    setSelectedVehicle(null);
    setVehicleDetailMode("hidden");
    resetForm();
  }, [resetForm]);

  const showCreateForm = useCallback(() => {
    setSelectedVehicle(null);
    setVehicleDetailMode("create");
    resetForm();
  }, [resetForm]);

  const handleVehicleSelection = useCallback((vehicle: VehicleItem) => {
    setSelectedVehicle(vehicle);
    setFormState({
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
    });
    setVehicleDetailMode("edit");
  }, []);

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
    setStatusFilter(value as VehicleStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadVehicles = useCallback(async () => {
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
        `/api/gerit/v1/vehicles/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as VehiclesPagedResponse;

      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("vehicles.errors.load")),
        );
      }

      const parsed = parsePagedVehicles(payload);
      const serverPageNumber =
        typeof candidate.pageNumber === "number" ? candidate.pageNumber : page;
      const serverPageSize =
        typeof candidate.pageSize === "number" ? candidate.pageSize : pageSize;
      const normalizedPageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(serverPageSize)
        ? (serverPageSize as PageSizeOption)
        : pageSize;
      const serverTotalItems =
        typeof candidate.totalItems === "number"
          ? candidate.totalItems
          : parsed.totalItems;
      const serverTotalPages =
        typeof candidate.totalPages === "number"
          ? Math.max(1, candidate.totalPages)
          : Math.max(
              1,
              Math.ceil(serverTotalItems / Math.max(1, normalizedPageSize)),
            );

      setVehicles(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(normalizedPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("vehicles.errors.load");
      setVehicles([]);
      setTotalItems(0);
      toast({
        title: t("vehicles.toasts.errorTitle"),
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

  const handleToggleStatus = useCallback(
    async (vehicle: VehicleItem) => {
      const action = vehicle.isActive ? "deactivate" : "activate";

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/vehicles/${vehicle.id}/${action}`,
          {
            method: "PATCH",
          },
        );

        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("vehicles.errors.status")),
          );
        }

        toast({
          title: t("vehicles.toasts.successTitle"),
          description: vehicle.isActive
            ? t("vehicles.toasts.deactivated")
            : t("vehicles.toasts.activated"),
        });

        void loadVehicles();
      } catch (error) {
        toast({
          title: t("vehicles.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("vehicles.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadVehicles, t, toast],
  );

  const handleDeleteVehicle = useCallback(
    async (vehicle: VehicleItem) => {
      const confirmed = window.confirm(
        t("vehicles.confirm.delete", { licensePlate: vehicle.licensePlate }),
      );

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/vehicles/${vehicle.id}`,
          {
            method: "DELETE",
          },
        );

        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("vehicles.errors.delete")),
          );
        }

        toast({
          title: t("vehicles.toasts.successTitle"),
          description: t("vehicles.toasts.deleted"),
        });

        hideDetail();
        await loadVehicles();
      } catch (error) {
        toast({
          title: t("vehicles.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("vehicles.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadVehicles, t, toast],
  );

  const handleBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || bulkUploading) {
        return;
      }

      setBulkUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetchWithAuth(
          "/api/gerit/v1/vehicles/bulk-upload",
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              payload,
              t("vehicles.bulk.upload.error", {
                resource: t("vehicles.title"),
              }),
            ),
          );
        }

        toast({
          title: t("vehicles.toasts.successTitle"),
          description: t("vehicles.bulk.upload.success", {
            resource: t("vehicles.title"),
          }),
        });

        await loadVehicles();
      } catch (error) {
        toast({
          title: t("vehicles.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("vehicles.bulk.upload.error", {
                  resource: t("vehicles.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [bulkUploading, fetchWithAuth, loadVehicles, t, toast],
  );

  const vehicleRowCells = useCallback(
    (vehicle: VehicleItem) => [
      vehicle.licensePlate,
      vehicle.brand,
      vehicle.model,
    ],
    [],
  );

  const renderVehicleStatus = useCallback(
    (vehicle: VehicleItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          vehicle.isActive
            ? "text-foreground dark:text-foreground"
            : "text-foreground dark:text-foreground",
        )}
      >
        {vehicle.isActive
          ? t("vehicles.status.active")
          : t("vehicles.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderVehicleActions = useCallback(
    (vehicle: VehicleItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleVehicleSelection(vehicle);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={t("vehicles.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(vehicle);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={
            vehicle.isActive
              ? t("vehicles.actions.deactivate")
              : t("vehicles.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteVehicle(vehicle);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-destructive"
          title={t("vehicles.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
      </div>
    ),
    [handleVehicleSelection, handleDeleteVehicle, handleToggleStatus, t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
          {t("vehicles.bulk.upload.label")}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={bulkUploading}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void handleBulkUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={showCreateForm}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
          {t("vehicles.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
  );

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadVehicles();
    }
  }, [isAuthenticated, isHydrating, loadVehicles]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const licensePlate = formState.licensePlate.trim();
    const brand = formState.brand.trim();
    const model = formState.model.trim();

    if (!licensePlate || !brand) {
      toast({
        title: t("vehicles.toasts.validationTitle"),
        description: t("vehicles.validation.required"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        licensePlate,
        brand,
        model: model.length > 0 ? model : null,
      };

      const isEditing = selectedVehicle !== null;
      const endpoint = isEditing
        ? `/api/gerit/v1/vehicles/${selectedVehicle?.id ?? ""}`
        : "/api/gerit/v1/vehicles";

      const response = await fetchWithAuth(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response) return;
      const responsePayload = (await response
        .json()
        .catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(responsePayload, t("vehicles.errors.save")),
        );
      }

      const normalized = normalizeVehicle(responsePayload);

      if (normalized) {
        setSelectedVehicle(normalized);
        setFormState({
          licensePlate: normalized.licensePlate,
          brand: normalized.brand,
          model: normalized.model,
        });
        setVehicleDetailMode("edit");
      }

      toast({
        title: t("vehicles.toasts.successTitle"),
        description: isEditing
          ? t("vehicles.toasts.updated")
          : t("vehicles.toasts.created"),
      });
      await loadVehicles();
    } catch (error) {
      toast({
        title: t("vehicles.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("vehicles.errors.save"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: totalItems }),
    [t, totalItems],
  );

  const pageButtons = useMemo(() => {
    const maxVisible = 5;
    const pages: number[] = [];
    const normalTotal = Math.max(1, totalPagesFromServer);
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(normalTotal, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let index = start; index <= end; index += 1) {
      pages.push(index);
    }
    return pages;
  }, [page, totalPagesFromServer]);

  return (
    <WorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
          <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5 dark:border-border dark:bg-muted">
              <div>
                <h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground dark:text-foreground">
                  {t("vehicles.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {t("vehicles.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("vehicles.title")}
            subtitle={t("vehicles.subtitle")}
            columns={vehicleColumns}
            items={vehicles}
            renderRowCells={vehicleRowCells}
            renderStatus={renderVehicleStatus}
            statusColumnLabel={t("vehicles.table.status")}
            renderActions={renderVehicleActions}
            actionsColumnLabel={t("vehicles.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("vehicles.filters.active") },
              { value: "inactive", label: t("vehicles.filters.inactive") },
              { value: "all", label: t("vehicles.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("vehicles.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("vehicles.filters.search")}
            loading={loading}
            loadingText={t("vehicles.loading")}
            emptyText={t("vehicles.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("vehicles.pagination.previous")}
            paginationNextLabel={t("vehicles.pagination.next")}
            paginationPageLabel={t("vehicles.pagination.page")}
            paginationPerPageLabel={t("vehicles.pagination.perPage")}
            selectedRowKey={selectedVehicle?.id}
            getRowKey={(vehicle) => vehicle.id}
            onRowClick={handleVehicleSelection}
          />
          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-border bg-surface p-5 dark:border-border dark:bg-surface">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                      {selectedVehicle
                        ? t("vehicles.form.editTitle")
                        : t("vehicles.form.newTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                      {t("vehicles.form.subtitle")}
                    </p>
                  </div>
                </div>

                <form
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                  onSubmit={handleSubmit}
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
                      {t("vehicles.form.plate")}
                    </span>
                    <Input
                      value={formState.licensePlate}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          licensePlate: event.target.value,
                        }))
                      }
                      placeholder={t("vehicles.form.plate")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
                      {t("vehicles.form.brand")}
                    </span>
                    <Input
                      value={formState.brand}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          brand: event.target.value,
                        }))
                      }
                      placeholder={t("vehicles.form.brand")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
                      {t("vehicles.form.model")}
                    </span>
                    <Input
                      value={formState.model}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder={t("vehicles.form.model")}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={hideDetail}
                      disabled={submitting}
                      className="h-11 rounded-sm border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground"
                    >
                      {t("vehicles.actions.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("vehicles.actions.save")}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </WorkspaceShell>
  );
}
