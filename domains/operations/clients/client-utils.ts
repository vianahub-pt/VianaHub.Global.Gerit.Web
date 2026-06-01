import { ClientItem } from "./client-models";

export interface ClientsPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

export function normalizeClient(payload: unknown): ClientItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const id = candidate.id;
  const name = candidate.name;
  const email = candidate.email;
  const phone = candidate.phone;
  const isActive = candidate.isActive;
  const clientTypeDescription =
    typeof candidate.clientTypeDescription === "string"
      ? candidate.clientTypeDescription
      : typeof candidate.clientType === "string"
        ? candidate.clientType
        : null;
  const origin =
    typeof candidate.origin === "string"
      ? candidate.origin
      : typeof candidate.source === "string"
        ? candidate.source
        : null;
  const website =
    typeof candidate.website === "string"
      ? candidate.website
      : typeof candidate.url === "string"
        ? candidate.url
        : null;
  const score =
    typeof candidate.score === "number"
      ? candidate.score
      : typeof candidate.clientScore === "number"
        ? candidate.clientScore
        : null;
  const consent =
    typeof candidate.consent === "boolean"
      ? candidate.consent
      : typeof candidate.acceptsMarketing === "boolean"
        ? candidate.acceptsMarketing
        : true;
  const remarks =
    typeof candidate.remarks === "string"
      ? candidate.remarks
      : typeof candidate.description === "string"
        ? candidate.description
        : null;
  const contact =
    typeof candidate.contact === "string"
      ? candidate.contact
      : typeof candidate.mainContact === "string"
        ? candidate.mainContact
        : null;
  const urlImage =
    typeof candidate.urlImage === "string"
      ? candidate.urlImage
      : typeof candidate.imageUrl === "string"
        ? candidate.imageUrl
        : null;
  const clientType =
    typeof candidate.clientType === "number"
      ? candidate.clientType
      : typeof candidate.type === "number"
        ? candidate.type
        : typeof candidate.clientTypeId === "number"
          ? candidate.clientTypeId
          : null;

  if (
    typeof id !== "number" ||
    typeof name !== "string" ||
    typeof phone !== "string" ||
    typeof isActive !== "boolean"
  ) {
    return null;
  }

    return {
    id,
    name,
    email: typeof email === "string" ? email : null,
    phone,
    isActive,
    clientTypeDescription: clientTypeDescription ?? undefined,
    origin: origin ?? undefined,
    website,
    score,
    consent: Boolean(consent),
    remarks,
    clientType: typeof clientType === "number" ? clientType : undefined,
    contact,
    urlImage,
  };
}

export function parsePagedClients(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { items: [] as ClientItem[], totalItems: 0 };
  }

  const candidate = payload as ClientsPagedResponse;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray((candidate as { data?: unknown }).data)
      ? ((candidate as { data: unknown }).data as unknown[])
      : [];
  const items = rawItems
    .map((item) => normalizeClient(item))
    .filter((item): item is ClientItem => item !== null);

  const totalItemsValue =
    typeof candidate.totalItems === "number"
      ? candidate.totalItems
      : Array.isArray((candidate as { data?: unknown }).data)
        ? ((candidate as { data: unknown }).data as unknown[]).length
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
