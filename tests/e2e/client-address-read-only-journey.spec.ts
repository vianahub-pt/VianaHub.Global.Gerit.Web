import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";
import { classifyReadOnlyApiRequest } from "../../scripts/e2e/read-only-api-guard.mjs";

type SafeTraceEntry = {
  step: string;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  query?: { pageNumber?: string; isActive?: string; sortBy?: string; sortDirection?: string; searchApplied?: boolean };
};

function safePath(pathname: string) {
  return pathname
    .replace(/\/clients\/\d+/g, "/clients/{clientId}")
    .replace(/\/addresses\/\d+/g, "/addresses/{addressId}")
    .replace(/\/tenant\/\d+/gi, "/tenant/{tenantId}")
    .replace(/\/user\/\d+/gi, "/user/{userId}");
}

async function installReadOnlyApiGuard(page: Page, blockedRequests: string[]) {
  const allowedOrigin = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3100").origin;
  await page.context().route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isDirectQaApi = hostname === "gerit-api.vianahub.pt";
    if (isDirectQaApi) {
      blockedRequests.push(`${route.request().method().toUpperCase()} direct-api-host [redacted]`);
      await route.abort("blockedbyclient");
      return;
    }
    const decision = classifyReadOnlyApiRequest({ pathname: url.pathname, method: route.request().method(), origin: url.origin, allowedOrigin });
    if (decision === "outside-api") {
      await route.continue();
      return;
    }
    if (decision === "allow-authentication" || decision === "allow-business-read") {
      await route.continue();
      return;
    }
    blockedRequests.push(`${route.request().method().toUpperCase()} ${safePath(url.pathname)}`);
    await route.abort("blockedbyclient");
  });
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

function observeSafeTraffic(page: Page, trace: SafeTraceEntry[]) {
  const pending = new WeakMap<object, { startedAt: number; path: string; method: string; query: SafeTraceEntry["query"] }>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    pending.set(request, {
      startedAt: Date.now(),
      path: safePath(url.pathname),
      method: request.method().toUpperCase(),
      query: {
        ...(url.searchParams.has("PageNumber") ? { pageNumber: url.searchParams.get("PageNumber") ?? undefined } : {}),
        ...(url.searchParams.has("IsActive") ? { isActive: url.searchParams.get("IsActive") ?? undefined } : {}),
        ...(url.searchParams.has("SortBy") ? { sortBy: url.searchParams.get("SortBy") ?? undefined } : {}),
        ...(url.searchParams.has("SortDirection") ? { sortDirection: url.searchParams.get("SortDirection") ?? undefined } : {}),
        ...(url.searchParams.has("Search") ? { searchApplied: Boolean(url.searchParams.get("Search")?.trim()) } : {}),
      },
    });
  });
  page.on("response", (response) => {
    const tracked = pending.get(response.request());
    if (!tracked) return;
    trace.push({ step: "api", method: tracked.method, path: tracked.path, status: response.status(), durationMs: Math.max(0, Date.now() - tracked.startedAt), query: tracked.query });
  });
  page.on("requestfailed", (request) => {
    const tracked = pending.get(request);
    if (!tracked) return;
    trace.push({ step: "api-failed", method: tracked.method, path: tracked.path, durationMs: Math.max(0, Date.now() - tracked.startedAt) });
  });
}

async function saveSanitizedEvidence(page: Page, trace: SafeTraceEntry[], name: string) {
  const directory = resolve("test-results/client-address-read-only");
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: resolve(directory, `${name}.png`),
    fullPage: true,
    animations: "disabled",
    style: [
      "table tbody td, table tbody th { color: transparent !important; text-shadow: none !important; }",
      "[data-testid='client-detail-page'] header h1 { color: transparent !important; }",
      "[data-testid='client-address-form'] input, [data-testid='client-address-form'] textarea { color: transparent !important; text-shadow: none !important; }",
      "[data-testid='client-address-form'] [role='combobox'] { color: transparent !important; }",
    ].join("\n"),
  });
  await writeFile(resolve(directory, "read-only-trace.json"), JSON.stringify({
    evidence: "sanitized-metadata-only",
    entries: trace,
    capturedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

test("synthetic business POST is blocked before receiving any response", async ({ page }) => {
  const blockedRequests: string[] = [];
  const responses: number[] = [];
  await installReadOnlyApiGuard(page, blockedRequests);
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.includes("/addresses")) responses.push(response.status());
  });
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    try {
      await fetch("/api/gerit/v1/clients/123/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ synthetic: true }),
      });
      return "resolved";
    } catch {
      return "blocked";
    }
  });
  expect(result).toBe("blocked");
  expect(blockedRequests).toEqual(["POST /api/gerit/v1/clients/{clientId}/addresses"]);
  expect(responses).toEqual([]);
});
test("mutations outside API routes and off-origin HTTP requests are blocked before network", async ({ page }) => {
  const blockedRequests: string[] = [];
  const responses: number[] = [];
  await installReadOnlyApiGuard(page, blockedRequests);
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.includes("outside-write")) responses.push(response.status());
  });
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const attempts: Array<{ url: string; method: string; mode?: RequestMode }> = [
      { url: "/submit/outside-write", method: "POST" },
      { url: "/profile/outside-write", method: "PUT" },
      { url: "/settings/outside-write", method: "PATCH" },
      { url: "/upload/outside-write", method: "DELETE" },
      { url: "/upload/outside-write", method: "OPTIONS" },
      { url: "https://example.invalid/outside-write", method: "POST", mode: "no-cors" },
    ];
    for (const attempt of attempts) {
      try {
        await fetch(attempt.url, {
          method: attempt.method,
          ...(attempt.method === "GET" || attempt.method === "HEAD" ? {} : { body: "synthetic" }),
          ...(attempt.mode ? { mode: attempt.mode } : {}),
        });
      } catch {
        // The context route aborts each synthetic write before it reaches the network.
      }
    }
  });
  expect(blockedRequests).toEqual([
    "POST /submit/outside-write",
    "PUT /profile/outside-write",
    "PATCH /settings/outside-write",
    "DELETE /upload/outside-write",
    "OPTIONS /upload/outside-write",
    "POST /outside-write",
  ]);
  expect(responses).toEqual([]);
});
test("ClientAddress read-only QA visual journey", async ({ page }) => {
  test.setTimeout(300_000);
  const blockedRequests: string[] = [];
  const trace: SafeTraceEntry[] = [];
  const traceStarted = Date.now();

  await installReadOnlyApiGuard(page, blockedRequests);
  await installVisualPointer(page);
  observeSafeTraffic(page, trace);
  await authenticateFromLogin(page);
  trace.push({ step: "login", method: "POST", path: "/api/auth/login", status: 200, durationMs: Math.max(0, Date.now() - traceStarted) });

  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar).toBeVisible();
  const clientsSection = sidebar.getByRole("button", { name: /clients|clientes|clienti/i });
  if (await clientsSection.getAttribute("aria-expanded") === "false") await clientsSection.click();
  const clientsLink = sidebar.locator('a[href="/clients"], a[href="/clients/"]');
  await expect(clientsLink).toBeVisible();
  const clientListResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.replace(/\/$/, "") === "/api/gerit/v1/clients/paged";
  }, { timeout: 15_000 });
  await clientsLink.click();
  await expect(page.getByTestId("clients-page-root")).toBeVisible();
  const clientListResponse = await clientListResponsePromise;
  expect(clientListResponse.status()).toBe(200);
  const clientRows = page.getByTestId("clients-page-root").locator("tbody tr");
  const clientCount = await clientRows.count();
  if (clientCount === 0) {
    console.log("[ClientAddress read-only] QA_FIXTURE_UNAVAILABLE clients=0");
    await saveSanitizedEvidence(page, trace, "clients-list-empty");
    expect(blockedRequests).toEqual([]);
    const statusPath = process.env.E2E_READ_ONLY_HOMOLOGATION_STATUS;
    if (statusPath) await writeFile(statusPath, JSON.stringify({ status: "INCOMPLETE", reason: "fixture-unavailable", fixture: "client" }), "utf8");
    test.info().annotations.push({ type: "homologation-status", description: "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE: no visible Client fixture" });
    console.log("[ClientAddress read-only] QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE clients=0");
    test.skip(true, "QA tenant has no visible Client fixture; no data was created.");
    return;
  }

  await saveSanitizedEvidence(page, trace, "clients-list");
  const clientDetailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.startsWith("/api/gerit/v1/clients/") && !url.pathname.endsWith("/paged");
  });
  await clientRows.first().click();
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  expect((await clientDetailResponsePromise).status()).toBe(200);
  const pagedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged");
  });
  const addressTypesResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.replace(/\/$/, "") === "/api/gerit/v1/address-types";
  });
  await page.getByRole("tab", { name: /addresses|endereços|moradas|direcciones/i }).click();

  const addressPanel = page.getByTestId("client-addresses-panel");
  await expect(addressPanel).toBeVisible();
  const pagedResponse = await pagedResponsePromise;
  const addressTypesResponse = await addressTypesResponsePromise;
  expect(pagedResponse.status()).toBe(200);
  expect(addressTypesResponse.status()).toBe(200);
  await expect(page.getByTestId("client-address-form")).toBeVisible();
  const lang = await page.locator("html").getAttribute("lang");
  trace.push({ step: "locale", method: "UI", path: lang ? `html[lang=${lang}]` : "html[lang=missing]" });
  await saveSanitizedEvidence(page, trace, "client-addresses");

  const addressRows = addressPanel.locator("tbody tr");
  const addressCount = await addressRows.count();
  if (addressCount === 0) {
    console.log("[ClientAddress read-only] QA_FIXTURE_UNAVAILABLE addresses=0");
    expect(blockedRequests).toEqual([]);
    const statusPath = process.env.E2E_READ_ONLY_HOMOLOGATION_STATUS;
    if (statusPath) await writeFile(statusPath, JSON.stringify({ status: "INCOMPLETE", reason: "fixture-unavailable", fixture: "client-address" }), "utf8");
    test.info().annotations.push({ type: "homologation-status", description: "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE: no visible ClientAddress fixture" });
    console.log("[ClientAddress read-only] QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE addresses=0");
    test.skip(true, "No visible ClientAddress fixture exists; list and catalog GETs succeeded.");
    return;
  }

  const grid = addressPanel.locator(":scope > section").last();
  const search = grid.locator("input").first();
  await expect(search).toBeVisible();
  const firstStreet = (await addressRows.first().locator("td").first().innerText()).trim();
  const searchTerm = firstStreet.slice(0, Math.min(3, firstStreet.length));
  if (searchTerm) {
    const searchResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged") && url.searchParams.has("Search") && url.searchParams.get("Search") !== "";
    });
    await search.fill(searchTerm);
    expect((await searchResponsePromise).status()).toBe(200);
    const clearedSearchResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged") && url.searchParams.get("Search") === "";
    });
    await search.fill("");
    expect((await clearedSearchResponsePromise).status()).toBe(200);
  }

  const statusFilter = grid.getByRole("combobox").first();
  await expect(statusFilter).toBeVisible();
  await statusFilter.click();
  const activeOption = page.getByRole("option", { name: /active|ativo|actif|activo/i }).first();
  await expect(activeOption).toBeVisible();
  const filteredResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged") && url.searchParams.get("IsActive") === "true";
  });
  await activeOption.click();
  expect((await filteredResponsePromise).status()).toBe(200);
  await saveSanitizedEvidence(page, trace, "client-addresses-filtered");

  const streetHeader = grid.locator("thead th button").first();
  const sortedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged") && url.searchParams.get("SortBy") === "Street" && url.searchParams.get("SortDirection") === "desc";
  });
  await streetHeader.click();
  const sortedResponse = await sortedResponsePromise;
  expect(sortedResponse.status()).toBe(200);

  const firstPage = new URL(pagedResponse.url()).searchParams.get("PageNumber") ?? "1";
  const nextPageButton = grid.getByRole("button", { name: /next|seguinte|próxima|siguiente/i });
  if (await nextPageButton.isEnabled().catch(() => false)) {
    const pageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && url.pathname.includes("/addresses/paged") && url.searchParams.get("PageNumber") !== firstPage;
    });
    await nextPageButton.click();
    expect((await pageResponsePromise).status()).toBe(200);
  }

  const editButton = grid.locator('button[data-testid^="client-address-edit-"]').first();
  if (await editButton.count()) {
    const detailResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && !(response.status() >= 300 && response.status() < 400) && /\/addresses\/\d+\/?$/.test(url.pathname);
    });
    await editButton.click();
    expect((await detailResponsePromise).status()).toBe(200);
    await expect(page.getByTestId("client-address-street")).toBeVisible();
    await expect(page.getByTestId("client-address-city")).toBeVisible();
    await expect(page.getByTestId("client-address-countryCode")).toBeVisible();
    const cancelButton = page.getByTestId("client-address-form").getByRole("button", { name: /cancel|cancelar/i });
    if (await cancelButton.count()) await cancelButton.click();
  }

  expect(blockedRequests, "Unexpected API writes were blocked before network and invalidate this journey").toEqual([]);
  console.log("[ClientAddress read-only] QA_READ_ONLY_JOURNEY_PASS reads=clients,paged-addresses,address-types,detail-if-available");
  await saveSanitizedEvidence(page, trace, "client-addresses-final");
});
