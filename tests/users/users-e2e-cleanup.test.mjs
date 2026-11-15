import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeUsersQaMutations, USERS_QA_API_ORIGIN } from "./users-e2e-authorization.ts";
import {
  assertUsersInventoryIsUnused,
  cleanupUsersInventory,
  fetchAllUsers,
  reconcileUsersInventory,
} from "./users-e2e-cleanup.ts";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const entry = (key = "primary", name = "E2E Users primary", email = "e2e-users-primary@example.invalid") => ({
  key, email, expectedNames: [name], id: null, createAttempted: true, createSucceeded: true,
  deleted: false, deleteStatus: null, getStatus: null,
});
const page = (items, pageNumber = 1, totalItems = items.length, pageSize = 100) => ({
  status: 200,
  body: { items, pageNumber, pageSize, totalItems, totalPages: totalItems ? Math.ceil(totalItems / pageSize) : 0 },
});
const record = (id, name) => ({ id, name });
const inventory = (users) => ({ schemaVersion: 1, runId, target: USERS_QA_API_ORIGIN, startedAt: new Date().toISOString(), state: "mutating", users, errors: [] });

test("QA mutations require exact target and a one-run UUID opt-in", () => {
  assert.throws(() => authorizeUsersQaMutations(undefined, runId));
  assert.throws(() => authorizeUsersQaMutations("https://gerit-api.vianahub.pt.evil.test", runId));
  assert.throws(() => authorizeUsersQaMutations(USERS_QA_API_ORIGIN, undefined));
  assert.throws(() => authorizeUsersQaMutations(`${USERS_QA_API_ORIGIN}/other`, runId));
  assert.deepEqual(authorizeUsersQaMutations(USERS_QA_API_ORIGIN, runId), { target: USERS_QA_API_ORIGIN });
});

test("CSV discovery reads every page and reconciles the unique expected name", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => record(index + 1, `unrelated-${index}`));
  rows[100] = record(101, "E2E Users CSV 10");
  const calls = [];
  const list = async (_search, pageNumber, pageSize) => {
    calls.push(pageNumber);
    return page(rows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageNumber, rows.length, pageSize);
  };
  const found = await fetchAllUsers("unique-search", list);
  assert.equal(found.find((item) => item.name === "E2E Users CSV 10").id, 101);
  assert.deepEqual(calls, [1, 2]);
});

test("failed CSV discovery is an explicit failure and never skips cleanup of known records", async () => {
  const users = [entry("csv-1", "E2E Users CSV 1"), entry("csv-2", "E2E Users CSV 2")];
  users[0].id = 21;
  users.forEach((user) => { user.createSucceeded = false; }); // partial/ambiguous bulk response
  let deleteCalls = 0;
  const result = await cleanupUsersInventory(inventory(users), {
    list: async (_search, pageNumber) => page(pageNumber === 1 ? [record(21, "E2E Users CSV 1")] : [], pageNumber),
    delete: async () => { deleteCalls += 1; return { status: 200 }; },
    get: async () => ({ status: 410 }),
  }, async () => {});
  assert.equal(deleteCalls, 1);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("failed discovery does not suppress deletion of known IDs and cannot pass", async () => {
  const user = entry();
  user.id = 25;
  let deleteCalls = 0;
  const result = await cleanupUsersInventory(inventory([user]), {
    list: async () => ({ status: 503, body: null }),
    delete: async () => { deleteCalls += 1; return { status: 200 }; },
    get: async () => ({ status: 410 }),
  }, async () => {});
  assert.equal(deleteCalls, 1);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("local inventory write failures do not stop cleanup attempts for later IDs", async () => {
  const first = entry("csv-1", "E2E Users CSV 1");
  const second = entry("csv-2", "E2E Users CSV 2");
  first.id = 26;
  second.id = 27;
  let deleteCalls = 0;
  const result = await cleanupUsersInventory(inventory([first, second]), {
    list: async () => ({ status: 503, body: null }),
    delete: async () => { deleteCalls += 1; return { status: 200 }; },
    get: async () => ({ status: 410 }),
  }, async () => { throw new Error("disk unavailable"); });
  assert.equal(deleteCalls, 2);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("inventory could not be persisted")));
});

test("preflight fails closed on an unavailable or malformed discovery page", async () => {
  await assert.rejects(() => assertUsersInventoryIsUnused([entry()], async () => ({ status: 503, body: null })));
  await assert.rejects(() => fetchAllUsers("unique", async () => ({ status: 200, body: { items: [], pageNumber: 1 } })));
});

test("unexpected names for a unique email search are treated as ambiguous", async () => {
  await assert.rejects(() => reconcileUsersInventory(
    [entry()],
    async () => page([record(7, "unexpected user")]),
    () => true,
  ));
});

test("DELETE failure remains a failure even when GET is unexpected", async () => {
  const user = entry();
  user.id = 31;
  const result = await cleanupUsersInventory(inventory([user]), {
    list: async () => page([]),
    delete: async () => ({ status: 500 }),
    get: async () => ({ status: 404 }),
  }, async () => {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("DELETE failed")));
  assert.ok(result.errors.some((message) => message.includes("GET did not confirm")));
});

test("cleanup cannot pass when a record remains discoverable after DELETE and GET 410", async () => {
  const user = entry();
  user.id = 41;
  const result = await cleanupUsersInventory(inventory([user]), {
    list: async () => page([record(41, user.expectedNames[0])]),
    delete: async () => ({ status: 200 }),
    get: async () => ({ status: 410 }),
  }, async () => {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("verified empty state")));
});

test("cleanup passes only after every attempted record is reconciled and GET confirms 410", async () => {
  const user = entry();
  user.id = 51;
  let active = true;
  const result = await cleanupUsersInventory(inventory([user]), {
    list: async () => page(active ? [record(51, user.expectedNames[0])] : []),
    delete: async () => { active = false; return { status: 200 }; },
    get: async () => ({ status: 410 }),
  }, async () => {});
  assert.equal(result.ok, true);
});
