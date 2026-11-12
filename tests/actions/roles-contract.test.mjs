import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRolesQuery,
  normalizeRole,
  normalizeRoleSummary,
  toRoleCreatePayload,
  toRoleUpdatePayload,
} from "../../domains/operations/roles/roles-contract.ts";

const queryBase = { search: "  manager ", page: 2, pageSize: 20, sortDirection: "desc" };

test("All omits IsActive entirely", () => {
  const query = buildRolesQuery({ ...queryBase, status: "all" });
  assert.equal(query.has("IsActive"), false);
  assert.equal(query.toString().includes("IsActive="), false);
  assert.equal(query.get("Search"), "manager");
});

test("Active and Inactive send the exact IsActive boolean values", () => {
  assert.equal(buildRolesQuery({ ...queryBase, status: "active" }).get("IsActive"), "true");
  assert.equal(buildRolesQuery({ ...queryBase, status: "inactive" }).get("IsActive"), "false");
});

test("normalizes paged summaries and full role details", () => {
  assert.deepEqual(normalizeRoleSummary({ id: 5, name: "Manager", isActive: true }), {
    id: 5, name: "Manager", description: null, isActive: true,
  });
  assert.deepEqual(normalizeRole({ id: 5, name: "Manager", description: "Approves", isActive: true }), {
    id: 5, name: "Manager", description: "Approves", isActive: true,
  });
  assert.equal(normalizeRole({ id: 0, name: "Manager", description: null, isActive: true }), null);
});

test("create and update payloads match the API DTOs without TenantId", () => {
  const create = toRoleCreatePayload(" Manager ", " Approves ");
  const update = toRoleUpdatePayload(" Updated ");
  assert.deepEqual(create, { name: "Manager", description: "Approves" });
  assert.deepEqual(Object.keys(create).sort(), ["description", "name"]);
  assert.deepEqual(update, { description: "Updated" });
  assert.deepEqual(Object.keys(update), ["description"]);
  assert.equal("TenantId" in create || "tenantId" in create, false);
  assert.equal("TenantId" in update || "tenantId" in update, false);
});
