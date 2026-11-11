import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getUserPreferencesSessionKey,
  getUserPreferencesStorageKey,
  LEGACY_USER_PREFERENCES_CURRENT_KEY,
  readUserPreferencesStorageSnapshot,
} from "../../platform/storage/user-preferences-cache.ts";

function createStorage(entries) {
  const values = new Map(entries);
  return { getItem: (key) => values.get(key) ?? null };
}

test("preference cache keys are isolated by tenant and user", () => {
  const identityA = { tenantId: 10, userId: 101 };
  const identityOtherUser = { tenantId: 10, userId: 202 };
  const identityOtherTenant = { tenantId: 20, userId: 101 };
  const keyA = getUserPreferencesSessionKey(identityA);

  assert.equal(keyA, "10:101");
  assert.notEqual(keyA, getUserPreferencesSessionKey(identityOtherUser));
  assert.notEqual(keyA, getUserPreferencesSessionKey(identityOtherTenant));
  assert.equal(getUserPreferencesSessionKey(null), null);
});

test("cache reader ignores another identity and the legacy unscoped mirror", () => {
  const identityASnapshot = { timeFormat: "12h" };
  const keyA = getUserPreferencesSessionKey({ tenantId: 10, userId: 101 });
  const keyOtherUser = getUserPreferencesSessionKey({ tenantId: 10, userId: 202 });
  const keyOtherTenant = getUserPreferencesSessionKey({ tenantId: 20, userId: 101 });
  const storage = createStorage([
    [getUserPreferencesStorageKey(keyA), JSON.stringify(identityASnapshot)],
    [LEGACY_USER_PREFERENCES_CURRENT_KEY, JSON.stringify({ timeFormat: "24h" })],
  ]);

  assert.deepEqual(
    readUserPreferencesStorageSnapshot(storage, keyA),
    identityASnapshot,
  );
  assert.equal(readUserPreferencesStorageSnapshot(storage, keyOtherUser), null);
  assert.equal(readUserPreferencesStorageSnapshot(storage, keyOtherTenant), null);
});

test("cache reader ignores invalid snapshots instead of reusing them", () => {
  const key = getUserPreferencesSessionKey({ tenantId: 10, userId: 101 });
  const storage = createStorage([[getUserPreferencesStorageKey(key), "not-json"]]);

  assert.equal(readUserPreferencesStorageSnapshot(storage, key), null);
});
