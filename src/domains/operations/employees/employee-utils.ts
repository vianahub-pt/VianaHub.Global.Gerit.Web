"use client";

/* ---------- Employee Utils ---------- */

import type { EmployeeItem, EmployeesPagedResponse } from "./employee-models";

export function normalizeEmployee(payload: unknown): EmployeeItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.employeeId === "number"
        ? candidate.employeeId
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

  const userId =
    typeof candidate.userId === "string"
      ? candidate.userId
      : typeof candidate.user_id === "string"
        ? candidate.user_id
        : "";

  const firstName =
    typeof candidate.firstName === "string"
      ? candidate.firstName
      : typeof candidate.first_name === "string"
        ? candidate.first_name
        : "";

  const lastName =
    typeof candidate.lastName === "string"
      ? candidate.lastName
      : typeof candidate.last_name === "string"
        ? candidate.last_name
        : "";

  const email =
    typeof candidate.email === "string" ? candidate.email : "";

  const phone =
    typeof candidate.phone === "string"
      ? candidate.phone
      : typeof candidate.phoneNumber === "string"
        ? candidate.phoneNumber
        : typeof candidate.phone_number === "string"
          ? candidate.phone_number
          : null;

  const functionValue =
    typeof candidate.function === "string"
      ? candidate.function
      : typeof candidate.role === "string"
        ? candidate.role
        : typeof candidate.position === "string"
          ? candidate.position
          : "";

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

  if (!firstName || !lastName || !email) {
    return null;
  }

  return {
    id: rawId,
    employeeId: rawId,
    tenantId,
    userId,
    firstName,
    lastName,
    email,
    phone,
    function: functionValue,
    isActive: Boolean(isActiveValue),
    active: Boolean(isActiveValue),
    createdAt,
    updatedAt,
  };
}

export function normalizeEmployeesResponse(payload: unknown): EmployeesPagedResponse {
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
    .map((item) => normalizeEmployee(item))
    .filter((item): item is EmployeeItem => item !== null);

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