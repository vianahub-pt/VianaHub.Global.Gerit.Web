import { ClientItem, ClientIndividual, ClientCompany } from "./client-models";

export interface ClientsPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

function normalizeIndividual(payload: unknown): ClientIndividual | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const candidate = payload as Record<string, unknown>;

  return {
    id: typeof candidate.id === "number" ? candidate.id : undefined,
    tenantId: typeof candidate.tenantId === "number" ? candidate.tenantId : undefined,
    clientId: typeof candidate.clientId === "number" ? candidate.clientId : undefined,
    displayName: typeof candidate.displayName === "string" ? candidate.displayName : undefined,
    firstName: typeof candidate.firstName === "string" ? candidate.firstName : undefined,
    lastName: typeof candidate.lastName === "string" ? candidate.lastName : undefined,
    phoneNumber: typeof candidate.phoneNumber === "string" ? candidate.phoneNumber : undefined,
    cellPhoneNumber: typeof candidate.cellPhoneNumber === "string" ? candidate.cellPhoneNumber : undefined,
    isWhatsapp: typeof candidate.isWhatsapp === "boolean" ? candidate.isWhatsapp : undefined,
    email: typeof candidate.email === "string" ? candidate.email : undefined,
    birthDate: typeof candidate.birthDate === "string" ? candidate.birthDate : undefined,
    gender: typeof candidate.gender === "string" ? candidate.gender : undefined,
    documentType: typeof candidate.documentType === "string" ? candidate.documentType : undefined,
    documentNumber: typeof candidate.documentNumber === "string" ? candidate.documentNumber : undefined,
    nationality: typeof candidate.nationality === "string" ? candidate.nationality : undefined,
    isActive: typeof candidate.isActive === "boolean" ? candidate.isActive : undefined,
  };
}

function normalizeCompany(payload: unknown): ClientCompany | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const candidate = payload as Record<string, unknown>;

  return {
    id: typeof candidate.id === "number" ? candidate.id : undefined,
    tenantId: typeof candidate.tenantId === "number" ? candidate.tenantId : undefined,
    clientId: typeof candidate.clientId === "number" ? candidate.clientId : undefined,
    legalName: typeof candidate.legalName === "string" ? candidate.legalName : undefined,
    tradeName: typeof candidate.tradeName === "string" ? candidate.tradeName : undefined,
    phoneNumber: typeof candidate.phoneNumber === "string" ? candidate.phoneNumber : undefined,
    cellPhoneNumber: typeof candidate.cellPhoneNumber === "string" ? candidate.cellPhoneNumber : undefined,
    isWhatsapp: typeof candidate.isWhatsapp === "boolean" ? candidate.isWhatsapp : undefined,
    email: typeof candidate.email === "string" ? candidate.email : undefined,
    site: typeof candidate.site === "string" ? candidate.site : undefined,
    companyRegistration: typeof candidate.companyRegistration === "string" ? candidate.companyRegistration : undefined,
    cae: typeof candidate.cae === "string" ? candidate.cae : undefined,
    numberOfEmployee: typeof candidate.numberOfEmployee === "number" ? candidate.numberOfEmployee : undefined,
    legalRepresentative: typeof candidate.legalRepresentative === "string" ? candidate.legalRepresentative : undefined,
    isActive: typeof candidate.isActive === "boolean" ? candidate.isActive : undefined,
  };
}

export function normalizeClient(payload: unknown): ClientItem | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const id = candidate.id;
  const individualRaw = candidate.individual as Record<string, unknown> | undefined;
  const isActive = candidate.isActive;

  // name: root-level "name" or from individual.displayName (GET /{id} shape)
  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof individualRaw?.displayName === "string"
        ? individualRaw.displayName
        : undefined;

  // email: root-level "email" or from individual.email (GET /{id} shape)
  const email =
    typeof candidate.email === "string"
      ? candidate.email
      : typeof individualRaw?.email === "string"
        ? individualRaw.email
        : undefined;

  // phone: root-level "phone"/"phoneNumber" or from individual.phoneNumber (GET /{id} shape)
  const phone =
    typeof candidate.phone === "string"
      ? candidate.phone
      : typeof candidate.phoneNumber === "string"
        ? candidate.phoneNumber
        : typeof individualRaw?.phoneNumber === "string"
          ? individualRaw.phoneNumber
          : typeof individualRaw?.cellPhoneNumber === "string"
            ? individualRaw.cellPhoneNumber
            : "";

  const clientTypeDescription =
    typeof candidate.clientTypeDescription === "string"
      ? candidate.clientTypeDescription
      : typeof candidate.clientType === "string"
        ? candidate.clientType
        : null;

  // origin: root-level "origin"/"source" or originTypeDescription/originType (GET /{id} shape)
  const origin =
    typeof candidate.origin === "string"
      ? candidate.origin
      : typeof candidate.source === "string"
        ? candidate.source
        : typeof candidate.originTypeDescription === "string"
          ? candidate.originTypeDescription
          : typeof candidate.originType === "number"
            ? String(candidate.originType)
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

  // remarks: root-level "remarks"/"description" or "note" (GET /{id} shape)
  const remarks =
    typeof candidate.remarks === "string"
      ? candidate.remarks
      : typeof candidate.description === "string"
        ? candidate.description
        : typeof candidate.note === "string"
          ? candidate.note
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

  const individual = normalizeIndividual(candidate.individual);
  const company = normalizeCompany(candidate.company);

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
    individual,
    company,
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
