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

function pageBody(items: Contact[]) {
  return { items, pageNumber: 1, pageSize: 10, totalItems: items.length, totalPages: items.length ? 1 : 0 };
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
  let records: Contact[] = [{ ...contactFixture }];
  let nextId = contactId + 1;
  let listMode: "normal" | "empty" | "gone" = "normal";
  let clientCreated = false;
  let clientCreateStatus: 201 | 500 = 201;
  const clientCreateStatuses: number[] = [];
  let createConflict: "none" | "email" | "primary" = "none";
  let detailGone = false;
  const observed: string[] = [];
  const unexpectedWrites: string[] = [];
  const mutationPayloads: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, "");
    const method = request.method();
    const locale = request.headers()["accept-language"];
    observed.push(method + " " + path);

    if (path.startsWith("/api/auth/")) return route.continue();
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
      return json(route, 200, true);
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
      if (listMode === "gone") return json(route, 410, apiErrorBody(locale, "gone", locale === "en-US" ? "Client contact not found or inactive" : locale === "es-ES" ? "Contacto del cliente no encontrado o inactivo" : locale === "pt-BR" ? "contato do cliente não encontrado ou inativo" : "Contacto do cliente não encontrado ou inativo"));
      const term = (url.searchParams.get("Search") ?? "").toLocaleLowerCase();
      const active = url.searchParams.get("IsActive");
      const filtered = records.filter((record) => (!term || record.name.toLocaleLowerCase().includes(term)) && (active === null || record.isActive === (active === "true")));
      return json(route, 200, pageBody(listMode === "empty" ? [] : filtered));
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
  await page.screenshot({ path: `test-results/client-contact-person-visual/${name}.png`, fullPage: true });
}

test("ClientContactPerson inline form and HubGrid journey use synthetic post-login API fixtures", async ({ page }) => {
  test.setTimeout(240_000);
  const unmocked: string[] = [];
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) unmocked.push(request.method() + " " + new URL(request.url()).pathname);
  });
  const mocks = await installApiMocks(page);
  await authenticateFromLogin(page);

  await page.goto("/clients/new/");
  await expect(page.getByTestId("client-create-page")).toBeVisible();
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
  await page.getByTestId("client-save").click();
  expect((await successfulCreateResponse).status()).toBe(201);
  expect(mocks.clientCreateStatuses).toEqual([500, 201]);
  await page.waitForURL(new RegExp(`/clients/${clientId}/$`));
  expect((await persistedClientResponse).status()).toBe(200);
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  for (const tab of [clientTab, contactsTab, addressesTab, documentsTab, fiscalTab]) await expect(tab).toBeEnabled();
  await saveScreenshot(page, "01-persisted-client-tabs-enabled");

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
    await expect(page.getByRole("tabpanel")).toContainText(placeholder);
    expect(childReads()).toEqual([]);
  }
  await contactsTab.click();
  await expect(page.getByTestId("client-contact-person-panel")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact One");
  await expect(page.getByTestId("client-contact-form")).toHaveCount(0);
  await saveScreenshot(page, "01-list");

  await page.getByTestId("client-contact-new").click();
  await expect(page.getByTestId("client-contact-form")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toBeFocused();
  await saveScreenshot(page, "02-new-form");
  await page.getByTestId("client-contact-name").fill("Synthetic Contact Two");
  await page.getByTestId("client-contact-email").fill("synthetic.two@example.invalid");
  await page.getByTestId("client-contact-cellPhoneNumber").fill("+351910000002");
  await page.getByTestId("client-contact-whatsapp").locator("xpath=../span").click();
  await page.getByRole("button", { name: /Save|Guardar|Salvar/i }).click();
  await expect(page.getByTestId("client-contact-form")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Synthetic Contact Two");
  await dismissSuccessToast(page);
  expect(mocks.snapshot().some((record) => record.email === "synthetic.two@example.invalid")).toBe(true);

  const newRow = page.getByRole("row").filter({ hasText: "Synthetic Contact Two" });
  await newRow.getByRole("button", { name: /Edit|Editar/i }).click();
  await expect(page.getByTestId("client-contact-inline-form-panel")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByTestId("client-contact-name")).toHaveValue("Synthetic Contact Two");
  await saveScreenshot(page, "04-edit-form");
  await page.getByTestId("client-contact-name").fill("Synthetic Contact Two Updated");
  await page.getByRole("button", { name: /Save|Guardar|Salvar/i }).click();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact Two Updated");
  await dismissSuccessToast(page);
  await saveScreenshot(page, "05-list-after-edit");
  expect(mocks.snapshot().some((record) => record.name === "Synthetic Contact Two Updated")).toBe(true);

  const updatedRow = page.getByRole("row").filter({ hasText: "Synthetic Contact Two Updated" });
  const mutationCount = () => mocks.observed.filter((entry) => /^(POST|PUT|PATCH|DELETE) \/api\/gerit\/v1\/clients\/4242\/contacts/.test(entry)).length;
  const beforeCancel = mutationCount();
  await updatedRow.getByRole("button", { name: /Edit|Editar/i }).click();
  await page.getByTestId("client-contact-name").fill("Unsaved synthetic change");
  await page.getByRole("button", { name: /Cancel|Cancelar/i }).click();
  await expect(page.getByRole("table")).toContainText("Synthetic Contact Two Updated");
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
  await expect(page.getByRole("table")).not.toContainText("Synthetic Contact Two Updated");
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
});
