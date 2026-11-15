type PagedTeamsResponse = {
  status: number;
  body: unknown;
} | null;

type TeamCleanupApi = {
  getPage: (pageNumber: number, pageSize: number) => Promise<PagedTeamsResponse>;
  deleteById: (id: number) => Promise<PagedTeamsResponse>;
  getById: (id: number) => Promise<PagedTeamsResponse>;
};

type TeamsCleanupInput = {
  knownIds: Iterable<number>;
  csvImportAttempted: boolean;
  csvName: string;
  api: TeamCleanupApi;
};

export type TeamsCleanupResult = {
  cleanedIds: number[];
  errors: string[];
  pendingIdentifiers: string[];
};

const cleanupPageSize = 100;

function readPage(response: PagedTeamsResponse, requestedPage: number) {
  if (!response || response.status !== 200 || typeof response.body !== "object" || response.body === null) {
    throw new Error("Teams CSV discovery did not return a valid HTTP 200 page.");
  }

  const body = response.body as {
    items?: unknown;
    pageNumber?: unknown;
    pageSize?: unknown;
    totalItems?: unknown;
    totalPages?: unknown;
  };
  if (
    !Array.isArray(body.items) ||
    body.pageNumber !== requestedPage ||
    body.pageSize !== cleanupPageSize ||
    typeof body.totalItems !== "number" ||
    !Number.isInteger(body.totalItems) ||
    body.totalItems < 0 ||
    typeof body.totalPages !== "number" ||
    !Number.isInteger(body.totalPages) ||
    body.totalPages < 0
  ) {
    throw new Error("Teams CSV discovery returned malformed or inconsistent pagination metadata.");
  }

  return {
    items: body.items as Array<{ id?: unknown; name?: unknown }>,
    pageNumber: body.pageNumber,
    pageSize: body.pageSize,
    totalItems: body.totalItems,
    totalPages: body.totalPages,
  };
}

export async function discoverCsvTeamIds(
  csvName: string,
  getPage: TeamCleanupApi["getPage"],
  expectedMatches: number,
): Promise<number[]> {
  const first = readPage(await getPage(1, cleanupPageSize), 1);
  if (first.totalPages === 0 && (first.totalItems !== 0 || first.items.length !== 0)) {
    throw new Error("Teams CSV discovery reported items without pages.");
  }

  const pages = [first];
  for (let pageNumber = 2; pageNumber <= first.totalPages; pageNumber += 1) {
    const page = readPage(await getPage(pageNumber, cleanupPageSize), pageNumber);
    if (page.totalPages !== first.totalPages || page.totalItems !== first.totalItems) {
      throw new Error("Teams CSV discovery pagination changed while reconciling the run.");
    }
    pages.push(page);
  }

  const allItems = pages.flatMap((page) => page.items);
  if (allItems.length !== first.totalItems) {
    throw new Error("Teams CSV discovery did not reconcile the reported total item count.");
  }

  const matches: number[] = [];
  for (const item of allItems) {
    if (item.name !== csvName) continue;
    if (typeof item.id !== "number" || !Number.isSafeInteger(item.id) || item.id <= 0) {
      throw new Error("Teams CSV discovery found the exact run identifier without a valid ID.");
    }
    matches.push(item.id);
  }
  if (matches.length !== expectedMatches) {
    throw new Error(
      "Teams CSV discovery expected " + expectedMatches + " exact match(es), found " + matches.length + ".",
    );
  }
  if (new Set(matches).size !== matches.length) {
    throw new Error("Teams CSV discovery returned duplicate IDs for the run identifier.");
  }
  return matches;
}

export async function reconcileTeamsRun(input: TeamsCleanupInput): Promise<TeamsCleanupResult> {
  const ids = new Set(input.knownIds);
  const errors: string[] = [];
  const pendingIdentifiers: string[] = [];

  if (input.csvImportAttempted) {
    try {
      const csvIds = await discoverCsvTeamIds(input.csvName, input.api.getPage, 1);
      for (const id of csvIds) ids.add(id);
    } catch (error) {
      errors.push("CSV cleanup could not reconcile " + input.csvName + ": " + (error instanceof Error ? error.message : "unknown discovery error"));
      pendingIdentifiers.push(input.csvName);
    }
  }

  const cleanedIds: number[] = [];
  for (const id of ids) {
    let removal: PagedTeamsResponse = null;
    try {
      removal = await input.api.deleteById(id);
    } catch {
      errors.push("DELETE " + id + " request failed.");
    }
    if (removal && removal.status !== 200 && removal.status !== 404 && removal.status !== 410) {
      errors.push("DELETE " + id + " returned HTTP " + removal.status + ".");
    }

    let verification: PagedTeamsResponse = null;
    try {
      verification = await input.api.getById(id);
    } catch {
      errors.push("GET " + id + " verification request failed.");
    }
    if (!verification || (verification.status !== 404 && verification.status !== 410)) {
      errors.push("GET " + id + " did not confirm removal.");
    } else {
      cleanedIds.push(id);
    }
  }

  return { cleanedIds, errors, pendingIdentifiers };
}
