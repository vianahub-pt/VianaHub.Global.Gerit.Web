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

interface TeamItem {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

interface TeamsPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

interface TeamFormState {
  name: string;
  description: string;
}

type SortColumn = "Name" | "Role" | "TaxNumber";
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
type TeamStatusFilter = "active" | "inactive" | "all";
type TeamDetailMode = "hidden" | "create" | "edit";

const initialTeamFormState: TeamFormState = {
  name: "",
  description: "",
};

function normalizeTeam(payload: unknown): TeamItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.teamId === "number"
        ? candidate.teamId
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

function parsePagedTeams(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as TeamItem[], totalItems: 0 };
  }

  const candidate = payload as TeamsPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];

  const items = rawItems
    .map(normalizeTeam)
    .filter((item): item is TeamItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function TeamsPage() {
  const { fetchWithAuth, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TeamStatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [sortBy, setSortBy] = useState<SortColumn>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPagesFromServer, setTotalPagesFromServer] = useState(1);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamItem | null>(null);
  const [teamDetailMode, setTeamDetailMode] =
    useState<TeamDetailMode>("hidden");
  const [formState, setFormState] =
    useState<TeamFormState>(initialTeamFormState);
  const [bulkUploading, setBulkUploading] = useState(false);

  const detailVisible = teamDetailMode !== "hidden";

  const teamColumns = useMemo<HubGridColumn<TeamItem>[]>(
    () => [
      {
        key: "Name",
        label: t("teams.table.name"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
      {
        key: "Description",
        label: t("teams.table.description"),
        cellClassName: "text-[#3E515B] dark:text-[#84a0c0]",
      },
    ],
    [t],
  );

  const densityOptions = useMemo(
    () => [
      { key: "compact" as RowDensity, label: t("teams.grid.density.slow") },
      { key: "medium" as RowDensity, label: t("teams.grid.density.medium") },
      {
        key: "expanded" as RowDensity,
        label: t("teams.grid.density.expanded"),
      },
    ],
    [t],
  );

  const resetForm = useCallback(() => {
    setFormState(initialTeamFormState);
  }, []);

  const hideDetail = useCallback(() => {
    setSelectedTeam(null);
    setTeamDetailMode("hidden");
    resetForm();
  }, [resetForm]);

  const showCreateForm = useCallback(() => {
    setSelectedTeam(null);
    setTeamDetailMode("create");
    resetForm();
  }, [resetForm]);

  const handleTeamSelection = useCallback((team: TeamItem) => {
    setSelectedTeam(team);
    setFormState({
      name: team.name,
      description: team.description,
    });
    setTeamDetailMode("edit");
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
    setStatusFilter(value as TeamStatusFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const loadTeams = useCallback(async () => {
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
        `/api/gerit/v1/teams/paged?${query.toString()}`,
        {
          method: "GET",
        },
      );

      const payload = (await response.json().catch(() => null)) as unknown;
      const candidate = payload as TeamsPagedResponse;

      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("teams.errors.load")));
      }

      const parsed = parsePagedTeams(payload);
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

      setTeams(parsed.items);
      setTotalItems(serverTotalItems);
      setTotalPagesFromServer(serverTotalPages);
      setPage(serverPageNumber);
      setPageSize(normalizedPageSize);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("teams.errors.load");
      setTeams([]);
      setTotalItems(0);
      toast({
        title: t("teams.toasts.errorTitle"),
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
    async (team: TeamItem) => {
      const action = team.isActive ? "deactivate" : "activate";

      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/teams/${team.id}/${action}`,
          {
            method: "PATCH",
          },
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("teams.errors.status")),
          );
        }

        toast({
          title: t("teams.toasts.successTitle"),
          description: team.isActive
            ? t("teams.toasts.deactivated")
            : t("teams.toasts.activated"),
        });

        void loadTeams();
      } catch (error) {
        toast({
          title: t("teams.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("teams.errors.status"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, loadTeams, t, toast],
  );

  const handleDeleteTeam = useCallback(
    async (team: TeamItem) => {
      const confirmed = window.confirm(
        t("teams.confirm.delete", { name: team.name }),
      );

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetchWithAuth(`/api/gerit/v1/teams/${team.id}`, {
          method: "DELETE",
        });

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(payload, t("teams.errors.delete")),
          );
        }

        toast({
          title: t("teams.toasts.successTitle"),
          description: t("teams.toasts.deleted"),
        });

        hideDetail();
        await loadTeams();
      } catch (error) {
        toast({
          title: t("teams.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("teams.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [fetchWithAuth, hideDetail, loadTeams, t, toast],
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
          "/api/gerit/v1/teams/bulk-upload",
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
              t("teams.bulk.upload.error", {
                resource: t("teams.title"),
              }),
            ),
          );
        }

        toast({
          title: t("teams.toasts.successTitle"),
          description: t("teams.bulk.upload.success", {
            resource: t("teams.title"),
          }),
        });

        await loadTeams();
      } catch (error) {
        toast({
          title: t("teams.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("teams.bulk.upload.error", {
                  resource: t("teams.title"),
                }),
          variant: "destructive",
        });
      } finally {
        setBulkUploading(false);
      }
    },
    [bulkUploading, fetchWithAuth, loadTeams, t, toast],
  );

  const teamRowCells = useCallback(
    (team: TeamItem) => [team.name, team.description || "-"],
    [],
  );

  const renderTeamStatus = useCallback(
    (team: TeamItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          team.isActive
            ? "text-[#3E515B] dark:text-[#84a0c0]"
            : "text-[#3E515B] dark:text-[#84a0c0]",
        )}
      >
        {team.isActive ? t("teams.status.active") : t("teams.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderTeamActions = useCallback(
    (team: TeamItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleTeamSelection(team);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#0cbbf6] dark:border-[#000000] dark:text-[#9eb1bc] dark:hover:text-white"
          title={t("teams.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleStatus(team);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#0cbbf6] dark:border-[#000000] dark:text-[#9eb1bc] dark:hover:text-white"
          title={
            team.isActive
              ? t("teams.actions.deactivate")
              : t("teams.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDeleteTeam(team);
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[#000000] dark:text-[#8EE0FB] transition-colors hover:text-[#ffd7e1]"
          title={t("teams.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
      </div>
    ),
    [handleTeamSelection, handleDeleteTeam, handleToggleStatus, t],
  );

  const gridToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-[#d9dee2] bg-white px-4 text-sm font-medium text-[#1f2f3f] transition-colors hover:border-[#b4c2d9] hover:bg-[#f0f3fb] dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#c9d8df] dark:hover:bg-[#2c404c]">
          {bulkUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#08aee5]" />
          ) : null}
          {t("teams.bulk.upload.label")}
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
          {t("teams.actions.add")}
        </button>
      </div>
    ),
    [bulkUploading, handleBulkUpload, showCreateForm, t],
  );

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      void loadTeams();
    }
  }, [isAuthenticated, isHydrating, loadTeams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formState.name.trim();
    const description = formState.description.trim();

    if (!name) {
      toast({
        title: t("teams.toasts.validationTitle"),
        description: t("teams.validation.required"),
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

      const isEditing = selectedTeam !== null;
      const endpoint = isEditing
        ? `/api/gerit/v1/teams/${selectedTeam?.id ?? ""}`
        : "/api/gerit/v1/teams";

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
          normalizeErrorMessage(responsePayload, t("teams.errors.save")),
        );
      }

      const normalized = normalizeTeam(responsePayload);

      if (normalized) {
        setSelectedTeam(normalized);
        setFormState({
          name: normalized.name,
          description: normalized.description,
        });
        setTeamDetailMode("edit");
      }

      toast({
        title: t("teams.toasts.successTitle"),
        description: isEditing
          ? t("teams.toasts.updated")
          : t("teams.toasts.created"),
      });
      await loadTeams();
    } catch (error) {
      toast({
        title: t("teams.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("teams.errors.save"),
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
                  {t("teams.title")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-[#000000] dark:text-[#84a0c0]">
                  {t("teams.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gridToolbar}
              </div>
            </div>
          </div>

          <HubGrid
            title={t("teams.title")}
            subtitle={t("teams.subtitle")}
            columns={teamColumns}
            items={teams}
            renderRowCells={teamRowCells}
            renderStatus={renderTeamStatus}
            statusColumnLabel={t("teams.table.status")}
            renderActions={renderTeamActions}
            actionsColumnLabel={t("teams.table.actions")}
            rowDensity={rowDensity}
            densityOptions={densityOptions}
            onDensityChange={setRowDensity}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            statusFilter={statusFilter}
            statusFilterOptions={[
              { value: "active", label: t("teams.filters.active") },
              { value: "inactive", label: t("teams.filters.inactive") },
              { value: "all", label: t("teams.filters.all") },
            ]}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterLabel={t("teams.filters.statusLabel")}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={t("teams.filters.search")}
            loading={loading}
            loadingText={t("teams.loading")}
            emptyText={t("teams.empty")}
            pageCaption={pageCaption}
            page={page}
            totalPages={totalPagesFromServer}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={handlePageSizeChange}
            paginationPreviousLabel={t("teams.pagination.previous")}
            paginationNextLabel={t("teams.pagination.next")}
            paginationPageLabel={t("teams.pagination.page")}
            paginationPerPageLabel={t("teams.pagination.perPage")}
            selectedRowKey={selectedTeam?.id}
            getRowKey={(team) => team.id}
            onRowClick={handleTeamSelection}
          />
          {detailVisible ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="rounded-sm border border-[#d9dee2] bg-white p-5 dark:border-[#000000] dark:bg-[#1f2f3e]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a] dark:text-[#d6e6ee]">
                      {selectedTeam
                        ? t("teams.form.editTitle")
                        : t("teams.form.newTitle")}
                    </h2>
                    <p className="text-sm text-[#4f5c6a] dark:text-[#9eb1bc]">
                      {t("teams.form.subtitle")}
                    </p>
                  </div>
                </div>

                <form
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                  onSubmit={handleSubmit}
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8da7b4] dark:text-[#7d9aa8]">
                      {t("teams.form.name")}
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
                      placeholder={t("teams.form.name")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#8da7b4] dark:text-[#7d9aa8]">
                      {t("teams.form.description")}
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
                      className="h-24 w-full rounded-sm border border-[#c9d2e0] bg-white px-3 py-2 text-sm text-[#1f2f3f] outline-none placeholder:text-[#6b7280] focus:border-[#11b7ff] dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#d6e6ee]"
                      placeholder={t("teams.form.description")}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={hideDetail}
                      disabled={submitting}
                      className="h-11 rounded-sm border border-[#d9dee2] bg-white px-5 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#0cbbf6] hover:text-[#0cbbf6] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#000000] dark:bg-[#1f2f3e] dark:text-[#c4d6de] dark:hover:text-white"
                    >
                      {t("teams.actions.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 rounded-sm bg-[#08aee5] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0cbbf6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("teams.actions.save")}
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
