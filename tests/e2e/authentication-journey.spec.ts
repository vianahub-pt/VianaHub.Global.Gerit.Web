import { expect, test } from "@playwright/test";

type LoginDiagnosticWindow = Window & {
  __GERIT_E2E_DIAGNOSTICS__?: boolean;
  __GERIT_E2E_LOGIN_DIAGNOSTIC__?: { componentHydrated: boolean };
};

test("authentication login hydration smoke", async ({ page }, testInfo) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("Authorized E2E login credentials are not configured.");

  const nonAuthWrites: string[] = [];
  page.on("request", (request) => {
    if (!/^(POST|PUT|PATCH|DELETE)$/.test(request.method())) return;
    const path = new URL(request.url()).pathname;
    if (path !== "/api/auth/login" && path !== "/api/auth/login/") nonAuthWrites.push(`${request.method()} ${path}`);
  });

  await page.addInitScript((visual) => {
    if (!visual) return;
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer")) return;
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;left:0;top:0;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:.9;box-shadow:0 0 0 4px rgba(255,59,48,.22)";
      document.body.appendChild(pointer);
      document.addEventListener("mousemove", (event) => {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");

  // First mount intentionally has no E2E diagnostic flag.
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  const loginRoot = page.getByTestId("login-screen-root");
  await expect(loginRoot).toBeVisible();
  await expect(loginRoot).toHaveAttribute("data-hydrated", "true");
  const firstLoad = await page.evaluate(() => ({
    diagnosticsEnabled: (window as LoginDiagnosticWindow).__GERIT_E2E_DIAGNOSTICS__ === true,
    diagnosticCreated: (window as LoginDiagnosticWindow).__GERIT_E2E_LOGIN_DIAGNOSTIC__ !== undefined,
  }));
  expect(firstLoad).toEqual({ diagnosticsEnabled: false, diagnosticCreated: false });
  await testInfo.attach("login-first-load-without-diagnostics", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });

  // addInitScript is not retroactive on the current document; prove the marker still holds, then reload with diagnostics enabled.
  await page.addInitScript(() => {
    (window as LoginDiagnosticWindow).__GERIT_E2E_DIAGNOSTICS__ = true;
  });
  const lateInstall = await page.evaluate(() => ({
    diagnosticsEnabled: (window as LoginDiagnosticWindow).__GERIT_E2E_DIAGNOSTICS__ === true,
    diagnosticCreated: (window as LoginDiagnosticWindow).__GERIT_E2E_LOGIN_DIAGNOSTIC__ !== undefined,
  }));
  expect(lateInstall).toEqual({ diagnosticsEnabled: false, diagnosticCreated: false });
  await expect(loginRoot).toHaveAttribute("data-hydrated", "true");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(loginRoot).toHaveAttribute("data-hydrated", "true");
  await expect.poll(() => page.evaluate(() => (window as LoginDiagnosticWindow).__GERIT_E2E_LOGIN_DIAGNOSTIC__?.componentHydrated)).toBe(true);

  const loginResponse = page.waitForResponse((response) => {
    const request = response.request();
    const path = new URL(response.url()).pathname;
    return request.method() === "POST" && (path === "/api/auth/login" || path === "/api/auth/login/");
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  const response = await loginResponse;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
  await expect(page.getByTestId("desktop-sidebar")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(nonAuthWrites).toEqual([]);
  await testInfo.attach("authenticated-navigation-sidebar", {
    body: await page.getByTestId("desktop-sidebar").screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});
