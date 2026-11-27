import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRoleAccess,
  buildRolesQuery,
  validateRoleForm,
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

test("create and update payloads include API-supported IsActive without TenantId", () => {
  const createActive = toRoleCreatePayload(" Manager ", " Approves ", true);
  const createInactive = toRoleCreatePayload(" Reviewer ", " Reviews ", false);
  const update = toRoleUpdatePayload(" Updated ", false);
  assert.deepEqual(createActive, { name: "Manager", description: "Approves", isActive: true });
  assert.deepEqual(createInactive, { name: "Reviewer", description: "Reviews", isActive: false });
  assert.deepEqual(update, { description: "Updated", isActive: false });
  assert.equal("TenantId" in createActive || "tenantId" in createActive, false);
  assert.equal("TenantId" in update || "tenantId" in update, false);
});

test("validates required role fields and API limits", () => {
  assert.equal(validateRoleForm("  ", "Description"), "nameRequired");
  assert.equal(validateRoleForm("Name", "  "), "descriptionRequired");
  assert.equal(validateRoleForm("x".repeat(101), "Description"), "nameTooLong");
  assert.equal(validateRoleForm("Name", "x".repeat(256)), "descriptionTooLong");
  assert.equal(validateRoleForm("x".repeat(100), "x".repeat(255)), null);
});

test("Role access requires both an authorized base role and each operation grant", () => {
  const grant = (allowed) => (_resource, action) => allowed.includes(action);
  const full = buildRoleAccess(["Manager"], grant(["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete", "BulkUpload"]));
  assert.equal(full.getPaged && full.getBy && full.create && full.update && full.activate && full.deactivate && full.delete && full.bulkUpload, true);
  const noRole = buildRoleAccess(["User"], grant(["GetPaged", "Create", "Delete"]));
  assert.equal(noRole.getPaged || noRole.create || noRole.delete, false);
  const partial = buildRoleAccess(["Admin"], grant(["GetPaged", "GetBy"]));
  assert.equal(partial.getPaged, true);
  assert.equal(partial.getBy, true);
  assert.equal(partial.create || partial.update || partial.delete || partial.bulkUpload, false);
});
