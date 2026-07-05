import {
  ClientItem,
  ClientIndividual,
  ClientCompany,
  ClientFiscalDataItem,
  ClientConsentItem,
  ConsentTypeItem,
  ConsentOriginTypeItem,
  AddressItem,
  type AddressSortColumn,
  type ContactNetworkItem,
  type ContactNetworkSortColumn,
  type FiscalDataSortColumn,
  type ConsentSortColumn,
} from "./client-models";

export interface ConsentsPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

export interface ConsentTypesResponse {
  items?: unknown;
}

export interface ConsentOriginTypesResponse {
  items?: unknown;
}

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

export interface HierarchyPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

export interface AddressesPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

export interface ContactNetworkPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

/* ---------- Contact Network normalize/parse ---------- */

export function normalizeContactNetwork(payload: unknown): ContactNetworkItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.contactId === "number"
          ? candidate.contactId
          : typeof candidate.contactId === "string"
            ? Number(candidate.contactId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.fullName === "string"
        ? candidate.fullName
        : typeof candidate.contactName === "string"
          ? candidate.contactName
          : "";
  const phoneNumber =
    typeof candidate.phoneNumber === "string"
      ? candidate.phoneNumber
      : typeof candidate.phone === "string"
        ? candidate.phone
        : typeof candidate.mobile === "string"
          ? candidate.mobile
          : null;
  const cellPhoneNumber =
    typeof candidate.cellPhoneNumber === "string"
      ? candidate.cellPhoneNumber
      : typeof candidate.cellPhone === "string"
        ? candidate.cellPhone
        : typeof candidate.mobile === "string"
          ? candidate.mobile
          : null;
  const email = typeof candidate.email === "string" ? candidate.email : null;
  const isWhatsapp =
    typeof candidate.isWhatsapp === "boolean"
      ? candidate.isWhatsapp
      : typeof candidate.isWhatsapp === "string"
        ? candidate.isWhatsapp.toLowerCase() === "true"
        : false;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;
  const isPrimaryValue =
    typeof candidate.isPrimary === "boolean"
      ? candidate.isPrimary
      : typeof candidate.isPrimary === "string"
        ? candidate.isPrimary.toLowerCase() === "true"
        : false;

  return {
    id: rawId,
    name,
    email,
    phoneNumber,
    cellPhoneNumber,
    isWhatsapp: Boolean(isWhatsapp),
    isActive: Boolean(isActiveValue),
    isPrimary: Boolean(isPrimaryValue),
  };
}

export function parsePagedContactNetwork(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ContactNetworkItem[], totalItems: 0 };
  const candidate = payload as ContactNetworkPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeContactNetwork)
    .filter((item): item is ContactNetworkItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

export function getContactNetworkSortValue(item: ContactNetworkItem, column: ContactNetworkSortColumn) {
  switch (column) {
    case "Email":
      return (item.email ?? "").toLowerCase();
    case "PhoneNumber":
      return (item.phoneNumber ?? "").toLowerCase();
    case "CellPhoneNumber":
      return (item.cellPhoneNumber ?? "").toLowerCase();
    case "IsWhatsapp":
      return item.isWhatsapp ? "1" : "0";
    case "IsPrimary":
      return item.isPrimary ? "1" : "0";
    default:
      return item.name.toLowerCase();
  }
}

/* ---------- Fiscal Data normalize/parse ---------- */

export function normalizeFiscalData(payload: unknown): ClientFiscalDataItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const clientId =
    typeof candidate.clientId === "number"
      ? candidate.clientId
      : typeof candidate.clientId === "string"
        ? Number(candidate.clientId)
        : 0;
  const taxNumber = typeof candidate.taxNumber === "string" ? candidate.taxNumber : null;
  const vatNumber = typeof candidate.vatNumber === "string" ? candidate.vatNumber : null;
  const fiscalCountry = typeof candidate.fiscalCountry === "string" ? candidate.fiscalCountry : null;
  const isVatRegistered =
    typeof candidate.isVatRegistered === "boolean"
      ? candidate.isVatRegistered
      : typeof candidate.isVatRegistered === "string"
        ? candidate.isVatRegistered.toLowerCase() === "true"
        : false;
  const iban = typeof candidate.iban === "string" ? candidate.iban : null;
  const fiscalEmail = typeof candidate.fiscalEmail === "string" ? candidate.fiscalEmail : null;
  const isActive =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : true;

  return {
    id: rawId,
    clientId,
    taxNumber,
    vatNumber,
    fiscalCountry,
    isVatRegistered: Boolean(isVatRegistered),
    iban,
    fiscalEmail,
    isActive: Boolean(isActive),
  };
}

export function parsePagedFiscalData(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ClientFiscalDataItem[], totalItems: 0 };
  const candidate = payload as FiscalDataPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeFiscalData)
    .filter((item): item is ClientFiscalDataItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

export function getFiscalDataSortValue(item: ClientFiscalDataItem, column: FiscalDataSortColumn) {
  switch (column) {
    case "VatNumber":
      return (item.vatNumber ?? "").toLowerCase();
    case "FiscalCountry":
      return (item.fiscalCountry ?? "").toLowerCase();
    case "IsVatRegistered":
      return item.isVatRegistered ? "1" : "0";
    case "IBAN":
      return (item.iban ?? "").toLowerCase();
    case "FiscalEmail":
      return (item.fiscalEmail ?? "").toLowerCase();
    default:
      return (item.taxNumber ?? "").toLowerCase();
  }
}

/* ---------- Consent normalize/parse ---------- */

export function normalizeConsent(payload: unknown): ClientConsentItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const tenantId =
    typeof candidate.tenantId === "number"
      ? candidate.tenantId
      : typeof candidate.tenantId === "string"
        ? Number(candidate.tenantId)
        : 0;
  const clientId =
    typeof candidate.clientId === "number"
      ? candidate.clientId
      : typeof candidate.clientId === "string"
        ? Number(candidate.clientId)
        : 0;
  const client = typeof candidate.client === "string" ? candidate.client : "";
  const consentTypeId =
    typeof candidate.consentTypeId === "number"
      ? candidate.consentTypeId
      : typeof candidate.consentTypeId === "string"
        ? Number(candidate.consentTypeId)
        : 0;
  const consentType = typeof candidate.consentType === "string" ? candidate.consentType : "";
  const consentOriginTypeId =
    typeof candidate.consentOriginTypeId === "number"
      ? candidate.consentOriginTypeId
      : typeof candidate.consentOriginTypeId === "string"
        ? Number(candidate.consentOriginTypeId)
        : 0;
  const consentOriginType = typeof candidate.consentOriginType === "string" ? candidate.consentOriginType : "";
  const granted =
    typeof candidate.granted === "boolean"
      ? candidate.granted
      : typeof candidate.granted === "string"
        ? candidate.granted.toLowerCase() === "true"
        : false;
  const grantedDate = typeof candidate.grantedDate === "string" ? candidate.grantedDate : "";
  const revokedDate = typeof candidate.revokedDate === "string" ? candidate.revokedDate : undefined;
  const ipAddress = typeof candidate.ipAddress === "string" ? candidate.ipAddress : undefined;
  const userAgent = typeof candidate.userAgent === "string" ? candidate.userAgent : undefined;
  const isActive =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : true;

  return {
    id: rawId,
    tenantId,
    clientId,
    client,
    consentTypeId,
    consentType,
    consentOriginTypeId,
    consentOriginType,
    granted: Boolean(granted),
    grantedDate,
    revokedDate,
    ipAddress,
    userAgent,
    isActive: Boolean(isActive),
  };
}

export function parsePagedConsents(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ClientConsentItem[], totalItems: 0 };
  const candidate = payload as ConsentsPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeConsent)
    .filter((item): item is ClientConsentItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

export function getConsentSortValue(item: ClientConsentItem, column: ConsentSortColumn) {
  switch (column) {
    case "consentType":
      return item.consentType.toLowerCase();
    case "consentOriginType":
      return item.consentOriginType.toLowerCase();
    case "granted":
      return item.granted ? "1" : "0";
    case "grantedDate":
      return (item.grantedDate ?? "").toLowerCase();
    case "isActive":
      return item.isActive ? "1" : "0";
    default:
      return item.consentType.toLowerCase();
  }
}

/* ---------- Consent Origin Types normalize ---------- */

export function normalizeConsentOriginTypes(payload: unknown): ConsentOriginTypeItem[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((candidate) => ({
      id: typeof candidate.id === "number" ? candidate.id : 0,
      name: typeof candidate.name === "string" ? candidate.name : "",
      description: typeof candidate.description === "string" ? candidate.description : "",
      isActive:
        typeof candidate.isActive === "boolean"
          ? candidate.isActive
          : typeof candidate.active === "boolean"
            ? candidate.active
            : true,
    }));
}

/* ---------- Consent Types normalize ---------- */

export function normalizeConsentTypes(payload: unknown): ConsentTypeItem[] {
  if (typeof payload !== "object" || payload === null) return [];
  const candidate = payload as Record<string, unknown>;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : Array.isArray(payload) ? payload : [];
  return rawItems
    .map((item: unknown) => {
      if (typeof item !== "object" || item === null) return null;
      const c = item as Record<string, unknown>;
      const id = typeof c.id === "number" ? c.id : typeof c.id === "string" ? Number(c.id) : null;
      if (id === null || !Number.isFinite(id)) return null;
      const name = typeof c.name === "string" ? c.name : "";
      const description = typeof c.description === "string" ? c.description : null;
      const isActive = typeof c.isActive === "boolean" ? c.isActive : true;
      return { id, name, description, isActive };
    })
    .filter((item): item is ConsentTypeItem => item !== null);
}

/* ---------- Address normalize/parse ---------- */

export function normalizeAddress(payload: unknown): AddressItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.addressId === "number"
          ? candidate.addressId
          : typeof candidate.addressId === "string"
            ? Number(candidate.addressId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const street =
    typeof candidate.street === "string"
      ? candidate.street
      : typeof candidate.addressLine1 === "string"
        ? candidate.addressLine1
        : typeof candidate.address === "string"
          ? candidate.address
          : typeof candidate.line1 === "string"
            ? candidate.line1
            : null;
  const city =
    typeof candidate.city === "string"
      ? candidate.city
      : typeof candidate.town === "string"
        ? candidate.town
        : null;
  const state =
    typeof candidate.state === "string"
      ? candidate.state
      : typeof candidate.region === "string"
        ? candidate.region
        : typeof candidate.district === "string"
          ? candidate.district
          : null;
  const postalCode =
    typeof candidate.postalCode === "string"
      ? candidate.postalCode
      : typeof candidate.zipCode === "string"
        ? candidate.zipCode
        : null;
  const country =
    typeof candidate.country === "string"
      ? candidate.country
      : typeof candidate.countryCode === "string"
        ? candidate.countryCode
        : typeof candidate.regionCode === "string"
          ? candidate.regionCode
          : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;
  const isPrimaryValue =
    typeof candidate.isPrimary === "boolean"
      ? candidate.isPrimary
      : typeof candidate.isPrimary === "string"
        ? candidate.isPrimary.toLowerCase() === "true"
        : false;

  return {
    id: rawId,
    addressTypeId: typeof candidate.addressTypeId === "number" ? candidate.addressTypeId : typeof candidate.addressTypeId === "string" ? Number(candidate.addressTypeId) : null,
    street,
    number: typeof candidate.number === "string" ? candidate.number : null,
    complement: typeof candidate.complement === "string" ? candidate.complement : null,
    neighborhood: typeof candidate.neighborhood === "string" ? candidate.neighborhood : null,
    city,
    state,
    postalCode,
    country,
    latitude: typeof candidate.latitude === "string" ? candidate.latitude : typeof candidate.latitude === "number" ? String(candidate.latitude) : null,
    longitude: typeof candidate.longitude === "string" ? candidate.longitude : typeof candidate.longitude === "number" ? String(candidate.longitude) : null,
    note: typeof candidate.note === "string" ? candidate.note : null,
    isActive: Boolean(isActiveValue),
    isPrimary: Boolean(isPrimaryValue),
  };
}

export function parsePagedAddresses(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as AddressItem[], totalItems: 0 };
  const candidate = payload as AddressesPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeAddress)
    .filter((item): item is AddressItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

export function getAddressSortValue(item: AddressItem, column: AddressSortColumn) {
  switch (column) {
    case "City":
      return (item.city ?? "").toLowerCase();
    case "State":
      return (item.state ?? "").toLowerCase();
    case "PostalCode":
      return (item.postalCode ?? "").toLowerCase();
    case "Country":
      return (item.country ?? "").toLowerCase();
    default:
      return (item.street ?? "").toLowerCase();
  }
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
  const rawId = candidate.id;
  const individualRaw = candidate.individual as Record<string, unknown> | undefined;
  const companyRaw = candidate.company as Record<string, unknown> | undefined;
  const rawIsActive = candidate.isActive;

  // Coerce id to number if it's a string
  const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : NaN;

  // name: root-level "name" or from individual.fullName or from company.legalName/tradeName (GET /{id} shape)
  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof individualRaw?.fullName === "string"
        ? individualRaw.fullName
        : typeof companyRaw?.legalName === "string"
          ? companyRaw.legalName
          : typeof companyRaw?.tradeName === "string"
            ? companyRaw.tradeName
            : `Cliente #${Number.isFinite(id) ? id : "desconhecido"}`;

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

  // Coerce isActive to boolean (handle string "true"/"false", number 1/0, etc.)
  const isActive =
    typeof rawIsActive === "boolean"
      ? rawIsActive
      : typeof rawIsActive === "string"
        ? rawIsActive.toLowerCase() === "true"
        : typeof rawIsActive === "number"
          ? rawIsActive !== 0
          : true; // default to true if missing

  // Validate required fields with coercion
  if (!Number.isFinite(id) || typeof name !== "string" || typeof phone !== "string") {
    // Log for debugging - remove in production if needed
    if (typeof console !== "undefined") {
      console.warn("[normalizeClient] Validation failed", {
        id,
        name: typeof name,
        phone: typeof phone,
        isActive: typeof isActive,
        rawId,
        rawIsActive,
        candidateKeys: Object.keys(candidate),
      });
    }
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
