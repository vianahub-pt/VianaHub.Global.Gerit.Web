import assert from "node:assert/strict";
import { test } from "node:test";
import { hasClaimPermission } from "../../platform/auth/permission-claims.ts";

test("API lowercase permission claims match case-insensitively without granting absent actions", () => {
  const permissions = { users: ["create", "update"] };
  assert.equal(hasClaimPermission(permissions, "Users", "Create"), true);
  assert.equal(hasClaimPermission(permissions, "USERS", "update"), true);
  assert.equal(hasClaimPermission(permissions, "Users", "Delete"), false);
  assert.equal(hasClaimPermission({}, "Users", "Create"), false);
  assert.equal(hasClaimPermission({ Users: null }, "Users", "Create"), false);
});