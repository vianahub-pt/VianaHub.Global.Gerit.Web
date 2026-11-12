export interface RoleRecord {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export type RoleStatusFilter = "active" | "inactive" | "all";

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

export function toRoleCreatePayload(name: string, description: string) {
  return {
    name: name.trim(),
    description: description.trim() ? description.trim() : null,
  };
}

export function toRoleUpdatePayload(description: string) {
  return { description: description.trim() ? description.trim() : null };
}
