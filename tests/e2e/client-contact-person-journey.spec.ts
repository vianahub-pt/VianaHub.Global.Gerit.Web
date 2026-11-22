import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticateFromLogin } from "./helpers/auth";

const clientId = 4242;
const contactId = 7301;
const contactFixture = {
  id: contactId,
  clientId,
  name: "Synthetic Contact One",
  email: "synthetic.contact@example.invalid",
  phoneNumber: "+351210000001",
  cellPhoneNumber: "+351910000001",
  isWhatsapp: true,
  isCellPhoneWhatsapp: true,
  jobTitle: "Account Liaison",
  department: "Synthetic QA",
  isPrimary: true,
  isActive: true,
  createdAt: "2026-01-01T10:00:00Z",
};

type Contact = typeof contactFixture;

function pageBody(items: Contact[], pageNumber = 1, pageSize = 10, totalItems = items.length) {
  return { items, pageNumber, pageSize, totalItems, totalPages: totalItems ? Math.ceil(totalItems / pageSize) : 0 };
}

const apiConflictMessages = {
  "pt-PT": { title: "Conflito", errorKey: "Erro", email: "Já existe um contacto com este e-mail para este cliente", primary: "Já existe um contacto principal ativo para este cliente" },
  "pt-BR": { title: "Conflito", errorKey: "Erro", email: "Já existe um contato com este e-mail para este cliente", primary: "Já existe um contato principal ativo para este cliente" },
  "en-US": { title: "Conflict", errorKey: "Error", email: "A contact with this email already exists for this client", primary: "An active primary contact already exists for this client" },
  "es-ES": { title: "Conflicto", errorKey: "Error", email: "Ya existe un contacto con este correo electrónico para este cliente", primary: "Ya existe un contacto principal activo para este cliente" },
} as const;

function apiErrorBody(locale: string | undefined, kind: "conflict" | "gone", message: string) {
  const normalizedLocale = locale?.split(",")[0]?.trim();
  const language = normalizedLocale && normalizedLocale in apiConflictMessages ? normalizedLocale as keyof typeof apiConflictMessages : "pt-PT";
  const localized = apiConflictMessages[language];
  return {
    title: kind === "conflict" ? localized.title : language === "en-US" ? "Gone" : language === "es-ES" ? "Eliminado" : "Removido",
    errors: { [localized.errorKey]: [message] },
  };
}
async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApiMocks(page: Page) {
  let records: Contact[] = Array.from({ length: 23 }, (_, index) => ({
    ...contactFixture,
    id: contactId + index,
    name: index === 0 ? contactFixture.name : `Synthetic Contact ${index + 1}`,
    email: `synthetic.contact.${index + 1}@example.invalid`,
  }));
  let nextId = contactId + records.length;
  let listMode: "normal" | "empty" | "gone" = "normal";
  let clientCreated = false;
  let clientCreateStatus: 201 | 500 = 201;
  const clientCreateStatuses: number[] = [];
  let createConflict: "none" | "email" | "primary" = "none";
  let detailGone = false;
  const observed: string[] = [];
  const unexpectedWrites: string[] = [];
  const mutationPayloads: unknown[] = [];
  let nextListDelayMs = 0;
  const delayedSearches = new Map<string, number>();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, "");
    const method = request.method();
    const locale = request.headers()["accept-language"];
    observed.push(method + " " + path);

    if (path === "/api/auth/login" && method === "POST") return route.continue();
    if (path.startsWith("/api/auth/")) {
      unexpectedWrites.push(method + " " + path);
      return json(route, 599, { title: "Unmocked auth request blocked by ClientContactPerson visual test" });
    }
    const preferencesMatch = path.match(/^\/api\/gerit\/v1\/user-preferences\/user\/(\d+)$/);
    if (preferencesMatch && method === "GET") {
      const locale = request.headers()["accept-language"];
      return json(route, 200, {
        id: 9876,
        tenantId: 1,
        userId: Number(preferencesMatch[1]),
        appearance: "light",
        locale: ["pt-PT", "pt-BR", "en-US", "es-ES"].includes(locale) ? locale : "pt-PT",
        currencyCode: "EUR",
        timezone: "Europe/Lisbon",
        dateFormat: "DD-MM-YYYY",
        timeFormat: "24h",
        dayStart: "09:00",
        dayEnd: "18:00",
        emailNewsletter: false,
        emailWeeklyReport: false,
        emailApproval: true,
        emailAlerts: true,
        emailReminders: true,
        emailPlanner: true,
      });
    }
    if (preferencesMatch && method !== "GET") {
      unexpectedWrites.push(method + " " + path);
      return json(route, 599, { title: "Unexpected UserPreferences write blocked by ClientContactPerson visual test" });
    }
    if (path === "/api/gerit/v1/clients" && method === "POST") {
      clientCreateStatuses.push(clientCreateStatus);
      if (clientCreateStatus !== 201) return json(route, clientCreateStatus, { code: "SYNTHETIC_CLIENT_CREATE_FAILURE", title: "Synthetic Client create failure" });
      clientCreated = true;
      return json(route, 201, { id: clientId });
    }
    if (path === `/api/gerit/v1/clients/${clientId}` && method === "GET") {
      if (!clientCreated) return json(route, 410, { code: "CLIENT_UNAVAILABLE", title: "Synthetic parent Client unavailable" });
      return json(route, 200, {
        id: clientId,
        partyTypeId: 1,
        partyType: "Individual",
        acquisitionSourceTypeId: 1,
        acquisitionSourceType: "Website",
        urlImage: null,
        note: "Synthetic parent Client",
        name: "Synthetic Parent Client",
        phoneNumber: null,
        cellPhoneNumber: null,
        isCellPhoneWhatsapp: false,
        email: null,
        websiteUrl: null,
        birthDate: null,
        gender: null,
        nationality: null,
        companyRegistrationNumber: null,
        economicActivityCode: null,
        numberOfEmployees: null,
        statusDefinitionId: 4,
        statusDefinitionName: "Potential",
        statusDomainId: 1,
        statusDomainName: "Client",
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      });
    }
    if (path === "/api/gerit/v1/clients/9999" && method === "GET") return json(route, 410, apiErrorBody(locale, "gone", locale === "en-US" ? "Client not found or inactive" : locale === "es-ES" ? "Cliente no encontrado o inactivo" : "Cliente não encontrado ou inativo"));
    if (path === "/api/gerit/v1/party-types" || path === "/api/gerit/v1/acquisition-source-types" || path === "/api/gerit/v1/status-domains" || path === "/api/gerit/v1/status-definitions") {
      if (path === "/api/gerit/v1/party-types") return json(route, 200, [{ id: 1, name: "Individual", isActive: true, languageCode: "en-US" }, { id: 2, name: "Organization", isActive: true, languageCode: "en-US" }]);
      if (path === "/api/gerit/v1/acquisition-source-types") return json(route, 200, [{ id: 1, name: "Website", isActive: true, languageCode: "en-US" }]);
      if (path === "/api/gerit/v1/status-domains") return json(route, 200, [{ id: 1, name: "Client", isActive: true, languageCode: "en-US" }]);
      return json(route, 200, [{ id: 4, name: "Potential", statusDomainId: 1, isActive: true, languageCode: "en-US" }]);
    }

    const base = `/api/gerit/v1/clients/${clientId}/contacts`;
    if (path === `${base}/paged` && method === "GET") {
      const term = (url.searchParams.get("Search") ?? "").toLocaleLowerCase();
      const delay = delayedSearches.get(term) ?? nextListDelayMs;
      if (delay > 0) {
        delayedSearches.delete(term);
        nextListDelayMs = 0;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      }
      if (listMode === "gone") return json(route, 410, apiErrorBody(locale, "gone", locale === "en-US" ? "Client contact not found or inactive" : locale === "es-ES" ? "Contacto del cliente no encontrado o inactivo" : locale === "pt-BR" ? "contato do cliente não encontrado ou inativo" : "Contacto do cliente não encontrado ou inativo"));
      const active = url.searchParams.get("IsActive");
      const pageNumber = Math.max(1, Number(url.searchParams.get("PageNumber") ?? 1));
      const pageSize = Math.max(1, Number(url.searchParams.get("PageSize") ?? 10));
      const sortDirection = url.searchParams.get("SortDirection") === "desc" ? -1 : 1;
      const filtered = records
        .filter((record) => (!term || record.name.toLocaleLowerCase().includes(term)) && (active === null || record.isActive === (active === "true")))
        .sort((left, right) => left.name.localeCompare(right.name) * sortDirection);
      const pageItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      return json(route, 200, pageBody(listMode === "empty" ? [] : pageItems, pageNumber, pageSize, listMode === "empty" ? 0 : filtered.length));
    }
    if (path === base && method === "POST") {
      if (createConflict === "email") return json(route, 409, apiErrorBody(locale, "conflict", apiConflictMessages[locale as keyof typeof apiConflictMessages]?.email ?? apiConflictMessages["pt-PT"].email));
      if (createConflict === "primary") return json(route, 409, apiErrorBody(locale, "conflict", apiConflictMessages[locale as keyof typeof apiConflictMessages]?.primary ?? apiConflictMessages["pt-PT"].primary));
      const body = request.postDataJSON() as Omit<Contact, "id" | "clientId" | "createdAt">;
      mutationPayloads.push(body);
      const created: Contact = { ...body, isActive: true, id: nextId++, clientId, createdAt: "2026-01-01T10:00:00Z" };
      records = [...records, created];
      return json(route, 201, { id: created.id });
    }
    const detailMatch = path.match(new RegExp(`^${base}/(\\d+)(?:/(activate|deactivate))?$`));
    if (detailMatch) {
      const id = Number(detailMatch[1]);
      const operation = detailMatch[2];
      const index = records.findIndex((record) => record.id === id);
      if (index < 0 || listMode === "gone" || (detailGone && method === "GET")) return json(route, 410, apiErrorBody(locale, "gone", locale === "en-US" ? "Client contact not found or inactive" : locale === "es-ES" ? "Contacto del cliente no encontrado o inactivo" : locale === "pt-BR" ? "contato do cliente não encontrado ou inativo" : "Contacto do cliente não encontrado ou inativo"));
      if (operation && method === "PATCH") {
        records[index] = { ...records[index], isActive: operation === "activate", isPrimary: operation === "activate" && records[index].isPrimary };
        return json(route, 200, true);
      }
      if (!operation && method === "GET") return json(route, 200, records[index]);
      if (!operation && method === "PUT") {
        const body = request.postDataJSON() as Omit<Contact, "id" | "clientId" | "createdAt" | "isActive">;
        mutationPayloads.push(body);
        records[index] = { ...records[index], ...body };
        return json(route, 200, true);
      }
      if (!operation && method === "DELETE") {
        records = records.filter((record) => record.id !== id);
        return json(route, 200, true);
      }
    }
    if (method === "GET" || method === "HEAD") return route.continue();
    unexpectedWrites.push(method + " " + path);
    return json(route, 599, { title: "Unmocked mutating request blocked by ClientContactPerson visual test" });
  });
  return {
    setEmpty: () => { listMode = "empty"; },
    setGone: () => { listMode = "gone"; },
    setNormal: () => { listMode = "normal"; },
    setConflict: (value: "none" | "email" | "primary") => { createConflict = value; },
    setDetailGone: (value: boolean) => { detailGone = value; },
    setClientCreateStatus: (value: 201 | 500) => { clientCreateStatus = value; },
    delayNextList: (milliseconds: number) => { nextListDelayMs = milliseconds; },
    delayListSearch: (search: string, milliseconds: number) => { delayedSearches.set(search.toLocaleLowerCase(), milliseconds); },
    clientCreateStatuses,
    observed,
    unexpectedWrites,
    mutationPayloads,
    snapshot: () => records.map((record) => ({ ...record })),
  };
}

async function dismissSuccessToast(page: Page) {
  const toast = page.getByRole("status").filter({ hasText: /successfully|success|com sucesso|con éxito|éxito/i }).first();
  if (await toast.isVisible().catch(() => false)) {
    await toast.getByRole("button", { name: /Close notification|Fechar notificação|Cerrar notificación/i }).click();
  }
}

async function openContactsTab(page: Page) {
  await page.goto(`/clients/${clientId}/`);
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await page.getByRole("tab", { name: /Contacts|Contactos|Contatos/i }).click();
  await expect(page.getByTestId("client-contact-person-panel")).toBeVisible();
}

async function saveScreenshot(page: Page, name: string) {
  mkdirSync("test-results/client-contact-person-visual", { recursive: true });
  const hubBody = page.locator("#hub-body");
  await hubBody.screenshot({ path: `test-results/client-contact-person-visual/${name}.png`, animations: "disabled" });
}

async function measureHubGrid(page: Page) {
  return page.getByRole("table").evaluate((table) => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-testid="client-detail-page"] > .gerit-calendar-scrollbar');
    const panel = table.closest<HTMLElement>('[data-testid="client-contact-person-panel"]');
    const form = panel?.querySelector<HTMLElement>('[data-testid="client-contact-inline-form-panel"]');
    const bounds = table.getBoundingClientRect();
    const panelBounds = panel?.getBoundingClientRect();
    const formBounds = form?.getBoundingClientRect();
    return {
      viewportTop: Math.round(bounds.top * 10) / 10,
      panelRelativeTop: Math.round((bounds.top - (panelBounds?.top ?? 0)) * 10) / 10,
      panelViewportTop: Math.round((panelBounds?.top ?? 0) * 10) / 10,
      formBottomRelativeToPanel: Math.round((formBounds?.bottom ?? 0) - (panelBounds?.top ?? 0)),
      documentTop: Math.round((bounds.top + (scrollContainer?.scrollTop ?? 0)) * 10) / 10,
      height: Math.round(bounds.height * 10) / 10,
      scrollTop: scrollContainer?.scrollTop ?? 0,
      rows: table.querySelectorAll("tbody tr").length,
      rowsInert: table.querySelector("tbody")?.hasAttribute("inert") ?? false,
      busy: table.getAttribute("aria-busy"),
    };
  });
}

async function startTransitionInstrumentation(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="workspace-shell-root"]');
    const createPage = document.querySelector<HTMLElement>('[data-testid="client-create-page"]');
    if (!shell || !createPage) throw new Error("SPA audit instrumentation could not find the expected shell and Client create page.");
    const shellToken = `shell-${Date.now()}`;
    const createToken = `create-${Date.now()}`;
    shell.dataset.spaAuditToken = shellToken;
    createPage.dataset.spaAuditToken = createToken;
    const metrics = { blankFrames: 0, maxConsecutiveBlankFrames: 0, consecutiveBlankFrames: 0, cls: 0 };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
        if (!entry.hadRecentInput && typeof entry.value === "number") metrics.cls += entry.value;
      }
    });
    try { observer.observe({ type: "layout-shift", buffered: true }); } catch {}
    let active = true;
    const sample = () => {
      if (!active) return;
      const body = document.getElementById("hub-body");
      const useful = Boolean(body && [...body.querySelectorAll("h1,h2,button,input,table,[role='status'],[role='alert']")]
        .some((element) => (element as HTMLElement).getClientRects().length > 0));
      if (useful) metrics.consecutiveBlankFrames = 0;
      else {
        metrics.blankFrames += 1;
        metrics.consecutiveBlankFrames += 1;
        metrics.maxConsecutiveBlankFrames = Math.max(metrics.maxConsecutiveBlankFrames, metrics.consecutiveBlankFrames);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    (window as unknown as { __spaAuditState?: typeof metrics; __spaAuditObserver?: PerformanceObserver; __spaAuditStop?: () => void }).__spaAuditState = metrics;
    (window as unknown as { __spaAuditObserver?: PerformanceObserver }).__spaAuditObserver = observer;
    (window as unknown as { __spaAuditStop?: () => void }).__spaAuditStop = () => { active = false; observer.disconnect(); };
    return {
      shellToken,
      createToken,
    };
  });
}

async function stopTransitionInstrumentation(page: Page, tokens: { shellToken: string; createToken: string }) {
  return page.evaluate(({ shellToken, createToken }) => {
    const runtime = window as unknown as {
      __spaAuditState?: { blankFrames: number; maxConsecutiveBlankFrames: number; consecutiveBlankFrames: number; cls: number };
      __spaAuditStop?: () => void;
    };
    runtime.__spaAuditStop?.();
    const detailPage = document.querySelector<HTMLElement>('[data-testid="client-detail-page"]');
    const createPage = document.querySelector<HTMLElement>('[data-testid="client-create-page"]');
    return {
      ...runtime.__spaAuditState,
      cls: Math.round((runtime.__spaAuditState?.cls ?? 0) * 10000) / 10000,
      shellPreserved: document.querySelector<HTMLElement>('[data-testid="workspace-shell-root"]')?.dataset.spaAuditToken === shellToken,
      clientPageRootReplaced: Boolean(detailPage && !createPage && detailPage.dataset.spaAuditToken !== createToken),
    };
  }, tokens);
}

test("ClientContactPerson inline form and HubGrid journey use synthetic post-login API fixtures", async ({ page }) => {
  test.setTimeout(240_000);
  const unmocked: string[] = [];
  const documentNavigations: string[] = [];
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  const consoleErrorCategories: Record<string, number> = {};
  const resourceEventDetails = new Map<string, { stage: string; kind: string; host: string; path: string; resourceType: string; status?: number; failure?: string }>();
  const resourceEventCounts = new Map<string, number>();
  let stage = "authentication";
  const safeResourceLocation = (value: string) => {
    try {
      const url = new URL(value);
      return { host: url.hostname, path: url.pathname };
    } catch {
      return { host: "invalid-url", path: "[unavailable]" };
    }
  };
  const recordResourceEvent = (event: { kind: string; url: string; resourceType: string; status?: number; failure?: string }) => {
    const location = safeResourceLocation(event.url);
    const signature = [stage, event.kind, location.host, location.path, event.resourceType, event.status ?? "", event.failure ?? ""].join("|");
    resourceEventCounts.set(signature, (resourceEventCounts.get(signature) ?? 0) + 1);
    resourceEventDetails.set(signature, { stage, kind: event.kind, ...location, resourceType: event.resourceType, ...(event.status ? { status: event.status } : {}), ...(event.failure ? { failure: event.failure } : {}) });
  };
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentNavigations.push(new URL(request.url()).pathname);
  });
  page.on("requestfailed", (request) => {
    recordResourceEvent({ kind: "requestfailed", url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText?.slice(0, 100) });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) recordResourceEvent({ kind: "http-error", url: response.url(), resourceType: response.request().resourceType(), status: response.status() });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrorCount += 1;
    const text = message.text().toLowerCase();
    const httpStatus = text.match(/status of (\d{3})/);
    const category = httpStatus ? `http-${httpStatus[1]}` :
      /hydration|hydrated|server rendered html/.test(text) ? "hydration" :
        /net::err|networkerror/.test(text) ? "network-error" :
        /\b404\b|not found/.test(text) ? "http-404" :
          /\b5\d\d\b|server error/.test(text) ? "http-5xx" : "other";
    consoleErrorCategories[category] = (consoleErrorCategories[category] ?? 0) + 1;
  });
  page.on("pageerror", () => { pageErrorCount += 1; });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) unmocked.push(request.method() + " " + new URL(request.url()).pathname);
  });
  const mocks = await installApiMocks(page);
  await authenticateFromLogin(page);
  stage = "client-create-detail";
  const documentNavigationCountAfterLogin = documentNavigations.length;

  await page.goto("/clients/new/");
  await expect(page.getByTestId("client-create-page")).toBeVisible();
  documentNavigations.length = 0;
  const transitionTokens = await startTransitionInstrumentation(page);
  const clientTab = page.getByRole("tab", { name: /^(Client|Cliente)$/i });
  const contactsTab = page.getByRole("tab", { name: /^(Contacts|Contactos|Contatos)$/i });
  const addressesTab = page.getByRole("tab", { name: /^(Addresses|Moradas|Endereços|Direcciones)$/i });
  const documentsTab = page.getByRole("tab", { name: /^(Documents|Documentos)$/i });
  const fiscalTab = page.getByRole("tab", { name: /^(Fiscal data|Dados fiscais|Datos fiscales)$/i });
  await expect(clientTab).toBeEnabled();
  for (const tab of [contactsTab, addressesTab, documentsTab, fiscalTab]) {
    await expect(tab).toBeDisabled();
    await expect(tab).toHaveAttribute("aria-disabled", "true");
  }
  await saveScreenshot(page, "00-client-create-tabs-disabled");
  await clientTab.focus();
  await clientTab.press("ArrowRight");
  await clientTab.press("End");
  const disabledTabBounds = await contactsTab.boundingBox();
  if (!disabledTabBounds) throw new Error("Disabled Contacts tab is not visible");
  await page.mouse.click(disabledTabBounds.x + disabledTabBounds.width / 2, disabledTabBounds.y + disabledTabBounds.height / 2);
  await contactsTab.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(clientTab).toHaveAttribute("aria-selected", "true");
  await expect(contactsTab).not.toBeFocused();
  const childReads = () => mocks.observed.filter((entry) => /^GET \/api\/gerit\/v1\/clients\/\d+\/(contacts|addresses|documents|fiscal-data)(?:\/|$)/i.test(entry));
  expect(childReads()).toEqual([]);
  await saveScreenshot(page, "00b-disabled-tab-interaction-blocked");

  await page.getByTestId("client-party-type").click();
  await page.getByRole("option", { name: "Individual" }).click();
  await page.getByTestId("client-acquisition-source").click();
  await page.getByRole("option", { name: "Website" }).click();
  await page.getByTestId("client-name").fill("Synthetic Parent Client");
  mocks.setClientCreateStatus(500);
  const failedCreateResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients");
  await page.getByTestId("client-save").click();
  expect((await failedCreateResponse).status()).toBe(500);
  await expect(page).toHaveURL(/\/clients\/new\/$/);
  await expect(page.getByTestId("client-create-page")).toBeVisible();
  for (const tab of [contactsTab, addressesTab, documentsTab, fiscalTab]) await expect(tab).toBeDisabled();
  expect(childReads()).toEqual([]);

  mocks.setClientCreateStatus(201);
  const successfulCreateResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/clients");
  const persistedClientResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}`);
  const documentNavigationsBeforeCreate = documentNavigations.length;
  const createToDetailStartedAt = performance.now();
  await page.getByTestId("client-save").click();
  expect((await successfulCreateResponse).status()).toBe(201);
  expect(mocks.clientCreateStatuses).toEqual([500, 201]);
  await page.waitForURL(new RegExp(`/clients/${clientId}/$`));
  expect((await persistedClientResponse).status()).toBe(200);
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(page.getByTestId("client-fields-section")).toBeVisible();
  const clientCreateToDetailUiMs = Math.round(performance.now() - createToDetailStartedAt);
  expect(mocks.clientCreateStatuses.filter((status) => status === 201)).toHaveLength(1);
  expect(mocks.observed.filter((entry) => entry === `GET /api/gerit/v1/clients/${clientId}`)).toHaveLength(1);
  for (const tab of [clientTab, contactsTab, addressesTab, documentsTab, fiscalTab]) await expect(tab).toBeEnabled();
  const clientTransitionMetrics = await stopTransitionInstrumentation(page, transitionTokens);
  const documentNavigationsForClientCreate = documentNavigations.length - documentNavigationsBeforeCreate;
  await saveScreenshot(page, "01-persisted-client-tabs-enabled");

  stage = "client-contact-person";
  await page.goto("/clients/9999/");
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(contactsTab).toBeDisabled();
  await expect(addressesTab).toBeDisabled();
  expect(childReads()).toEqual([]);

  await page.goto("/clients/not-a-valid-id/");
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /.+/ })).toBeVisible();
  await expect(contactsTab).toBeDisabled();
  expect(mocks.observed.some((entry) => entry === "GET /api/gerit/v1/clients/NaN")).toBe(false);
  expect(childReads()).toEqual([]);

  await page.goto(`/clients/${clientId}/`);
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  for (const [tab, placeholder] of [
    [addressesTab, /address|morada|dirección/i],
    [documentsTab, /document/i],
    [fiscalTab, /fiscal/i],
  ] as const) {
    await expect(tab).toBeEnabled();
    await tab.click();
    await expect(page.locator("#client-v1-tab-panel > div:not([hidden])")).toContainText(placeholder);
    expect(childReads()).toEqual([]);
  }
  await contactsTab.click();
  await expect(page.getByTestId("client-contact-person-panel")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact");
  await expect(page.getByTestId("client-contact-inline-form-panel")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toBeEnabled();
  const contactSearch = page.getByPlaceholder(/Search|Pesquisar|Buscar/i);
  const gridBeforeCreate = await measureHubGrid(page);
  await saveScreenshot(page, "01-empty-form-and-list");

  await page.getByTestId("client-contact-new").click();
  await expect(page.getByTestId("client-contact-form")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toBeFocused();
  const gridWithCreateForm = await measureHubGrid(page);
  expect(gridWithCreateForm.panelRelativeTop).toBe(gridBeforeCreate.panelRelativeTop);
  expect(gridWithCreateForm.height).toBe(gridBeforeCreate.height);
  expect(gridWithCreateForm.scrollTop).toBe(gridBeforeCreate.scrollTop);
  await saveScreenshot(page, "02-new-form");
  await page.getByTestId("client-contact-name").fill("Synthetic Contact Two");
  await page.getByTestId("client-contact-email").fill("synthetic.two@example.invalid");
  await page.getByTestId("client-contact-cellPhoneNumber").fill("+351910000002");
  await page.getByTestId("client-contact-whatsapp").locator("xpath=../span").click();
  mocks.delayNextList(700);
  const contactsRefetch = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}/contacts/paged`);
  await page.getByRole("button", { name: /Save|Guardar|Salvar/i }).click();
  await expect(page.getByRole("table")).toHaveAttribute("aria-busy", "true");
  const gridDuringSlowRefetch = await measureHubGrid(page);
  expect(gridDuringSlowRefetch.rows).toBe(gridWithCreateForm.rows);
  expect(gridDuringSlowRefetch.rowsInert).toBe(true);
  expect(gridDuringSlowRefetch.height).toBe(gridWithCreateForm.height);
  expect((await contactsRefetch).status()).toBe(200);
  await expect(page.getByTestId("client-contact-form")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toHaveValue("");
  await contactSearch.fill("Synthetic Contact Two");
  await expect(page.getByRole("table")).toContainText("Synthetic Contact Two");
  await expect(page.getByRole("row")).toHaveCount(2);
  const gridAfterSave = await measureHubGrid(page);
  expect(gridAfterSave.panelRelativeTop).toBe(gridWithCreateForm.panelRelativeTop);
  expect(gridAfterSave.rows).toBe(1);
  await dismissSuccessToast(page);
  expect(mocks.snapshot().some((record) => record.email === "synthetic.two@example.invalid")).toBe(true);

  const newRow = page.getByRole("row").filter({ hasText: "Synthetic Contact Two" });
  await newRow.getByRole("button", { name: /Edit|Editar/i }).click();
  await expect(page.getByTestId("client-contact-inline-form-panel")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toHaveValue("Synthetic Contact Two");
  await saveScreenshot(page, "04-edit-form");
  await page.getByTestId("client-contact-name").fill("Synthetic Contact TwoX");
  await page.getByRole("button", { name: /Save|Guardar|Salvar/i }).click();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact TwoX");
  const gridAfterEdit = await measureHubGrid(page);
  expect(gridAfterEdit.panelRelativeTop).toBe(gridAfterSave.panelRelativeTop);
  expect(gridAfterEdit.height).toBe(gridAfterSave.height);
  await dismissSuccessToast(page);
  await saveScreenshot(page, "05-list-after-edit");
  expect(mocks.snapshot().some((record) => record.name === "Synthetic Contact TwoX")).toBe(true);

  mocks.delayNextList(700);
  const filteredContactsResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}/contacts/paged`);
  await contactSearch.fill("Synthetic Contact TwoX");
  await expect(page.getByRole("table")).toHaveAttribute("aria-busy", "true");
  const gridDuringFilterRefetch = await measureHubGrid(page);
  expect(gridDuringFilterRefetch.rows).toBe(gridAfterEdit.rows);
  expect(gridDuringFilterRefetch.rowsInert).toBe(true);
  expect(gridDuringFilterRefetch.height).toBe(gridAfterEdit.height);
  expect((await filteredContactsResponse).status()).toBe(200);
  await expect(page.getByRole("table")).toContainText("Synthetic Contact TwoX");

  mocks.delayListSearch("Synthetic Contact", 700);
  const slowSearchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET" && url.pathname.endsWith("/contacts/paged") && url.searchParams.get("Search") === "Synthetic Contact";
  });
  const slowSearchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname.endsWith("/contacts/paged") && url.searchParams.get("Search") === "Synthetic Contact";
  });
  await contactSearch.fill("Synthetic Contact");
  await slowSearchRequest;

  const latestSearchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname.endsWith("/contacts/paged") && url.searchParams.get("Search") === "Synthetic Contact TwoX";
  });
  await contactSearch.fill("Synthetic Contact TwoX");
  expect((await latestSearchResponse).status()).toBe(200);
  await expect(page.getByRole("row")).toHaveCount(2);

  expect((await slowSearchResponse).status()).toBe(200);
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("table")).toContainText("Synthetic Contact TwoX");

  const broadSearchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname.endsWith("/contacts/paged") && url.searchParams.get("Search") === "Synthetic Contact";
  });
  await contactSearch.fill("Synthetic Contact");
  expect((await broadSearchResponse).status()).toBe(200);
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact");
  const filteredSearchValue = await contactSearch.inputValue();
  const statusFilter = page.getByRole("combobox", { name: /Status|Estado/i });
  await statusFilter.click();
  await expect(page.getByRole("option")).toHaveText([/All|Mostrar todas|Todos|Todas/i, /Active|Ativo|Ativa|Activos/i, /Inactive|Inativo|Inactiva|Inactivo/i]);
  await page.getByRole("option", { name: /^(Active|Ativo|Ativa|Activos)$/i }).click();
  const perPageFilter = page.getByRole("combobox").last();
  await perPageFilter.click();
  await page.getByRole("option", { name: "20", exact: true }).click();
  const compactDensity = page.getByRole("button", { name: /Compact|Compacto/i });
  await compactDensity.click();
  await expect(compactDensity).toHaveAttribute("aria-pressed", "true");
  const nameSort = page.getByRole("button", { name: /Name|Nome/i });
  await nameSort.click();
  await expect(nameSort).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: /Next|Seguinte|Próxima|Próximo/i }).click();
  await expect(page.getByText(/2\s*\/\s*2/)).toBeVisible();
  const contactReadsBeforeHide = () => mocks.observed.filter((entry) => entry === `GET /api/gerit/v1/clients/${clientId}/contacts/paged`).length;
  const readsBeforeHide = contactReadsBeforeHide();
  await clientTab.click();
  await expect(page.getByTestId("client-contact-person-panel")).toBeHidden();
  await page.waitForTimeout(100);
  expect(contactReadsBeforeHide()).toBe(readsBeforeHide);
  const reactivationRead = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/$/, "") === `/api/gerit/v1/clients/${clientId}/contacts/paged`);
  await contactsTab.click();
  expect((await reactivationRead).status()).toBe(200);
  const searchValueAfterTabReturn = await page.getByPlaceholder(/Search|Pesquisar|Buscar/i).inputValue();
  const filterPreservedAcrossTabSwitch = filteredSearchValue === searchValueAfterTabReturn;
  const statusPreservedAcrossTabSwitch = await statusFilter.textContent();
  const pageSizePreservedAcrossTabSwitch = await perPageFilter.textContent();
  const pagePreservedAcrossTabSwitch = await page.getByText(/2\s*\/\s*2/).isVisible();
  const densityPreservedAcrossTabSwitch = await compactDensity.getAttribute("aria-pressed");
  const sortPreservedAcrossTabSwitch = await nameSort.getAttribute("aria-sort");
  expect(filterPreservedAcrossTabSwitch).toBe(true);
  expect(statusPreservedAcrossTabSwitch).toMatch(/Active|Ativo|Ativa|Activos/i);
  expect(pageSizePreservedAcrossTabSwitch).toContain("20");
  expect(pagePreservedAcrossTabSwitch).toBe(true);
  expect(densityPreservedAcrossTabSwitch).toBe("true");
  expect(sortPreservedAcrossTabSwitch).toBe("descending");

  await statusFilter.click();
  await page.getByRole("option", { name: /All|Mostrar todas|Todos|Todas/i }).click();
  await contactSearch.fill("Synthetic Contact TwoX");
  await expect(page.getByRole("table")).toContainText("Synthetic Contact TwoX");
  await expect(page.getByRole("row")).toHaveCount(2);

  const updatedRow = page.getByRole("row").filter({ hasText: "Synthetic Contact TwoX" });
  const mutationCount = () => mocks.observed.filter((entry) => /^(POST|PUT|PATCH|DELETE) \/api\/gerit\/v1\/clients\/4242\/contacts/.test(entry)).length;
  const beforeCancel = mutationCount();
  await updatedRow.getByRole("button", { name: /Edit|Editar/i }).click();
  await page.getByTestId("client-contact-name").fill("Unsaved synthetic change");
  const gridBeforeCancel = await measureHubGrid(page);
  await clientTab.click();
  await contactsTab.click();
  await expect(page.getByTestId("client-contact-name")).toHaveValue("Unsaved synthetic change");
  await page.getByRole("button", { name: /Cancel|Cancelar/i }).click();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact TwoX");
  const gridAfterCancel = await measureHubGrid(page);
  expect(gridAfterCancel.height).toBe(gridBeforeCancel.height);
  await dismissSuccessToast(page);
  expect(mutationCount()).toBe(beforeCancel);
  await updatedRow.getByRole("button", { name: /Deactivate|Desativar|Desactivar/i }).click();
  await expect(updatedRow).toContainText(/Inactive|Inativo|Inactivo/i);
  await dismissSuccessToast(page);
  await updatedRow.getByRole("button", { name: /Activate|Ativar|Activar/i }).click();
  await expect(updatedRow).toContainText(/Active|Ativo|Activo/i);
  await dismissSuccessToast(page);

  await updatedRow.getByRole("button", { name: /Delete|Eliminar|Excluir/i }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await saveScreenshot(page, "06-delete-confirmation");
  await dialog.getByRole("button", { name: /Delete|Eliminar|Excluir/i }).click();
  await expect(page.getByRole("table")).not.toContainText("Synthetic Contact TwoX");
  expect(mocks.snapshot().some((record) => record.email === "synthetic.two@example.invalid")).toBe(false);

  mocks.setEmpty();
  await page.getByTestId("client-contact-error").isVisible().catch(() => false);
  await page.getByPlaceholder(/Search|Pesquisar|Buscar/i).fill("No synthetic matches");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(/No contacts|Nenhum contacto|Nenhum contato|No hay contactos/i)).toBeVisible();
  await saveScreenshot(page, "07-empty-state");

  const emailConflictByLocale = {
    "pt-PT": "Já existe um contacto com este endereço de e-mail.",
    "pt-BR": "Já existe um contato com este endereço de e-mail.",
    "en-US": "A contact with this email address already exists.",
    "es-ES": "Ya existe un contacto con esta dirección de correo electrónico.",
  } as const;
  const primaryConflictByLocale = {
    "pt-PT": "Já existe outro contacto principal ativo para este cliente.",
    "pt-BR": "Já existe outro contato principal ativo para este cliente.",
    "en-US": "Another active primary contact already exists for this Client.",
    "es-ES": "Ya existe otro contacto principal activo para este cliente.",
  } as const;
  const checkConflict = async (locale: keyof typeof emailConflictByLocale, type: "email" | "primary", expected: string) => {
    await page.evaluate((code) => {
      localStorage.setItem("language", code);
      for (const key of Object.keys(localStorage)) if (key.startsWith("gerit.user-preferences.v1.")) localStorage.removeItem(key);
    }, locale);
    await openContactsTab(page);
    await expect(page.getByRole("table")).toBeVisible();
    mocks.setConflict(type);
    await page.getByTestId("client-contact-new").click();
    await page.getByTestId("client-contact-name").fill("Synthetic Conflict");
    await page.getByTestId("client-contact-email").fill("synthetic.conflict@example.invalid");
    if (type === "primary") await page.getByTestId("client-contact-primary").locator("xpath=../span").click();
    await page.getByRole("button", { name: /Save|Guardar|Salvar/i }).click();
    await expect(page.getByTestId("client-contact-form-error")).toContainText(expected);
    if (locale === "es-ES" && type === "primary") await saveScreenshot(page, "09-conflict-409-es-ES");
    await page.getByRole("button", { name: /Cancel|Cancelar/i }).click();
  };
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"] as const) await checkConflict(locale, "email", emailConflictByLocale[locale]);
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"] as const) await checkConflict(locale, "primary", primaryConflictByLocale[locale]);
  mocks.setConflict("none");
  mocks.setNormal();
  await openContactsTab(page);
  mocks.setDetailGone(true);
  await page.getByPlaceholder(/Search|Pesquisar|Buscar/i).fill("Synthetic Contact One");
  await page.getByRole("row").filter({ hasText: "Synthetic Contact One" }).getByRole("button", { name: /Edit|Editar/i }).click();
  await expect(page.getByTestId("client-contact-error")).toContainText("Este contacto ya no está disponible.");
  await expect(page.getByRole("table")).toBeVisible();
  mocks.setGone();
  await openContactsTab(page);
  await expect(page.getByTestId("client-contact-error")).toContainText("Este contacto ya no está disponible.");

  await page.setViewportSize({ width: 390, height: 844 });
  mocks.setNormal();
  await page.goto(`/clients/${clientId}/`);
  await page.getByRole("tab", { name: /Contacts|Contactos|Contatos/i }).click();
  await expect(page.getByTestId("client-contact-person-panel")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByTestId("client-contact-new").click();
  await expect(page.getByTestId("client-contact-inline-form-panel")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await saveScreenshot(page, "10-mobile-inline-form-grid");
  const dimensions = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  const mobileGrid = await measureHubGrid(page);
  const mobileFormField = await page.getByTestId("client-contact-name").boundingBox();
  expect(mobileFormField).not.toBeNull();
  await page.getByTestId("client-contact-name").focus();
  expect(await page.getByTestId("client-contact-name").evaluate((element) => element === document.activeElement)).toBe(true);
  await expect(page.getByText(/No se pudieron cargar las preferencias|Could not load preferences|Não foi possível carregar as preferências/i)).toHaveCount(0);

  expect(unmocked, "There must be no failed authenticated API requests").toEqual([]);
  expect(mocks.observed.some((entry) => entry.startsWith("POST /api/gerit/v1/clients/4242/contacts"))).toBe(true);
  expect(mocks.observed.some((entry) => entry.startsWith("PUT /api/gerit/v1/clients/4242/contacts/"))).toBe(true);
  expect(mocks.observed.some((entry) => entry.startsWith("PATCH /api/gerit/v1/clients/4242/contacts/"))).toBe(true);
  expect(mocks.observed.some((entry) => entry.startsWith("DELETE /api/gerit/v1/clients/4242/contacts/"))).toBe(true);
  expect(mocks.observed.some((entry) => entry.startsWith("GET /api/gerit/v1/user-preferences/user/"))).toBe(true);
  expect(mocks.unexpectedWrites, "All non-login API writes must remain blocked or mocked").toEqual([]);
  expect(mocks.mutationPayloads.every((payload) => typeof payload === "object" && payload !== null && !Object.hasOwn(payload, "tenantId") && !Object.hasOwn(payload, "clientId"))).toBe(true);
  expect(await page.locator("html").getAttribute("class")).toBeTruthy();
  console.log("[SPA_UX_METRICS] " + JSON.stringify({
    clientCreateToDetail: {
      documentNavigations: documentNavigationsForClientCreate,
      workspaceShellPreserved: clientTransitionMetrics.shellPreserved,
      clientPageRootReplaced: clientTransitionMetrics.clientPageRootReplaced,
      createToDetailUiMs: clientCreateToDetailUiMs,
      blankFrames: clientTransitionMetrics.blankFrames,
      maxConsecutiveBlankFrames: clientTransitionMetrics.maxConsecutiveBlankFrames,
      cls: clientTransitionMetrics.cls,
    },
    clientContactGrid: {
      rowsBeforeCreate: gridBeforeCreate.rows,
      rowsDuringSlowRefetch: gridDuringSlowRefetch.rows,
      rowsAfterSave: gridAfterSave.rows,
      heightBeforeCreate: gridBeforeCreate.height,
      heightWithCreateForm: gridWithCreateForm.height,
      heightDuringSlowRefetch: gridDuringSlowRefetch.height,
      heightAfterSave: gridAfterSave.height,
      gridDocumentTopBeforeCreate: gridBeforeCreate.documentTop,
      gridDocumentTopWithCreateForm: gridWithCreateForm.documentTop,
      gridDocumentTopAfterSave: gridAfterSave.documentTop,
      scrollTopBeforeCreate: gridBeforeCreate.scrollTop,
      scrollTopWithCreateForm: gridWithCreateForm.scrollTop,
      filterRefetchRows: gridDuringFilterRefetch.rows,
      filterRefetchHeight: gridDuringFilterRefetch.height,
      gridAfterEditTop: gridAfterEdit.documentTop,
      gridTopRelativeToContactsPanel: gridAfterEdit.panelRelativeTop,
      gridTopRelativeBeforeCancel: gridBeforeCancel.panelRelativeTop,
      gridTopRelativeAfterCancel: gridAfterCancel.panelRelativeTop,
      gridAfterCancelTop: gridAfterCancel.documentTop,
      formBottomRelativeBeforeCancel: gridBeforeCancel.formBottomRelativeToPanel,
      formBottomRelativeAfterCancel: gridAfterCancel.formBottomRelativeToPanel,
      gridBeforeCancelViewportTop: gridBeforeCancel.viewportTop,
      gridAfterCancelViewportTop: gridAfterCancel.viewportTop,
      scrollBeforeCancel: gridBeforeCancel.scrollTop,
      scrollAfterCancel: gridAfterCancel.scrollTop,
      filterPreservedAcrossTabSwitch,
      statusPreservedAcrossTabSwitch,
      pageSizePreservedAcrossTabSwitch,
      pagePreservedAcrossTabSwitch,
      densityPreservedAcrossTabSwitch,
      sortPreservedAcrossTabSwitch,
      mobileGridHeight: mobileGrid.height,
      mobileFormFieldTop: mobileFormField?.y ?? null,
    },
    documentNavigationCountAfterLogin,
    consoleErrorCount,
    consoleErrorCategories,
    resourceEventCount: [...resourceEventCounts.values()].reduce((total, count) => total + count, 0),
    resourceEventUniqueCount: resourceEventCounts.size,
    resourceEventDuplicates: [...resourceEventCounts.entries()].filter(([, count]) => count > 1).map(([signature, count]) => ({ signature, count })),
    resourceEvents: [...resourceEventCounts.entries()].map(([signature, count]) => ({ ...resourceEventDetails.get(signature), count })),
    pageErrorCount,
    blockedUnmockedWrites: mocks.unexpectedWrites.length,
  }));
});
