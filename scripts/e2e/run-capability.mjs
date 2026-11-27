import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { evaluatePreflight, loadConfig, portIsAvailable } from "./preflight.mjs";
import { CAPABILITIES } from "./capabilities.mjs";
import { runCapabilityLifecycle } from "./runner-core.mjs";
import { acquireE2ERunLock } from "./run-lock.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[E2E capability] ${message}`);
  process.exit(1);
}

function getRunPlan(capability, env = process.env, { mockedVisual = false, readOnlyVisual = false } = {}) {
  if (capability === "authentication") {
    return { spec: "tests/e2e/authentication-journey.spec.ts", project: "journey", mode: "nonmutating-regression" };
  }
  if (mockedVisual && capability === "teams") {
    return { spec: "tests/e2e/teams-form-mocked-journey.spec.ts", project: "journey", mode: "mocked-visual-read-only" };
  }
  if (mockedVisual && capability === "actions") {
    return { spec: "tests/e2e/actions-form-mocked-journey.spec.ts", project: "journey", mode: "mocked-visual-read-only" };
  }
  if (readOnlyVisual && capability === "clients") {
    return { spec: "tests/e2e/client-address-read-only-journey.spec.ts", project: "journey", mode: "read-only-visual" };
  }
  if (mockedVisual && capability === "clients") {
    return {
      specs: ["tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"],
      project: "journey",
      mode: "mocked-visual-read-only",
    };
  }
  if (capability === "teams" && env.CI === "true") {
    return { spec: "tests/e2e/teams-form-mocked-journey.spec.ts", project: "journey", mode: "nonmutating-regression" };
  }
  if (capability === "actions" && env.CI === "true") {
    return { spec: "tests/e2e/actions-form-mocked-journey.spec.ts", project: "journey", mode: "nonmutating-regression" };
  }
  if (capability === "user-preferences" && env.CI === "true") {
    return { spec: "tests/e2e/workspace-header-theme-journey.spec.ts", project: "journey", mode: "nonmutating-regression" };
  }
  if (capability === "clients" && env.CI === "true") {
    return { specs: ["tests/e2e/hub-image-journey.spec.ts", "tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"], project: "journey", mode: "mocked-functional-and-shared-regression" };
  }
  if (capability === "users" && (env.CI === "true" || !env.E2E_USERS_QA_MUTATION_APPROVAL)) {
    return { spec: "tests/e2e/users-self-password.spec.ts", project: "chromium", mode: "nonmutating-regression" };
  }
  return { spec: `tests/e2e/${capability}-journey.spec.ts`, project: "journey", mode: "canonical-journey" };
}

function getBatchPlan(capabilities, env = process.env, options = {}) {
  const plans = capabilities.map((capability) => getRunPlan(capability, env, options));
  return {
    specs: [...new Set(plans.flatMap((plan) => plan.specs ?? [plan.spec]))],
    projects: [...new Set(plans.map((plan) => plan.project))],
    nonmutatingCapabilities: capabilities.filter((capability, index) => plans[index].mode !== "canonical-journey"),
  };
}

function applyEquipmentTypesMutationApproval(environment, capability, localExecution, mutatingApproved) {
  const result = { ...environment };
  if (capability === "equipment-types" && localExecution && mutatingApproved) result.E2E_MUTATING_APPROVED = "true";
  else delete result.E2E_MUTATING_APPROVED;
  return result;
}
function getE2EEnvironment(env, { localExecution, mockedVisual, readOnlyVisual }) {
  if (!localExecution) return env;
  const result = { ...env, E2E_VISUAL: "true", E2E_SANITIZED_ARTIFACTS: "true" };
  if (mockedVisual && env.E2E_CLIENT_ADDRESS_MODE !== undefined) {
    result.E2E_CLIENT_ADDRESS_MODE = "mocked";
    for (const key of [
      "E2E_CLIENT_ADDRESS_QA_APPROVAL_ID", "E2E_CLIENT_ADDRESS_QA_APPROVAL", "E2E_CLIENT_ADDRESS_MUTATING_APPROVED",
      "E2E_CLIENT_ADDRESS_QA_CLIENT_ID", "E2E_CLIENT_ADDRESS_QA_ALLOWED_CLIENT_ID",
      "E2E_CLIENT_ADDRESS_QA_EXPECTED_USER_ID", "E2E_CLIENT_ADDRESS_QA_EXPECTED_TENANT_ID",
    ]) delete result[key];
  }
  if (readOnlyVisual) result.E2E_READ_ONLY_VISUAL = "true";
  delete result.E2E_ALLOW_EXISTING_STORAGE_STATE;
  return result;
}

function parseInvocation(args) {
  let scopeValue = null;
  let scopeApproved = false;
  let mutatingApproved = false;
  let mockedVisual = false;
  let readOnlyVisual = false;
  let actionsQaApproved = false;
  let actionsFormSmoke = false;
  const capabilities = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--scope") {
      scopeValue = args[index + 1] ?? null;
      index += 1;
    } else if (argument === "--scope-approved") {
      scopeApproved = true;
    } else if (argument === "--mutating-approved") {
      mutatingApproved = true;
    } else if (argument === "--mocked-visual") {
      if (mockedVisual) throw new Error("The mocked visual mode may be selected only once.");
      mockedVisual = true;
    } else if (argument === "--read-only-visual") {
      if (readOnlyVisual) throw new Error("The read-only visual mode may be selected only once.");
      readOnlyVisual = true;
    } else if (argument === "--actions-qa-approved") {
      if (actionsQaApproved) throw new Error("Actions QA approval may be selected only once.");
      actionsQaApproved = true;
    } else if (argument === "--actions-form-smoke") {
      if (actionsFormSmoke) throw new Error("Actions focused form smoke may be selected only once.");
      actionsFormSmoke = true;
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
  if (mockedVisual && (capabilities.length !== 1 || !["clients", "actions", "teams"].includes(capabilities[0]) || mutatingApproved || readOnlyVisual)) {
    throw new Error("Mocked visual mode is read-only and limited to one explicitly supported capability.");
  }
  if (actionsQaApproved && (capabilities.length !== 1 || capabilities[0] !== "actions" || !mutatingApproved || mockedVisual || readOnlyVisual)) {
    throw new Error("Actions QA approval requires one Actions scope, --mutating-approved, and canonical mutating mode.");
  }
  if (actionsFormSmoke && (capabilities.length !== 1 || capabilities[0] !== "actions" || !mutatingApproved || !actionsQaApproved || mockedVisual || readOnlyVisual)) {
    throw new Error("Actions focused form smoke requires one Actions scope and both explicit QA mutation approvals.");
  }
  if (readOnlyVisual && (capabilities.length !== 1 || capabilities[0] !== "clients" || mutatingApproved || mockedVisual)) {
    throw new Error("Read-only visual mode is limited to one clients scope and cannot include mutation approval.");
  }
  return { capabilities, scope, scopeApproved, mutatingApproved, mockedVisual, readOnlyVisual, actionsQaApproved, actionsFormSmoke };
}

function selfTest() {
  assert.equal(applyEquipmentTypesMutationApproval({}, "equipment-types", true, true).E2E_MUTATING_APPROVED, "true");
  assert.equal(applyEquipmentTypesMutationApproval({ E2E_MUTATING_APPROVED: "true" }, "equipment-types", false, true).E2E_MUTATING_APPROVED, undefined);
  assert.equal(applyEquipmentTypesMutationApproval({ E2E_MUTATING_APPROVED: "true" }, "actions", true, true).E2E_MUTATING_APPROVED, undefined);
  assert.deepEqual(getRunPlan("users", { CI: "true", E2E_USERS_QA_MUTATION_APPROVAL: "configured" }), {
    spec: "tests/e2e/users-self-password.spec.ts", project: "chromium", mode: "nonmutating-regression",
  });
  assert.equal(getRunPlan("users", {}).mode, "nonmutating-regression");
  assert.deepEqual(getRunPlan("users", { E2E_USERS_QA_MUTATION_APPROVAL: "uuid" }), {
    spec: "tests/e2e/users-journey.spec.ts", project: "journey", mode: "canonical-journey",
  });
  assert.deepEqual(getRunPlan("user-preferences", { CI: "true" }), {
    spec: "tests/e2e/workspace-header-theme-journey.spec.ts", project: "journey", mode: "nonmutating-regression",
  });
  assert.equal(getRunPlan("user-preferences", {}).spec, "tests/e2e/user-preferences-journey.spec.ts");
  assert.deepEqual(getRunPlan("teams", { CI: "true" }), {
    spec: "tests/e2e/teams-form-mocked-journey.spec.ts", project: "journey", mode: "nonmutating-regression",
  });
  assert.deepEqual(getRunPlan("teams", {}, { mockedVisual: true }), {
    spec: "tests/e2e/teams-form-mocked-journey.spec.ts", project: "journey", mode: "mocked-visual-read-only",
  });
  assert.deepEqual(getRunPlan("equipment-types", { CI: "true" }), {
    spec: "tests/e2e/equipment-types-journey.spec.ts", project: "journey", mode: "canonical-journey",
  });
  assert.deepEqual(getRunPlan("clients", { CI: "true" }), {
    specs: ["tests/e2e/hub-image-journey.spec.ts", "tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"], project: "journey", mode: "mocked-functional-and-shared-regression",
  });
  assert.deepEqual(getBatchPlan(["clients"], { CI: "true" }), {
    specs: ["tests/e2e/hub-image-journey.spec.ts", "tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"],
    projects: ["journey"], nonmutatingCapabilities: ["clients"],
  });
  assert.deepEqual(getBatchPlan(["equipment-types"], { CI: "true" }), {
    specs: ["tests/e2e/equipment-types-journey.spec.ts"], projects: ["journey"], nonmutatingCapabilities: [],
  });
  assert.deepEqual(getRunPlan("actions", { CI: "true" }), { spec: "tests/e2e/actions-form-mocked-journey.spec.ts", project: "journey", mode: "nonmutating-regression" });
  assert.deepEqual(getBatchPlan(["actions", "users"], { CI: "true" }), {
    specs: ["tests/e2e/actions-form-mocked-journey.spec.ts", "tests/e2e/users-self-password.spec.ts"],
    projects: ["journey", "chromium"],
    nonmutatingCapabilities: ["actions", "users"],
  });
  assert.deepEqual(getRunPlan("clients", {}, { mockedVisual: true }), {
    specs: ["tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"],
    project: "journey", mode: "mocked-visual-read-only",
  });
  assert.deepEqual(getRunPlan("actions", {}, { mockedVisual: true }), {
    spec: "tests/e2e/actions-form-mocked-journey.spec.ts", project: "journey", mode: "mocked-visual-read-only",
  });
  assert.throws(() => parseInvocation(["--scope", "actions", "--mocked-visual", "actions", "--mutating-approved"]), /read-only/);
  assert.throws(() => parseInvocation(["--scope", "actions,clients", "--scope-approved", "--mocked-visual", "actions", "clients"]), /limited to one/);
  assert.deepEqual(getRunPlan("clients", { CI: "true" }), {
    specs: ["tests/e2e/hub-image-journey.spec.ts", "tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"], project: "journey", mode: "mocked-functional-and-shared-regression",
  });
  assert.deepEqual(getBatchPlan(["clients"], {}, { mockedVisual: true }), {
    specs: ["tests/e2e/client-contact-person-journey.spec.ts", "tests/e2e/client-address-crud-journey.spec.ts"],
    projects: ["journey"],
    nonmutatingCapabilities: ["clients"],
  });
  const explicitlyMockedEnvironment = getE2EEnvironment({ E2E_CLIENT_ADDRESS_MODE: "qa", E2E_CLIENT_ADDRESS_MUTATING_APPROVED: "true" }, {
    localExecution: true, mockedVisual: true, readOnlyVisual: false,
  });
  assert.equal(explicitlyMockedEnvironment.E2E_CLIENT_ADDRESS_MODE, "mocked");
  assert.equal(explicitlyMockedEnvironment.E2E_VISUAL, "true");
  assert.equal(explicitlyMockedEnvironment.E2E_CLIENT_ADDRESS_MUTATING_APPROVED, undefined);
  assert.deepEqual(parseInvocation(["--scope", "users", "users"]), {
    capabilities: ["users"], scope: ["users"], scopeApproved: false, mutatingApproved: false, mockedVisual: false, readOnlyVisual: false, actionsQaApproved: false, actionsFormSmoke: false,
  });
  assert.throws(() => parseInvocation(["--scope", "users", "users", "teams"]), /exactly match/);
  assert.throws(() => parseInvocation(["--scope", "users,teams", "users", "teams"]), /explicit scope approval/);
  assert.deepEqual(parseInvocation(["--scope", "users,teams", "--scope-approved", "users", "teams"]).scope, ["users", "teams"]);
  assert.equal(parseInvocation(["--scope", "equipment-types", "--mutating-approved", "equipment-types"]).mutatingApproved, true);
  assert.equal(parseInvocation(["--scope", "actions", "--mutating-approved", "--actions-qa-approved", "actions"]).actionsQaApproved, true);
  assert.equal(parseInvocation(["--scope", "actions", "--mutating-approved", "--actions-qa-approved", "--actions-form-smoke", "actions"]).actionsFormSmoke, true);
  assert.throws(() => parseInvocation(["--scope", "actions", "--actions-form-smoke", "actions"]), /requires one Actions scope/);
  assert.throws(() => parseInvocation(["--scope", "actions", "--actions-qa-approved", "actions"]), /requires one Actions scope/);
  assert.throws(() => parseInvocation(["--scope", "actions", "--mutating-approved", "--actions-qa-approved", "--mocked-visual", "actions"]), /read-only/);
  assert.equal(parseInvocation(["--scope", "clients", "--mocked-visual", "clients"]).mockedVisual, true);
  assert.equal(parseInvocation(["--scope", "teams", "--mocked-visual", "teams"]).mockedVisual, true);
  assert.throws(() => parseInvocation(["--scope", "teams", "--mocked-visual", "teams", "--mutating-approved"]), /read-only/);
  assert.deepEqual(getRunPlan("authentication", {}), {
    spec: "tests/e2e/authentication-journey.spec.ts", project: "journey", mode: "nonmutating-regression",
  });
  assert.deepEqual(getBatchPlan(["authentication"], {}), {
    specs: ["tests/e2e/authentication-journey.spec.ts"], projects: ["journey"], nonmutatingCapabilities: ["authentication"],
  });
  assert.equal(parseInvocation(["--scope", "authentication", "authentication"]).capabilities[0], "authentication");
  assert.deepEqual(getRunPlan("clients", {}, { readOnlyVisual: true }), {
    spec: "tests/e2e/client-address-read-only-journey.spec.ts", project: "journey", mode: "read-only-visual",
  });
  assert.deepEqual(getBatchPlan(["clients"], {}, { readOnlyVisual: true }), {
    specs: ["tests/e2e/client-address-read-only-journey.spec.ts"], projects: ["journey"], nonmutatingCapabilities: ["clients"],
  });
  assert.deepEqual(parseInvocation(["--scope", "clients", "--read-only-visual", "clients"]), {
    capabilities: ["clients"], scope: ["clients"], scopeApproved: false, mutatingApproved: false, mockedVisual: false, readOnlyVisual: true, actionsQaApproved: false, actionsFormSmoke: false,
  });
  assert.throws(() => parseInvocation(["--scope", "clients", "--read-only-visual", "clients", "--mutating-approved"]), /cannot include mutation approval/);
  assert.throws(() => parseInvocation(["--scope", "users", "--read-only-visual", "users"]), /limited to one clients scope/);
  assert.throws(() => parseInvocation(["--scope", "clients", "--mocked-visual", "clients", "--mutating-approved"]), /read-only/);
  assert.throws(() => parseInvocation(["--scope", "clients,users", "--scope-approved", "--mocked-visual", "clients", "users"]), /read-only/);
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
const { capabilities, mutatingApproved } = invocation;
if (capabilities.length === 0) fail("Provide one or more capability slugs.");
const localExecution = process.platform === "win32" && process.env.CI !== "true";
if (invocation.mockedVisual && (!localExecution || capabilities.length !== 1 || !["clients", "actions", "teams"].includes(capabilities[0]))) {
  fail("Mocked visual mode is available only for one supported local Windows-host capability run.");
}
if (invocation.actionsFormSmoke && !localExecution) {
  fail("The focused Actions mutation smoke is available only as an explicitly approved local Windows-host run.");
}
if (invocation.readOnlyVisual && (!localExecution || capabilities.length !== 1 || capabilities[0] !== "clients")) {
  fail("Read-only visual mode is available only for one local Windows-host Client run.");
}

const batchPlan = getBatchPlan(capabilities, process.env, { mockedVisual: invocation.mockedVisual, readOnlyVisual: invocation.readOnlyVisual });
if (process.env.CI !== "true" && process.platform !== "win32") {
  fail("Local E2E execution is supported only on the authorized Windows host.");
}
if (localExecution && capabilities.length !== 1) {
  fail("Local E2E execution requires exactly one selected capability.");
}
const e2eEnvironment = { ...getE2EEnvironment(process.env, {
  localExecution,
  mockedVisual: invocation.mockedVisual,
  readOnlyVisual: invocation.readOnlyVisual,
}) };
Object.assign(e2eEnvironment, applyEquipmentTypesMutationApproval(e2eEnvironment, capabilities[0], localExecution, mutatingApproved));
if (batchPlan.nonmutatingCapabilities.includes("actions")) delete e2eEnvironment.E2E_ACTIONS_QA_MUTATION_APPROVAL;
if (invocation.actionsQaApproved && !batchPlan.nonmutatingCapabilities.includes("actions")) e2eEnvironment.E2E_ACTIONS_QA_MUTATION_APPROVAL = "true";
const readOnlyHomologationStatusPath = invocation.readOnlyVisual
  ? resolve(repoRoot, "test-results/client-address-read-only", "homologation-status-" + Date.now() + "-" + process.pid + ".json")
  : null;
if (invocation.readOnlyVisual) {
  e2eEnvironment.E2E_READ_ONLY_VISUAL = "true";
  e2eEnvironment.E2E_READ_ONLY_HOMOLOGATION_STATUS = readOnlyHomologationStatusPath;
}
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
if (invocation.mockedVisual) {
  console.log("[E2E capability] Local mocked visual mode selected. Only the selected capability's mocked visual journey will run; mutating approval is not accepted in this mode.");
}
if (invocation.readOnlyVisual) {
  console.log("[E2E capability] Local QA read-only visual journey selected. Only explicit authentication POSTs and GET/HEAD business requests are permitted by the spec guard.");
}
const playwrightArgs = [playwrightCli, "test", ...batchPlan.specs, ...batchPlan.projects.map((project) => `--project=${project}`)];
if (invocation.actionsFormSmoke) playwrightArgs.push("--grep=Actions focused form save smoke");
if (localExecution) playwrightArgs.push("--headed");
console.log(`[E2E capability] Starting one Playwright run for capabilities: ${capabilities.join(", ")}.`);
let ownedPlaywrightChild;
let playwrightStartedAt = 0;
let storageStateExistedBeforeRun = false;
const runPlaywright = () => new Promise((resolveResult) => {
  playwrightStartedAt = Date.now();
  const storageStatePath = resolve(repoRoot, "playwright/.auth/user.json");
  storageStateExistedBeforeRun = existsSync(storageStatePath);
  ownedPlaywrightChild = spawn(process.execPath, playwrightArgs, {
    cwd: repoRoot,
    env: e2eEnvironment,
    shell: false,
    stdio: "inherit",
  });
  const onSigint = () => ownedPlaywrightChild.kill("SIGINT");
  const onSigterm = () => ownedPlaywrightChild.kill("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  ownedPlaywrightChild.once("error", (error) => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    console.error("[E2E capability] Failed to start Playwright (" + error.message + ").");
    resolveResult({ code: 1 });
  });
  ownedPlaywrightChild.once("exit", (code, signal) => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    const exitCode = code ?? (signal ? 1 : 0);
    if (readOnlyHomologationStatusPath && existsSync(readOnlyHomologationStatusPath)) {
      try {
        const homologationStatus = JSON.parse(readFileSync(readOnlyHomologationStatusPath, "utf8"));
        if (exitCode === 0 && homologationStatus.status === "INCOMPLETE" && homologationStatus.reason === "fixture-unavailable") {
          resolveResult({ code: exitCode, incomplete: "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE" });
          return;
        }
      } catch {
        resolveResult({ code: 1 });
        return;
      }
    }
    resolveResult({ code: exitCode });
  });
});

async function cleanupOwnedPlaywright() {
  const owned = ownedPlaywrightChild;
  if (!owned || !owned.pid) return true;
  if (owned.exitCode === null) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(owned.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      try { owned.kill("SIGTERM"); } catch {}
    }
    await Promise.race([
      new Promise((resolveExit) => owned.once("exit", resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
    ]);
  }
  if (owned.exitCode === null) return false;
  const storageStatePath = resolve(repoRoot, "playwright/.auth/user.json");
  try {
    if (!storageStateExistedBeforeRun && existsSync(storageStatePath) && statSync(storageStatePath).mtimeMs >= playwrightStartedAt) {
      rmSync(storageStatePath, { force: true });
      console.log("[E2E cleanup] This run's authenticated storage state was removed.");
    }
  } catch {
    return false;
  }
  return true;
}

if (localExecution) {
  const mode = batchPlan.nonmutatingCapabilities.includes(capabilities[0]) ? "read-only" : "mutating";
  if (mode === "mutating" && !mutatingApproved) {
    fail("Mutating E2E requires the explicit --mutating-approved option for this run.");
  }
  const config = await loadConfig();
  let runLock;
  try {
    runLock = acquireE2ERunLock({ root: repoRoot });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to acquire the shared E2E run lock.");
  }
  const lifecycle = await runCapabilityLifecycle({
    preflight: async (stage) => {
      const report = await evaluatePreflight({
        capability: capabilities[0],
        mode,
        stage,
        mutatingApproved,
        clientMutationApproved: process.env.E2E_CLIENT_QA_MUTATION_APPROVAL === "true",
        actionsMutationApproved: invocation.actionsQaApproved,
        readOnlyVisual: invocation.readOnlyVisual,
        mockedVisual: invocation.mockedVisual,
        config,
      });
      console.log("[E2E preflight] " + JSON.stringify(report));
      return {
        pass: report.status === "PRECHECK_CONFIG_PASS" && !report.authorization.endsWith("_PENDING"),
        reason: report.status === "PRECHECK_CONFIG_PASS" ? report.authorization : "configuration-preflight-blocked",
      };
    },
    prepareBuild: async () => {
      const build = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm run e2e:prepare"], {
        cwd: repoRoot,
        env: { ...process.env },
        stdio: "inherit",
      });
      return build.error ? 1 : (build.status ?? 1);
    },
    runPlaywright,
    cleanup: cleanupOwnedPlaywright,
    isPortFree: portIsAvailable,
  });
  if (lifecycle.status !== "CLEANUP_INCOMPLETE") runLock.release();
  console.log("[E2E lifecycle] " + JSON.stringify(lifecycle));
  if (lifecycle.status === "E2E_INCOMPLETE") console.log("[E2E capability] " + lifecycle.reason);
  process.exitCode = lifecycle.status === "E2E_PASS" ? 0 : 1;
} else {
  const result = await runPlaywright();
  process.exitCode = result.code;
}
