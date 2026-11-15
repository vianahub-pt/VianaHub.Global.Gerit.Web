export interface UserInventoryEntry {
  key: string;
  email: string;
  alternateEmails?: string[];
  expectedNames: string[];
  id: number | null;
  createAttempted: boolean;
  createSucceeded: boolean;
  deleted: boolean;
  deleteStatus: number | null;
  getStatus: number | null;
}

export interface UserCleanupInventory {
  schemaVersion: 1;
  runId: string;
  target: string;
  startedAt: string;
  state: "planned" | "mutating" | "clean" | "cleanup-failed";
  users: UserInventoryEntry[];
  errors: string[];
}

export interface UserSummary { id: number; name: string }
export interface ApiPageResult { status: number; body: unknown }
export interface CleanupApi {
  list: (search: string, pageNumber: number, pageSize: number) => Promise<ApiPageResult>;
  delete: (id: number) => Promise<{ status: number }>;
  get: (id: number) => Promise<{ status: number }>;
}

const PAGE_SIZE = 100;
const MAX_CLEANUP_ROUNDS = 3;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePage(result: ApiPageResult, expectedPage: number, expectedPageSize: number) {
  if (result.status !== 200 || !object(result.body) || !Array.isArray(result.body.items) ||
      !Number.isInteger(result.body.pageNumber) || !Number.isInteger(result.body.pageSize) ||
      !Number.isInteger(result.body.totalItems) || !Number.isInteger(result.body.totalPages)) {
    throw new Error(`Users reconciliation returned an invalid page (HTTP ${result.status}, page ${expectedPage}).`);
  }

  const { items, pageNumber, pageSize, totalItems, totalPages } = result.body as {
    items: unknown[]; pageNumber: number; pageSize: number; totalItems: number; totalPages: number;
  };
  const calculatedPages = totalItems === 0 ? 0 : Math.ceil(totalItems / expectedPageSize);
  if (pageNumber !== expectedPage || pageSize !== expectedPageSize || totalItems < 0 ||
      totalPages !== calculatedPages || totalPages > 0 && expectedPage > totalPages) {
    throw new Error(`Users reconciliation returned inconsistent pagination metadata on page ${expectedPage}.`);
  }

  const parsed: UserSummary[] = [];
  for (const item of items) {
    if (!object(item) || !safeId(item.id) || typeof item.name !== "string") {
      throw new Error(`Users reconciliation returned an invalid item on page ${expectedPage}.`);
    }
    parsed.push({ id: item.id, name: item.name });
  }
  if (parsed.length > pageSize || totalItems === 0 && parsed.length !== 0 || totalItems > 0 && parsed.length === 0) {
    throw new Error(`Users reconciliation returned an inconsistent item count on page ${expectedPage}.`);
  }
  return { items: parsed, pageNumber, pageSize, totalItems, totalPages };
}

export async function fetchAllUsers(search: string, list: CleanupApi["list"]): Promise<UserSummary[]> {
  const first = parsePage(await list(search, 1, PAGE_SIZE), 1, PAGE_SIZE);
  const items = [...first.items];
  const ids = new Set(items.map((item) => item.id));

  for (let pageNumber = 2; pageNumber <= first.totalPages; pageNumber += 1) {
    const page = parsePage(await list(search, pageNumber, PAGE_SIZE), pageNumber, PAGE_SIZE);
    if (page.totalItems !== first.totalItems || page.totalPages !== first.totalPages || page.pageSize !== first.pageSize) {
      throw new Error(`Users reconciliation pagination changed while reading page ${pageNumber}.`);
    }
    for (const item of page.items) {
      if (ids.has(item.id)) throw new Error(`Users reconciliation repeated ID ${item.id} across pages.`);
      ids.add(item.id);
      items.push(item);
    }
  }

  if (items.length !== first.totalItems) {
    throw new Error(`Users reconciliation returned ${items.length} of ${first.totalItems} reported records.`);
  }
  return items;
}

function inventoryEmails(entry: UserInventoryEntry): string[] {
  return [...new Set([entry.email, ...(entry.alternateEmails ?? [])])];
}

export async function assertUsersInventoryIsUnused(
  entries: UserInventoryEntry[],
  list: CleanupApi["list"],
): Promise<void> {
  for (const entry of entries) {
    for (const search of [...inventoryEmails(entry), ...entry.expectedNames]) {
      const matches = await fetchAllUsers(search, list);
      if (matches.length > 0) {
        throw new Error(`Users test inventory collision for ${entry.key}; refusing mutation.`);
      }
    }
  }
}

export async function reconcileUsersInventory(
  entries: UserInventoryEntry[],
  list: CleanupApi["list"],
  requireCreated: (entry: UserInventoryEntry) => boolean = (entry) => entry.createSucceeded,
): Promise<Map<string, UserSummary>> {
  const found = new Map<string, UserSummary>();
  for (const entry of entries) {
    const results: UserSummary[] = [];
    for (const email of inventoryEmails(entry)) {
      const matches = await fetchAllUsers(email, list);
      if (matches.some((item) => !entry.expectedNames.includes(item.name))) {
        throw new Error("Users test inventory returned an unexpected record for " + entry.key + ".");
      }
      results.push(...matches);
    }
    const exact = [...new Map(results.filter((item) => entry.expectedNames.includes(item.name)).map((item) => [item.id, item])).values()];
    if (exact.length > 1) throw new Error("Users test inventory is ambiguous for " + entry.key + ".");
    if (exact.length === 1) {
      const item = exact[0];
      if (entry.id !== null && item.id !== entry.id) {
        throw new Error("Users test inventory ID mismatch for " + entry.key + ".");
      }
      found.set(entry.key, item);
    } else if (requireCreated(entry)) {
      throw new Error("Users test could not reconcile expected record " + entry.key + ".");
    }
  }
  return found;
}

function appendError(inventory: UserCleanupInventory, message: string) {
  if (!inventory.errors.includes(message)) inventory.errors.push(message);
}

export async function cleanupUsersInventory(
  inventory: UserCleanupInventory,
  api: CleanupApi,
  persist: () => Promise<void>,
): Promise<{ ok: boolean; errors: string[] }> {
  const verifiedIds = new Set<number>();
  let finalReconciliationComplete = false;
  const persistSafely = async () => {
    try {
      await persist();
    } catch {
      appendError(inventory, "Local cleanup inventory could not be persisted.");
    }
  };

  for (const entry of inventory.users) {
    if (entry.createAttempted && !entry.createSucceeded) {
      appendError(inventory, `Creation response was not confirmed for ${entry.key}; reconciling any partial record.`);
    }
  }

  for (let round = 1; round <= MAX_CLEANUP_ROUNDS; round += 1) {
    const found = new Map<string, UserSummary>();
    for (const entry of inventory.users.filter((candidate) => candidate.createAttempted)) {
      try {
        const reconciled = await reconcileUsersInventory(
          [entry],
          api.list,
          (candidate) => candidate.createSucceeded && !candidate.deleted,
        );
        const match = reconciled.get(entry.key);
        if (match) found.set(entry.key, match);
      } catch (error) {
        appendError(inventory, error instanceof Error ? error.message : `Users cleanup discovery failed for ${entry.key}.`);
      }
    }

    for (const entry of inventory.users) {
      const match = found.get(entry.key);
      if (match) entry.id = match.id;
    }
    await persistSafely();

    for (const entry of inventory.users) {
      if (entry.id === null || verifiedIds.has(entry.id)) continue;
      let deletion: { status: number } | null = null;
      try {
        deletion = await api.delete(entry.id);
        entry.deleteStatus = deletion.status;
        if (![200, 410].includes(deletion.status)) {
          appendError(inventory, `DELETE failed for ${entry.key} (HTTP ${deletion.status}).`);
        }
      } catch {
        appendError(inventory, `DELETE request failed for ${entry.key}.`);
      }
      try {
        const verification = await api.get(entry.id);
        entry.getStatus = verification.status;
        if (verification.status === 410) {
          entry.deleted = true;
          verifiedIds.add(entry.id);
        } else {
          appendError(inventory, `GET did not confirm soft deletion for ${entry.key} (HTTP ${verification.status}).`);
        }
      } catch {
        appendError(inventory, `GET verification failed for ${entry.key}.`);
      }
      await persistSafely();
    }

    const attempted = inventory.users.filter((entry) => entry.createAttempted);
    let finalDiscoveryComplete = true;
    let anyRemaining = false;
    for (const entry of attempted) {
      try {
        const remaining = await reconcileUsersInventory([entry], api.list, () => false);
        const item = remaining.get(entry.key);
        if (item) {
          anyRemaining = true;
          if (entry.id === null) entry.id = item.id;
        }
      } catch (error) {
        finalDiscoveryComplete = false;
        appendError(inventory, error instanceof Error ? error.message : `Final Users cleanup reconciliation failed for ${entry.key}.`);
      }
    }
    await persistSafely();
    if (finalDiscoveryComplete && !anyRemaining && attempted.every((entry) => entry.id !== null && verifiedIds.has(entry.id))) {
      finalReconciliationComplete = true;
      break;
    }
  }

  if (!finalReconciliationComplete) appendError(inventory, "Users cleanup did not reach a verified empty state after bounded retries.");
  inventory.state = inventory.errors.length === 0 && finalReconciliationComplete ? "clean" : "cleanup-failed";
  await persistSafely();
  return { ok: inventory.state === "clean", errors: [...inventory.errors] };
}
