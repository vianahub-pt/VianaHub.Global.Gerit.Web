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

interface RoleItem {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

interface RolesPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface RoleFormState {
  name: string;
  description: string;
}

type SortColumn = "Name" | "Role" | "TaxNumber";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type RoleStatusFilter = "active" | "inactive" | "all";
type RoleDetailMode = "hidden" | "create" | "edit";

const initialRoleFormState: RoleFormState = {
  name: "",
  description: "",
};

function normalizeRole(payload: unknown): RoleItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.roleId === "number"
        ? candidate.roleId
        : null;

  if (rawId === null) {
    return null;
  }

  const nameValue = typeof candidate.name === "string" ? candidate.name : "";
  const descriptionValue =
    typeof candidate.description === "string" ? candidate.description : "";
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  if (!nameValue) {
    return null;
  }

  return {
    id: rawId,
    name: nameValue,
    description: descriptionValue,
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

function parsePagedRoles(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as RoleItem[], totalItems: 0 };
  }

  const candidate = payload as RolesPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeRole)
    .filter((item): item is RoleItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function RolesPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoleStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const [roleDetailMode, setRoleDetailMode] =
    useState<RoleDetailMode>("hidden");
  const [formState, setFormState] =
    useState<RoleFormState>(initialRoleFormState);
  const [bulkUploading, setBulkUploading] = useState(false);

  const detailVisible = roleDetailMode !== "hidden";

  const roleColumns = useMemo<HubGridColumn<RoleItem>[]>(
    () => [
      {
        key: "Name",
        label: t("roles.table.name"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Email",
        label: t("roles.table.description"),
        cellClassName: "text-foreground dark:text-foreground",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("roles.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("roles.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("roles.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetForm = useCallback(() => {
    setFormState(initialRoleFormState);
  }, []);

  const hideDetail = useCallback(() => {
    setSelectedRole(null);
    setRoleDetailMode("hidden");
    resetForm();
  }, [resetForm]);

  const showCreateForm = useCallback(() => {
    setSelectedRole(null);
    setRoleDetailMode("create");
    resetForm();
  }, [resetForm]);

  const handleRoleSelection = useCallback((role: RoleItem) => {
    setSelectedRole(role);
    setFormState({
      name: role.name,
      description: role.description,
    });
    setRoleDetailMode("edit");
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
    setStatusFilter(value as RoleStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadRoles = useCallback(async () => {
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
        `/api/gerit/v1/roles/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as RolesPagedResponse;

      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("roles.errors.load")));
      }

      const parsed = parsePagedRoles(payload);
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

      setRoles(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(normalizedPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("roles.errors.load");
      setRoles([]);
      setTotalItems(0);
      toast({
        title: t("roles.toasts.errorTitle"),
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
    async (role: RoleItem) => {
      const action = role.isActive ? "deactivate" : "activate";

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/roles/${role.id}/${action}`,
          {
            method: "PATCH",
          },
        );

        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("roles.errors.status")),
          );
        }

        toast({
          title: t("roles.toasts.successTitle"),
          description: role.isActive
            ? t("roles.toasts.deactivated")
            : t("roles.toasts.activated"),
        });

        void loadRoles();
      } catch (error) {
        toast({
          title: t("roles.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("roles.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadRoles, t, toast],
  );

  const handleDeleteRole = useCallback(
    async (role: RoleItem) => {
      const confirmed = window.confirm(
        t("roles.confirm.delete", { name: role.name }),
      );

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(`/api/gerit/v1/roles/${role.id}`, {
          method: "DELETE",
        });

        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("roles.errors.delete")),
          );
        }

        toast({
          title: t("roles.toasts.successTitle"),
          description: t("roles.toasts.deleted"),
        });

        hideDetail();
        await loadRoles();
      } catch (error) {
        toast({
          title: t("roles.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("roles.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadRoles, t, toast],
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
          "/api/gerit/v1/roles/bulk-upload",
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
              t("roles.bulk.upload.error", {
                resource: t("roles.title"),
              }),
            ),
          );
        }

        toast({
          title: t("roles.toasts.successTitle"),
          description: t("roles.bulk.upload.success", {
            resource: t("roles.title"),
          }),
        });

        await loadRoles();
      } catch (error) {
        toast({
          title: t("roles.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("roles.bulk.upload.error", {
                  resource: t("roles.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [bulkUploading, fetchWithAuth, loadRoles, t, toast],
  );

  const roleRowCells = useCallback(
    (role: RoleItem) => [role.name, role.description || "-"],
    [],
  );

  const renderRoleStatus = useCallback(
    (role: RoleItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          role.isActive
            ? "text-foreground dark:text-foreground"
            : "text-foreground dark:text-foreground",
        )}
      >
        {role.isActive ? t("roles.status.active") : t("roles.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderRoleActions = useCallback(
    (role: RoleItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRoleSelection(role);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={t("roles.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(role);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={
            role.isActive
              ? t("roles.actions.deactivate")
              : t("roles.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteRole(role);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-destructive"
          title={t("roles.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
      </div>
    ),
    [handleRoleSelection, handleDeleteRole, handleToggleStatus, t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
          {t("roles.bulk.upload.label")}
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
          {t("roles.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
  );

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadRoles();
    }
  }, [isAuthenticated, isHydrating, loadRoles]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formState.name.trim();
    const description = formState.description.trim();

    if (!name) {
      toast({
        title: t("roles.toasts.validationTitle"),
        description: t("roles.validation.required"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name,
        description: description.length > 0 ? description : null,
      };

      const isEditing = selectedRole !== null;
      const endpoint = isEditing
        ? `/api/gerit/v1/roles/${selectedRole?.id ?? ""}`
        : "/api/gerit/v1/roles";

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
          normalizeErrorMessage(responsePayload, t("roles.errors.save")),
        );
      }

      const normalized = normalizeRole(responsePayload);

      if (normalized) {
        setSelectedRole(normalized);
        setFormState({
          name: normalized.name,
          description: normalized.description,
        });
        setRoleDetailMode("edit");
      }

      toast({
        title: t("roles.toasts.successTitle"),
        description: isEditing
          ? t("roles.toasts.updated")
          : t("roles.toasts.created"),
      });
      await loadRoles();
    } catch (error) {
      toast({
        title: t("roles.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("roles.errors.save"),
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
                  {t("roles.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-foreground dark:text-muted-foreground">
                  {t("roles.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("roles.title")}
            subtitle={t("roles.subtitle")}
            columns={roleColumns}
            items={roles}
            renderRowCells={roleRowCells}
            renderStatus={renderRoleStatus}
            statusColumnLabel={t("roles.table.status")}
            renderActions={renderRoleActions}
            actionsColumnLabel={t("roles.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("roles.filters.active") },
              { value: "inactive", label: t("roles.filters.inactive") },
              { value: "all", label: t("roles.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("roles.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("roles.filters.search")}
            loading={loading}
            loadingText={t("roles.loading")}
            emptyText={t("roles.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("roles.pagination.previous")}
            paginationNextLabel={t("roles.pagination.next")}
            paginationPageLabel={t("roles.pagination.page")}
            paginationPerPageLabel={t("roles.pagination.perPage")}
            selectedRowKey={selectedRole?.id}
            getRowKey={(role) => role.id}
            onRowClick={handleRoleSelection}
          />
          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-border bg-surface p-5 dark:border-border dark:bg-surface">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                      {selectedRole
                        ? t("roles.form.editTitle")
                        : t("roles.form.newTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                      {t("roles.form.subtitle")}
                    </p>
                  </div>
                </div>

                <form
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                  onSubmit={handleSubmit}
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
                      {t("roles.form.name")}
                    </span>
                    <Input
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder={t("roles.form.name")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-muted-foreground dark:text-muted-foreground">
                      {t("roles.form.description")}
                    </span>
                    <textarea
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={3}
                      className="h-24 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring dark:border-border dark:bg-card dark:text-foreground"
                      placeholder={t("roles.form.description")}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={hideDetail}
                      disabled={submitting}
                      className="h-11 rounded-sm border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground"
                    >
                      {t("roles.actions.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("roles.actions.save")}
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
