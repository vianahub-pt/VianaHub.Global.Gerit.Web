import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const locales = [
  { code: "pt-PT", expectedBack: "Voltar" },
  { code: "pt-BR", expectedBack: "Voltar" },
  { code: "en-US", expectedBack: "Back" },
  { code: "es-ES", expectedBack: "Volver" },
] as const;

const rawTranslationKeyPattern = /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/;

async function assertNoRawTranslationKeysOnActionsPage(page: Page) {
  const roots = page.locator(
    '[data-testid="actions-page-root"], [data-testid="action-details-page-root"], [data-testid="actions-create-page-root"]',
  );
  await expect(roots.first()).toBeVisible();

  const visibleUiStrings = await roots
    .locator('button, a, [role="button"], [role="link"], label, h1, h2, h3, [role="alert"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .flatMap((element) => [
          element.textContent?.trim() ?? "",
          element.getAttribute("aria-label")?.trim() ?? "",
          element.getAttribute("title")?.trim() ?? "",
        ])
        .filter(Boolean),
    );

  expect(
    visibleUiStrings.filter((text) => rawTranslationKeyPattern.test(text)),
    "Actions pages must not show raw translation keys in visible UI labels",
  ).toEqual([]);
}

async function setLocale(page: Page, locale: (typeof locales)[number]) {
  await page.evaluate((code) => localStorage.setItem("language", code), locale.code);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
}

test("Actions back label is translated and raw i18n keys stay hidden in every locale", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/actions/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("actions-page-root")).toBeVisible();

  for (const locale of locales) {
    await setLocale(page, locale);
    await expect(page.getByTestId("actions-page-root")).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
  }

  await page.goto("/actions/new/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("actions-create-page-root")).toBeVisible();
  await assertNoRawTranslationKeysOnActionsPage(page);

  const missingId = randomInt(2_000_000_000, 2_100_000_000);
  const detailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.replace(/\/$/, "") === `/api/gerit/v1/actions/${missingId}` &&
      response.request().method() === "GET" &&
      (response.status() < 300 || response.status() >= 400);
  });
  await page.goto(`/actions/${missingId}/`, { waitUntil: "domcontentloaded" });
  const detailResponse = await detailResponsePromise;
  expect([404, 410]).toContain(detailResponse.status());
  const detailRoot = page.getByTestId("action-details-page-root");
  await expect(detailRoot).toBeVisible();

  for (const locale of locales) {
    await setLocale(page, locale);
    await expect(detailRoot.getByRole("button", { name: "actions.actions.back", exact: true })).toHaveCount(0);
    await expect(detailRoot.getByRole("button", { name: locale.expectedBack, exact: true }).first()).toBeVisible();
    await assertNoRawTranslationKeysOnActionsPage(page);
  }
});
