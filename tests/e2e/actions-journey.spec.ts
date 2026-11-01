import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page, type Response, type TestInfo } from "@playwright/test";

type Outcome = "PASS" | "FAIL" | "RECOVERED" | "BLOCKED";
type StepResult = { area: string; name: string; outcome: Outcome; url: string; durationMs?: number; slow?: boolean; request?: string; status?: number; detail?: string };
type Action = { id: number; name: string; description: string; isActive: boolean };

const labels = {
  operations: /^(operations|operações|operaciones)$/i,
  administration: /^(administration|administração|administración)$/i,
  actions: /^(actions|ações|acciones)$/i,
  add: /^(add|adicionar|agregar)$/i,
  save: /^(save|guardar|salvar)$/i,
  edit: /^(edit|editar)$/i,
  back: /^(back|voltar|volver)$/i,
  activate: /^(activate|ativar|activar)$/i,
  deactivate: /^(deactivate|desativar|desactivar)$/i,
  delete: /^(delete|excluir|eliminar)$/i,
  name: /^(name|nome|nombre)$/i,
  description: /^(description|descrição|descripcion)$/i,
  search: /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i,
  active: /^(active|ativo|ativa|activa)$/i,
  inactive: /^(inactive|inativo|inativa|inactiva)$/i,
  columnName: /^(name|nome|nombre)$/i,
  columnStatus: /^(status|estado)$/i,
  columnActions: /^(actions|ações|acciones)$/i,
};

const baseURL = "http://127.0.0.1:3100";
const rawTranslationKey = /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/;
const ownedIds = new Set<number>();
const reportDirectory = resolve(".e2e-debug/actions-journey");
const allCreatedIds = new Set<number>();
const pageLossReasons = new WeakMap<Page, string>();

declare global {
  interface Window { __GERIT_E2E_FORM_SUBMIT__?: boolean; }
}

function pathOf(page: Page) {
  try { return new URL(page.url()).pathname; } catch { return "about:blank"; }
}

function safeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted token]")
    .replace(/(authorization|cookie|password|accessToken|refreshToken)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s)]+/g, "[URL redacted]")
    .slice(0, 400);
}

function responseMatching(page: Page, method: string, path: RegExp) {
  return page.waitForResponse((response) => {
    const status = response.status();
    let pathname = "";
    try { pathname = new URL(response.url()).pathname; } catch { return false; }
    return response.request().method() === method && path.test(pathname) && !(status >= 300 && status < 400);
  }, { timeout: 8_000 });
}

async function runStep(
  page: Page,
  testInfo: TestInfo,
  results: StepResult[],
  area: string,
  name: string,
  action: () => Promise<{ request?: string; status?: number; detail?: string } | void>,
  allowUnavailablePage = false,
) {
  const startedAt = Date.now();
  console.log(`[E2E] START: ${name}`);
  const pageLossReason = pageLossReasons.get(page);
  if ((pageLossReason || page.isClosed()) && !allowUnavailablePage) {
    const reason = pageLossReason ?? "Playwright page was already closed before this step.";
    pageLossReasons.set(page, reason);
    results.push({ area, name, outcome: "BLOCKED", url: pathOf(page), durationMs: 0, detail: `Page/context unavailable: ${reason}` });
    console.log(`[E2E] BLOCKED: ${name} - page unavailable: ${reason}`);
    return;
  }
  try {
    const result = await test.step(`${area}: ${name}`, action);
    const durationMs = Date.now() - startedAt;
    const slow = durationMs > 10_000;
    results.push({ area, name, outcome: "PASS", url: pathOf(page), durationMs, ...(slow ? { slow: true } : {}), ...(result ?? {}) });
    console.log(`[E2E] PASS: ${name} (${durationMs}ms${slow ? ", SLOW" : ""})`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const slow = durationMs > 10_000;
    const message = safeError(error);
    const failure = { area, name, outcome: "FAIL" as const, url: pathOf(page), durationMs, ...(slow ? { slow: true } : {}), detail: message };
    results.push(failure);
    console.log(`[E2E] FAIL: ${name} - ${message} (${durationMs}ms${slow ? ", SLOW" : ""})`);
    if (page.isClosed() || /target page, context or browser has been closed|test ended/i.test(message)) {
      pageLossReasons.set(page, message);
      return;
    }
    try {
      const filename = `${String(results.length).padStart(2, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      await page.screenshot({ path: resolve(reportDirectory, "screenshots", filename), fullPage: true, timeout: 5_000 });
      await testInfo.attach(filename, { path: resolve(reportDirectory, "screenshots", filename), contentType: "image/png" });
    } catch { /* Keep the original diagnostic when a page is unavailable. */ }
  }
}

function blocked(results: StepResult[], page: Page, area: string, name: string, dependency: string) {
  console.log(`[E2E] START: ${name}`);
  results.push({ area, name, outcome: "BLOCKED", url: pathOf(page), durationMs: 0, detail: `Blocked by ${dependency}` });
  console.log(`[E2E] BLOCKED: ${name} - dependency unavailable: ${dependency}`);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(reportDirectory, "screenshots", `${name}.png`), fullPage: true });
}

function actionRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

async function assertList(page: Page) {
  await expect(page.getByTestId("actions-page-root")).toBeVisible({ timeout: 8_000 });
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect.poll(() => table.getAttribute("aria-busy"), { timeout: 8_000 }).toBe("false");
  await expect(table.getByRole("columnheader", { name: labels.columnName })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: labels.columnStatus })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: labels.columnActions })).toBeVisible();
}

function menuSection(sidebar: Locator, label: RegExp) {
  const groupText = new RegExp(label.source.replace(/^\^/, "").replace(/\$$/, ""), label.flags);
  return sidebar.locator('[data-sidebar="group"]').filter({ hasText: groupText }).first();
}

async function sectionExpanded(section: Locator) {
  return (await section.locator('[data-sidebar="group-label"]').getAttribute("aria-expanded")) === "true";
}

async function assertNoRawKeys(page: Page) {
  const root = page.locator('[data-testid="actions-page-root"], [data-testid="actions-create-page-root"], [data-testid="action-details-page-root"]').filter({ visible: true }).first();
  const strings = await root.locator('button, a, [role="button"], [role="link"], label, h1, h2, h3, [role="alert"]')
    .evaluateAll((elements) => elements.filter((el) => el.getClientRects().length > 0).flatMap((el) => [el.textContent?.trim() ?? "", el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""]).filter(Boolean));
  const raw = strings.filter((text) => rawTranslationKey.test(text));
  expect(raw, "Raw translation keys must not be visible in Actions UI").toEqual([]);
  await expect(root.getByText("actions.actions.back", { exact: true })).toHaveCount(0);
  await expect(root.getByText(/^(undefined|null|\[object Object\])$/i)).toHaveCount(0);
}

function descriptionInput(page: Page) {
  return page.getByTestId("action-description-field").locator("textarea, input");
}

async function readCurrentAction(page: Page, id: number): Promise<Action> {
  const result = await apiCall(page, "GET", `/api/gerit/v1/actions/${id}`);
  if (result.status !== 200 || typeof result.body !== "object" || result.body === null) {
    throw new Error(`Pre-operation GET Action ${id} returned HTTP ${result.status}.`);
  }
  const value = result.body as Record<string, unknown>;
  if (typeof value.name !== "string" || typeof value.isActive !== "boolean") {
    throw new Error(`Pre-operation GET Action ${id} omitted name or isActive.`);
  }
  return { id, name: value.name, description: typeof value.description === "string" ? value.description : "", isActive: value.isActive };
}

async function ensureDetailState(page: Page, id: number, desiredActive: boolean) {
  const current = await readCurrentAction(page, id);
  if (current.isActive !== desiredActive) {
    const operation = desiredActive ? "activate" : "deactivate";
    const button = desiredActive ? labels.activate : labels.deactivate;
    await clickAndCheckMutation(page, button, "PATCH", new RegExp(`^/api/gerit/v1/actions/${id}/${operation}/?$`), 200);
    await expect(page.getByText(desiredActive ? labels.active : labels.inactive).first()).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  const persisted = await readCurrentAction(page, id);
  if (persisted.isActive !== desiredActive) throw new Error(`Action ${id} did not persist the ${desiredActive ? "Active" : "Inactive"} precondition.`);
  return persisted;
}

async function ensureGridState(page: Page, action: Action, desiredActive: boolean) {
  const current = await readCurrentAction(page, action.id);
  if (current.isActive !== desiredActive) {
    const row = actionRow(page, action.name);
    const operation = desiredActive ? "activate" : "deactivate";
    const button = desiredActive ? labels.activate : labels.deactivate;
    const responsePromise = responseMatching(page, "PATCH", new RegExp(`^/api/gerit/v1/actions/${action.id}/${operation}/?$`));
    await row.getByRole("button", { name: button }).click();
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error(`Grid precondition ${operation} returned HTTP ${response.status()}.`);
    await expect(row.getByRole("cell", { name: desiredActive ? labels.active : labels.inactive })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertList(page);
    await page.getByPlaceholder(labels.search).fill(action.name);
  }
  const persisted = await readCurrentAction(page, action.id);
  if (persisted.isActive !== desiredActive) throw new Error(`Grid Action ${action.id} was not ${desiredActive ? "Active" : "Inactive"} before the operation.`);
}

async function apiCall(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const session = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { accessToken?: string } | null;
    if (!session?.accessToken) throw new Error("Authenticated session is unavailable for the controlled API recovery.");
    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { method, path, body });
}

async function createViaApi(page: Page, name: string, description: string): Promise<Action> {
  const created = await apiCall(page, "POST", "/api/gerit/v1/actions/", { name, description });
  if (created.status !== 201 || typeof created.body !== "object" || created.body === null || typeof (created.body as { id?: unknown }).id !== "number") {
    throw new Error(`Controlled POST /api/gerit/v1/actions returned HTTP ${created.status} without a numeric ID.`);
  }
  const id = (created.body as { id: number }).id;
  ownedIds.add(id);
  allCreatedIds.add(id);
  const detail = await apiCall(page, "GET", `/api/gerit/v1/actions/${id}`);
  if (detail.status !== 200 || typeof detail.body !== "object" || detail.body === null) throw new Error(`Controlled GET Action ${id} returned HTTP ${detail.status}.`);
  const value = detail.body as Record<string, unknown>;
  return { id, name: String(value.name ?? name), description: String(value.description ?? description), isActive: value.isActive === true };
}

async function deleteViaApi(page: Page, id: number) {
  const response = await apiCall(page, "DELETE", `/api/gerit/v1/actions/${id}`);
  if (![200, 404, 410].includes(response.status)) throw new Error(`Cleanup DELETE Action ${id} returned HTTP ${response.status}.`);
}

async function assertActionDetail(page: Page, action: Action, description = action.description) {
  await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("action-name-value")).toHaveText(action.name);
  const descriptionControl = descriptionInput(page);
  const fieldCount = await page.getByTestId("action-description-field").count();
  const controlCount = await descriptionControl.count();
  if (fieldCount === 0) throw new Error("Description diagnosis: field was not rendered in the detail DOM.");
  if (controlCount === 0) throw new Error("Description diagnosis: labeled field rendered but has no input or textarea control.");
  await expect(descriptionControl).toBeVisible();
  await expect(descriptionControl).toHaveValue(description);
  await expect(page.getByLabel(labels.name)).toHaveCount(0);
  await expect(page.getByText(action.isActive ? labels.active : labels.inactive).first()).toBeVisible();
  await expect(page.getByRole("button", { name: labels.back }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: action.isActive ? labels.deactivate : labels.activate })).toBeVisible();
  await expect(page.getByRole("button", { name: labels.delete })).toBeVisible();
  await expect(page.getByLabel(/^(code|código)$/i)).toHaveCount(0);
  const nameBox = await page.getByTestId("action-name-field").boundingBox();
  const descBox = await page.getByTestId("action-description-field").boundingBox();
  const sectionBox = await page.getByTestId("action-fields-section").boundingBox();
  if (!nameBox || !descBox || !sectionBox || descBox.y <= nameBox.y || descBox.width < sectionBox.width * 0.85) {
    throw new Error("Description must appear below Name and use the available content width.");
  }
  await assertNoRawKeys(page);
}

async function clickAndCheckMutation(page: Page, button: RegExp, method: string, path: RegExp, status: number) {
  const responsePromise = responseMatching(page, method, path);
  await page.getByRole("button", { name: button }).click();
  const response = await responsePromise;
  if (response.status() !== status) throw new Error(`${method} ${new URL(response.url()).pathname} returned HTTP ${response.status()}, expected ${status}.`);
  return response;
}

function actionStatusMessage(operation: "activate" | "deactivate", locale: string | null) {
  const messages: Record<string, { activate: RegExp; deactivate: RegExp }> = {
    "en-US": { activate: /Action activated successfully\./i, deactivate: /Action deactivated successfully\./i },
    "es-ES": { activate: /Acción activada correctamente\./i, deactivate: /Acción desactivada correctamente\./i },
    "pt-BR": { activate: /Ação ativada com sucesso\./i, deactivate: /Ação desativada com sucesso\./i },
    "pt-PT": { activate: /Ação ativada com sucesso\./i, deactivate: /Ação desativada com sucesso\./i },
  };
  return (messages[locale ?? ""] ?? messages["en-US"])[operation];
}

async function assertActionStatusToast(page: Page, operation: "activate" | "deactivate") {
  const expectedMessage = actionStatusMessage(operation, await page.locator("html").getAttribute("lang"));
  const statusElements = page.getByRole("status");
  const observations = await statusElements.evaluateAll((elements) => elements.map((element) => {
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const clipped = style.clip !== "auto" || style.clipPath !== "none";
    return {
      tag: element.tagName.toLowerCase(),
      state: element.getAttribute("data-state"),
      ariaLive: element.getAttribute("aria-live"),
      visuallyHidden: clipped || (style.position === "absolute" && bounds.width <= 1 && bounds.height <= 1),
      text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 180) ?? "",
    };
  }));
  console.log(`[E2E] status elements after ${operation}: ${JSON.stringify(observations)}`);

  // Radix exposes the visible toast as a status with data-state=open. It also
  // briefly renders a separate VisuallyHidden status announcer with the same
  // message; selecting by role + open state + the expected operation message
  // targets the visual toast without relying on result ordering.
  const operationToast = statusElements
    .and(page.locator('[data-state="open"]'))
    .filter({ hasText: expectedMessage });
  await expect(operationToast).toHaveCount(1);
  await expect(operationToast).toBeVisible();
  await expect(operationToast).toContainText(expectedMessage);
}

async function repeatStatusMutation(page: Page, action: Action, operation: "activate" | "deactivate", surface: "Detail" | "Grid") {
  const activeAfterFirstOperation = operation === "activate";
  const current = await readCurrentAction(page, action.id);
  if (current.isActive !== activeAfterFirstOperation) {
    throw new Error(`${surface} idempotency precondition failed: Action ${action.id} is not ${activeAfterFirstOperation ? "Active" : "Inactive"}.`);
  }

  const sameOperationButton = operation === "activate" ? labels.activate : labels.deactivate;
  const alternateButton = operation === "activate" ? labels.deactivate : labels.activate;
  if (surface === "Detail") {
    await expect(page.getByRole("button", { name: sameOperationButton })).toHaveCount(0);
    await expect(page.getByRole("button", { name: alternateButton })).toBeVisible();
  } else {
    const row = actionRow(page, action.name);
    await expect(row.getByRole("button", { name: sameOperationButton })).toHaveCount(0);
    await expect(row.getByRole("button", { name: alternateButton })).toBeVisible();
  }

  const path = `/api/gerit/v1/actions/${action.id}/${operation}`;
  const repeated = await apiCall(page, "PATCH", path);
  if (repeated.status !== 200) throw new Error(`Repeated ${surface} ${operation} returned HTTP ${repeated.status}, expected 200.`);
  const persisted = await readCurrentAction(page, action.id);
  if (persisted.isActive !== activeAfterFirstOperation) {
    throw new Error(`Repeated ${surface} ${operation} changed the Action away from ${activeAfterFirstOperation ? "Active" : "Inactive"}.`);
  }

  if (surface === "Detail") {
    await expect(page.getByText(activeAfterFirstOperation ? labels.active : labels.inactive).first()).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: alternateButton })).toBeVisible();
  } else {
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertList(page);
    await page.getByPlaceholder(labels.search).fill(action.name);
    const row = actionRow(page, action.name);
    await expect(row.getByRole("cell", { name: activeAfterFirstOperation ? labels.active : labels.inactive })).toBeVisible();
    await expect(row.getByRole("button", { name: alternateButton })).toBeVisible();
  }
}

test("Actions complete business and UI journey", async ({ page, context, request }, testInfo) => {
  test.setTimeout(900_000);
  const startedAt = Date.now();
  const results: StepResult[] = [];
  const authDiagnostic = { hydrated: false, emailFilled: false, passwordFilled: false, submitObserved: false, requestObserved: false, responseStatus: null as number | null, sessionValid: false, homeVisible: false, fallbackUsed: false, consoleErrors: [] as string[], pageErrors: [] as string[] };
  let main: Action | null = null;
  let secondary: Action | null = null;
  let staleA: Action | null = null;
  let staleB: Action | null = null;
  let initialLocale: string | null = null;
  let descriptionDiagnosis = "not inspected";
  let cleanupAccessToken: string | null = null;
  const e2eEmail = process.env.E2E_USER_EMAIL;
  const e2ePassword = process.env.E2E_USER_PASSWORD;
  await mkdir(resolve(reportDirectory, "screenshots"), { recursive: true });

  page.on("console", (message) => { if (message.type() === "error") authDiagnostic.consoleErrors.push(safeError(message.text())); });
  page.on("pageerror", (error) => authDiagnostic.pageErrors.push(safeError(error)));
  let browserLaunches = 1;
  let loginUiAttempts = 0;
  const serverStarts = 1;

  await runStep(page, testInfo, results, "Auth", "Login UI", async () => {
    if (!e2eEmail || !e2ePassword) throw new Error("E2E_USER_EMAIL and E2E_USER_PASSWORD must be configured in process environment or .env.e2e.local.");
    loginUiAttempts += 1;
  await page.addInitScript((visual) => {
      window.__GERIT_E2E_DIAGNOSTICS__ = true;
      if (!visual) return;
      const install = () => {
        if (document.getElementById("gerit-e2e-pointer-style")) return;
        const style = document.createElement("style");
        style.id = "gerit-e2e-pointer-style";
        style.textContent = "#gerit-e2e-pointer{position:fixed;z-index:2147483647;left:0;top:0;width:20px;height:20px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:opacity .08s ease;box-shadow:0 0 0 4px rgba(255,59,48,.22)}#gerit-e2e-pointer.visible{opacity:.9}#gerit-e2e-pointer.clicked{animation:gerit-e2e-click .45s ease-out}@keyframes gerit-e2e-click{0%{box-shadow:0 0 0 3px rgba(255,59,48,.45);transform:translate(-50%,-50%) scale(.8)}100%{box-shadow:0 0 0 15px rgba(255,59,48,0);transform:translate(-50%,-50%) scale(1.2)}}";
        document.head.appendChild(style);
        const pointer = document.createElement("div");
        pointer.id = "gerit-e2e-pointer";
        document.body.appendChild(pointer);
        document.addEventListener("mousemove", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; pointer.classList.add("visible"); });
        document.addEventListener("click", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; pointer.classList.remove("clicked"); void pointer.offsetWidth; pointer.classList.add("clicked"); });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
    }, process.env.E2E_VISUAL === "true");
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    const root = page.getByTestId("login-screen-root");
    await expect(root).toHaveAttribute("data-hydrated", "true", { timeout: 10_000 });
    authDiagnostic.hydrated = true;
    await screenshot(page, "01-login");
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    const submit = page.locator('form button[type="submit"]');
    await expect(email).toHaveCount(1); await expect(email).toBeVisible(); await expect(email).toBeEnabled();
    await expect(password).toHaveCount(1); await expect(password).toBeVisible(); await expect(password).toBeEnabled();
    await expect(submit).toHaveCount(1); await expect(submit).toBeVisible(); await expect(submit).toBeEnabled();
    await page.evaluate(() => {
      const form = document.querySelector("form");
      form?.addEventListener("submit", () => { window.__GERIT_E2E_FORM_SUBMIT__ = true; }, { once: true });
    });
    await email.fill(e2eEmail);
    await password.fill(e2ePassword);
    authDiagnostic.emailFilled = (await email.inputValue()) === e2eEmail;
    authDiagnostic.passwordFilled = (await password.inputValue()) === e2ePassword;
    if (!authDiagnostic.emailFilled || !authDiagnostic.passwordFilled) throw new Error("Login form values did not remain in the inputs after filling.");
    const responsePromise = page.waitForResponse((response) => {
      const status = response.status();
      return /^\/api\/auth\/login\/?$/.test(new URL(response.url()).pathname) && response.request().method() === "POST" && !(status >= 300 && status < 400);
    }, { timeout: 6_000 }).catch(() => null);
    await submit.click();
    authDiagnostic.submitObserved = await page.evaluate(() => Boolean(window.__GERIT_E2E_FORM_SUBMIT__));
    const response = await responsePromise;
    if (response) {
      authDiagnostic.requestObserved = true;
      authDiagnostic.responseStatus = response.status();
      if (response.status() !== 200) throw new Error(`POST /api/auth/login returned HTTP ${response.status()}.`);
    } else {
      throw new Error("Submit occurred but POST /api/auth/login was not observed.");
    }
    authDiagnostic.sessionValid = await page.evaluate(() => {
      try {
        const value = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null");
        return Boolean(value && typeof value.accessToken === "string" && value.accessToken.length > 0 && typeof value.refreshToken === "string" && Number.isFinite(Date.parse(value.accessTokenExpiresAt)) && Number.isFinite(Date.parse(value.refreshTokenExpiresAt)) && typeof value.tenantId === "number");
      } catch { return false; }
    });
    if (authDiagnostic.sessionValid) cleanupAccessToken = await page.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { accessToken?: string } | null)?.accessToken ?? null; } catch { return null; }
    });
    await expect(page).toHaveURL(`${baseURL}/`, { timeout: 10_000 });
    await expect(page.getByTestId("workspace-shell-root")).toBeVisible({ timeout: 10_000 });
    authDiagnostic.homeVisible = true;
    initialLocale = await page.evaluate(() => localStorage.getItem("language"));
    return { request: "POST /api/auth/login", status: response.status(), detail: "HTTP 200; session persisted; authenticated shell visible" };
  });

  if (!authDiagnostic.homeVisible && e2eEmail && e2ePassword) {
    await runStep(page, testInfo, results, "Auth", "Real API fallback after Login UI failure", async () => {
      const fallback = await page.evaluate(async ({ email, password }) => {
        const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        const valid = Boolean(payload && typeof payload.accessToken === "string" && payload.accessToken && typeof payload.refreshToken === "string" && payload.refreshToken && Number.isFinite(Date.parse(String(payload.accessTokenExpiresAt))) && Number.isFinite(Date.parse(String(payload.refreshTokenExpiresAt))) && typeof payload.userId === "number" && typeof payload.tenantId === "number" && typeof payload.email === "string");
        if (response.status === 200 && valid) localStorage.setItem("gerit.auth.session.v1", JSON.stringify(payload));
        return { status: response.status, valid };
      }, { email: e2eEmail, password: e2ePassword });
      if (fallback.status !== 200 || !fallback.valid) throw new Error(`Real API fallback POST /api/auth/login returned HTTP ${fallback.status} or an invalid AuthSession shape.`);
      authDiagnostic.fallbackUsed = true;
      authDiagnostic.responseStatus = fallback.status;
      authDiagnostic.sessionValid = true;
      await page.goto("/", { waitUntil: "domcontentloaded" });
      cleanupAccessToken = await page.evaluate(() => {
        try { return (JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { accessToken?: string } | null)?.accessToken ?? null; } catch { return null; }
      });
      initialLocale = await page.evaluate(() => localStorage.getItem("language"));
      await expect(page.getByTestId("workspace-shell-root")).toBeVisible({ timeout: 10_000 });
      authDiagnostic.homeVisible = true;
      results.push({ area: "Auth", name: "Login API fallback", outcome: "RECOVERED", url: pathOf(page), request: "POST /api/auth/login", status: fallback.status, detail: "Real API session persisted; Login UI remains FAIL." });
      console.log("[E2E] RECOVERED: Login API fallback (Login UI remains FAIL)");
      return { request: "POST /api/auth/login", status: fallback.status, detail: "Fallback authenticated the same page; Login UI remains failed." };
    });
  }

  await runStep(page, testInfo, results, "Navigation", "Home and workspace", async () => {
    await expect(page.getByTestId("workspace-shell-root")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("gerit-dashboard-home-root")).toBeVisible({ timeout: 8_000 });
    authDiagnostic.homeVisible = true;
    await screenshot(page, "02-home");
  });

  const sidebar = page.getByTestId("desktop-sidebar");
  const operationsSection = menuSection(sidebar, labels.operations);
  const administrationSection = menuSection(sidebar, labels.administration);
  const operationsHeading = sidebar.getByRole("button", { name: labels.operations });
  const administrationHeading = sidebar.getByRole("button", { name: labels.administration });
  const actionsLink = administrationSection.getByRole("link", { name: labels.actions });
  await runStep(page, testInfo, results, "Navigation", "Initial accordion state", async () => {
    await expect(sidebar).toBeVisible();
    const operationsOpen = await sectionExpanded(operationsSection);
    const administrationOpen = await sectionExpanded(administrationSection);
    await expect(operationsHeading).toHaveAccessibleName(labels.operations);
    await expect(operationsHeading).toHaveAttribute("aria-expanded", String(operationsOpen));
    await expect(administrationHeading).toHaveAccessibleName(labels.administration);
    await expect(administrationHeading).toHaveAttribute("aria-expanded", String(administrationOpen));
    for (const heading of [operationsHeading, administrationHeading]) {
      const controlledId = await heading.getAttribute("aria-controls");
      expect(controlledId).toBeTruthy();
      await expect(sidebar.locator(`[id="${controlledId}"]`)).toHaveAttribute("data-sidebar", "group-content");
    }
    await operationsHeading.focus();
    await operationsHeading.press("Space");
    await expect(operationsHeading).toHaveAttribute("aria-expanded", "false");
    await operationsHeading.press("Enter");
    await expect(operationsHeading).toHaveAttribute("aria-expanded", "true");
    return { detail: `Initial state recorded: Operations=${operationsOpen ? "expanded" : "collapsed"}; Administration=${administrationOpen ? "expanded" : "collapsed"}.` };
  });
  await runStep(page, testInfo, results, "Navigation", "Open Administration", async () => {
    if (await sectionExpanded(administrationSection)) await administrationHeading.click();
    await administrationHeading.click();
    if (!(await sectionExpanded(administrationSection))) throw new Error("Administration did not expand after its visible heading was clicked.");
    await expect(administrationSection.getByRole("link").first()).toBeVisible();
    await expect(actionsLink).toBeVisible();
    if (await sectionExpanded(operationsSection)) throw new Error("Operations remained expanded when Administration opened.");
    await screenshot(page, "03-administration-open");
  });
  await runStep(page, testInfo, results, "Navigation", "Open Operations", async () => {
    if (await sectionExpanded(operationsSection)) await operationsHeading.click();
    await operationsHeading.click();
    if (!(await sectionExpanded(operationsSection))) throw new Error("Operations did not expand after its visible heading was clicked.");
    await expect(operationsSection.getByRole("link").first()).toBeVisible();
    if (await sectionExpanded(administrationSection)) throw new Error("Administration remained expanded when Operations opened.");
    await screenshot(page, "03-operations-open");
  });
  await runStep(page, testInfo, results, "Navigation", "Open Administration (closes Operations)", async () => {
    await administrationHeading.click();
    if (!(await sectionExpanded(administrationSection))) throw new Error("Administration did not expand after clicking its heading.");
    if (await sectionExpanded(operationsSection)) throw new Error("Operations did not collapse when Administration opened.");
    await expect(actionsLink).toBeVisible();
  });
  await runStep(page, testInfo, results, "Navigation", "Close Administration", async () => {
    await administrationHeading.click();
    if (await sectionExpanded(administrationSection)) throw new Error("Administration remained expanded after its heading was clicked again.");
  });
  await runStep(page, testInfo, results, "Navigation", "Reopen Administration", async () => {
    await administrationHeading.click();
    if (!(await sectionExpanded(administrationSection))) throw new Error("Administration did not reopen.");
    await expect(administrationSection.getByRole("link").first()).toBeVisible();
    await expect(actionsLink).toBeVisible();
  });
  await runStep(page, testInfo, results, "Navigation", "Click Actions", async () => {
    await actionsLink.click();
  });
  await runStep(page, testInfo, results, "Navigation", "Route /actions/", async () => {
    const menuFailure = results.find((item) => item.area === "Navigation" && item.outcome === "FAIL");
    if (menuFailure) throw new Error(`Actions navigation remains FAIL because accordion step '${menuFailure.name}' failed; a direct-route recovery cannot change that result.`);
    await expect(page).toHaveURL(/\/actions\/?$/);
    await expect(page.getByTestId("actions-page-root")).toBeVisible();
    await assertList(page);
    await screenshot(page, "04-actions-list");
  });
  if (!(await page.getByTestId("actions-page-root").isVisible().catch(() => false))) {
    await runStep(page, testInfo, results, "Navigation", "Recovery: Actions route after menu failure", async () => {
      await page.goto("/actions/", { waitUntil: "domcontentloaded" });
      await assertList(page);
      return { detail: "Direct route used only as recovery after visible-menu navigation failed." };
    });
  }

  if (process.env.E2E_MENU_SMOKE_ONLY === "true") {
    const navigationFailures = results.filter((item) => item.area === "Navigation" && item.outcome === "FAIL");
    console.log(`[E2E menu smoke] ${JSON.stringify({
      results: results.filter((item) => item.area === "Navigation"),
      navigationFailures: navigationFailures.length,
      finalPath: pathOf(page),
    })}`);
    expect(navigationFailures, "Sidebar navigation smoke must pass each visible UI step").toEqual([]);
    return;
  }

  await runStep(page, testInfo, results, "CRUD", "List, filters, accessibility, no Code and no raw i18n", async () => {
    await assertList(page);
    await expect(page.getByPlaceholder(labels.search)).toBeVisible();
    await expect(page.getByRole("table").getByRole("columnheader", { name: /^Code$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: labels.add })).toBeVisible();
    await expect(page.locator('input[type="file"][accept=".csv"]')).toHaveCount(1);
    await assertNoRawKeys(page);
  });

  const actionName = `E2E Actions ${randomUUID()}`;
  const originalDescription = `E2E description ${randomUUID()}`;
  const updatedDescription = `E2E updated description ${randomUUID()}`;
  await runStep(page, testInfo, results, "CRUD", "Open create form and validate fields", async () => {
    await page.getByRole("button", { name: labels.add }).click();
    await expect(page).toHaveURL(/\/actions\/new\/?$/);
    await expect(page.getByTestId("actions-create-page-root")).toBeVisible();
    const name = page.getByLabel(labels.name);
    const description = descriptionInput(page);
    await expect(name).toHaveAttribute("required", "");
    await expect(name).toHaveAttribute("maxlength", "50");
    await expect(description).toHaveAttribute("required", "");
    await expect(description).toHaveAttribute("maxlength", "255");
    await expect(page.getByLabel(/^Code$/i)).toHaveCount(0);
    await name.fill(actionName);
    await description.fill(originalDescription);
    await screenshot(page, "05-create-form");
    await assertNoRawKeys(page);
  });
  if (!(await page.getByTestId("actions-create-page-root").isVisible().catch(() => false)) && authDiagnostic.homeVisible) {
    await runStep(page, testInfo, results, "CRUD", "Recovery: open create form", async () => {
      await page.goto("/actions/new/", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("actions-create-page-root")).toBeVisible();
      await page.getByLabel(labels.name).fill(actionName);
      await descriptionInput(page).fill(originalDescription);
    });
  }

  await runStep(page, testInfo, results, "CRUD", "Create Action through UI (POST 201)", async () => {
    const responsePromise = responseMatching(page, "POST", /^\/api\/gerit\/v1\/actions\/?$/);
    await page.getByRole("button", { name: labels.save }).click();
    const response = await responsePromise;
    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    if (response.status() !== 201) throw new Error(`POST /api/gerit/v1/actions returned HTTP ${response.status()}, expected 201.`);
    if (typeof payload?.id !== "number") throw new Error("Create response did not contain a numeric id.");
    main = { id: payload.id, name: actionName, description: originalDescription, isActive: true };
    ownedIds.add(main.id);
    allCreatedIds.add(main.id);
    const requestPayload = response.request().postDataJSON() as Record<string, unknown>;
    if (JSON.stringify(requestPayload) !== JSON.stringify({ name: actionName, description: originalDescription })) throw new Error("Create payload must contain exactly name and description.");
    await expect(page).toHaveURL(new RegExp(`/actions/${main.id}/?$`));
    await expect(page.getByTestId("action-details-page-root")).toBeVisible();
    return { request: "POST /api/gerit/v1/actions/", status: response.status(), detail: `Created ID ${main.id}` };
  });
  if (!main && authDiagnostic.sessionValid) {
    await runStep(page, testInfo, results, "CRUD", "Create recovery via real Actions API", async () => {
      main = await createViaApi(page, actionName, originalDescription);
      await page.goto(`/actions/${main.id}/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("action-details-page-root")).toBeVisible();
      results.push({ area: "CRUD", name: "Create UI", outcome: "FAIL", url: pathOf(page), request: "POST /api/gerit/v1/actions/", status: 201, detail: "UI create failed; API recovery created an owned record." });
      return { request: "POST /api/gerit/v1/actions/", status: 201, detail: `Recovery ID ${main.id}; original Create UI failure retained.` };
    });
  }
  if (main && !(await page.getByTestId("action-details-page-root").isVisible().catch(() => false))) {
    await runStep(page, testInfo, results, "CRUD", "Recovery: open created detail", async () => {
      await page.goto(`/actions/${main!.id}/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("action-details-page-root")).toBeVisible();
    });
  }

  if (main) {
    await runStep(page, testInfo, results, "CRUD", "Read detail, ID, status, layout and no Code", async () => {
      const apiDetail = await readCurrentAction(page, main!.id);
      const field = page.getByTestId("action-description-field");
      const control = descriptionInput(page);
      const fieldCount = await field.count();
      const controlCount = await control.count();
      const renderedTag = controlCount ? await control.evaluate((element) => element.tagName.toLowerCase()) : "none";
      descriptionDiagnosis = fieldCount === 0
        ? "Description field was not rendered."
        : controlCount === 0
          ? "Description label rendered without an input/textarea control."
          : apiDetail.description === main!.description
            ? `Description exists in API and UI as <${renderedTag}>; the prior failure was the getByLabel selector, so the existing field test id is used.`
            : `Description exists in API but differs from the UI value in <${renderedTag}>.`;
      console.log(`[E2E] Description diagnosis: ${descriptionDiagnosis}`);
      main = { ...main!, ...apiDetail };
      await assertActionDetail(page, main!);
      await expect(page.getByRole("heading", { name: main!.name, exact: true })).toBeVisible();
      await screenshot(page, "06-detail");
    });
    await runStep(page, testInfo, results, "Navigation", "Back to list and locate Action", async () => {
      await page.getByRole("button", { name: labels.back }).first().click();
      await expect(page).toHaveURL(/\/actions\/?$/);
      await assertList(page);
      await page.getByPlaceholder(labels.search).fill(main!.name);
      await expect(actionRow(page, main!.name)).toBeVisible();
    });
    if (!(await page.getByTestId("actions-page-root").isVisible().catch(() => false))) {
      await runStep(page, testInfo, results, "Navigation", "Recovery: Actions list", async () => {
        await page.goto("/actions/", { waitUntil: "domcontentloaded" }); await assertList(page); await page.getByPlaceholder(labels.search).fill(main!.name); await expect(actionRow(page, main!.name)).toBeVisible();
      });
    }
    await runStep(page, testInfo, results, "CRUD", "Open edit from row and update only Description", async () => {
      const row = actionRow(page, main!.name);
      await row.getByRole("button", { name: labels.edit }).click();
      await expect(page).toHaveURL(new RegExp(`/actions/${main!.id}/?$`));
      await expect(page.getByLabel(labels.name)).toHaveCount(0);
      await descriptionInput(page).fill(updatedDescription);
      const responsePromise = responseMatching(page, "PUT", new RegExp(`^/api/gerit/v1/actions/${main!.id}/?$`));
      await page.getByRole("button", { name: labels.save }).click();
      const response = await responsePromise;
      if (response.status() !== 200) throw new Error(`PUT Action returned HTTP ${response.status()}.`);
      if (JSON.stringify(response.request().postDataJSON()) !== JSON.stringify({ description: updatedDescription })) throw new Error("PUT payload was not exactly { description }.");
      main!.description = updatedDescription;
      await expect(page).toHaveURL(/\/actions\/?$/);
      await screenshot(page, "07-updated");
      return { request: `PUT /api/gerit/v1/actions/${main!.id}`, status: response.status() };
    });
    await runStep(page, testInfo, results, "CRUD", "Reopen and verify Description persisted", async () => {
      if (!(await page.getByTestId("actions-page-root").isVisible().catch(() => false))) await page.goto("/actions/", { waitUntil: "domcontentloaded" });
      await assertList(page); await page.getByPlaceholder(labels.search).fill(main!.name);
      await actionRow(page, main!.name).getByRole("button", { name: labels.edit }).click();
      await assertActionDetail(page, main!, updatedDescription);
      await expect(page.getByTestId("action-name-value")).toHaveText(main!.name);
    });

    for (const operation of ["deactivate", "activate"] as const) {
      const targetActive = operation === "activate";
      const label = targetActive ? labels.activate : labels.deactivate;
      const operationName = targetActive ? "Activate on Detail" : "Deactivate on Detail";
      await runStep(page, testInfo, results, "Detail", `${targetActive ? "Ensure Inactive" : "Ensure Active"} before ${operationName}`, async () => {
        main = await ensureDetailState(page, main!.id, !targetActive);
        return { request: `GET /api/gerit/v1/actions/${main!.id}`, detail: `Precondition verified: ${main!.isActive ? "Active" : "Inactive"}; incompatible toggle is not sent.` };
      });
      await runStep(page, testInfo, results, "Detail", operationName, async () => {
        const before = await readCurrentAction(page, main!.id);
        if (before.isActive === targetActive) throw new Error(`Cannot ${operation} while Action is already ${targetActive ? "Active" : "Inactive"}.`);
        const response = await clickAndCheckMutation(page, label, "PATCH", new RegExp(`^/api/gerit/v1/actions/${main!.id}/${operation}/?$`), 200);
        main!.isActive = targetActive;
        await expect(page.getByText(targetActive ? labels.active : labels.inactive).first()).toBeVisible();
        await expect(page.getByRole("button", { name: targetActive ? labels.deactivate : labels.activate })).toBeVisible();
        await assertActionStatusToast(page, operation);
        await screenshot(page, targetActive ? "09-active-detail" : "08-inactive-detail");
        return { request: `PATCH /api/gerit/v1/actions/${main!.id}/${operation}`, status: response.status() };
      });
      await runStep(page, testInfo, results, "Detail", `${targetActive ? "Active" : "Inactive"} persists after reload`, async () => {
        const responsePromise = responseMatching(page, "GET", new RegExp(`^/api/gerit/v1/actions/${main!.id}/?$`));
        await page.reload({ waitUntil: "domcontentloaded" });
        const response = await responsePromise;
        if (response.status() !== 200) throw new Error(`Reload detail GET returned HTTP ${response.status()}.`);
        await expect(page.getByText(targetActive ? labels.active : labels.inactive).first()).toBeVisible();
      });
      await runStep(page, testInfo, results, "Detail", `${targetActive ? "Activate" : "Deactivate"} idempotency`, async () => {
        await repeatStatusMutation(page, main!, operation, "Detail");
        return {
          request: `PATCH /api/gerit/v1/actions/${main!.id}/${operation}`,
          status: 200,
          detail: `The detail UI switches to ${targetActive ? "Deactivate" : "Activate"} after the first success, so the same operation was repeated through the authenticated same-origin proxy and state remained ${targetActive ? "Active" : "Inactive"}.`,
        };
      });
    }

    await runStep(page, testInfo, results, "Detail", "Delete a second Action through detail", async () => {
      if (!authDiagnostic.sessionValid) throw new Error("No authenticated session is available to create the detail-delete Action.");
      secondary = await createViaApi(page, `E2E delete ${randomUUID()}`, `detail delete ${randomUUID()}`);
      await page.goto(`/actions/${secondary.id}/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("action-details-page-root")).toBeVisible();
      await page.getByRole("button", { name: labels.delete }).click();
      const dialog = page.getByRole("alertdialog"); await expect(dialog).toBeVisible(); await expect(dialog).toContainText(secondary.name); await screenshot(page, "12-delete-detail-modal");
      const responsePromise = responseMatching(page, "DELETE", new RegExp(`^/api/gerit/v1/actions/${secondary.id}/?$`));
      await dialog.getByRole("button", { name: labels.delete }).click();
      const response = await responsePromise;
      if (response.status() !== 200) throw new Error(`Detail DELETE returned HTTP ${response.status()}.`);
      await expect(page).toHaveURL(/\/actions\/?$/);
      const detail = await apiCall(page, "GET", `/api/gerit/v1/actions/${secondary.id}`);
      if (detail.status !== 410) throw new Error(`GET deleted detail returned HTTP ${detail.status}, expected 410.`);
      ownedIds.delete(secondary.id);
      return { request: `DELETE /api/gerit/v1/actions/${secondary.id}`, status: response.status(), detail: "Detail delete confirmed; subsequent detail GET returned 410." };
    });

    await runStep(page, testInfo, results, "Grid", "Deactivate through grid and persist", async () => {
      if (!(await page.getByTestId("actions-page-root").isVisible().catch(() => false))) await page.getByRole("button", { name: labels.back }).first().click();
      await assertList(page); await page.getByPlaceholder(labels.search).fill(main!.name);
      await ensureGridState(page, main!, true);
      const row = actionRow(page, main!.name);
      const before = await readCurrentAction(page, main!.id);
      if (!before.isActive) throw new Error("Grid Deactivate requires the current Action to be Active.");
      const response = await clickAndCheckMutation(page, labels.deactivate, "PATCH", new RegExp(`^/api/gerit/v1/actions/${main!.id}/deactivate/?$`), 200);
      main!.isActive = false;
      await expect(row.getByRole("cell", { name: labels.inactive })).toBeVisible(); await screenshot(page, "10-inactive-grid");
      await page.reload({ waitUntil: "domcontentloaded" }); await assertList(page); await page.getByPlaceholder(labels.search).fill(main!.name); await expect(actionRow(page, main!.name).getByRole("cell", { name: labels.inactive })).toBeVisible();
      return { request: `PATCH /api/gerit/v1/actions/${main!.id}/deactivate`, status: response.status() };
    });
    await runStep(page, testInfo, results, "Grid", "Deactivate idempotency", async () => {
      await repeatStatusMutation(page, main!, "deactivate", "Grid");
      return {
        request: `PATCH /api/gerit/v1/actions/${main!.id}/deactivate`,
        status: 200,
        detail: "The grid changes its row action to Activate after deactivation; the repeated Deactivate used the authenticated same-origin proxy and the row remained Inactive.",
      };
    });
    await runStep(page, testInfo, results, "Grid", "Activate through grid and persist", async () => {
      await ensureGridState(page, main!, false);
      const row = actionRow(page, main!.name);
      const before = await readCurrentAction(page, main!.id);
      if (before.isActive) throw new Error("Grid Activate requires the current Action to be Inactive.");
      const response = await clickAndCheckMutation(page, labels.activate, "PATCH", new RegExp(`^/api/gerit/v1/actions/${main!.id}/activate/?$`), 200);
      main!.isActive = true;
      await expect(row.getByRole("cell", { name: labels.active })).toBeVisible(); await screenshot(page, "11-active-grid");
      await page.reload({ waitUntil: "domcontentloaded" }); await assertList(page); await page.getByPlaceholder(labels.search).fill(main!.name); await expect(actionRow(page, main!.name).getByRole("cell", { name: labels.active })).toBeVisible();
      return { request: `PATCH /api/gerit/v1/actions/${main!.id}/activate`, status: response.status() };
    });
    await runStep(page, testInfo, results, "Grid", "Activate idempotency", async () => {
      await repeatStatusMutation(page, main!, "activate", "Grid");
      return {
        request: `PATCH /api/gerit/v1/actions/${main!.id}/activate`,
        status: 200,
        detail: "The grid changes its row action to Deactivate after activation; the repeated Activate used the authenticated same-origin proxy and the row remained Active.",
      };
    });

    await runStep(page, testInfo, results, "Grid", "Delete main Action with confirmation", async () => {
      const liveBeforeDelete = await readCurrentAction(page, main!.id);
      if (liveBeforeDelete.name !== main!.name) throw new Error("Grid Delete target did not match the journey-owned Action.");
      const row = actionRow(page, main!.name);
      await row.getByRole("button", { name: labels.delete }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible(); await expect(dialog).toContainText(main!.name); await screenshot(page, "13-delete-grid-modal");
      const responsePromise = responseMatching(page, "DELETE", new RegExp(`^/api/gerit/v1/actions/${main!.id}/?$`));
      await dialog.getByRole("button", { name: labels.delete }).click();
      const response = await responsePromise;
      if (response.status() !== 200) throw new Error(`Grid DELETE returned HTTP ${response.status()}.`);
      await expect(actionRow(page, main!.name)).toHaveCount(0);
      ownedIds.delete(main!.id);
      return { request: `DELETE /api/gerit/v1/actions/${main!.id}`, status: response.status() };
    });
  } else {
    for (const [area, name] of [["CRUD", "Read detail"], ["CRUD", "Update Description"], ["Detail", "Deactivate"], ["Detail", "Activate"], ["Grid", "Deactivate"], ["Grid", "Activate"], ["Grid", "Delete"], ["Error", "Deleted detail 410"]]) blocked(results, page, area, name, "Action create ID");
  }

  await runStep(page, testInfo, results, "State", "Stale state A → B → A", async () => {
    if (!authDiagnostic.sessionValid) throw new Error("Authenticated API access is unavailable for stale-state Actions.");
    staleA = await createViaApi(page, `E2E stale A ${randomUUID()}`, `description A ${randomUUID()}`);
    staleB = await createViaApi(page, `E2E stale B ${randomUUID()}`, `description B ${randomUUID()}`);
    for (const action of [staleA, staleB, staleA]) {
      const responsePromise = responseMatching(page, "GET", new RegExp(`^/api/gerit/v1/actions/${action.id}/?$`));
      await page.goto(`/actions/${action.id}/`, { waitUntil: "domcontentloaded" });
      const response = await responsePromise;
      if (response.status() !== 200) throw new Error(`Stale-state GET ${action.id} returned HTTP ${response.status()}.`);
      await assertActionDetail(page, action);
    }
    return { request: `GET /api/gerit/v1/actions/${staleA.id} → ${staleB.id} → ${staleA.id}`, status: 200, detail: "Visible name and description matched each current ID." };
  });

  await runStep(page, testInfo, results, "Error", "Deleted detail returns HTTP 410 and visible alert", async () => {
    if (!main) throw new Error("The main Action ID is unavailable.");
    const responsePromise = responseMatching(page, "GET", new RegExp(`^/api/gerit/v1/actions/${main.id}/?$`));
    await page.goto(`/actions/${main.id}/`, { waitUntil: "domcontentloaded" });
    const response = await responsePromise;
    if (response.status() !== 410) throw new Error(`Deleted detail returned HTTP ${response.status()}, expected 410.`);
    await expect(page.getByTestId("action-details-page-root").getByRole("alert")).toBeVisible();
    await screenshot(page, "14-error-410"); await assertNoRawKeys(page);
    return { request: `GET /api/gerit/v1/actions/${main.id}`, status: response.status() };
  });

  await runStep(page, testInfo, results, "i18n", "Back translated and no raw keys across supported locales", async () => {
    if (!staleA) throw new Error("No live test-owned Action is available for locale checks.");
    const locales = [{ code: "pt-PT", back: "Voltar" }, { code: "pt-BR", back: "Voltar" }, { code: "en-US", back: "Back" }, { code: "es-ES", back: "Volver" }];
    for (const locale of locales) {
      await page.evaluate((code) => localStorage.setItem("language", code), locale.code);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
      await expect(page.getByTestId("action-details-page-root").getByRole("button", { name: locale.back, exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("action-details-page-root").getByRole("button", { name: "actions.actions.back", exact: true })).toHaveCount(0);
      await assertNoRawKeys(page);
    }
    if (initialLocale) {
      await page.evaluate((code) => localStorage.setItem("language", code), initialLocale);
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  });

  await runStep(page, testInfo, results, "Error", "Nonexistent Action renders the expected error state", async () => {
    const id = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const responsePromise = responseMatching(page, "GET", new RegExp(`^/api/gerit/v1/actions/${id}/?$`));
    await page.goto(`/actions/${id}/`, { waitUntil: "domcontentloaded" });
    const response = await responsePromise;
    if (![404, 410].includes(response.status())) throw new Error(`Missing Action GET returned HTTP ${response.status()}, expected 404/410.`);
    await expect(page.getByTestId("action-details-page-root").getByRole("alert")).toBeVisible();
    await assertNoRawKeys(page);
  });

  for (const id of [...ownedIds]) {
    await runStep(page, testInfo, results, "Cleanup", `Delete test-owned Action ${id}`, async () => {
      if (page.isClosed()) {
        if (!cleanupAccessToken) throw new Error("Page is closed and no in-memory authenticated session is available for cleanup.");
        const response = await request.delete(`${baseURL}/api/gerit/v1/actions/${id}`, { headers: { Authorization: `Bearer ${cleanupAccessToken}` } });
        if (![200, 404, 410].includes(response.status())) throw new Error(`Cleanup API DELETE Action ${id} returned HTTP ${response.status()}.`);
      } else {
        await deleteViaApi(page, id);
      }
      ownedIds.delete(id);
      return { request: `DELETE /api/gerit/v1/actions/${id}`, detail: "Only ID created by this journey." };
    }, true);
  }
  await runStep(page, testInfo, results, "Evidence", "Final screenshot and report", async () => {
    let finalScreenshot = "captured";
    if (!page.isClosed()) {
      try { await screenshot(page, "15-final"); } catch { finalScreenshot = "failed"; }
    } else {
      finalScreenshot = "unavailable because the page closed";
    }
    const counts = Object.fromEntries(["PASS", "FAIL", "RECOVERED", "BLOCKED"].map((outcome) => [outcome, results.filter((item) => item.outcome === outcome).length]));
    const report = { baseURL, durationMs: Date.now() - startedAt, browserLaunches, contexts: 1, pages: context.pages().length, loginUiAttempts, serverStarts, authDiagnostic, descriptionDiagnosis, pageLossReason: pageLossReasons.get(page) ?? null, finalScreenshot, counts, createdIds: [...allCreatedIds], remainingOwnedIds: [...ownedIds], results };
    const path = resolve(reportDirectory, "report.json");
    await writeFile(path, JSON.stringify(report, null, 2), "utf8");
    await testInfo.attach("actions-journey-report.json", { path, contentType: "application/json" });
    console.log("[E2E Actions journey report] " + JSON.stringify(report));
  }, true);

  const failed = results.filter((item) => item.outcome === "FAIL" || item.outcome === "BLOCKED");
  expect(failed, "Actions journey has failed or blocked steps; inspect attached report.json").toEqual([]);
});
