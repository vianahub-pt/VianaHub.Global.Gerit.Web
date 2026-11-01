import { randomInt, randomUUID } from "node:crypto";
import { test, expect, type ActionData } from "./fixtures";
import type { Page, Response, TestInfo } from "@playwright/test";

type StepStatus = "PASS" | "FAIL" | "BLOCKED";
interface StepResult {
  name: string;
  status: StepStatus;
  url: string;
  request?: string;
  httpStatus?: number;
  detail?: string;
}

const labels = {
  add: /add|adicionar|agregar/i,
  edit: /edit|editar/i,
  delete: /delete|eliminar|excluir/i,
  activate: /activate|ativar|activar/i,
  deactivate: /deactivate|desativar|desactivar/i,
  save: /save|guardar|salvar/i,
  back: /^(back|voltar|volver)$/i,
  actionsLink: /^(actions|ações|acciones)$/i,
  administration: /^(administration|administração|administración)$/i,
  active: /^(active|ativo|ativa|activa)$/i,
  inactive: /^(inactive|inativo|inativa|inactiva)$/i,
  name: /^(name|nome|nombre)$/i,
  description: /^(description|descrição|descripcion)$/i,
  search: /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i,
  breadcrumb: /^(breadcrumb|navegação estrutural|ruta de navegación)$/i,
};

const rawTranslationKeyPattern = /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/;

async function assertNoRawTranslationKeysOnActionsPage(page: Page) {
  const roots = page.locator(
    '[data-testid="actions-page-root"], [data-testid="action-details-page-root"], [data-testid="actions-create-page-root"]',
  );
  await expect(roots.first()).toBeVisible();

  const visibleUiStrings = await roots
    .locator('button, a, [role="button"], [role="link"], label, h1, h2, h3, [role="alert"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .flatMap((element) => [
          element.textContent?.trim() ?? "",
          element.getAttribute("aria-label")?.trim() ?? "",
          element.getAttribute("title")?.trim() ?? "",
        ])
        .filter(Boolean),
    );

  expect(
    visibleUiStrings.filter((text) => rawTranslationKeyPattern.test(text)),
    "Actions pages must not show raw translation keys in visible UI labels",
  ).toEqual([]);
}

function uniqueName(label: string) {
  return "E2E " + label.slice(0, 4) + " " + randomUUID();
}

function currentPath(page: Page) {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "about:blank";
  }
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted token]")
    .replace(/(authorization|cookie|password|accessToken|refreshToken)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s)]+/g, "[URL redacted]")
    .slice(0, 350);
}

async function recordStep(
  page: Page,
  testInfo: TestInfo,
  results: StepResult[],
  name: string,
  action: () => Promise<void | string | { request?: string; httpStatus?: number; detail?: string }>,
) {
  try {
    const result = await action();
    const details = typeof result === "string" ? { detail: result } : result ?? {};
    const item: StepResult = {
      name,
      status: "PASS",
      url: currentPath(page),
      ...details,
    };
    results.push(item);
    console.log("[E2E]", JSON.stringify(item));
  } catch (error) {
    const item: StepResult = {
      name,
      status: "FAIL",
      url: currentPath(page),
      detail: safeError(error),
    };
    results.push(item);
    console.error("[E2E]", JSON.stringify(item));
    try {
      const screenshot = await page.screenshot({ fullPage: false, timeout: 3000 });
      await testInfo.attach("failure-" + results.length + "-" + name.replace(/[^a-z0-9]+/gi, "-") + ".png", {
        body: screenshot,
        contentType: "image/png",
      });
    } catch {
      console.error("[E2E] screenshot unavailable for step " + results.length);
    }
  }
}

function recordBlocked(page: Page, results: StepResult[], name: string, dependency: string) {
  const item: StepResult = {
    name,
    status: "BLOCKED",
    url: currentPath(page),
    detail: "Blocked by " + dependency,
  };
  results.push(item);
  console.warn("[E2E]", JSON.stringify(item));
}

function waitForFinalResponse(page: Page, method: string, path: RegExp): Promise<Response> {
  return page.waitForResponse((response) => {
    const status = response.status();
    return path.test(new URL(response.url()).pathname) &&
      response.request().method() === method &&
      !(status >= 300 && status < 400);
  }, { timeout: 8_000 });
}

async function navigateToActionsThroughMenu(page: Page) {
  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar).toBeVisible({ timeout: 4_000 });
  const actionsLink = sidebar.getByRole("link", { name: labels.actionsLink });
  if (!(await actionsLink.isVisible().catch(() => false))) {
    await sidebar.getByText(labels.administration).click({ timeout: 4_000 });
  }
  await expect(actionsLink).toBeVisible({ timeout: 4_000 });
  await actionsLink.click({ timeout: 4_000 });
  await expect(page).toHaveURL(/\/actions\/?$/, { timeout: 5_000 });
}

async function assertListReady(page: Page) {
  await expect(page.getByTestId("actions-page-root")).toBeVisible({ timeout: 5_000 });
  const table = page.getByRole("table");
  await expect(table).toBeVisible({ timeout: 5_000 });
  await expect.poll(async () => await table.getAttribute("aria-busy"), { timeout: 6_000 }).toBe("false");
}

async function returnToListByBreadcrumb(page: Page) {
  const breadcrumb = page.getByRole("navigation", { name: labels.breadcrumb });
  await breadcrumb.getByRole("button", { name: labels.actionsLink }).click({ timeout: 4_000 });
  await expect(page).toHaveURL(/\/actions\/?$/, { timeout: 5_000 });
  await assertListReady(page);
}

function actionRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

async function searchAction(page: Page, name: string) {
  await page.getByPlaceholder(labels.search).fill(name, { timeout: 4_000 });
  await expect(actionRow(page, name)).toBeVisible({ timeout: 6_000 });
}

async function assertDetailLayout(page: Page, actionName: string) {
  const nameField = page.getByTestId("action-name-field");
  const nameValue = page.getByTestId("action-name-value");
  const descriptionField = page.getByTestId("action-description-field");
  const fieldsSection = page.getByTestId("action-fields-section");
  await expect(nameValue).toHaveText(actionName);
  await expect(page.getByLabel(labels.name)).toHaveCount(0);
  await expect(page.getByLabel(labels.description)).toBeVisible();

  const nameBox = await nameField.boundingBox();
  const descriptionBox = await descriptionField.boundingBox();
  const sectionBox = await fieldsSection.boundingBox();
  if (!nameBox || !descriptionBox || !sectionBox) throw new Error("Action field layout bounds are unavailable.");
  if (descriptionBox.y <= nameBox.y) throw new Error("Description must be below the read-only Name field.");
  if (descriptionBox.width < sectionBox.width * 0.85) throw new Error("Description must use the available field-section width.");
}

async function recoverTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10_000 });
}

async function showSummary(testInfo: TestInfo, results: StepResult[]) {
  const passed = results.filter((step) => step.status === "PASS").length;
  const failed = results.filter((step) => step.status === "FAIL").length;
  const blocked = results.filter((step) => step.status === "BLOCKED").length;
  const summary = { passed, failed, blocked, results };
  console.log("[E2E Actions report]", JSON.stringify(summary));
  await testInfo.attach("actions-e2e-summary.json", {
    body: Buffer.from(JSON.stringify(summary, null, 2)),
    contentType: "application/json",
  });
  expect(failed + blocked, "Actions E2E has failed or blocked steps; see actions-e2e-summary.json").toBe(0);
}

test("Actions CRUD aggregates every step and continues after failures", async ({ page, createAction, registerCreatedAction, markActionDeleted }, testInfo) => {
  test.setTimeout(240_000);
  const results: StepResult[] = [];
  let actionName = uniqueName("crud");
  let description = "E2E Description " + randomUUID();
  const updatedDescription = "E2E Updated " + randomUUID();
  let actionId: number | null = null;
  let createResponse: Response | null = null;

  await recordStep(page, testInfo, results, "Session exists in localStorage", async () => {
    await recoverTo(page, "/");
    const sessionPresent = await page.evaluate(() => Boolean(localStorage.getItem("gerit.auth.session.v1")));
    if (!sessionPresent) throw new Error("Authenticated session storage is absent.");
    return "session present: yes";
  });

  await recordStep(page, testInfo, results, "Dashboard/workspace visible", async () => {
    await expect(page.getByTestId("workspace-shell-root")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("gerit-dashboard-home-root")).toBeVisible({ timeout: 5_000 });
  });

  await recordStep(page, testInfo, results, "Menu Administration → Actions", async () => {
    await navigateToActionsThroughMenu(page);
    return "Dashboard → Administration → Actions";
  });
  if (!(await page.getByTestId("actions-page-root").isVisible().catch(() => false))) {
    await recordStep(page, testInfo, results, "Recovery: open Actions list", async () => {
      await recoverTo(page, "/actions/");
      await assertListReady(page);
      return "direct list route used after menu navigation failure";
    });
  }

  await recordStep(page, testInfo, results, "Actions list", async () => {
    await assertListReady(page);
    return "list root and grid visible";
  });

  await recordStep(page, testInfo, results, "Open Add Action form", async () => {
    await page.getByRole("button", { name: labels.add }).click({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/actions\/new\/?$/, { timeout: 5_000 });
    await expect(page.getByTestId("actions-create-page-root")).toBeVisible({ timeout: 5_000 });
  });
  if (!(await page.getByTestId("actions-create-page-root").isVisible().catch(() => false))) {
    await recordStep(page, testInfo, results, "Recovery: open Action create form", async () => {
      await recoverTo(page, "/actions/new/");
      await expect(page.getByTestId("actions-create-page-root")).toBeVisible({ timeout: 5_000 });
      return "direct create route used after Add navigation failure";
    });
  }

  await recordStep(page, testInfo, results, "Fill Name", async () => {
    await page.getByLabel(labels.name).fill(actionName, { timeout: 4_000 });
  });
  await recordStep(page, testInfo, results, "Fill Description", async () => {
    await page.getByLabel(labels.description).fill(description, { timeout: 4_000 });
  });

  await recordStep(page, testInfo, results, "Create POST /v1/actions final response", async () => {
    const responsePromise = waitForFinalResponse(page, "POST", /^\/api\/gerit\/v1\/actions\/?$/);
    await page.getByRole("button", { name: labels.save }).click({ timeout: 5_000 });
    createResponse = await responsePromise;
    const body = await createResponse.json().catch(() => null) as { id?: unknown } | null;
    if (typeof body?.id === "number") {
      actionId = body.id;
      registerCreatedAction(actionId);
    }
    if (createResponse.status() !== 201) {
      throw new Error("POST /api/gerit/v1/actions final HTTP " + createResponse.status());
    }
    if (typeof body?.id !== "number") throw new Error("Create returned HTTP 201 without a numeric ID.");
    if (JSON.stringify(createResponse.request().postDataJSON()) !== JSON.stringify({ name: actionName, description })) {
      throw new Error("Create request payload did not match Name and Description.");
    }
    return { request: "POST /api/gerit/v1/actions/", httpStatus: createResponse.status(), detail: "ID captured and registered for owned-data cleanup" };
  });

  if (actionId === null) {
    await recordStep(page, testInfo, results, "Recovery: create test-owned Action through API", async () => {
      const recovery = await createAction(uniqueName("recovery"), "E2E recovery description " + randomUUID());
      actionId = recovery.id;
      actionName = recovery.name;
      description = recovery.description ?? "";
      return { request: "POST /api/gerit/v1/actions/", httpStatus: 201, detail: "UI create failed; API-created owned Action used to continue dependent checks" };
    });
  }

  if (actionId === null) {
    for (const step of [
      "Open created Action detail",
      "Read Name",
      "Read Description",
      "Read Active status",
      "Return to list via breadcrumb",
      "Find created Action by name",
      "Open edit from row action",
      "Update Description",
      "Reopen Action",
      "Verify Description persisted",
      "Deactivate",
      "Verify Inactive",
      "Reactivate",
      "Verify Active",
      "Return to list before delete",
      "Open delete confirmation",
      "Confirm DELETE",
      "Verify row disappeared",
      "Open deleted ID",
      "Verify deleted detail 410",
      "Verify Code absent",
    ]) {
      recordBlocked(page, results, step, "Create ID");
    }
    await showSummary(testInfo, results);
    return;
  }

  const detailsPath = "/actions/" + actionId + "/";
  await recordStep(page, testInfo, results, "Create redirect opens Action detail", async () => {
    await expect(page).toHaveURL(new RegExp("/actions/" + actionId + "/?$"), { timeout: 5_000 });
    await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
  });
  if (!(await page.getByTestId("action-details-page-root").isVisible().catch(() => false))) {
    await recordStep(page, testInfo, results, "Recovery: open created Action detail", async () => {
      await recoverTo(page, detailsPath);
      await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
      return "direct detail route used after create redirect failure";
    });
  }

  await recordStep(page, testInfo, results, "Read Name", async () => {
    await expect(page.getByRole("heading", { name: actionName, exact: true })).toBeVisible({ timeout: 5_000 });
  });
  await recordStep(page, testInfo, results, "Read Description", async () => {
    await expect(page.getByLabel(labels.description)).toHaveValue(description, { timeout: 5_000 });
  });
  await recordStep(page, testInfo, results, "Read Active status", async () => {
    await expect(page.getByText(labels.active)).toBeVisible({ timeout: 5_000 });
  });
  await recordStep(page, testInfo, results, "Detail layout and accessible controls", async () => {
    await assertDetailLayout(page, actionName);
    await expect(page.getByRole("button", { name: labels.back }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.delete })).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
  });
  await recordStep(page, testInfo, results, "Code absent from Action detail", async () => {
    await expect(page.getByLabel(/^(code|código)$/i)).toHaveCount(0);
  });

  await recordStep(page, testInfo, results, "Return to list via breadcrumb", async () => {
    await returnToListByBreadcrumb(page);
  });
  if (currentPath(page) !== "/actions" && currentPath(page) !== "/actions/") {
    await recordStep(page, testInfo, results, "Recovery: return to Actions list", async () => {
      await recoverTo(page, "/actions/");
      await assertListReady(page);
    });
  }
  await recordStep(page, testInfo, results, "Find created Action by name", async () => {
    await searchAction(page, actionName);
    await expect(page.getByRole("table").getByRole("columnheader", { name: /^Code$/i })).toHaveCount(0);
    await assertNoRawTranslationKeysOnActionsPage(page);
  });

  let row = actionRow(page, actionName);
  await recordStep(page, testInfo, results, "Open edit from row action", async () => {
    await row.getByRole("button", { name: labels.edit }).click({ timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp("/actions/" + actionId + "/?$"), { timeout: 5_000 });
    await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
  });
  if (!(await page.getByTestId("action-details-page-root").isVisible().catch(() => false))) {
    await recordStep(page, testInfo, results, "Recovery: open detail for Description update", async () => {
      await recoverTo(page, detailsPath);
      await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
    });
  }

  await recordStep(page, testInfo, results, "Update only Description", async () => {
    await expect(page.getByLabel(labels.name)).toHaveCount(0);
    await page.getByLabel(labels.description).fill(updatedDescription, { timeout: 4_000 });
    const responsePromise = waitForFinalResponse(page, "PUT", new RegExp("^/api/gerit/v1/actions/" + actionId + "/?$"));
    await page.getByRole("button", { name: labels.save }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("PUT final HTTP " + response.status());
    if (JSON.stringify(response.request().postDataJSON()) !== JSON.stringify({ description: updatedDescription })) {
      throw new Error("PUT payload contained fields other than Description or did not match the edited value.");
    }
    return { request: "PUT /api/gerit/v1/actions/" + actionId, httpStatus: response.status() };
  });

  if (currentPath(page) !== "/actions" && currentPath(page) !== "/actions/") {
    await recordStep(page, testInfo, results, "Recovery: return to list after update", async () => {
      await returnToListByBreadcrumb(page);
    });
  }
  await recordStep(page, testInfo, results, "Reopen Action after update", async () => {
    await assertListReady(page);
    await searchAction(page, actionName);
    row = actionRow(page, actionName);
    await row.getByRole("cell", { name: actionName, exact: true }).click({ timeout: 5_000 });
    await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
  });
  if (!(await page.getByTestId("action-details-page-root").isVisible().catch(() => false))) {
    await recordStep(page, testInfo, results, "Recovery: reopen detail after update", async () => {
      await recoverTo(page, detailsPath);
      await expect(page.getByTestId("action-details-page-root")).toBeVisible({ timeout: 5_000 });
    });
  }
  await recordStep(page, testInfo, results, "Verify Description persisted", async () => {
    await expect(page.getByLabel(labels.description)).toHaveValue(updatedDescription, { timeout: 5_000 });
  });

  await recordStep(page, testInfo, results, "Deactivate Action", async () => {
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + actionId + "/deactivate/?$"));
    await page.getByRole("button", { name: labels.deactivate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("PATCH deactivate final HTTP " + response.status());
    return { request: "PATCH /api/gerit/v1/actions/" + actionId + "/deactivate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Confirm Inactive", async () => {
    await expect(page.getByText(labels.inactive)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: labels.activate })).toBeVisible();
  });
  await recordStep(page, testInfo, results, "Inactive state persists after reload", async () => {
    const detailResponsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + actionId + "/?$"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await detailResponsePromise;
    if (response.status() !== 200) throw new Error("Reloaded Action detail final HTTP " + response.status());
    await expect(page.getByText(labels.inactive)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: labels.activate })).toBeVisible();
    return { request: "GET /api/gerit/v1/actions/" + actionId, httpStatus: response.status() };
  });

  await recordStep(page, testInfo, results, "Reactivate Action", async () => {
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + actionId + "/activate/?$"));
    await page.getByRole("button", { name: labels.activate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("PATCH activate final HTTP " + response.status());
    return { request: "PATCH /api/gerit/v1/actions/" + actionId + "/activate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Confirm Active", async () => {
    await expect(page.getByText(labels.active)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
  });
  await recordStep(page, testInfo, results, "Active state persists after reload", async () => {
    const detailResponsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + actionId + "/?$"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await detailResponsePromise;
    if (response.status() !== 200) throw new Error("Reloaded Action detail final HTTP " + response.status());
    await expect(page.getByText(labels.active)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
    return { request: "GET /api/gerit/v1/actions/" + actionId, httpStatus: response.status() };
  });

  await recordStep(page, testInfo, results, "Back to list before delete", async () => {
    await page.getByRole("button", { name: labels.back }).last().click({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/actions\/?$/, { timeout: 5_000 });
    await assertListReady(page);
  });
  if (currentPath(page) !== "/actions" && currentPath(page) !== "/actions/") {
    await recordStep(page, testInfo, results, "Recovery: return to list before delete", async () => {
      await recoverTo(page, "/actions/");
      await assertListReady(page);
    });
  }
  await recordStep(page, testInfo, results, "Find Action row for deletion", async () => {
    await searchAction(page, actionName);
    row = actionRow(page, actionName);
    await expect(row).toBeVisible({ timeout: 5_000 });
    await expect(row.getByRole("cell", { name: labels.active })).toBeVisible();
  });
  await recordStep(page, testInfo, results, "Open delete confirmation", async () => {
    await row.getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByRole("heading", { name: labels.delete })).toBeVisible();
    await expect(dialog).toContainText(actionName);
  });
  await recordStep(page, testInfo, results, "Confirm DELETE and capture final response", async () => {
    const responsePromise = waitForFinalResponse(page, "DELETE", new RegExp("^/api/gerit/v1/actions/" + actionId + "/?$"));
    await page.getByRole("alertdialog").getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("DELETE final HTTP " + response.status());
    markActionDeleted(actionId as number);
    return { request: "DELETE /api/gerit/v1/actions/" + actionId, httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Confirm deleted row disappeared", async () => {
    await expect(actionRow(page, actionName)).toHaveCount(0, { timeout: 6_000 });
  });

  await recordStep(page, testInfo, results, "Open deleted ID and capture GET", async () => {
    const responsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + actionId + "/?$"));
    await recoverTo(page, detailsPath);
    const response = await responsePromise;
    if (response.status() !== 410) throw new Error("GET deleted Action final HTTP " + response.status());
    return { request: "GET /api/gerit/v1/actions/" + actionId, httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Confirm deleted detail error state", async () => {
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5_000 });
    await assertNoRawTranslationKeysOnActionsPage(page);
  });

  await showSummary(testInfo, results);
});

test("Actions grid alternate controls: deactivate, activate, and delete", async ({ page, createAction, markActionDeleted }, testInfo) => {
  test.setTimeout(150_000);
  const results: StepResult[] = [];
  let action: ActionData | null = null;

  await recordStep(page, testInfo, results, "Create grid-path test Action", async () => {
    action = await createAction(uniqueName("grid"), "Grid path " + randomUUID());
    return { request: "POST /api/gerit/v1/actions/", httpStatus: 201 };
  });
  if (!action) {
    for (const step of ["Open grid", "Deactivate through grid", "Activate through grid", "Delete through grid"]) {
      recordBlocked(page, results, step, "test-owned Action creation");
    }
    await showSummary(testInfo, results);
    return;
  }

  await recordStep(page, testInfo, results, "Open grid for alternate controls", async () => {
    await recoverTo(page, "/actions/");
    await assertListReady(page);
    await searchAction(page, action!.name);
    await expect(page.getByRole("table").getByRole("columnheader", { name: /^Code$/i })).toHaveCount(0);
    await assertNoRawTranslationKeysOnActionsPage(page);
    return "Actions grid opened and test-owned row located";
  });

  await recordStep(page, testInfo, results, "Deactivate through grid", async () => {
    const row = actionRow(page, action!.name);
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/deactivate/?$"));
    await row.getByRole("button", { name: labels.deactivate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Grid deactivate final HTTP " + response.status());
    await expect(row.getByRole("cell", { name: labels.inactive })).toBeVisible({ timeout: 5_000 });
    return { request: "PATCH /api/gerit/v1/actions/" + action!.id + "/deactivate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Grid Inactive state persists after reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertListReady(page);
    await searchAction(page, action!.name);
    await expect(actionRow(page, action!.name).getByRole("cell", { name: labels.inactive })).toBeVisible();
  });

  await recordStep(page, testInfo, results, "Activate through grid", async () => {
    const row = actionRow(page, action!.name);
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/activate/?$"));
    await row.getByRole("button", { name: labels.activate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Grid activate final HTTP " + response.status());
    await expect(row.getByRole("cell", { name: labels.active })).toBeVisible({ timeout: 5_000 });
    return { request: "PATCH /api/gerit/v1/actions/" + action!.id + "/activate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Grid Active state persists after reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertListReady(page);
    await searchAction(page, action!.name);
    await expect(actionRow(page, action!.name).getByRole("cell", { name: labels.active })).toBeVisible();
  });

  await recordStep(page, testInfo, results, "Open grid Delete confirmation", async () => {
    await actionRow(page, action!.name).getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: labels.delete })).toBeVisible();
    await expect(dialog).toContainText(action!.name);
  });
  await recordStep(page, testInfo, results, "Delete through grid", async () => {
    const responsePromise = waitForFinalResponse(page, "DELETE", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await page.getByRole("alertdialog").getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Grid delete final HTTP " + response.status());
    markActionDeleted(action!.id);
    await expect(actionRow(page, action!.name)).toHaveCount(0, { timeout: 6_000 });
    return { request: "DELETE /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Grid-deleted Action detail returns 410", async () => {
    const responsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await recoverTo(page, "/actions/" + action!.id + "/");
    const response = await responsePromise;
    if (response.status() !== 410) throw new Error("Grid-deleted detail final HTTP " + response.status());
    await expect(page.getByTestId("action-details-page-root").getByRole("alert")).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
    return { request: "GET /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });

  await showSummary(testInfo, results);
});

test("Actions detail alternate controls: deactivate, activate, and delete", async ({ page, createAction, markActionDeleted }, testInfo) => {
  test.setTimeout(150_000);
  const results: StepResult[] = [];
  let action: ActionData | null = null;

  await recordStep(page, testInfo, results, "Create detail-path test Action", async () => {
    action = await createAction(uniqueName("detail"), "Detail path " + randomUUID());
    return { request: "POST /api/gerit/v1/actions/", httpStatus: 201 };
  });
  if (!action) {
    for (const step of ["Open detail", "Deactivate through detail", "Activate through detail", "Delete through detail"]) {
      recordBlocked(page, results, step, "test-owned Action creation");
    }
    await showSummary(testInfo, results);
    return;
  }

  await recordStep(page, testInfo, results, "Open detail for alternate controls", async () => {
    await recoverTo(page, "/actions/" + action!.id + "/");
    await expect(page.getByTestId("action-details-page-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: action!.name, exact: true })).toBeVisible();
    await expect(page.getByLabel(/^(code|código)$/i)).toHaveCount(0);
    await assertDetailLayout(page, action!.name);
    await expect(page.getByRole("button", { name: labels.back }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.delete })).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
  });

  await recordStep(page, testInfo, results, "Deactivate through detail", async () => {
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/deactivate/?$"));
    await page.getByRole("button", { name: labels.deactivate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Detail deactivate final HTTP " + response.status());
    await expect(page.getByText(labels.inactive)).toBeVisible();
    await expect(page.getByRole("button", { name: labels.activate })).toBeVisible();
    return { request: "PATCH /api/gerit/v1/actions/" + action!.id + "/deactivate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Detail Inactive state persists after reload", async () => {
    const detailResponsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await detailResponsePromise;
    if (response.status() !== 200) throw new Error("Reloaded Action detail final HTTP " + response.status());
    await expect(page.getByText(labels.inactive)).toBeVisible();
    await expect(page.getByRole("button", { name: labels.activate })).toBeVisible();
    return { request: "GET /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });

  await recordStep(page, testInfo, results, "Activate through detail", async () => {
    const responsePromise = waitForFinalResponse(page, "PATCH", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/activate/?$"));
    await page.getByRole("button", { name: labels.activate }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Detail activate final HTTP " + response.status());
    await expect(page.getByText(labels.active)).toBeVisible();
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
    return { request: "PATCH /api/gerit/v1/actions/" + action!.id + "/activate", httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Detail Active state persists after reload", async () => {
    const detailResponsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await detailResponsePromise;
    if (response.status() !== 200) throw new Error("Reloaded Action detail final HTTP " + response.status());
    await expect(page.getByText(labels.active)).toBeVisible();
    await expect(page.getByRole("button", { name: labels.deactivate })).toBeVisible();
    return { request: "GET /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });

  await recordStep(page, testInfo, results, "Open detail Delete confirmation", async () => {
    await page.getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: labels.delete })).toBeVisible();
    await expect(dialog).toContainText(action!.name);
  });
  await recordStep(page, testInfo, results, "Delete through detail", async () => {
    const responsePromise = waitForFinalResponse(page, "DELETE", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await page.getByRole("alertdialog").getByRole("button", { name: labels.delete }).click({ timeout: 5_000 });
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error("Detail delete final HTTP " + response.status());
    markActionDeleted(action!.id);
    await expect(page).toHaveURL(/\/actions\/?$/, { timeout: 5_000 });
    await assertListReady(page);
    await searchAction(page, action!.name);
    await expect(actionRow(page, action!.name)).toHaveCount(0);
    return { request: "DELETE /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Detail-deleted Action returns 410", async () => {
    const responsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + action!.id + "/?$"));
    await recoverTo(page, "/actions/" + action!.id + "/");
    const response = await responsePromise;
    if (response.status() !== 410) throw new Error("Detail-deleted Action final HTTP " + response.status());
    await expect(page.getByTestId("action-details-page-root").getByRole("alert")).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
    return { request: "GET /api/gerit/v1/actions/" + action!.id, httpStatus: response.status() };
  });

  await showSummary(testInfo, results);
});

test("stale state A to B to A", async ({ page, createAction }, testInfo) => {
  test.setTimeout(90_000);
  const results: StepResult[] = [];
  const createdActions: Array<ActionData | null> = [null, null];

  await recordStep(page, testInfo, results, "Create controlled Action A", async () => {
    createdActions[0] = await createAction(uniqueName("stale-a"), "Stale A " + randomUUID());
  });
  await recordStep(page, testInfo, results, "Create controlled Action B", async () => {
    createdActions[1] = await createAction(uniqueName("stale-b"), "Stale B " + randomUUID());
  });
  const actionA = createdActions[0];
  const actionB = createdActions[1];
  if (!actionA || !actionB) {
    recordBlocked(page, results, "Navigate A → B → A", "one or both controlled Actions could not be created");
    await showSummary(testInfo, results);
    return;
  }

  for (const [action, otherAction] of [[actionA, actionB], [actionB, actionA], [actionA, actionB]] as const) {
    await recordStep(page, testInfo, results, "Navigate detail to Action " + action.id, async () => {
      await recoverTo(page, "/actions/" + action.id + "/");
      await expect(page.getByRole("heading", { name: action.name, exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByLabel(labels.description)).toHaveValue(action.description ?? "", { timeout: 5_000 });
      await expect(page.getByText(otherAction.name, { exact: true })).toHaveCount(0);
    });
  }
  await showSummary(testInfo, results);
});

test("unknown Action ID returns an error state", async ({ page }, testInfo) => {
  const results: StepResult[] = [];
  const missingId = randomInt(2_000_000_000, 2_100_000_000);
  await recordStep(page, testInfo, results, "Open unknown Action ID and capture GET", async () => {
    const responsePromise = waitForFinalResponse(page, "GET", new RegExp("^/api/gerit/v1/actions/" + missingId + "/?$"));
    await recoverTo(page, "/actions/" + missingId + "/");
    const response = await responsePromise;
    if (response.status() !== 404 && response.status() !== 410) throw new Error("Unknown ID final HTTP " + response.status());
    return { request: "GET /api/gerit/v1/actions/" + missingId, httpStatus: response.status() };
  });
  await recordStep(page, testInfo, results, "Confirm unknown ID error state", async () => {
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5_000 });
  });
  await showSummary(testInfo, results);
});

test("Actions list and detail omit Code", async ({ page, createAction }, testInfo) => {
  const results: StepResult[] = [];
  let action: ActionData | null = null;
  await recordStep(page, testInfo, results, "Create test-owned Action for Code check", async () => {
    action = await createAction(uniqueName("no-code"), "No Code " + randomUUID());
  });
  await recordStep(page, testInfo, results, "Navigate menu to Actions list", async () => {
    await navigateToActionsThroughMenu(page);
    await assertListReady(page);
  });
  await recordStep(page, testInfo, results, "Code absent from list headers", async () => {
    await expect(page.getByRole("table").getByRole("columnheader", { name: /^Code$/i })).toHaveCount(0);
    await assertNoRawTranslationKeysOnActionsPage(page);
  });
  if (!action) {
    recordBlocked(page, results, "Code absent from detail", "test-owned Action could not be created");
  } else {
    await recordStep(page, testInfo, results, "Open detail for Code check", async () => {
      await recoverTo(page, "/actions/" + action?.id + "/");
      await expect(page.getByRole("heading", { name: action?.name, exact: true })).toBeVisible({ timeout: 5_000 });
      await assertNoRawTranslationKeysOnActionsPage(page);
    });
    await recordStep(page, testInfo, results, "Code absent from detail", async () => {
      await expect(page.getByLabel(/^(code|código)$/i)).toHaveCount(0);
    });
  }
  await showSummary(testInfo, results);
});
