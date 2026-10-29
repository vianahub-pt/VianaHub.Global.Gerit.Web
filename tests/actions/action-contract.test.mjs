import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isActionForRoute,
  isLatestActionRequest,
  normalizeActionDetail,
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
  });
  assert.equal("name" in toActionUpdateFormState(detail), false);
});

test("creates an update payload containing only the editable description", () => {
  assert.deepEqual(toActionUpdatePayload("Descrição alterada."), {
    description: "Descrição alterada.",
  });
  assert.equal("name" in toActionUpdatePayload("Descrição alterada."), false);
});

test("preserves the Action name in the detail contract while building an update payload", () => {
  const detail = normalizeActionDetail(action);
  assert.ok(detail);
  const payload = toActionUpdatePayload("Nova descrição.");
  assert.equal(detail.name, "GetActive");
  assert.deepEqual(payload, { description: "Nova descrição." });
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
