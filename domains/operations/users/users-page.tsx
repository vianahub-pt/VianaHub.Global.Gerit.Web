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
import {
  useIdentityPreferences,
  type DateFormatPreference,
  type PreferenceLocale,
  type TimeFormatPreference,
} from "@/domains/identity/preferences";

interface UserItem {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  lastAccessAt: string;
  isActive: boolean;
}

interface UsersPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface UserFormState {
  name: string;
  email: string;
  phoneNumber: string;
  lastAccessAt: string;
}

type SortColumn = "Name" | "Role" | "TaxNumber";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type UserStatusFilter = "active" | "inactive" | "all";
type UserDetailMode = "hidden" | "create" | "edit";

const initialUserFormState: UserFormState = {
  name: "",
  email: "",
  phoneNumber: "",
  lastAccessAt: "",
};

function normalizeUser(payload: unknown): UserItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.userId === "number"
        ? candidate.userId
        : null;

  if (rawId === null) {
    return null;
  }

  const nameValue = typeof candidate.name === "string" ? candidate.name : "";
  const emailValue = typeof candidate.email === "string" ? candidate.email : "";
  const phoneNumberValue =
    typeof candidate.phoneNumber === "string" ? candidate.phoneNumber : "";
  const lastAccessAtValue =
    typeof candidate.lastAccessAt === "string" ? candidate.lastAccessAt : "";

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
    email: emailValue,
    phoneNumber: phoneNumberValue,
    lastAccessAt: lastAccessAtValue,
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

function parsePagedUsers(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as UserItem[], totalItems: 0 };
  }

  const candidate = payload as UsersPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeUser)
    .filter((item): item is UserItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

function formatLastAccess(
  value: string,
  options: {
    locale: PreferenceLocale;
    timezone: string;
    dateFormat: DateFormatPreference;
    timeFormat: TimeFormatPreference;
  },
): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const resolvedTimeZone = options.timezone || "UTC";

  try {
    const formatter = new Intl.DateTimeFormat(options.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: options.timeFormat === "12h",
      timeZone: resolvedTimeZone,
    });
    const parts = formatter.formatToParts(parsed);
    const partValues: Record<string, string> = {};

    parts.forEach((part) => {
      if (part.type !== "literal") {
        partValues[part.type] = part.value;
      }
    });

    const day = partValues.day ?? "";
    const month = partValues.month ?? "";
    const year = partValues.year ?? "";
    const hour = partValues.hour ?? "";
    const minute = partValues.minute ?? "";
    const dayPeriod = partValues.dayPeriod ?? "";

    if (!day || !month || !year || !hour || !minute) {
      return "-";
    }

    let formattedDate = "";
    if (options.dateFormat === "MM/DD/YYYY") {
      formattedDate = `${month}/${day}/${year}`;
    } else if (options.dateFormat === "DD/MM/YYYY") {
      formattedDate = `${day}/${month}/${year}`;
    } else {
      formattedDate = `${day}-${month}-${year}`;
    }

    let formattedTime = `${hour}:${minute}`;
    if (options.timeFormat === "12h") {
      const period = dayPeriod || (Number(hour) >= 12 ? "PM" : "AM");
      formattedTime = `${hour}:${minute} ${period}`;
    }

    return `${formattedDate} ${formattedTime}`;
  } catch {
    return "-";
  }
}

export function UsersPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const preferences = useIdentityPreferences();
  const {
    dateFormat: userDateFormat,
    timeFormat: userTimeFormat,
    timezone: userTimeZone,
    locale: userLocale,
  } = preferences.state;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [userDetailMode, setUserDetailMode] =
    useState<UserDetailMode>("hidden");
  const [formState, setFormState] =
    useState<UserFormState>(initialUserFormState);
  const [bulkUploading, setBulkUploading] = useState(false);

  const detailVisible = userDetailMode !== "hidden";

  const userColumns = useMemo<HubGridColumn<UserItem>[]>(
    () => [
      {
        key: "Name",
        label: t("users.table.name"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Email",
        label: t("users.table.email"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Phone",
        label: t("users.table.phone"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "LastAccessAt",
        label: t("users.table.lastAccessAt"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("users.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("users.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("users.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetForm = useCallback(() => {
    setFormState(initialUserFormState);
  }, []);

  const hideDetail = useCallback(() => {
    setSelectedUser(null);
    setUserDetailMode("hidden");
    resetForm();
  }, [resetForm]);

  const showCreateForm = useCallback(() => {
    setSelectedUser(null);
    setUserDetailMode("create");
    resetForm();
  }, [resetForm]);

  const handleUserSelection = useCallback((user: UserItem) => {
    setSelectedUser(user);
    setFormState({
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      lastAccessAt: user.lastAccessAt,
    });
    setUserDetailMode("edit");
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
    setStatusFilter(value as UserStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadUsers = useCallback(async () => {
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
        `/api/gerit/v1/users/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as UsersPagedResponse;

      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("users.errors.load")));
      }

      const parsed = parsePagedUsers(payload);
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

      setUsers(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(normalizedPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("users.errors.load");
      setUsers([]);
      setTotalItems(0);
      toast({
        title: t("users.toasts.errorTitle"),
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
    async (user: UserItem) => {
      const action = user.isActive ? "deactivate" : "activate";

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/users/${user.id}/${action}`,
          {
            method: "PATCH",
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("users.errors.status")),
          );
        }

        toast({
          title: t("users.toasts.successTitle"),
          description: user.isActive
            ? t("users.toasts.deactivated")
            : t("users.toasts.activated"),
        });

        void loadUsers();
      } catch (error) {
        toast({
          title: t("users.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("users.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadUsers, t, toast],
  );

  const handleDeleteUser = useCallback(
    async (user: UserItem) => {
      const confirmed = window.confirm(
        t("users.confirm.delete", { name: user.name }),
      );

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(`/api/gerit/v1/users/${user.id}`, {
          method: "DELETE",
        });

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("users.errors.delete")),
          );
        }

        toast({
          title: t("users.toasts.successTitle"),
          description: t("users.toasts.deleted"),
        });

        hideDetail();
        await loadUsers();
      } catch (error) {
        toast({
          title: t("users.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("users.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadUsers, t, toast],
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
          "/api/gerit/v1/users/bulk-upload",
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
              t("users.bulk.upload.error", {
                resource: t("users.title"),
              }),
            ),
          );
        }

        toast({
          title: t("users.toasts.successTitle"),
          description: t("users.bulk.upload.success", {
            resource: t("users.title"),
          }),
        });

        await loadUsers();
      } catch (error) {
        toast({
          title: t("users.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("users.bulk.upload.error", {
                  resource: t("users.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [bulkUploading, fetchWithAuth, loadUsers, t, toast],
  );

  const userRowCells = useCallback(
    (user: UserItem) => [
      user.name,
      user.email,
      user.phoneNumber || "-",
      formatLastAccess(user.lastAccessAt, {
        locale: userLocale,
        timezone: userTimeZone,
        dateFormat: userDateFormat,
        timeFormat: userTimeFormat,
      }),
    ],
    [userDateFormat, userTimeFormat, userTimeZone, userLocale],
  );

  const renderUserStatus = useCallback(
    (user: UserItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          user.isActive
            ? "text-[#3E515B] dark:text-[#84a0c0]"
            : "text-[#3E515B] dark:text-[#84a0c0]",
        )}
      >
        {user.isActive ? t("users.status.active") : t("users.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderUserActions = useCallback(
    (user: UserItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleUserSelection(user);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#0cbbf6] dark:border-[#000000] dark:text-[#9eb1bc] dark:hover:text-white"
          title={t("users.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(user);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#0cbbf6] dark:border-[#000000] dark:text-[#9eb1bc] dark:hover:text-white"
          title={
            user.isActive
              ? t("users.actions.deactivate")
              : t("users.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteUser(user);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#ffd7e1]"
          title={t("users.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
      </div>
    ),
    [handleUserSelection, handleDeleteUser, handleToggleStatus, t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-[#d9dee2] bg-white px-4 text-sm font-medium text-[#1f2f3f] transition-colors hover:border-[#b4c2d9] hover:bg-[#f0f3fb] dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#c9d8df] dark:hover:bg-[#2c404c]">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#08aee5]" />
          ) : null}
          {t("users.bulk.upload.label")}
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
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-[#08aee5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0cbbf6]"
        >
          <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
          {t("users.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
  );

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadUsers();
    }
  }, [isAuthenticated, isHydrating, loadUsers]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formState.name.trim();
    const email = formState.email.trim();
    const phoneNumber = formState.phoneNumber.trim();

    if (!name) {
      toast({
        title: t("users.toasts.validationTitle"),
        description: t("users.validation.required"),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name,
        email: email.length > 0 ? email : null,
        phoneNumber: phoneNumber.length > 0 ? phoneNumber : null,
      };

      const isEditing = selectedUser !== null;
      const endpoint = isEditing
        ? `/api/gerit/v1/users/${selectedUser?.id ?? ""}`
        : "/api/gerit/v1/users";

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
          normalizeErrorMessage(responsePayload, t("users.errors.save")),
        );
      }

      const normalized = normalizeUser(responsePayload);

      if (normalized) {
        setSelectedUser(normalized);
        setFormState({
          name: normalized.name,
          email: normalized.email,
          phoneNumber: normalized.phoneNumber,
          lastAccessAt: normalized.lastAccessAt,
        });
        setUserDetailMode("edit");
      }

      toast({
        title: t("users.toasts.successTitle"),
        description: isEditing
          ? t("users.toasts.updated")
          : t("users.toasts.created"),
      });
      await loadUsers();
    } catch (error) {
      toast({
        title: t("users.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("users.errors.save"),
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
        <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-[#f5f6f8] px-4 py-4 sm:px-6 dark:bg-[#1f2f3e]">
          <div className="mb-5 overflow-hidden rounded-sm border border-[#dfe6ed]/80 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-[#142435] dark:bg-[#0d1c29] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#dfe6ed]/70 bg-[#f4f6fb] px-6 py-5 dark:border-[#162235] dark:bg-[#0d1c29]">
              <div>
                <h1 className="text-3xl font-semibold tracking-[0.03em] text-[#0f172a] dark:text-white">
                  {t("users.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-[#000000] dark:text-[#84a0c0]">
                  {t("users.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("users.title")}
            subtitle={t("users.subtitle")}
            columns={userColumns}
            items={users}
            renderRowCells={userRowCells}
            renderStatus={renderUserStatus}
            statusColumnLabel={t("users.table.status")}
            renderActions={renderUserActions}
            actionsColumnLabel={t("users.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("users.filters.active") },
              { value: "inactive", label: t("users.filters.inactive") },
              { value: "all", label: t("users.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("users.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("users.filters.search")}
            loading={loading}
            loadingText={t("users.loading")}
            emptyText={t("users.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("users.pagination.previous")}
            paginationNextLabel={t("users.pagination.next")}
            paginationPageLabel={t("users.pagination.page")}
            paginationPerPageLabel={t("users.pagination.perPage")}
            selectedRowKey={selectedUser?.id}
            getRowKey={(user) => user.id}
            onRowClick={handleUserSelection}
          />
          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-[#d9dee2] bg-white p-5 dark:border-[#000000] dark:bg-[#1f2f3e]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a] dark:text-[#d6e6ee]">
                      {selectedUser
                        ? t("users.form.editTitle")
                        : t("users.form.newTitle")}
                    </h2>
                    <p className="text-sm text-[#4f5c6a] dark:text-[#9eb1bc]">
                      {t("users.form.subtitle")}
                    </p>
                  </div>
                </div>

                <form
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                  onSubmit={handleSubmit}
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8da7b4] dark:text-[#7d9aa8]">
                      {t("users.form.name")}
                    </span>
                    <input
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-sm border border-[#c9d2e0] bg-white px-3 text-sm text-[#1f2f3f] outline-none placeholder:text-[#6b7280] focus:border-[#11b7ff] dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#d6e6ee]"
                      placeholder={t("users.form.name")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8da7b4] dark:text-[#7d9aa8]">
                      {t("users.form.email")}
                    </span>
                    <textarea
                      value={formState.email}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      rows={3}
                      className="h-24 w-full rounded-sm border border-[#c9d2e0] bg-white px-3 py-2 text-sm text-[#1f2f3f] outline-none placeholder:text-[#6b7280] focus:border-[#11b7ff] dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#d6e6ee]"
                      placeholder={t("users.form.email")}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={hideDetail}
                      disabled={submitting}
                      className="h-11 rounded-sm border border-[#d9dee2] bg-white px-5 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#0cbbf6] hover:text-[#0cbbf6] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#c4d6de] dark:hover:text-white"
                    >
                      {t("users.actions.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 rounded-sm bg-[#08aee5] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0cbbf6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("users.actions.save")}
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
