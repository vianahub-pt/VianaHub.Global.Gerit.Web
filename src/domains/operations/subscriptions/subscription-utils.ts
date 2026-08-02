"use client";

/* ---------- Subscription Utils ---------- */

import type { SubscriptionItem, SubscriptionsPagedResponse } from "./subscription-models";

export function normalizeSubscription(payload: unknown): SubscriptionItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.subscriptionId === "number"
        ? candidate.subscriptionId
        : null;

  if (rawId === null) {
    return null;
  }

  const name = typeof candidate.name === "string" ? candidate.name : "";
  const description =
    typeof candidate.description === "string" ? candidate.description : null;
  const price =
    typeof candidate.price === "number"
      ? candidate.price
      : typeof candidate.amount === "number"
        ? candidate.amount
        : 0;

  const billingCycleRaw = typeof candidate.billingCycle === "string"
    ? candidate.billingCycle
    : typeof candidate.cycle === "string"
      ? candidate.cycle
      : "Monthly";

  const billingCycle: SubscriptionItem["billingCycle"] =
    ["Monthly", "Quarterly", "SemiAnnual", "Annual"].includes(billingCycleRaw)
      ? (billingCycleRaw as SubscriptionItem["billingCycle"])
      : "Monthly";

  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : true;

  const tenantId =
    typeof candidate.tenantId === "number"
      ? candidate.tenantId
      : typeof candidate.tenant_id === "number"
        ? candidate.tenant_id
        : 0;

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

  if (!name) {
    return null;
  }

  return {
    id: rawId,
    subscriptionId: rawId,
    tenantId,
    name,
    description,
    price,
    billingCycle,
    isActive: Boolean(isActiveValue),
    active: Boolean(isActiveValue),
    createdAt,
    updatedAt,
  };
}

export function normalizeSubscriptionsResponse(
  payload: unknown
): SubscriptionsPagedResponse {
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
    .map((item) => normalizeSubscription(item))
    .filter((item): item is SubscriptionItem => item !== null);

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