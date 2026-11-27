import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { beginResourcesBulkUpload, beginResourcesCreate, cleanupOwnedResources, markResourcesBulkUploadSucceeded, markResourcesDeleteAttempted, readResourcesCleanupManifest, registerOwnedBulkResource, registerOwnedResource } from "../../scripts/e2e/resources-cleanup.mjs";

const owner = { userId: 17, tenantId: 9, accessToken: "opaque-test-token" };
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "gerit-resources-cleanup-"));
  const path = join(dir, "cleanup-manifest.json");
  try { await run(path); } finally { await rm(dir, { recursive: true, force: true }); }
}
const record = (name, executionId = "run-1") => ({ name, userId: owner.userId, tenantId: owner.tenantId, executionId });

test("Resources cleanup blocks a second run while an owned create is unresolved", async () => fixture(async (path) => {
  await beginResourcesCreate(path, record("E2E-RESOURCE-one"));
  assert.equal((await readResourcesCleanupManifest(path)).status, "pending");
  await assert.rejects(beginResourcesCreate(path, record("E2E-RESOURCE-two", "run-2")), /not clear/);
}));

test("Resources cleanup deletes only the owned record and verifies HTTP 410", async () => fixture(async (path) => {
  await beginResourcesCreate(path, record("E2E-RESOURCE-one"));
  await registerOwnedResource(path, { ...record("E2E-RESOURCE-one"), id: 41, createHttp: 201 });
  const calls = [];
  const result = await cleanupOwnedResources({ path, executionId: "run-1", session: owner, api: async (method, id) => {
    calls.push([method, id]);
    return method === "DELETE" ? { status: 200 } : calls.filter(([m, i]) => m === "DELETE" && i === id).length ? { status: 410 } : { status: 200, body: { id, name: "E2E-RESOURCE-one", createdBy: owner.userId } };
  } });
  assert.equal(result.status, "verified");
  assert.deepEqual(calls.map(([method]) => method), ["GET", "DELETE", "GET"]);
  assert.equal(result.records[0].followUpReadHttp, 410);
}));

test("Resources cleanup refuses an ID whose API creator differs from the manifest owner", async () => fixture(async (path) => {
  await beginResourcesCreate(path, record("E2E-RESOURCE-one"));
  await registerOwnedResource(path, { ...record("E2E-RESOURCE-one"), id: 42, createHttp: 201 });
  let deletes = 0;
  await assert.rejects(cleanupOwnedResources({ path, executionId: "run-1", session: owner, api: async (method, id) => {
    if (method === "DELETE") deletes += 1;
    return { status: 200, body: { id, name: "E2E-RESOURCE-one", createdBy: 999 } };
  } }), /creator/);
  assert.equal(deletes, 0);
}));

test("Resources BulkUpload has its own intent and requires HTTP 200 before registration", async () => fixture(async (path) => {
  await beginResourcesCreate(path, record("E2E-RESOURCE-one"));
  await registerOwnedResource(path, { ...record("E2E-RESOURCE-one"), id: 43, createHttp: 201 });
  await beginResourcesBulkUpload(path, record("E2E-RESOURCE-bulk"));
  await assert.rejects(registerOwnedBulkResource(path, { ...record("E2E-RESOURCE-bulk"), id: 44, bulkUploadHttp: 200 }), /persisted exact-marker intent/);
  await markResourcesBulkUploadSucceeded(path, "E2E-RESOURCE-bulk", "run-1", 200);
  await registerOwnedBulkResource(path, { ...record("E2E-RESOURCE-bulk"), id: 44, bulkUploadHttp: 200 });
  const manifest = await readResourcesCleanupManifest(path);
  assert.equal(manifest.status, "pending");
  assert.equal(manifest.manifest.records.find((item) => item.operation === "bulk").bulkUploadHttp, 200);
}));

test("Resources cleanup never retries a DELETE with ambiguous prior outcome", async () => fixture(async (path) => {
  await beginResourcesCreate(path, record("E2E-RESOURCE-one"));
  await registerOwnedResource(path, { ...record("E2E-RESOURCE-one"), id: 45, createHttp: 201 });
  await markResourcesDeleteAttempted(path, 45, "run-1");
  let deletes = 0;
  await assert.rejects(cleanupOwnedResources({ path, executionId: "run-1", session: owner, api: async (method, id) => {
    if (method === "DELETE") deletes += 1;
    return { status: 200, body: { id, name: "E2E-RESOURCE-one", createdBy: owner.userId } };
  } }), /already attempted/);
  assert.equal(deletes, 0);
}));
