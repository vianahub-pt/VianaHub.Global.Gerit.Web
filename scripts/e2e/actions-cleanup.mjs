import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

function emptyManifest() { return { schemaVersion: 1, status: "verified", records: [] }; }

export async function readActionsCleanupManifest(path) {
  if (!existsSync(path)) return { status: "clear", manifest: emptyManifest() };
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records) || !["pending", "verified"].includes(manifest.status)) {
      return { status: "invalid", manifest: null };
    }
    const validRecords = manifest.records.every((record) => ((Number.isSafeInteger(record.id) && record.id > 0) || (record.id === null && record.status === "pending" && record.createAttempted === true)) &&
      typeof record.name === "string" && record.name.length > 0 && ["pending", "verified"].includes(record.status) && (typeof record.executionId === "string" && record.executionId.length > 0 || record.status === "verified" && record.executionId === undefined));
    if (!validRecords) return { status: "invalid", manifest: null };
    const clear = manifest.status === "verified" && manifest.records.every((record) => record.status === "verified");
    return { status: clear ? "clear" : "pending", manifest };
  } catch {
    return { status: "invalid", manifest: null };
  }
}

async function persist(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
}

export async function beginOwnedActionCreate(path, record) {
  const current = await readActionsCleanupManifest(path);
  const pending = current.manifest?.records.filter((item) => item.status === "pending") ?? [];
  const sameExecution = current.status === "pending" && pending.length > 0 && pending.every((item) => item.executionId === record.executionId && !item.deleteAttempted);
  if (current.status !== "clear" && !sameExecution) throw new Error("Actions cleanup manifest is not clear for this execution; creation is blocked.");
  if (typeof record.name !== "string" || !record.name || !Number.isSafeInteger(record.userId) || !Number.isSafeInteger(record.tenantId) || typeof record.executionId !== "string" || !record.executionId) throw new Error("Actions create intent is incomplete.");
  if (pending.some((item) => item.name === record.name)) throw new Error("Actions create marker is already present in the cleanup manifest.");
  const next = { ...current.manifest, status: "pending", records: [...current.manifest.records, { ...record, id: null, createAttempted: true, status: "pending", deleteAttempted: false }] };
  await persist(path, next);
}

export async function registerOwnedAction(path, record) {
  const current = await readActionsCleanupManifest(path);
  const pending = current.manifest?.records.filter((item) => item.status === "pending") ?? [];
  const sameExecution = current.status === "pending" && pending.length > 0 && pending.every((item) => item.executionId === record.executionId && !item.deleteAttempted);
  if (current.status !== "clear" && !sameExecution) throw new Error("Actions cleanup manifest is not clear for this execution; creation is blocked.");
  if (!Number.isSafeInteger(record.id) || record.id <= 0 || typeof record.name !== "string" || !record.name ||
      !Number.isSafeInteger(record.userId) || !Number.isSafeInteger(record.tenantId) || record.createHttp !== 201) {
    throw new Error("Created Actions record is incomplete; it cannot be safely registered.");
  }
  const reservation = current.manifest.records.find((item) => item.id === null && item.name === record.name && item.executionId === record.executionId && item.status === "pending");
  if (!reservation) throw new Error("The Action ID cannot be registered without a matching persisted create intent.");
  if (current.manifest.records.some((item) => item.id === record.id)) throw new Error("Actions record ID is already present in the cleanup manifest.");
  Object.assign(reservation, { ...record, id: record.id, status: "pending", deleteAttempted: false });
  await persist(path, current.manifest);
  return reservation;
}

export async function markOwnedActionDeleteAttempted(path, id) {
  const current = await readActionsCleanupManifest(path);
  if (current.status === "invalid") throw new Error("Actions cleanup manifest is invalid.");
  const record = current.manifest.records.find((item) => item.id === id);
  if (!record || record.status !== "pending" || record.deleteAttempted) throw new Error("Actions DELETE is not safe to initiate or repeat.");
  record.deleteAttempted = true;
  await persist(path, current.manifest);
}

export async function cleanupOwnedActions({ path, ids, refreshSession, api }) {
  const current = await readActionsCleanupManifest(path);
  if (current.status === "invalid") throw new Error("Actions cleanup manifest is invalid; manual reconciliation is required.");
  const selectedIds = new Set(ids);
  if (current.manifest.records.some((record) => record.id === null)) throw new Error("An ambiguous Actions create remains unresolved; manual reconciliation is required.");
  const records = current.manifest.records.filter((record) => selectedIds.has(record.id));
  if (records.length !== selectedIds.size) throw new Error("An owned Actions ID is missing from the cleanup manifest.");
  const session = await refreshSession();
  if (!session || typeof session.accessToken !== "string" || !session.accessToken ||
      typeof session.refreshToken !== "string" || !session.refreshToken || !Number.isSafeInteger(session.userId) || !Number.isSafeInteger(session.tenantId)) throw new Error("Authenticated refresh session is unavailable for Actions cleanup.");
  if (records.some((record) => record.userId !== session.userId || record.tenantId !== session.tenantId)) throw new Error("Actions cleanup identity or tenant differs from the manifest owner.");
  for (const record of records) {
    if (record.status === "verified") continue;
    const before = await api("GET", record.id, session.accessToken);
    if (before.status === 410) {
      record.status = "verified";
      await persist(path, current.manifest);
      continue;
    }
    if (before.status !== 200 || before.body?.id !== record.id || before.body?.name !== record.name) {
      throw new Error(`Actions cleanup pre-read could not confirm owned ID ${record.id} (HTTP ${before.status}).`);
    }
    if (record.deleteAttempted) throw new Error(`Actions DELETE for ID ${record.id} was previously attempted; no retry is allowed until manual reconciliation.`);
    record.deleteAttempted = true;
    await persist(path, current.manifest);
    const deletion = await api("DELETE", record.id, session.accessToken);
    if (deletion.status !== 200) throw new Error(`Actions DELETE for owned ID ${record.id} returned HTTP ${deletion.status}; cleanup remains pending.`);
    const after = await api("GET", record.id, session.accessToken);
    if (after.status !== 410) throw new Error(`Actions post-delete GET for owned ID ${record.id} returned HTTP ${after.status}; cleanup remains pending.`);
    record.status = "verified";
    record.deleteHttp = deletion.status;
    record.followUpReadHttp = after.status;
    await persist(path, current.manifest);
  }
  current.manifest.status = current.manifest.records.every((record) => record.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
  return current.manifest;
}
