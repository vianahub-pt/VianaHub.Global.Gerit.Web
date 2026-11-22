import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const ACCESS_TOKEN_CLAIMS = {
  sub: "9001",
  tenant_id: "1",
  email: "visual@example.invalid",
  role: ["Admin"],
  permissions: {
    Users: ["GetBy", "Create", "Update"],
    Clients: ["GetPaged", "GetBy", "Create", "Update"],
    Actions: ["GetPaged", "GetBy", "Create", "Update"],
    Roles: ["GetPaged", "GetBy", "Create", "Update"],
    Teams: ["GetPaged", "GetBy", "Create", "Update"],
    EquipmentTypes: ["GetPaged", "GetBy", "Create", "Update"],
    Vehicles: ["GetPaged", "GetBy", "Create", "Update"],
    Equipments: ["GetPaged", "GetBy", "Create", "Update"],
  },
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const accessToken = "eyJhbGciOiJub25lIn0." + Buffer.from(JSON.stringify(ACCESS_TOKEN_CLAIMS)).toString("base64url") + ".test";
const urlImage = "https://hub-image.test/saved.svg";
const svgImage = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#336699"/></svg>';
function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(1, 0);
pngHeader.writeUInt32BE(1, 4);
pngHeader[8] = 8;
pngHeader[9] = 6;
const previewPng = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", pngHeader),
  pngChunk("IDAT", deflateSync(Buffer.from([0, 51, 102, 153, 255]))),
  pngChunk("IEND", Buffer.alloc(0)),
]);
const screenshotDir = resolve(process.cwd(), "test-results", "client-form-visual-review");

async function chooseHubOption(page: Page, testId: string, optionName: string) {
  const trigger = page.getByTestId(testId);
  await trigger.click();
  const option = page.getByRole("option", { name: optionName, exact: true }).last();
  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toHaveAttribute("data-state", "closed");
}

function userDetail(id: number, image = urlImage) {
  return {
    id, name: "Visual User", email: "visual@example.invalid", phoneNumber: null, lastAccessAt: null,
    isActive: true, urlImage: image, isDeleted: false, createdBy: 9001,
    createdAt: "2026-01-01T00:00:00Z", modifiedBy: null, modifiedAt: null,
  };
}

function clientDetail(id: number, partyTypeId: 1 | 2, image = urlImage, statusDefinitionId = 6, statusDomainId = 1, gender: string | null = null, nationality: string | null = null) {
  return {
    id, tenantId: 1, tenant: "Visual Tenant", partyTypeId,
    partyType: partyTypeId === 1 ? "Individual" : "Organization",
    acquisitionSourceTypeId: 3, acquisitionSourceType: "Web",
    name: partyTypeId === 1 ? "Visual Individual" : "Visual Organization",
    phoneNumber: null, cellPhoneNumber: null, isCellPhoneWhatsapp: false, email: null,
    websiteUrl: null, birthDate: null, gender, nationality,
    companyRegistrationNumber: partyTypeId === 2 ? "VISUAL-REG-01" : null,
    economicActivityCode: partyTypeId === 2 ? "VISUAL-EAC-01" : null,
    numberOfEmployees: partyTypeId === 2 ? 12 : null,
    urlImage: image, note: "Synthetic visual fixture", statusDefinitionId,
    statusDefinitionName: statusDefinitionId === 6 ? "Archived" : "Potential",
    statusDomainId, statusDomainName: "Client", isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

test("HubImage interactions and Client forms remain generic, accessible, and visually aligned", async ({ page }) => {
  mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1893, height: 1157 });
  const now = Date.now();
  const session = {
    accessToken,
    refreshToken: "local-visual-test-refresh",
    accessTokenExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    roleId: 1, roleName: "Admin", userId: 9001, userName: "Visual User", tenantId: 1,
    tenantName: "Visual Tenant", email: "visual@example.invalid", name: "Visual User",
  };
  await page.addInitScript((sessionValue) => {
    localStorage.setItem("gerit.auth.session.v1", JSON.stringify(sessionValue));
  }, session);

  const mutations: Array<{ method: string; path: string; body: unknown }> = [];
  const clientStatusOverrides = new Map<number, number>();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, "");
    let body: unknown = [];

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const requestBody = request.postDataJSON() ?? null;
      mutations.push({ method, path, body: requestBody });
      if (method === "PUT" && path.startsWith("/api/gerit/v1/clients/") && typeof requestBody === "object" && requestBody !== null) {
        const statusId = (requestBody as { statusDefinitionId?: unknown }).statusDefinitionId;
        const id = Number(path.split("/").at(-1));
        if (Number.isInteger(statusId) && typeof statusId === "number") clientStatusOverrides.set(id, statusId);
      }
      body = method === "POST" ? { id: path.includes("/users") ? 9004 : 9005 } : true;
    } else if (path.endsWith("/party-types")) {
      body = [
        { id: 1, name: "Individual", isActive: true, languageCode: "en-US" },
        { id: 2, name: "Organization", isActive: true, languageCode: "en-US" },
      ];
    } else if (path.endsWith("/acquisition-source-types")) {
      body = [{ id: 3, name: "Web", isActive: true, languageCode: "en-US" }];
    } else if (path.endsWith("/status-domains")) {
      body = [{ id: 1, name: "Client", isActive: true, languageCode: "en-US" }];
    } else if (path.endsWith("/status-definitions")) {
      body = [
        { id: 1, name: "Active", isActive: true, languageCode: "en-US", statusDomainId: 1 },
        { id: 2, name: "Archived", isActive: true, languageCode: "en-US", statusDomainId: 1 },
        { id: 3, name: "Inactive", isActive: true, languageCode: "en-US", statusDomainId: 1 },
        { id: 4, name: "Potential", isActive: true, languageCode: "en-US", statusDomainId: 1 },
        { id: 5, name: "Suspended", isActive: true, languageCode: "en-US", statusDomainId: 1 },
        { id: 6, name: "Archived legacy", isActive: false, languageCode: "en-US", statusDomainId: 1 },
      ];
    } else if (path.includes("/subscriptions/tenant/")) {
      body = [];
    } else if (path.startsWith("/api/gerit/v1/user-preferences/user/")) {
      body = {
        id: 9008, tenantId: 1, userId: 9001, appearance: "light", locale: "en-US",
        currencyCode: "USD", timezone: "Europe/Lisbon", dateFormat: "MM/DD/YYYY", timeFormat: "24h",
        dayStart: "09:00", dayEnd: "17:00", emailNewsletter: false, emailWeeklyReport: false,
        emailApproval: true, emailAlerts: true, emailReminders: true, emailPlanner: true,
      };
    } else if (path.startsWith("/api/gerit/v1/users/")) {
      const id = Number(path.split("/").at(-1));
      body = userDetail(id, id === 9003 ? "https://hub-image.test/broken.svg" : urlImage);
    } else if (path.startsWith("/api/gerit/v1/clients/") && !path.endsWith("/paged")) {
      const id = Number(path.split("/").at(-1));
      const detail = id === 9006
        ? clientDetail(id, 2, urlImage, 3)
        : id === 9007
          ? clientDetail(id, 1, urlImage, 6, 2)
          : clientDetail(id, 1, id === 9003 ? "https://hub-image.test/broken.svg" : urlImage, 6, 1, id === 9002 ? "Masc" : null, id === 9002 ? "Português" : null);
      body = { ...detail, statusDefinitionId: clientStatusOverrides.get(id) ?? detail.statusDefinitionId };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://hub-image.test/**", async (route) => {
    if (new URL(route.request().url()).pathname.includes("broken")) {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgImage });
  });

  const hubImage = page.getByTestId("hub-image");
  const dropzone = page.getByTestId("hub-image-dropzone");
  const capture = (name: string) => page.screenshot({
    path: resolve(screenshotDir, name),
    fullPage: true,
    animations: "disabled",
  });
  const captureViewport = (name: string) => page.screenshot({
    path: resolve(screenshotDir, name),
    fullPage: false,
    animations: "disabled",
  });
  const assertBusinessStatusField = async () => {
    await expect(page.getByTestId("client-business-status")).toBeVisible();
    await expect(page.getByTestId("client-business-status")).toHaveCount(1);
  };
  const assertWhatsAppBehavior = async () => {
    const checkbox = page.getByTestId("client-whatsapp");
    const value = page.getByTestId("client-whatsapp-value");
    await expect(checkbox).toHaveAttribute("role", "switch");
    await expect(checkbox).toHaveAttribute("aria-labelledby", "client-whatsapp-label client-whatsapp-value");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(value).toHaveText("No");
    await page.getByTestId("client-whatsapp-field").locator("label[for=client-whatsapp]").click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(value).toHaveText("Yes");
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(value).toHaveText("No");
    await checkbox.press("Space");
    await expect(value).toHaveText("Yes");
    await checkbox.press("Space");
    await expect(value).toHaveText("No");
  };
  const box = async (testId: string) => {
    const result = await page.getByTestId(testId).boundingBox();
    expect(result, testId + " must have a visible layout box").not.toBeNull();
    return result!;
  };
  const assertCommonClientShell = async () => {
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(5);
    await expect(page.getByTestId("client-back")).toBeVisible();
    await expect(page.getByTestId("client-cancel")).toBeVisible();
    await expect(page.getByTestId("client-save")).toBeVisible();
  };
  const assertTabKeyboardNavigation = async () => {
    const tabs = page.getByRole("tablist").getByRole("tab");
    await tabs.first().focus();
    await tabs.first().press("ArrowRight");
    await expect(tabs.nth(1)).toBeDisabled();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).not.toBeFocused();
    await tabs.nth(1).press("Home");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  };
  const assertTabVisualPattern = async () => {
    const tabs = page.getByRole("tablist").getByRole("tab");
    const visuals = await tabs.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      const indicator = getComputedStyle(element, "::after");
      return {
        height: element.getBoundingClientRect().height,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        indicatorHeight: indicator.height,
        indicatorColor: indicator.backgroundColor,
        indicatorOpacity: indicator.opacity,
        selected: element.getAttribute("aria-selected") === "true",
      };
    }));
    expect(new Set(visuals.map(({ height }) => height)).size).toBe(1);
    expect(new Set(visuals.map(({ fontFamily, fontSize, fontWeight, paddingLeft, paddingRight }) =>
      [fontFamily, fontSize, fontWeight, paddingLeft, paddingRight].join("|"))).size).toBe(1);
    for (const visual of visuals) {
      expect(visual.indicatorHeight).toBe("2px");
      expect(visual.indicatorColor).toBe("rgb(4, 166, 241)");
      expect(visual.indicatorOpacity).toBe(visual.selected ? "1" : "0");
    }
  };
  const assertTopAlignment = async (first: string, second: string) => {
    const a = await box(first);
    const b = await box(second);
    expect(Math.abs(a.y - b.y), first + " and " + second + " should share a row").toBeLessThan(12);
  };
  const assertCenterAlignment = async (first: string, second: string) => {
    const a = await box(first);
    const b = await box(second);
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2), first + " and " + second + " controls should share a baseline").toBeLessThan(12);
  };  const assertFullWidthNotes = async () => {
    const note = await box("client-note");
    const section = await box("client-fields-section");
    expect(note.width).toBeGreaterThan(section.width * 0.72);
  };

  // Users regression and native file picker click/keyboard behavior.
  await page.goto("/users/new/");
  await expect(page.getByTestId("user-fields-section")).toBeVisible();
  await expect(hubImage).toBeVisible();
  await expect(hubImage.locator("img")).toHaveCount(0);
  await expect(page.locator('input[type="url"]')).toHaveCount(0);
  const clickChooser = page.waitForEvent("filechooser");
  await dropzone.click();
  await (await clickChooser).setFiles({ name: "preview.png", mimeType: "image/png", buffer: previewPng });
  await expect(hubImage.locator('img[src^="blob:"]')).toBeVisible();
  await expect(hubImage.getByText(/storage|serviço de armazenamento|servicio de almacenamiento/i)).toBeVisible();
  await hubImage.getByTestId("hub-image-remove").click();
  await expect(hubImage.locator("img")).toHaveCount(0);
  await dropzone.focus();
  const keyboardChooser = page.waitForEvent("filechooser");
  await dropzone.press("Space");
  await (await keyboardChooser).setFiles({ name: "preview.png", mimeType: "image/png", buffer: previewPng });
  await expect(hubImage.locator('img[src^="blob:"]')).toBeVisible();
  const noNestedChooser = page.waitForEvent("filechooser", { timeout: 350 }).then(() => true).catch(() => false);
  await hubImage.getByTestId("hub-image-remove").click();
  expect(await noNestedChooser).toBe(false);
  await page.locator("#user-name").fill("Visual User");
  await page.locator("#user-email").fill("visual@example.invalid");
  await page.locator("#user-password").fill("LocalVisual123!");
  await page.locator("#user-confirm-password").fill("LocalVisual123!");
  await page.locator('form button[type="submit"]').last().click();
  await expect(page).toHaveURL(/\/users\/9004\/$/);
  const userCreate = mutations.find((item) => item.method === "POST" && item.path.endsWith("/users"));
  expect(userCreate?.body).toMatchObject({ urlImage: null });
  expect(JSON.stringify(userCreate?.body)).not.toContain("blob:");

  await page.goto("/users/9001/");
  await expect(hubImage.locator("img")).toHaveAttribute("src", urlImage);
  await expect(hubImage.getByRole("status")).toContainText(/loaded|carregada|cargada/i);
  await capture("hub-image-users.png");
  await page.goto("/users/9003/");
  await expect(hubImage.locator("img")).toHaveAttribute("src", /broken\.svg/);
  await expect(hubImage.getByRole("status")).not.toHaveText("");


  // Shared Textarea regression for presentation-only consumers; all API traffic is intercepted above.
  await page.goto("/actions/new/");
  await expect(page.getByTestId("action-fields-section")).toBeVisible();
  await page.getByTestId("action-description-field").locator("textarea").fill("mocked Actions description");
  await expect(page.getByTestId("action-description-field").locator("textarea")).toHaveValue("mocked Actions description");
  await page.goto("/roles/new/");
  await expect(page.getByTestId("role-fields-section")).toBeVisible();
  await page.locator("#role-description").fill("mocked Roles description");
  await expect(page.locator("#role-description")).toHaveValue("mocked Roles description");
  await page.goto("/teams/new/");
  await expect(page.getByTestId("team-fields-section")).toBeVisible();
  await page.locator("#team-description").fill("mocked Teams description");
  await expect(page.locator("#team-description")).toHaveValue("mocked Teams description");
  await page.goto("/equipment-types/new/");
  await expect(page.getByTestId("equipment-type-fields-section")).toBeVisible();
  await page.locator("#equipment-type-description").fill("mocked EquipmentTypes description");
  await expect(page.locator("#equipment-type-description")).toHaveValue("mocked EquipmentTypes description");
  await page.goto("/vehicles/");
  const vehiclePlate = page.getByPlaceholder("Plate");
  await expect(vehiclePlate).toBeVisible();
  await vehiclePlate.fill("MOCK-PLATE");
  await expect(vehiclePlate).toHaveValue("MOCK-PLATE");
  await page.goto("/equipments/");
  const equipmentName = page.getByPlaceholder("Name");
  await expect(equipmentName).toBeVisible();
  await equipmentName.fill("Mock equipment");
  await expect(equipmentName).toHaveValue("Mock equipment");
  expect(mutations.some((item) => ["/actions", "/roles", "/teams", "/equipment-types", "/vehicles", "/equipments"].some((path) => item.path.endsWith(path)))).toBe(false);

  // Preferences tab navigation and shared switch use only mocked API requests.
  await page.goto("/preferences/");
  await expect(page.getByRole("tablist")).toBeVisible();
  const preferenceTabs = page.getByRole("tablist").getByRole("tab");
  await expect(preferenceTabs).toHaveCount(2);
  await expect(preferenceTabs.nth(0)).toHaveText("General");
  await expect(preferenceTabs.nth(1)).toHaveText("Email notifications");
  await assertTabVisualPattern();
  await capture("preferences-general-tabs.png");
  const preferenceLanguage = page.getByRole("combobox", { name: "Select language" });
  await preferenceLanguage.click();
  const languageListbox = page.getByRole("listbox", { name: "Available options" });
  await expect(languageListbox.getByRole("option")).toHaveCount(4);
  await page.locator("input[role='combobox']").fill("Portuguese");
  await expect(languageListbox.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(languageListbox).toBeHidden();
  await expect(preferenceLanguage).toBeFocused();
  await preferenceTabs.first().focus();
  await preferenceTabs.first().press("ArrowRight");
  await expect(preferenceTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await preferenceTabs.nth(1).press("ArrowLeft");
  await expect(preferenceTabs.first()).toHaveAttribute("aria-selected", "true");
  const appearanceOptions = page.getByRole("radiogroup").getByRole("radio");
  await expect(appearanceOptions).toHaveCount(2);
  await appearanceOptions.nth(1).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await preferenceTabs.nth(1).click();
  await assertTabVisualPattern();
  const preferenceSwitch = page.getByRole("switch").first();
  const wasChecked = await preferenceSwitch.getAttribute("aria-checked");
  await preferenceSwitch.focus();
  await preferenceSwitch.press("Space");
  await expect(preferenceSwitch).toHaveAttribute("aria-checked", wasChecked === "true" ? "false" : "true");
  await expect.poll(() => mutations.filter((item) => item.method === "PUT" && item.path === "/api/gerit/v1/user-preferences/9008").length).toBe(2);
  await capture("preferences-email-tabs-switch-dark.png");
  await preferenceTabs.first().click();
  await appearanceOptions.first().click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => mutations.filter((item) => item.method === "PUT" && item.path === "/api/gerit/v1/user-preferences/9008").length).toBe(3);

  // Individual creation layout, label, invalid files and drag/drop preview.
  await page.goto("/clients/new/");
  await expect(page.getByTestId("client-create-page")).toBeVisible();
  await page.getByTestId("client-save").click();
  expect(await page.getByTestId("client-party-type-required").evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(false);
  expect(mutations.filter((item) => item.method === "POST" && item.path.endsWith("/clients"))).toHaveLength(0);
  await chooseHubOption(page, "client-party-type", "Individual");
  await chooseHubOption(page, "client-acquisition-source", "Web");
  await expect(page.getByTestId("client-birth-date")).toBeVisible();
  await expect(page.getByTestId("client-gender")).toBeVisible();
  await expect(page.getByTestId("client-nationality")).toBeVisible();
  await expect(page.getByTestId("client-company-registration")).toHaveCount(0);
  await expect(page.getByTestId("client-economic-activity")).toHaveCount(0);
  await expect(page.getByTestId("client-number-employees")).toHaveCount(0);
  await assertBusinessStatusField();
  await assertCommonClientShell();
  await assertTabKeyboardNavigation();
  await expect(page.getByTestId("client-business-status")).toContainText("Potential");
  await assertWhatsAppBehavior();
  await assertTopAlignment("client-party-type", "client-acquisition-source");
  await assertTopAlignment("client-name", "client-business-status");
  await assertTopAlignment("client-birth-date", "client-gender");
  await assertTopAlignment("client-phone", "client-cell-phone");
  await assertCenterAlignment("client-phone", "client-whatsapp");
  await assertTopAlignment("client-email", "client-website");
  await assertTopAlignment("client-email", "client-nationality");
  expect((await box("hub-image")).x).toBeGreaterThan((await box("client-business-status")).x);
  await expect(page.getByText("Notes", { exact: true })).toBeVisible();
  await assertFullWidthNotes();
  await capture("client-create-individual.png");
  await page.setViewportSize({ width: 900, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1893, height: 1157 });
  await page.getByTestId("client-name").fill("Discarded visual draft");
  await page.getByTestId("client-cancel").click();
  await expect(page.getByTestId("client-name")).toHaveValue("");
  await chooseHubOption(page, "client-party-type", "Individual");
  await chooseHubOption(page, "client-acquisition-source", "Web");
  await page.getByTestId("client-gender").click();
  await expect(page.getByRole("option")).toHaveCount(4);
  await expect(page.getByRole("option")).toHaveText(["Male", "Female", "Non-binary", "Prefer not to say"]);
  await expect(page.getByRole("option", { name: "Other", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Non-binary", exact: true }).click();
  const nationalityTrigger = page.getByTestId("client-nationality");
  await nationalityTrigger.click();
  const nationalityListbox = page.getByRole("listbox", { name: "Available options" });
  const nationalityOptions = nationalityListbox.getByRole("option");
  const nationalitySearch = page.getByTestId("client-nationality-search");
  await expect(nationalityListbox).toBeVisible();
  await expect(nationalityOptions).toHaveCount(79);
  await expect(nationalityTrigger).toContainText(/select/i);
  const nationalityOverflowMetrics = await nationalityListbox.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    maxHeight: getComputedStyle(element).maxHeight,
    optionHeight: element.firstElementChild instanceof HTMLElement ? element.firstElementChild.offsetHeight : 0,
  }));
  console.log("[HubSelect overflow]", JSON.stringify(nationalityOverflowMetrics));
  expect(nationalityOverflowMetrics.scrollHeight).toBeGreaterThan(nationalityOverflowMetrics.clientHeight);
  await expect(nationalitySearch).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(page.locator("[role=\"note\"]")).toHaveText("Scroll to see more options");
  await captureViewport("client-nationality-open-79-options.png");
  await nationalityListbox.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(nationalityOptions.last()).toBeInViewport();
  await nationalityListbox.evaluate((element) => { element.scrollTop = 0; });

  await nationalitySearch.fill("portug");
  await expect(nationalityOptions).toHaveCount(1);
  await expect(nationalityOptions).toHaveText(["Portugal"]);
  await expect(page.locator("[role=\"note\"]")).toHaveCount(0);
  await captureViewport("client-nationality-search-active.png");
  await page.getByRole("option", { name: "Portugal", exact: true }).click();
  await expect(nationalityListbox).toBeHidden();
  await expect(nationalityTrigger).toContainText("Portugal");
  await page.getByTestId("client-nationality-clear").click();
  await expect(nationalityTrigger).not.toContainText("Portugal");
  await nationalityTrigger.click();
  const nationalitySearchAfterClear = page.getByTestId("client-nationality-search");
  await nationalitySearchAfterClear.fill("not-a-country");
  await expect(nationalityListbox.getByRole("status")).toHaveText("No results found.");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(nationalityOptions).toHaveCount(79);
  await nationalitySearchAfterClear.fill("PT");
  await expect(nationalityOptions).toHaveCount(1);
  await expect(nationalityOptions).toHaveText(["Portugal"]);
  await nationalitySearchAfterClear.press("ArrowDown");
  await expect(nationalitySearchAfterClear).toHaveAttribute("aria-activedescendant", /option-/);
  await nationalitySearchAfterClear.press("Enter");
  await expect(nationalityListbox).toBeHidden();
  await expect(nationalityTrigger).toContainText("Portugal");
  await nationalityTrigger.click();
  await page.getByTestId("client-nationality-search").press("Escape");
  await expect(nationalityListbox).toBeHidden();
  await expect(nationalityTrigger).toBeFocused();

  const pngInvalid = { name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not image") };
  await hubImage.getByTestId("hub-image-file").setInputFiles(pngInvalid);
  await expect(hubImage.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("client-save")).toBeEnabled();
  await hubImage.getByTestId("hub-image-file").setInputFiles({
    name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(hubImage.getByRole("alert")).toBeVisible();

  await dropzone.evaluate((element, bytes: number[]) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    (globalThis as typeof globalThis & { __visualTransfer?: DataTransfer }).__visualTransfer = transfer;
    element.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, [...previewPng]);
  await expect(dropzone).toHaveClass(/ring-primary\/40/);
  await dropzone.evaluate((element) => {
    const transfer = (globalThis as typeof globalThis & { __visualTransfer?: DataTransfer }).__visualTransfer;
    if (!transfer) throw new Error("visual drag transfer was not initialized");
    element.dispatchEvent(new DragEvent("dragover", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(hubImage.locator('img[src^="blob:"]')).toBeVisible();
  await expect(dropzone).not.toHaveClass(/ring-primary\/40/);
  await expect(hubImage.getByText(/cannot be saved|storage|upload|armazenamento/i)).toBeVisible();
  await expect(page.getByTestId("client-save")).toBeDisabled();
  await hubImage.getByTestId("hub-image-remove").click();

  await page.getByTestId("client-name").fill("Visual Individual Created");
  await chooseHubOption(page, "client-business-status", "Active");
  await page.getByTestId("client-save").click();
  await expect(page).toHaveURL(/\/clients\/9005\/$/);
  const individualCreate = mutations.filter((item) => item.method === "POST" && item.path.endsWith("/clients"))[0];
  expect(individualCreate?.body).toMatchObject({
    partyTypeId: 1, statusDomainId: 1, statusDefinitionId: 1, isCellPhoneWhatsapp: false, gender: "non-binary", nationality: "PT",
  });
  expect(JSON.stringify(individualCreate?.body)).not.toContain("blob:");

  // Organization create uses the same component and exactly one economic activity field.
  await page.goto("/clients/new/");
  await chooseHubOption(page, "client-party-type", "Organization");
  await chooseHubOption(page, "client-acquisition-source", "Web");
  await expect(page.getByTestId("client-company-registration")).toBeVisible();
  await expect(page.getByTestId("client-economic-activity")).toBeVisible();
  await expect(page.getByTestId("client-economic-activity")).toHaveCount(1);
  await expect(page.getByTestId("client-birth-date")).toHaveCount(0);
  await expect(page.getByTestId("client-gender")).toHaveCount(0);
  await expect(page.getByTestId("client-nationality")).toHaveCount(0);
  await expect(page.getByTestId("client-number-employees")).toBeVisible();
  await assertBusinessStatusField();
  await assertCommonClientShell();
  await expect(page.getByTestId("client-business-status")).toContainText("Potential");
  await assertWhatsAppBehavior();
  await assertTopAlignment("client-party-type", "client-acquisition-source");
  await assertTopAlignment("client-name", "client-business-status");
  await assertTopAlignment("client-company-registration", "client-economic-activity");
  await assertTopAlignment("client-phone", "client-cell-phone");
  await assertCenterAlignment("client-phone", "client-whatsapp");
  await assertTopAlignment("client-email", "client-website");
  await assertTopAlignment("client-email", "client-number-employees");
  expect((await box("hub-image")).x).toBeGreaterThan((await box("client-business-status")).x);
  await expect(page.getByText("Notes", { exact: true })).toBeVisible();
  await assertFullWidthNotes();
  await capture("client-create-organization.png");
  await page.setViewportSize({ width: 900, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1893, height: 1157 });

  await page.getByTestId("client-name").fill("Visual Organization");
  await page.getByTestId("client-economic-activity").fill("VISUAL-EAC-01");
  await page.getByTestId("client-save").click();
  await expect(page).toHaveURL(/\/clients\/9005\/$/);
  const clientCreates = mutations.filter((item) => item.method === "POST" && item.path.endsWith("/clients"));
  expect(clientCreates).toHaveLength(2);
  expect(clientCreates[1]?.body).toMatchObject({
    partyTypeId: 2, statusDomainId: 1, statusDefinitionId: 4, isCellPhoneWhatsapp: false, note: null,
  });
  expect(JSON.stringify(clientCreates[1]?.body)).not.toContain("blob:");

  // Individual edit offers the inactive stored status for display and requires a new active choice before save.
  await page.goto("/clients/9002/");
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(page.getByTestId("client-name")).toHaveValue("Visual Individual");
  await expect(page.getByTestId("client-gender")).toBeVisible();
  await expect(page.getByTestId("client-gender")).toContainText("Stored legacy value: Masc");
  await expect(page.getByTestId("client-nationality")).toContainText("Stored legacy value: Português");
  await expect(page.getByTestId("client-company-registration")).toHaveCount(0);
  await assertBusinessStatusField();
  await assertCommonClientShell();
  await expect(page.getByTestId("client-business-status")).toContainText("Archived");
  await page.getByTestId("client-business-status").click();
  const disabledStoredStatus = page.locator('[role="option"][aria-disabled="true"]');
  await expect(disabledStoredStatus).toHaveCount(1);
  await expect(disabledStoredStatus).toContainText("Archived");
  await page.keyboard.press("Escape");
  await assertWhatsAppBehavior();
  await assertTopAlignment("client-name", "client-business-status");
  await assertTopAlignment("client-phone", "client-cell-phone");
  await assertCenterAlignment("client-phone", "client-whatsapp");
  await assertTopAlignment("client-email", "client-website");
  await assertTopAlignment("client-email", "client-nationality");
  expect((await box("hub-image")).x).toBeGreaterThan((await box("client-business-status")).x);
  await assertFullWidthNotes();
  await capture("client-edit-individual.png");
  await page.getByTestId("client-name").fill("Visual Individual Updated");
  await chooseHubOption(page, "client-business-status", "Archived");
  await page.getByTestId("client-save").click();
  const individualUpdate = mutations.find((item) => item.method === "PUT" && item.path.endsWith("/clients/9002"));
  expect(individualUpdate?.body).toMatchObject({ statusDomainId: 1, statusDefinitionId: 2, name: "Visual Individual Updated", isCellPhoneWhatsapp: false, gender: "Masc", nationality: "Português" });

  // Organization edit uses the same layout, switch and editable status control.
  await page.goto("/clients/9006/");
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  await expect(page.getByTestId("client-company-registration")).toBeVisible();
  await expect(page.getByTestId("client-economic-activity")).toHaveCount(1);
  await expect(page.getByTestId("client-number-employees")).toBeVisible();
  await expect(page.getByTestId("client-birth-date")).toHaveCount(0);
  await expect(page.getByTestId("client-nationality")).toHaveCount(0);
  await assertBusinessStatusField();
  await assertCommonClientShell();
  await expect(page.getByTestId("client-business-status")).toContainText("Inactive");
  await assertWhatsAppBehavior();
  await assertTopAlignment("client-name", "client-business-status");
  await assertTopAlignment("client-company-registration", "client-economic-activity");
  await assertTopAlignment("client-phone", "client-cell-phone");
  await assertCenterAlignment("client-phone", "client-whatsapp");
  await assertTopAlignment("client-email", "client-website");
  await assertTopAlignment("client-email", "client-number-employees");
  expect((await box("hub-image")).x).toBeGreaterThan((await box("client-business-status")).x);
  await assertFullWidthNotes();
  await capture("client-edit-organization.png");
  await page.getByTestId("client-name").fill("Visual Organization Updated");
  await chooseHubOption(page, "client-business-status", "Suspended");
  await page.getByTestId("client-save").click();
  const organizationUpdate = mutations.find((item) => item.method === "PUT" && item.path.endsWith("/clients/9006"));
  expect(organizationUpdate?.body).toMatchObject({ statusDomainId: 1, statusDefinitionId: 5, name: "Visual Organization Updated", isCellPhoneWhatsapp: false });

  // Invalid status domain blocks saving, never coercing to an arbitrary fallback.
  await page.goto("/clients/9007/");
  await expect(page.getByTestId("client-save")).toBeDisabled();
  await expect(page.getByTestId("client-detail-page").getByRole("alert")).toBeVisible();
  expect(mutations.some((item) => item.method === "PUT" && item.path.endsWith("/clients/9007"))).toBe(false);

  await page.goto("/clients/9003/");
  await expect(hubImage.locator("img")).toHaveAttribute("src", /broken\.svg/);
  await expect(hubImage.getByRole("status")).not.toHaveText("");

  expect(mutations.map((item) => item.method + " " + item.path)).toEqual([
    "POST /api/gerit/v1/users",
    "PUT /api/gerit/v1/user-preferences/9008",
    "PUT /api/gerit/v1/user-preferences/9008",
    "PUT /api/gerit/v1/user-preferences/9008",
    "POST /api/gerit/v1/clients",
    "POST /api/gerit/v1/clients",
    "PUT /api/gerit/v1/clients/9002",
    "PUT /api/gerit/v1/clients/9006",
  ]);

  // Preferences visual review: compare the page shell and card tokens against Client V1.
  await page.goto("/clients/9006/");
  await expect(page.getByTestId("client-detail-page")).toBeVisible();
  const referenceRoot = page.getByTestId("client-detail-page").locator(":scope > .gerit-calendar-scrollbar");
  const referenceHeader = page.getByTestId("client-detail-page").locator("header");
  const referenceTabs = page.getByRole("tablist");
  const referenceCard = page.getByTestId("client-fields-section");
  const clientLayout = {
    root: await referenceRoot.evaluate((element) => {
      const style = getComputedStyle(element);
      return { paddingTop: style.paddingTop, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, paddingBottom: style.paddingBottom };
    }),
    header: await referenceHeader.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, borderRadius: style.borderRadius, padding: style.padding, background: style.backgroundColor, shadow: style.boxShadow, borderColor: style.borderTopColor };
    }),
    tabs: await referenceTabs.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    }),
    card: await referenceCard.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, borderRadius: style.borderRadius, padding: style.padding, background: style.backgroundColor, shadow: style.boxShadow, borderColor: style.borderTopColor };
    }),
  };
  await captureViewport("preferences-reference-client-viewport.png");
  await capture("preferences-reference-client-full.png");

  await page.goto("/preferences/");
  await expect(page.getByTestId("preferences-theme-card")).toBeVisible();
  const preferencesRoot = page.getByTestId("user-preferences-page-root");
  const preferencesHeader = page.getByTestId("preferences-page-header");
  const preferencesTabs = page.getByRole("tablist");
  const themeCard = page.getByTestId("preferences-theme-card");
  const preferencesLayout = {
    root: await preferencesRoot.evaluate((element) => {
      const style = getComputedStyle(element);
      return { paddingTop: style.paddingTop, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, paddingBottom: style.paddingBottom };
    }),
    header: await preferencesHeader.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, borderRadius: style.borderRadius, padding: style.padding, background: style.backgroundColor, shadow: style.boxShadow, borderColor: style.borderTopColor };
    }),
    tabs: await preferencesTabs.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    }),
    card: await themeCard.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, borderRadius: style.borderRadius, padding: style.padding, background: style.backgroundColor, shadow: style.boxShadow, borderColor: style.borderTopColor };
    }),
  };
  expect(preferencesLayout.root).toEqual(clientLayout.root);
  expect(preferencesLayout.header).toEqual(clientLayout.header);
  expect(preferencesLayout.tabs).toEqual(clientLayout.tabs);
  expect(preferencesLayout.card).toEqual(clientLayout.card);
  await captureViewport("preferences-general-viewport.png");
  await capture("preferences-general-full.png");

  const assertPreferencesBottomMargin = async (cardTestId: string) => {
    const root = preferencesRoot;
    const card = page.getByTestId(cardTestId);
    await root.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const margin = await root.evaluate((element, cardId) => {
      const cardElement = document.querySelector(`[data-testid="${cardId}"]`);
      if (!cardElement) throw new Error(`missing ${cardId}`);
      return element.getBoundingClientRect().bottom - cardElement.getBoundingClientRect().bottom;
    }, cardTestId);
    expect(margin).toBeGreaterThanOrEqual(15);
    await captureViewport(cardTestId === "preferences-notifications-card" ? "preferences-email-bottom.png" : "preferences-general-bottom.png");
    await root.evaluate((element) => { element.scrollTop = 0; });
  };
  await assertPreferencesBottomMargin("preferences-language-card");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await assertPreferencesBottomMargin("preferences-language-card");
  await page.setViewportSize({ width: 1893, height: 1157 });

  const preferencesAppearanceOptions = page.getByRole("radiogroup").getByRole("radio");
  await preferencesAppearanceOptions.nth(1).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await captureViewport("preferences-general-dark.png");
  await page.getByRole("tab", { name: "Email notifications" }).click();
  const notificationsCard = page.getByTestId("preferences-notifications-card");
  await expect(notificationsCard).toBeVisible();
  await assertPreferencesBottomMargin("preferences-notifications-card");
  await captureViewport("preferences-email-viewport.png");
  await capture("preferences-email-full.png");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await assertPreferencesBottomMargin("preferences-notifications-card");
  await page.setViewportSize({ width: 1893, height: 1157 });
  await captureViewport("preferences-email-dark.png");
});
