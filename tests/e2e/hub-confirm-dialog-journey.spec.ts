import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";

const mockedTeam = {
  id: 987654,
  name: "HubConfirmDialog mock team",
  description: "Synthetic record returned by the local API route mock.",
  isActive: true,
};

async function installVisualPointer(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById("hub-confirm-test-pointer")) return;
      const style = document.createElement("style");
      style.id = "hub-confirm-test-pointer-style";
      style.textContent = "#hub-confirm-test-pointer{position:fixed;z-index:2147483647;left:0;top:0;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:left .12s ease-out,top .12s ease-out,opacity .08s ease;box-shadow:0 0 0 4px rgba(255,59,48,.22)}#hub-confirm-test-pointer.visible{opacity:.9}";
      document.head.appendChild(style);
      const pointer = document.createElement("div");
      pointer.id = "hub-confirm-test-pointer";
      document.body.appendChild(pointer);
      document.addEventListener("pointermove", (event) => {
        pointer.style.left = String(event.clientX) + "px";
        pointer.style.top = String(event.clientY) + "px";
        pointer.classList.add("visible");
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  });
}

test("Teams HubConfirmDialog supports safe keyboard navigation with mocked deletion", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  let mockedDeleteCount = 0;

  await installVisualPointer(page);
  await page.route("**/api/gerit/v1/teams/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/teams/paged/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [mockedTeam], totalItems: 1, pageNumber: 1, pageSize: 10, totalPages: 1 }),
      });
      return;
    }
    if (request.method() === "DELETE" && url.pathname === "/api/gerit/v1/teams/" + mockedTeam.id + "/") {
      mockedDeleteCount += 1;
      if (mockedDeleteCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic failure" }),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.continue();
  });

  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await authenticateFromLogin(page);

  const sidebar = page.getByTestId("desktop-sidebar");
  const teamsSection = sidebar.getByRole("button", { name: /teams and resources|equipas e recursos|equipes e recursos|equipos y recursos/i });
  await expect(teamsSection).toBeVisible();
  if (await teamsSection.getAttribute("aria-expanded") === "false") await teamsSection.click();
  await sidebar.getByRole("link", { name: /^(teams|equipas|equipes|equipos)$/i }).click();
  await expect(page.getByTestId("teams-page-root")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: mockedTeam.name });
  await expect(row).toBeVisible();
  const deleteButton = row.getByRole("button", { name: /delete|eliminar|excluir/i });
  await deleteButton.click();

  const dialog = page.getByRole("alertdialog");
  const cancel = dialog.getByRole("button", { name: /cancel|cancelar/i });
  const confirm = dialog.getByRole("button", { name: /delete|eliminar|excluir/i });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath("hub-confirm-cancel-focused.png") });

  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  expect(mockedDeleteCount).toBe(0);

  await cancel.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await confirm.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.press("ArrowRight");
  await expect(confirm).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath("hub-confirm-confirm-focused.png") });
  await confirm.press("ArrowLeft");
  await expect(cancel).toBeFocused();
  await cancel.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
  expect(mockedDeleteCount).toBe(0);

  await deleteButton.click();
  await expect(cancel).toBeFocused();
  await cancel.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
  expect(mockedDeleteCount).toBe(0);

  await deleteButton.click();
  await expect(cancel).toBeFocused();
  await cancel.press("ArrowRight");
  await confirm.press("Space");
  await expect(dialog).toBeVisible();
  expect(mockedDeleteCount).toBe(1);

  const deleteResponse = page.waitForResponse((response) =>
    response.request().method() === "DELETE" &&
    new URL(response.url()).pathname === "/api/gerit/v1/teams/" + mockedTeam.id + "/",
  );
  await confirm.press("Space");
  await expect(confirm).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  expect(mockedDeleteCount).toBe(2);
  expect((await deleteResponse).status()).toBe(204);
  await expect(dialog).toBeHidden();
});