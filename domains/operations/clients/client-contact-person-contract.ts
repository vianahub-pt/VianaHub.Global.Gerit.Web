export type ClientContactStatusFilter = "all" | "active" | "inactive";

export interface ClientContactPersonSummary {
  id: number;
  name: string;
  cellPhoneNumber: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ClientContactPersonDetail extends ClientContactPersonSummary {
  clientId: number;
  email: string;
  phoneNumber: string | null;
  isWhatsapp: boolean;
  jobTitle: string | null;
  department: string | null;
  isCellPhoneWhatsapp: boolean;
  createdAt: string;
}

export interface ClientContactPersonPage {
  items: ClientContactPersonSummary[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ClientContactPersonFormValues {
  name: string;
  email: string;
  phoneNumber: string;
  cellPhoneNumber: string;
  hasCellPhoneWhatsapp: boolean;
  jobTitle: string;
  department: string;
  isPrimary: boolean;
}

export interface ClientContactPersonPayload {
  name: string;
  email: string;
  phoneNumber: string | null;
  cellPhoneNumber: string | null;
  isWhatsapp: boolean;
  jobTitle: string | null;
  department: string | null;
  isCellPhoneWhatsapp: boolean;
  isPrimary: boolean;
}

export const CLIENT_CONTACT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const CLIENT_CONTACT_NAME_MAX_LENGTH = 150;
export const CLIENT_CONTACT_EMAIL_MAX_LENGTH = 255;
export const CLIENT_CONTACT_PHONE_MAX_LENGTH = 50;
export const CLIENT_CONTACT_JOB_TITLE_MAX_LENGTH = 100;
export const CLIENT_CONTACT_DEPARTMENT_MAX_LENGTH = 100;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function normalizeClientContactPersonSummary(value: unknown): ClientContactPersonSummary | null {
  const candidate = record(value);
  if (!candidate || !Number.isInteger(candidate.id) || typeof candidate.name !== "string" ||
      typeof candidate.isPrimary !== "boolean" || typeof candidate.isActive !== "boolean") return null;
  return {
    id: candidate.id as number,
    name: candidate.name,
    cellPhoneNumber: nullableString(candidate.cellPhoneNumber),
    isPrimary: candidate.isPrimary,
    isActive: candidate.isActive,
  };
}

export function normalizeClientContactPersonDetail(value: unknown, expectedClientId: number): ClientContactPersonDetail | null {
  const candidate = record(value);
  const summary = normalizeClientContactPersonSummary(value);
  if (!candidate || !summary || candidate.clientId !== expectedClientId ||
      typeof candidate.email !== "string" || typeof candidate.isCellPhoneWhatsapp !== "boolean" ||
      typeof candidate.isWhatsapp !== "boolean" || typeof candidate.createdAt !== "string") return null;
  return {
    ...summary,
    clientId: expectedClientId,
    email: candidate.email,
    phoneNumber: nullableString(candidate.phoneNumber),
    isWhatsapp: candidate.isWhatsapp,
    jobTitle: nullableString(candidate.jobTitle),
    department: nullableString(candidate.department),
    isCellPhoneWhatsapp: candidate.isCellPhoneWhatsapp,
    createdAt: candidate.createdAt,
  };
}

export function normalizeClientContactPersonPage(value: unknown): ClientContactPersonPage | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.items)) return null;
  const items = candidate.items.map(normalizeClientContactPersonSummary);
  if (items.some((item) => item === null) ||
      !Number.isInteger(candidate.pageNumber) || !Number.isInteger(candidate.pageSize) ||
      !Number.isInteger(candidate.totalItems) || !Number.isInteger(candidate.totalPages)) return null;
  return {
    items: items as ClientContactPersonSummary[],
    pageNumber: candidate.pageNumber as number,
    pageSize: candidate.pageSize as number,
    totalItems: candidate.totalItems as number,
    totalPages: candidate.totalPages as number,
  };
}

export function buildClientContactPersonQuery(input: {
  search: string;
  status: ClientContactStatusFilter;
  page: number;
  pageSize: number;
  sortDirection: "asc" | "desc";
}): URLSearchParams {
  const query = new URLSearchParams({
    Search: input.search.trim(),
    PageNumber: String(input.page),
    PageSize: String(input.pageSize),
    SortBy: "Name",
    SortDirection: input.sortDirection,
  });
  if (input.status !== "all") query.set("IsActive", String(input.status === "active"));
  return query;
}

export function initialClientContactPersonFormValues(): ClientContactPersonFormValues {
  return {
    name: "",
    email: "",
    phoneNumber: "",
    cellPhoneNumber: "",
    hasCellPhoneWhatsapp: false,
    jobTitle: "",
    department: "",
    isPrimary: false,
  };
}

export function clientContactPersonFormFromDetail(detail: ClientContactPersonDetail): ClientContactPersonFormValues {
  return {
    name: detail.name,
    email: detail.email,
    phoneNumber: detail.phoneNumber ?? "",
    cellPhoneNumber: detail.cellPhoneNumber ?? "",
    hasCellPhoneWhatsapp: detail.isCellPhoneWhatsapp || detail.isWhatsapp,
    jobTitle: detail.jobTitle ?? "",
    department: detail.department ?? "",
    isPrimary: detail.isPrimary,
  };
}

export function validateClientContactPersonForm(values: ClientContactPersonFormValues): string | null {
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phoneNumber.trim();
  const cellPhone = values.cellPhoneNumber.trim();
  const jobTitle = values.jobTitle.trim();
  const department = values.department.trim();
  if (!name) return "nameRequired";
  if (name.length > CLIENT_CONTACT_NAME_MAX_LENGTH) return "nameMaximumLength";
  if (!email) return "emailRequired";
  if (email.length > CLIENT_CONTACT_EMAIL_MAX_LENGTH) return "emailMaximumLength";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "emailInvalid";
  if (phone.length > CLIENT_CONTACT_PHONE_MAX_LENGTH) return "phoneMaximumLength";
  if (cellPhone.length > CLIENT_CONTACT_PHONE_MAX_LENGTH) return "cellPhoneMaximumLength";
  if (values.hasCellPhoneWhatsapp && !cellPhone) return "cellPhoneRequiredForWhatsapp";
  if (jobTitle.length > CLIENT_CONTACT_JOB_TITLE_MAX_LENGTH) return "jobTitleMaximumLength";
  if (department.length > CLIENT_CONTACT_DEPARTMENT_MAX_LENGTH) return "departmentMaximumLength";
  return null;
}

export function toClientContactPersonPayload(values: ClientContactPersonFormValues): ClientContactPersonPayload {
  const hasWhatsapp = values.hasCellPhoneWhatsapp;
  const optional = (value: string) => value.trim() || null;
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phoneNumber: optional(values.phoneNumber),
    cellPhoneNumber: optional(values.cellPhoneNumber),
    isWhatsapp: hasWhatsapp,
    jobTitle: optional(values.jobTitle),
    department: optional(values.department),
    isCellPhoneWhatsapp: hasWhatsapp,
    isPrimary: values.isPrimary,
  };
}
