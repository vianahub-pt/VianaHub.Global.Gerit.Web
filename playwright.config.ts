import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const localE2eEnvironment = ".env.e2e.local";
if (existsSync(localE2eEnvironment)) {
  for (const variable of ["E2E_BASE_URL", "E2E_USER_EMAIL", "E2E_USER_PASSWORD"]) {
    if (process.env[variable] === "") delete process.env[variable];
  }
  process.loadEnvFile(localE2eEnvironment);
}

const defaultLocalBaseURL = "http://127.0.0.1:3100";
const baseURL = process.env.E2E_BASE_URL || defaultLocalBaseURL;
const storageStatePath = "playwright/.auth/user.json";
const visualE2E = process.env.E2E_VISUAL === "true";

if (baseURL !== defaultLocalBaseURL) {
  throw new Error(`E2E must use the exclusive local URL ${defaultLocalBaseURL}; update E2E_BASE_URL.`);
}

console.log(
  `[Playwright E2E config] baseURL configured: ${process.env.E2E_BASE_URL ? "yes" : "no"}; ` +
  `email configured: ${process.env.E2E_USER_EMAIL ? "yes" : "no"}; ` +
  `password configured: ${process.env.E2E_USER_PASSWORD ? "yes" : "no"}`,
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageStatePath,
      },
      dependencies: ["setup"],
    },
    {
      name: "journey",
      testMatch: /actions-journey\.spec\.ts/,
      timeout: 900_000,
      use: {
        ...devices["Desktop Chrome"],
        storageState: undefined,
        headless: visualE2E ? false : undefined,
        launchOptions: visualE2E ? { slowMo: 350 } : undefined,
        trace: "on",
        screenshot: "only-on-failure",
        video: "on",
      },
    },
  ],
  webServer: {
    command: "node scripts/e2e/start-server.mjs",
    // QA consumes a prebuilt E2E artifact; artifact preparation belongs to the Developer phase.
    wait: { stdout: /\[E2E\] application readiness complete:/ },
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 300_000,
  },
});
