import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beginEquipmentTypesCreate, cleanupOwnedEquipmentTypes, confirmEquipmentTypeDelete, markEquipmentTypeDeleteAttempted, readEquipmentTypesCleanupManifest,
  reconcileEquipmentTypeConflictAlias, reconcileEquipmentTypesCreate, registerOwnedEquipmentType, resolveEquipmentTypeRejectedCreate,
} from "../../scripts/e2e/equipment-types-cleanup.mjs";

test("EquipmentTypes persists create intent before mutation and blocks another execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    assert.equal((await readEquipmentTypesCleanupManifest(path)).status, "clear");
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-1-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    assert.equal((await readEquipmentTypesCleanupManifest(path)).status, "pending");
    await assert.rejects(() => beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-2-ui", userId: 4, tenantId: 9, executionId: "run-2", operation: "create" }), /not clear/);
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.equal(saved.records[0].id, null);
    assert.equal(saved.records[0].createAttempted, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes registers only an ID matching the persisted exact-marker intent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await assert.rejects(() => registerOwnedEquipmentType(path, { id: 44, name: "other", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 }), /matching persisted intent/);
    await registerOwnedEquipmentType(path, { id: 44, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    assert.equal((await readEquipmentTypesCleanupManifest(path)).status, "pending");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes resolves HTTP 409 only against a registered exact record in the same execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 48, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await assert.rejects(() => resolveEquipmentTypeRejectedCreate(path, { name: "E2E-EQT-run-ui", executionId: "run-1", expectedExistingId: 49 }), /no matching persisted intent or known existing ID/);
    await resolveEquipmentTypeRejectedCreate(path, { name: "E2E-EQT-run-ui", executionId: "run-1", expectedExistingId: 48 });
    const manifest = await readEquipmentTypesCleanupManifest(path);
    assert.equal(manifest.status, "pending");
    assert.equal(manifest.manifest.records[1].createHttp, 409);
    assert.equal(manifest.manifest.records[1].noRecordConfirmed, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("EquipmentTypes reconciles a same-run conflict alias only against its already deleted owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 51, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    await markEquipmentTypeDeleteAttempted(path, 51);
    await confirmEquipmentTypeDelete(path, { id: 51, executionId: "run-1", deleteHttp: 200, followUpReadHttp: 410 });
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    const raw = JSON.parse(await readFile(path, "utf8"));
    Object.assign(raw.records[1], { id: 51, createHttp: 200, reconciled: true, followUpReadHttp: 410, status: "verified" });
    raw.status = "verified";
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, JSON.stringify(raw), "utf8"));
    await assert.rejects(() => reconcileEquipmentTypeConflictAlias(path, { name: "E2E-EQT-run-ui", executionId: "run-1", tenantId: 9, existingId: 51, observedHttp: 201 }), /observed HTTP 409/);
    await reconcileEquipmentTypeConflictAlias(path, { name: "E2E-EQT-run-ui", executionId: "run-1", tenantId: 9, existingId: 51, observedHttp: 409 });
    const manifest = await readEquipmentTypesCleanupManifest(path);
    assert.equal(manifest.status, "clear");
    assert.equal(manifest.manifest.records[1].id, null);
    assert.equal(manifest.manifest.records[1].noRecordConfirmed, true);
    assert.equal(manifest.manifest.records[1].expectedExistingId, 51);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes reconciles a partial import only when exact list and detail identify one record", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-csv", userId: 4, tenantId: 9, executionId: "run-1", operation: "bulk-upload" });
    const records = await reconcileEquipmentTypesCreate(path, {
      executionId: "run-1",
      list: async (name) => ({ status: 200, body: { items: [{ id: 45, name }] } }),
      get: async (id) => ({ status: 200, body: { id, name: "E2E-EQT-run-csv", tenantId: 9 } }),
    });
    assert.equal(records[0].id, 45);
    assert.equal(records[0].reconciled, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes leaves ambiguous partial import pending and blocks cleanup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-csv", userId: 4, tenantId: 9, executionId: "run-1", operation: "bulk-upload" });
    await assert.rejects(() => reconcileEquipmentTypesCreate(path, {
      executionId: "run-1", list: async () => ({ status: 200, body: { items: [] } }), get: async () => ({ status: 410 }),
    }), /ambiguous or not yet visible/);
    assert.equal((await readEquipmentTypesCleanupManifest(path)).status, "pending");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes persists UI DELETE 200 and follow-up GET 410 against the owned ID", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 50, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    await assert.rejects(() => confirmEquipmentTypeDelete(path, { id: 50, executionId: "run-1", deleteHttp: 200, followUpReadHttp: 410 }), /cannot be verified/);
    await markEquipmentTypeDeleteAttempted(path, 50);
    await confirmEquipmentTypeDelete(path, { id: 50, executionId: "run-1", deleteHttp: 200, followUpReadHttp: 410 });
    const manifest = await readEquipmentTypesCleanupManifest(path);
    assert.equal(manifest.status, "clear");
    assert.equal(manifest.manifest.records[0].deleteHttp, 200);
    assert.equal(manifest.manifest.records[0].followUpReadHttp, 410);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes cleanup verifies tenant, exact record, DELETE 200 and GET 410", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  const calls = [];
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 46, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    const manifest = await cleanupOwnedEquipmentTypes({
      path, executionId: "run-1", session: { userId: 4, tenantId: 9, accessToken: "memory-only" },
      api: async (method, id) => {
        calls.push(method);
        if (method === "GET" && calls.filter((item) => item === "GET").length === 1) return { status: 200, body: { id, name: "E2E-EQT-run-ui", tenantId: 9 } };
        if (method === "DELETE") return { status: 200 };
        return { status: 410 };
      },
    });
    assert.deepEqual(calls, ["GET", "DELETE", "GET"]);
    assert.equal(manifest.status, "verified");
    assert.equal(manifest.records[0].deleteHttp, 200);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("EquipmentTypes cleanup blocks when detail belongs to a different tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 49, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    await assert.rejects(() => cleanupOwnedEquipmentTypes({
      path, executionId: "run-1", session: { userId: 4, tenantId: 9, accessToken: "memory-only" },
      api: async () => ({ status: 200, body: { id: 49, name: "E2E-EQT-run-ui", tenantId: 10 } }),
    }), /exact owned ID and marker/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("EquipmentTypes never retries an ambiguous DELETE", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerit-equipment-cleanup-"));
  const path = join(dir, "manifest.json");
  try {
    await beginEquipmentTypesCreate(path, { name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create" });
    await registerOwnedEquipmentType(path, { id: 47, name: "E2E-EQT-run-ui", userId: 4, tenantId: 9, executionId: "run-1", operation: "create", createHttp: 201 });
    const persisted = JSON.parse(await readFile(path, "utf8"));
    persisted.records[0].deleteAttempted = true;
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, JSON.stringify(persisted), "utf8"));
    await assert.rejects(() => cleanupOwnedEquipmentTypes({
      path, executionId: "run-1", session: { userId: 4, tenantId: 9, accessToken: "memory-only" },
      api: async (method) => ({ status: method === "GET" ? 200 : 200, body: { id: 47, name: "E2E-EQT-run-ui", tenantId: 9 } }),
    }), /previously attempted/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
