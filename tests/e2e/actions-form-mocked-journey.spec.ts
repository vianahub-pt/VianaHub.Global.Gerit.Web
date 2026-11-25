import { expect, test, type Page } from "@playwright/test";

const actionId = 780021;
const allActionPermissions = ["GetBy", "Create", "Update", "Delete"];

function syntheticToken(permissions: string[]) {
  return "eyJhbGciOiJub25lIn0." + Buffer.from(JSON.stringify({
    sub: "9001",
    tenant_id: "1",
    email: "actions-visual@example.invalid",
    role: ["Admin"],
    permissions: { Actions: permissions },
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url") + ".synthetic";
}

type MockAction = { id: number; name: string; description: string | null; isActive: boolean };

async function installActionApi(page: Page, permissions = allActionPermissions) {
  const token = syntheticToken(permissions);
  let action: MockAction = { id: actionId, name: "Review actions", description: "Existing description", isActive: false };
  const businessRequests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const unexpectedRequests: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        accessToken: token,
        refreshToken: "synthetic-refresh",
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        roleId: 1, roleName: "Admin", userId: 9001, userName: "Synthetic User",
        tenantId: 1, tenantName: "Synthetic Tenant", email: "actions-visual@example.invalid", name: "Synthetic User",
      }) });
      return;
    }

    if (path === "/api/gerit/v1/actions" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      businessRequests.push({ method, path, body });
      action = { id: actionId, name: String(body.name), description: String(body.description), isActive: body.isActive === true };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: actionId }) });
      return;
    }

    if (path === `/api/gerit/v1/actions/${actionId}` && method === "GET") {
      businessRequests.push({ method, path });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(action) });
      return;
    }

    if (path === `/api/gerit/v1/actions/${actionId}` && method === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      businessRequests.push({ method, path, body });
      action = { ...action, description: String(body.description), isActive: body.isActive === true };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(true) });
      return;
    }

    if (method !== "GET" && method !== "HEAD") unexpectedRequests.push(`${method} ${path}`);
    await route.fulfill({ status: method === "GET" || method === "HEAD" ? 200 : 403, contentType: "application/json", body: "{}" });
  });

  return { businessRequests, unexpectedRequests };
}

async function loginThroughUi(page: Page) {
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-screen-root")).toBeVisible();
  await page.locator('input[type="email"]').fill("actions-visual@example.invalid");
  await page.locator('input[type="password"]').fill("synthetic-password");
  const response = page.waitForResponse((item) => item.request().method() === "POST" &&
    new URL(item.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
}

async function toggleSwitchWithKeyboard(page: Page) {
  const control = page.getByTestId("action-is-active-switch");
  await control.focus();
  await page.keyboard.press("Space");
}

test("Actions create and edit form persist explicit status with mocked API only", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const { businessRequests, unexpectedRequests } = await installActionApi(page);
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer")) return;
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.append(pointer);
      document.addEventListener("pointermove", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
  });
  await loginThroughUi(page);

  await page.goto("/actions/new/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("actions-create-page-root")).toBeVisible();
  await expect(page.getByTestId("action-is-active-switch")).toBeChecked();
  await expect(page.getByTestId("action-is-active-label")).toHaveText(/yes|sim|sí/i);
  await page.getByLabel(/name|nome|nombre/i).fill("Synthetic Action");
  await page.getByTestId("action-description-field").locator("textarea").fill("Created in isolated mocked visual journey");
  await toggleSwitchWithKeyboard(page);
  await testInfo.attach("actions-create-form.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "POST").length).toBe(1);
  expect(businessRequests.find((item) => item.method === "POST")?.body).toMatchObject({
    name: "Synthetic Action", description: "Created in isolated mocked visual journey", isActive: false,
  });

  await page.goto(`/actions/${actionId}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("action-details-page-root")).toBeVisible();
  await expect(page.getByTestId("action-name-value")).toHaveText("Synthetic Action");
  await expect(page.getByTestId("action-is-active-switch")).not.toBeChecked();
  await expect(page.getByTestId("action-is-active-label")).toHaveText(/no|não/i);
  await expect(page.getByTestId("action-details-page-root").getByText(/inactive|inativa|inativo/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /activate|ativar|activar|deactivate|desativar/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /delete|excluir|eliminar/i })).toBeVisible();
  await testInfo.attach("actions-edit-form.png", { body: await page.screenshot(), contentType: "image/png" });
  await toggleSwitchWithKeyboard(page);
  await expect(page.getByTestId("action-details-page-root").getByText(/inactive|inativa|inativo/i)).toBeVisible();
  await page.getByTestId("action-description-field").locator("textarea").fill("Updated in isolated mocked visual journey");
  const beforePut = businessRequests.filter((item) => item.method === "PUT").length;
  await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
  await expect.poll(() => businessRequests.filter((item) => item.method === "PUT").length).toBe(beforePut + 1);
  expect(businessRequests.filter((item) => item.method === "PUT").at(-1)?.body).toMatchObject({
    description: "Updated in isolated mocked visual journey", isActive: true,
  });
  expect(businessRequests.some((item) => item.method === "PATCH")).toBe(false);
  expect(unexpectedRequests).toEqual([]);
});

test("Actions form disables operations when the independent grant is missing", async ({ page }) => {
  const { businessRequests, unexpectedRequests } = await installActionApi(page, ["GetBy", "Create"]);
  await loginThroughUi(page);
  await page.goto(`/actions/${actionId}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("action-details-page-root")).toBeVisible();
  await expect(page.getByTestId("action-description-field").locator("textarea")).toBeDisabled();
  await expect(page.getByTestId("action-is-active-switch")).toBeDisabled();
  await expect(page.getByRole("button", { name: /save|guardar|salvar/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /delete|excluir|eliminar/i })).toHaveCount(0);
  expect(businessRequests.map((item) => item.method)).toEqual(["GET"]);
  expect(unexpectedRequests).toEqual([]);
});
