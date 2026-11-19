import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const outputDirectory = resolve("test-results/client-ui-review");
const screenshots = [
  "users-list.png", "clients-list.png", "roles-list.png", "actions-list.png",
  "users-create.png", "clients-create.png", "users-detail.png", "clients-detail.png",
] as const;

test("captures comparative Users, Roles, Actions, and Client screens without API mutations", async ({ page }) => {
  await mkdir(outputDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const blockedMutations: string[] = [];
  await page.route("**/api/gerit/v1/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      blockedMutations.push(request.method() + " " + new URL(request.url()).pathname);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  const safeScreenshot = async (name: typeof screenshots[number]) => {
    await page.screenshot({
      path: resolve(outputDirectory, name),
      fullPage: true,
      animations: "disabled",
      style: "table tbody td { color: transparent !important; text-shadow: none !important; } input, textarea, h1 { color: transparent !important; } img { filter: blur(12px) !important; }",
    });
  };
  const expectNoOverflow = async (testId: string) => {
    await expect.poll(() => page.getByTestId(testId).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  };

  await page.goto("/users/");
  await expect(page.getByTestId("users-page-root")).toBeVisible();
  await expect(page.locator("table")).toHaveAttribute("aria-busy", "false");
  await safeScreenshot("users-list.png");

  await page.goto("/clients/");
  await expect(page.getByTestId("clients-page-root")).toBeVisible();
  await expect(page.locator("table")).toHaveAttribute("aria-busy", "false");
  const clientRoot = page.getByTestId("clients-page-root");
  await expect(page.getByRole("button", { name: /Import CSV|Importar CSV/ })).toBeDisabled();
  await expect(page.locator("#client-bulk-upload-unavailable")).toBeAttached();
  await expect(page.getByRole("button", { name: /Add client|Adicionar cliente|Adicionar/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Estado|Status/ })).toBeVisible();
  await expect(clientRoot.locator("button[aria-pressed]")).toHaveCount(3);
  await safeScreenshot("clients-list.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow("clients-page-root");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/roles/");
  await expect(page.getByTestId("roles-page-root")).toBeVisible();
  await expect(page.locator("table")).toHaveAttribute("aria-busy", "false");
  await safeScreenshot("roles-list.png");

  await page.goto("/actions/");
  await expect(page.getByTestId("actions-page-root")).toBeVisible();
  await expect(page.locator("table")).toHaveAttribute("aria-busy", "false");
  await safeScreenshot("actions-list.png");

  await page.goto("/users/new/");
  await expect(page.getByTestId("users-create-page-root")).toBeVisible();
  await expect(page.getByTestId("user-fields-section")).toBeVisible();
  await safeScreenshot("users-create.png");

  await page.goto("/clients/new/");
  await expect(page.getByTestId("client-create-page")).toBeVisible();
  await expect(page.getByTestId("client-fields-section")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(5);
  await safeScreenshot("clients-create.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow("client-create-page");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/users/");
  const userRow = page.getByTestId("users-page-root").locator("tbody tr[tabindex='0']").first();
  await expect(userRow).toBeVisible();
  await userRow.click();
  await page.waitForURL(/\/users\/\d+\/$/);
  await expect(page.getByTestId("user-details-page-root")).toBeVisible();
  await expect(page.getByTestId("user-fields-section")).toBeVisible({ timeout: 30_000 });
  await safeScreenshot("users-detail.png");

  await page.goto("/clients/");
  const clientRow = page.getByTestId("clients-page-root").locator("tbody tr[tabindex='0']").first();
  await expect(clientRow).toBeVisible();
  await clientRow.click();
  await page.waitForURL(/\/clients\/\d+\/$/);
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(page.getByTestId("client-fields-section")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("client-name")).toBeEnabled();
  await expect(page.getByTestId("client-edit")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(5);
  await safeScreenshot("clients-detail.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow("client-detail-page");

  expect(blockedMutations).toEqual([]);
  for (const screenshot of screenshots) {
    expect((await stat(resolve(outputDirectory, screenshot))).size).toBeGreaterThan(0);
  }
});