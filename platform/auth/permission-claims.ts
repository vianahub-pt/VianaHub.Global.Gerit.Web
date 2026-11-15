export type PermissionClaims = Record<string, string[]>;

export function hasClaimPermission(
  permissions: PermissionClaims,
  resource: string,
  action: string,
): boolean {
  const normalizedResource = resource.trim().toLowerCase();
  const normalizedAction = action.trim().toLowerCase();
  const entry = Object.entries(permissions).find(
    ([claimResource]) => claimResource.trim().toLowerCase() === normalizedResource,
  );
  const allowedActions = entry?.[1];
  return Array.isArray(allowedActions) && allowedActions.some(
    (claimAction) => typeof claimAction === "string" && claimAction.trim().toLowerCase() === normalizedAction,
  );
}
