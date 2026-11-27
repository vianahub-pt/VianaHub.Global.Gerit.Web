export interface RoleRecord {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export type RoleStatusFilter = "active" | "inactive" | "all";
export type RoleGrant = "GetPaged" | "GetBy" | "GetAll" | "Create" | "Update" | "Activate" | "Deactivate" | "Delete" | "BulkUpload";
export type RolePermissionCheck = (resource: string, action: string) => boolean;

const ROLE_MANAGER_ROLES = new Set(["admin", "backoffice", "manager"]);

export function buildRoleAccess(roles: string[], hasPermission: RolePermissionCheck) {
  const canManage = roles.some((role) => ROLE_MANAGER_ROLES.has(role.trim().toLowerCase()));
  const hasGrant = (grant: RoleGrant) => canManage && hasPermission("Roles", grant);
  return {
    canManage,
    getPaged: hasGrant("GetPaged"),
    getBy: hasGrant("GetBy"),
    getAll: hasGrant("GetAll"),
    create: hasGrant("Create"),
    update: hasGrant("Update"),
    activate: hasGrant("Activate"),
    deactivate: hasGrant("Deactivate"),
    delete: hasGrant("Delete"),
    bulkUpload: hasGrant("BulkUpload"),
  };
}

export function normalizeRole(payload: unknown): RoleRecord | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.id !== "number" || candidate.id <= 0 ||
    typeof candidate.name !== "string" || !candidate.name.trim() ||
    (typeof candidate.description !== "string" && candidate.description !== null) ||
    typeof candidate.isActive !== "boolean"
  ) return null;
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    isActive: candidate.isActive,
  };
}

export function normalizeRoleSummary(payload: unknown): RoleRecord | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.description === "string" || candidate.description === null) {
    return normalizeRole(payload);
  }
  return normalizeRole({ ...candidate, description: null });
}

export function buildRolesQuery(input: {
  search: string;
  page: number;
  pageSize: number;
  sortDirection: "asc" | "desc";
  status: RoleStatusFilter;
}) {
  const query = new URLSearchParams({
    Search: input.search.trim(),
    PageNumber: String(input.page),
    PageSize: String(input.pageSize),
    SortBy: "Name",
    SortDirection: input.sortDirection,
  });
  if (input.status === "active") query.set("IsActive", "true");
  if (input.status === "inactive") query.set("IsActive", "false");
  return query;
}

export const ROLE_NAME_MAX_LENGTH = 100;
export const ROLE_DESCRIPTION_MAX_LENGTH = 255;

export function validateRoleForm(name: string, description: string) {
  const normalizedName = name.trim();
  const normalizedDescription = description.trim();
  if (!normalizedName) return "nameRequired" as const;
  if (normalizedName.length > ROLE_NAME_MAX_LENGTH) return "nameTooLong" as const;
  if (!normalizedDescription) return "descriptionRequired" as const;
  if (normalizedDescription.length > ROLE_DESCRIPTION_MAX_LENGTH) return "descriptionTooLong" as const;
  return null;
}

export function toRoleCreatePayload(name: string, description: string, isActive = true) {
  return {
    name: name.trim(),
    description: description.trim(),
    isActive,
  };
}

export function toRoleUpdatePayload(description: string, isActive: boolean) {
  return {
    description: description.trim(),
    isActive,
  };
}
