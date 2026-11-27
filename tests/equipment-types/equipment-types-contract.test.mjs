import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEquipmentTypesQuery,
  normalizeCreatedEquipmentTypeId,
  normalizeEquipmentTypeDetail,
  normalizeEquipmentTypePage,
  toEquipmentTypePayload,
  validateEquipmentType,
} from "../../domains/operations/equipment-types/equipment-types-contract.ts";

test("paged filters match the API and omit IsActive for all statuses", () => {
  const base = { search: "  pump ", status: "all", page: 2, pageSize: 20, sortBy: "Name", sortDirection: "asc" };
  const all = buildEquipmentTypesQuery(base);
  assert.equal(all.get("Search"), "pump");
  assert.equal(all.get("PageNumber"), "2");
  assert.equal(all.get("PageSize"), "20");
  assert.equal(all.get("SortBy"), "Name");
  assert.equal(all.get("SortDirection"), "asc");
  assert.equal(all.has("IsActive"), false);
  assert.equal(buildEquipmentTypesQuery({ ...base, status: "active" }).get("IsActive"), "true");
  assert.equal(buildEquipmentTypesQuery({ ...base, status: "inactive" }).get("IsActive"), "false");
});

test("request payload explicitly carries status without tenant identity", () => {
  const payload = toEquipmentTypePayload(" Pump ", " Heavy duty ", false);
  assert.deepEqual(payload, { name: "Pump", description: "Heavy duty", isActive: false });
  assert.deepEqual(Object.keys(payload).sort(), ["description", "isActive", "name"]);
  assert.equal("tenantId" in payload, false);
  assert.equal("TenantId" in payload, false);
  assert.deepEqual(toEquipmentTypePayload("Pump", "", true), { name: "Pump", description: "", isActive: true });
});

test("API response normalizers reject incompatible contracts", () => {
  assert.deepEqual(normalizeEquipmentTypePage({
    items: [{ id: 7, name: "Pump", isActive: true }], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1,
  }), { items: [{ id: 7, name: "Pump", isActive: true }], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
  assert.equal(normalizeEquipmentTypePage({ items: [{}], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 }), null);
  assert.deepEqual(normalizeEquipmentTypeDetail({ id: 7, tenantId: 2, name: "Pump", description: "", isActive: true, createdAt: "2026-01-01T00:00:00Z" }), {
    id: 7, tenantId: 2, name: "Pump", description: "", isActive: true, createdAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(normalizeEquipmentTypeDetail({ id: 7, name: "Pump" }), null);
  assert.equal(normalizeCreatedEquipmentTypeId({ id: 42 }), 42);
  assert.equal(normalizeCreatedEquipmentTypeId({ id: "42" }), null);
});

test("validation mirrors EquipmentTypes API limits", () => {
  assert.equal(validateEquipmentType("Pump", ""), true);
  assert.equal(validateEquipmentType(" ", "Description"), false);
  assert.equal(validateEquipmentType("x".repeat(201), "Description"), false);
  assert.equal(validateEquipmentType("Pump", "x".repeat(501)), false);
});
