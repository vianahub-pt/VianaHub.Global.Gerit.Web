export const LEGACY_USER_PREFERENCES_CURRENT_KEY =
  "gerit.user-preferences.current";
const USER_PREFERENCES_STORAGE_KEY_PREFIX = "gerit.user-preferences.v1";

export interface UserPreferencesStorageReader {
  getItem(key: string): string | null;
}

export interface UserPreferencesIdentity {
  tenantId: number;
  userId: number;
}

export function getUserPreferencesSessionKey(
  identity: UserPreferencesIdentity | null,
) {
  return identity ? `${identity.tenantId}:${identity.userId}` : null;
}

export function getUserPreferencesStorageKey(sessionKey: string) {
  return `${USER_PREFERENCES_STORAGE_KEY_PREFIX}.${sessionKey}`;
}

export function readUserPreferencesStorageSnapshot<T>(
  storage: UserPreferencesStorageReader,
  sessionKey: string,
): T | null {
  const rawSnapshot = storage.getItem(getUserPreferencesStorageKey(sessionKey));

  if (!rawSnapshot) {
    return null;
  }

  try {
    const snapshot = JSON.parse(rawSnapshot) as unknown;
    return typeof snapshot === "object" && snapshot !== null
      ? (snapshot as T)
      : null;
  } catch {
    return null;
  }
}
