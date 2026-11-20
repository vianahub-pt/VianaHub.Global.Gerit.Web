import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = resolve(".e2e-debug/workspace-header-visual-review");
const initialPreferences = {
  id: 987654321,
  tenantId: 1,
  userId: 1,
  appearance: "light",
  locale: "pt-PT",
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
};

async function navigateThroughMenu(page: Page, section: RegExp, href: string) {
  const bareHref = href.replace(/\/$/, "");
  const sectionButton = page.getByRole("button", { name: section }).first();
  if (await sectionButton.count() && await sectionButton.getAttribute("aria-expanded") === "false") {
    await sectionButton.click();
  }
  const link = page.locator(`a[href="${bareHref}"], a[href="${bareHref}/"]`).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href.endsWith("/") ? href : `${href}/`);
}

async function isDark(page: Page) {
  return page.locator("html").evaluate((element) => element.classList.contains("dark"));
}

async function selectLanguage(
  page: Page,
  select: import("@playwright/test").Locator,
  code: string,
  locale: string,
  themeLabel: string,
  writeCount: number,
  writes: unknown[],
) {
  await select.click();
  await page.getByRole("option", { name: code, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(select).toContainText(code);
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", themeLabel);
  await expect.poll(() => writes.length).toBe(writeCount);
}

async function capturePage(page: Page, name: string) {
  await page.screenshot({
    path: resolve(screenshotDirectory, name),
    animations: "disabled",
    maskColor: "#e9eef4",
    mask: [page.locator("header p"), page.getByTestId("user-profile-menu-root"), page.locator("#hub-body")],
  });
}

test("workspace header keeps HubSelect language and theme synchronized across pages", async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(screenshotDirectory, { recursive: true });

  let mockedPreferences = { ...initialPreferences };
  const preferenceWrites: Array<{ method: string; appearance: string; locale: string }> = [];
  const blockedBusinessWrites: string[] = [];
  let pageErrorCount = 0;
  page.on("pageerror", () => { pageErrorCount += 1; });

  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("language", "pt-PT");
    (window as Window & { __GERIT_E2E_DIAGNOSTICS__?: boolean }).__GERIT_E2E_DIAGNOSTICS__ = true;
  });
  await page.route("**/api/gerit/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.includes("/user-preferences")) {
      if (request.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockedPreferences) });
        return;
      }
      const payload = request.postDataJSON() as { appearance?: string; locale?: string };
      mockedPreferences = {
        ...mockedPreferences,
        ...(payload.appearance ? { appearance: payload.appearance } : {}),
        ...(payload.locale ? { locale: payload.locale } : {}),
      };
      preferenceWrites.push({ method: request.method(), appearance: mockedPreferences.appearance, locale: mockedPreferences.locale });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockedPreferences) });
      return;
    }
    if (request.method() !== "GET") {
      blockedBusinessWrites.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("Workspace header journey requires the configured E2E account.");

  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-screen-root")).toHaveAttribute("data-hydrated", "true");
  const loginLanguage = page.getByRole("combobox", { name: /idioma|language/i });
  await expect(loginLanguage).toBeVisible();
  await loginLanguage.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(4);
  await page.keyboard.press("Escape");
  const loginTheme = page.getByRole("button", { name: /alternar tema|toggle theme/i });
  await loginTheme.click();
  await expect.poll(() => isDark(page)).toBe(true);
  await loginTheme.click();
  await expect.poll(() => isDark(page)).toBe(false);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const loginResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.replace(/\/$/, "") === "/api/auth/login" &&
    !(response.status() >= 300 && response.status() < 400),
  );
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  expect((await loginResponsePromise).status()).toBe(200);
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
  const headerControls = page.getByTestId("workspace-header-controls");
  await expect(headerControls).toHaveAttribute("data-preferences-hydrated", "true");
  const themeButton = page.getByTestId("theme-toggle");
  const languageSelect = page.getByTestId("workspace-language-select");
  await expect(themeButton).toBeEnabled();
  await expect(languageSelect).toBeVisible();
  await expect(languageSelect).toContainText("PT");
  expect(await isDark(page)).toBe(false);
  await capturePage(page, "home-light.png");

  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(true);
  await expect.poll(() => preferenceWrites.length).toBe(1);
  await capturePage(page, "home-dark.png");

  await languageSelect.focus();
  await languageSelect.press("Space");
  const languageList = page.getByRole("listbox");
  await expect(languageList).toBeVisible();
  await expect(languageList.getByRole("option")).toHaveCount(4);
  await languageList.screenshot({ path: resolve(screenshotDirectory, "header-language-open.png"), animations: "disabled" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(languageList).toBeHidden();
  await expect(languageSelect).toBeFocused();
  await selectLanguage(page, languageSelect, "BR", "pt-BR", "Ativar tema claro", 2, preferenceWrites);
  await selectLanguage(page, languageSelect, "ES", "es-ES", "Activar tema claro", 3, preferenceWrites);
  await selectLanguage(page, languageSelect, "EN", "en-US", "Enable light theme", 4, preferenceWrites);

  await navigateThroughMenu(page, /clients/i, "/clients");
  await expect(page.getByTestId("clients-page-root")).toBeVisible();
  await expect(languageSelect).toContainText("EN");
  expect(await isDark(page)).toBe(true);
  await capturePage(page, "clients-header.png");
  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(false);
  await expect.poll(() => preferenceWrites.length).toBe(5);

  await navigateThroughMenu(page, /configuration|settings/i, "/preferences");
  await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
  await expect(languageSelect).toContainText("EN");
  expect(await isDark(page)).toBe(false);
  await expect(page.getByRole("radio", { name: /^Light\b/ })).toHaveAttribute("aria-checked", "true");
  await capturePage(page, "preferences-header.png");
  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(true);
  await expect(page.getByRole("radio", { name: /^Dark\b/ })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => preferenceWrites.length).toBe(6);

  await navigateThroughMenu(page, /teams and resources/i, "/equipment-types");
  await expect(page.getByTestId("equipment-types-page-root")).toBeVisible();
  await expect(languageSelect).toContainText("EN");
  expect(await isDark(page)).toBe(true);
  await capturePage(page, "equipment-types-header.png");
  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(false);
  await expect.poll(() => preferenceWrites.length).toBe(7);

  await navigateThroughMenu(page, /operations/i, "/dashboards");
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
  expect(await isDark(page)).toBe(false);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(true);
  await themeButton.click();
  await expect.poll(() => isDark(page)).toBe(false);
  await expect.poll(() => preferenceWrites.length).toBe(9);

  await page.reload();
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
  await expect(page.getByTestId("workspace-header-controls")).toHaveAttribute("data-preferences-hydrated", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  expect(await isDark(page)).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(languageSelect).toBeVisible();
  await expect(themeButton).toBeVisible();
  await expect(page.getByTestId("user-profile-menu-root")).toBeVisible();
  const headerFitsViewport = await page.locator("header").evaluate((header) => {
    const rect = header.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && header.scrollWidth <= header.clientWidth;
  });
  expect(headerFitsViewport).toBe(true);
  const pageHasNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(pageHasNoHorizontalOverflow).toBe(true);
  await capturePage(page, "header-reduced-viewport.png");

  expect(blockedBusinessWrites).toEqual([]);
  expect(preferenceWrites).toHaveLength(9);
  expect(preferenceWrites.at(-1)).toMatchObject({ appearance: "light", locale: "en-US" });
  expect(pageErrorCount).toBe(0);
  console.log(`[workspace-header-e2e] preference writes intercepted=${preferenceWrites.length}; blocked business writes=${blockedBusinessWrites.length}; page errors=${pageErrorCount}; viewport=390x844`);
});
