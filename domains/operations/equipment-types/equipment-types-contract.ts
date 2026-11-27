export interface EquipmentTypeRecord {
  id: number;
  name: string;
  isActive: boolean;
}

export interface EquipmentTypeDetail extends EquipmentTypeRecord {
  tenantId: number;
  description: string;
  createdAt: string;
}

export interface EquipmentTypePage {
  items: EquipmentTypeRecord[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type EquipmentTypeStatusFilter = "active" | "inactive" | "all";
export type EquipmentTypeSortField = "Id" | "Name" | "Description" | "IsActive" | "CreatedAt";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeEquipmentTypeRecord(value: unknown): EquipmentTypeRecord | null {
  if (!isObject(value) || !Number.isInteger(value.id) || Number(value.id) <= 0 ||
      typeof value.name !== "string" || typeof value.isActive !== "boolean") return null;
  return { id: Number(value.id), name: value.name, isActive: value.isActive };
}

export function normalizeEquipmentTypeDetail(value: unknown): EquipmentTypeDetail | null {
  if (!isObject(value)) return null;
  const record = normalizeEquipmentTypeRecord(value);
  if (!record || !Number.isInteger(value.tenantId) || typeof value.description !== "string" ||
      typeof value.createdAt !== "string" || Number(value.tenantId) <= 0) return null;
  return { ...record, tenantId: Number(value.tenantId), description: value.description, createdAt: value.createdAt };
}

export function normalizeEquipmentTypePage(value: unknown): EquipmentTypePage | null {
  if (!isObject(value) || !Array.isArray(value.items) ||
      ![value.pageNumber, value.pageSize, value.totalItems, value.totalPages].every(Number.isInteger)) return null;
  const items = value.items.map(normalizeEquipmentTypeRecord);
  if (items.some((item) => item === null)) return null;
  return {
    items: items as EquipmentTypeRecord[],
    pageNumber: Number(value.pageNumber),
    pageSize: Number(value.pageSize),
    totalItems: Number(value.totalItems),
    totalPages: Number(value.totalPages),
  };
}

export function buildEquipmentTypesQuery(input: {
  search: string;
  status: EquipmentTypeStatusFilter;
  page: number;
  pageSize: number;
  sortBy: EquipmentTypeSortField;
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

export function toEquipmentTypePayload(name: string, description: string, isActive: boolean) {
  return { name: name.trim(), description: description.trim(), isActive };
}

export function normalizeCreatedEquipmentTypeId(value: unknown): number | null {
  return isObject(value) && Number.isInteger(value.id) && Number(value.id) > 0 ? Number(value.id) : null;
}

export function validateEquipmentType(name: string, description: string): boolean {
  return name.trim().length > 0 && name.trim().length <= 200 && description.length <= 500;
}
