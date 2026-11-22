export type ClientStatusFilter = "all" | "active" | "inactive";
export type ClientSortField = "Name" | "PhoneNumber" | "PartyTypeId" | "IsActive";
export type PartyTypeId = 1 | 2;

export interface ClientRecord {
  id: number;
  partyTypeName: string | null;
  name: string | null;
  phoneNumber: string | null;
  isActive: boolean;
}

export interface ClientDetail extends ClientRecord {
  partyTypeId: PartyTypeId;
  partyType: string | null;
  acquisitionSourceTypeId: number;
  acquisitionSourceType: string | null;
  urlImage: string | null;
  note: string | null;
  cellPhoneNumber: string | null;
  isCellPhoneWhatsapp: boolean;
  email: string | null;
  websiteUrl: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  companyRegistrationNumber: string | null;
  economicActivityCode: string | null;
  numberOfEmployees: number | null;
  statusDefinitionId: number | null;
  statusDefinitionName: string | null;
  statusDomainId: number | null;
  statusDomainName: string | null;
  createdAt: string;
}

export interface CatalogOption {
  id: number;
  name: string;
  isActive: boolean;
  languageCode: string | null;
}

export interface StatusDefinitionOption extends CatalogOption {
  statusDomainId: number;
}

export interface ClientPage {
  items: ClientRecord[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ClientFormValues {
  partyTypeId: string;
  acquisitionSourceTypeId: string;
  name: string;
  phoneNumber: string;
  cellPhoneNumber: string;
  isCellPhoneWhatsapp: boolean;
  email: string;
  websiteUrl: string;
  birthDate: string;
  gender: string;
  nationality: string;
  companyRegistrationNumber: string;
  economicActivityCode: string;
  numberOfEmployees: string;
  urlImage: string;
  note: string;
  statusDefinitionId: string;
}

export interface ClientPayload {
  partyTypeId: number;
  acquisitionSourceTypeId: number;
  urlImage: string | null;
  note: string | null;
  name: string;
  phoneNumber: string | null;
  cellPhoneNumber: string | null;
  isCellPhoneWhatsapp: boolean;
  email: string | null;
  websiteUrl: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  companyRegistrationNumber: string | null;
  economicActivityCode: string | null;
  numberOfEmployees: number | null;
  statusDefinitionId: number;
  statusDomainId: 1;
}

export const CLIENT_STATUS_DOMAIN_ID = 1 as const;
export const CLIENT_INITIAL_STATUS_DEFINITION_ID = 4 as const;
export const CLIENT_NAME_MAX_LENGTH = 500;
export const CLIENT_IMAGE_URL_MAX_LENGTH = 500;
export const CLIENT_NOTE_MAX_LENGTH = 1000;
export function resolveClientStatusDefinitionId(
  mode: "create" | "update",
  detail?: Pick<ClientDetail, "statusDefinitionId" | "statusDomainId"> | null,
): number | null {
  if (mode === "create") return CLIENT_INITIAL_STATUS_DEFINITION_ID;
  if (!detail || detail.statusDomainId !== CLIENT_STATUS_DOMAIN_ID ||
      typeof detail.statusDefinitionId !== "number" || !Number.isInteger(detail.statusDefinitionId) || detail.statusDefinitionId <= 0) {
    return null;
  }
  return detail.statusDefinitionId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

export function normalizeClientRecord(value: unknown): ClientRecord | null {
  if (!isObject(value) || !Number.isInteger(value.id) || Number(value.id) <= 0 ||
      !nullableString(value.partyTypeName) || !nullableString(value.name) ||
      (value.phoneNumber !== undefined && !nullableString(value.phoneNumber)) || typeof value.isActive !== "boolean") return null;
  return {
    id: Number(value.id),
    partyTypeName: value.partyTypeName,
    name: value.name,
    phoneNumber: value.phoneNumber ?? null,
    isActive: value.isActive,
  };
}

export function normalizeClientPage(value: unknown): ClientPage | null {
  if (!isObject(value) || !Array.isArray(value.items) ||
      !Number.isInteger(value.pageNumber) || !Number.isInteger(value.pageSize) ||
      !Number.isInteger(value.totalItems) || !Number.isInteger(value.totalPages)) return null;
  const items: ClientRecord[] = [];
  for (const candidate of value.items) {
    const item = normalizeClientRecord(candidate);
    if (!item) return null;
    items.push(item);
  }
  return {
    items,
    pageNumber: Number(value.pageNumber),
    pageSize: Number(value.pageSize),
    totalItems: Number(value.totalItems),
    totalPages: Number(value.totalPages),
  };
}

export function normalizeClientDetail(value: unknown): ClientDetail | null {
  if (!isObject(value) || !Number.isInteger(value.id) || Number(value.id) <= 0 ||
      ![1, 2].includes(Number(value.partyTypeId)) ||
      !Number.isInteger(value.acquisitionSourceTypeId) || Number(value.acquisitionSourceTypeId) <= 0 ||
      !nullableString(value.partyType) || !nullableString(value.name) ||
      (value.phoneNumber !== undefined && !nullableString(value.phoneNumber)) ||
      (value.cellPhoneNumber !== undefined && !nullableString(value.cellPhoneNumber)) ||
      typeof value.isCellPhoneWhatsapp !== "boolean" || (value.email !== undefined && !nullableString(value.email)) ||
      (value.websiteUrl !== undefined && !nullableString(value.websiteUrl)) || (value.birthDate !== undefined && !nullableString(value.birthDate)) ||
      (value.gender !== undefined && !nullableString(value.gender)) || (value.nationality !== undefined && !nullableString(value.nationality)) ||
      (value.companyRegistrationNumber !== undefined && !nullableString(value.companyRegistrationNumber)) ||
      (value.economicActivityCode !== undefined && !nullableString(value.economicActivityCode)) ||
      (value.numberOfEmployees !== undefined && !nullableNumber(value.numberOfEmployees)) ||
      (value.urlImage !== undefined && !nullableString(value.urlImage)) ||
      (value.note !== undefined && !nullableString(value.note)) ||
      (value.statusDefinitionId !== undefined && !nullableNumber(value.statusDefinitionId)) ||
      !nullableString(value.statusDefinitionName) || !nullableNumber(value.statusDomainId) ||
      !nullableString(value.statusDomainName) || typeof value.isActive !== "boolean" ||
      typeof value.createdAt !== "string") return null;
  return {
    id: Number(value.id),
    partyTypeId: Number(value.partyTypeId) as PartyTypeId,
    partyType: value.partyType,
    partyTypeName: value.partyType,
    acquisitionSourceTypeId: Number(value.acquisitionSourceTypeId),
    acquisitionSourceType: nullableString(value.acquisitionSourceType) ? value.acquisitionSourceType : null,
    urlImage: value.urlImage ?? null,
    note: value.note ?? null,
    name: value.name,
    phoneNumber: value.phoneNumber ?? null,
    cellPhoneNumber: value.cellPhoneNumber ?? null,
    isCellPhoneWhatsapp: value.isCellPhoneWhatsapp,
    email: value.email ?? null,
    websiteUrl: value.websiteUrl ?? null,
    birthDate: value.birthDate ?? null,
    gender: value.gender ?? null,
    nationality: value.nationality ?? null,
    companyRegistrationNumber: value.companyRegistrationNumber ?? null,
    economicActivityCode: value.economicActivityCode ?? null,
    numberOfEmployees: value.numberOfEmployees ?? null,
    statusDefinitionId: value.statusDefinitionId ?? null,
    statusDefinitionName: value.statusDefinitionName,
    statusDomainId: value.statusDomainId,
    statusDomainName: value.statusDomainName,
    isActive: value.isActive,
    createdAt: value.createdAt,
  };
}

function normalizeCatalog(value: unknown, withDomain: boolean): CatalogOption[] | StatusDefinitionOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: CatalogOption[] = [];
  for (const candidate of value) {
    if (!isObject(candidate) || !Number.isInteger(candidate.id) || Number(candidate.id) <= 0 ||
        typeof candidate.name !== "string" || typeof candidate.isActive !== "boolean" ||
        !(candidate.languageCode === null || typeof candidate.languageCode === "string")) return null;
    if (withDomain && (!Number.isInteger(candidate.statusDomainId) || Number(candidate.statusDomainId) <= 0)) return null;
    options.push({
      id: Number(candidate.id),
      name: candidate.name,
      isActive: candidate.isActive,
      languageCode: candidate.languageCode ?? null,
      ...(withDomain ? { statusDomainId: Number(candidate.statusDomainId) } : {}),
    } as CatalogOption);
  }
  return options;
}

export function normalizeCatalogOptions(value: unknown): CatalogOption[] | null {
  return normalizeCatalog(value, false) as CatalogOption[] | null;
}

export function normalizeStatusDefinitionOptions(value: unknown): StatusDefinitionOption[] | null {
  return normalizeCatalog(value, true) as StatusDefinitionOption[] | null;
}

export function buildClientsQuery(input: {
  search: string;
  status: ClientStatusFilter;
  page: number;
  pageSize: number;
  sortBy: ClientSortField;
  sortDirection: "asc" | "desc";
}): URLSearchParams {
  const query = new URLSearchParams({
    Search: input.search.trim(),
    PageNumber: String(input.page),
    PageSize: String(input.pageSize),
    SortBy: input.sortBy,
    SortDirection: input.sortDirection,
  });
  if (input.status !== "all") query.set("IsActive", input.status === "active" ? "true" : "false");
  return query;
}

function optionalValue(value: string): string | null {
  return value.trim() || null;
}

export function validateClientForm(values: ClientFormValues, mode: "create" | "update"): string | null {
  const partyTypeId = Number(values.partyTypeId);
  const sourceId = Number(values.acquisitionSourceTypeId);
  const statusId = Number(values.statusDefinitionId);
  if (![1, 2].includes(partyTypeId)) return "partyTypeId";
  if (!Number.isInteger(sourceId) || sourceId <= 0) return "acquisitionSourceTypeId";
  if (!values.name.trim() || values.name.trim().length > CLIENT_NAME_MAX_LENGTH) return "name";
  if (!Number.isInteger(statusId) || statusId <= 0) return "statusDefinitionId";
  if (mode === "create" && values.urlImage.trim().length > CLIENT_IMAGE_URL_MAX_LENGTH) return "urlImage";
  if (mode === "create" && values.note.trim().length > CLIENT_NOTE_MAX_LENGTH) return "note";
  if (values.birthDate) {
    const birthDate = new Date(`${values.birthDate}T00:00:00`);
    if (!Number.isFinite(birthDate.getTime()) || birthDate.getTime() > new Date().setHours(0, 0, 0, 0)) return "birthDate";
  }
  if (values.numberOfEmployees.trim()) {
    const employees = Number(values.numberOfEmployees);
    if (!Number.isInteger(employees) || employees < 0) return "numberOfEmployees";
  }
  if (partyTypeId === 1 && (values.companyRegistrationNumber.trim() || values.economicActivityCode.trim() || values.numberOfEmployees.trim())) return "partyTypeConsistency";
  if (partyTypeId === 2 && (values.birthDate || values.gender.trim() || values.nationality.trim())) return "partyTypeConsistency";
  return null;
}

export function toClientPayload(values: ClientFormValues): ClientPayload {
  const partyTypeId = Number(values.partyTypeId) as PartyTypeId;
  const isIndividual = partyTypeId === 1;
  return {
    partyTypeId,
    acquisitionSourceTypeId: Number(values.acquisitionSourceTypeId),
    urlImage: optionalValue(values.urlImage),
    note: optionalValue(values.note),
    name: values.name.trim(),
    phoneNumber: optionalValue(values.phoneNumber),
    cellPhoneNumber: optionalValue(values.cellPhoneNumber),
    isCellPhoneWhatsapp: values.isCellPhoneWhatsapp,
    email: optionalValue(values.email),
    websiteUrl: optionalValue(values.websiteUrl),
    birthDate: isIndividual ? optionalValue(values.birthDate) : null,
    gender: isIndividual ? (values.gender || null) : null,
    nationality: isIndividual ? (values.nationality || null) : null,
    companyRegistrationNumber: isIndividual ? null : optionalValue(values.companyRegistrationNumber),
    economicActivityCode: isIndividual ? null : optionalValue(values.economicActivityCode),
    numberOfEmployees: isIndividual || !values.numberOfEmployees.trim() ? null : Number(values.numberOfEmployees),
    statusDefinitionId: Number(values.statusDefinitionId),
    statusDomainId: CLIENT_STATUS_DOMAIN_ID,
  };
}

export function normalizeCreatedClientId(value: unknown): number | null {
  return isObject(value) && Number.isInteger(value.id) && Number(value.id) > 0 ? Number(value.id) : null;
}

export function isClientUpdateSuccess(value: unknown): value is true {
  return value === true;
}

export function initialClientFormValues(): ClientFormValues {
  return {
    partyTypeId: "",
    acquisitionSourceTypeId: "",
    name: "",
    phoneNumber: "",
    cellPhoneNumber: "",
    isCellPhoneWhatsapp: false,
    email: "",
    websiteUrl: "",
    birthDate: "",
    gender: "",
    nationality: "",
    companyRegistrationNumber: "",
    economicActivityCode: "",
    numberOfEmployees: "",
    urlImage: "",
    note: "",
    statusDefinitionId: String(CLIENT_INITIAL_STATUS_DEFINITION_ID),
  };
}
