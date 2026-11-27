import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyResourceCreateFormState,
  isResourceForRoute,
  isLatestResourceRequest,
  normalizeResourceDetail,
  toResourceCreatePayload,
  toResourceUpdateFormState,
  toResourceUpdatePayload,
} from "../../domains/operations/resources/resource-contract.ts";

const resource = {
  id: 8,
  name: "GetActive",
  description: "Obter registros ativos.",
  isActive: true,
};

test("normalizes the current Resource detail contract", () => {
  assert.deepEqual(normalizeResourceDetail(resource), resource);
});

test("rejects incomplete detail responses instead of presenting blank form values", () => {
  assert.equal(normalizeResourceDetail({ id: 8, name: "GetActive", isActive: true }), null);
  assert.equal(normalizeResourceDetail({ ...resource, description: null }), null);
});

test("maps only the editable description into the update form", () => {
  const detail = normalizeResourceDetail(resource);
  assert.ok(detail);
  assert.deepEqual(toResourceUpdateFormState(detail), {
    description: "Obter registros ativos.",
    isActive: true,
  });
  assert.equal("name" in toResourceUpdateFormState(detail), false);
});

test("creates an update payload containing the description and selected status", () => {
  assert.deepEqual(toResourceUpdatePayload("Descrição alterada.", false), {
    description: "Descrição alterada.",
    isActive: false,
  });
  assert.equal("name" in toResourceUpdatePayload("Descrição alterada.", false), false);
});

test("defaults Resource creation to the API default and includes an explicit status in create payloads", () => {
  assert.deepEqual(emptyResourceCreateFormState, { name: "", description: "", isActive: true });
  assert.deepEqual(toResourceCreatePayload("Manage Users", "Description", true), {
    name: "Manage Users", description: "Description", isActive: true,
  });
  assert.deepEqual(toResourceCreatePayload("Manage Users", "Description", false), {
    name: "Manage Users", description: "Description", isActive: false,
  });
});

test("preserves the Resource name and loaded status while building an update payload", () => {
  const detail = normalizeResourceDetail(resource);
  assert.ok(detail);
  const payload = toResourceUpdatePayload("Nova descrição.", detail.isActive);
  assert.equal(detail.name, "GetActive");
  assert.deepEqual(payload, { description: "Nova descrição.", isActive: true });
});

test("accepts details only for the ID in the current route", () => {
  const detail = normalizeResourceDetail(resource);
  assert.ok(detail);
  assert.equal(isResourceForRoute(detail, 8), true);
  assert.equal(isResourceForRoute(detail, 9), false);
});

test("ignores responses from an earlier detail request", () => {
  assert.equal(isLatestResourceRequest(4, 5), false);
  assert.equal(isLatestResourceRequest(5, 5), true);
});
