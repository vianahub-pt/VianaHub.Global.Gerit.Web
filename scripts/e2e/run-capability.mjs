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

function getBatchPlan(capabilities, env = process.env) {
  const plans = capabilities.map((capability) => getRunPlan(capability, env));
  return {
    specs: [...new Set(plans.map((plan) => plan.spec))],
    projects: [...new Set(plans.map((plan) => plan.project))],
    nonmutatingCapabilities: capabilities.filter((capability, index) => plans[index].mode === "nonmutating-regression"),
  };
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
  assert.deepEqual(getBatchPlan(["actions", "users"], { CI: "true" }), {
    specs: ["tests/e2e/actions-journey.spec.ts", "tests/e2e/users-self-password.spec.ts"],
    projects: ["journey", "chromium"],
    nonmutatingCapabilities: ["users"],
  });
  console.log("E2E capability runner self-tests passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const capabilities = process.argv.slice(2);
if (capabilities.length === 0 || capabilities.some((capability) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(capability)) || new Set(capabilities).size !== capabilities.length) {
  fail("Provide one or more unique capability slugs using lowercase letters, digits, and single hyphens.");
}

const batchPlan = getBatchPlan(capabilities);
const canonicalDirectory = resolve(repoRoot, "tests", "e2e");
for (const spec of batchPlan.specs) {
  const nativeSpecPath = resolve(repoRoot, spec);
  if (!nativeSpecPath.startsWith(`${canonicalDirectory}${sep}`) || !existsSync(nativeSpecPath)) {
    fail(`Canonical E2E spec not found: '${spec}'.`);
  }
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

for (const capability of batchPlan.nonmutatingCapabilities) {
  console.log(`[E2E capability] Running ${capability} nonmutating regression. The CRUD/CSV mutative journey will NOT run in CI or without per-run QA approval.`);
}
const playwrightArgs = [playwrightCli, "test", ...batchPlan.specs, ...batchPlan.projects.map((project) => `--project=${project}`)];
console.log(`[E2E capability] Starting one Playwright run for capabilities: ${capabilities.join(", ")}.`);
const child = spawn(process.execPath, playwrightArgs, {
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
