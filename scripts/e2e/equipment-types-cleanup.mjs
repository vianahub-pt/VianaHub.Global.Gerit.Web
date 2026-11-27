import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

function emptyManifest() { return { schemaVersion: 1, status: "verified", records: [] }; }

export async function readEquipmentTypesCleanupManifest(path) {
  if (!existsSync(path)) return { status: "clear", manifest: emptyManifest() };
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records) || !["pending", "verified"].includes(manifest.status)) return { status: "invalid", manifest: null };
    const valid = manifest.records.every((record) =>
      ((Number.isSafeInteger(record.id) && record.id > 0) || (record.id === null && record.status === "pending" && record.createAttempted === true) || (record.id === null && record.status === "verified" && record.createHttp === 409 && record.noRecordConfirmed === true)) &&
      typeof record.name === "string" && record.name.length > 0 &&
      Number.isSafeInteger(record.userId) && Number.isSafeInteger(record.tenantId) &&
      typeof record.executionId === "string" && record.executionId.length > 0 &&
      ["create", "bulk-upload"].includes(record.operation) &&
      ["pending", "verified"].includes(record.status) &&
      (record.status !== "verified" || (record.id === null && record.createHttp === 409 && record.noRecordConfirmed === true) ||
        (record.id !== null && record.deleteAttempted === true && record.deleteHttp === 200 && record.followUpReadHttp === 410)));
    if (!valid) return { status: "invalid", manifest: null };
    const clear = manifest.status === "verified" && manifest.records.every((record) => record.status === "verified");
    return { status: clear ? "clear" : "pending", manifest };
  } catch {
    return { status: "invalid", manifest: null };
  }
}

async function persist(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function beginEquipmentTypesCreate(path, record) {
  const current = await readEquipmentTypesCleanupManifest(path);
  const pending = current.manifest?.records.filter((item) => item.status === "pending") ?? [];
  const sameExecution = current.status === "pending" && pending.length > 0 &&
    pending.every((item) => item.executionId === record.executionId && !item.deleteAttempted);
  if (current.status !== "clear" && !sameExecution) throw new Error("EquipmentTypes cleanup manifest is not clear for this execution; new mutations are blocked.");
  if (typeof record.name !== "string" || !record.name || !Number.isSafeInteger(record.userId) || !Number.isSafeInteger(record.tenantId) ||
      typeof record.executionId !== "string" || !record.executionId || !["create", "bulk-upload"].includes(record.operation)) {
    throw new Error("EquipmentTypes create intent is incomplete.");
  }
  const next = { ...current.manifest, status: "pending", records: [...current.manifest.records, {
    ...record, id: null, createAttempted: true, status: "pending", deleteAttempted: false,
  }] };
  await persist(path, next);
}

export async function registerOwnedEquipmentType(path, record) {
  const current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const intent = current.manifest.records.find((item) => item.id === null && item.name === record.name &&
    item.executionId === record.executionId && item.userId === record.userId && item.tenantId === record.tenantId &&
    item.operation === record.operation && item.status === "pending");
  if (!intent || !Number.isSafeInteger(record.id) || record.id <= 0 || ![200, 201].includes(record.createHttp)) {
    throw new Error("Created EquipmentType cannot be registered without a matching persisted intent and successful response.");
  }
  if (current.manifest.records.some((item) => item.id === record.id)) throw new Error("EquipmentType ID already exists in the cleanup manifest.");
  Object.assign(intent, { ...record, id: record.id, status: "pending", deleteAttempted: false });
  await persist(path, current.manifest);
  return intent;
}

export async function resolveEquipmentTypeRejectedCreate(path, { name, executionId, expectedExistingId }) {
  const current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const intent = current.manifest.records.find((item) => item.id === null && item.name === name &&
    item.executionId === executionId && item.status === "pending" && item.operation === "create");
  if (!intent || !Number.isSafeInteger(expectedExistingId) || expectedExistingId <= 0 || !current.manifest.records.some((item) => item.id === expectedExistingId && item.name === name && item.executionId === executionId && item.tenantId === intent.tenantId)) {
    throw new Error("EquipmentTypes rejected create has no matching persisted intent or known existing ID.");
  }
  Object.assign(intent, { status: "verified", createHttp: 409, noRecordConfirmed: true, expectedExistingId });
  current.manifest.status = current.manifest.records.every((record) => record.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
}
export async function reconcileEquipmentTypeConflictAlias(path, { name, executionId, tenantId, existingId, observedHttp }) {
  if (observedHttp !== 409 || !Number.isSafeInteger(existingId) || existingId <= 0) throw new Error("EquipmentTypes conflict alias requires observed HTTP 409 and an exact existing ID.");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records)) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const matches = manifest.records.filter((record) => record.id === existingId && record.name === name &&
    record.executionId === executionId && record.tenantId === tenantId && record.status === "verified");
  const deletedOwner = matches.filter((record) => record.createHttp === 201 && record.deleteHttp === 200 && record.followUpReadHttp === 410 && record.deleteAttempted === true);
  const alias = matches.filter((record) => record.createHttp === 200 && record.deleteHttp === undefined && record.followUpReadHttp === 410);
  if (deletedOwner.length !== 1 || alias.length !== 1) throw new Error("EquipmentTypes conflict alias is not uniquely backed by the same execution's deleted record and observed 409.");
  Object.assign(alias[0], { id: null, createHttp: 409, noRecordConfirmed: true, expectedExistingId: existingId, reconciledConflictAliasOfId: existingId, status: "verified", deleteAttempted: false });
  delete alias[0].followUpReadHttp;
  delete alias[0].reconciled;
  manifest.status = manifest.records.every((record) => record.status === "verified") ? "verified" : "pending";
  await persist(path, manifest);
  return manifest;
}

export async function reconcileEquipmentTypesCreate(path, { executionId, list, get }) {
  const current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const intents = current.manifest.records.filter((item) => item.id === null && item.executionId === executionId && item.status === "pending");
  for (const intent of intents) {
    const result = await list(intent.name);
    if (result.status !== 200 || !Array.isArray(result.body?.items)) throw new Error("EquipmentTypes pending create could not be reconciled by an authorized exact-name list.");
    const matches = result.body.items.filter((item) => item.name === intent.name);
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0]?.id) || matches[0].id <= 0) {
      throw new Error("EquipmentTypes pending create is ambiguous or not yet visible; cleanup remains blocked.");
    }
    const detail = await get(matches[0].id);
    if (detail.status !== 200 || detail.body?.id !== matches[0].id || detail.body?.name !== intent.name || detail.body?.tenantId !== intent.tenantId) {
      throw new Error("EquipmentTypes pending create detail did not confirm the exact marker and ID.");
    }
    Object.assign(intent, { id: matches[0].id, createHttp: result.createHttp ?? 200, reconciled: true });
    await persist(path, current.manifest);
  }
  return current.manifest.records.filter((record) => record.executionId === executionId && record.status === "pending");
}

export async function markEquipmentTypeDeleteAttempted(path, id) {
  const current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const record = current.manifest.records.find((item) => item.id === id);
  if (!record || record.status !== "pending" || record.deleteAttempted) throw new Error("EquipmentTypes DELETE cannot safely be initiated or repeated.");
  record.deleteAttempted = true;
  await persist(path, current.manifest);
}

export async function confirmEquipmentTypeDelete(path, { id, executionId, deleteHttp, followUpReadHttp }) {
  const current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid.");
  const record = current.manifest.records.find((item) => item.id === id && item.executionId === executionId);
  if (!record || record.status !== "pending" || !record.deleteAttempted || deleteHttp !== 200 || followUpReadHttp !== 410) {
    throw new Error("EquipmentTypes deletion cannot be verified without the owned ID, attempted DELETE 200 and follow-up GET 410.");
  }
  Object.assign(record, { status: "verified", deleteHttp, followUpReadHttp });
  current.manifest.status = current.manifest.records.every((item) => item.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
  return record;
}

export async function cleanupOwnedEquipmentTypes({ path, executionId, session, api, reconcile }) {
  let current = await readEquipmentTypesCleanupManifest(path);
  if (current.status === "invalid" || !current.manifest) throw new Error("EquipmentTypes cleanup manifest is invalid; manual reconciliation is required.");
  if (!Number.isSafeInteger(session?.userId) || !Number.isSafeInteger(session?.tenantId) || typeof session?.accessToken !== "string" || !session.accessToken) {
    throw new Error("Authenticated EquipmentTypes cleanup session is unavailable.");
  }
  if (current.manifest.records.some((record) => record.status === "pending" && record.executionId !== executionId)) {
    throw new Error("A prior EquipmentTypes execution has pending cleanup; this execution cannot proceed.");
  }
  if (current.manifest.records.some((record) => record.executionId === executionId && record.id === null)) {
    if (!reconcile) throw new Error("An ambiguous EquipmentTypes create remains unresolved.");
    await reconcile();
    current = await readEquipmentTypesCleanupManifest(path);
  }
  const records = current.manifest.records.filter((record) => record.executionId === executionId);
  for (const record of records) {
    if (record.status === "verified") continue;
    if (record.id === null) throw new Error("EquipmentTypes cleanup cannot proceed with an unresolved create intent.");
    if (record.userId !== session.userId || record.tenantId !== session.tenantId) throw new Error("EquipmentTypes cleanup identity or tenant differs from the manifest owner.");
    const before = await api("GET", record.id, session.accessToken);
    if (before.status === 410 && record.deleteAttempted) {
      if (record.deleteHttp !== 200) throw new Error("EquipmentTypes GET 410 follows an ambiguous DELETE; cleanup requires manual reconciliation and will not retry.");
      record.status = "verified";
      record.followUpReadHttp = 410;
      await persist(path, current.manifest);
      continue;
    }
    if (before.status !== 410 && (before.status !== 200 || before.body?.id !== record.id || before.body?.name !== record.name || before.body?.tenantId !== record.tenantId)) {
      throw new Error("EquipmentTypes cleanup pre-read did not confirm the exact owned ID and marker.");
    }
    if (record.deleteAttempted) throw new Error("EquipmentTypes DELETE was previously attempted; manual reconciliation is required before retry.");
    record.deleteAttempted = true;
    await persist(path, current.manifest);
    const deletion = await api("DELETE", record.id, session.accessToken);
    if (deletion.status !== 200) throw new Error("EquipmentTypes cleanup DELETE did not return HTTP 200.");
    const after = await api("GET", record.id, session.accessToken);
    if (after.status !== 410) throw new Error("EquipmentTypes cleanup follow-up GET did not return HTTP 410.");
    Object.assign(record, { status: "verified", deleteHttp: 200, followUpReadHttp: 410 });
    await persist(path, current.manifest);
  }
  current.manifest.status = current.manifest.records.every((record) => record.status === "verified") ? "verified" : "pending";
  await persist(path, current.manifest);
  if (current.manifest.records.some((record) => record.executionId === executionId && record.status !== "verified")) {
    throw new Error("EquipmentTypes cleanup manifest remains pending.");
  }
  return current.manifest;
}
