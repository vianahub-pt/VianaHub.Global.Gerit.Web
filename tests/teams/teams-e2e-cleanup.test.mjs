import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverCsvTeamIds, reconcileTeamsRun } from "../e2e/helpers/teams-cleanup.ts";

function page(items, pageNumber, totalPages, totalItems, status = 200) {
  return {
    status,
    body: { items, pageNumber, pageSize: 100, totalItems, totalPages },
  };
}

test("CSV reconciliation scans every page and matches the exact synthetic name", async () => {
  const calls = [];
  const ids = await discoverCsvTeamIds("E2E CSV run-uuid", async (pageNumber) => {
    calls.push(pageNumber);
    return pageNumber === 1
      ? page([{ id: 10, name: "E2E CSV run-uuid extra" }], 1, 2, 2)
      : page([{ id: 42, name: "E2E CSV run-uuid" }], 2, 2, 2);
  }, 1);

  assert.deepEqual(ids, [42]);
  assert.deepEqual(calls, [1, 2]);
});

test("failed CSV discovery fails cleanup and still removes known run-owned IDs", async () => {
  const deleted = [];
  const result = await reconcileTeamsRun({
    knownIds: [17],
    csvImportAttempted: true,
    csvName: "E2E CSV run-uuid",
    api: {
      getPage: async () => null,
      deleteById: async (id) => {
        deleted.push(id);
        return { status: 200, body: null };
      },
      getById: async () => ({ status: 410, body: null }),
    },
  });

  assert.deepEqual(deleted, [17]);
  assert.deepEqual(result.cleanedIds, [17]);
  assert.deepEqual(result.pendingIdentifiers, ["E2E CSV run-uuid"]);
  assert.match(result.errors.join(" "), /could not reconcile E2E CSV run-uuid/);
});

test("successful import must reconcile one exact ID before deleting it", async () => {
  const deleted = [];
  const result = await reconcileTeamsRun({
    knownIds: [],
    csvImportAttempted: true,
    csvName: "E2E CSV run-uuid",
    api: {
      getPage: async () => page([{ id: 88, name: "E2E CSV run-uuid" }], 1, 1, 1),
      deleteById: async (id) => {
        deleted.push(id);
        return { status: 200, body: null };
      },
      getById: async () => ({ status: 410, body: null }),
    },
  });

  assert.deepEqual(deleted, [88]);
  assert.deepEqual(result.cleanedIds, [88]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.pendingIdentifiers, []);
});

test("ambiguous CSV discovery never deletes candidate IDs", async () => {
  const deleted = [];
  const result = await reconcileTeamsRun({
    knownIds: [],
    csvImportAttempted: true,
    csvName: "E2E CSV run-uuid",
    api: {
      getPage: async () => page([
        { id: 88, name: "E2E CSV run-uuid" },
        { id: 89, name: "E2E CSV run-uuid" },
      ], 1, 1, 2),
      deleteById: async (id) => {
        deleted.push(id);
        return { status: 200, body: null };
      },
      getById: async () => ({ status: 410, body: null }),
    },
  });

  assert.deepEqual(deleted, []);
  assert.deepEqual(result.pendingIdentifiers, ["E2E CSV run-uuid"]);
  assert.match(result.errors.join(" "), /expected 1 exact match\(es\), found 2/);
});
