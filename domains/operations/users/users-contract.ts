export interface UserRecord {
  id: number;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  lastAccessAt: string | null;
  isActive: boolean;
}

export interface UserDetail extends UserRecord {
  urlImage: string | null;
  isDeleted: boolean;
  createdBy: number;
  createdAt: string;
  modifiedBy: number | null;
  modifiedAt: string | null;
}

export type UserStatusFilter = "active" | "inactive" | "all";
export type UserSortField = "Id" | "Name" | "PhoneNumber" | "LastAccessAt" | "IsActive";
export const USER_CREATE_PHONE_MAX_LENGTH = 50;
export const USER_UPDATE_PHONE_MAX_LENGTH = 20;

export interface UserPage {
  items: UserRecord[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function normalizeUserRecord(value: unknown): UserRecord | null {
  if (!isObject(value) || typeof value.id !== "number" || value.id <= 0 ||
      typeof value.name !== "string" || typeof value.isActive !== "boolean" ||
      !nullableString(value.email) || !nullableString(value.phoneNumber) ||
      !nullableString(value.lastAccessAt)) return null;
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    phoneNumber: value.phoneNumber,
    lastAccessAt: value.lastAccessAt,
    isActive: value.isActive,
  };
}

export function normalizeUserDetail(value: unknown): UserDetail | null {
  if (!isObject(value)) return null;
  const record = normalizeUserRecord(value);
  if (!record || !nullableString(value.urlImage) ||
      typeof value.isDeleted !== "boolean" || typeof value.createdBy !== "number" ||
      typeof value.createdAt !== "string" ||
      !(value.modifiedBy === null || typeof value.modifiedBy === "number") ||
      !nullableString(value.modifiedAt)) return null;
  return {
    ...record,
    urlImage: value.urlImage,
    isDeleted: value.isDeleted,
    createdBy: value.createdBy,
    createdAt: value.createdAt,
    modifiedBy: value.modifiedBy,
    modifiedAt: value.modifiedAt,
  };
}

export function normalizeUserPage(value: unknown): UserPage | null {
  if (!isObject(value) || !Array.isArray(value.items) ||
      typeof value.pageNumber !== "number" || typeof value.pageSize !== "number" ||
      typeof value.totalItems !== "number" || typeof value.totalPages !== "number") return null;
  const items: UserRecord[] = [];
  for (const rawItem of value.items) {
    const item = normalizeUserRecord(rawItem);
    if (!item) return null;
    items.push(item);
  }
  return {
    items,
    pageNumber: value.pageNumber,
    pageSize: value.pageSize,
    totalItems: value.totalItems,
    totalPages: value.totalPages,
  };
}

export function buildUsersQuery(input: {
  search: string;
  status: UserStatusFilter;
  page: number;
  pageSize: number;
  sortBy: UserSortField;
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

export function toUserCreatePayload(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
  phoneNumber: string,
  urlImage: string,
) {
  return {
    name: name.trim(),
    email: email.trim(),
    password,
    confirmPassword,
    phoneNumber: phoneNumber.trim() || null,
    urlImage: urlImage.trim() || null,
  };
}

export function toUserUpdatePayload(
  name: string,
  email: string,
  phoneNumber: string,
  urlImage: string,
) {
  return {
    name: name.trim(),
    email: email.trim(),
    phoneNumber: phoneNumber.trim() || null,
    urlImage: urlImage.trim() || null,
  };
}

export function toUserPasswordPayload(currentPassword: string, newPassword: string) {
  return { currentPassword, newPassword };
}

export function isUserUpdateSuccess(value: unknown): value is true {
  return value === true;
}

export function normalizeCreatedUserId(value: unknown): number | null {
  return isObject(value) && typeof value.id === "number" && Number.isInteger(value.id) && value.id > 0
    ? value.id
    : null;
}

export function validatePassword(value: string): boolean {
  return value.length >= 8 && value.length <= 100 &&
    /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^a-zA-Z0-9]/.test(value);
}

export function isUserPhoneNumberLengthValid(value: string, editing: boolean): boolean {
  return value.length <= (editing ? USER_UPDATE_PHONE_MAX_LENGTH : USER_CREATE_PHONE_MAX_LENGTH);
}

export function validateUserImageUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username && !url.password && value.length <= 500;
  } catch {
    return false;
  }
}
