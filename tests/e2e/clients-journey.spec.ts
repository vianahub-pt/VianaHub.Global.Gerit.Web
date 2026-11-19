import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";
import { missingRequiredPermissionGrants } from "./helpers/permission-claims";

type ApiResult = { status: number; body: unknown };

function safeObjectResponseShape(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { payloadType: Array.isArray(payload) ? "array" : typeof payload };
  const record = payload as Record<string, unknown>;
  return { topLevelKeys: Object.keys(record), fieldTypes: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value === null ? "null" : typeof value])) };
}

function safePageResponseShape(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { payloadType: Array.isArray(payload) ? "array" : typeof payload };
  }
  const record = payload as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : null;
  const firstItem = items?.[0];
  return {
    topLevelKeys: Object.keys(record),
    itemsType: Array.isArray(record.items) ? "array" : typeof record.items,
    metadataTypes: Object.fromEntries(["pageNumber", "pageSize", "totalItems", "totalPages"].map((key) => [key, typeof record[key]])),
    firstItemKeys: typeof firstItem === "object" && firstItem !== null ? Object.keys(firstItem) : [],
    firstItemTypes: typeof firstItem === "object" && firstItem !== null
      ? Object.fromEntries(Object.entries(firstItem as Record<string, unknown>).map(([key, value]) => [key, value === null ? "null" : typeof value]))
      : {},
  };
}

async function installVisualPointer(page: Page) {
  await page.addInitScript((showPointer: boolean) => {
    if (!showPointer) return;
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer")) return;
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.appendChild(pointer);
      document.addEventListener("pointermove", (event) => {
        pointer.style.left = event.clientX + "px";
        pointer.style.top = event.clientY + "px";
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");
}

async function api(page: Page, method: string, path: string): Promise<ApiResult> {
  return page.evaluate(async ({ requestMethod, requestPath }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: session.accessToken ? { Authorization: "Bearer " + session.accessToken } : {},
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { requestMethod: method, requestPath: path });
}

async function readClientPermissionClaims(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("gerit.auth.session.v1");
      const token = raw ? (JSON.parse(raw) as { accessToken?: unknown }).accessToken : undefined;
      if (typeof token !== "string") return null;
      const payload = token.split(".")[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const encoded = atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="));
      const claims = JSON.parse(encoded) as { role?: unknown; permissions?: Record<string, unknown> };
      const clientGrant = Object.entries(claims.permissions ?? {}).find(
        ([resource]) => resource.trim().toLowerCase() === "clients",
      )?.[1];
      return {
        role: Array.isArray(claims.role) ? claims.role : [claims.role],
        permissions: { Clients: clientGrant },
      };
    } catch {
      return null;
    }
  });
}

async function cleanupCreatedClients(page: Page, createdClientIds: Set<number>) {
  for (const id of createdClientIds) {
    const cleanupDelete = await api(page, "DELETE", "/api/gerit/v1/clients/" + id);
    expect([200, 410]).toContain(cleanupDelete.status);
    const cleanupGone = await api(page, "GET", "/api/gerit/v1/clients/" + id);
    expect(cleanupGone.status).toBe(410);
    createdClientIds.delete(id);
    console.log("[E2E Client cleanup] id=" + id + " DELETE=" + cleanupDelete.status + " GET=" + cleanupGone.status);
  }
}

test("Client V1 create, search, update, lifecycle, soft delete and deterministic cleanup", async ({ page }) => {
  test.skip(process.env.E2E_CLIENT_QA_MUTATION_APPROVAL !== "true", "Requires explicit per-run Client QA CRUD approval.");
  test.setTimeout(300_000);
  const uniqueName = "E2E-CLIENT-" + randomUUID();
  const updatedName = uniqueName + "-updated";
  const createdClientIds = new Set<number>();
  let clientId: number | null = null;

  try {
    await installVisualPointer(page);
    await authenticateFromLogin(page);
    const claims = await readClientPermissionClaims(page);
    const missingGrants = missingRequiredPermissionGrants(
      claims,
      "Clients",
      ["Admin", "BackOffice"],
      ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete"],
    );
    expect(missingGrants, "QA account must have an allowed role and all Client action grants before CRUD").toEqual([]);

    const initialPageResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.status() >= 200 && response.status() < 300 &&
      new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged");
    await page.goto("/clients/");
    const initialPageResponse = await initialPageResponsePromise;
    const initialPagePayload = await initialPageResponse.json().catch(() => null) as unknown;
    console.log("[E2E Client] list GET=" + initialPageResponse.status() + " responseShape=" + JSON.stringify(safePageResponseShape(initialPagePayload)));
    expect(initialPageResponse.status()).toBe(200);
    await expect(page.getByTestId("clients-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const statusFilter = page.getByTestId("clients-page-root").getByRole("combobox", { name: /^(Estado|Status)$/i });
    await expect(statusFilter).toHaveCount(1);
    for (const filter of [
      { label: /^(Ativo|Active|Activos)$/i, queryValue: "true", expected: true },
      { label: /^(Inativo|Inactive|Inactivos)$/i, queryValue: "false", expected: false },
      { label: /^(Mostrar todos|Show all)$/i, queryValue: null, expected: null },
    ]) {
      const filterResponsePromise = page.waitForResponse((response) => {
        if (response.request().method() !== "GET" || (response.status() >= 300 && response.status() < 400)) return false;
        const url = new URL(response.url());
        return url.pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged" &&
          url.searchParams.get("IsActive") === filter.queryValue;
      });
      await statusFilter.click();
      await page.getByRole("option", { name: filter.label }).click();
      const filterResponse = await filterResponsePromise;
      expect(filterResponse.status()).toBe(200);
      const filterPayload = await filterResponse.json().catch(() => null) as unknown;
      const filterItems = typeof filterPayload === "object" && filterPayload !== null &&
        Array.isArray((filterPayload as { items?: unknown }).items)
        ? (filterPayload as { items: unknown[] }).items
        : [];
      if (filter.expected !== null) {
        expect(filterItems.every((item) => typeof item === "object" && item !== null &&
          (item as Record<string, unknown>).isActive === filter.expected)).toBe(true);
      }
    }
    const initialPageTotalPages = typeof initialPagePayload === "object" && initialPagePayload !== null
      ? (initialPagePayload as { totalPages?: unknown }).totalPages
      : null;
    expect(Number.isInteger(initialPageTotalPages)).toBe(true);
    console.log("[E2E Client] list pagination totalPages=" + initialPageTotalPages);
    if (typeof initialPageTotalPages === "number" && initialPageTotalPages > 1) {
      const pageTwoResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "GET" &&
        !(response.status() >= 300 && response.status() < 400) &&
        new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged" &&
        new URL(response.url()).searchParams.get("PageNumber") === "2");
      await page.getByTestId("clients-page-root").getByRole("button", { name: "2", exact: true }).click();
      expect((await pageTwoResponsePromise).status()).toBe(200);

      const pageOneResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "GET" &&
        !(response.status() >= 300 && response.status() < 400) &&
        new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged" &&
        new URL(response.url()).searchParams.get("PageNumber") === "1");
      await page.getByTestId("clients-page-root").getByRole("button", { name: "1", exact: true }).click();
      expect((await pageOneResponsePromise).status()).toBe(200);
    }
    await page.goto("/clients/new/");
    await expect(page.getByTestId("client-create-page")).toBeVisible();
    const partyType = page.getByTestId("client-party-type");
    const partyTypeIds = await partyType.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
    expect(partyTypeIds.sort()).toEqual(["1", "2"]);
    await partyType.selectOption("1");
    const source = page.getByTestId("client-acquisition-source");
    const sourceIds = await source.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
    expect(sourceIds.length).toBeGreaterThan(0);
    const sourceId = sourceIds[0];

    await source.selectOption(sourceId);
    await page.getByTestId("client-name").fill(uniqueName);

    const createResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients");
    await page.getByTestId("client-save").click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json() as { id?: unknown };
    if (typeof createBody.id !== "number" || !Number.isInteger(createBody.id) || createBody.id <= 0) {
      throw new Error("Client create response did not include a valid ID; refusing any name-based cleanup.");
    }
    clientId = createBody.id;
    createdClientIds.add(clientId);
    console.log("[E2E Client] POST=201 createdId=" + clientId);
    await expect(page).toHaveURL(new RegExp("/clients/" + clientId + "/$"));
    await expect(page.getByTestId("client-detail-page")).toBeVisible();
    await expect(page.getByTestId("client-fields-section")).toBeVisible();
    const createdNameField = page.getByTestId("client-name");
    await expect(createdNameField).toBeEnabled();
    await expect(createdNameField).toHaveValue(uniqueName);
    const createdDetail = await api(page, "GET", "/api/gerit/v1/clients/" + clientId);
    expect(createdDetail.status).toBe(200);
    console.log("[E2E Client] detail GET=" + createdDetail.status + " responseShape=" + JSON.stringify(safeObjectResponseShape(createdDetail.body)));
    expect(createdDetail.body).toMatchObject({
      statusDomainId: 1,
      statusDefinitionId: 4,
      isActive: true,
      name: uniqueName,
    });

    await page.goto("/clients/");
    const search = page.getByTestId("clients-page-root").getByRole("textbox");
    await expect(search).toHaveCount(1);
    const exactSearchResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "GET") return false;
      const url = new URL(response.url());
      return url.pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged" &&
        url.searchParams.get("Search") === uniqueName && !(response.status() >= 300 && response.status() < 400);
    });
    await search.fill(uniqueName);
    const exactSearchResponse = await exactSearchResponsePromise;
    const exactSearchPayload = await exactSearchResponse.json().catch(() => null) as unknown;
    const searchResults = typeof exactSearchPayload === "object" && exactSearchPayload !== null &&
      Array.isArray((exactSearchPayload as { items?: unknown }).items)
      ? (exactSearchPayload as { items: unknown[] }).items
      : [];
    const syntheticIdMatches = searchResults.filter((item) =>
      typeof item === "object" && item !== null &&
      (item as Record<string, unknown>).id === clientId &&
      (item as Record<string, unknown>).name === uniqueName,
    );
    const syntheticNameMatches = searchResults.filter((item) =>
      typeof item === "object" && item !== null &&
      (item as Record<string, unknown>).name === uniqueName,
    );
    const exactMatch = syntheticIdMatches.length === 1 && syntheticNameMatches.length === 1;
    console.log("[E2E Client] search GET=" + exactSearchResponse.status() + " exactSyntheticMatch=" + exactMatch + " responseShape=" + JSON.stringify(safePageResponseShape(exactSearchPayload)));
    expect(exactSearchResponse.status()).toBe(200);
    expect(syntheticIdMatches).toHaveLength(1);
    expect(syntheticNameMatches).toHaveLength(1);

    const listRoot = page.getByTestId("clients-page-root");
    const syntheticNameCell = listRoot.getByRole("cell", { name: uniqueName, exact: true });
    await expect(syntheticNameCell).toHaveCount(1);
    const syntheticRow = syntheticNameCell.locator("xpath=ancestor::tr[1]");
    await expect(syntheticRow).toHaveAttribute("tabindex", "0");
    const selectedDetailResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      !(response.status() >= 300 && response.status() < 400) &&
      new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/" + clientId);
    await syntheticNameCell.click();
    const selectedDetailResponse = await selectedDetailResponsePromise;
    expect(selectedDetailResponse.status()).toBe(200);
    const selectedDetailBody = await selectedDetailResponse.json() as { id?: unknown };
    expect(selectedDetailBody.id).toBe(clientId);
    await expect(page).toHaveURL((url) => url.pathname === "/clients/" + clientId + "/");
    await expect(page.getByTestId("client-detail-page")).toBeVisible();
    await expect(page.getByTestId("client-fields-section")).toBeVisible();

    await expect(page.getByTestId("client-fields-section")).toBeVisible();
    const editableClientName = page.getByTestId("client-name");
    await expect(editableClientName).toBeEnabled();
    await expect(editableClientName).toHaveValue(uniqueName);
    await editableClientName.fill(updatedName);
    const updateResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "PUT" &&
      response.status() >= 200 && response.status() < 300 &&
      new URL(response.url()).pathname.replace(/\/$/, "").endsWith("/clients/" + clientId));
    await page.getByTestId("client-save").click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);
    expect(await updateResponse.json()).toBe(true);
    const updateBody = updateResponse.request().postDataJSON() as Record<string, unknown>;
    expect(updateBody.name).toBe(updatedName);
    expect(updateBody.statusDomainId).toBe(1);
    expect("isActive" in updateBody).toBe(false);
    expect("tenantId" in updateBody).toBe(false);
    expect("individual" in updateBody || "company" in updateBody || "tradeName" in updateBody || "legalRepresentative" in updateBody).toBe(false);
    const updatedDetail = await api(page, "GET", "/api/gerit/v1/clients/" + clientId);
    expect(updatedDetail.status).toBe(200);
    expect(updatedDetail.body).toMatchObject({ name: updatedName, statusDomainId: 1, statusDefinitionId: 4, isActive: true });

    const deactivatePromise = page.waitForResponse((response) =>
      response.request().method() === "PATCH" &&
      response.status() >= 200 && response.status() < 300 &&
      new URL(response.url()).pathname.replace(/\/$/, "").endsWith("/clients/" + clientId + "/deactivate"));
    await page.getByTestId("client-lifecycle-toggle").click();
    const deactivateResponse = await deactivatePromise;
    expect(deactivateResponse.status()).toBe(200);
    expect(await deactivateResponse.json()).toBe(true);
    const inactiveDetail = await api(page, "GET", "/api/gerit/v1/clients/" + clientId);
    expect(inactiveDetail.status).toBe(200);
    expect(inactiveDetail.body).toMatchObject({ isActive: false, statusDomainId: 1, statusDefinitionId: 4 });

    const activatePromise = page.waitForResponse((response) =>
      response.request().method() === "PATCH" &&
      response.status() >= 200 && response.status() < 300 &&
      new URL(response.url()).pathname.replace(/\/$/, "").endsWith("/clients/" + clientId + "/activate"));
    await page.getByTestId("client-lifecycle-toggle").click();
    const activateResponse = await activatePromise;
    expect(activateResponse.status()).toBe(200);
    expect(await activateResponse.json()).toBe(true);
    const activeDetail = await api(page, "GET", "/api/gerit/v1/clients/" + clientId);
    expect(activeDetail.status).toBe(200);
    expect(activeDetail.body).toMatchObject({ isActive: true, statusDomainId: 1, statusDefinitionId: 4 });

    await page.getByTestId("client-delete").click();
    const deletePromise = page.waitForResponse((response) =>
      response.request().method() === "DELETE" &&
      response.status() >= 200 && response.status() < 300 &&
      new URL(response.url()).pathname.replace(/\/$/, "").endsWith("/clients/" + clientId));
    await page.getByRole("alertdialog").getByRole("button").last().click();
    const deleteResponse = await deletePromise;
    expect(deleteResponse.status()).toBe(200);
    expect(await deleteResponse.json()).toBe(true);
    await expect(page).toHaveURL(/\/clients\/$/);
    const goneResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.status() >= 400 &&
      new URL(response.url()).pathname.replace(/\/$/, "").endsWith("/api/gerit/v1/clients/" + clientId));
    await page.goto("/clients/" + clientId + "/");
    const goneResponse = await goneResponsePromise;
    expect(goneResponse.status()).toBe(410);
    createdClientIds.delete(clientId);
    console.log("[E2E Client] PUT=200 PATCH deactivate=200 activate=200 DELETE=200 GET-after-delete=410 id=" + clientId);
  } finally {
    await cleanupCreatedClients(page, createdClientIds);
  }
});
