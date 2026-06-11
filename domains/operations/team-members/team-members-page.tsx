"use client";

import clsx from "clsx";
import { Power, Loader2, SquarePen, Trash2, UserRoundPlus } from "lucide-react";
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

interface TeamMemberItem {
  id: number;
  name: string;
  functionName: string | null;
  taxNumber: string | null;
  isActive: boolean;
}

interface TeamMembersPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface TeamMemberFormState {
  name: string;
  functionName: string;
  taxNumber: string;
}

type SortColumn = "Name" | "Function" | "TaxNumber";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type TeamMemberStatusFilter = "active" | "inactive" | "all";
type TeamMemberDetailMode = "hidden" | "create" | "edit";

const initialTeamMemberFormState: TeamMemberFormState = {
  name: "",
  functionName: "",
  taxNumber: "",
};

function normalizeTeamMember(payload: unknown): TeamMemberItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.teamMemberId === "number"
        ? candidate.teamMemberId
        : null;

  if (rawId === null) {
    return null;
  }

  const nameValue =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.fullName === "string"
        ? candidate.fullName
        : "";

  if (!nameValue) {
    return null;
  }

  const functionValue =
    typeof candidate.function === "string"
      ? candidate.function
      : typeof candidate.role === "string"
        ? candidate.role
        : typeof candidate.position === "string"
          ? candidate.position
          : null;

  const taxNumberValue =
    typeof candidate.taxNumber === "string"
      ? candidate.taxNumber
      : typeof candidate.identityNumber === "string"
        ? candidate.identityNumber
        : typeof candidate.documentNumber === "string"
          ? candidate.documentNumber
          : null;

  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  return {
    id: rawId,
    name: nameValue,
    functionName: functionValue,
    taxNumber: taxNumberValue,
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

function parsePagedTeamMembers(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as TeamMemberItem[], totalItems: 0 };
  }

  const candidate = payload as TeamMembersPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeTeamMember)
    .filter((item): item is TeamMemberItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function TeamMembersPage() {
  const { fetchWithAuth, isHydrating, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<TeamMemberStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] =
    useState<TeamMemberItem | null>(null);
  const [formState, setFormState] = useState<TeamMemberFormState>(
    initialTeamMemberFormState,
  );
  const [detailMode, setDetailMode] = useState<TeamMemberDetailMode>("hidden");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const detailVisible = detailMode !== "hidden";
  const isEditing = detailMode === "edit";

  const teamMemberColumns = useMemo<HubGridColumn<TeamMemberItem>[]>(
    () => [
      {
        key: "Name",
        label: t("teamMembers.table.name"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "Function",
        label: t("teamMembers.table.function"),
        cellClassName: "text-foreground dark:text-foreground",
      },
      {
        key: "TaxNumber",
        label: t("teamMembers.table.taxNumber"),
        cellClassName: "text-foreground dark:text-foreground",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      {
        key: "compact" as RowDensity,
        label: t("teamMembers.grid.density.slow"),
      },
      {
        key: "medium" as RowDensity,
        label: t("teamMembers.grid.density.medium"),
      },
      {
        key: "expanded" as RowDensity,
        label: t("teamMembers.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetFormState = useCallback(() => {
    setFormState(initialTeamMemberFormState);
  }, []);

  const resetDetailState = useCallback(() => {
    setSelectedTeamMember(null);
    resetFormState();
  }, [resetFormState]);

  const hideDetail = useCallback(() => {
    resetDetailState();
    setDetailMode("hidden");
  }, [resetDetailState]);

  const showCreateForm = useCallback(() => {
    resetDetailState();
    setDetailMode("create");
  }, [resetDetailState]);

  const handleTeamMemberSelection = useCallback((member: TeamMemberItem) => {
    setSelectedTeamMember(member);
    setDetailMode("edit");
    setFormState({
      name: member.name,
      functionName: member.functionName ?? "",
      taxNumber: member.taxNumber ?? "",
    });
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
      setStatusFilter(value as TeamMemberStatusFilter);
      setPage(1);
    },
    [],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadTeamMembers = useCallback(async () => {
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
        `/api/gerit/v1/team-members/paged?${query.toString()}`,
        { method: "GET" },
      );

      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as TeamMembersPagedResponse;

      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("teamMembers.errors.load")),
        );
      }

      const parsed = parsePagedTeamMembers(payload);
      const serverPageNumber =
        typeof candidate.pageNumber === "number" ? candidate.pageNumber : page;
      const serverPageSize: PageSizeOption =
        (PAGE_SIZE_OPTIONS as readonly number[]).includes(typeof candidate.pageSize === "number" ? candidate.pageSize : -1)
          ? (candidate.pageSize as PageSizeOption)
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
              Math.ceil(serverTotalItems / Math.max(1, serverPageSize)),
            );

      setTeamMembers(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(serverPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("teamMembers.errors.load");
      setTeamMembers([]);
      setTotalItems(0);
      setTotalPagesFromServer(1);
      setPage(1);
      toast({
        title: t("teamMembers.toasts.errorTitle"),
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
      void loadTeamMembers();
    }
  }, [isAuthenticated, isHydrating, loadTeamMembers]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const name = formState.name.trim();
      const functionName = formState.functionName.trim();
      const taxNumber = formState.taxNumber.trim();

      if (!name || !functionName) {
        toast({
          title: t("teamMembers.toasts.validationTitle"),
          description: t("teamMembers.validation.required"),
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);

      try {
        const payload = {
          name,
          function: functionName,
          taxNumber: taxNumber.length > 0 ? taxNumber : null,
        } as Record<string, unknown>;

        const isEditing = selectedTeamMember !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/team-members/${selectedTeamMember?.id}`
          : "/api/gerit/v1/team-members";
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
            normalizeErrorMessage(
              responsePayload,
              t("teamMembers.errors.save"),
            ),
          );
        }

        const normalized = normalizeTeamMember(responsePayload);

        if (normalized) {
          setSelectedTeamMember(normalized);
          setFormState({
            name: normalized.name,
            functionName: normalized.functionName ?? "",
            taxNumber: normalized.taxNumber ?? "",
          });
          setDetailMode("edit");
        }

        toast({
          title: t("teamMembers.toasts.successTitle"),
          description: isEditing
            ? t("teamMembers.toasts.updated")
            : t("teamMembers.toasts.created"),
        });
        await loadTeamMembers();
      } catch (error) {
        toast({
          title: t("teamMembers.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("teamMembers.errors.save"),
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [fetchWithAuth, formState, loadTeamMembers, selectedTeamMember, t, toast],
  );

  const handleToggleStatus = useCallback(
    async (member: TeamMemberItem) => {
      try {
        const endpoint = member.isActive
          ? `/api/gerit/v1/team-members/${member.id}/deactivate`
          : `/api/gerit/v1/team-members/${member.id}/activate`;

        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              responsePayload,
              t("teamMembers.errors.status"),
            ),
          );
        }

        toast({
          title: t("teamMembers.toasts.successTitle"),
          description: member.isActive
            ? t("teamMembers.toasts.deactivated")
            : t("teamMembers.toasts.activated"),
        });
        await loadTeamMembers();
      } catch (error) {
        toast({
          title: t("teamMembers.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("teamMembers.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadTeamMembers, t, toast],
  );

  const handleDeleteTeamMember = useCallback(
    async (member: TeamMemberItem) => {
      const confirmed = window.confirm(
        t("teamMembers.confirm.delete", { name: member.name }),
      );
      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/team-members/${member.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              responsePayload,
              t("teamMembers.errors.delete"),
            ),
          );
        }

        toast({
          title: t("teamMembers.toasts.successTitle"),
          description: t("teamMembers.toasts.deleted"),
        });
        if (selectedTeamMember?.id === member.id) {
          hideDetail();
        }
        await loadTeamMembers();
      } catch (error) {
        toast({
          title: t("teamMembers.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("teamMembers.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadTeamMembers, selectedTeamMember, t, toast],
  );

  const disabledBulkUpload = bulkUploading;
  const handleBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || disabledBulkUpload) {
        return;
      }

      setBulkUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetchWithAuth(
          "/api/gerit/v1/team-members/bulk-upload",
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
              t("teamMembers.bulk.upload.error", {
                resource: t("teamMembers.title"),
              }),
            ),
          );
        }

        toast({
          title: t("teamMembers.toasts.successTitle"),
          description: t("teamMembers.bulk.upload.success", {
            resource: t("teamMembers.title"),
          }),
        });
        await loadTeamMembers();
      } catch (error) {
        toast({
          title: t("teamMembers.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("teamMembers.bulk.upload.error", {
                  resource: t("teamMembers.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [disabledBulkUpload, fetchWithAuth, loadTeamMembers, t, toast],
  );

  const teamMemberRowCells = useCallback(
    (member: TeamMemberItem) => [
      member.name,
      member.functionName ?? "-",
      member.taxNumber ?? "-",
    ],
    [],
  );

  const renderTeamMemberStatus = useCallback(
    (member: TeamMemberItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          member.isActive
            ? "text-foreground dark:text-foreground"
            : "text-foreground dark:text-foreground",
        )}
      >
        {member.isActive
          ? t("teamMembers.status.active")
          : t("teamMembers.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderTeamMemberActions = useCallback(
    (member: TeamMemberItem) => (
      <div className="flex justify-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleTeamMemberSelection(member);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={t("teamMembers.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(member);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-foreground"
          title={
            member.isActive
              ? t("teamMembers.actions.deactivate")
              : t("teamMembers.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteTeamMember(member);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:text-destructive"
          title={t("teamMembers.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-foreground dark:text-foreground" />
        </button>
      </div>
    ),
    [handleDeleteTeamMember, handleTeamMemberSelection, handleToggleStatus, t],
  );
  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-secondary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-secondary">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
          {t("teamMembers.bulk.upload.label")}
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
          {t("teamMembers.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
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
                  {t("teamMembers.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {t("teamMembers.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>
          <HubGrid
            title={t("teamMembers.title")}
            subtitle={t("teamMembers.subtitle")}
            columns={teamMemberColumns}
            items={teamMembers}
            renderRowCells={teamMemberRowCells}
            renderStatus={renderTeamMemberStatus}
            statusColumnLabel={t("teamMembers.table.status")}
            renderActions={renderTeamMemberActions}
            actionsColumnLabel={t("teamMembers.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("teamMembers.filters.active") },
              { value: "inactive", label: t("teamMembers.filters.inactive") },
              { value: "all", label: t("teamMembers.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("teamMembers.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("teamMembers.filters.search")}
            loading={loading}
            loadingText={t("teamMembers.loading")}
            emptyText={t("teamMembers.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("teamMembers.pagination.previous")}
            paginationNextLabel={t("teamMembers.pagination.next")}
            paginationPageLabel={t("teamMembers.pagination.page")}
            paginationPerPageLabel={t("teamMembers.pagination.perPage")}
            selectedRowKey={selectedTeamMember?.id}
            getRowKey={(member) => member.id}
            onRowClick={handleTeamMemberSelection}
          />

          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-border bg-card p-5 dark:border-border dark:bg-card">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                      {isEditing
                        ? t("teamMembers.form.editTitle")
                        : t("teamMembers.form.newTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                      {isEditing
                        ? t("teamMembers.form.subtitle")
                        : t("teamMembers.detail.helper")}
                    </p>
                  </div>
                  {selectedTeamMember ? (
                    <span
                      className={clsx(
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        selectedTeamMember.isActive
                          ? "text-foreground dark:text-foreground"
                          : "text-foreground dark:text-foreground",
                      )}
                    >
                      {selectedTeamMember.isActive
                        ? t("teamMembers.status.active")
                        : t("teamMembers.status.inactive")}
                    </span>
                  ) : null}
                </div>

                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => void handleSubmit(event)}
                >
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-muted-foreground dark:text-muted-foreground">
                        {t("teamMembers.form.name")}
                      </span>
                      <Input
                        value={formState.name}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-muted-foreground dark:text-muted-foreground">
                        {t("teamMembers.form.function")}
                      </span>
                      <Input
                        value={formState.functionName}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            functionName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-muted-foreground dark:text-muted-foreground">
                        {t("teamMembers.form.taxNumber")}
                      </span>
                      <Input
                        value={formState.taxNumber}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            taxNumber: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {detailVisible ? (
                      <button
                        type="button"
                        onClick={hideDetail}
                        className="h-10 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground"
                      >
                        {t("teamMembers.actions.cancel")}
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {t("teamMembers.actions.save")}
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
