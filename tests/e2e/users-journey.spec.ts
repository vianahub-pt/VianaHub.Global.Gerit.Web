import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";
import { authorizeUsersQaMutations } from "../users/users-e2e-authorization";
import {
  assertUsersInventoryIsUnused,
  cleanupUsersInventory,
  reconcileUsersInventory,
  type CleanupApi,
  type UserCleanupInventory,
  type UserInventoryEntry,
} from "../users/users-e2e-cleanup";

test.use({ trace: "off", screenshot: "off", video: "off" });

const userNameLabel = /^(name|nome|nombre)$/i;
const emailLabel = /^(email|e-mail|correo)$/i;
const passwordLabel = /^(password|senha|palavra-passe|contraseña)$/i;
const confirmPasswordLabel = /^(confirm password|confirmar senha|confirmar palavra-passe|confirmar contraseña)$/i;
const phoneLabel = /^(phone number|telefone|número de teléfono|número de telefone)$/i;
const administrationLabel = /^(administration|administração|administración)$/i;
const usersLabel = /^(users|utilizadores|usuários|usuarios)$/i;
const searchPlaceholder = /^(search by name or email|pesquisar por nome ou e-mail|buscar por nombre o correo)$/i;
const activeLabel = /^(active|ativo|ativa|activos|ativos|activa)$/i;
const inactiveLabel = /^(inactive|inativo|inativa|inactivos|inativos)$/i;
const allLabel = /^(show all|mostrar todos|mostrar todas)$/i;
const saveLabel = /^(save|guardar|salvar)$/i;
const deleteLabel = /^(delete|eliminar|excluir)$/i;
const backToUsersLabel = /^(back|voltar|volver)$/i;

async function installVisualPointer(page: Page) {
  await page.addInitScript((visual) => {
    if (!visual) return;
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer-style")) return;
      const style = document.createElement("style");
      style.id = "gerit-e2e-pointer-style";
      style.textContent = "#gerit-e2e-pointer{position:fixed;z-index:2147483647;left:0;top:0;width:20px;height:20px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:left .12s ease-out,top .12s ease-out,opacity .08s ease;box-shadow:0 0 0 4px rgba(255,59,48,.22)}#gerit-e2e-pointer.visible{opacity:.9}#gerit-e2e-pointer.clicked{animation:gerit-e2e-click .45s ease-out}@keyframes gerit-e2e-click{0%{box-shadow:0 0 0 3px rgba(255,59,48,.45);transform:translate(-50%,-50%) scale(.8)}100%{box-shadow:0 0 0 15px rgba(255,59,48,0);transform:translate(-50%,-50%) scale(1.2)}}";
      document.head.appendChild(style);
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      document.body.appendChild(pointer);
      const movePointer = (x: number, y: number) => {
        pointer.style.left = `${x}px`;
        pointer.style.top = `${y}px`;
        pointer.classList.add("visible");
      };
      document.addEventListener("pointermove", (event) => movePointer(event.clientX, event.clientY), true);
      document.addEventListener("focusin", (event) => {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        movePointer(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      }, true);
      document.addEventListener("pointerdown", () => {
        pointer.classList.remove("clicked");
        void pointer.offsetWidth;
        pointer.classList.add("clicked");
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");
}

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
    const response = await fetch(path, {
      method,
      headers: {
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { method, path, body });
}

async function missingUsersGrants(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("gerit.auth.session.v1");
      const token = raw ? (JSON.parse(raw) as { accessToken?: unknown }).accessToken : undefined;
      if (typeof token !== "string") return ["authenticated token"];
      const payload = token.split(".")[1]; if (!payload) return ["permission claims"];
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="));
      const claims = JSON.parse(decoded) as { role?: unknown; permissions?: Record<string, unknown> };
      const roles = Array.isArray(claims.role) ? claims.role : [claims.role];
      if (!roles.some((r) => typeof r === "string" && ["admin", "backoffice"].includes(r.trim().toLowerCase()))) return ["Admin/BackOffice role"];
      const entry = Object.entries(claims.permissions ?? {}).find(([resource]) => resource.trim().toLowerCase() === "users")?.[1];
      const actions = Array.isArray(entry) ? entry.filter((a): a is string => typeof a === "string").map((a) => a.trim().toLowerCase()) : [];
      return ["getpaged", "getby", "create", "update", "activate", "deactivate", "delete", "bulkupload"].filter((a) => !actions.includes(a));
    } catch { return ["readable permission claims"]; }
  });
}

test("Users canonical CRUD, tenant-scoped auth, status filters, CSV, and deterministic cleanup", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const authorization = authorizeUsersQaMutations(
    process.env.GERIT_API_BASE_URL,
    process.env.E2E_USERS_QA_MUTATION_APPROVAL,
  );
  const unique = randomUUID();
  const prefix = `E2E Users ${unique}`;
  const primaryName = `${prefix} 00 primary`;
  const editedName = `${prefix} 00 updated`;
  const csvNames = Array.from({ length: 10 }, (_, index) => `${prefix} CSV ${String(index + 1).padStart(2, "0")}`);
  const primaryEmail = `e2e-users-${unique}@example.invalid`;
  const editedEmail = `e2e-users-${unique}-updated@example.invalid`;
  const primaryPassword = `Aa1!${randomUUID()}z`;
  const csvPassword = `Bb2!${randomUUID()}y`;
  const queryUrls: URL[] = [];
  const missingAuth: string[] = [];
  const tenantFields: string[] = [];
  const unsafeImageUrls: string[] = [];
  const requestChecks: Promise<void>[] = [];
  let authenticated = false;
  const inventory: UserCleanupInventory = {
    schemaVersion: 1,
    runId: unique,
    target: authorization.target,
    startedAt: new Date().toISOString(),
    state: "planned",
    errors: [],
    users: [
      { key: "primary", email: primaryEmail, alternateEmails: [editedEmail], expectedNames: [primaryName, editedName], id: null, createAttempted: false, createSucceeded: false, deleted: false, deleteStatus: null, getStatus: null },
      ...csvNames.map((name, index): UserInventoryEntry => ({
        key: `csv-${String(index + 1).padStart(2, "0")}`,
        email: `e2e-users-${unique}-${index + 1}@example.invalid`,
        expectedNames: [name], id: null, createAttempted: false, createSucceeded: false,
        deleted: false, deleteStatus: null, getStatus: null,
      })),
    ],
  };
  const inventoryPath = testInfo.outputPath("users-cleanup-inventory.json");
  const persistInventory = async () => {
    await mkdir(dirname(inventoryPath), { recursive: true });
    await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  };
  const cleanupApi: CleanupApi = {
    list: async (search, pageNumber, pageSize) => {
      const result = await api(page, "GET", `/api/gerit/v1/users/paged?Search=${encodeURIComponent(search)}&PageNumber=${pageNumber}&PageSize=${pageSize}&SortBy=Name&SortDirection=asc`);
      return { status: result.status, body: result.body };
    },
    delete: async (id) => ({ status: (await api(page, "DELETE", `/api/gerit/v1/users/${id}`)).status }),
    get: async (id) => ({ status: (await api(page, "GET", `/api/gerit/v1/users/${id}`)).status }),
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes("/api/gerit/v1/users")) return;
    if (request.method() === "POST" || request.method() === "PUT") { try { const body = request.postDataJSON() as Record<string, unknown> | null; if (typeof body?.urlImage === "string" && /^(blob:|data:)/i.test(body.urlImage)) unsafeImageUrls.push(url.pathname); } catch { /* Multipart is checked separately. */ } }
    if (url.pathname.endsWith("/paged") || url.pathname.endsWith("/paged/")) queryUrls.push(url);
    if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === "tenantid")) tenantFields.push("query");
    const contentType = request.headers()["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = request.postDataJSON() as Record<string, unknown> | null;
        if (body && Object.keys(body).some((key) => key.toLowerCase() === "tenantid")) tenantFields.push("body");
      } catch { /* Non-JSON request bodies are not interpreted as DTOs. */ }
    }
    requestChecks.push(request.allHeaders().then((headers) => {
      if (Object.keys(headers).some((key) => key.toLowerCase().replaceAll("-", "").endsWith("tenantid"))) tenantFields.push("header");
      if (!headers.authorization?.startsWith("Bearer ")) missingAuth.push(url.pathname);
    }));
  });

  try {
    await persistInventory();
    await installVisualPointer(page);
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await authenticateFromLogin(page);
    authenticated = true;
    const missingGrants = await missingUsersGrants(page);
    if (missingGrants.length > 0) throw new Error("Users QA identity is missing required role/grants before mutation: " + missingGrants.join(", ") + ".");
    await assertUsersInventoryIsUnused(inventory.users, cleanupApi.list);
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const administration = sidebar.getByRole("button", { name: administrationLabel });
    await expect(administration).toBeVisible();
    const expanded = await administration.getAttribute("aria-expanded");
    if (expanded === "false") await administration.click();
    else if (expanded !== "true") throw new Error("Administration menu does not expose an expansion state.");
    await expect(administration).toHaveAttribute("aria-expanded", "true");
    const usersLink = sidebar.getByRole("link", { name: usersLabel });
    await expect(usersLink).toBeVisible();
    await usersLink.click();
    await expect(page).toHaveURL(/\/users\/$/);
    await expect(page.getByTestId("users-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("button", { name: /add|adicionar|agregar/i })).toBeVisible();
    await expect(page.locator("#users-csv-upload")).toBeAttached();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("1");

    expect(queryUrls.at(-1)?.searchParams.has("IsActive")).toBe(false);

    const statusFilter = page.getByRole("combobox", { name: /status|estado/i }).first();
    await statusFilter.click();
    await page.getByRole("option", { name: inactiveLabel }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("IsActive")).toBe("false");
    await statusFilter.click();
    await page.getByRole("option", { name: activeLabel }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("IsActive")).toBe("true");
    await statusFilter.click();
    await page.getByRole("option", { name: allLabel }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.has("IsActive")).toBe(false);

    const firstDataRow = page.getByRole("row").nth(1);
    await expect(firstDataRow.getByRole("button")).toHaveCount(3);
    await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
    await expect(page).toHaveURL(/\/users\/new\/$/);
    await expect(page.getByTestId("users-create-page-root")).toBeVisible();
    const saveButton = page.getByRole("button", { name: saveLabel });
    const imageSection = page.locator('[data-testid="user-fields-section"] section').filter({ has: page.locator('input[type="file"]') });
    await expect(page.locator('input[type="url"]')).toHaveCount(0);
    await expect(page.getByText(/no image selected|sem imagem|sin imagen/i)).toBeVisible();
    const fileInput = page.locator('input[type="file"]');
    const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jpS8AAAAASUVORK5CYII=", "base64");
    await fileInput.setInputFiles({ name: "valid-preview.png", mimeType: "image/png", buffer: validPng });
    await expect(imageSection.locator("img")).toBeVisible();
    await expect(imageSection.getByRole("button", { name: /local preview|pré-visualização local|previsualización local/i })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /storage|armazenamento|upload/i })).toBeVisible();
    await expect(saveButton).toBeDisabled();
    await imageSection.getByRole("button", { name: /remove image|remover imagem|eliminar imagem/i }).click();
    await expect(page.getByText(/no image selected|sem imagem|sin imagen/i)).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await fileInput.setInputFiles({ name: "not-an-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await expect(page.getByRole("alert").filter({ hasText: /invalid|inválid|invalido|formato/i })).toBeVisible();
    await fileInput.setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByRole("alert").filter({ hasText: /5\s?mb|large|grande|tamanho|tamaño/i })).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await page.getByLabel(userNameLabel).fill(primaryName);
    await page.getByLabel(emailLabel).fill(primaryEmail);
    await page.getByLabel(phoneLabel).fill("+351 910 000 000");
    await page.getByLabel(passwordLabel).fill(primaryPassword);
    await page.getByLabel(confirmPasswordLabel).fill(primaryPassword);
    inventory.state = "mutating";
    inventory.users[0].createAttempted = true;
    await persistInventory();
    const createResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/users/"));
    await page.getByRole("button", { name: saveLabel }).click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.json().catch(() => null) as { id?: unknown } | null;
    inventory.users[0].createSucceeded = createResponse.status() === 201 && Number.isInteger(createBody?.id) && Number(createBody?.id) > 0;
    if (typeof createBody?.id === "number" && Number.isInteger(createBody.id) && createBody.id > 0) inventory.users[0].id = createBody.id;
    await persistInventory();
    expect(createResponse.status()).toBe(201);
    expect(typeof createBody?.id === "number" && Number.isInteger(createBody.id) && createBody.id > 0).toBe(true);
    if (!createBody || typeof createBody.id !== "number" || !Number.isInteger(createBody.id) || createBody.id <= 0) {
      throw new Error("Create response did not include a valid user ID.");
    }
    const userId = createBody.id;
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/$`));
    await expect(page.getByTestId("user-details-page-root")).toBeVisible();
    expect(await api(page, "GET", `/api/gerit/v1/users/${userId}`)).toMatchObject({ status: 200 });
    await expect(page.getByLabel(userNameLabel)).toHaveValue(primaryName);
    await expect(page.getByLabel(emailLabel)).toHaveValue(primaryEmail);
    await expect(page.getByLabel(phoneLabel)).toBeVisible();
    await expect(page.getByText(/no image selected|sem imagem|sin imagen/i)).toBeVisible();
    await expect(page.locator('input[type="url"]')).toHaveCount(0);
    const fixtureImageUrl = new URL("/__e2e__/missing-users-image-" + unique + ".png", page.url()).toString();
    const seedImage = await api(page, "PUT", "/api/gerit/v1/users/" + userId, { name: primaryName, email: primaryEmail, phoneNumber: "+351 910 000 000", urlImage: fixtureImageUrl });
    expect(seedImage).toMatchObject({ status: 200, body: true });
    await page.reload();
    await expect(page.getByTestId("user-details-page-root")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /could not load|não foi possível|no se pudo cargar/i })).toBeVisible();
    await fileInput.setInputFiles({ name: "pending-local.png", mimeType: "image/png", buffer: validPng });
    await expect(saveButton).toBeDisabled();
    await imageSection.getByRole("button", { name: /remove image|remover imagem|eliminar imagem/i }).click();
    await expect(saveButton).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: /could not load|não foi possível|no se pudo cargar/i })).toBeVisible();
    await page.getByLabel(userNameLabel).fill(editedName);
    await page.getByLabel(emailLabel).fill(editedEmail);
    await page.getByLabel(phoneLabel).fill("+351 210 000 000");
    const updateResponsePromise = page.waitForResponse((response) =>
      response.status() === 200 && response.request().method() === "PUT" &&
      new URL(response.url()).pathname.replace(/\/+$/, "") === `/api/gerit/v1/users/${userId}`);
    await page.getByRole("button", { name: saveLabel }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);
    expect(await updateResponse.json()).toBe(true);
    const persisted = await api(page, "GET", `/api/gerit/v1/users/${userId}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body).toMatchObject({ id: userId, name: editedName, email: editedEmail, phoneNumber: "+351 210 000 000", urlImage: fixtureImageUrl });

    const preservedImage = await api(page, "GET", "/api/gerit/v1/users/" + userId);
    expect(preservedImage).toMatchObject({ status: 200, body: { urlImage: fixtureImageUrl } });
    await imageSection.getByRole("button", { name: /remove image|remover imagem|eliminar imagem/i }).click();
    const removeImageResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "PUT" && new URL(response.url()).pathname.replace(/\/+$/, "") === "/api/gerit/v1/users/" + userId);
    await page.getByRole("button", { name: saveLabel }).click();
    const removeImageResponse = await removeImageResponsePromise;
    expect(await removeImageResponse.json()).toBe(true);
    expect(removeImageResponse.request().postDataJSON()).toMatchObject({ urlImage: null, email: editedEmail });
    expect(await api(page, "GET", "/api/gerit/v1/users/" + userId)).toMatchObject({ status: 200, body: { urlImage: null } });
    await page.reload();
    await expect(page.getByText(/no image selected|sem imagem|sin imagen/i)).toBeVisible();
    await page.getByTestId("user-details-page-root").getByRole("button", { name: backToUsersLabel }).filter({ hasText: backToUsersLabel }).click();
    await expect(page).toHaveURL(/\/users\/$/);

    const search = page.getByPlaceholder(searchPlaceholder);
    await search.fill(editedEmail);
    const primaryRow = page.getByRole("row").filter({ hasText: editedEmail });
    await expect(primaryRow).toBeVisible();
    await expect(primaryRow.getByRole("button")).toHaveCount(3);
    await primaryRow.getByRole("button", { name: /edit|editar/i }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/$`));
    await expect(page.getByLabel(emailLabel)).toHaveValue(editedEmail);
    await page.getByTestId("user-details-page-root").getByRole("button", { name: backToUsersLabel }).filter({ hasText: backToUsersLabel }).click();
    await expect(page).toHaveURL(/\/users\/$/);
    await search.fill(editedEmail);

    const deactivateRow = page.getByRole("row").filter({ hasText: editedEmail });
    await deactivateRow.getByRole("button", { name: /deactivate|desativar|desactivar/i }).click();
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/users/${userId}`)).body).toMatchObject({ isActive: false });
    const activateRow = page.getByRole("row").filter({ hasText: editedEmail });
    await activateRow.getByRole("button", { name: /activate|ativar|activar/i }).click();
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/users/${userId}`)).body).toMatchObject({ isActive: true });

    const detailResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "GET" && new URL(response.url()).pathname.replace(/\/+$/, "") === `/api/gerit/v1/users/${userId}`);
    await page.getByRole("row").filter({ hasText: editedEmail }).click();
    await detailResponsePromise;
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/$`));
    await expect(page.getByLabel(userNameLabel)).toHaveValue(editedName);
    await page.getByTestId("user-details-page-root").getByRole("button", { name: backToUsersLabel }).filter({ hasText: backToUsersLabel }).click();
    await expect(page).toHaveURL(/\/users\/$/);

    const csvRows = ["Name;Email;Password;PhoneNumber", ...csvNames.map((name, index) => `${name};${inventory.users[index + 1].email};${csvPassword};+351 910 000 ${String(index + 1).padStart(4, "0")}`)];
    const csvBody = Buffer.from(`\uFEFF${csvRows.join("\n")}\n`, "utf8");
    for (const entry of inventory.users.slice(1)) entry.createAttempted = true;
    await persistInventory();
    const bulkResponsePromise = page.waitForResponse((response) =>
      response.status() === 200 && response.request().method() === "POST" &&
      new URL(response.url()).pathname.replace(/\/+$/, "") === "/api/gerit/v1/users/bulk-upload");
    await page.locator("#users-csv-upload").setInputFiles({ name: "users-e2e.csv", mimeType: "text/csv", buffer: csvBody });
    const bulkResponse = await bulkResponsePromise;
    const bulkResult = await bulkResponse.json().catch(() => null);
    const bulkSucceeded = bulkResponse.status() === 200 && bulkResult === true;
    for (const entry of inventory.users.slice(1)) entry.createSucceeded = bulkSucceeded;
    await persistInventory();
    expect(bulkResponse.status()).toBe(200);
    expect(bulkResult).toBe(true);
    const csvReconciliation = await reconcileUsersInventory(inventory.users.slice(1), cleanupApi.list, () => true);
    for (const entry of inventory.users.slice(1)) entry.id = csvReconciliation.get(entry.key)?.id ?? null;
    await persistInventory();

    await search.fill(editedEmail);
    await expect(page.getByRole("row").filter({ hasText: editedName })).toBeVisible();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("Search")).toBe(editedEmail);
    await search.fill(prefix);
    await expect(page.getByRole("row").filter({ hasText: editedName })).toBeVisible();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageSize")).toBe("10");
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("Search")).toBe(prefix);
    await expect.poll(async () => {
      const response = await api(page, "GET", `/api/gerit/v1/users/paged?Search=${encodeURIComponent(prefix)}&PageNumber=1&PageSize=20&SortBy=Name&SortDirection=asc`);
      const body = response.body as { totalItems?: number } | null;
      return body?.totalItems;
    }).toBe(11);
    await expect(page.getByRole("button", { name: /next|seguinte|próximo|siguiente/i })).toBeEnabled();
    await page.getByRole("button", { name: /next|seguinte|próximo|siguiente/i }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("2");
    await expect(page.getByRole("row").filter({ hasText: editedName })).toHaveCount(0);
    await page.getByRole("button", { name: /previous|anterior/i }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("1");
    await search.fill(editedEmail);
    const deleteRow = page.getByRole("row").filter({ hasText: editedEmail });
    await deleteRow.getByRole("button", { name: deleteLabel }).click();
    const confirmDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(confirmDialog).toBeVisible();
    const deleteResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "DELETE" && new URL(response.url()).pathname.replace(/\/+$/, "") === `/api/gerit/v1/users/${userId}`);
    await confirmDialog.getByRole("button", { name: deleteLabel }).click();
    const primaryDeleteResponse = await deleteResponsePromise;
    inventory.users[0].deleteStatus = primaryDeleteResponse.status();
    expect(primaryDeleteResponse.status()).toBe(200);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/users/${userId}`)).status).toBe(410);
    inventory.users[0].getStatus = 410;
    inventory.users[0].deleted = true;
    await persistInventory();
    await expect(page).toHaveURL(/\/users\/$/);

  } finally {
    let cleanupResult: { ok: boolean; errors: string[] } = { ok: true, errors: [] };
    if (authenticated && inventory.users.some((entry) => entry.createAttempted)) {
      cleanupResult = await cleanupUsersInventory(inventory, cleanupApi, persistInventory);
    } else if (inventory.users.some((entry) => entry.createAttempted)) {
      inventory.errors.push("Mutation was attempted but authenticated cleanup could not run.");
      inventory.state = "cleanup-failed";
      cleanupResult = { ok: false, errors: [...inventory.errors] };
      await persistInventory();
    } else {
      await persistInventory();
    }
    await testInfo.attach("users-cleanup-inventory", { path: inventoryPath, contentType: "application/json" });
    await Promise.all(requestChecks);
    expect(missingAuth, "Users API requests without bearer authentication").toEqual([]);
    expect(tenantFields, "Users request included an explicit tenant field").toEqual([]);
    expect(unsafeImageUrls, "Local blob/data URLs must never be sent to the Users API").toEqual([]);
    expect(cleanupResult.errors, "Deterministic cleanup failures").toEqual([]);
    expect(cleanupResult.ok, "Every created Users record must be reconciled and verified as soft-deleted").toBe(true);
  }
});
