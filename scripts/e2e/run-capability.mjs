import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const CAPABILITIES = ["actions", "user-preferences", "teams", "roles", "users"];

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

function parseInvocation(args) {
  let scopeValue = null;
  let scopeApproved = false;
  const capabilities = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--scope") {
      scopeValue = args[index + 1] ?? null;
      index += 1;
    } else if (argument === "--scope-approved") {
      scopeApproved = true;
    } else if (argument.startsWith("--")) {
      throw new Error("Unknown runner option " + argument + ".");
    } else {
      capabilities.push(argument);
    }
  }
  if (!scopeValue) throw new Error("An explicit E2E scope is required.");
  const scope = scopeValue.split(",").map((item) => item.trim()).filter(Boolean);
  if (scope.length === 0 || scope.some((item) => !CAPABILITIES.includes(item))) {
    throw new Error("The E2E scope contains an unknown or missing capability.");
  }
  if (new Set(scope).size !== scope.length) throw new Error("The E2E scope contains duplicate capabilities.");
  if (scope.length > 1 && !scopeApproved) throw new Error("Multiple E2E capabilities require explicit scope approval.");
  if (capabilities.length !== scope.length || scope.some((item) => !capabilities.includes(item))) {
    throw new Error("Selected E2E capabilities must exactly match the declared scope.");
  }
  if (new Set(capabilities).size !== capabilities.length || capabilities.some((item) => !CAPABILITIES.includes(item))) {
    throw new Error("Provide unique, supported capability slugs.");
  }
  return { capabilities, scope, scopeApproved };
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
  assert.deepEqual(parseInvocation(["--scope", "users", "users"]), {
    capabilities: ["users"], scope: ["users"], scopeApproved: false,
  });
  assert.throws(() => parseInvocation(["--scope", "users", "users", "teams"]), /exactly match/);
  assert.throws(() => parseInvocation(["--scope", "users,teams", "users", "teams"]), /explicit scope approval/);
  assert.deepEqual(parseInvocation(["--scope", "users,teams", "--scope-approved", "users", "teams"]).scope, ["users", "teams"]);
  console.log("E2E capability runner self-tests passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

let invocation;
try {
  invocation = parseInvocation(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : "Invalid E2E scope invocation.");
}
const { capabilities } = invocation;
if (capabilities.length === 0) fail("Provide one or more capability slugs.");

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
