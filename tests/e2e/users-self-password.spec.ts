import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

const changePasswordLabel = /change password|alterar palavra-passe|alterar senha|cambiar contraseña/i;
const saveLabel = /^(save|guardar|salvar)$/i;

test("own user password stays display-only and self-service uses only PATCH", async ({ page }) => {
  await page.goto("/users/");
  await expect(page.getByTestId("users-page-root")).toBeVisible();

  const ownUserId = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("gerit.auth.session.v1");
      const session = raw ? JSON.parse(raw) as { userId?: unknown } : null;
      return typeof session?.userId === "number" && Number.isInteger(session.userId) && session.userId > 0
        ? session.userId
        : null;
    } catch {
      return null;
    }
  });
  expect(ownUserId, "The authenticated session must identify its own user").not.toBeNull();

  let putPath = "";
  let putBody: Record<string, unknown> | null = null;
  let passwordPatchPath = "";
  let passwordPatchBody: Record<string, unknown> | null = null;
  await page.route("**/api/gerit/v1/users/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/+$/, "");
    if (request.method() === "PUT") {
      putPath = pathname;
      putBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    if (request.method() === "PATCH" && pathname === `/api/gerit/v1/users/${ownUserId}/password`) {
      passwordPatchPath = pathname;
      passwordPatchBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      return;
    }
    await route.continue();
  });

  await page.goto(`/users/${ownUserId}/`);
  await expect(page.getByTestId("user-details-page-root")).toBeVisible();
  const maskedPassword = page.locator("#user-password-masked");
  await expect(maskedPassword).toBeVisible();
  await expect(maskedPassword).toBeDisabled();
  await expect(maskedPassword).toHaveAttribute("autocomplete", "off");
  await expect(maskedPassword).toHaveValue("••••••••••");

  await page.getByRole("button", { name: changePasswordLabel }).click();
  const passwordDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(passwordDialog).toBeVisible();
  const mockCurrentPassword = `Old-${randomUUID()}-A1!`;
  const mockNewPassword = `New-${randomUUID()}-B2!`;
  await passwordDialog.locator("#user-current-password").fill(mockCurrentPassword);
  await passwordDialog.locator("#user-new-password").fill(mockNewPassword);
  await passwordDialog.locator("#user-confirm-new-password").fill(mockNewPassword);
  await passwordDialog.getByRole("button", { name: saveLabel }).click();
  await expect.poll(() => passwordPatchPath).toBe(`/api/gerit/v1/users/${ownUserId}/password`);
  expect(Object.keys(passwordPatchBody ?? {}).sort()).toEqual(["currentPassword", "newPassword"]);
  await expect(passwordDialog).toHaveCount(0);

  const phoneInput = page.locator("#user-phone-number");
  await expect(phoneInput).toHaveAttribute("maxlength", "20");
  await phoneInput.fill("1234567890");
  const removeImageButton = page.getByRole("button", { name: /remove image|remover imagem|eliminar imagem/i });
  if (await removeImageButton.count()) await removeImageButton.first().click();
  await page.getByRole("button", { name: saveLabel }).click();
  await expect.poll(() => putPath).toBe(`/api/gerit/v1/users/${ownUserId}`);
  expect(putBody).not.toBeNull();
  expect(Object.keys(putBody ?? {}).filter((key) => /^(password|passwordhash)$/i.test(key))).toEqual([]);

  const otherUserId = await page.evaluate(async (currentId) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: unknown } : null;
    if (typeof session?.accessToken !== "string") return null;
    const response = await fetch("/api/gerit/v1/users/paged?PageNumber=1&PageSize=10&SortBy=Id&SortDirection=asc", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok) return null;
    const body = await response.json() as { items?: Array<{ id?: unknown }> };
    return body.items?.find((item) => typeof item.id === "number" && item.id !== currentId)?.id ?? null;
  }, ownUserId);
  expect(otherUserId, "A separate existing user must be available for the third-party UI check").not.toBeNull();
  await page.goto(`/users/${otherUserId}/`);
  await expect(page.getByTestId("user-details-page-root")).toBeVisible();
  await expect(page.getByRole("button", { name: changePasswordLabel })).toHaveCount(0);
  expect(passwordPatchPath).toBe(`/api/gerit/v1/users/${ownUserId}/password`);
});
