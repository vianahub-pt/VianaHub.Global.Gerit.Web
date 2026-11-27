import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { beginRolesConflict, beginRolesCreate, cleanupOwnedRoles, readRolesCleanupManifest, reconcileRolesConflict, reconcileRolesCreate, registerOwnedRole, resolveRolesConflict } from "../../scripts/e2e/roles-cleanup.mjs";
import { authenticateFromLogin } from "./helpers/auth";

const reportDirectory = resolve(".e2e-debug/roles-journey");
const manifestPath = resolve(reportDirectory, "cleanup-manifest.json");
const menuSectionLabel = /^(administration|administração|administración)$/i;
const rolesLabel = /^(roles|papéis|papeis|funciones)$/i;
const nameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripción|descripcion)$/i;
const searchLabel = /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i;
interface ApiResult { status: number; body: any }

async function capture(page: Page, testInfo: TestInfo, file: string) {
  const image = await page.screenshot({ fullPage: true, animations: "disabled" });
  await testInfo.attach(file, { body: image, contentType: "image/png" });
  await writeFile(resolve(reportDirectory, "screenshots", file), image);
}
async function identityFromSession(page: Page, email: string) {
  return page.evaluate((configuredEmail) => {
    try {
      const session = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { userId?: unknown; tenantId?: unknown; email?: unknown; accessToken?: unknown; refreshToken?: unknown } | null;
      if (!session || !Number.isSafeInteger(session.userId) || !Number.isSafeInteger(session.tenantId) || typeof session.email !== "string" || typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") return null;
      const payload = session.accessToken.split(".")[1]; if (!payload) return null;
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown; tenant_id?: unknown; email?: unknown; role?: unknown; permissions?: Record<string, unknown> };
      const configured = configuredEmail.trim().toLowerCase();
      const roles = (Array.isArray(claims.role) ? claims.role : [claims.role]).map((item) => String(item).trim().toLowerCase());
      const grantsEntry = Object.entries(claims.permissions ?? {}).find(([resource]) => resource.trim().toLowerCase().replace(/[\s_-]/g, "") === "roles");
      const grants = Array.isArray(grantsEntry?.[1]) ? grantsEntry[1].map((item) => String(item).trim().toLowerCase().replace(/[\s_-]/g, "")) : [];
      return { userId: session.userId as number, tenantId: session.tenantId as number, refreshToken: session.refreshToken,
        identityMatches: session.email.trim().toLowerCase() === configured && (typeof claims.email !== "string" || claims.email.trim().toLowerCase() === configured) && Number(claims.sub) === session.userId && Number(claims.tenant_id) === session.tenantId,
        roles, grants };
    } catch { return null; }
  }, email);
}
async function refresh(request: APIRequestContext, owner: { userId: number; tenantId: number; refreshToken: string }) {
  const response = await request.post("/api/auth/refresh/", { data: { tenantId: owner.tenantId, refreshToken: owner.refreshToken }, headers: { "Content-Type": "application/json" } });
  const body = await response.json().catch(() => null) as { accessToken?: unknown; refreshToken?: unknown; userId?: unknown; tenantId?: unknown } | null;
  if (response.status() !== 200 || typeof body?.accessToken !== "string" || typeof body.refreshToken !== "string" || body.userId !== owner.userId || body.tenantId !== owner.tenantId) throw new Error("Roles session refresh failed to preserve the verified identity and tenant.");
  owner.refreshToken = body.refreshToken; return { accessToken: body.accessToken };
}
async function apiViaUi(page: Page, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ method, path, body }) => {
    const session = JSON.parse(localStorage.getItem("gerit.auth.session.v1") ?? "null") as { accessToken?: string } | null;
    const response = await fetch(path, { method, headers: { ...(session?.accessToken ? { Authorization: "Bearer " + session.accessToken } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { method, path, body });
}
async function listExact(request: APIRequestContext, token: string, name: string): Promise<ApiResult> {
  const base = "/api/gerit/v1/roles/paged/?Search=" + encodeURIComponent(name) + "&PageSize=100&SortBy=Name&SortDirection=asc";
  const first = await request.get(base + "&PageNumber=1", { headers: { Authorization: "Bearer " + token } });
  const firstBody = await first.json().catch(() => null) as { items?: Array<{ id: number; name: string }>; totalPages?: number } | null;
  if (first.status() !== 200 || !Array.isArray(firstBody?.items) || !Number.isSafeInteger(firstBody.totalPages) || firstBody.totalPages! < 0 || firstBody.totalPages! > 100) return { status: first.status(), body: firstBody };
  const items = [...firstBody.items];
  for (let pageNumber = 2; pageNumber <= firstBody.totalPages!; pageNumber += 1) {
    const response = await request.get(base + "&PageNumber=" + pageNumber, { headers: { Authorization: "Bearer " + token } });
    const body = await response.json().catch(() => null) as { items?: Array<{ id: number; name: string }> } | null;
    if (response.status() !== 200 || !Array.isArray(body?.items)) return { status: response.status(), body };
    items.push(...body.items);
  }
  return { status: 200, body: { ...firstBody, items } };
}
async function listExactViaUi(page: Page, name: string): Promise<ApiResult> {
  const base = "/api/gerit/v1/roles/paged/?Search=" + encodeURIComponent(name) + "&PageSize=100&SortBy=Name&SortDirection=asc";
  const first = await apiViaUi(page, "GET", base + "&PageNumber=1") as ApiResult & { body: { items?: Array<{ id: number; name: string }>; totalPages?: number } | null };
  if (first.status !== 200 || !Array.isArray(first.body?.items) || !Number.isSafeInteger(first.body.totalPages) || first.body.totalPages! < 0 || first.body.totalPages! > 100) return first;
  const items = [...first.body.items];
  for (let pageNumber = 2; pageNumber <= first.body.totalPages!; pageNumber += 1) {
    const response = await apiViaUi(page, "GET", base + "&PageNumber=" + pageNumber) as ApiResult & { body: { items?: Array<{ id: number; name: string }> } | null };
    if (response.status !== 200 || !Array.isArray(response.body?.items)) return response;
    items.push(...response.body.items);
  }
  return { status: 200, body: { ...first.body, items } };
}
async function detail(request: APIRequestContext, token: string, id: number): Promise<ApiResult> {
  const response = await request.get("/api/gerit/v1/roles/" + id + "/", { headers: { Authorization: "Bearer " + token } });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

test("Roles CRUD, grants, lifecycle and persistent cleanup", async ({ page, request }, testInfo) => {
  test.setTimeout(240_000);
  if (process.env.CI === "true" || process.env.E2E_MUTATING_APPROVED !== "true" || process.env.E2E_ROLES_QA_MUTATION_APPROVAL !== "true") throw new Error("Roles QA mutations require the dedicated local per-run approvals; CI remains nonmutating.");
  const previous = await readRolesCleanupManifest(manifestPath);
  if (previous.status !== "clear") throw new Error("Pending or invalid Roles cleanup blocks this run before browser login or mutation.");
  const executionId = randomUUID();
  const marker = "E2E-ROLE-" + executionId;
  const description = marker + " description";
  const evidence: Record<string, string | number | boolean> = {};
  const mutations: Array<{ method: string; path: string; body?: string | null }> = [];
  let owner: Awaited<ReturnType<typeof identityFromSession>> = null;
  let releasePendingPut: (() => void) | null = null;
  await mkdir(resolve(reportDirectory, "screenshots"), { recursive: true });
  try {
    await page.addInitScript(() => { const install=()=>{ const pointer=document.createElement("div");pointer.id="gerit-e2e-pointer";pointer.style.cssText="position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";document.body.appendChild(pointer);document.addEventListener("pointermove",event=>{pointer.style.left=event.clientX+"px";pointer.style.top=event.clientY+"px"},true)};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install(); });
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await authenticateFromLogin(page); evidence.login = 200;
    owner = await identityFromSession(page, process.env.E2E_USER_EMAIL ?? "");
    const required = ["getpaged", "getby", "create", "update", "activate", "deactivate", "delete"];
    if (!owner?.identityMatches || !["admin", "backoffice", "manager"].some((role) => owner!.roles.includes(role)) || required.some((grant) => !owner!.grants.includes(grant))) throw new Error("Roles QA identity, tenant, base role or CRUD grants were not verified before mutation.");
    evidence.identityTenantGrants = true;
    const markerCheck = await listExactViaUi(page, marker);
    evidence.markerPrecheck = markerCheck.status;
    if (markerCheck.status !== 200 || (markerCheck.body.items as Array<{ name: string }>).some((item) => item.name === marker)) throw new Error("Unique Roles marker precheck failed or marker already exists; no mutation started.");
    page.on("request", (event) => { const path = new URL(event.url()).pathname; if (["POST", "PUT", "PATCH", "DELETE"].includes(event.method()) && path.includes("/api/gerit/v1/roles")) mutations.push({ method: event.method(), path, body: event.postData() }); });

    const sidebar = page.getByTestId("desktop-sidebar"); await expect(sidebar).toBeVisible();
    const section = sidebar.getByRole("button", { name: menuSectionLabel }); if (await section.getAttribute("aria-expanded") === "false") await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    const administrationGroupId = await section.getAttribute("aria-controls");
    if (!administrationGroupId) throw new Error("The Administration menu group did not expose its controlled section.");
    const rolesLink = sidebar.locator(`[id="${administrationGroupId}"]`).getByRole("link", { name: rolesLabel });
    await expect(rolesLink).toHaveAttribute("href", /\/roles\/?$/);
    await rolesLink.click();
    await expect(page).toHaveURL(/\/roles\/$/); await expect(page.getByRole("table")).toBeVisible();
    const search = page.getByPlaceholder(searchLabel);
    const status = page.getByTestId("role-is-active-switch");
    await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
    await expect(page).toHaveURL(/\/roles\/new\/$/); await expect(page.getByTestId("role-fields-section").locator(":scope > div")).toHaveClass(/sm:grid-cols-12/);
    await expect(page.getByTestId("role-name-field")).toHaveClass(/sm:col-span-8/); await expect(page.getByTestId("role-name-field")).toHaveClass(/md:col-span-10/);
    await expect(page.getByTestId("role-status-field")).toHaveClass(/sm:col-span-4/); await expect(page.getByTestId("role-status-field")).toHaveClass(/md:col-span-2/);
    await expect(page.getByTestId("role-description-field")).toHaveClass(/sm:col-span-12/); await expect(status).toBeChecked();
    const statusBox = await page.getByTestId("role-status-field").boundingBox(); const descriptionBox = await page.getByTestId("role-description-field").boundingBox();
    expect(statusBox).not.toBeNull(); expect(descriptionBox).not.toBeNull();
    expect(Math.abs((statusBox!.x + statusBox!.width) - (descriptionBox!.x + descriptionBox!.width))).toBeLessThanOrEqual(1);
    await capture(page, testInfo, "roles-create-desktop.png");
    const dark = await page.evaluate(() => document.documentElement.classList.contains("dark")); await page.evaluate(() => document.documentElement.classList.add("dark")); await capture(page, testInfo, "roles-create-dark.png"); await page.evaluate((wasDark) => document.documentElement.classList.toggle("dark", wasDark), dark);
    const desktopSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, testInfo, "roles-create-mobile.png"); await page.setViewportSize(desktopSize);
    await page.getByLabel(nameLabel).fill(marker); await page.getByLabel(descriptionLabel).fill(description);
    await beginRolesCreate(manifestPath, { name: marker, userId: owner!.userId, tenantId: owner!.tenantId, executionId });
    const postPromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/roles");
    await page.getByTestId("role-save-button").click(); const created = await postPromise; evidence.create = created.status(); expect(created.status()).toBe(201);
    const createBody = await created.json() as { id?: unknown }; if (!Number.isSafeInteger(createBody.id)) throw new Error("Roles POST 201 did not return a numeric ID.");
    const roleId = createBody.id as number; await registerOwnedRole(manifestPath, { id: roleId, name: marker, userId: owner!.userId, tenantId: owner!.tenantId, executionId, createHttp: 201 });
    expect(created.request().postDataJSON()).toEqual({ name: marker, description, isActive: true }); expect(created.request().postData() ?? "").not.toMatch(/tenantid/i);
    await expect(page).toHaveURL(/\/roles\/$/);
    await expect(page.getByRole("status").filter({ hasText: /role created successfully|função criada com sucesso|función creada con éxito/i }).first()).toBeVisible();
    let read = await apiViaUi(page, "GET", "/api/gerit/v1/roles/" + roleId + "/"); evidence.createRead = read.status; expect(read.status).toBe(200); expect(read.body).toMatchObject({ id: roleId, name: marker, description, isActive: true });
    await search.fill(marker); const row = page.getByRole("row").filter({ hasText: marker }); await expect(row).toBeVisible();
    await row.getByRole("button", { name: /edit|editar/i }).click(); await expect(page.getByLabel(nameLabel)).toHaveValue(marker); await expect(page.getByLabel(nameLabel)).toBeDisabled(); await expect(status).toBeChecked(); await capture(page, testInfo, "roles-edit-active.png");
    await page.getByTestId("role-description-input").fill(marker + " updated"); await status.click(); await expect(status).not.toBeChecked(); await capture(page, testInfo, "roles-edit-inactive-before-save.png");
    expect(mutations.filter((item) => ["PUT", "PATCH"].includes(item.method))).toHaveLength(0);
    let releaseRequest!: () => void;
    let signalRequestStarted!: () => void;
    const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
    const requestStarted = new Promise<void>((resolve) => { signalRequestStarted = resolve; });
    releasePendingPut = releaseRequest;
    await page.route("**/api/gerit/v1/roles/" + roleId + "/", async (route) => {
      if (route.request().method() === "PUT") {
        signalRequestStarted();
        await requestGate;
      }
      await route.continue();
    });
    const putPromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/roles/" + roleId);
    const saveButton = page.getByTestId("role-save-button");
    await saveButton.click();
    await requestStarted;
    await expect(saveButton).toBeDisabled();
    await expect(saveButton.locator("svg")).toHaveClass(/animate-spin/);
    releaseRequest();
    releasePendingPut = null;
    const updated = await putPromise; evidence.update = updated.status(); expect(updated.status()).toBe(200);
    expect(updated.request().postDataJSON()).toEqual({ description: marker + " updated", isActive: false }); expect(updated.request().postData() ?? "").not.toMatch(/tenantid|"name"/i); await expect(page).toHaveURL(/\/roles\/$/);
    await expect(page.getByRole("status").filter({ hasText: /role updated successfully|função atualizada com sucesso|función actualizada con éxito/i }).first()).toBeVisible();
    read = await apiViaUi(page, "GET", "/api/gerit/v1/roles/" + roleId + "/"); evidence.updateRead = read.status; expect(read.status).toBe(200); expect(read.body).toMatchObject({ name: marker, description: marker + " updated", isActive: false });
    await search.fill(marker); const inactiveRow = page.getByRole("row").filter({ hasText: marker }); await expect(inactiveRow).toBeVisible(); await inactiveRow.getByRole("button", { name: /edit|editar/i }).click(); await expect(status).not.toBeChecked(); await status.click();
    const reactivatePutPromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/roles/" + roleId + "/")); await page.getByTestId("role-save-button").click(); const reactivatedByPut = await reactivatePutPromise; expect(reactivatedByPut.status()).toBe(200); expect(reactivatedByPut.request().postDataJSON()).toEqual({ description: marker + " updated", isActive: true }); await expect(page).toHaveURL(/\/roles\/$/);
    await expect(page.getByRole("status").filter({ hasText: /role updated successfully|função atualizada com sucesso|función actualizada con éxito/i }).first()).toBeVisible();
    await search.fill(marker); const activeRow = page.getByRole("row").filter({ hasText: marker }); await expect(activeRow).toBeVisible();
    const deactivate = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/roles/" + roleId + "/deactivate/")); await activeRow.getByRole("button", { name: /deactivate|desativar|desactivar/i }).click(); const deactivated = await deactivate; evidence.deactivate = deactivated.status(); expect(deactivated.status()).toBe(200);
    await search.fill(marker); const inactiveAgain = page.getByRole("row").filter({ hasText: marker }); const activate = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/roles/" + roleId + "/activate/")); await inactiveAgain.getByRole("button", { name: /activate|ativar|activar/i }).click(); const activated = await activate; evidence.activate = activated.status(); expect(activated.status()).toBe(200);
    const beforeConflict = await listExactViaUi(page, marker); const ids = (beforeConflict.body.items as Array<{id:number;name:string}>).filter((item)=>item.name===marker).map((item)=>item.id); expect(ids).toEqual([roleId]);
    await beginRolesConflict(manifestPath, { name: marker, userId: owner!.userId, tenantId: owner!.tenantId, executionId, expectedExistingId: roleId });
    const conflict = await apiViaUi(page, "POST", "/api/gerit/v1/roles/", {name:marker,description:marker+" duplicate",isActive:true}); evidence.conflict = conflict.status; expect(conflict.status).toBe(409);
    const afterConflict = await listExactViaUi(page, marker); const conflictIds = (afterConflict.body.items as Array<{id:number;name:string}>).filter((item)=>item.name===marker).map((item)=>item.id); await resolveRolesConflict(manifestPath,{name:marker,executionId,expectedExistingId:roleId,observedHttp:409,exactMatchIds:conflictIds});
    await search.fill(marker); const deleteRow=page.getByRole("row").filter({hasText:marker}); await expect(deleteRow).toBeVisible(); await deleteRow.getByRole("button",{name:/delete|eliminar|excluir/i}).click(); const dialog=page.getByRole("alertdialog"); await expect(dialog).toBeVisible(); await dialog.getByRole("button",{name:/cancel|cancelar/i}).click(); await expect(dialog).not.toBeVisible(); expect((await apiViaUi(page,"GET","/api/gerit/v1/roles/"+roleId+"/")).status).toBe(200);
    expect(mutations.filter((item)=>item.method==="PATCH").length).toBe(2); expect(mutations.some((item)=>item.method==="POST"&&item.path.includes("bulk-upload"))).toBe(false);
  } finally {
    releasePendingPut?.();
    let cleanupFailure: Error | null = null;
    if (owner) {
      try {
        const fresh = await refresh(request, owner);
        const cleaned = await cleanupOwnedRoles({ path: manifestPath, executionId, session: { userId: owner.userId, tenantId: owner.tenantId, accessToken: fresh.accessToken }, api: async (method,id,token) => { const response = await request.fetch("/api/gerit/v1/roles/"+id+"/", { method, headers:{Authorization:"Bearer "+token} }); return { status:response.status(), body:await response.json().catch(()=>null) }; }, reconcile: async () => { const token=(await refresh(request,owner!)).accessToken; await reconcileRolesCreate(manifestPath,{executionId,list:async(name)=>listExact(request,token,name),get:async(id)=>detail(request,token,id)}); return reconcileRolesConflict(manifestPath,{executionId,list:async(name)=>listExact(request,token,name),get:async(id)=>detail(request,token,id)}); } });
        evidence.cleanup = cleaned.status;
        evidence.delete = cleaned.records.find((record) => record.operation === "create" && record.executionId === executionId)?.deleteHttp ?? "not-recorded";
        evidence.deleteRead = cleaned.records.find((record) => record.operation === "create" && record.executionId === executionId)?.followUpReadHttp ?? "not-recorded";
      } catch (error) {
        evidence.cleanup = "PENDING";
        cleanupFailure = new Error("Roles cleanup is pending: " + (error instanceof Error ? error.message : "unknown cleanup error"));
      }
    }
    await writeFile(resolve(reportDirectory,"http-evidence.json"),JSON.stringify({executionId,evidence,mutations:mutations.map(({method,path})=>({method,path})) , cleanup:(await readRolesCleanupManifest(manifestPath)).status},null,2)+"\n");
    if (cleanupFailure) throw cleanupFailure;
  }
});

test("Roles cleanup recovery", async ({ page, request }) => {
  test.setTimeout(120_000);
  if (process.env.E2E_ROLES_CLEANUP_RECOVERY !== "true") test.skip(true, "Dedicated cleanup recovery mode was not selected.");
  if (process.env.CI === "true" || process.env.E2E_ROLES_QA_MUTATION_APPROVAL !== "true") throw new Error("Roles cleanup recovery requires its dedicated local opt-in; it never creates records.");
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await authenticateFromLogin(page);
  const owner = await identityFromSession(page, process.env.E2E_USER_EMAIL ?? "");
  if (!owner?.identityMatches || !["admin", "backoffice", "manager"].some((role) => owner!.roles.includes(role)) || ["getby", "getpaged", "delete"].some((grant) => !owner!.grants.includes(grant))) throw new Error("Roles cleanup recovery identity, tenant or read/delete grants could not be verified.");
  const manifest = await readRolesCleanupManifest(manifestPath);
  if (manifest.status !== "pending" || !manifest.manifest) throw new Error("There is no valid pending Roles manifest to recover.");
  if (manifest.manifest.records.some((record) => record.status === "pending" && (record.userId !== owner.userId || record.tenantId !== owner.tenantId))) throw new Error("Pending Roles cleanup belongs to a different authenticated identity or tenant.");
  const executionIds = [...new Set(manifest.manifest.records.filter((record) => record.status === "pending").map((record) => record.executionId))];
  if (executionIds.length !== 1) throw new Error("Pending Roles cleanup contains multiple executions and requires manual reconciliation.");
  const executionId = executionIds[0];
  const fresh = await refresh(request, owner);
  const reconcile = async () => {
    const current = await refresh(request, owner);
    await reconcileRolesCreate(manifestPath, { executionId, list: async (name) => listExact(request, current.accessToken, name), get: async (id) => detail(request, current.accessToken, id) });
    await reconcileRolesConflict(manifestPath, { executionId, list: async (name) => listExact(request, current.accessToken, name), get: async (id) => detail(request, current.accessToken, id) });
  };
  await cleanupOwnedRoles({ path: manifestPath, executionId, session: { userId: owner.userId, tenantId: owner.tenantId, accessToken: fresh.accessToken }, api: async (method, id, token) => { const response = await request.fetch("/api/gerit/v1/roles/" + id + "/", { method, headers: { Authorization: "Bearer " + token } }); return { status: response.status(), body: await response.json().catch(() => null) }; }, reconcile });
  if ((await readRolesCleanupManifest(manifestPath)).status !== "clear") throw new Error("Recovered Roles cleanup is not verified.");
});
