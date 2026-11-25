import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyActionCreateFormState,
  isActionForRoute,
  isLatestActionRequest,
  normalizeActionDetail,
  toActionCreatePayload,
  toActionUpdateFormState,
  toActionUpdatePayload,
} from "../../domains/operations/actions/action-contract.ts";

const action = {
  id: 8,
  name: "GetActive",
  description: "Obter registros ativos.",
  isActive: true,
};

test("normalizes the current Action detail contract", () => {
  assert.deepEqual(normalizeActionDetail(action), action);
});

test("rejects incomplete detail responses instead of presenting blank form values", () => {
  assert.equal(normalizeActionDetail({ id: 8, name: "GetActive", isActive: true }), null);
});

test("maps only the editable description into the update form", () => {
  const detail = normalizeActionDetail(action);
  assert.ok(detail);
  assert.deepEqual(toActionUpdateFormState(detail), {
    description: "Obter registros ativos.",
    isActive: true,
  });
  assert.equal("name" in toActionUpdateFormState(detail), false);
});

test("creates an update payload containing the description and selected status", () => {
  assert.deepEqual(toActionUpdatePayload("Descrição alterada.", false), {
    description: "Descrição alterada.",
    isActive: false,
  });
  assert.equal("name" in toActionUpdatePayload("Descrição alterada.", false), false);
});

test("defaults Action creation to the API default and includes an explicit status in create payloads", () => {
  assert.deepEqual(emptyActionCreateFormState, { name: "", description: "", isActive: true });
  assert.deepEqual(toActionCreatePayload("Manage Users", "Description", true), {
    name: "Manage Users", description: "Description", isActive: true,
  });
  assert.deepEqual(toActionCreatePayload("Manage Users", "Description", false), {
    name: "Manage Users", description: "Description", isActive: false,
  });
});

test("preserves the Action name and loaded status while building an update payload", () => {
  const detail = normalizeActionDetail(action);
  assert.ok(detail);
  const payload = toActionUpdatePayload("Nova descrição.", detail.isActive);
  assert.equal(detail.name, "GetActive");
  assert.deepEqual(payload, { description: "Nova descrição.", isActive: true });
});

test("accepts details only for the ID in the current route", () => {
  const detail = normalizeActionDetail(action);
  assert.ok(detail);
  assert.equal(isActionForRoute(detail, 8), true);
  assert.equal(isActionForRoute(detail, 9), false);
});

test("ignores responses from an earlier detail request", () => {
  assert.equal(isLatestActionRequest(4, 5), false);
  assert.equal(isLatestActionRequest(5, 5), true);
});
