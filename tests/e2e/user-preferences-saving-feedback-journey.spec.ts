import { expect, test } from "@playwright/test";

const savingText = /saving changes to the API|salvando alterações na API|a guardar alterações na API|guardando cambios en la API/i;
const savedText = /preferences loaded and synchronized|preferências carregadas e sincronizadas|preferencias cargadas y sincronizadas/i;
const preferencePath = /\/api\/gerit\/v1\/user-preferences(?:\/|$)/;

test("measure email preference saving feedback lifecycle", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("E2E login is not configured.");

  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const login = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/auth\/login\/?$/.test(new URL(response.url()).pathname) && !(response.status() >= 300 && response.status() < 400));
  await page.getByRole("button", { name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i }).click();
  expect((await login).status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "");

  const preferenceLoad = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return response.request().method() === "GET" && /\/api\/gerit\/v1\/user-preferences\/user\/\d+\/?$/.test(path) && !(response.status() >= 300 && response.status() < 400);
  });
  await page.goto("/preferences/", { waitUntil: "domcontentloaded" });
  expect((await preferenceLoad).status()).toBe(200);
  await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
  await expect(page.getByText(savedText)).toBeVisible();
  await page.getByRole("tab", { name: /e-?mail|notific/i }).click();
  const control = page.getByRole("checkbox", { name: /newsletter/i });
  await expect(control).toBeVisible();
  const original = await control.isChecked();

  try {
  await page.evaluate(({ savingPattern, savedPattern }) => {
    const root = document.querySelector("[data-testid='user-preferences-page-root']");
    if (!root) throw new Error("Preferences root is missing.");
    const saving = new RegExp(savingPattern, "i");
    const saved = new RegExp(savedPattern, "i");
    const timeline: Array<{ event: string; at: number; text?: string; status?: number; role?: string | null; ariaLive?: string | null }> = [];
    const findFeedback = () => Array.from(root.querySelectorAll<HTMLElement>("*"))
      .map((element) => ({ element, text: (element.innerText ?? "").trim() }))
      .filter(({ text }) => text.length > 0 && (saving.test(text) || saved.test(text)))
      .sort((a, b) => a.text.length - b.text.length)[0] ?? null;
    let lastFeedback = findFeedback()?.text ?? "";
    const add = (event: string, details: Partial<(typeof timeline)[number]> = {}) => timeline.push({ event, at: performance.timeOrigin + performance.now(), ...details });
    document.addEventListener("click", (event) => {
      if ((event.target as HTMLElement | null)?.closest('input[type="checkbox"]')) add("switch-click");
    }, true);
    document.addEventListener("change", (event) => {
      if ((event.target as HTMLElement | null)?.closest('input[type="checkbox"]')) add("switch-change");
    }, true);
    new MutationObserver(() => {
      const current = findFeedback();
      const text = current?.text ?? "";
      if (text === lastFeedback) return;
      lastFeedback = text;
      if (!text) {
        add("feedback-cleared");
      } else if (saving.test(text)) {
        add("saving-visible", { text, role: current!.element.getAttribute("role"), ariaLive: current!.element.getAttribute("aria-live") });
      } else if (saved.test(text)) {
        add("saved-visible", { text, role: current!.element.getAttribute("role"), ariaLive: current!.element.getAttribute("aria-live") });
      }
    }).observe(root, { childList: true, subtree: true, characterData: true });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "PUT" || !/\/api\/gerit\/v1\/user-preferences(?:\/|$)/.test(url.pathname)) return nativeFetch(input, init);
      add("put-start");
      const response = await nativeFetch(input, init);
      add("put-final-response", { status: response.status });
      return response;
    };
    (window as Window & { __savingTimeline?: typeof timeline }).__savingTimeline = timeline;
  }, { savingPattern: savingText.source, savedPattern: savedText.source });

  const finalResponse = page.waitForResponse((response) => {
    const status = response.status();
    return response.request().method() === "PUT" && preferencePath.test(new URL(response.url()).pathname) && !(status >= 300 && status < 400);
  });
  await control.focus();
  await page.keyboard.press("Space");
  const update = await finalResponse;
  expect(update.status()).toBe(200);
  await expect(page.getByText(savedText)).toBeVisible();
  const changedValue = !original;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const timeline = await page.evaluate(() => (window as Window & { __savingTimeline?: Array<{event:string;at:number;text?:string;status?:number;role?:string|null;ariaLive?:string|null}> }).__savingTimeline ?? []);
  const savingEvent = timeline.find((event) => event.event === "saving-visible");
  const putStart = timeline.find((event) => event.event === "put-start");
  const putResponse = timeline.find((event) => event.event === "put-final-response");
  const savedEvent = timeline.find((event) => event.event === "saved-visible");
  expect(savingEvent, "saving feedback should be rendered").toBeDefined();
  expect(putStart, "PUT start should be recorded").toBeDefined();
  expect(putResponse?.status).toBe(200);
  expect(savedEvent, "saved feedback should follow the PUT").toBeDefined();
  expect(savedEvent!.at).toBeGreaterThanOrEqual(putResponse!.at);
  expect(savingEvent!.role).toBe("status");
  expect(savingEvent!.ariaLive).toBe("polite");
  expect(savedEvent!.at - savingEvent!.at).toBeGreaterThanOrEqual(400);
  console.log(`SAVING_MEASUREMENT=${JSON.stringify({
    events: timeline.map(({ event, at, text, status, role, ariaLive }) => ({ event, at, text, status, role, ariaLive })),
    savingToResponseMs: savingEvent && putResponse ? putResponse.at - savingEvent.at : null,
    savingVisibleMs: savingEvent && savedEvent ? savedEvent.at - savingEvent.at : null,
    responseStatus: putResponse?.status ?? update.status(),
    feedbackRole: savingEvent?.role ?? null,
    feedbackAriaLive: savingEvent?.ariaLive ?? null,
  })}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /e-?mail|notific/i }).click();
  await expect(page.getByRole("checkbox", { name: /newsletter/i })).toBeChecked({ checked: changedValue });

  } finally {
    await page.goto("/preferences/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("user-preferences-page-root")).toBeVisible();
    await page.getByRole("tab", { name: /e-?mail|notific/i }).click();
    const restoreControl = page.getByRole("checkbox", { name: /newsletter/i });
    await expect(restoreControl).toBeVisible();
    if (await restoreControl.isChecked() !== original) {
      const restoreResponse = page.waitForResponse((response) => response.request().method() === "PUT" && preferencePath.test(new URL(response.url()).pathname) && !(response.status() >= 300 && response.status() < 400));
      await restoreControl.focus();
      await page.keyboard.press("Space");
      expect((await restoreResponse).status()).toBe(200);
      await expect(page.getByText(savedText)).toBeVisible();
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /e-?mail|notific/i }).click();
    await expect(page.getByRole("checkbox", { name: /newsletter/i })).toBeChecked({ checked: original });
  }
});
