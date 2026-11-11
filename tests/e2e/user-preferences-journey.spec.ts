import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type StepOutcome = "PASS" | "FAIL" | "BLOCKED" | "RECOVERED" | "NOT_EXECUTED";
type Step = { name: string; outcome: StepOutcome; durationMs: number; status?: number; url?: string; detail?: string };
type StepDetails = Partial<Pick<Step, "outcome" | "status" | "url" | "detail">>;
type Preferences = {
  id: number;
  appearance: string | null;
  currencyCode: string | null;
  locale: string | null;
  timezone: string | null;
  dateFormat: string | null;
  timeFormat: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  emailNewsletter: boolean;
  emailWeeklyReport: boolean;
  emailApproval: boolean;
  emailAlerts: boolean;
  emailReminders: boolean;
  emailPlanner: boolean;
};

const reportDirectory = resolve(".e2e-debug/user-preferences");
const outputPath = resolve(reportDirectory, "report.json");
const preferencePath = /\/api\/gerit\/v1\/user-preferences(?:\/|$)/;
const parametrizationAccessibleName = /^(parametrização|parametrización|configuration)$/i;
const sidebarPreferencesAccessibleName = /^(preferências|preferencias|preferences)$/i;
const dashboardSidebarAccessibleName = /^(dashboard|panel)$/i;
const dashboardWeekAccessibleName = /^(week|semana)$/i;
const timeFormatAccessibleName = /time format|formato de hora|formato da hora/i;
const dayStartAccessibleName = /start of day|início do dia|inicio del día/i;
const dayEndAccessibleName = /end of day|fim do dia|fin del día/i;
const languageAccessibleName = /select language|selecionar idioma|seleccionar idioma/i;
const currencyAccessibleName = /currency code|código da moeda|código de moneda/i;
const timezoneAccessibleName = /time zone|fuso horário|zona horaria/i;
const dateFormatAccessibleName = /date format|formato de data|formato da data|formato de fecha/i;
const timeFormatOption = (value: string) => value === "12h" ? /12-hour|12 horas|12h/i : /24-hour|24 horas|24h/i;
const savingFeedback = /saving changes to the API|salvando alterações na API|a guardar alterações na API|guardando cambios en la API/i;
const savedFeedback = /preferences loaded and synchronized|preferências carregadas e sincronizadas|preferencias cargadas y sincronizadas/i;
const translationKey = /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/;
const emailCheckboxes = [
  { field: "emailNewsletter", name: /ativar notificação: newsletter|enable notification: newsletter|activar notificación: (newsletter|boletín)/i },
  { field: "emailWeeklyReport", name: /ativar notificação: relatório semanal|enable notification: weekly report|activar notificación: informe semanal/i },
  { field: "emailApproval", name: /ativar notificação: aprovação|enable notification: approval|activar notificación: aprobación/i },
  { field: "emailAlerts", name: /ativar notificação: alertas|enable notification: alerts|activar notificación: alertas/i },
  { field: "emailReminders", name: /ativar notificação: lembretes|enable notification: reminders|activar notificación: recordatorios/i },
  { field: "emailPlanner", name: /ativar notificação: (planeador|planejador)|enable notification: planner|activar notificación: planificador/i },
] as const;
const scopedPreferenceKey = (tenantId: number, userId: number) =>
  `gerit.user-preferences.v1.${tenantId}:${userId}`;

function languageOption(locale: string) {
  switch (locale) {
    case "pt-PT": return /portuguese(?! \(brazil\))|português(?! \(brasil\))|portugués(?! \(brasil\))/i;
    case "pt-BR": return /portuguese \(brazil\)|português \(brasil\)|portugués \(brasil\)/i;
    case "es-ES": return /spanish|espanhol|español/i;
    default: return /english|inglês|inglés/i;
  }
}

function safeDetail(error: unknown) {
  return (error instanceof Error ? error.message : "Unexpected E2E failure")
    .replace(/https?:\/\/[^\s)]+/g, "[URL redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .slice(0, 300);
}

function timeHHmm(value: string | null) {
  return value?.match(/^\d{2}:\d{2}/)?.[0] ?? null;
}

async function apiCall(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const session = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { accessToken?: string } | null;
    if (!session?.accessToken) throw new Error("Authenticated session is unavailable.");
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { method, path, body });
}

async function recordStep(
  steps: Step[],
  name: string,
  action: () => Promise<StepDetails | void>,
) {
  const startedAt = Date.now();
  console.log(`[E2E] START: ${name}`);
  try {
    const result = await action();
    const outcome = result?.outcome ?? "PASS";
    steps.push({ name, outcome, durationMs: Date.now() - startedAt, ...(result ?? {}) });
    console.log(`[E2E] ${outcome}: ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    const detail = safeDetail(error);
    steps.push({ name, outcome: "FAIL", durationMs: Date.now() - startedAt, detail });
    console.log(`[E2E] FAIL: ${name} - ${detail}`);
  }
}

function isFinalHttpResponse(
  response: import("@playwright/test").Response,
  method: string,
  path: RegExp,
) {
  const status = response.status();
  const pathname = new URL(response.url()).pathname;
  return response.request().method() === method &&
    path.test(pathname) &&
    !(status >= 300 && status < 400);
}

async function installVisualCursor(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("user-preferences-e2e-pointer-style")) return;
      const style = document.createElement("style");
      style.id = "user-preferences-e2e-pointer-style";
      style.textContent = `
        #user-preferences-e2e-pointer{position:fixed;z-index:2147483647;left:0;top:0;width:20px;height:20px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:opacity .08s ease;box-shadow:0 0 0 4px rgba(255,59,48,.22)}
        #user-preferences-e2e-pointer.visible{opacity:.92}
        #user-preferences-e2e-pointer.clicked{animation:user-preferences-e2e-pulse .45s ease-out}
        [data-user-preferences-e2e-highlight="true"]{outline:3px solid #f97316!important;outline-offset:3px!important;transition:outline-color .1s ease}
        @keyframes user-preferences-e2e-pulse{0%{box-shadow:0 0 0 3px rgba(255,59,48,.48);transform:translate(-50%,-50%) scale(.8)}100%{box-shadow:0 0 0 15px rgba(255,59,48,0);transform:translate(-50%,-50%) scale(1.2)}}
      `;
      document.head.appendChild(style);
      const pointer = document.createElement("div");
      pointer.id = "user-preferences-e2e-pointer";
      document.body.appendChild(pointer);
      document.addEventListener("mousemove", (event) => {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
        pointer.classList.add("visible");
      });
      document.addEventListener("click", (event) => {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
        pointer.classList.remove("clicked");
        void pointer.offsetWidth;
        pointer.classList.add("clicked");
      }, true);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
}

async function visualClick(page: Page, locator: import("@playwright/test").Locator) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  if (bounds) {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 8 });
  }
  await locator.evaluate((element) => {
    element.setAttribute("data-user-preferences-e2e-highlight", "true");
    window.setTimeout(() => element.removeAttribute("data-user-preferences-e2e-highlight"), 850);
  });
  await page.waitForTimeout(400);
  await locator.click();
  await page.waitForTimeout(350);
}

async function expandParametrizationSection(page: Page) {
  const sectionButton = page.getByRole("button", { name: parametrizationAccessibleName });
  await expect(sectionButton).toBeVisible();
  const accessibleName = (await sectionButton.innerText()).trim();
  if (await sectionButton.getAttribute("aria-expanded") !== "true") {
    await visualClick(page, sectionButton);
  }
  await expect(sectionButton).toHaveAttribute("aria-expanded", "true");
  return { sectionButton, accessibleName };
}

function sidebarPreferencesLink(page: Page) {
  return page.getByRole("link", { name: sidebarPreferencesAccessibleName });
}

async function authenticateVisually(page: Page) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("E2E login credentials are not configured.");

  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-screen-root")).toBeVisible();
  const emailField = page.locator('input[type="email"]');
  const passwordField = page.locator('input[type="password"]');
  const submit = page.getByRole("button", {
    name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i,
  });

  await expect(emailField).toBeVisible();
  await visualClick(page, emailField);
  await emailField.fill(email);
  await expect(passwordField).toBeVisible();
  await visualClick(page, passwordField);
  await passwordField.fill(password);

  const loginResponse = page.waitForResponse((response) =>
    isFinalHttpResponse(response, "POST", /^\/api\/auth\/login\/?$/),
  );
  await visualClick(page, submit);
  const response = await loginResponse;
  if (response.status() !== 200) {
    throw new Error(`POST /api/auth/login returned HTTP ${response.status()}.`);
  }
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "");
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
  return { status: response.status(), url: response.url() };
}

async function selectOption(
  page: Page,
  accessibleName: RegExp,
  option: RegExp,
  keyboardEdge?: "first" | "last",
  currentValue?: RegExp,
  observeSavingFeedback = false,
) {
  const field = page.getByRole("combobox", { name: accessibleName });
  await expect(field).toBeVisible();
  if (currentValue) await expect(field).toContainText(currentValue);
  const responsePromise = page.waitForResponse((response) =>
    isFinalHttpResponse(response, "PUT", preferencePath),
  );
  await visualClick(page, field);
  await expect(page.getByRole("listbox")).toBeVisible();
  if (keyboardEdge) {
    await page.keyboard.press(keyboardEdge === "first" ? "Home" : "End");
    await expect(page.getByRole("option", { name: option })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(field).toHaveText(option);
  } else {
    await visualClick(page, page.getByRole("option", { name: option }));
  }
  if (observeSavingFeedback) {
    await expect(page.getByText(savingFeedback)).toBeVisible();
  }
  const response = await responsePromise;
  const requestBody = response.request().postDataJSON() as Record<string, unknown>;
  if (observeSavingFeedback) await expect(page.getByText(savedFeedback)).toBeVisible();
  return { response, requestBody, finalUrl: response.url() };
}

async function readPreference(page: Page, userId: number) {
  const result = await apiCall(page, "GET", `/api/gerit/v1/user-preferences/user/${userId}`);
  if (result.status !== 200 || typeof result.body !== "object" || result.body === null) {
    throw new Error(`GET preference returned HTTP ${result.status}.`);
  }
  return result.body as Preferences;
}

test("UserPreferences complete visual journey", async ({ page, context, browser }, testInfo: TestInfo) => {
  test.setTimeout(300_000);
  const startedAt = Date.now();
  const steps: Step[] = [];
  let loginSucceeded = false;
  let preferenceSnapshot: Preferences | null = null;
  let latestUpdatePayload: Record<string, unknown> | null = null;
  let userId: number | null = null;
  let tenantId: number | null = null;
  let scopedCacheKey: string | null = null;
  let scopedCacheOriginal: string | null = null;
  let legacyCacheOriginal: string | null = null;
  let cleanup = "NOT_STARTED";
  const evidence = { screenshots: [] as string[], trace: "Playwright trace attached to test result", video: "Playwright video attached to test result" };
  const preferenceReads: import("@playwright/test").Response[] = [];

  page.on("response", (response) => {
    if (isFinalHttpResponse(response, "GET", preferencePath)) preferenceReads.push(response);
  });

  await mkdir(reportDirectory, { recursive: true });
  await testInfo.attach("user-preferences-trace-note", { body: "Trace and video are recorded by the journey project.", contentType: "text/plain" });

  try {
    await recordStep(steps, "Login through UI", async () => {
      await installVisualCursor(page);
      const login = await authenticateVisually(page);
      loginSucceeded = true;
      const originalStorage = await page.evaluate(() => ({
        session: JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { tenantId?: number; userId?: number } | null,
        legacy: localStorage.getItem("gerit.user-preferences.current"),
      }));
      if (typeof originalStorage.session?.tenantId !== "number" || typeof originalStorage.session.userId !== "number") {
        throw new Error("Authenticated identity scope is unavailable.");
      }
      tenantId = originalStorage.session.tenantId;
      userId = originalStorage.session.userId;
      scopedCacheKey = scopedPreferenceKey(tenantId, userId);
      legacyCacheOriginal = originalStorage.legacy;
      scopedCacheOriginal = await page.evaluate((key) => localStorage.getItem(key), scopedCacheKey);
      await page.screenshot({ path: resolve(reportDirectory, "01-home.png"), fullPage: true });
      evidence.screenshots.push(".e2e-debug/user-preferences/01-home.png");
      return { status: login.status, url: login.url };
    });

    if (!loginSucceeded) {
      for (const name of ["Sidebar Parametrização", "Sidebar Preferências", "Preferences route", "Load existing preference", "Hydration", "Update and persist timeFormat", "Persistence after reload", "DayStart HH:mm format", "Payload without userId", "Local-only flags excluded", "Restore original values", "Cleanup", "i18n", "Accessibility", "Automation readiness"]) {
        steps.push({ name, outcome: "BLOCKED", durationMs: 0, detail: "Login did not complete." });
      }
      steps.push({ name: "410 absence scenario", outcome: "NOT_EXECUTED", durationMs: 0, detail: "Unsafe to mutate shared E2E identity; absence behavior is covered by focused tests." });
    } else {
      await recordStep(steps, "Sidebar Parametrização", async () => {
        const { accessibleName } = await expandParametrizationSection(page);
        return { detail: `SIDEBAR_PARAMETRIZACAO=PASS; accessible name: ${accessibleName}` };
      });

      await recordStep(steps, "Sidebar Preferências", async () => {
        const preferencesLink = sidebarPreferencesLink(page);
        await expect(preferencesLink).toBeVisible();
        const accessibleName = (await preferencesLink.innerText()).trim();
        await visualClick(page, preferencesLink);
        await expect(page).toHaveURL(/\/preferences\/?$/);
        return { url: page.url(), detail: `SIDEBAR_PREFERENCIAS=PASS; accessible name: ${accessibleName}` };
      });

      await recordStep(steps, "Preferences route", async () => {
        await expect(page).toHaveURL(/\/preferences\/?$/);
        await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
        return { detail: "PREFERENCES_ROUTE=PASS" };
      });

      await recordStep(steps, "Load existing preference", async () => {
        if (typeof userId !== "number") throw new Error("Authenticated user ID is unavailable.");
        const userPreferencePath = new RegExp(`/user/${userId}/?$`);
        await expect.poll(() => preferenceReads.some((response) => userPreferencePath.test(new URL(response.url()).pathname))).toBe(true);
        const matchingReads = preferenceReads.filter((response) => userPreferencePath.test(new URL(response.url()).pathname));
        const getResponse = matchingReads[matchingReads.length - 1];
        if (!getResponse) throw new Error("UI GET user preference response was not observed.");
        const finalUrl = getResponse.url();
        if (getResponse.status() === 410) {
          return { outcome: "BLOCKED", status: 410, url: finalUrl, detail: "API reported a valid absence; this journey requires an existing record, and no create was attempted." };
        }
        if (getResponse.status() === 403) {
          return { outcome: "FAIL", status: 403, url: finalUrl, detail: "Final preference read was denied by authorization." };
        }
        if (getResponse.status() >= 500) {
          return { outcome: "FAIL", status: getResponse.status(), url: finalUrl, detail: "Final preference read returned a server error." };
        }
        if (getResponse.status() !== 200) {
          return { outcome: "FAIL", status: getResponse.status(), url: finalUrl, detail: "Final preference read returned an unexpected status." };
        }
        const responseBody = await getResponse.json() as Preferences;
        preferenceSnapshot = responseBody;
        if (!scopedCacheKey) throw new Error("Authenticated scoped cache key is unavailable.");
        scopedCacheOriginal = await page.evaluate((key) => localStorage.getItem(key), scopedCacheKey);
        return { status: getResponse.status(), url: finalUrl, detail: "Final non-redirect API response; sensitive identity identifiers remain local to the test." };
      });

      if (preferenceSnapshot) {
        await recordStep(steps, "Hydration from API", async () => {
          await expect(page.getByText(/preferences loaded and synchronized|preferências carregadas e sincronizadas|preferencias cargadas y sincronizadas/i)).toBeVisible();
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(preferenceSnapshot!.timeFormat ?? "24h"));
          await page.screenshot({ path: resolve(reportDirectory, "02-preferences-loaded.png"), fullPage: true });
          evidence.screenshots.push(".e2e-debug/user-preferences/02-preferences-loaded.png");
        });

        const generalSnapshot = preferenceSnapshot as Preferences;
        const originalGeneral = {
          appearance: generalSnapshot.appearance ?? "light",
          currencyCode: generalSnapshot.currencyCode ?? "EUR",
          timezone: generalSnapshot.timezone ?? "Europe/Lisbon",
          dateFormat: generalSnapshot.dateFormat ?? "DD-MM-YYYY",
          locale: generalSnapshot.locale ?? await page.locator("html").getAttribute("lang") ?? "en-US",
        };
        const targetGeneral = {
          appearance: originalGeneral.appearance === "dark" ? "light" : "dark",
          currencyCode: originalGeneral.currencyCode === "USD" ? "EUR" : "USD",
          timezone: originalGeneral.timezone === "Europe/Madrid" ? "Europe/Lisbon" : "Europe/Madrid",
          dateFormat: originalGeneral.dateFormat === "MM/DD/YYYY" ? "DD/MM/YYYY" : "MM/DD/YYYY",
          locale: originalGeneral.locale === "pt-BR" ? "en-US" : "pt-BR",
        };

        await recordStep(steps, "Exercise and persist all General controls", async () => {
          const themeGroup = page.getByRole("radiogroup", { name: /theme|tema/i });
          const targetTheme = themeGroup.getByRole("radio", {
            name: targetGeneral.appearance === "dark" ? /^(dark|escuro)/i : /^(light|claro)/i,
          });
          const themeResponsePromise = page.waitForResponse((response) =>
            isFinalHttpResponse(response, "PUT", preferencePath),
          );
          await visualClick(page, targetTheme);
          await expect(targetTheme).toHaveAttribute("aria-checked", "true");
          const themeResponse = await themeResponsePromise;
          if (themeResponse.status() !== 200) throw new Error(`Theme update returned HTTP ${themeResponse.status()}.`);
          const themePayload = themeResponse.request().postDataJSON() as Record<string, unknown>;
          if (themePayload.appearance !== targetGeneral.appearance) throw new Error("Theme PUT did not contain the selected appearance.");

          const updates = [
            [currencyAccessibleName, targetGeneral.currencyCode, originalGeneral.currencyCode],
            [timezoneAccessibleName, targetGeneral.timezone, originalGeneral.timezone],
            [dateFormatAccessibleName, targetGeneral.dateFormat, originalGeneral.dateFormat],
          ] as const;
          for (const [accessibleName, target, original] of updates) {
            const { response, requestBody } = await selectOption(
              page,
              accessibleName,
              new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
              undefined,
              new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            );
            if (response.status() !== 200) throw new Error(`General preference update returned HTTP ${response.status()}.`);
            if (requestBody[accessibleName === currencyAccessibleName ? "currencyCode" : accessibleName === timezoneAccessibleName ? "timezone" : "dateFormat"] !== target) {
              throw new Error("General preference PUT did not contain its selected value.");
            }
          }

          const localeUpdate = await selectOption(
            page,
            languageAccessibleName,
            languageOption(targetGeneral.locale),
            undefined,
            languageOption(originalGeneral.locale),
          );
          if (localeUpdate.response.status() !== 200 || localeUpdate.requestBody.locale !== targetGeneral.locale) {
            throw new Error(`Language update returned HTTP ${localeUpdate.response.status()} or an unexpected locale payload.`);
          }
          await expect(page.locator("html")).toHaveAttribute("lang", targetGeneral.locale);
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
          const persisted = await readPreference(page, userId!);
          for (const key of ["appearance", "currencyCode", "timezone", "dateFormat", "locale"] as const) {
            if (persisted[key] !== targetGeneral[key]) throw new Error(`${key} did not persist after reload.`);
          }
          await expect(page.getByRole("radiogroup", { name: /theme|tema/i }).getByRole("radio", {
            name: targetGeneral.appearance === "dark" ? /^(dark|escuro)/i : /^(light|claro)/i,
          })).toHaveAttribute("aria-checked", "true");
          await expect(page.getByRole("combobox", { name: currencyAccessibleName })).toContainText(targetGeneral.currencyCode);
          await expect(page.getByRole("combobox", { name: timezoneAccessibleName })).toContainText(targetGeneral.timezone);
          await expect(page.getByRole("combobox", { name: dateFormatAccessibleName })).toContainText(targetGeneral.dateFormat);
          await expect(page.locator("html")).toHaveAttribute("lang", targetGeneral.locale);

          const restoreLocale = await selectOption(
            page,
            languageAccessibleName,
            languageOption(originalGeneral.locale),
            undefined,
            languageOption(targetGeneral.locale),
          );
          if (restoreLocale.response.status() !== 200 || restoreLocale.requestBody.locale !== originalGeneral.locale) {
            throw new Error(`Restoring language returned HTTP ${restoreLocale.response.status()} or an unexpected locale payload.`);
          }
          await expect(page.locator("html")).toHaveAttribute("lang", originalGeneral.locale);
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("lang", originalGeneral.locale);
          return { status: 200, detail: "Theme, language, currency, time zone, and date format each saved through UI; changed values persisted after reload, and language was restored before continuing." };
        });

        await recordStep(steps, "Update timeFormat and confirm API response", async () => {
          const original = preferenceSnapshot!.timeFormat ?? "24h";
          const target = original === "12h" ? "24h" : "12h";
          const { response, requestBody, finalUrl } = await selectOption(
            page,
            timeFormatAccessibleName,
            timeFormatOption(target),
            target === "12h" ? "last" : "first",
            timeFormatOption(original),
          );
          if (response.status() !== 200) {
            return { outcome: "FAIL", status: response.status(), url: finalUrl, detail: "Final update response was not HTTP 200." };
          }
          latestUpdatePayload = requestBody;
          expect(requestBody).not.toHaveProperty("userId");
          await expect(page.getByText(/preferences loaded and synchronized|preferências carregadas e sincronizadas|preferencias cargadas y sincronizadas/i)).toBeVisible();
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(target));
          return { status: response.status(), url: finalUrl, detail: "Final non-redirect update response; payload values were not logged." };
        });

        await recordStep(steps, "Persistence after reload", async () => {
          const target = preferenceSnapshot!.timeFormat === "12h" ? "24h" : "12h";
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
          const persisted = await readPreference(page, userId!);
          if (persisted.timeFormat !== target) throw new Error("Updated timeFormat did not persist after reload.");
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(target));
        });

        await recordStep(steps, "DayStart HH:mm format and API-only payload", async () => {
          const original = timeHHmm(preferenceSnapshot!.dayStart);
          if (!original) throw new Error("Original dayStart is not a readable HH:mm value.");
          const target = original === "08:30" ? "09:00" : "08:30";
          const { response, requestBody, finalUrl } = await selectOption(page, dayStartAccessibleName, new RegExp(`^${target}$`));
          if (response.status() !== 200) {
            return { outcome: "FAIL", status: response.status(), url: finalUrl, detail: "Final dayStart update response was not HTTP 200." };
          }
          if (requestBody.dayStart !== target || typeof requestBody.dayStart !== "string" || !/^\d{2}:\d{2}$/.test(requestBody.dayStart)) {
            throw new Error("DayStart request was not serialized as HH:mm.");
          }
          if (typeof requestBody.dayEnd !== "string" || !/^\d{2}:\d{2}$/.test(requestBody.dayEnd)) {
            throw new Error("DayEnd request was not serialized as HH:mm.");
          }
          latestUpdatePayload = requestBody;
          return { status: response.status(), url: finalUrl, detail: "Final non-redirect update contains certified fields and HH:mm day times." };
        });

        await recordStep(steps, "DayEnd HH:mm update and reload persistence", async () => {
          const originalEnd = timeHHmm(preferenceSnapshot!.dayEnd);
          if (!originalEnd) throw new Error("Original dayEnd is not a readable HH:mm value.");
          const targetEnd = originalEnd === "17:00" ? "17:30" : "17:00";
          const { response, requestBody, finalUrl } = await selectOption(page, dayEndAccessibleName, new RegExp(`^${targetEnd}$`));
          if (response.status() !== 200) throw new Error(`dayEnd update returned HTTP ${response.status()}.`);
          if (requestBody.dayEnd !== targetEnd || typeof requestBody.dayEnd !== "string" || !/^\d{2}:\d{2}$/.test(requestBody.dayEnd)) {
            throw new Error("dayEnd request was not serialized as HH:mm.");
          }
          latestUpdatePayload = requestBody;
          await page.reload({ waitUntil: "domcontentloaded" });
          const persisted = await readPreference(page, userId!);
          const originalStart = timeHHmm(preferenceSnapshot!.dayStart);
          const targetStart = originalStart === "08:30" ? "09:00" : "08:30";
          if (timeHHmm(persisted.dayStart) !== targetStart || timeHHmm(persisted.dayEnd) !== targetEnd) {
            throw new Error("dayStart/dayEnd did not both persist after reload.");
          }
          return { status: response.status(), url: finalUrl, detail: "dayEnd and the earlier dayStart update persisted in HH:mm form after reload." };
        });

        await recordStep(steps, "Payload excludes userId and contains certified fields", async () => {
          if (!latestUpdatePayload) throw new Error("No update payload was captured.");
          expect(latestUpdatePayload).not.toHaveProperty("userId");
          expect(Object.keys(latestUpdatePayload).sort()).toEqual([
            "appearance", "currencyCode", "dateFormat", "dayEnd", "dayStart", "emailAlerts", "emailApproval", "emailNewsletter", "emailPlanner", "emailReminders", "emailWeeklyReport", "locale", "timeFormat", "timezone",
          ].sort());
        });

        await recordStep(steps, "Local-only notification flags excluded", async () => {
          if (!latestUpdatePayload) throw new Error("No update payload was captured.");
          for (const key of ["integration", "longRunningTimer", "scheduledReports", "timeOff", "invoices"]) {
            expect(latestUpdatePayload).not.toHaveProperty(key);
          }
        });

        await recordStep(steps, "i18n", async () => {
          const lang = await page.locator("html").getAttribute("lang");
          if (!lang) throw new Error("Document language is missing.");
          const visibleText = await page.getByTestId("user-preferences-page-root").innerText();
          if (visibleText.split(/\r?\n/).map((line) => line.trim()).some((line) => translationKey.test(line))) {
            throw new Error("A raw translation key is visible.");
          }
        });

        await recordStep(steps, "Accessibility and keyboard operation", async () => {
          const timeFormat = page.getByRole("combobox", { name: timeFormatAccessibleName });
          for (const accessibleName of [dayStartAccessibleName, dayEndAccessibleName]) {
            await expect(page.getByRole("combobox", { name: accessibleName })).toBeVisible();
          }
          await expect(timeFormat).toBeVisible();
          await timeFormat.focus();
          await page.keyboard.press("Enter");
          await expect(page.getByRole("option", { name: timeFormatOption(preferenceSnapshot!.timeFormat ?? "24h") })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(timeFormat).toBeFocused();
        });

        await recordStep(steps, "Email tab semantic controls", async () => {
          const tabs = page.getByRole("tablist").getByRole("tab");
          await expect(tabs).toHaveCount(2);
          const emailTab = page.getByRole("tab", { name: /e-?mail|notific/i });
          await visualClick(page, emailTab);
          await expect(emailTab).toHaveAttribute("aria-selected", "true");
          for (const item of emailCheckboxes) {
            const control = page.getByRole("checkbox", { name: item.name });
            await expect(control).toBeVisible();
            await expect(control).toHaveAccessibleName(item.name);
          }
          const visibleText = await page.getByTestId("user-preferences-page-root").innerText();
          if (visibleText.split(/\r?\n/).map((line) => line.trim()).some((line) => translationKey.test(line))) {
            throw new Error("A raw translation key is visible in the email tab.");
          }
          return { detail: "Both tabs and six accessible email checkboxes are present in this canonical journey." };
        });

        await recordStep(steps, "Visible focus on email switch", async () => {
          const emailTab = page.getByRole("tab", { name: /e-?mail|notific/i });
          const firstSwitch = page.getByRole("checkbox", { name: emailCheckboxes[0].name });
          await emailTab.focus();
          await page.keyboard.press("Tab");
          await expect(firstSwitch).toBeFocused();
          const focusStyle = await firstSwitch.evaluate((input) => {
            const track = input.nextElementSibling as HTMLElement | null;
            if (!track) throw new Error("Switch visual track is missing.");
            const style = getComputedStyle(track);
            return {
              isInputFocused: document.activeElement === input,
              focusVisible: input.matches(":focus-visible"),
              boxShadow: style.boxShadow,
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
            };
          });
          if (!focusStyle.isInputFocused || !focusStyle.focusVisible) throw new Error("Keyboard focus did not reach the checkbox input.");
          if (focusStyle.boxShadow === "none" && (focusStyle.outlineStyle === "none" || focusStyle.outlineWidth === "0px")) {
            throw new Error("Focused switch has no visible ring, outline, or shadow.");
          }
          await page.screenshot({ path: resolve(reportDirectory, "04-email-switch-focused.png"), fullPage: true });
          evidence.screenshots.push(".e2e-debug/user-preferences/04-email-switch-focused.png");
          return { detail: "VISIBLE_FOCUS=PASS; the focused checkbox and its visible peer track have a computed focus indicator." };
        });

        const originalEmailValues = Object.fromEntries(
          emailCheckboxes.map(({ field }) => [field, preferenceSnapshot![field]]),
        ) as Record<(typeof emailCheckboxes)[number]["field"], boolean>;

        await recordStep(steps, "Update all six email preferences through UI", async () => {
          for (const item of emailCheckboxes) {
            await expect(page.getByRole("checkbox", { name: item.name })).toBeVisible();
          }
          for (const item of emailCheckboxes) {
            const control = page.getByRole("checkbox", { name: item.name });
            const original = originalEmailValues[item.field];
            const target = !original;
            const responsePromise = page.waitForResponse((response) =>
              isFinalHttpResponse(response, "PUT", preferencePath),
            );
            await control.focus();
            await page.keyboard.press("Space");
            await expect(control).toHaveJSProperty("checked", target);
            if (item.field === emailCheckboxes[0].field) {
              await expect(page.getByText(savingFeedback)).toBeVisible();
            }
            const response = await responsePromise;
            if (response.status() !== 200) throw new Error(`${item.field} update returned HTTP ${response.status()}.`);
            const payload = response.request().postDataJSON() as Record<string, unknown>;
            if (payload[item.field] !== target) throw new Error(`${item.field} was absent or incorrect in its PUT payload.`);
            if (item.field === emailCheckboxes[0].field) {
              await expect(page.getByText(savedFeedback)).toBeVisible();
            }
          }
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
          const persisted = await readPreference(page, userId!);
          for (const item of emailCheckboxes) {
            if (persisted[item.field] !== !originalEmailValues[item.field]) {
              throw new Error(`${item.field} did not persist after reload.`);
            }
          }
          const emailTab = page.getByRole("tab", { name: /e-?mail|notific/i });
          await visualClick(page, emailTab);
          for (const item of emailCheckboxes) {
            await expect(page.getByRole("checkbox", { name: item.name })).toBeChecked({ checked: !originalEmailValues[item.field] });
          }
          return { status: 200, detail: "Six UI PUTs returned HTTP 200 and the changed values persisted after reload." };
        });

        await recordStep(steps, "Scoped cache and legacy cache poisoning", async () => {
          if (!scopedCacheKey || typeof tenantId !== "number" || typeof userId !== "number") throw new Error("Scoped cache identity is unavailable.");
          const currentApiSnapshot = await readPreference(page, userId);
          const cacheState = await page.evaluate((key) => ({ raw: localStorage.getItem(key), legacy: localStorage.getItem("gerit.user-preferences.current") }), scopedCacheKey);
          if (!cacheState.raw) throw new Error("Scoped preference cache is missing.");
          const cached = JSON.parse(cacheState.raw) as Record<string, unknown>;
          if (cached.timeFormat !== currentApiSnapshot.timeFormat || cached.dateFormat !== currentApiSnapshot.dateFormat) {
            throw new Error("Scoped cache does not match the authenticated API snapshot.");
          }
          const poisonedLegacy = JSON.stringify({ timeFormat: currentApiSnapshot.timeFormat === "12h" ? "24h" : "12h", dateFormat: currentApiSnapshot.dateFormat === "MM/DD/YYYY" ? "DD-MM-YYYY" : "MM/DD/YYYY" });
          await page.evaluate((value) => localStorage.setItem("gerit.user-preferences.current", value), poisonedLegacy);
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(currentApiSnapshot.timeFormat ?? "24h"));
          const legacyAfterPreferencesReload = await page.evaluate(() => localStorage.getItem("gerit.user-preferences.current"));
          if (legacyAfterPreferencesReload !== null) throw new Error("UserPreferences did not remove the poisoned legacy cache on mount.");
          await page.evaluate((value) => localStorage.setItem("gerit.user-preferences.current", value), poisonedLegacy);
          return { detail: "Scoped cache key is tenant/user scoped and matches API values; poisoned global cache did not hydrate Preferences and was removed on hook mount." };
        });

        await recordStep(steps, "Dashboard ignores poisoned legacy cache", async () => {
          const currentApiSnapshot = await readPreference(page, userId!);
          const dashboardLink = page.getByTestId("hub-menu-root").getByRole("link", {
            name: dashboardSidebarAccessibleName,
            exact: true,
          });
          await expect(dashboardLink).toBeVisible();
          const dashboardAccessibleName = (await dashboardLink.innerText()).trim();
          await visualClick(page, dashboardLink);
          await expect(page).toHaveURL(/\/dashboards\/?$/);
          const dashboard = page.getByTestId("gerit-dashboard-home-root");
          await expect(dashboard).toBeVisible();
          await expect(dashboard.getByRole("button", { name: /calendar|calendário|calendario/i })).toBeVisible();
          const weekViewButton = dashboard.getByRole("button", { name: dashboardWeekAccessibleName, exact: true });
          await expect(weekViewButton).toBeVisible();
          const weekAccessibleName = (await weekViewButton.innerText()).trim();
          await visualClick(page, weekViewButton);
          const expectedTimeLabel = currentApiSnapshot.timeFormat === "12h" ? "12:00 AM" : "00:00";
          await expect(dashboard.getByText(expectedTimeLabel, { exact: true }).first()).toBeVisible();
          const legacy = await page.evaluate(() => localStorage.getItem("gerit.user-preferences.current"));
          if (!legacy) throw new Error("Poisoned legacy cache was unexpectedly unavailable for the dashboard regression check.");
          return { url: page.url(), detail: `DASHBOARD_CACHE_REGRESSION=PASS; sidebar accessible name: ${dashboardAccessibleName}; week control accessible name: ${weekAccessibleName}; dashboard rendered the authenticated scoped time format while a conflicting legacy value remained in storage.` };
        });

        await recordStep(steps, "Restore complete API snapshot and storage", async () => {
          const { accessibleName: settingsAccessibleName } = await expandParametrizationSection(page);
          const preferencesLink = sidebarPreferencesLink(page);
          await expect(preferencesLink).toBeVisible();
          const preferencesAccessibleName = (await preferencesLink.innerText()).trim();
          await visualClick(page, preferencesLink);
          await expect(page).toHaveURL(/\/preferences\/?$/);
          await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
          const emailTab = page.getByRole("tab", { name: /e-?mail|notific/i });
          const originalEmailValues = Object.fromEntries(
            emailCheckboxes.map(({ field }) => [field, preferenceSnapshot![field]]),
          ) as Record<(typeof emailCheckboxes)[number]["field"], boolean>;

          const initialTab = page.getByRole("tab", { name: /general|geral/i });
          await visualClick(page, initialTab);
          const current = await readPreference(page, userId!);
          if (current.locale !== preferenceSnapshot!.locale) {
            const { response } = await selectOption(
              page,
              languageAccessibleName,
              languageOption(originalGeneral.locale),
            );
            if (response.status() !== 200) throw new Error(`Restoring locale returned HTTP ${response.status()}.`);
          }
          const themeGroup = page.getByRole("radiogroup", { name: /theme|tema/i });
          if (current.appearance !== preferenceSnapshot!.appearance) {
            const originalTheme = preferenceSnapshot!.appearance ?? "light";
            const themeRadio = themeGroup.getByRole("radio", { name: originalTheme === "dark" ? /^(dark|escuro)/i : /^(light|claro)/i });
            const responsePromise = page.waitForResponse((response) => isFinalHttpResponse(response, "PUT", preferencePath));
            await visualClick(page, themeRadio);
            const response = await responsePromise;
            if (response.status() !== 200) throw new Error(`Restoring appearance returned HTTP ${response.status()}.`);
          }
          for (const [field, accessibleName, originalValue] of [
            ["currencyCode", currencyAccessibleName, originalGeneral.currencyCode],
            ["timezone", timezoneAccessibleName, originalGeneral.timezone],
            ["dateFormat", dateFormatAccessibleName, originalGeneral.dateFormat],
          ] as const) {
            const latest = await readPreference(page, userId!);
            if (latest[field] !== preferenceSnapshot![field]) {
              const { response } = await selectOption(
                page,
                accessibleName,
                new RegExp(originalValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
              );
              if (response.status() !== 200) throw new Error(`Restoring ${field} returned HTTP ${response.status()}.`);
            }
          }
          const originalTime = preferenceSnapshot!.timeFormat ?? "24h";
          if (current.timeFormat !== originalTime) {
            const { response } = await selectOption(page, timeFormatAccessibleName, timeFormatOption(originalTime), originalTime === "12h" ? "last" : "first");
            if (response.status() !== 200) throw new Error(`Restoring timeFormat returned HTTP ${response.status()}.`);
          }
          const originalStart = timeHHmm(preferenceSnapshot!.dayStart);
          const originalEnd = timeHHmm(preferenceSnapshot!.dayEnd);
          if (!originalStart || !originalEnd) throw new Error("Original day time values cannot be restored.");
          const currentAfterTime = await readPreference(page, userId!);
          if (timeHHmm(currentAfterTime.dayStart) !== originalStart) {
            const { response } = await selectOption(page, dayStartAccessibleName, new RegExp(`^${originalStart}$`));
            if (response.status() !== 200) throw new Error(`Restoring dayStart returned HTTP ${response.status()}.`);
          }
          if (timeHHmm(currentAfterTime.dayEnd) !== originalEnd) {
            const { response } = await selectOption(page, dayEndAccessibleName, new RegExp(`^${originalEnd}$`));
            if (response.status() !== 200) throw new Error(`Restoring dayEnd returned HTTP ${response.status()}.`);
          }
          await visualClick(page, emailTab);
          for (const item of emailCheckboxes) {
            const control = page.getByRole("checkbox", { name: item.name });
            const shouldBeChecked = originalEmailValues[item.field];
            await expect(control).toBeVisible();
            if ((await control.isChecked()) !== shouldBeChecked) {
              const responsePromise = page.waitForResponse((response) => isFinalHttpResponse(response, "PUT", preferencePath));
              await control.focus();
              await page.keyboard.press("Space");
              const response = await responsePromise;
              if (response.status() !== 200) throw new Error(`Restoring ${item.field} returned HTTP ${response.status()}.`);
            }
          }
          await visualClick(page, initialTab);
          await expect(initialTab).toHaveAttribute("aria-selected", "true");
          await page.evaluate(({ scopedKey, scopedValue, legacyValue }) => {
            if (scopedValue === null) localStorage.removeItem(scopedKey);
            else localStorage.setItem(scopedKey, scopedValue);
            if (legacyValue === null) localStorage.removeItem("gerit.user-preferences.current");
            else localStorage.setItem("gerit.user-preferences.current", legacyValue);
          }, { scopedKey: scopedCacheKey!, scopedValue: scopedCacheOriginal, legacyValue: legacyCacheOriginal });
          await page.reload({ waitUntil: "domcontentloaded" });
          const restored = await readPreference(page, userId!);
          if (restored.id !== preferenceSnapshot!.id) throw new Error("API cleanup returned a different preference record.");
          for (const key of ["appearance", "currencyCode", "locale", "timezone", "dateFormat"] as const) {
            if (restored[key] !== preferenceSnapshot![key]) throw new Error(`API snapshot cleanup failed for ${key}.`);
          }
          for (const item of emailCheckboxes) if (restored[item.field] !== originalEmailValues[item.field]) throw new Error(`API cleanup failed for ${item.field}.`);
          if (restored.timeFormat !== preferenceSnapshot!.timeFormat || timeHHmm(restored.dayStart) !== originalStart || timeHHmm(restored.dayEnd) !== originalEnd) throw new Error("General settings differ from the original API snapshot after cleanup.");
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(preferenceSnapshot!.timeFormat ?? "24h"));
          await expect(page.getByRole("radiogroup", { name: /theme|tema/i }).getByRole("radio", {
            name: originalGeneral.appearance === "dark" ? /^(dark|escuro)/i : /^(light|claro)/i,
          })).toHaveAttribute("aria-checked", "true");
          await expect(page.getByRole("combobox", { name: currencyAccessibleName })).toContainText(originalGeneral.currencyCode);
          await expect(page.getByRole("combobox", { name: timezoneAccessibleName })).toContainText(originalGeneral.timezone);
          await expect(page.getByRole("combobox", { name: dateFormatAccessibleName })).toContainText(originalGeneral.dateFormat);
          await expect(page.locator("html")).toHaveAttribute("lang", originalGeneral.locale);
          await expect(page.getByRole("combobox", { name: dayStartAccessibleName })).toContainText(originalStart);
          await expect(page.getByRole("combobox", { name: dayEndAccessibleName })).toContainText(originalEnd);
          await visualClick(page, emailTab);
          for (const item of emailCheckboxes) {
            await expect(page.getByRole("checkbox", { name: item.name })).toBeChecked({ checked: originalEmailValues[item.field] });
          }
          let finalStorage = await page.evaluate(({ scopedKey }) => ({ scoped: localStorage.getItem(scopedKey), legacy: localStorage.getItem("gerit.user-preferences.current") }), { scopedKey: scopedCacheKey! });
          if (finalStorage.scoped !== scopedCacheOriginal || finalStorage.legacy !== legacyCacheOriginal) {
            await page.evaluate(({ scopedKey, scopedValue, legacyValue }) => {
              if (scopedValue === null) localStorage.removeItem(scopedKey);
              else localStorage.setItem(scopedKey, scopedValue);
              if (legacyValue === null) localStorage.removeItem("gerit.user-preferences.current");
              else localStorage.setItem("gerit.user-preferences.current", legacyValue);
            }, { scopedKey: scopedCacheKey!, scopedValue: scopedCacheOriginal, legacyValue: legacyCacheOriginal });
            finalStorage = await page.evaluate(({ scopedKey }) => ({ scoped: localStorage.getItem(scopedKey), legacy: localStorage.getItem("gerit.user-preferences.current") }), { scopedKey: scopedCacheKey! });
          }
          if (finalStorage.scoped !== scopedCacheOriginal || finalStorage.legacy !== legacyCacheOriginal) throw new Error("Browser storage was not restored to its initial state.");
          const generalTab = page.getByRole("tab", { name: /general|geral/i });
          await visualClick(page, generalTab);
          await expect(generalTab).toHaveAttribute("aria-selected", "true");
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toHaveText(timeFormatOption(preferenceSnapshot!.timeFormat ?? "24h"));
          cleanup = "PASS";
          await page.screenshot({ path: resolve(reportDirectory, "05-canonical-cleanup.png"), fullPage: true });
          evidence.screenshots.push(".e2e-debug/user-preferences/05-canonical-cleanup.png");
          return { detail: `BACKEND_CLEANUP=PASS; STORAGE_CLEANUP=PASS; UI_CLEANUP=PASS; sidebar accessible names: ${settingsAccessibleName} → ${preferencesAccessibleName}.` };
        });

        await recordStep(steps, "Automation readiness", async () => {
          await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
          await expect(page.getByRole("combobox", { name: timeFormatAccessibleName })).toBeVisible();
          await expect(page.getByText(/preferences loaded and synchronized|preferências carregadas e sincronizadas|preferencias cargadas y sincronizadas/i)).toBeVisible();
        });
      } else {
        for (const name of ["Hydration from API", "Update timeFormat and confirm API response", "Persistence after reload", "DayStart HH:mm format and API-only payload", "Payload excludes userId and contains certified fields", "Local-only notification flags excluded", "Restore original values and verify cleanup", "Cleanup", "i18n", "Accessibility and keyboard operation", "Automation readiness"]) {
          steps.push({ name, outcome: "BLOCKED", durationMs: 0, detail: "Existing preference snapshot was unavailable." });
        }
      }

      steps.push({ name: "410 absence scenario", outcome: "NOT_EXECUTED", durationMs: 0, detail: "Unsafe to mutate shared E2E identity; absence behavior is covered by focused tests." });
    }
  } finally {
    const report = {
      capability: "UserPreferences",
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      branch: "feature/user-preferences",
      head: process.env.GIT_HEAD_FOR_E2E ?? "not-provided",
      buildId: process.env.E2E_BUILD_ID ?? "not-provided",
      serverStarts: 1,
      browserLaunches: 1,
      contexts: browser.contexts().length,
      pages: context.pages().length,
      loginAttempts: 1,
      identity: "tenant/user identifiers masked",
      cleanup,
      evidence,
      steps,
    };
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    await testInfo.attach("user-preferences-report", { path: outputPath, contentType: "application/json" });
  }

  expect(steps.filter((step) => step.outcome === "FAIL"), "UserPreferences journey failures").toEqual([]);
  expect(cleanup).toBe("PASS");
});
