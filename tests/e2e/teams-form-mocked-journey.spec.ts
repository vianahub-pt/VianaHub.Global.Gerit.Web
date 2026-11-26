import { expect, test, type Page, type TestInfo } from "@playwright/test";

const teamId = 780031;
const teamGrants = ["GetAll", "GetBy", "GetPaged", "Create", "Update", "Delete", "Activate", "Deactivate", "BulkUpload"];
type MockTeam = { id: number; name: string; description: string | null; isActive: boolean };

function syntheticToken(permissions: string[]) {
  return "eyJhbGciOiJub25lIn0." + Buffer.from(JSON.stringify({
    sub: "9001", tenant_id: "1", email: "teams-visual@example.invalid", role: ["Admin"],
    permissions: { Teams: permissions }, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url") + ".synthetic";
}

async function installTeamsApi(page: Page, permissions = teamGrants) {
  const token = syntheticToken(permissions);
  let team: MockTeam | null = { id: teamId, name: "Synthetic Team", description: "Existing description", isActive: true };
  let nextId = teamId - 1;
  const businessRequests: Array<{ method: string; path: string; body?: Record<string, unknown>; query?: string }> = [];
  const unexpectedRequests: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        accessToken: token, refreshToken: "synthetic-refresh",
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(), roleId: 1,
        roleName: "Admin", userId: 9001, userName: "Synthetic User", tenantId: 1,
        tenantName: "Synthetic Tenant", email: "teams-visual@example.invalid", name: "Synthetic User",
      }) });
      return;
    }
    if (path === "/api/gerit/v1/teams/paged" && method === "GET") {
      businessRequests.push({ method, path, query: url.search });
      const items = team ? [team] : [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, totalItems: items.length, pageNumber: 1, pageSize: 10, totalPages: 1 }) });
      return;
    }
    if (path === "/api/gerit/v1/teams" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      businessRequests.push({ method, path, body });
      team = { id: ++nextId, name: String(body.name), description: String(body.description), isActive: body.isActive === true };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: team.id }) });
      return;
    }
    if (path === "/api/gerit/v1/teams/" + teamId && method === "GET") {
      businessRequests.push({ method, path });
      await route.fulfill({ status: team ? 200 : 410, contentType: "application/json", body: JSON.stringify(team ?? { message: "Deleted" }) });
      return;
    }
    if (path === "/api/gerit/v1/teams/" + teamId && method === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      businessRequests.push({ method, path, body });
      if (team) team = { ...team, name: String(body.name), description: String(body.description), isActive: body.isActive === true };
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/gerit/v1/teams/" + teamId + "/deactivate" && method === "PATCH") {
      businessRequests.push({ method, path });
      if (team) team = { ...team, isActive: false };
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    if (path === "/api/gerit/v1/teams/" + teamId + "/activate" && method === "PATCH") {
      businessRequests.push({ method, path });
      if (team) team = { ...team, isActive: true };
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    if (path === "/api/gerit/v1/teams/" + teamId && method === "DELETE") {
      businessRequests.push({ method, path });
      team = null;
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    if (path === "/api/gerit/v1/teams/bulk-upload" && method === "POST") {
      businessRequests.push({ method, path });
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    if (method !== "GET" && method !== "HEAD") unexpectedRequests.push(method + " " + path);
    await route.fulfill({ status: method === "GET" || method === "HEAD" ? 200 : 403, contentType: "application/json", body: "{}" });
  });
  return { businessRequests, unexpectedRequests };
}

async function loginThroughUi(page: Page) {
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-screen-root")).toBeVisible();
  await page.locator('input[type="email"]').fill("teams-visual@example.invalid");
  await page.locator('input[type="password"]').fill("synthetic-password");
  const response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
}

async function openTeamsFromSidebar(page: Page) {
  const sidebar = page.getByTestId("desktop-sidebar");
  const section = sidebar.getByRole("button", { name: /teams and resources|equipas e recursos|equipes e recursos|equipos y recursos/i });
  if (await section.getAttribute("aria-expanded") === "false") await section.click();
  await sidebar.getByRole("link", { name: /^(teams|equipas|equipes|equipos)$/i }).click();
  await expect(page).toHaveURL(/\/teams\/$/);
}

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("Teams form and list use API contracts through isolated mocks", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const { businessRequests, unexpectedRequests } = await installTeamsApi(page);
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer")) return;
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.append(pointer);
      document.addEventListener("pointermove", (event) => { pointer.style.left = event.clientX + "px"; pointer.style.top = event.clientY + "px"; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
  });
  await loginThroughUi(page);
  await openTeamsFromSidebar(page);
  await expect(page.getByTestId("teams-page-root")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("button", { name: /add|adicionar|agregar/i })).toBeVisible();
  await expect(page.getByText(/import csv|importar csv/i).first()).toBeVisible();
  await page.getByPlaceholder(/search by name or description|pesquisar por nome ou descrição|buscar por nome ou descripción/i).fill("Synthetic Team");
  await expect.poll(() => new URLSearchParams(businessRequests.filter((item) => item.method === "GET" && item.path.endsWith("/teams/paged")).at(-1)?.query).get("Search")).toBe("Synthetic Team");
  await captureScreenshot(page, testInfo, "teams-list-mocked.png");

  await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
  await expect(page.getByTestId("teams-create-page-root")).toBeVisible();
  await expect(page.getByTestId("team-status-field").getByText(/yes|sim|sí/i)).toBeVisible();
  await page.getByLabel(/name|nome|nombre/i).fill("Synthetic Team Created");
  await page.getByLabel(/description|descrição|descripción/i).fill("Created in isolated mocked journey");
  await page.getByTestId("team-is-active-switch").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("team-is-active-switch")).not.toBeChecked();
  await expect(page.getByTestId("team-status-field").getByText(/no|não/i)).toBeVisible();
  await captureScreenshot(page, testInfo, "teams-create-inactive-mocked.png");
  await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "POST").length).toBe(1);
  expect(businessRequests.find((item) => item.method === "POST")?.body).toMatchObject({
    name: "Synthetic Team Created", description: "Created in isolated mocked journey", isActive: false,
  });
  await expect(page).toHaveURL(/\/teams\/$/);
  await expect(page.getByRole("status").filter({ hasText: /team created successfully|equipa criada com sucesso|equipe criada com sucesso|equipo creado con éxito/i }).first()).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "Synthetic Team Created" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp("/teams/" + String(teamId) + "/?$"));
  await expect(page.getByTestId("team-details-page-root")).toBeVisible();
  await expect(page.getByTestId("team-is-active-switch")).not.toBeChecked();
  await expect(page.getByTestId("team-persisted-status").getByText(/inactive|inativa|inativo|inactiva/i)).toBeVisible();
  await page.getByLabel(/name|nome|nombre/i).fill("Synthetic Team Edited");
  await page.getByLabel(/description|descrição|descripción/i).fill("Updated in isolated mocked journey");
  await page.getByTestId("team-is-active-switch").click();
  await expect(page.getByTestId("team-is-active-switch")).toBeChecked();
  await expect(page.getByTestId("team-persisted-status").getByText(/inactive|inativa|inativo|inactiva/i)).toBeVisible();
  expect(businessRequests.some((item) => item.method === "PATCH")).toBe(false);
  await captureScreenshot(page, testInfo, "teams-edit-mocked.png");
  await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "PUT").length).toBe(1);
  expect(businessRequests.filter((item) => item.method === "PUT").at(-1)?.body).toMatchObject({
    name: "Synthetic Team Edited", description: "Updated in isolated mocked journey", isActive: true,
  });
  expect(businessRequests.some((item) => item.method === "PATCH")).toBe(false);
  await expect(page).toHaveURL(/\/teams\/$/);
  await expect(page.getByRole("status").filter({ hasText: /team updated successfully|equipa atualizada com sucesso|equipe atualizada com sucesso|equipo actualizado con éxito/i }).first()).toBeVisible();

  const editedRow = page.getByRole("row").filter({ hasText: "Synthetic Team Edited" });
  await expect(editedRow).toBeVisible();
  await editedRow.getByRole("button", { name: /^(deactivate|desativar|desactivar)$/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "PATCH").length).toBe(1);
  expect(businessRequests.filter((item) => item.method === "PATCH").at(-1)?.path).toBe("/api/gerit/v1/teams/" + teamId + "/deactivate");
  await expect(editedRow.getByRole("button", { name: /^(activate|ativar|activar)$/i })).toBeVisible();
  await editedRow.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "DELETE").length).toBe(1);
  expect(businessRequests.some((item) => item.method === "POST" && item.path.includes("bulk-upload"))).toBe(false);
  expect(unexpectedRequests).toEqual([]);
});

test("Teams controls are hidden or disabled when the corresponding grant is absent", async ({ page }) => {
  const { businessRequests, unexpectedRequests } = await installTeamsApi(page, ["GetAll", "GetPaged", "GetBy"]);
  await loginThroughUi(page);
  await openTeamsFromSidebar(page);
  await expect(page.getByRole("button", { name: /add|adicionar|agregar/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"][accept=".csv"]')).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Synthetic Team" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /activate|ativar|activar|deactivate|desativar/i })).toHaveCount(0);
  await expect(row.getByRole("button", { name: /delete|eliminar|excluir/i })).toHaveCount(0);
  await row.click();
  await expect(page.getByTestId("team-name-field").locator("input")).toBeDisabled();
  await expect(page.getByTestId("team-is-active-switch")).toBeDisabled();
  await expect(page.getByRole("button", { name: /save|guardar|salvar/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /delete|eliminar|excluir/i })).toHaveCount(0);
  expect(businessRequests.some((item) => ["POST", "PUT", "PATCH", "DELETE"].includes(item.method))).toBe(false);
  expect(unexpectedRequests).toEqual([]);
});
