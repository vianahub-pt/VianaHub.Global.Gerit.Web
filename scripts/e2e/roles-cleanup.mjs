import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

const empty = () => ({ schemaVersion: 1, status: "verified", records: [] });
export async function readRolesCleanupManifest(path) {
  if (!existsSync(path)) return { status: "clear", manifest: empty() };
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records) || !["pending", "verified"].includes(manifest.status)) return { status: "invalid", manifest: null };
    const valid = manifest.records.every((record) =>
      (record.id === null || (Number.isSafeInteger(record.id) && record.id > 0)) &&
      typeof record.name === "string" && record.name.startsWith("E2E-ROLE-") &&
      Number.isSafeInteger(record.userId) && Number.isSafeInteger(record.tenantId) &&
      typeof record.executionId === "string" && record.executionId.length > 0 &&
      ["create", "conflict"].includes(record.operation) && ["pending", "verified"].includes(record.status) &&
      typeof record.createAttempted === "boolean" && typeof record.deleteAttempted === "boolean" &&
      (record.status !== "verified" || (record.operation === "conflict" && (record.createHttp === 409 || record.reconciled === true) && record.noRecordConfirmed === true && Number.isSafeInteger(record.expectedExistingId)) ||
        (record.id !== null && (record.createHttp === 201 || record.reconciled === true) && record.deleteAttempted === true && record.deleteHttp === 200 && record.followUpReadHttp === 410)));
    if (!valid) return { status: "invalid", manifest: null };
    const clear = manifest.status === "verified" && manifest.records.every((record) => record.status === "verified");
    return { status: clear ? "clear" : "pending", manifest };
  } catch { return { status: "invalid", manifest: null }; }
}
async function persist(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
export async function beginRolesCreate(path, record) {
  const current = await readRolesCleanupManifest(path);
  if (current.status !== "clear") throw new Error("Roles cleanup manifest is not clear; new mutations are blocked.");
  if (!record.name?.startsWith("E2E-ROLE-") || !Number.isSafeInteger(record.userId) || !Number.isSafeInteger(record.tenantId) || !record.executionId) throw new Error("Roles create intent is incomplete.");
  current.manifest.status = "pending";
  current.manifest.records.push({ ...record, id: null, operation: "create", createAttempted: true, deleteAttempted: false, status: "pending" });
  await persist(path, current.manifest);
}
export async function registerOwnedRole(path, record) {
  const current = await readRolesCleanupManifest(path);
  const intent = current.manifest?.records.find((item) => item.id === null && item.operation === "create" && item.status === "pending" && item.name === record.name && item.executionId === record.executionId && item.userId === record.userId && item.tenantId === record.tenantId);
  if (!intent || !Number.isSafeInteger(record.id) || record.id <= 0 || record.createHttp !== 201 || current.status === "invalid") throw new Error("Created Role does not match a persisted exact-marker intent and HTTP 201.");
  if (current.manifest.records.some((item) => item.id === record.id)) throw new Error("Role ID already exists in the cleanup manifest.");
  Object.assign(intent, record, { status: "pending", operation: "create", createAttempted: true, deleteAttempted: false });
  await persist(path, current.manifest);
}
export async function beginRolesConflict(path, { name, userId, tenantId, executionId, expectedExistingId }) {
  const current = await readRolesCleanupManifest(path);
  if (current.status !== "pending" || !current.manifest?.records.some((item) => item.id === expectedExistingId && item.name === name && item.userId === userId && item.tenantId === tenantId && item.executionId === executionId && item.status === "pending")) throw new Error("Roles conflict intent must reference this execution's known owned Role.");
  current.manifest.records.push({ id: null, name, userId, tenantId, executionId, operation: "conflict", createAttempted: true, deleteAttempted: false, expectedExistingId, status: "pending" });
  await persist(path, current.manifest);
}
export async function resolveRolesConflict(path, { name, executionId, expectedExistingId, observedHttp, exactMatchIds }) {
  const current = await readRolesCleanupManifest(path);
  const intent = current.manifest?.records.find((item) => item.id === null && item.operation === "conflict" && item.name === name && item.executionId === executionId && item.expectedExistingId === expectedExistingId && item.status === "pending");
  if (!intent || observedHttp !== 409 || !Array.isArray(exactMatchIds) || exactMatchIds.length !== 1 || exactMatchIds[0] !== expectedExistingId) throw new Error("Roles HTTP 409 is not reconciled to the exact same-run owned Role.");
  Object.assign(intent, { status: "verified", createHttp: 409, noRecordConfirmed: true });
  current.manifest.status = current.manifest.records.every((item) => item.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
}
export async function reconcileRolesCreate(path, { executionId, list, get }) {
  const current = await readRolesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("Roles cleanup manifest is invalid.");
  for (const intent of current.manifest.records.filter((item) => item.operation === "create" && item.id === null && item.executionId === executionId && item.status === "pending")) {
    const result = await list(intent.name);
    if (result.status !== 200 || !Array.isArray(result.body?.items)) throw new Error("Pending Roles create could not be reconciled through an authorized exact-name search.");
    const matches = result.body.items.filter((item) => item.name === intent.name);
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0]?.id) || matches[0].id <= 0) throw new Error("Pending Roles create is ambiguous or not visible; cleanup remains blocked.");
    const detail = await get(matches[0].id);
    if (detail.status !== 200 || detail.body?.id !== matches[0].id || detail.body?.name !== intent.name) throw new Error("Pending Roles detail did not confirm the exact ID and marker.");
    Object.assign(intent, { id: matches[0].id, reconciled: true });
    await persist(path, current.manifest);
  }
  return current.manifest.records.filter((item) => item.executionId === executionId && item.status === "pending");
}
export async function reconcileRolesConflict(path, { executionId, list, get }) {
  const current = await readRolesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("Roles cleanup manifest is invalid.");
  for (const intent of current.manifest.records.filter((item) => item.operation === "conflict" && item.id === null && item.executionId === executionId && item.status === "pending")) {
    const owner = current.manifest.records.find((item) => item.operation === "create" && item.id === intent.expectedExistingId && item.executionId === executionId && item.name === intent.name && item.userId === intent.userId && item.tenantId === intent.tenantId);
    if (!owner) throw new Error("Pending Roles conflict has no same-run owned record.");
    const result = await list(intent.name);
    if (result.status !== 200 || !Array.isArray(result.body?.items)) throw new Error("Pending Roles conflict cannot be reconciled with an authorized exact-name search.");
    const matches = result.body.items.filter((item) => item.name === intent.name);
    if (matches.length !== 1 || matches[0]?.id !== owner.id) throw new Error("Pending Roles conflict is ambiguous; no candidate will be deleted.");
    const verified = await get(owner.id);
    if (verified.status !== 200 || verified.body?.id !== owner.id || verified.body?.name !== intent.name) throw new Error("Pending Roles conflict detail does not match its same-run owned role.");
    Object.assign(intent, { status: "verified", reconciled: true, noRecordConfirmed: true, conflictObservedHttp: null });
    await persist(path, current.manifest);
  }
  current.manifest.status = current.manifest.records.every((item) => item.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
  return current.manifest;
}
export async function markRolesDeleteAttempted(path, id, executionId) {
  const current = await readRolesCleanupManifest(path); const record = current.manifest?.records.find((item) => item.id === id && item.executionId === executionId && item.operation === "create");
  if (current.status === "invalid" || !record || record.status !== "pending" || record.deleteAttempted) throw new Error("Roles DELETE cannot safely be initiated or repeated.");
  record.deleteAttempted = true; await persist(path, current.manifest);
}
export async function confirmRolesDelete(path, { id, executionId, deleteHttp, followUpReadHttp }) {
  const current = await readRolesCleanupManifest(path); const record = current.manifest?.records.find((item) => item.id === id && item.executionId === executionId);
  if (current.status === "invalid" || !record || record.status !== "pending" || !record.deleteAttempted || deleteHttp !== 200 || followUpReadHttp !== 410) throw new Error("Roles DELETE requires the owned ID, persisted attempt, HTTP 200 and follow-up GET 410.");
  Object.assign(record, { status: "verified", deleteHttp, followUpReadHttp }); current.manifest.status = current.manifest.records.every((item) => item.status === "verified") ? "verified" : "pending"; await persist(path, current.manifest); return record;
}
export async function cleanupOwnedRoles({ path, executionId, session, api, reconcile }) {
  let current = await readRolesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("Roles cleanup manifest is invalid.");
  if (!Number.isSafeInteger(session?.userId) || !Number.isSafeInteger(session?.tenantId) || typeof session?.accessToken !== "string" || !session.accessToken) throw new Error("Authenticated Roles cleanup session is unavailable.");
  if (current.manifest.records.some((item) => item.status === "pending" && item.executionId !== executionId)) throw new Error("Prior Roles cleanup is pending; this execution is blocked.");
  if (current.manifest.records.some((item) => item.executionId === executionId && item.id === null && item.status === "pending")) {
    if (typeof reconcile !== "function") throw new Error("Ambiguous Roles create must be reconciled before cleanup.");
    await reconcile();
    current = await readRolesCleanupManifest(path);
    if (current.status === "invalid" || !current.manifest) throw new Error("Roles cleanup manifest remains invalid after reconciliation.");
  }
  for (const item of current.manifest.records.filter((record) => record.operation === "create" && record.executionId === executionId && record.status === "pending")) {
    if (item.userId !== session.userId || item.tenantId !== session.tenantId) throw new Error("Roles cleanup identity or tenant differs from its manifest owner.");
    const before = await api("GET", item.id, session.accessToken);
    if (before.status === 410 && item.deleteAttempted && item.deleteHttp === 200) { item.status = "verified"; item.followUpReadHttp = 410; await persist(path, current.manifest); continue; }
    if (before.status !== 200 || before.body?.id !== item.id || before.body?.name !== item.name) throw new Error("Roles cleanup pre-read did not confirm the exact owned ID and marker.");
    if (item.deleteAttempted) throw new Error("Roles DELETE was already attempted; ambiguous cleanup will not be retried.");
    item.deleteAttempted = true;
    await persist(path, current.manifest);
    const removal = await api("DELETE", item.id, session.accessToken);
    if (removal.status !== 200) throw new Error("Roles cleanup DELETE did not return HTTP 200.");
    item.deleteHttp = 200;
    await persist(path, current.manifest);
    const after = await api("GET", item.id, session.accessToken);
    if (after.status !== 410) throw new Error("Roles cleanup follow-up GET did not return HTTP 410.");
    item.status = "verified"; item.followUpReadHttp = 410;
    await persist(path, current.manifest);
  }
  current.manifest.status = current.manifest.records.every((item) => item.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
  if (current.manifest.status !== "verified") throw new Error("Roles cleanup manifest remains pending.");
  return current.manifest;
}
