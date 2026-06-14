import {
  ClientItem,
  ClientIndividual,
  ClientCompany,
  ClientFiscalDataItem,
  ClientConsentItem,
  ConsentTypeItem,
  ClientHierarchyItem,
} from "./client-models";

export interface ClientsPagedResponse {
  items?: unknown;
  data?: unknown;
  totalItems?: unknown;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

export interface FiscalDataPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

export interface ConsentsPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

export interface ConsentTypesResponse {
  items?: unknown;
}

export interface HierarchyPagedResponse {
  items?: unknown;
  totalItems?: unknown;
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
    fullName: typeof candidate.fullName === "string" ? candidate.fullName : undefined,
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
  const companyRaw = candidate.company as Record<string, unknown> | undefined;
  const isActive = candidate.isActive;

  // name: root-level "name" or from individual.displayName or from company.legalName/tradeName (GET /{id} shape)
  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof individualRaw?.displayName === "string"
        ? individualRaw.displayName
        : typeof companyRaw?.legalName === "string"
          ? companyRaw.legalName
          : typeof companyRaw?.tradeName === "string"
            ? companyRaw.tradeName
            : undefined;

  // email: root-level "email" or from individual.email or from company.email (GET /{id} shape)
  const email =
    typeof candidate.email === "string"
      ? candidate.email
      : typeof individualRaw?.email === "string"
        ? individualRaw.email
        : typeof companyRaw?.email === "string"
          ? companyRaw.email
          : undefined;

  // phone: root-level "phone"/"phoneNumber" or from individual or company phone fields (GET /{id} shape)
  const phone =
    typeof candidate.phone === "string"
      ? candidate.phone
      : typeof candidate.phoneNumber === "string"
        ? candidate.phoneNumber
        : typeof individualRaw?.phoneNumber === "string"
          ? individualRaw.phoneNumber
          : typeof individualRaw?.cellPhoneNumber === "string"
            ? individualRaw.cellPhoneNumber
            : typeof companyRaw?.phoneNumber === "string"
              ? companyRaw.phoneNumber
              : typeof companyRaw?.cellPhoneNumber === "string"
                ? companyRaw.cellPhoneNumber
                : "";

  const clientTypeDescription =
    typeof candidate.clientTypeDescription === "string"
      ? candidate.clientTypeDescription
      : typeof candidate.clientType === "string"
        ? candidate.clientType
        : null;

  // originType: from API root-level "originType" (number)
  const originType =
    typeof candidate.originType === "number"
      ? candidate.originType
      : null;

  // originTypeDescription: from API root-level "originTypeDescription" (string)
  const originTypeDescription =
    typeof candidate.originTypeDescription === "string"
      ? candidate.originTypeDescription
      : null;

  // urlImage: from API root-level "urlImage"
  const urlImage =
    typeof candidate.urlImage === "string"
      ? candidate.urlImage
      : typeof candidate.imageUrl === "string"
        ? candidate.imageUrl
        : null;

  // note: from API root-level "note"
  const note =
    typeof candidate.note === "string"
      ? candidate.note
      : typeof candidate.remarks === "string"
        ? candidate.remarks
        : typeof candidate.description === "string"
          ? candidate.description
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
    originType: originType ?? undefined,
    originTypeDescription: originTypeDescription ?? undefined,
    urlImage,
    note,
    clientType: typeof clientType === "number" ? clientType : undefined,
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

export interface NormalizedError {
  message: string;
  errorId?: string;
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

export function normalizeClientError(payload: unknown, fallback: string): NormalizedError {
  if (typeof payload !== "object" || payload === null) {
    return { message: fallback };
  }

  const candidate = payload as Record<string, unknown>;

  // Tentar extrair errorId do formato da API Gerit
  // { "title": "...", "errors": { "errorId": ["Contacte o suporte com o ID: xxx"], ... } }
  if (candidate.errors && typeof candidate.errors === "object") {
    const errors = candidate.errors as Record<string, unknown>;

    // Extrair errorId
    const errorIdEntry = errors["errorId"] ?? errors["ID do erro"];
    if (Array.isArray(errorIdEntry) && typeof errorIdEntry[0] === "string") {
      const errorIdMatch = errorIdEntry[0].match(/ID[:\s]+([a-f0-9-]+)/i);
      if (errorIdMatch) {
        // Extrair mensagem principal tambem
        const errorEntry = errors["error"] ?? errors["Erro"];
        const mainMessage = Array.isArray(errorEntry) && typeof errorEntry[0] === "string"
          ? errorEntry[0]
          : fallback;

        return {
          message: mainMessage,
          errorId: errorIdMatch[1],
        };
      }
    }

    // Fallback: extrair primeira mensagem de erro
    const firstErrorGroup = Object.values(errors).find(
      (value) => Array.isArray(value) && value.length > 0 && typeof value[0] === "string",
    );
    if (Array.isArray(firstErrorGroup) && typeof firstErrorGroup[0] === "string") {
      return { message: firstErrorGroup[0] };
    }
  }

  if (typeof candidate.title === "string" && candidate.title.trim()) {
    return { message: candidate.title };
  }

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return { message: candidate.message };
  }

  return { message: fallback };
}
