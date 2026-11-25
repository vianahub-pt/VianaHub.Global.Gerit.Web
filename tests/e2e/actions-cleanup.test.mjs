import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginOwnedActionCreate, cleanupOwnedActions, markOwnedActionDeleteAttempted, readActionsCleanupManifest, registerOwnedAction } from "../../scripts/e2e/actions-cleanup.mjs";

test("Actions cleanup manifest blocks creation while a record is pending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-actions-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    assert.equal((await readActionsCleanupManifest(path)).status, "clear");
    await beginOwnedActionCreate(path, { name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1" });
    await registerOwnedAction(path, { id: 1234, name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1", createHttp: 201 });
    assert.equal((await readActionsCleanupManifest(path)).status, "pending");
    await beginOwnedActionCreate(path, { name: "same run", userId: 1, tenantId: 1, executionId: "run-1" });
    await registerOwnedAction(path, { id: 1235, name: "same run", userId: 1, tenantId: 1, executionId: "run-1", createHttp: 201 });
    await assert.rejects(() => registerOwnedAction(path, { id: 1235, name: "another", userId: 1, tenantId: 1, executionId: "run-2", createHttp: 201 }), /not clear/);
    const persisted = JSON.parse(await readFile(path, "utf8"));
    assert.equal(persisted.records[0].id, 1234);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("ambiguous Actions create intent blocks cleanup and later executions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-actions-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginOwnedActionCreate(path, { name: "E2E Actions uncertain", userId: 1, tenantId: 1, executionId: "run-uncertain" });
    assert.equal((await readActionsCleanupManifest(path)).status, "pending");
    await assert.rejects(() => registerOwnedAction(path, { id: 1236, name: "E2E Actions uncertain", userId: 1, tenantId: 1, executionId: "other-run", createHttp: 201 }), /not clear/);
    await assert.rejects(() => cleanupOwnedActions({ path, ids: [], refreshSession: async () => ({ accessToken: "fresh", refreshToken: "rotated", userId: 1, tenantId: 1 }), api: async () => ({ status: 410 }) }), /ambiguous Actions create/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Actions cleanup verifies ownership, performs one DELETE, then requires GET 410", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-actions-cleanup-"));
  const path = join(dir, "manifest.json");
  const calls = [];
  try {
    await beginOwnedActionCreate(path, { name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1" });
    await registerOwnedAction(path, { id: 1234, name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1", createHttp: 201 });
    const result = await cleanupOwnedActions({
      path, ids: [1234], refreshSession: async () => ({ accessToken: "fresh", refreshToken: "rotated", userId: 1, tenantId: 1 }),
      api: async (method, id, token) => {
        calls.push({ method, id, token });
        if (method === "GET" && calls.filter((call) => call.method === "GET").length === 1) return { status: 200, body: { id, name: "E2E Actions test" } };
        if (method === "DELETE") return { status: 200 };
        return { status: 410 };
      },
    });
    assert.deepEqual(calls.map(({ method }) => method), ["GET", "DELETE", "GET"]);
    assert.ok(calls.every((call) => call.token === "fresh"));
    assert.equal(result.status, "verified");
    assert.equal(result.records[0].deleteHttp, 200);
    assert.equal(result.records[0].followUpReadHttp, 410);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Actions cleanup never retries an ambiguous DELETE", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-actions-cleanup-"));
  const path = join(dir, "manifest.json");
  const calls = [];
  try {
    await beginOwnedActionCreate(path, { name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1" });
    await registerOwnedAction(path, { id: 1234, name: "E2E Actions test", userId: 1, tenantId: 1, executionId: "run-1", createHttp: 201 });
    await markOwnedActionDeleteAttempted(path, 1234);
    await assert.rejects(() => cleanupOwnedActions({
      path, ids: [1234], refreshSession: async () => ({ accessToken: "fresh", refreshToken: "rotated", userId: 1, tenantId: 1 }),
      api: async (method) => { calls.push(method); return { status: 200, body: { id: 1234, name: "E2E Actions test" } }; },
    }), /previously attempted/);
    assert.deepEqual(calls, ["GET"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
