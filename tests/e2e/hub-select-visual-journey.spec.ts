import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const outputDirectory = resolve(".e2e-debug/hub-select-review");
const screenshotNames: string[] = [];
const blockedBusinessMutations: string[] = [];
const readRequests: string[] = [];

async function captureOpenSelect(page: Page, label: RegExp, fileName: string) {
  const trigger = page.getByRole("combobox", { name: label }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option").first()).toBeVisible();
  const selectedCount = await listbox.getByRole("option", { selected: true }).count();
  expect(selectedCount).toBeLessThanOrEqual(1);
  await listbox.screenshot({ path: resolve(outputDirectory, fileName), animations: "disabled" });
  screenshotNames.push(fileName);
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function navigateThroughMenu(page: Page, section: RegExp, href: string) {
  const bareHref = href.endsWith("/") ? href.slice(0, -1) : href;
  const menuLink = page.locator("a[href='" + bareHref + "'], a[href='" + bareHref + "/']").first();
  const sectionButton = page.getByRole("button", { name: section }).first();
  if (await sectionButton.count()) {
    await expect(sectionButton).toBeVisible();
    if (await sectionButton.getAttribute("aria-expanded") === "false") await sectionButton.click();
  }
  await expect(menuLink).toBeVisible();
  await menuLink.click();
  const expectedPath = href.endsWith("/") ? href : href + "/";
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath);
}

async function exerciseKeyboardNavigation(page: Page, trigger: Locator) {
  await trigger.focus();
  await trigger.press("Space");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press("Enter");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
}
test("HubSelect visual standardization is keyboard accessible and keeps QA business traffic read-only", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(outputDirectory, { recursive: true });
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("Visual login requires the configured E2E account.");

  await page.route("**/api/gerit/v1/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    if (method !== "GET" && method !== "HEAD") {
      blockedBusinessMutations.push(method + " " + url.pathname);
      await route.abort("blockedbyclient");
      return;
    }
    readRequests.push(method + " " + url.pathname + url.search);
    await route.continue();
  });
  await page.route("**/api/gerit/v1/equipment-types/paged/**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{ id: 987654321, name: "HubSelect Visual Fixture", isActive: true }],
      pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1,
    }),
  }));
  await page.route("**/api/gerit/v1/equipment-types/987654321/**", async (route) => {
    if (route.request().method() !== "GET") {
      blockedBusinessMutations.push(route.request().method() + " /equipment-types/987654321");
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 987654321, tenantId: 1, name: "HubSelect Visual Fixture", description: "Synthetic visual review data", isActive: true, createdAt: "2026-01-01T00:00:00Z" }),
    });
  });


  await page.addInitScript(() => {
    (window as Window & { __GERIT_E2E_DIAGNOSTICS__?: boolean }).__GERIT_E2E_DIAGNOSTICS__ = true;
  });
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  const loginRoot = page.getByTestId("login-screen-root");
  await expect(loginRoot).toHaveAttribute("data-hydrated", "true");
  await captureOpenSelect(page, /idioma|language/i, "login-language.png");

  const themeToggle = page.getByRole("button", { name: /alternar tema|toggle theme/i });
  if (await themeToggle.count()) {
    await themeToggle.click();
    await captureOpenSelect(page, /idioma|language/i, "login-language-dark.png");
    await themeToggle.click();
  }

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const loginResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/auth/login" && !(response.status() >= 300 && response.status() < 400);
  }, { timeout: 10_000 });
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status(), "Login UI must return HTTP 200").toBe(200);
  await expect(page).not.toHaveURL(/\/login\/?$/);
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();

  await navigateThroughMenu(page, /clientes|clients/i, "/clients");
  const clientsRoot = page.getByTestId("clients-page-root");
  await expect(clientsRoot).toBeVisible();
  const search = clientsRoot.getByRole("textbox").first();
  await search.fill("HubSelect visual review");
  await expect.poll(() => readRequests.some((request) => request.includes("/clients/paged") && request.toLowerCase().includes("hubselect"))).toBe(true);
  await search.fill("");
  const statusFilter = clientsRoot.getByRole("combobox").first();
  await exerciseKeyboardNavigation(page, statusFilter);
  await captureOpenSelect(page, /estado|status/i, "hubgrid-status-filter.png");
  await captureOpenSelect(page, /por página|por pagina|per page/i, "hubgrid-page-size.png");

  await navigateThroughMenu(page, /clientes|clients/i, "/clients/new");
  await expect(page.getByTestId("client-create-page")).toBeVisible();
  await captureOpenSelect(page, /tipo de pessoa|party type/i, "client-party-type.png");
  await captureOpenSelect(page, /origem de aquisição|acquisition source/i, "client-acquisition-source.png");
  await captureOpenSelect(page, /estado comercial|business status/i, "client-business-status.png");

  await navigateThroughMenu(page, /parametrização|settings|configuration/i, "/preferences");
  await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
  await captureOpenSelect(page, /código da moeda|currency code/i, "preferences-currency.png");
  await captureOpenSelect(page, /fuso horário|time ?zone/i, "preferences-timezone.png");
  await captureOpenSelect(page, /selecionar idioma|language/i, "preferences-language.png");

  await navigateThroughMenu(page, /equipas e recursos|teams and resources/i, "/equipment-types");
  await expect(page.getByTestId("equipment-types-page-root")).toBeVisible();
  const equipmentFixtureRow = page.getByRole("row", { name: /HubSelect Visual Fixture/ });
  await expect(equipmentFixtureRow).toBeVisible();
  await equipmentFixtureRow.click();
  await expect(page.getByTestId("equipment-type-details-page-root")).toBeVisible();
  await expect(page.locator("#equipment-type-name")).toHaveValue("HubSelect Visual Fixture");
  await expect(page.locator("#equipment-type-description")).toHaveValue("Synthetic visual review data");
  await expect(page.getByText(/Detalhes do registo|Record details/i)).toHaveCount(0);
  await expect(page.locator("#equipment-type-id, #equipment-type-created-at")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /guardar|save/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /desativar|deactivate/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /eliminar|delete/i })).toBeVisible();
  await page.getByTestId("equipment-type-fields-section").screenshot({
    path: resolve(outputDirectory, "equipment-types-form-without-metadata.png"),
    animations: "disabled",
  });
  screenshotNames.push("equipment-types-form-without-metadata.png");

  expect(blockedBusinessMutations, "No QA business POST/PUT/PATCH/DELETE may be sent").toEqual([]);
  expect(readRequests.some((request) => request.includes("/clients/paged")), "Client list must be read through its search UI").toBe(true);
  for (const screenshot of screenshotNames) {
    expect((await stat(resolve(outputDirectory, screenshot))).size, "screenshot " + screenshot).toBeGreaterThan(0);
  }
});
