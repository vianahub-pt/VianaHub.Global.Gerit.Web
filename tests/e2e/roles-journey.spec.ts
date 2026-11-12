import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";

const roleNameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripción|descripcion)$/i;
const administrationLabel = /^(administration|administração|administración)$/i;
const rolesLabel = /^(roles|funções|funciones)$/i;
const searchPlaceholder = /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i;

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

test("Roles canonical CRUD, tenant-scoped auth, status filters, CSV and deterministic cleanup", async ({ page }) => {
  test.setTimeout(240_000);
  const createdIds = new Set<number>();
  const unique = randomUUID();
  const roleName = `E2E Role ${unique}`;
  const csvName = `E2E Role CSV ${unique}`;
  const csvRoleNames = Array.from({ length: 10 }, (_, index) => `${csvName} ${String(index + 1).padStart(2, "0")}`);
  const queryUrls: URL[] = [];
  const tenantFieldsSent: string[] = [];
  const roleRequestsWithoutAuth: string[] = [];
  const roleAuthChecks: Promise<void>[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes("/api/gerit/v1/roles")) return;
    if (url.pathname.endsWith("/paged") || url.pathname.endsWith("/paged/")) queryUrls.push(url);
    if (url.searchParams.has("TenantId") || url.searchParams.has("tenantId")) tenantFieldsSent.push("query");
    const body = request.postData();
    if (body && /["'](?:TenantId|tenantId)["']\s*:/.test(body)) tenantFieldsSent.push("body");
    roleAuthChecks.push(request.allHeaders().then((headers) => {
      if (headers["tenantid"] || headers["x-tenant-id"] || headers["x-tenantid"]) tenantFieldsSent.push("header");
      if (!headers.authorization?.startsWith("Bearer ")) roleRequestsWithoutAuth.push(url.pathname);
    }));
  });

  try {
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await authenticateFromLogin(page);
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const administration = sidebar.getByRole("button", { name: administrationLabel });
    await expect(administration).toBeVisible();
    const expanded = await administration.getAttribute("aria-expanded");
    if (expanded === "false") await administration.click();
    else if (expanded !== "true") throw new Error("Administration menu does not expose an expansion state.");
    await expect(administration).toHaveAttribute("aria-expanded", "true");
    const rolesLink = sidebar.getByRole("link", { name: rolesLabel });
    await expect(rolesLink).toBeVisible();
    await rolesLink.click();
    await expect(page).toHaveURL(/\/roles\/$/);
    await expect(page.getByTestId("roles-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("1");

    const pageSize = page.getByRole("combobox", { name: /per page|por página|por pagina/i });
    await pageSize.click();
    await page.getByRole("option", { name: "20", exact: true }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageSize")).toBe("20");

    await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
    await expect(page).toHaveURL(/\/roles\/new\/?$/);
    await expect(page.getByTestId("roles-create-page-root")).toBeVisible();
    await page.getByLabel(roleNameLabel).fill(roleName);
    await page.getByLabel(descriptionLabel).fill(`E2E Description ${unique}`);
    const createResponsePromise = page.waitForResponse((response) => response.status() === 201 && response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/roles/"));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.json() as { id?: unknown };
    expect(typeof createBody.id).toBe("number");
    if (typeof createBody.id === "number") createdIds.add(createBody.id);
    expect(createBody.id).toEqual(expect.any(Number));
    await expect(page).toHaveURL(new RegExp(`/roles/${String(createBody.id)}/?$`));
    await expect(page.getByTestId("role-details-page-root")).toBeVisible();
    await expect(page.getByLabel(roleNameLabel)).toHaveValue(roleName);
    await expect(page.getByLabel(roleNameLabel)).toBeDisabled();
    await expect(page.getByLabel(descriptionLabel)).toHaveValue(`E2E Description ${unique}`);

    const roleId = createBody.id as number;
    const persistedCreate = await api(page, "GET", `/api/gerit/v1/roles/${roleId}/`);
    expect(persistedCreate.status).toBe(200);
    expect(persistedCreate.body).toMatchObject({ id: roleId, name: roleName, description: `E2E Description ${unique}`, isActive: true });

    await page.getByRole("button", { name: /back|voltar|volver/i }).first().click();
    await expect(page).toHaveURL(/\/roles\/$/);
    const search = page.getByPlaceholder(searchPlaceholder);
    await search.fill(roleName);
    const roleRow = page.getByRole("row").filter({ hasText: roleName });
    await expect(roleRow).toBeVisible();
    await roleRow.click();
    await expect(page).toHaveURL(new RegExp(`/roles/${roleId}/?$`));
    await expect(page.getByLabel(roleNameLabel)).toHaveValue(roleName);
    await page.getByLabel(descriptionLabel).fill(`E2E Updated ${unique}`);
    const updateResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith(`/roles/${roleId}/`));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    expect((await updateResponsePromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/roles\/$/);
    const persistedUpdate = await api(page, "GET", `/api/gerit/v1/roles/${roleId}/`);
    expect(persistedUpdate.body).toMatchObject({ name: roleName, description: `E2E Updated ${unique}` });

    const statusFilter = page.getByRole("combobox", { name: /status|estado/i }).first();
    await statusFilter.click();
    await page.getByRole("option", { name: /^(inactive|inativo|inativa|inactiva|inactivos|inactivas)$/i }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("IsActive")).toBe("false");
    await statusFilter.click();
    await page.getByRole("option", { name: /^(active|ativo|ativa|activa|activos|activas)$/i }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("IsActive")).toBe("true");
    await statusFilter.click();
    await page.getByRole("option", { name: /show all|mostrar todos/i }).click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.has("IsActive")).toBe(false);
    await search.fill(roleName);
    await expect(page.getByRole("row").filter({ hasText: roleName })).toBeVisible();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("Search")).toBe(roleName);

    const csvInput = page.locator('input[type="file"][accept=".csv"]');
    await csvInput.setInputFiles({ name: "roles.txt", mimeType: "text/plain", buffer: Buffer.from("invalid", "utf8") });
    await expect(page.getByText(/select a csv file|selecione um arquivo csv|seleccione un archivo csv/i).last()).toBeVisible();
    const invalidUploadPromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/roles/bulk-upload/"));
    await csvInput.setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from(`Name;Description\nE2E Missing Description ${unique};\n`, "utf8") });
    const invalidUpload = await invalidUploadPromise;
    expect(invalidUpload.status()).toBe(400);

    const uploadResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/roles/bulk-upload/"));
    const csvRows = csvRoleNames.map((name, index) => `${name};CSV description ${unique} ${index + 1}`).join("\n");
    await csvInput.setInputFiles({ name: "roles.csv", mimeType: "text/csv", buffer: Buffer.from(`Name;Description\n${csvRows}\n`, "utf8") });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);
    const uploadedPage = await api(page, "GET", `/api/gerit/v1/roles/paged/?Search=${encodeURIComponent(csvName)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`);
    const uploadedItems = (uploadedPage.body as { items?: Array<{ id?: unknown; name?: unknown }> } | null)?.items ?? [];
    expect(uploadedPage.status).toBe(200);
    expect(uploadedItems.filter((item) => typeof item.name === "string" && item.name.startsWith(csvName))).toHaveLength(csvRoleNames.length);
    expect(uploadedItems.filter((item) => typeof item.name === "string" && item.name.startsWith(csvName)).map((item) => item.name).sort()).toEqual([...csvRoleNames].sort());
    await search.fill(csvRoleNames[0]);
    await expect(page.getByRole("row").filter({ hasText: csvRoleNames[0] })).toBeVisible();

    await search.fill("");
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("Search")).toBe("");
    await pageSize.click();
    await page.getByRole("option", { name: "10", exact: true }).click();
    const nextPage = page.getByRole("button", { name: /next|seguinte|siguiente|próximo|proximo/i });
    await expect(nextPage).toBeEnabled();
    await nextPage.click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("2");
    const previousPage = page.getByRole("button", { name: /previous|anterior/i });
    await previousPage.click();
    await expect.poll(() => queryUrls.at(-1)?.searchParams.get("PageNumber")).toBe("1");

    await search.fill(roleName);
    await expect(page.getByRole("row").filter({ hasText: roleName })).toBeVisible();
    await page.getByRole("row").filter({ hasText: roleName }).click();
    await expect(page).toHaveURL(new RegExp(`/roles/${roleId}/?$`));
    const deactivatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/roles/${roleId}/deactivate/`));
    await page.getByRole("button", { name: /deactivate|desativar|desactivar/i }).click();
    expect((await deactivatePromise).ok()).toBe(true);
    expect((await api(page, "GET", `/api/gerit/v1/roles/${roleId}/`)).body).toMatchObject({ isActive: false });
    const activatePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/roles/${roleId}/activate/`));
    await page.getByRole("button", { name: /activate|ativar|activar/i }).click();
    expect((await activatePromise).ok()).toBe(true);
    expect((await api(page, "GET", `/api/gerit/v1/roles/${roleId}/`)).body).toMatchObject({ isActive: true });

    await page.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const deletePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/roles/${roleId}/`));
    await dialog.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    expect((await deletePromise).status()).toBe(200);
    expect([404, 410]).toContain((await api(page, "GET", `/api/gerit/v1/roles/${roleId}/`)).status);
    createdIds.delete(roleId);
    await expect(page).toHaveURL(/\/roles\/$/);

    await Promise.all(roleAuthChecks);
    expect(tenantFieldsSent).toEqual([]);
    expect(roleRequestsWithoutAuth).toEqual([]);
  } finally {
    const cleanupErrors: string[] = [];
    const created = await api(page, "GET", `/api/gerit/v1/roles/paged/?Search=${encodeURIComponent(roleName)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`).catch(() => null);
    if (!created || created.status !== 200 || !Array.isArray((created.body as { items?: unknown } | null)?.items)) cleanupErrors.push("GET discovery for the created role failed");
    const createdItems = (created?.body as { items?: Array<{ id?: unknown; name?: unknown }> } | null)?.items ?? [];
    for (const item of createdItems) if (item.name === roleName && typeof item.id === "number") createdIds.add(item.id);
    const imported = await api(page, "GET", `/api/gerit/v1/roles/paged/?Search=${encodeURIComponent(csvName)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`).catch(() => null);
    if (!imported || imported.status !== 200 || !Array.isArray((imported.body as { items?: unknown } | null)?.items)) cleanupErrors.push("GET discovery for uploaded CSV roles failed");
    const importedItems = (imported?.body as { items?: Array<{ id?: unknown; name?: unknown }> } | null)?.items ?? [];
    for (const item of importedItems) if (typeof item.name === "string" && item.name.startsWith(csvName) && typeof item.id === "number") createdIds.add(item.id);
    const invalid = await api(page, "GET", `/api/gerit/v1/roles/paged/?Search=${encodeURIComponent(`E2E Missing Description ${unique}`)}&PageNumber=1&PageSize=20`).catch(() => null);
    if (!invalid || invalid.status !== 200 || !Array.isArray((invalid.body as { items?: unknown } | null)?.items)) cleanupErrors.push("GET discovery for the rejected CSV row failed");
    for (const item of (invalid?.body as { items?: Array<{ id?: unknown; name?: unknown }> } | null)?.items ?? []) {
      if (typeof item.id === "number" && item.name === `E2E Missing Description ${unique}`) createdIds.add(item.id);
    }
    for (const id of createdIds) {
      const removal = await api(page, "DELETE", `/api/gerit/v1/roles/${id}/`).catch(() => null);
      if (removal && removal.status !== 200 && removal.status !== 404 && removal.status !== 410) cleanupErrors.push(`DELETE ${id} returned HTTP ${removal.status}`);
      const verification = await api(page, "GET", `/api/gerit/v1/roles/${id}/`).catch(() => null);
      if (!verification || (verification.status !== 404 && verification.status !== 410)) cleanupErrors.push(`GET ${id} did not confirm removal`);
    }
    if (cleanupErrors.length) throw new Error(`Roles E2E cleanup failed: ${cleanupErrors.join("; ")}.`);
  }
});
