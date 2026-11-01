import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";
const diagnosticFile = "test-results/auth-diagnostic.json";

type AuthDiagnostic = {
  emailDomFilled: boolean;
  passwordDomFilled: boolean;
  validationErrorVisible: boolean;
  submitButtonClickObserved: boolean;
  formSubmitObserved: boolean;
  loginRequestObserved: boolean;
  loginResponseStatus: number | null;
  consoleErrors: string[];
  pageErrors: string[];
  finalUrl: string;
  failurePhase: string | null;
  failureMessage: string | null;
};

function safeMessage(message: string, secrets: string[]) {
  return secrets.reduce(
    (safe, secret) => secret ? safe.split(secret).join("[redacted]") : safe,
    message,
  )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi, "$1: [redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b(access|refresh)?token\s*[:=]\s*["']?[^,\s"'}]+/gi, "$1token=[redacted]")
    .replace(/([?&](?:email|password|token|access_token|refresh_token)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 1_000);
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return "";
  }
}

function isLoginEndpoint(url: string) {
  try {
    return /^\/api\/auth\/login\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

setup("authenticate", async ({ page, context }, testInfo) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  const secrets = [email, password].filter((value): value is string => Boolean(value));
  const diagnostic: AuthDiagnostic = {
    emailDomFilled: false,
    passwordDomFilled: false,
    validationErrorVisible: false,
    submitButtonClickObserved: false,
    formSubmitObserved: false,
    loginRequestObserved: false,
    loginResponseStatus: null,
    consoleErrors: [],
    pageErrors: [],
    finalUrl: "",
    failurePhase: "credentials",
    failureMessage: null,
  };

  const diagnosticPath = resolve(diagnosticFile);
  let caughtError: unknown;

  try {
    if (!email || !password) {
      throw new Error("Setup requires E2E_USER_EMAIL and E2E_USER_PASSWORD.");
    }

    await rm(authFile, { force: true });
    await mkdir(dirname(authFile), { recursive: true });

    diagnostic.failurePhase = "install diagnostic listeners";
    await context.exposeBinding("__recordE2EAuthEvent", (_source, eventName: string) => {
      if (eventName === "submitButtonClickObserved") diagnostic.submitButtonClickObserved = true;
      if (eventName === "formSubmitObserved") diagnostic.formSubmitObserved = true;
    });
    await page.addInitScript(() => {
      type AuthEvent = "submitButtonClickObserved" | "formSubmitObserved";
      const diagnosticWindow = window as Window & {
        __recordE2EAuthEvent?: (eventName: AuthEvent) => Promise<void>;
      };
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button[type="submit"]')) {
          void diagnosticWindow.__recordE2EAuthEvent?.("submitButtonClickObserved");
        }
      }, true);
      document.addEventListener("submit", (event) => {
        if (event.target instanceof HTMLFormElement) {
          void diagnosticWindow.__recordE2EAuthEvent?.("formSubmitObserved");
        }
      }, true);
    });

    page.on("request", (request) => {
      if (request.method() === "POST" && isLoginEndpoint(request.url())) {
        diagnostic.loginRequestObserved = true;
      }
    });
    page.on("response", (response) => {
      if (response.request().method() !== "POST" || !isLoginEndpoint(response.url())) return;
      if (response.status() >= 300 && response.status() < 400) return;
      diagnostic.loginResponseStatus = response.status();
    });
    page.on("console", (message) => {
      if (message.type() !== "error" || diagnostic.consoleErrors.length >= 10) return;
      diagnostic.consoleErrors.push(safeMessage(message.text(), secrets));
    });
    page.on("pageerror", (error) => {
      if (diagnostic.pageErrors.length >= 10) return;
      const stack = error.stack ? `\n${error.stack}` : "";
      diagnostic.pageErrors.push(safeMessage(`${error.message}${stack}`, secrets));
    });

    diagnostic.failurePhase = "open login page";
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("login-screen-root")).toBeVisible();

    diagnostic.failurePhase = "locate login form";
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.getByRole("button", {
      name: /authenticate|autenticar|sign in|log in|entrar|iniciar sesión|iniciar sess[aã]o/i,
    });
    await expect(emailInput).toHaveCount(1);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeEnabled();
    await expect(passwordInput).toHaveCount(1);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEnabled();
    await expect(submitButton).toHaveCount(1);
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    diagnostic.failurePhase = "fill login form";
    await emailInput.fill(email);
    diagnostic.emailDomFilled = (await emailInput.inputValue()) === email;
    await passwordInput.fill(password);
    diagnostic.passwordDomFilled = (await passwordInput.inputValue()) === password;

    diagnostic.validationErrorVisible = await page.locator('[aria-live="polite"]').evaluateAll((nodes) =>
      nodes.some((node) => {
        const element = node as HTMLElement;
        return element.textContent?.trim() !== "" &&
          !element.classList.contains("text-transparent") &&
          getComputedStyle(element).visibility === "visible";
      }),
    );
    if (!diagnostic.emailDomFilled || !diagnostic.passwordDomFilled) {
      throw new Error("One or more login inputs did not retain the filled value.");
    }
    if (diagnostic.validationErrorVisible) {
      throw new Error("A visible login validation message appeared before submit.");
    }

    diagnostic.failurePhase = "submit login form";
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        isLoginEndpoint(response.url()) &&
        !(response.status() >= 300 && response.status() < 400),
      { timeout: 10_000 },
    ).catch(() => null);
    await submitButton.click();
    const loginResponse = await responsePromise;
    if (loginResponse) diagnostic.loginResponseStatus = loginResponse.status();

    diagnostic.failurePhase = "validate login response";
    if (!diagnostic.loginRequestObserved) {
      throw new Error("Submit completed without emitting POST /api/auth/login.");
    }
    if (!loginResponse) {
      throw new Error("POST /api/auth/login was emitted, but no final response was observed.");
    }
    if (loginResponse.status() !== 200) {
      throw new Error(`POST /api/auth/login returned HTTP ${loginResponse.status()}.`);
    }

    diagnostic.failurePhase = "confirm authenticated session";
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByTestId("workspace-shell-root")).toBeVisible();
    const sessionIsValid = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("gerit.auth.session.v1");
        if (!raw) return false;
        const session = JSON.parse(raw) as Record<string, unknown>;
        return typeof session.accessToken === "string" && session.accessToken.length > 0 &&
          typeof session.refreshToken === "string" && session.refreshToken.length > 0 &&
          typeof session.accessTokenExpiresAt === "string" &&
          Number.isFinite(Date.parse(session.accessTokenExpiresAt)) &&
          typeof session.refreshTokenExpiresAt === "string" &&
          Number.isFinite(Date.parse(session.refreshTokenExpiresAt));
      } catch {
        return false;
      }
    });
    if (!sessionIsValid) throw new Error("Login succeeded but no valid session was persisted.");

    diagnostic.failurePhase = "write storageState";
    await page.context().storageState({ path: authFile });
    diagnostic.failurePhase = null;
  } catch (error) {
    caughtError = error;
    diagnostic.failureMessage = safeMessage(
      error instanceof Error ? error.message : "Unknown authentication setup error.",
      secrets,
    );
  } finally {
    diagnostic.finalUrl = safeUrl(page.url());
    await mkdir(dirname(diagnosticPath), { recursive: true });
    await writeFile(diagnosticPath, JSON.stringify(diagnostic, null, 2), "utf8");
    await testInfo.attach("auth-diagnostic", {
      path: diagnosticPath,
      contentType: "application/json",
    });
  }

  if (caughtError) {
    throw new Error(
      `Authentication setup failed at ${diagnostic.failurePhase ?? "unknown phase"}: ${diagnostic.failureMessage ?? "see auth-diagnostic.json"}`,
    );
  }
});
