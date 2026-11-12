import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";

const nameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripcion)$/i;
const searchPlaceholder = /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i;

async function waitForToastToClear(page: Page) {
  await page.mouse.move(0, 0);
  const openToasts = page.locator('[role="status"][data-state="open"], [role="alert"][data-state="open"]');
  for (const toast of await openToasts.all()) await toast.locator('button[toast-close]').click();
  await expect(openToasts).toHaveCount(0, { timeout: 2_000 });
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

test("Teams canonical CRUD, status filters, CSV and cleanup", async ({ page }) => {
  test.setTimeout(240_000);
  const createdIds = new Set<number>();
  const unique = randomUUID();
  const teamName = `E2E Team ${unique}`;
  const description = `E2E Description ${unique}`;
  const updatedDescription = `E2E Updated ${unique}`;
  const csvName = `E2E CSV ${unique}`;
  const queries: URL[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/teams/paged") || url.pathname.endsWith("/teams/paged/")) queries.push(url);
  });

  try {
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await authenticateFromLogin(page);
    await page.goto("/teams/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("teams-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageNumber")).toBe("1");
    const pageSize = page.getByRole("combobox", { name: /per page|por página|por pagina/i });
    await pageSize.click();
    await page.getByRole("option", { name: "20", exact: true }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageSize")).toBe("20");
    await pageSize.click();
    await page.getByRole("option", { name: "10", exact: true }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageSize")).toBe("10");

    await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
    await page.getByLabel(nameLabel).fill(teamName);
    await page.getByLabel(descriptionLabel).fill(description);
    await waitForToastToClear(page);
    const createResponsePromise = page.waitForResponse((response) => response.status() === 201 && response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/"));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json() as { id?: unknown };
    expect(typeof createBody.id).toBe("number");
    if (typeof createBody.id === "number") createdIds.add(createBody.id);
    await waitForToastToClear(page);

    const row = page.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible();
    const detailResponse = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "GET" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/`));
    await row.click();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await detailResponse;
    await page.getByRole("button", { name: /edit|editar/i }).click();
    await expect(page.getByLabel(descriptionLabel)).toHaveValue(description);
    await page.getByLabel(nameLabel).fill(`${teamName} edited`);
    await page.getByLabel(descriptionLabel).fill(updatedDescription);
    await waitForToastToClear(page);
    const updateResponsePromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/`));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    expect((await updateResponsePromise).status()).toBe(204);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`)).body)
      .toMatchObject({ name: `${teamName} edited`, description: updatedDescription });
    await expect(page.getByText(updatedDescription, { exact: true })).toBeVisible();
    await waitForToastToClear(page);

    const statusFilter = page.getByRole("combobox", { name: /status|estado/i }).first();
    await statusFilter.click();
    await page.getByRole("option", { name: /^(inactive|inativo|inativa|inactiva)$/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("IsActive")).toBe("false");
    await statusFilter.click();
    await page.getByRole("option", { name: /^(active|ativo|ativa|activa)$/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("IsActive")).toBe("true");
    await statusFilter.click();
    await page.getByRole("option", { name: /show all|mostrar todos/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.has("IsActive")).toBe(false);

    const search = page.getByPlaceholder(searchPlaceholder);
    await search.fill(teamName);
    await expect(row).toBeVisible();
    await expect.poll(() => queries.at(-1)?.searchParams.get("Search")).toBe(teamName);

    const deactivateResponsePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/deactivate/`));
    await row.getByRole("button", { name: /deactivate|desativar|desactivar/i }).click();
    expect((await deactivateResponsePromise).ok()).toBe(true);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`)).body)
      .toMatchObject({ isActive: false });
    await waitForToastToClear(page);
    const activateResponsePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/activate/`));
    await row.getByRole("button", { name: /activate|ativar|activar/i }).click();
    expect((await activateResponsePromise).ok()).toBe(true);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`)).body)
      .toMatchObject({ isActive: true });
    await waitForToastToClear(page);

    page.once("dialog", (dialog) => void dialog.accept());
    const deleteResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/`));
    await row.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    expect((await deleteResponsePromise).status()).toBe(200);
    createdIds.delete(createBody.id as number);
    await waitForToastToClear(page);
    await expect(row).toHaveCount(0);

    const csvInput = page.locator('input[type="file"][accept=".csv"]');
    await csvInput.setInputFiles({ name: "teams.txt", mimeType: "text/plain", buffer: Buffer.from("not csv", "utf8") });
    await expect(page.getByText(/select a csv file|selecione um ficheiro csv|seleccione un archivo csv/i).last()).toBeVisible();
    await waitForToastToClear(page);

    const emptyUploadPromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/bulk-upload/"));
    await csvInput.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("Name;Description\n", "utf8") });
    const emptyUpload = await emptyUploadPromise;
    expect(emptyUpload.status()).toBe(400);
    await expect(page.getByRole("alert").last()).toBeVisible();
    await waitForToastToClear(page);

    const csv = `Name;Description\n${csvName};CSV description ${unique}\n`;
    const uploadResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/bulk-upload/"));
    await csvInput.setInputFiles({ name: "teams.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);
    await waitForToastToClear(page);
    await search.fill(csvName);
    await expect(page.getByRole("row").filter({ hasText: csvName })).toBeVisible();
  } finally {
    const imported = await api(page, "GET", `/api/gerit/v1/teams/paged/?Search=${encodeURIComponent(csvName)}&PageNumber=1&PageSize=10&SortBy=Name&SortDirection=asc`).catch(() => null);
    const importedBody = imported?.body as { items?: Array<{ id?: unknown; name?: unknown }> } | null;
    for (const item of importedBody?.items ?? []) if (item.name === csvName && typeof item.id === "number") createdIds.add(item.id);
    for (const id of createdIds) {
      const result = await api(page, "DELETE", `/api/gerit/v1/teams/${id}/`).catch(() => null);
      if (result && result.status !== 200 && result.status !== 404 && result.status !== 410) {
        console.warn(`Teams E2E cleanup of its own record returned HTTP ${result.status}.`);
      }
    }
  }
});
