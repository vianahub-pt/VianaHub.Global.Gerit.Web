export function missingRequiredPermissionGrants(
  claims: unknown,
  resource: string,
  allowedRoles: string[],
  requiredActions: string[],
): string[] {
  if (typeof claims !== "object" || claims === null) return ["permission claims"];
  const record = claims as { role?: unknown; permissions?: unknown };
  const roleValues = Array.isArray(record.role) ? record.role : [record.role];
  const normalizedRoles = roleValues
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.trim().toLowerCase());
  const allowed = allowedRoles.map((role) => role.trim().toLowerCase());
  const missing: string[] = [];
  if (!normalizedRoles.some((role) => allowed.includes(role))) {
    missing.push(allowedRoles.join("/") + " role");
  }

  const permissions = typeof record.permissions === "object" && record.permissions !== null
    ? record.permissions as Record<string, unknown>
    : {};
  const entry = Object.entries(permissions).find(([name]) => name.trim().toLowerCase() === resource.trim().toLowerCase())?.[1];
  const granted = Array.isArray(entry)
    ? entry.filter((action): action is string => typeof action === "string").map((action) => action.trim().toLowerCase())
    : [];
  for (const action of requiredActions) {
    if (!granted.includes(action.trim().toLowerCase())) missing.push(action);
  }
  return missing;
}
