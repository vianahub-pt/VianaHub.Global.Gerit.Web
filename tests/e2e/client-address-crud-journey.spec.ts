import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { authenticateFromLogin } from "./helpers/auth";
import { missingRequiredPermissionGrants } from "./helpers/permission-claims";
import { classifyClientAddressCrudRequest, validateCrudApproval, validateQaIdentityClaims, validateSyntheticAddressPayload } from "../../scripts/e2e/client-address-crud-guard.mjs";

const MOCK_CLIENT_ID = 4242;
const MOCK_ADDRESS_ID = 8402;
const mode = process.env.E2E_CLIENT_ADDRESS_MODE ?? "mocked";
const clientId = mode === "qa" ? Number(process.env.E2E_CLIENT_ADDRESS_QA_CLIENT_ID) : MOCK_CLIENT_ID;
const environmentPolicy = JSON.parse(readFileSync(resolve("scripts/e2e/environment-policy.json"), "utf8")) as { clientAddressCrudQaEnabled?: boolean };
const expectedQaUserId = process.env.E2E_CLIENT_ADDRESS_QA_EXPECTED_USER_ID ?? "";
const expectedQaTenantId = process.env.E2E_CLIENT_ADDRESS_QA_EXPECTED_TENANT_ID ?? "";
const qaApproval = validateCrudApproval({
  mode, clientId, approvalId: process.env.E2E_CLIENT_ADDRESS_QA_APPROVAL_ID,
  approvalValue: process.env.E2E_CLIENT_ADDRESS_QA_APPROVAL,
  mutatingApproved: process.env.E2E_CLIENT_ADDRESS_MUTATING_APPROVED === "true",
  qaExecutionEnabled: environmentPolicy.clientAddressCrudQaEnabled === true,
  allowedClientId: process.env.E2E_CLIENT_ADDRESS_QA_ALLOWED_CLIENT_ID,
  expectedUserId: expectedQaUserId, expectedTenantId: expectedQaTenantId,
});
if (mode === "qa" && !qaApproval.allowed) throw new Error("ClientAddress QA CRUD is disabled until prior cleanup is verified and fresh per-run authorization is configured.");
const trace: Array<{ method: string; path: string; status?: number }> = [];

type Address = {
  id: number; clientId: number; addressTypeId: number; addressTypeName: string; countryCode: string; street: string;
  streetNumber: string | null; complement: string | null; neighborhood: string | null; city: string; district: string | null;
  postalCode: string; latitude: number | null; longitude: number | null; note: string | null; isPrimary: boolean;
  isActive: boolean; createdAt: string; isDeleted?: boolean;
};

function accessToken() {
  const claims = {
    sub: "9001", tenant_id: "1", email: "synthetic@example.invalid", role: ["Admin"],
    permissions: {
      Clients: ["GetPaged", "GetBy", "Update"],
      ClientAddresses: ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete"],
      AddressTypes: ["GetAll"],
    }, exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return "eyJhbGciOiJub25lIn0." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".synthetic";
}

async function installSyntheticSession(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem("gerit.auth.session.v1", JSON.stringify({
      accessToken: token, refreshToken: "synthetic-refresh", accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 7200000).toISOString(), roleId: 1, roleName: "Admin",
      userId: 9001, userName: "Synthetic User", tenantId: 1, tenantName: "Synthetic Tenant",
      email: "synthetic@example.invalid", name: "Synthetic User",
    }));
  }, accessToken());
}

async function installPointer(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer")) return;
      const pointer = document.createElement("div"); pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.append(pointer);
      document.addEventListener("pointermove", (event) => { pointer.style.left = event.clientX + "px"; pointer.style.top = event.clientY + "px"; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
  });
}

function sanitizedPath(path: string) {
  return path.replace(/\/clients\/\d+/g, "/clients/{clientId}").replace(/\/addresses\/\d+/g, "/addresses/{addressId}");
}

async function saveEvidence(page: Page, file: string) {
  const dir = resolve("test-results/client-address-crud"); await mkdir(dir, { recursive: true });
  await page.screenshot({ path: resolve(dir, `${file}.png`), fullPage: true, animations: "disabled", style: [
    "table tbody td, table tbody th { color: transparent !important; text-shadow: none !important; }",
    "[data-testid='client-detail-page'] header h1 { color: transparent !important; }",
    "[data-testid='client-address-form'] input, [data-testid='client-address-form'] textarea { color: transparent !important; text-shadow: none !important; }",
    "[data-testid='client-address-form'] [role='combobox'] { color: transparent !important; }",
  ].join("\n") });
  await writeFile(resolve(dir, "trace.json"), JSON.stringify({ evidence: "synthetic-or-sanitized-metadata", entries: trace }, null, 2), "utf8");
}

async function readPermissionClaims(page: Page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("gerit.auth.session.v1");
      const token = raw ? (JSON.parse(raw) as { accessToken?: unknown }).accessToken : undefined;
      if (typeof token !== "string") return null;
      const payload = token.split(".")[1]; if (!payload) return null;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="))) as { sub?: string; email?: string; role?: unknown; permissions?: Record<string, unknown>; tenant_id?: string };
    } catch { return null; }
  });
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function pageBody(items: Address[]) { return { items, pageNumber: 1, pageSize: 10, totalItems: items.length, totalPages: items.length ? 1 : 0 }; }

async function verifyDeletedAddress(page: Page, parentClientId: number, addressId: number, markers: string[]) {
  return page.evaluate(async ({ detailPath, listPath, markers: expectedMarkers }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const token = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const [detail, lists] = await Promise.all([
        fetch(detailPath, { headers }),
        Promise.all(expectedMarkers.map((marker) => fetch(`${listPath}?Search=${encodeURIComponent(marker)}&PageNumber=1&PageSize=100`, { headers }))),
      ]);
      const detailPayload = await detail.json().catch(() => null) as { street?: unknown; isPrimary?: unknown; clientId?: unknown } | null;
      const listPayloads = await Promise.all(lists.map((response) => response.json().catch(() => null) as Promise<{ items?: Array<{ street?: unknown }> } | null>));
      const matchingRows = listPayloads.flatMap((payload) => Array.isArray(payload?.items) ? payload.items.filter((item) => expectedMarkers.includes(String(item.street ?? ""))) : []);
      return {
        detailStatus: detail.status,
        listStatuses: lists.map((response) => response.status),
        absentFromLists: matchingRows.length === 0,
        ownedSyntheticDetail: detail.status === 200 && expectedMarkers.includes(String(detailPayload?.street ?? "")) && detailPayload?.isPrimary === false && (detailPayload?.clientId === undefined || detailPayload.clientId === parentClientId),
      };
    } catch {
      return { detailStatus: 0, listStatuses: [] as number[], absentFromLists: false, ownedSyntheticDetail: false };
    }
  }, { detailPath: `/api/gerit/v1/clients/${parentClientId}/addresses/${addressId}`, listPath: `/api/gerit/v1/clients/${parentClientId}/addresses/paged`, markers });
}

test("ClientAddress CRUD journey is run-scoped, parent-bound, and cleans up its synthetic record", async ({ page }) => {
  test.setTimeout(240_000);
  expect(["mocked", "qa"]).toContain(mode);
  expect(Number.isSafeInteger(clientId) && clientId > 0).toBe(true);

  const createdIds = new Set<number>();
  const blockedMutations: string[] = [];
  const unexpectedApi: string[] = [];
  const mutations: Array<{ method: string; path: string; bodyShape: string }> = [];
  const approvalId = process.env.E2E_CLIENT_ADDRESS_QA_APPROVAL_ID;
  const allowedOrigin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").origin;
  const syntheticMarker = "E2E-CA-" + randomUUID();
  const mockState: { address: Address | null } = { address: null };
  let createAttempted = false;
  let createOutcomeUnknown = false;
  let deleteAttempted = false;
  let deleteOutcomeUnknown = false;
  let deletedAndVerified = false;

  if (mode === "mocked") await installSyntheticSession(page);
  await installPointer(page);
  await page.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const method = request.method().toUpperCase(); const path = url.pathname.replace(/\/$/, "");
    const directQa = url.hostname.toLowerCase().replace(/\.$/, "") === "gerit-api.vianahub.pt";
    if (mode === "qa" && directQa) { blockedMutations.push(`${method} direct-api-host`); await route.abort("blockedbyclient"); return; }
    if (!url.pathname.startsWith("/api/")) {
      if (["GET", "HEAD"].includes(method)) return route.continue();
      blockedMutations.push(`${method} ${sanitizedPath(url.pathname)}`); await route.abort("blockedbyclient"); return;
    }
    if (mode === "qa") {
      const decision = classifyClientAddressCrudRequest({ pathname: url.pathname, method, origin: url.origin, allowedOrigin, clientId, createdAddressIds: createdIds, createAttempted, phase: "active", expectedUserId: expectedQaUserId, expectedTenantId: expectedQaTenantId });
      if (decision === "block") { blockedMutations.push(`${method} ${sanitizedPath(url.pathname)}`); await route.abort("blockedbyclient"); return; }
      if (decision === "allow-create") {
        let createPayload: Record<string, unknown> | null = null;
        try { createPayload = request.postDataJSON() as Record<string, unknown>; } catch { /* fail closed below */ }
        if (!validateSyntheticAddressPayload(createPayload, syntheticMarker)) { blockedMutations.push("POST invalid synthetic create payload"); await route.abort("blockedbyclient"); return; }
      }
      if (["allow-create", "allow-update", "allow-lifecycle", "allow-delete"].includes(decision)) {
        mutations.push({ method, path: sanitizedPath(path), bodyShape: method === "POST" || method === "PUT" ? "json-redacted" : "none" });
        if (method === "POST") createAttempted = true;
        if (method === "DELETE") deleteAttempted = true;
        try {
          const response = await route.fetch();
          if (method === "POST" && response.status() === 201) {
            const payload = await response.json().catch(() => null) as { id?: unknown } | null;
            if (typeof payload?.id === "number" && Number.isSafeInteger(payload.id) && payload.id > 0) createdIds.add(payload.id);
            else createOutcomeUnknown = true;
          }
          if (method === "POST" && response.status() !== 201 && ![400, 401, 403, 409, 410, 422].includes(response.status())) createOutcomeUnknown = true;
          if (method === "DELETE" && response.status() >= 500) deleteOutcomeUnknown = true;
          await route.fulfill({ response }); return;
        } catch {
          if (method === "POST") createOutcomeUnknown = true;
          if (method === "DELETE") deleteOutcomeUnknown = true;
          await route.abort("failed"); return;
        }
      }
      trace.push({ method, path: sanitizedPath(path) });
      const response = await route.fetch(); trace[trace.length - 1].status = response.status(); await route.fulfill({ response }); return;
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const decision = classifyClientAddressCrudRequest({ pathname: url.pathname, method, origin: url.origin, allowedOrigin, clientId, createdAddressIds: createdIds, createAttempted, phase: "active", expectedUserId: expectedQaUserId, expectedTenantId: expectedQaTenantId });
      if (decision === "allow-authentication" || decision === "block") { blockedMutations.push(`${method} ${sanitizedPath(path)}`); await route.abort("blockedbyclient"); return; }
      if (method === "POST") createAttempted = true;
      let payload: Record<string, unknown> | null = null;
      try { payload = method === "POST" || method === "PUT" ? request.postDataJSON() as Record<string, unknown> : null; } catch { /* fail closed for a synthetic create below */ }
      if (method === "POST" && !validateSyntheticAddressPayload(payload, syntheticMarker)) { blockedMutations.push("POST invalid synthetic create payload"); await route.abort("blockedbyclient"); return; }
      mutations.push({ method, path: sanitizedPath(path), bodyShape: payload ? Object.keys(payload).sort().join(",") : "none" });
      if (method === "POST") {
        if (mockState.address) { await json(route, 409, { title: "Duplicate synthetic create blocked" }); return; }
        mockState.address = { id: MOCK_ADDRESS_ID, clientId, addressTypeId: 3, addressTypeName: "Home", countryCode: String(payload?.countryCode ?? "PT"), street: String(payload?.street ?? ""), streetNumber: typeof payload?.streetNumber === "string" ? payload.streetNumber : null, complement: typeof payload?.complement === "string" ? payload.complement : null, neighborhood: typeof payload?.neighborhood === "string" ? payload.neighborhood : null, city: String(payload?.city ?? ""), district: typeof payload?.district === "string" ? payload.district : null, postalCode: String(payload?.postalCode ?? ""), latitude: typeof payload?.latitude === "number" ? payload.latitude : null, longitude: typeof payload?.longitude === "number" ? payload.longitude : null, note: typeof payload?.note === "string" ? payload.note : null, isPrimary: false, isActive: true, createdAt: new Date().toISOString() };
        createdIds.add(mockState.address.id); await json(route, 201, { id: mockState.address.id }); return;
      }
      const match = path.match(new RegExp(`^/api/gerit/v1/clients/${clientId}/addresses/(\\d+)(?:/(activate|deactivate))?$`));
      if (!mockState.address || !match || Number(match[1]) !== mockState.address.id) { await json(route, 410, { title: "Synthetic address unavailable" }); return; }
      if (method === "PUT") mockState.address = { ...mockState.address, ...(payload as Partial<Address>), id: mockState.address.id, clientId, isActive: mockState.address.isActive };
      else if (method === "PATCH") mockState.address = { ...mockState.address, isActive: match[2] === "activate" };
      else if (method === "DELETE") { mockState.address = { ...mockState.address, isDeleted: true }; }
      await json(route, 200, true); return;
    }

    if (url.hostname.toLowerCase().replace(/\.$/, "") === "gerit-api.vianahub.pt") { unexpectedApi.push("direct-api-host"); await route.abort("blockedbyclient"); return; }
    if (path === "/api/gerit/v1/clients/paged" && method === "GET") return json(route, 200, { items: [{ id: clientId, partyTypeName: "Individual", name: "Synthetic QA Client", phoneNumber: null, isActive: true }], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    if (path === `/api/gerit/v1/clients/${clientId}` && method === "GET") return json(route, 200, { id: clientId, partyTypeId: 1, partyType: "Individual", acquisitionSourceTypeId: 1, acquisitionSourceType: "Website", urlImage: null, note: "Synthetic", name: "Synthetic QA Client", phoneNumber: null, cellPhoneNumber: null, isCellPhoneWhatsapp: false, email: null, websiteUrl: null, birthDate: null, gender: null, nationality: null, companyRegistrationNumber: null, economicActivityCode: null, numberOfEmployees: null, statusDefinitionId: 4, statusDefinitionName: "Potential", statusDomainId: 1, statusDomainName: "Client", isActive: true, createdAt: "2026-01-01T00:00:00Z" });
    if (["/api/gerit/v1/party-types", "/api/gerit/v1/acquisition-source-types", "/api/gerit/v1/status-domains"].includes(path) && method === "GET") return json(route, 200, [{ id: 1, name: "Individual", isActive: true, languageCode: "en-US" }]);
    if (path === "/api/gerit/v1/status-definitions" && method === "GET") return json(route, 200, [{ id: 4, name: "Potential", statusDomainId: 1, isActive: true, languageCode: "en-US" }]);
    if (path === "/api/gerit/v1/address-types" && method === "GET") return json(route, 200, [{ id: 3, name: "Home", isActive: true }]);
    if (path.startsWith("/api/gerit/v1/user-preferences/user/") && method === "GET") return json(route, 200, { id: 9010, userId: 9001, appearance: "light", locale: "en-US", currencyCode: "EUR", timezone: "Europe/Lisbon", dateFormat: "DD-MM-YYYY", timeFormat: "24h", dayStart: "09:00", dayEnd: "18:00" });
    if (path === "/api/gerit/v1/subscriptions/tenant/1" && method === "GET") return json(route, 200, []);
    if (path === `/api/gerit/v1/clients/${clientId}/addresses/paged` && method === "GET") {
      const address = mockState.address;
      const visible = address && !address.isDeleted && (url.searchParams.get("IsActive") === null || address.isActive === (url.searchParams.get("IsActive") === "true")) && (!url.searchParams.get("Search") || `${address.street} ${address.city} ${address.postalCode}`.toLowerCase().includes((url.searchParams.get("Search") ?? "").toLowerCase())) ? [address] : [];
      return json(route, 200, pageBody(visible));
    }
    const detail = path.match(new RegExp(`^/api/gerit/v1/clients/${clientId}/addresses/(\\d+)$`));
    if (detail && method === "GET") return mockState.address && !mockState.address.isDeleted && mockState.address.id === Number(detail[1]) ? json(route, 200, mockState.address) : json(route, 410, { title: "Synthetic address unavailable" });
    if (path.startsWith("/api/")) {
      unexpectedApi.push(`${method} ${sanitizedPath(path)}`);
      await json(route, 599, { title: "Unmocked API request blocked by synthetic CRUD test" }); return;
    }
    await route.continue();
  });

  try {
    if (mode === "qa") {
      await authenticateFromLogin(page);
      const claims = await readPermissionClaims(page);
      expect(validateQaIdentityClaims(claims, { expectedUserId: expectedQaUserId, expectedTenantId: expectedQaTenantId, expectedEmail: process.env.E2E_USER_EMAIL })).toBe(true);
      expect(missingRequiredPermissionGrants(claims, "Clients", ["Admin", "BackOffice", "Manager"], ["GetBy", "Update"])).toEqual([]);
      expect(missingRequiredPermissionGrants(claims, "ClientAddresses", ["Admin", "BackOffice", "Manager"], ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete"])).toEqual([]);
      expect(missingRequiredPermissionGrants(claims, "AddressTypes", ["Admin", "BackOffice", "Manager"], ["GetAll"])).toEqual([]);
    }
    await page.goto("/");
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const clientsSection = sidebar.getByRole("button", { name: /clients|clientes|clienti/i });
    if (await clientsSection.getAttribute("aria-expanded") === "false") await clientsSection.click();
    const clientsLink = sidebar.locator('a[href="/clients"], a[href="/clients/"]');
    await expect(clientsLink).toBeVisible(); await clientsLink.click();
    await expect(page.getByTestId("clients-page-root")).toBeVisible();
    if (mode === "mocked") {
      const syntheticGrants = await page.evaluate(() => {
        const raw = localStorage.getItem("gerit.auth.session.v1");
        const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
        const payload = session.accessToken?.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
        return payload ? (JSON.parse(atob(payload)) as { permissions?: Record<string, string[]> }).permissions ?? {} : {};
      });
      expect(syntheticGrants.Clients).toEqual(["GetPaged", "GetBy", "Update"]);
      const clientRow = page.getByRole("row").filter({ hasText: "Synthetic QA Client" }).last();
      await expect(clientRow).toHaveAttribute("tabindex", "0");
      await clientRow.click();
      await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/$`));
    } else {
      const clientDetailResponsePromise = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}`);
      await page.goto(`/clients/${clientId}/`);
      const clientDetailResponse = await clientDetailResponsePromise; expect(clientDetailResponse.status()).toBe(200);
      const detailPayload = await clientDetailResponse.json() as { id?: unknown; tenantId?: unknown };
      expect(detailPayload.id).toBe(clientId);
      const claims = await readPermissionClaims(page);
      if (typeof detailPayload.tenantId === "number" && claims?.tenant_id) expect(detailPayload.tenantId).toBe(Number(claims.tenant_id));
    }
    await expect(page.getByTestId("client-detail-page")).toBeVisible();
    await page.getByRole("tab", { name: /addresses|endereços|moradas|direcciones/i }).click();
    const panel = page.getByTestId("client-addresses-panel"); await expect(panel).toBeVisible();
    await expect(page.getByTestId("client-address-form")).toBeVisible();
    await saveEvidence(page, "before-create");

    if (mode === "mocked") {
      await page.getByTestId("client-address-addressTypeId").click(); await page.getByRole("option", { name: "Home", exact: true }).click();
      await page.getByTestId("client-address-countryCode").click();
      const countrySearch = page.getByRole("combobox").last();
      if (await countrySearch.getAttribute("data-testid") !== "client-address-countryCode") await countrySearch.fill("Portugal");
      await page.getByRole("option", { name: "Portugal", exact: true }).first().click();
      await page.getByTestId("client-address-street").fill(syntheticMarker);
      await page.getByTestId("client-address-city").fill("Synthetic City");
      await page.getByTestId("client-address-postalCode").fill("0000-000");
    } else {
      if (!process.env.E2E_CLIENT_ADDRESS_QA_APPROVAL_ID) throw new Error("QA mode is missing the per-run approval identifier.");
      await page.getByTestId("client-address-addressTypeId").click();
      const firstType = page.getByRole("option").first(); await expect(firstType).toBeVisible(); await firstType.click();
      await page.getByTestId("client-address-countryCode").click();
      await page.getByRole("option", { name: "Portugal", exact: true }).first().click();
      await page.getByTestId("client-address-street").fill(syntheticMarker);
      await page.getByTestId("client-address-city").fill("Synthetic City");
      await page.getByTestId("client-address-postalCode").fill("0000-000");
    }

    const createResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}/addresses`);
    await page.getByTestId("client-address-form").getByRole("button", { name: /save|guardar|salvar/i }).click();
    const created = await createResponse; expect(created.status()).toBe(201);
    const createBody = await created.json() as { id?: unknown };
    if (typeof createBody.id !== "number" || !Number.isSafeInteger(createBody.id) || createBody.id <= 0) throw new Error("Create returned no verifiable address ID; no second POST will be attempted.");
    const addressId = createBody.id; createdIds.add(addressId);
    const uniqueStreet = mode === "mocked" ? syntheticMarker : syntheticMarker;
    await expect(panel.getByRole("row").filter({ hasText: uniqueStreet })).toBeVisible();
    trace.push({ method: "POST", path: `/clients/{clientId}/addresses`, status: 201 });
    await saveEvidence(page, "created");

    const detailPromise = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith(`/addresses/${addressId}`));
    await page.getByTestId(`client-address-edit-${addressId}`).click();
    const detailResponse = await detailPromise; expect(detailResponse.status()).toBe(200);
    await expect(page.getByTestId("client-address-street")).toHaveValue(uniqueStreet);
    await page.getByTestId("client-address-street").fill(`${uniqueStreet}-EDITED`);
    const updateResponsePromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith(`/addresses/${addressId}`));
    await page.getByTestId("client-address-form").getByRole("button", { name: /save|guardar|salvar/i }).click();
    expect((await updateResponsePromise).status()).toBe(200);
    await expect(panel.getByRole("row").filter({ hasText: `${uniqueStreet}-EDITED` })).toBeVisible();

    const deactivatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/addresses/${addressId}/deactivate`));
    await page.getByTestId(`client-address-toggle-${addressId}`).click(); expect((await deactivatePromise).status()).toBe(200);
    await expect(panel.getByTestId(`client-address-toggle-${addressId}`)).toHaveAttribute("aria-label", /activate|ativar/i);
    const activatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/addresses/${addressId}/activate`));
    await page.getByTestId(`client-address-toggle-${addressId}`).click(); expect((await activatePromise).status()).toBe(200);
    await expect(panel.getByTestId(`client-address-toggle-${addressId}`)).toHaveAttribute("aria-label", /deactivate|desativar/i);

    const grid = panel.locator(":scope > section").last();
    const search = grid.locator("input").first();
    const searchResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/addresses/paged") && new URL(response.url()).searchParams.get("Search") === uniqueStreet);
    await search.fill(uniqueStreet); expect((await searchResponse).status()).toBe(200);
    await expect(panel.getByRole("row").filter({ hasText: `${uniqueStreet}-EDITED` })).toBeVisible();
    await search.fill("");

    await page.getByTestId(`client-address-delete-${addressId}`).click();
    const dialog = page.getByRole("alertdialog"); await expect(dialog).toBeVisible();
    const deleteResponsePromise = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/addresses/${addressId}`));
    await dialog.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    expect((await deleteResponsePromise).status()).toBe(200); deleteAttempted = true;
    await expect(panel.getByRole("row").filter({ hasText: uniqueStreet })).toHaveCount(0);
    const deletionVerification = await verifyDeletedAddress(page, clientId, addressId, [uniqueStreet, `${uniqueStreet}-EDITED`]);
    expect(deletionVerification.detailStatus).toBe(410);
    expect(deletionVerification.listStatuses).toEqual([200, 200]);
    expect(deletionVerification.absentFromLists).toBe(true);
    deletedAndVerified = true; createdIds.delete(addressId);
    trace.push({ method: "GET", path: "/clients/{clientId}/addresses/{addressId}", status: 410 });
    await saveEvidence(page, "deleted-and-verified");
  } finally {
    if (mode === "mocked" && mockState.address && !mockState.address.isDeleted) {
      // Fail-safe cleanup for the synthetic in-memory API fixture.
      mockState.address.isDeleted = true;
    }
    if (mode === "qa" && createAttempted && createOutcomeUnknown && createdIds.size === 0) {
      const reconciliation = await page.evaluate(async ({ path, marker, parentClientId }) => {
        const raw = localStorage.getItem("gerit.auth.session.v1"); const token = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
        try {
          const response = await fetch(`${path}?Search=${encodeURIComponent(marker)}&PageNumber=1&PageSize=100`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          const payload = await response.json().catch(() => null) as { items?: Array<{ id?: unknown; street?: unknown; isPrimary?: unknown; clientId?: unknown }> } | null;
          const matches = response.ok && Array.isArray(payload?.items) ? payload.items.filter((item) => item.street === marker && item.isPrimary === false && (item.clientId === undefined || item.clientId === parentClientId) && typeof item.id === "number").map((item) => item.id as number) : [];
          return { status: response.status, matches };
        } catch { return { status: 0, matches: [] as number[] }; }
      }, { path: `/api/gerit/v1/clients/${clientId}/addresses/paged`, marker: syntheticMarker, parentClientId: clientId });
      if (reconciliation.status !== 200 || reconciliation.matches.length !== 1) {
        throw new Error("Ambiguous ClientAddress create could not be reconciled to exactly one synthetic record; stop without retrying POST.");
      }
      createdIds.add(reconciliation.matches[0]);
    }
    if (mode === "qa" && createdIds.size > 0) {
      const id = [...createdIds][0];
      const beforeCleanup = await verifyDeletedAddress(page, clientId, id, [syntheticMarker, `${syntheticMarker}-EDITED`]);
      if (beforeCleanup.detailStatus === 200 && beforeCleanup.ownedSyntheticDetail && (!deleteAttempted || deleteOutcomeUnknown)) {
        deleteAttempted = true;
        const cleanupStatus = await page.evaluate(async (path) => {
          const raw = localStorage.getItem("gerit.auth.session.v1"); const token = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
          try { return (await fetch(path, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} })).status; } catch { return 0; }
        }, `/api/gerit/v1/clients/${clientId}/addresses/${id}`);
        deleteOutcomeUnknown = cleanupStatus !== 200;
        const afterCleanup = await verifyDeletedAddress(page, clientId, id, [syntheticMarker, `${syntheticMarker}-EDITED`]);
        deletedAndVerified = afterCleanup.detailStatus === 410 && afterCleanup.listStatuses.every((status) => status === 200) && afterCleanup.absentFromLists;
      } else if (beforeCleanup.detailStatus === 410 && beforeCleanup.listStatuses.every((status) => status === 200) && beforeCleanup.absentFromLists) {
        deletedAndVerified = true;
      }
      if (!deletedAndVerified) throw new Error("ClientAddress cleanup could not be proven for the run-created marker; stop without touching another record.");
      createdIds.clear();
    }
    if (mode === "qa" && !deletedAndVerified && createdIds.size > 0) throw new Error("Cleanup remains unverified; no further mutation is permitted.");
  }
  expect(blockedMutations, "Unexpected mutation was blocked before network and invalidates this run").toEqual([]);
  expect(unexpectedApi, "Every mocked API request must be explicitly handled").toEqual([]);
  expect(mutations.map(({ method }) => method)).toEqual(["POST", "PUT", "PATCH", "PATCH", "DELETE"]);
  expect(deletedAndVerified).toBe(true);
  console.log(`[ClientAddress CRUD ${mode}] PASS create/read/update/deactivate/activate/delete/cleanup mutations=${mutations.length} marker=redacted`);
});
