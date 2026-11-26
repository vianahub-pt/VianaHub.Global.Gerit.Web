import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginScreen = readFileSync("platform/auth/login-screen.tsx", "utf8");
const authHelper = readFileSync("tests/e2e/helpers/auth.ts", "utf8");
const authSetup = readFileSync("tests/e2e/auth.setup.ts", "utf8");

test("login mount marker is independent from optional E2E diagnostics", () => {
  assert.match(loginScreen, /const \[mounted, setMounted\] = useState\(false\)/);
  assert.match(loginScreen, /setMounted\(true\)/);
  assert.match(loginScreen, /data-hydrated=\{mounted \? "true" : undefined\}/);
  assert.doesNotMatch(loginScreen, /e2eDiagnosticsHydrated|setE2EDiagnosticsHydrated/);
});

test("login diagnostics remain opt-in and helpers install them before the relevant document mounts", () => {
  assert.match(loginScreen, /if \(diagnosticWindow\.__GERIT_E2E_DIAGNOSTICS__ === true\) \{[\s\S]*?__GERIT_E2E_LOGIN_DIAGNOSTIC__/);
  assert.match(authHelper, /await page\.addInitScript\([\s\S]*?if \(new URL\(page\.url\(\)\)[\s\S]*?await page\.reload\(/);
  assert.match(authSetup, /await page\.addInitScript\([\s\S]*?await page\.goto\("\/login\/"/);
});
