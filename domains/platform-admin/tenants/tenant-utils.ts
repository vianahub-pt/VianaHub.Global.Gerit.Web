import { TenantItem } from "./tenant-models";

export interface TenantsPagedResponse {
  items?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

export function normalizeTenant(payload: unknown): TenantItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const rawId = candidate.id;

  const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : NaN;

  const partyTypeId =
    typeof candidate.partyTypeId === "number"
      ? candidate.partyTypeId
      : typeof candidate.partyTypeId === "string"
        ? Number(candidate.partyTypeId)
        : 0;

  const acquisitionSourceTypeId =
    typeof candidate.acquisitionSourceTypeId === "number"
      ? candidate.acquisitionSourceTypeId
      : typeof candidate.acquisitionSourceTypeId === "string"
        ? Number(candidate.acquisitionSourceTypeId)
        : 0;

  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.tenantName === "string"
        ? candidate.tenantName
        : "";

  const email =
    typeof candidate.email === "string"
      ? candidate.email
      : typeof candidate.emailAddress === "string"
        ? candidate.emailAddress
        : "";

  const websiteUrl =
    typeof candidate.websiteUrl === "string"
      ? candidate.websiteUrl
      : typeof candidate.website === "string"
        ? candidate.website
        : "";

  const imageUrl =
    typeof candidate.imageUrl === "string"
      ? candidate.imageUrl
      : typeof candidate.urlImage === "string"
        ? candidate.urlImage
        : "";

  const note =
    typeof candidate.note === "string"
      ? candidate.note
      : typeof candidate.description === "string"
        ? candidate.description
        : "";

  const rawIsActive = candidate.isActive;
  const isActive =
    typeof rawIsActive === "boolean"
      ? rawIsActive
      : typeof rawIsActive === "string"
        ? rawIsActive.toLowerCase() === "true"
        : typeof rawIsActive === "number"
          ? rawIsActive !== 0
          : true;

  if (!Number.isFinite(id) || typeof name !== "string") {
    return null;
  }

  return {
    id,
    partyTypeId,
    acquisitionSourceTypeId,
    name,
    email,
    websiteUrl,
    imageUrl,
    note,
    isActive,
  };
}

export function parsePagedTenants(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as TenantItem[], totalItems: 0 };
  }

  const candidate = payload as TenantsPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : [];
  const items = rawItems
    .map((item) => normalizeTenant(item))
    .filter((item): item is TenantItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : items.length;

  return {
    items,
    totalItems: totalItemsValue,
  };
}

export function normalizeErrorMessage(payload: unknown, fallback: string) {
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
