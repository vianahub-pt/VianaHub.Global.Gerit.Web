import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import {
  beginEquipmentTypesCreate, cleanupOwnedEquipmentTypes, confirmEquipmentTypeDelete, markEquipmentTypeDeleteAttempted, readEquipmentTypesCleanupManifest,
  reconcileEquipmentTypesCreate, registerOwnedEquipmentType, resolveEquipmentTypeRejectedCreate,
} from "../../scripts/e2e/equipment-types-cleanup.mjs";
import { authenticateFromLogin } from "./helpers/auth";

const equipmentMenuLabel = /^(equipment types|tipos de equipamento|tipos de equipo)$/i;
const resourcesMenuLabel = /^(teams and resources|equipas e recursos|equipes e recursos|equipos y recursos)$/i;
const nameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripción|descripcion)$/i;
const searchLabel = /^(search by name or description|pesquisar por nome ou descrição|buscar por nombre o descripción)$/i;
const reportDirectory = resolve(".e2e-debug/equipment-types-journey");
const manifestPath = resolve(reportDirectory, "cleanup-manifest.json");

interface ApiResult { status: number; body: unknown }

async function api(page: Page, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ requestMethod, requestPath, requestBody }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: {
        ...(session.accessToken ? { Authorization: "Bearer " + session.accessToken } : {}),
        ...(requestBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { requestMethod: method, requestPath: path, requestBody: body });
}

async function listExact(request: APIRequestContext, token: string, name: string): Promise<ApiResult> {
  const headers = { Authorization: "Bearer " + token };
  const basePath = "/api/gerit/v1/equipment-types/paged/?Search=" + encodeURIComponent(name) + "&PageSize=100&SortBy=Name&SortDirection=asc";
  const first = await request.get(basePath + "&PageNumber=1", { headers });
  const firstBody = await first.json().catch(() => null) as { items?: Array<{ id: number; name: string }>; totalPages?: unknown } | null;
  if (first.status() !== 200) return { status: first.status(), body: firstBody };
  if (!Array.isArray(firstBody?.items) || !Number.isSafeInteger(firstBody.totalPages) ||
      (firstBody.totalPages as number) < 0 || (firstBody.totalPages as number) > 100) {
    return { status: 0, body: firstBody };
  }
  const items = [...firstBody.items];
  for (let pageNumber = 2; pageNumber <= (firstBody.totalPages as number); pageNumber += 1) {
    const next = await request.get(basePath + "&PageNumber=" + pageNumber, { headers });
    const nextBody = await next.json().catch(() => null) as { items?: Array<{ id: number; name: string }> } | null;
    if (next.status() !== 200) return { status: next.status(), body: nextBody };
    if (!Array.isArray(nextBody?.items)) return { status: 0, body: nextBody };
    items.push(...nextBody.items);
  }
  return { status: 200, body: { ...firstBody, items } };
}

async function getDetail(request: APIRequestContext, token: string, id: number): Promise<ApiResult> {
  const response = await request.get("/api/gerit/v1/equipment-types/" + id + "/", { headers: { Authorization: "Bearer " + token } });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function captureEvidence(page: Page, testInfo: TestInfo, name: string) {
  const image = await page.screenshot({ fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { body: image, contentType: "image/png" });
  await writeFile(resolve(reportDirectory, "screenshots", name), image);
}

async function createIdentity(page: Page, configuredEmail: string) {
  return page.evaluate((email) => {
    try {
      const session = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as {
        userId?: unknown; tenantId?: unknown; email?: unknown; accessToken?: unknown; refreshToken?: unknown;
      } | null;
      if (!session || !Number.isSafeInteger(session.userId) || !Number.isSafeInteger(session.tenantId) ||
          typeof session.email !== "string" || typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") return null;
      const payload = session.accessToken.split(".")[1];
      if (!payload) return null;
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
        sub?: unknown; tenant_id?: unknown; email?: unknown; role?: unknown; permissions?: Record<string, unknown>;
      };
      const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
      const roles = Array.isArray(claims.role) ? claims.role : [claims.role];
      const entry = Object.entries(claims.permissions ?? {}).find(([resource]) => normalize(resource) === "equipmenttypes");
      const grants = Array.isArray(entry?.[1]) ? entry[1].map((grant) => normalize(String(grant))) : [];
      const configured = email.trim().toLowerCase();
      const identityMatches = session.email.trim().toLowerCase() === configured &&
        (typeof claims.email !== "string" || claims.email.trim().toLowerCase() === configured) &&
        Number(claims.sub) === session.userId && Number(claims.tenant_id) === session.tenantId;
      return {
        userId: session.userId as number, tenantId: session.tenantId as number,
        refreshToken: session.refreshToken, identityMatches,
        roles: roles.map((role) => String(role).trim().toLowerCase()), grants,
      };
    } catch { return null; }
  }, configuredEmail);
}

async function installVisualPointer(page: Page) {
  await page.addInitScript((showPointer: boolean) => {
    if (!showPointer) return;
    const install = () => {
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.appendChild(pointer);
      document.addEventListener("pointermove", (event) => { pointer.style.left = event.clientX + "px"; pointer.style.top = event.clientY + "px"; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");
}

test("EquipmentTypes CRUD, lifecycle, CSV and persistent deterministic cleanup", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  if (process.env.CI === "true" || process.env.E2E_MUTATING_APPROVED !== "true") {
    throw new Error("EquipmentTypes QA mutations require an explicit local per-run approval; CI is nonmutating.");
  }
  const priorManifest = await readEquipmentTypesCleanupManifest(manifestPath);
  if (priorManifest.status !== "clear") throw new Error("Pending or ambiguous EquipmentTypes cleanup blocks this execution before login or mutation.");
  const executionId = randomUUID();
  const unique = "E2E-EQT-" + executionId;
  const uiName = unique + "-ui";
  const csvName = unique + "-csv";
  const httpEvidence: Record<string, number | string | boolean> = {};
  const cleanupEvidence: Array<{ id: number; deleteStatus?: number; getStatus?: number }> = [];
  const mutationRequests: Array<{ method: string; path: string }> = [];
  let identity: Awaited<ReturnType<typeof createIdentity>> = null;
  let bulkUploadAuthorized = false;
  await mkdir(resolve(reportDirectory, "screenshots"), { recursive: true });

  try {
    await installVisualPointer(page);
    await authenticateFromLogin(page);
    httpEvidence.login = 200;
    identity = await createIdentity(page, process.env.E2E_USER_EMAIL ?? "");
    const requiredGrants = ["getby", "create", "update", "delete", "activate", "deactivate"];
    const allowedRole = identity && ["admin", "backoffice", "manager"].some((role) => identity!.roles.includes(role));
    if (!identity || !identity.identityMatches || !allowedRole ||
        requiredGrants.some((grant) => !identity!.grants.includes(grant))) {
      throw new Error("EquipmentTypes QA identity, tenant, role, or required grants were not verified before mutation.");
    }
    bulkUploadAuthorized = identity.grants.includes("bulkupload");
    httpEvidence.identityTenantGrantCheck = true;
    httpEvidence.bulkUploadGrant = bulkUploadAuthorized;

    const initialSession = await refreshForRequest(request, identity);
    const initialMarkerCheck = await listExact(request, initialSession.accessToken, uiName);
    httpEvidence.markerPrecheck = initialMarkerCheck.status;
    if (initialMarkerCheck.status !== 200) throw new Error("EquipmentTypes marker precheck could not read the authorized tenant list.");
    const initialItems = (initialMarkerCheck.body as { items?: Array<{ name: string }> } | null)?.items ?? [];
    if (initialItems.some((item) => item.name === uiName)) throw new Error("The unique EquipmentTypes marker already exists; no mutation was started.");

    page.on("request", (requestEvent) => {
      const path = new URL(requestEvent.url()).pathname;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(requestEvent.method()) && path.includes("/api/gerit/v1/equipment-types")) {
        mutationRequests.push({ method: requestEvent.method(), path });
      }
    });

    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const section = sidebar.getByRole("button", { name: resourcesMenuLabel });
    if (await section.getAttribute("aria-expanded") === "false") await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await sidebar.getByRole("link", { name: equipmentMenuLabel }).click();
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    await expect(page.getByTestId("equipment-types-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await page.getByRole("button", { name: /add|adicionar|añadir/i }).click();
    await expect(page).toHaveURL(/\/equipment-types\/new\/$/);
    await expect(page.getByTestId("equipment-types-create-page-root")).toBeVisible();
    const createForm = page.locator("form");
    const createFieldsSection = page.getByTestId("equipment-type-fields-section");
    const createFieldsGrid = createFieldsSection.locator(":scope > div");
    await expect(createFieldsGrid).toHaveClass(/sm:grid-cols-12/);
    const nameField = page.getByTestId("equipment-type-name-field");
    const statusField = page.getByTestId("equipment-type-status-field");
    const descriptionField = page.getByTestId("equipment-type-description-field");
    await expect(nameField).toHaveClass(/md:col-span-10/);
    await expect(statusField).toHaveClass(/md:col-span-2/);
    await expect(descriptionField).toHaveClass(/sm:col-span-12/);
    const statusBounds = await statusField.boundingBox();
    const descriptionBounds = await descriptionField.boundingBox();
    expect(statusBounds).not.toBeNull();
    expect(descriptionBounds).not.toBeNull();
    expect(Math.abs((statusBounds!.x + statusBounds!.width) - (descriptionBounds!.x + descriptionBounds!.width))).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("equipment-type-is-active-switch")).toBeChecked();
    await expect(createForm.getByRole("button", { name: /back|voltar|volver/i })).toHaveAttribute("type", "button");
    await expect(createForm.getByRole("button", { name: /save|guardar|salvar/i })).toHaveAttribute("type", "submit");
    await expect(createForm.locator("div.flex.flex-wrap.justify-start.gap-3")).toContainText(/back|voltar|volver/i);
    expect(await page.getByLabel(/identifier|identificador/i).count()).toBe(0);
    expect(await page.getByLabel(/created|creado|criado/i).count()).toBe(0);

    const lightMode = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    const desktop = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await captureEvidence(page, testInfo, "equipment-types-create.png");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await captureEvidence(page, testInfo, "equipment-types-create-dark.png");
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), lightMode);
    await page.setViewportSize({ width: 390, height: 844 });
    await captureEvidence(page, testInfo, "equipment-types-create-mobile.png");
    await page.setViewportSize(desktop);
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), lightMode);

    await page.getByLabel(nameLabel).fill(uiName);
    await page.getByRole("textbox", { name: descriptionLabel }).fill(unique + " description");
    await beginEquipmentTypesCreate(manifestPath, { name: uiName, userId: identity.userId, tenantId: identity.tenantId, executionId, operation: "create" });
    const createSaveButton = page.getByRole("button", { name: /save|guardar|salvar/i });
    const createRequestPromise = page.waitForRequest((requestEvent) => requestEvent.method() === "POST" && new URL(requestEvent.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/equipment-types");
    const createResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/equipment-types");
    const beforeCreate = mutationRequests.length;
    const createClick = createSaveButton.click();
    await createRequestPromise;
    await expect(createSaveButton).toBeDisabled();
    const created = await createResponsePromise;
    await createClick;
    httpEvidence.create = created.status();
    expect(created.status()).toBe(201);
    const createdBody = await created.json() as { id?: unknown };
    if (typeof createdBody.id !== "number" || !Number.isSafeInteger(createdBody.id)) throw new Error("EquipmentTypes POST 201 did not return a numeric ID.");
    const primaryId = createdBody.id;
    await registerOwnedEquipmentType(manifestPath, { id: primaryId, name: uiName, userId: identity.userId, tenantId: identity.tenantId, executionId, operation: "create", createHttp: 201 });
    httpEvidence.createId = primaryId;
    expect(created.request().postDataJSON()).toEqual({ name: uiName, description: unique + " description", isActive: true });
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    expect(mutationRequests.length).toBe(beforeCreate + 1);
    const createdDetail = await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId + "/");
    httpEvidence.createRead = createdDetail.status;
    expect(createdDetail.status).toBe(200);
    expect(createdDetail.body).toMatchObject({ id: primaryId, tenantId: identity.tenantId, name: uiName, isActive: true });

    const search = page.getByPlaceholder(searchLabel);
    await search.fill(unique);
    const primaryRow = page.getByRole("row", { name: new RegExp(uiName) });
    await expect(primaryRow).toBeVisible();
    await primaryRow.getByRole("button", { name: /edit|editar/i }).click();
    await expect(page).toHaveURL(new RegExp("/equipment-types/" + primaryId + "/$"));
    await expect(page.getByTestId("equipment-type-details-page-root")).toBeVisible();
    const editForm = page.locator("form");
    await expect(page.getByTestId("equipment-type-persisted-status")).toBeVisible();
    await expect(page.getByTestId("equipment-type-is-active-switch")).toBeChecked();
    await captureEvidence(page, testInfo, "equipment-types-edit.png");

    await page.getByRole("textbox", { name: descriptionLabel }).fill(unique + " updated");
    await page.getByTestId("equipment-type-is-active-switch").click();
    await expect(page.getByTestId("equipment-type-is-active-switch")).not.toBeChecked();
    expect(mutationRequests.filter((item) => ["PUT", "PATCH"].includes(item.method))).toHaveLength(0);
    await captureEvidence(page, testInfo, "equipment-types-edit-inactive-before-save.png");
    const updateResponsePromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/"));
    await editForm.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const updated = await updateResponsePromise;
    httpEvidence.update = updated.status();
    expect(updated.status()).toBe(204);
    expect(updated.request().postDataJSON()).toEqual({ name: uiName, description: unique + " updated", isActive: false });
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    const inactiveDetail = await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId + "/");
    httpEvidence.updateRead = inactiveDetail.status;
    expect(inactiveDetail.status).toBe(200);
    expect(inactiveDetail.body).toMatchObject({ description: unique + " updated", isActive: false });

    await search.fill(unique);
    const rowAfterPut = page.getByRole("row", { name: new RegExp(uiName) });
    await expect(rowAfterPut).toBeVisible();
    await rowAfterPut.getByRole("button", { name: /edit|editar/i }).click();
    await expect(page.getByTestId("equipment-type-is-active-switch")).not.toBeChecked();
    await page.getByTestId("equipment-type-is-active-switch").click();
    const reactivateResponsePromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/"));
    await page.locator("form").getByRole("button", { name: /save|guardar|salvar/i }).click();
    const reactivated = await reactivateResponsePromise;
    httpEvidence.reactivateByPut = reactivated.status();
    expect(reactivated.status()).toBe(204);
    expect(reactivated.request().postDataJSON()).toMatchObject({ isActive: true });
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    expect(mutationRequests.filter((item) => item.method === "PATCH")).toHaveLength(0);

    await search.fill(unique);
    const activeRow = page.getByRole("row", { name: new RegExp(uiName) });
    await expect(activeRow).toBeVisible();
    const deactivatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/deactivate/"));
    await activeRow.getByRole("button", { name: /deactivate|desativar|desactivar/i }).click();
    httpEvidence.deactivate = (await deactivatePromise).status();
    expect(httpEvidence.deactivate).toBe(200);
    expect((await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId + "/")).body).toMatchObject({ isActive: false });
    await search.fill(unique);
    const inactiveRow = page.getByRole("row", { name: new RegExp(uiName) });
    const activatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/activate/"));
    await inactiveRow.getByRole("button", { name: /activate|ativar|activar/i }).click();
    httpEvidence.activate = (await activatePromise).status();
    expect(httpEvidence.activate).toBe(200);
    expect((await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId + "/")).body).toMatchObject({ isActive: true });

    const beforeConflict = await listExact(request, (await refreshForRequest(request, identity)).accessToken, uiName);
    expect(beforeConflict.status).toBe(200);
    const beforeConflictItems = (beforeConflict.body as { items?: Array<{ id: number; name: string }> } | null)?.items ?? [];
    expect(beforeConflictItems.filter((item) => item.name === uiName).map((item) => item.id)).toEqual([primaryId]);
    const conflictIntentName = uiName;
    await beginEquipmentTypesCreate(manifestPath, { name: conflictIntentName, userId: identity.userId, tenantId: identity.tenantId, executionId, operation: "create" });
    const conflict = await api(page, "POST", "/api/gerit/v1/equipment-types/", { name: uiName, description: unique + " conflict", isActive: true });
    httpEvidence.conflict = conflict.status;
    if (conflict.status === 201) {
      const unexpectedCreatedBody = conflict.body as { id?: unknown } | null;
      if (typeof unexpectedCreatedBody?.id === "number" && Number.isSafeInteger(unexpectedCreatedBody.id)) {
        await registerOwnedEquipmentType(manifestPath, {
          id: unexpectedCreatedBody.id, name: conflictIntentName, userId: identity.userId, tenantId: identity.tenantId,
          executionId, operation: "create", createHttp: 201,
        });
      }
    }
    expect(conflict.status).toBe(409);
    const afterConflict = await listExact(request, (await refreshForRequest(request, identity)).accessToken, uiName);
    expect(afterConflict.status).toBe(200);
    const exactMatches = ((afterConflict.body as { items?: Array<{ id: number; name: string }> } | null)?.items ?? []).filter((item) => item.name === uiName);
    expect(exactMatches).toHaveLength(1);
    expect(exactMatches[0].id).toBe(primaryId);
    await resolveRejectedEquipmentTypeCreate(manifestPath, { name: conflictIntentName, executionId, expectedExistingId: primaryId });

    if (bulkUploadAuthorized) {
      const csvMarkerCheck = await listExact(request, (await refreshForRequest(request, identity)).accessToken, csvName);
      httpEvidence.csvMarkerPrecheck = csvMarkerCheck.status;
      if (csvMarkerCheck.status !== 200) throw new Error("EquipmentTypes BulkUpload marker precheck could not read the authorized tenant list.");
      const csvMarkerItems = (csvMarkerCheck.body as { items?: Array<{ name: string }> } | null)?.items ?? [];
      if (csvMarkerItems.some((item) => item.name === csvName)) throw new Error("The unique EquipmentTypes BulkUpload marker already exists; upload was blocked.");
      const csv = "Name;Description\r\n" + csvName + ";" + unique + " CSV description\r\n";
      await beginEquipmentTypesCreate(manifestPath, { name: csvName, userId: identity.userId, tenantId: identity.tenantId, executionId, operation: "bulk-upload" });
      const uploadResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/equipment-types/bulk-upload");
      await search.fill("");
      await page.locator("#equipment-types-csv-upload").setInputFiles({ name: "equipment-types-e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
      const uploadResponse = await uploadResponsePromise;
      httpEvidence.csvImport = uploadResponse.status();
      const uploadBody = await uploadResponse.json().catch(() => null);
      httpEvidence.csvResult = uploadBody === true;
      const fresh = await refreshForRequest(request, identity);
      const reconciled = await reconcileEquipmentTypesCreate(manifestPath, {
        executionId,
        list: async (name) => {
          const result = await listExact(request, fresh.accessToken, name);
          return { status: result.status, body: result.body as { items?: Array<{ id: number; name: string }> } | null };
        },
        get: async (id) => {
          const result = await getDetail(request, fresh.accessToken, id);
          return { status: result.status, body: result.body as { id?: number; name?: string; tenantId?: number } | null };
        },
      });
      const importedRecord = reconciled.find((record) => record.name === csvName && typeof record.id === "number");
      if (!importedRecord || importedRecord.id === null) {
        throw new Error("BulkUpload marker was not reconciled to exactly one created EquipmentType.");
      }
      httpEvidence.csvId = importedRecord.id;
      expect(uploadResponse.status()).toBe(200);
      expect(uploadBody).toBe(true);
    } else {
      httpEvidence.csvImport = "SKIPPED_NO_BULKUPLOAD_GRANT";
    }

    await search.fill(unique);
    const editPrimaryRow = page.getByRole("row", { name: new RegExp(uiName) });
    await editPrimaryRow.getByRole("button", { name: /edit|editar/i }).click();
    await expect(page).toHaveURL(new RegExp("/equipment-types/" + primaryId + "/$"));
    const deleteButton = page.locator("form").getByRole("button", { name: /delete|eliminar|excluir/i });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: /cancel|cancelar/i }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await deleteButton.click();
    const deletePromise = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/"));
    await markEquipmentTypeDeleteAttempted(manifestPath, primaryId);
    await page.getByRole("alertdialog").getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    httpEvidence.delete = (await deletePromise).status();
    expect(httpEvidence.delete).toBe(200);
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    const postDelete = await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId + "/");
    httpEvidence.postDeleteGet = postDelete.status;
    expect(postDelete.status).toBe(410);
    await confirmEquipmentTypeDelete(manifestPath, { id: primaryId, executionId, deleteHttp: 200, followUpReadHttp: 410 });
  } finally {
    let cleanupError: unknown = null;
    if (identity) {
      try {
        const session = await refreshForRequest(request, identity);
        const cleaned = await cleanupOwnedEquipmentTypes({
          path: manifestPath,
          executionId,
          session: { userId: identity.userId, tenantId: identity.tenantId, accessToken: session.accessToken },
          api: async (method, id, token) => {
            const response = await request.fetch("/api/gerit/v1/equipment-types/" + id + "/", { method, headers: { Authorization: "Bearer " + token } });
            return { status: response.status(), body: await response.json().catch(() => null) };
          },
          reconcile: async () => {
            const refreshed = await refreshForRequest(request, identity!);
            await reconcileEquipmentTypesCreate(manifestPath, {
              executionId,
              list: async (name) => {
                const result = await listExact(request, refreshed.accessToken, name);
                return { status: result.status, body: result.body as { items?: Array<{ id: number; name: string }> } | null };
              },
              get: async (id) => {
                const result = await getDetail(request, refreshed.accessToken, id);
                return { status: result.status, body: result.body as { id?: number; name?: string; tenantId?: number } | null };
              },
            });
          },
        });
        for (const record of cleaned.records.filter((item) => item.executionId === executionId)) {
          if (record.id === null) continue;
          cleanupEvidence.push({ id: record.id, deleteStatus: record.deleteHttp, getStatus: record.followUpReadHttp });
        }
        httpEvidence.cleanupVerified = cleaned.status === "verified";
        const finalInventory = await listExact(request, session.accessToken, unique);
        if (finalInventory.status !== 200) throw new Error("EquipmentTypes cleanup could not verify the final active listing.");
        const finalItems = (finalInventory.body as { items?: Array<{ id: number; name: string }> } | null)?.items ?? [];
        const expectedNames = bulkUploadAuthorized ? [uiName, csvName] : [uiName];
        const residuals = finalItems.filter((item) => expectedNames.includes(item.name));
        httpEvidence.residualCount = residuals.length;
        if (residuals.length > 0) throw new Error("EquipmentTypes cleanup left a record from this execution in the active list.");
      } catch (error) {
        cleanupError = error;
        httpEvidence.cleanupVerified = false;
      }
    } else {
      httpEvidence.cleanupVerified = false;
    }
    await testInfo.attach("equipment-types-http-cleanup-evidence", {
      body: Buffer.from(JSON.stringify({ executionId, http: httpEvidence, cleanup: cleanupEvidence }, null, 2)),
      contentType: "application/json",
    });
    if (cleanupError) throw cleanupError;
  }
});

async function refreshForRequest(
  request: APIRequestContext,
  owner: { userId: number; tenantId: number; refreshToken: string },
) {
  const response = await request.post("/api/auth/refresh/", {
    data: { tenantId: owner.tenantId, refreshToken: owner.refreshToken },
    headers: { "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => null) as { accessToken?: unknown; refreshToken?: unknown; userId?: unknown; tenantId?: unknown } | null;
  if (response.status() !== 200 || typeof body?.accessToken !== "string" || typeof body.refreshToken !== "string" ||
      body.userId !== owner.userId || body.tenantId !== owner.tenantId) {
    throw new Error("EquipmentTypes authenticated refresh did not preserve the verified user and tenant.");
  }
  owner.refreshToken = body.refreshToken;
  return { accessToken: body.accessToken };
}

async function resolveRejectedEquipmentTypeCreate(
  path: string,
  input: { name: string; executionId: string; expectedExistingId: number },
) {
  await resolveEquipmentTypeRejectedCreate(path, input);
}
