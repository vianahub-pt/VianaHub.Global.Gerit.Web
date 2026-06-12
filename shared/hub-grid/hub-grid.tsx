"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, Inbox, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

export type RowDensity = "compact" | "medium" | "expanded";

export interface HubGridColumn<Item> {
  key: string;
  label: string;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

export interface HubGridProps<Item> {
  title?: string;
  subtitle?: string;
  columns: HubGridColumn<Item>[];
  items: Item[];
  renderRowCells: (item: Item) => ReactNode[];
  renderStatus?: (item: Item) => ReactNode;
  statusColumnLabel?: string;
  renderActions?: (item: Item) => ReactNode;
  actionsColumnLabel?: string;
  rowDensity: RowDensity;
  densityOptions: { key: RowDensity; label: string }[];
  onDensityChange: (value: RowDensity) => void;
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (columnKey: string) => void;
  statusFilter: string;
  statusFilterOptions: { value: string; label: string }[];
  onStatusFilterChange: (value: string) => void;
  statusFilterLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  loading: boolean;
  loadingText: string;
  emptyText: string;
  pageCaption: string;
  page: number;
  totalPages: number;
  pageButtons: number[];
  onPageChange: (value: number) => void;
  pageSize: number;
  pageSizeOptions: number[];
  onPageSizeChange: (value: number) => void;
  paginationPreviousLabel: string;
  paginationNextLabel: string;
  paginationPageLabel: string;
  paginationPerPageLabel: string;
  selectedRowKey?: string | number;
  getRowKey?: (item: Item) => string | number;
  onRowClick?: (item: Item) => void;
}

export function HubGrid<Item>({
  title,
  subtitle,
  columns,
  items,
  renderRowCells,
  renderStatus,
  statusColumnLabel,
  renderActions,
  actionsColumnLabel,
  rowDensity,
  densityOptions,
  onDensityChange,
  sortBy,
  sortDirection,
  onSort,
  statusFilter,
  statusFilterOptions,
  onStatusFilterChange,
  statusFilterLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  loading,
  loadingText,
  emptyText,
  pageCaption,
  page,
  totalPages,
  pageButtons,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  paginationPreviousLabel,
  paginationNextLabel,
  paginationPageLabel,
  paginationPerPageLabel,
  selectedRowKey,
  getRowKey,
  onRowClick,
}: HubGridProps<Item>) {
  const rowDensityCellPadding =
    rowDensity === "compact"
      ? "py-0"
      : rowDensity === "medium"
        ? "py-1"
        : "py-2";

  const columnCount =
    columns.length + (renderStatus ? 1 : 0) + (renderActions ? 1 : 0);

  const handlePreviousPage = () => {
    if (page > 1 && !loading) {
      onPageChange(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages && !loading) {
      onPageChange(page + 1);
    }
  };

  return (
    <section className="overflow-hidden rounded-sm border border-border/80 bg-background shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-background dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
      <div className="border-b border-border/80 bg-muted px-6 py-4 dark:border-border dark:bg-muted">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[20rem]">
            <span className="sr-only">{statusFilterLabel}</span>
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="min-w-[10rem]" aria-label={statusFilterLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="relative w-1/3 min-w-[12rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-10"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            {densityOptions.map((option) => {
              const isActive = rowDensity === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onDensityChange(option.key)}
                  title={option.label}
                  aria-pressed={isActive}
                  className={clsx(
                    "h-10 min-w-[3rem] rounded-sm border px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-foreground dark:bg-primary text-background dark:text-primary-foreground hover:border-ring hover:text-white"
                      : "border-ring dark:border-ring bg-muted dark:bg-muted text-primary dark:text-primary",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold text-foreground dark:text-primary">
          {pageCaption}
        </p>
      </div>

      <div className="px-6 py-4">
        <div className="overflow-x-auto rounded-sm border border-border/70 bg-background shadow-inner dark:border-border dark:bg-card">
          <table className="w-full table-fixed border-collapse" aria-busy={loading}>
            <thead>
              <tr className="bg-muted text-center text-xs uppercase tracking-[0.08em] text-muted-foreground border-b border-border/70 dark:bg-muted dark:text-muted-foreground dark:border-border">
                {columns.map((column, columnIndex) => {
                  const isSorted = sortBy === column.key;
                  const sortable = column.sortable ?? true;
                  const icon =
                    isSorted && sortDirection === "asc" ? (
                      <ChevronUp
                        className="h-3.5 w-3.5 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className={clsx(
                          "h-3.5 w-3.5 transition-colors",
                            isSorted && sortable
                            ? "text-primary"
                            : "text-transparent",
                        )}
                        aria-hidden="true"
                      />
                    );

                  const hasLeftBorder = columnIndex > 0;
                  return (
                    <th
                      key={column.key}
                      className={clsx(
                        "px-4 font-medium text-center",
                        rowDensityCellPadding,
                        column.headerClassName,
                        hasLeftBorder &&
                          "border-l border-border/60 dark:border-border",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => sortable && onSort(column.key)}
                      aria-sort={
                          isSorted
                            ? sortDirection === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      disabled={!sortable}
                      className={clsx(
                        "flex w-full items-center justify-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        sortable
                          ? "hover:text-white"
                          : "cursor-default opacity-70",
                      )}
                    >
                        <span className="text-sm font-semibold uppercase tracking-[0.06em]">
                          {column.label}
                        </span>
                        <span className="ml-auto flex items-center">
                          {icon}
                        </span>
                      </button>
                    </th>
                  );
                })}
                {renderStatus ? (
                  <th
                    className={clsx(
                      "w-[7rem] px-4 font-medium text-center",
                      rowDensityCellPadding,
                      "border-l border-border/80 dark:border-border",
                    )}
                  >
                    {statusColumnLabel}
                  </th>
                ) : null}
                {renderActions ? (
                  <th
                    className={clsx(
                      "w-[9rem] px-4 font-medium text-center",
                      rowDensityCellPadding,
                      "border-l border-border/80 dark:border-border",
                    )}
                  >
                    {actionsColumnLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground dark:text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {loadingText}
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-4 py-12 text-center text-sm text-muted-foreground dark:text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                      <span>{emptyText}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const rowKeyValue = getRowKey?.(item) ?? index;
                  const rowKey =
                    typeof rowKeyValue === "string" ||
                    typeof rowKeyValue === "number"
                      ? rowKeyValue
                      : index;
                  const cells = renderRowCells(item);
                  const isSelected =
                    selectedRowKey !== undefined && selectedRowKey === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      onClick={
                        onRowClick
                          ? () => {
                              onRowClick(item);
                            }
                          : undefined
                      }
                      onKeyDown={
                        onRowClick
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onRowClick(item);
                              }
                            }
                          : undefined
                      }
                      tabIndex={onRowClick ? 0 : undefined}
                      className={clsx(
                        "border-b border-border/70 bg-background text-foreground transition-colors hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted",
                        isSelected && "border-l-4 border-primary",
                        onRowClick ? "cursor-pointer" : undefined,
                      )}
                    >
                      {columns.map((column, columnIndex) => (
                        <td
                          key={`${column.key}-${rowKey}-${columnIndex}`}
                          className={clsx(
                            "px-4 text-sm",
                            rowDensityCellPadding,
                            column.cellClassName,
                            columnIndex > 0 &&
                              "border-l border-border/60 dark:border-border",
                            "border-b border-border/70 dark:border-border",
                          )}
                        >
                          {cells[columnIndex]}
                        </td>
                      ))}
                      {renderStatus ? (
                        <td
                          className={clsx(
                            "w-[7rem] px-4 text-center text-sm",
                            rowDensityCellPadding,
                            "border-l border-border/80 dark:border-border",
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {renderStatus(item)}
                          </div>
                        </td>
                      ) : null}
                      {renderActions ? (
                        <td
                          className={clsx(
                            "w-[9rem] px-4 text-center",
                            rowDensityCellPadding,
                            "border-l border-border/80 dark:border-border",
                          )}
                        >
                          <div className="flex justify-center gap-1">
                            {renderActions(item)}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border/70 bg-muted px-6 py-4 text-sm text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={handlePreviousPage}
            className="flex h-9 items-center justify-center rounded-sm border border-border bg-foreground dark:bg-primary px-4 text-sm font-semibold text-background dark:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paginationPreviousLabel}
          </button>
          {pageButtons.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={clsx(
                "flex h-9 min-w-[2.75rem] items-center justify-center rounded-sm px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                pageNumber === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-ring dark:border-ring bg-muted dark:bg-muted text-primary dark:text-primary",
              )}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={handleNextPage}
            className="flex h-9 items-center justify-center rounded-sm border border-border bg-foreground dark:bg-primary px-4 text-sm font-semibold text-background dark:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paginationNextLabel}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-foreground dark:text-primary">
            {paginationPageLabel} {page} / {totalPages}
          </span>
          <label className="flex items-center gap-2 text-sm text-foreground dark:text-primary">
            <span>{paginationPerPageLabel}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="w-auto min-w-[4rem]" aria-label={paginationPerPageLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </footer>
    </section>
  );
}
