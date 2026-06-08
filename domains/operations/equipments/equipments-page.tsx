"use client";

import clsx from "clsx";
import { SquarePen, Trash2, UserRoundPlus, Power, Loader2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { WorkspaceShell } from "@/shared/layout";
import { useToast } from "@/shared/feedback";
import {
  HubGrid,
  type HubGridColumn,
  type RowDensity,
} from "@/shared/hub-grid";

interface EquipmentItem {
  id: number;
  name: string;
  serialNumber: string;
  equipmentType: string;
  isActive: boolean;
}

interface EquipmentsPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface EquipmentFormState {
  name: string;
  serialNumber: string;
  equipmentType: string;
}

type SortColumn = "Name" | "SerialNumber" | "Type";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type EquipmentStatusFilter = "active" | "inactive" | "all";
type EquipmentDetailMode = "hidden" | "create" | "edit";

const initialEquipmentFormState: EquipmentFormState = {
  name: "",
  serialNumber: "",
  equipmentType: "",
};
function normalizeEquipment(payload: unknown): EquipmentItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.equipmentId === "number"
        ? candidate.equipmentId
        : null;

  if (rawId === null) {
    return null;
  }

  const name = typeof candidate.name === "string" ? candidate.name : "";

  const serialNumber =
    typeof candidate.serialNumber === "string"
      ? candidate.serialNumber
      : typeof candidate.code === "string"
        ? candidate.code
        : "";

  const equipmentType =
    typeof candidate.equipmentType === "string"
      ? candidate.equipmentType
      : typeof candidate.type === "string"
        ? candidate.type
        : typeof candidate.category === "string"
          ? candidate.category
          : "";

  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  if (!name || !serialNumber) {
    return null;
  }

  return {
    id: rawId,
    name,
    serialNumber,
    equipmentType,
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

function parsePagedEquipments(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as EquipmentItem[], totalItems: 0 };
  }

  const candidate = payload as EquipmentsPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeEquipment)
    .filter((item): item is EquipmentItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function EquipmentsPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EquipmentStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedEquipment, setSelectedEquipment] =
    useState<EquipmentItem | null>(null);
  const [equipmentDetailMode, setEquipmentDetailMode] = useState<
    "hidden" | "create" | "edit"
  >("hidden");
  const [formState, setFormState] = useState<EquipmentFormState>(
    initialEquipmentFormState,
  );
  const [bulkUploading, setBulkUploading] = useState(false);

  const detailVisible = equipmentDetailMode !== "hidden";

  const equipmentColumns = useMemo<HubGridColumn<EquipmentItem>[]>(
    () => [
      {
        key: "Name",
        label: t("equipments.table.name"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "SerialNumber",
        label: t("equipments.table.serialNumber"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Type",
        label: t("equipments.table.type"),
        cellClassName: "text-foreground dark:text-foreground",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      {
        key: "compact" as RowDensity,
        label: t("equipments.grid.density.slow"),
      },
      {
        key: "medium" as RowDensity,
        label: t("equipments.grid.density.medium"),
      },
      {
        key: "expanded" as RowDensity,
        label: t("equipments.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetForm = useCallback(() => {
    setFormState(initialEquipmentFormState);
  }, []);

  const hideDetail = useCallback(() => {
    setSelectedEquipment(null);
    setEquipmentDetailMode("hidden");
    resetForm();
  }, [resetForm]);

  const showCreateForm = useCallback(() => {
    setSelectedEquipment(null);
    setEquipmentDetailMode("create");
    resetForm();
  }, [resetForm]);

  const handleEquipmentSelection = useCallback((equipment: EquipmentItem) => {
    setSelectedEquipment(equipment);
    setFormState({
      name: equipment.name,
      serialNumber: equipment.serialNumber,
      equipmentType: equipment.equipmentType,
    });
    setEquipmentDetailMode("edit");
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

  const handleStatusFilterChange = useCallback(
    (value: string) => {
      setStatusFilter(value as EquipmentStatusFilter);
      setPage(1);
    },
    [],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadEquipments = useCallback(async () => {
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
        `/api/gerit/v1/equipments/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as EquipmentsPagedResponse;

      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("equipments.errors.load")),
        );
      }

      const parsed = parsePagedEquipments(payload);
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

      setEquipments(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(normalizedPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("equipments.errors.load");
      setEquipments([]);
      setTotalItems(0);
      toast({
        title: t("equipments.toasts.errorTitle"),
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
    async (equipment: EquipmentItem) => {
      const action = equipment.isActive ? "deactivate" : "activate";

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/equipments/${equipment.id}/${action}`,
          {
            method: "PATCH",
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("equipments.errors.status")),
          );
        }

        toast({
          title: t("equipments.toasts.successTitle"),
          description: equipment.isActive
            ? t("equipments.toasts.deactivated")
            : t("equipments.toasts.activated"),
        });

        void loadEquipments();
      } catch (error) {
        toast({
          title: t("equipments.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("equipments.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadEquipments, t, toast],
  );

  const handleDeleteEquipment = useCallback(
    async (equipment: EquipmentItem) => {
      const confirmed = window.confirm(
        t("equipments.confirm.delete", { name: equipment.name }),
      );

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/equipments/${equipment.id}`,
          {
            method: "DELETE",
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("equipments.errors.delete")),
          );
        }

        toast({
          title: t("equipments.toasts.successTitle"),
          description: t("equipments.toasts.deleted"),
        });

        hideDetail();
        await loadEquipments();
      } catch (error) {
        toast({
          title: t("equipments.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("equipments.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadEquipments, t, toast],
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
          "/api/gerit/v1/equipments/bulk-upload",
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
              t("equipments.bulk.upload.error", {
                resource: t("equipments.title"),
              }),
            ),
          );
        }

        toast({
          title: t("equipments.toasts.successTitle"),
          description: t("equipments.bulk.upload.success", {
            resource: t("equipments.title"),
          }),
        });

        await loadEquipments();
      } catch (error) {
        toast({
          title: t("equipments.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("equipments.bulk.upload.error", {
                  resource: t("equipments.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [bulkUploading, fetchWithAuth, loadEquipments, t, toast],
  );

  const equipmentRowCells = useCallback(
    (equipment: EquipmentItem) => [
      equipment.name,
      equipment.serialNumber,
      equipment.equipmentType || "-",
    ],
    [],
  );

  const renderEquipmentStatus = useCallback(
    (equipment: EquipmentItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          equipment.isActive
            ? "text-foreground dark:text-foreground"
            : "text-foreground dark:text-foreground",
        )}
      >
        {equipment.isActive
          ? t("equipments.status.active")
          : t("equipments.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderEquipmentActions = useCallback(
    (equipment: EquipmentItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleEquipmentSelection(equipment);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={t("equipments.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(equipment);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={
            equipment.isActive
              ? t("equipments.actions.deactivate")
              : t("equipments.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteEquipment(equipment);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-destructive"
          title={t("equipments.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
      </div>
    ),
    [handleEquipmentSelection, handleDeleteEquipment, handleToggleStatus, t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
          {t("equipments.bulk.upload.label")}
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
          {t("equipments.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
  );

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadEquipments();
    }
  }, [isAuthenticated, isHydrating, loadEquipments]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formState.name.trim();
    const serialNumber = formState.serialNumber.trim();
    const equipmentType = formState.equipmentType.trim();

    if (!name || !serialNumber) {
      toast({
        title: t("equipments.toasts.validationTitle"),
        description: t("equipments.validation.required"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name,
        serialNumber,
        equipmentType: equipmentType.length > 0 ? equipmentType : null,
      };

      const isEditing = selectedEquipment !== null;
      const endpoint = isEditing
        ? `/api/gerit/v1/equipments/${selectedEquipment?.id ?? ""}`
        : "/api/gerit/v1/equipments";

      const response = await fetchWithAuth(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response
        .json()
        .catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(responsePayload, t("equipments.errors.save")),
        );
      }

      const normalized = normalizeEquipment(responsePayload);

      if (normalized) {
        setSelectedEquipment(normalized);
        setFormState({
          name: normalized.name,
          serialNumber: normalized.serialNumber,
          equipmentType: normalized.equipmentType,
        });
        setEquipmentDetailMode("edit");
      }

      toast({
        title: t("equipments.toasts.successTitle"),
        description: isEditing
          ? t("equipments.toasts.updated")
          : t("equipments.toasts.created"),
      });
      await loadEquipments();
    } catch (error) {
      toast({
        title: t("equipments.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("equipments.errors.save"),
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
                  {t("equipments.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {t("equipments.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("equipments.title")}
            subtitle={t("equipments.subtitle")}
            columns={equipmentColumns}
            items={equipments}
            renderRowCells={equipmentRowCells}
            renderStatus={renderEquipmentStatus}
            statusColumnLabel={t("equipments.table.status")}
            renderActions={renderEquipmentActions}
            actionsColumnLabel={t("equipments.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("equipments.filters.active") },
              { value: "inactive", label: t("equipments.filters.inactive") },
              { value: "all", label: t("equipments.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("equipments.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("equipments.filters.search")}
            loading={loading}
            loadingText={t("equipments.loading")}
            emptyText={t("equipments.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("equipments.pagination.previous")}
            paginationNextLabel={t("equipments.pagination.next")}
            paginationPageLabel={t("equipments.pagination.page")}
            paginationPerPageLabel={t("equipments.pagination.perPage")}
            selectedRowKey={selectedEquipment?.id}
            getRowKey={(equipment) => equipment.id}
            onRowClick={handleEquipmentSelection}
          />

          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-border bg-card p-5 dark:border-border dark:bg-card">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                      {selectedEquipment
                        ? t("equipments.form.editTitle")
                        : t("equipments.form.newTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                      {t("equipments.form.subtitle")}
                    </p>
                  </div>
                </div>

                <form
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                  onSubmit={handleSubmit}
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground dark:text-muted-foreground">
                      {t("equipments.form.name")}
                    </span>
                    <input
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-sm border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring dark:border-border dark:bg-card dark:text-foreground"
                      placeholder={t("equipments.form.name")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground dark:text-muted-foreground">
                      {t("equipments.form.serialNumber")}
                    </span>
                    <input
                      value={formState.serialNumber}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          serialNumber: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-sm border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring dark:border-border dark:bg-card dark:text-foreground"
                      placeholder={t("equipments.form.serialNumber")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground dark:text-muted-foreground">
                      {t("equipments.form.type")}
                    </span>
                    <input
                      value={formState.equipmentType}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          equipmentType: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-sm border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring dark:border-border dark:bg-card dark:text-foreground"
                      placeholder={t("equipments.form.type")}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={hideDetail}
                      disabled={submitting}
                      className="h-11 rounded-sm border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground"
                    >
                      {t("equipments.actions.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("equipments.actions.save")}
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
