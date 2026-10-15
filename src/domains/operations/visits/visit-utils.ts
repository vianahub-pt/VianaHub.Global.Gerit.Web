"use client";

/* ---------- Visit Utils ---------- */

import type { VisitItem, VisitsPagedResponse } from "./visit-models";

export function normalizeVisit(payload: unknown): VisitItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.visitId === "number"
        ? candidate.visitId
        : null;

  if (rawId === null) {
    return null;
  }

  const tenantId =
    typeof candidate.tenantId === "number"
      ? candidate.tenantId
      : typeof candidate.tenant_id === "number"
        ? candidate.tenant_id
        : 0;

  const clientId =
    typeof candidate.clientId === "number"
      ? candidate.clientId
      : typeof candidate.client_id === "number"
        ? candidate.client_id
        : 0;

  const vehicleId =
    typeof candidate.vehicleId === "number"
      ? candidate.vehicleId
      : typeof candidate.vehicle_id === "number"
        ? candidate.vehicle_id
        : 0;

  const employeeId =
    typeof candidate.employeeId === "number"
      ? candidate.employeeId
      : typeof candidate.employee_id === "number"
        ? candidate.employee_id
        : 0;

  const teamId =
    typeof candidate.teamId === "number"
      ? candidate.teamId
      : typeof candidate.team_id === "number"
        ? candidate.team_id
        : 0;

  const visitDate =
    typeof candidate.visitDate === "string"
      ? candidate.visitDate
      : typeof candidate.visit_date === "string"
        ? candidate.visit_date
        : typeof candidate.date === "string"
          ? candidate.date
          : "";

  const visitStatusRaw = typeof candidate.visitStatus === "string"
    ? candidate.visitStatus
    : typeof candidate.status === "string"
      ? candidate.status
      : "Scheduled";

  const visitStatus: VisitItem["visitStatus"] =
    ["Scheduled", "InProgress", "Completed", "Cancelled"].includes(visitStatusRaw)
      ? (visitStatusRaw as VisitItem["visitStatus"])
      : "Scheduled";

  const notes =
    typeof candidate.notes === "string" ? candidate.notes : null;

  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  const createdAt =
    typeof candidate.createdAt === "string"
      ? candidate.createdAt
      : typeof candidate.created_at === "string"
        ? candidate.created_at
        : null;

  const updatedAt =
    typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : typeof candidate.updated_at === "string"
        ? candidate.updated_at
        : null;

  if (!visitDate) {
    return null;
  }

  return {
    id: rawId,
    visitId: rawId,
    tenantId,
    clientId,
    vehicleId,
    employeeId,
    teamId,
    visitDate,
    visitStatus,
    notes,
    isActive: Boolean(isActiveValue),
    active: Boolean(isActiveValue),
    createdAt,
    updatedAt,
  };
}

export function normalizeVisitsResponse(payload: unknown): VisitsPagedResponse {
  if (typeof payload !== "object" || payload === null) {
    return { items: [], totalItems: 0, pageNumber: 1, pageSize: 10, totalPages: 0 };
  }

  const candidate = payload as Record<string, unknown>;

  const itemsRaw =
    Array.isArray(candidate.items)
      ? candidate.items
      : Array.isArray(candidate.data)
        ? candidate.data
        : [];

  const items = itemsRaw
    .map((item) => normalizeVisit(item))
    .filter((item): item is VisitItem => item !== null);

  const totalItems =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : typeof candidate.total === "number"
        ? candidate.total
        : items.length;

  const pageNumber =
    typeof candidate.pageNumber === "number"
      ? candidate.pageNumber
      : typeof candidate.page === "number"
        ? candidate.page
        : 1;

  const pageSize =
    typeof candidate.pageSize === "number"
      ? candidate.pageSize
      : typeof candidate.size === "number"
        ? candidate.size
        : items.length;

  const totalPages =
    typeof candidate.totalPages === "number"
      ? candidate.totalPages
      : pageSize > 0
        ? Math.ceil(totalItems / pageSize)
        : 0;

  return {
    items,
    data: items,
    totalItems,
    pageNumber,
    pageSize,
    totalPages,
  };
}

export function normalizeErrorMessage(payload: unknown, fallback: string): string {
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

  if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
    const firstError = candidate.errors[0];
    if (typeof firstError === "string") return firstError;
    if (typeof firstError === "object" && firstError !== null) {
      const err = firstError as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
      if (typeof err.error === "string") return err.error;
    }
  }

  return fallback;
}