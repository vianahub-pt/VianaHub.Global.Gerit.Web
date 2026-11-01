import { expect, type Page, type Request, type Response } from "@playwright/test";
import { performance } from "node:perf_hooks";

function logDuration(phase: string, startedAt: number) {
  console.log(`[E2E] ${phase}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
}

function isLoginRequest(request: Request) {
  const path = new URL(request.url()).pathname;
  return request.method() === "POST" && /^\/api\/auth\/login\/?$/.test(path);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function safeErrorDetails(payload: unknown, secrets: string[]) {
  if (typeof payload !== "object" || payload === null) return "";
  const body = payload as { title?: unknown; errors?: unknown };
  const parts: string[] = [];
  if (typeof body.title === "string" && body.title.trim()) parts.push(body.title.trim());
  if (typeof body.errors === "object" && body.errors !== null) {
    for (const [field, messages] of Object.entries(body.errors as Record<string, unknown>)) {
      const values = Array.isArray(messages) ? messages : [messages];
      for (const value of values) {
        if (typeof value === "string" && value.trim()) parts.push(`${field}: ${value.trim()}`);
      }
    }
  }
  return secrets.reduce((safe, secret) => secret ? safe.split(secret).join("[redacted]") : safe, parts.join("; "))
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b(access|refresh)?token\s*[:=]\s*["']?[^,\s"'}]+/gi, "$1token=[redacted]")
    .slice(0, 300);
}

function isValidAuthSession(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const session = payload as Record<string, unknown>;
  return (
    typeof session.accessToken === "string" && session.accessToken.length > 0 &&
    typeof session.refreshToken === "string" && session.refreshToken.length > 0 &&
    typeof session.accessTokenExpiresAt === "string" && Number.isFinite(Date.parse(session.accessTokenExpiresAt)) &&
    typeof session.refreshTokenExpiresAt === "string" && Number.isFinite(Date.parse(session.refreshTokenExpiresAt)) &&
    (typeof session.roleId === "number" || session.roleId === null || session.roleId === undefined) &&
    typeof session.tenantId === "number" &&
    typeof session.userId === "number" &&
    typeof session.email === "string"
  );
}

function safeAuthResponseShape(payload: unknown) {
  const candidate = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const typeOf = (key: string) => {
    const value = candidate[key];
    return value === null ? "null" : typeof value;
  };
  return [
    `object: ${Object.keys(candidate).length > 0 ? "yes" : "no"}`,
    `accessToken: ${typeOf("accessToken")}`,
    `refreshToken: ${typeOf("refreshToken")}`,
    `accessTokenExpiresAt: ${typeOf("accessTokenExpiresAt")}`,
    `refreshTokenExpiresAt: ${typeOf("refreshTokenExpiresAt")}`,
    `roleId: ${typeOf("roleId")}`,
    `userId: ${typeOf("userId")}`,
    `tenantId: ${typeOf("tenantId")}`,
    `email: ${typeOf("email")}`,
  ].join(", ");
}

async function getSafePersistedSessionStatus(page: Page) {
  return page.evaluate(() => {
    const rawSession = window.localStorage.getItem("gerit.auth.session.v1");
    if (!rawSession) return { present: false, refreshUnexpired: false, shapeValid: false };
    try {
      const session = JSON.parse(rawSession) as Record<string, unknown>;
      const expiry = typeof session.refreshTokenExpiresAt === "string"
        ? Date.parse(session.refreshTokenExpiresAt)
        : Number.NaN;
      const accessExpiry = typeof session.accessTokenExpiresAt === "string"
        ? Date.parse(session.accessTokenExpiresAt)
        : Number.NaN;
      const shapeValid = typeof session.accessToken === "string" && session.accessToken.length > 0 &&
        typeof session.refreshToken === "string" && session.refreshToken.length > 0 &&
        Number.isFinite(accessExpiry) && Number.isFinite(expiry) &&
        (typeof session.roleId === "number" || session.roleId === null) &&
        typeof session.roleName === "string" && typeof session.userId === "number" &&
        typeof session.userName === "string" && typeof session.tenantId === "number" &&
        typeof session.tenantName === "string" && typeof session.email === "string" &&
        typeof session.name === "string";
      return {
        present: true,
        refreshUnexpired: Number.isFinite(expiry) && expiry > Date.now(),
        shapeValid,
      };
    } catch {
      return { present: true, refreshUnexpired: false, shapeValid: false };
    }
  });
}

export async function authenticateFromLogin(page: Page) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("Playwright setup requires E2E_USER_EMAIL and E2E_USER_PASSWORD in the current shell.");
  }

  const loginPageStartedAt = performance.now();
  const navigationPaths: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigationPaths.push(new URL(frame.url()).pathname);
  });
  if (!new URL(page.url()).pathname.startsWith("/login")) {
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
  }
  await expect(page.getByTestId("login-screen-root"), "Login screen must be rendered before authentication").toBeVisible();
  logDuration("login page", loginPageStartedAt);

  const emailInput = page.getByLabel(/email|e-mail|correo electrónico/i).or(
    page.getByRole("textbox", { name: /email|e-mail|correo electrónico/i }),
  ).first();
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.getByRole("button", {
    name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i,
  });

  await expect(emailInput, "Login email field must be visible").toBeVisible();
  const passwordInputCount = await passwordInput.count();
  if (passwordInputCount !== 1) {
    throw new Error(`Login requires exactly one password input; found ${passwordInputCount}.`);
  }
  await expect(passwordInput, "Login password field must be visible").toBeVisible();
  await expect(passwordInput, "Login password field must be enabled").toBeEnabled();
  await expect(submitButton, "Login submit button must be accessible").toBeVisible();
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const validity = await page.evaluate(() => {
    const email = document.querySelector<HTMLInputElement>('input[type="email"]');
    const password = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
    const form = email?.form ?? password?.form ?? null;
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null;
    return {
      emailPresent: Boolean(email?.value),
      emailValid: Boolean(email?.checkValidity()),
      passwordPresent: Boolean(password?.value),
      passwordValid: Boolean(password?.checkValidity()),
      formValid: Boolean(form?.checkValidity()),
      submitEnabled: Boolean(submit && !submit.disabled),
    };
  });
  if (!validity.emailPresent || !validity.emailValid || !validity.passwordPresent || !validity.passwordValid || !validity.formValid || !validity.submitEnabled) {
    throw new Error(`Login stopped before submit: client validation failed (${Object.entries(validity).map(([key, value]) => `${key}=${value ? "yes" : "no"}`).join(", ")}).`);
  }

  let requestResolver: ((request: Request) => void) | undefined;
  let responseResolver: ((response: Response) => void) | undefined;
  let finalResponse: Response | undefined;
  const requestObserved = new Promise<Request>((resolve) => { requestResolver = resolve; });
  const responseObserved = new Promise<Response>((resolve) => { responseResolver = resolve; });
  const onRequest = (request: Request) => {
    if (isLoginRequest(request)) requestResolver?.(request);
  };
  const onResponse = (response: Response) => {
    if (isLoginRequest(response.request()) && !(response.status() >= 300 && response.status() < 400)) {
      finalResponse = response;
      responseResolver?.(response);
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  const submitStartedAt = performance.now();
  try {
    if (!(await submitButton.isEnabled())) {
      throw new Error("Login stopped before submit: submit button is disabled.");
    }
    await submitButton.click();
    try {
      await withTimeout(requestObserved, 1_500, "Login stopped: POST /api/auth/login was not emitted after submit; client validation or submit handling prevented the request.");
    } catch (error) {
      throw error;
    }
    logDuration("login submit to POST observed", submitStartedAt);

    const responseStartedAt = performance.now();
    finalResponse ??= await withTimeout(responseObserved, 20_000, "POST /api/auth/login was emitted, but no final non-redirect response arrived within 20s.");
    logDuration("login response", responseStartedAt);
    const endpoint = new URL(finalResponse.url()).pathname;
    const status = finalResponse.status();
    const payload = await finalResponse.json().catch(() => null) as unknown;
    if (!finalResponse.ok() || status !== 200) {
      const details = safeErrorDetails(payload, [email, password]);
      throw new Error(`Login failed: endpoint=${endpoint}, status=${status}${details ? `, ${details}` : ""}.`);
    }
    let authSessionValid = isValidAuthSession(payload);
    if (!authSessionValid) {
      try {
        authSessionValid = (await getSafePersistedSessionStatus(page)).shapeValid;
      } catch {
        authSessionValid = false;
      }
    }
    if (!authSessionValid) {
      throw new Error(
        `Login returned HTTP ${status} from ${endpoint}, but its AuthResponse shape is invalid ` +
        `(${safeAuthResponseShape(payload)}).`,
      );
    }

    const redirectStartedAt = performance.now();
    try {
      await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "");
    } catch {
      const loginPath = new URL(page.url()).pathname;
      let sessionStatus = { present: false, refreshUnexpired: false };
      try {
        sessionStatus = await getSafePersistedSessionStatus(page);
      } catch {
        // Keep diagnostics safe and deterministic if the browser was closed by a test timeout.
      }
      let directRootWorks = false;
      try {
        await page.goto("/");
        await expect(page.getByTestId("workspace-shell-root")).toBeVisible({ timeout: 5_000 });
        directRootWorks = new URL(page.url()).pathname === "/";
      } catch {
        // This is diagnostic only; the original login redirect remains the acceptance condition.
      }
      throw new Error(
        `Login returned HTTP ${status} with a valid AuthSession, but the app stayed on ${loginPath} ` +
        `(persisted session: ${sessionStatus.present ? "yes" : "no"}; refresh unexpired: ${sessionStatus.refreshUnexpired ? "yes" : "no"}; ` +
        `navigation paths: ${navigationPaths.join(" -> ")}; direct root works: ${directRootWorks ? "yes" : "no"}).`,
      );
    }
    logDuration("redirect", redirectStartedAt);

    const sessionStatus = await getSafePersistedSessionStatus(page);
    if (!sessionStatus.present || !sessionStatus.shapeValid || !sessionStatus.refreshUnexpired) {
      throw new Error("Login response succeeded, but a fresh valid session was not persisted in localStorage.");
    }
    const shellStartedAt = performance.now();
    await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
    logDuration("shell ready", shellStartedAt);
  } catch (error) {
    throw error;
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
    await Promise.allSettled([emailInput.fill(""), passwordInput.fill("")]);
  }
}
