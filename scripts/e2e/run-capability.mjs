import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[E2E capability] ${message}`);
  process.exit(1);
}

function getRunPlan(capability, env = process.env) {
  if (capability === "users" && (env.CI === "true" || !env.E2E_USERS_QA_MUTATION_APPROVAL)) {
    return { spec: "tests/e2e/users-self-password.spec.ts", project: "chromium", mode: "nonmutating-regression" };
  }
  return { spec: `tests/e2e/${capability}-journey.spec.ts`, project: "journey", mode: "canonical-journey" };
}

function selfTest() {
  assert.deepEqual(getRunPlan("users", { CI: "true", E2E_USERS_QA_MUTATION_APPROVAL: "configured" }), {
    spec: "tests/e2e/users-self-password.spec.ts", project: "chromium", mode: "nonmutating-regression",
  });
  assert.equal(getRunPlan("users", {}).mode, "nonmutating-regression");
  assert.deepEqual(getRunPlan("users", { E2E_USERS_QA_MUTATION_APPROVAL: "uuid" }), {
    spec: "tests/e2e/users-journey.spec.ts", project: "journey", mode: "canonical-journey",
  });
  assert.deepEqual(getRunPlan("teams", { CI: "true" }), {
    spec: "tests/e2e/teams-journey.spec.ts", project: "journey", mode: "canonical-journey",
  });
  console.log("E2E capability runner self-tests passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const slug = process.argv[2];
if (process.argv.length !== 3 || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("Provide exactly one capability slug using lowercase letters, digits, and single hyphens.");
}

const runPlan = getRunPlan(slug);
const nativeSpecPath = resolve(repoRoot, runPlan.spec);
const canonicalDirectory = resolve(repoRoot, "tests", "e2e");
if (!nativeSpecPath.startsWith(`${canonicalDirectory}${sep}`) || !existsSync(nativeSpecPath)) {
  fail(`Canonical journey not found for capability '${slug}'.`);
}

let playwrightCli;
try {
  const packageJsonPath = require.resolve("@playwright/test/package.json");
  const packageMetadata = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const cliEntry = packageMetadata.bin?.playwright;
  if (typeof cliEntry !== "string" || cliEntry.length === 0) {
    throw new Error("Installed @playwright/test metadata does not declare a Playwright CLI.");
  }
  playwrightCli = resolve(dirname(packageJsonPath), cliEntry);
} catch (error) {
  fail(`Unable to resolve the installed Playwright CLI (${error instanceof Error ? error.message : "package metadata unavailable"}).`);
}

if (runPlan.mode === "nonmutating-regression") {
  console.log(`[E2E capability] Running ${slug} nonmutating regression: ${runPlan.spec}. The CRUD/CSV mutative journey will NOT run in CI or without per-run QA approval.`);
}
const child = spawn(process.execPath, [playwrightCli, "test", runPlan.spec, `--project=${runPlan.project}`], {
  cwd: repoRoot,
  env: process.env,
  shell: false,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`[E2E capability] Failed to start Playwright (${error.message}).`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
