import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePreflight } from "../../scripts/e2e/preflight.mjs";
import { runCapabilityLifecycle } from "../../scripts/e2e/runner-core.mjs";

const git = {
  root: "C:\\git\\VianaHub.Global.Gerit.Web",
  branch: "feature/equipment-types-crud",
  worktreeCount: 1,
  dirty: true,
};
const config = {
  E2E_BASE_URL: "http://127.0.0.1:3100",
  GERIT_API_BASE_URL: "https://gerit-api.vianahub.pt",
  E2E_USER_EMAIL: "configured",
  E2E_USER_PASSWORD: "configured",
};
const valid = {
  capability: "equipment-types",
  mode: "mutating",
  mutatingApproved: true,
  platform: "win32",
  git,
  config,
  portAvailable: async () => true,
  buildCurrent: async () => true,
  fileExists: () => true,
  readText: async () => "finally randomUUID DELETE 410",
};

test("preflight accepts official local E2E configuration and dirty preserved worktree", async () => {
  const result = await evaluatePreflight(valid);
  assert.equal(result.status, "PRECHECK_CONFIG_PASS");
  assert.equal(result.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  assert.equal(result.git.workingTreeDirty, true);
});

test("preflight accepts the authorized EquipmentTypes visual hotfix branch", async () => {
  const result = await evaluatePreflight({
    ...valid,
    git: { ...git, branch: "hotfix/equipment-types-form-design" },
  });
  assert.equal(result.status, "PRECHECK_CONFIG_PASS");
  assert.equal(result.checks.branch, true);
  assert.equal(result.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
});

test("preflight blocks wrong local URL, unknown capability, missing credentials and stale build", async () => {
  assert.equal((await evaluatePreflight({ ...valid, config: { ...config, E2E_BASE_URL: "http://localhost:3000" } })).status, "PREFLIGHT_BLOCKED");
  assert.equal((await evaluatePreflight({ ...valid, capability: "unknown" })).checks.capabilityAllowed, false);
  assert.equal((await evaluatePreflight({ ...valid, config: { ...config, E2E_USER_PASSWORD: "" } })).checks.credentialsConfigured, false);
  assert.equal((await evaluatePreflight({ ...valid, buildCurrent: async () => false })).checks.buildCurrent, false);
});

test("preflight blocks the wrong API origin, branch, workspace and extra worktrees", async () => {
  assert.equal((await evaluatePreflight({ ...valid, config: { ...config, GERIT_API_BASE_URL: "https://example.invalid" } })).checks.qaApiOrigin, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, branch: "develop" } })).checks.branch, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, root: "C:\\other" } })).checks.workspace, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, worktreeCount: 2 } })).checks.singleWorktree, false);
});

test("preflight blocks missing spec, missing cleanup plan, and an occupied port", async () => {
  assert.equal((await evaluatePreflight({ ...valid, fileExists: () => false })).checks.canonicalSpec, false);
  assert.equal((await evaluatePreflight({ ...valid, readText: async () => "randomUUID" })).checks.cleanupPlan, false);
  assert.equal((await evaluatePreflight({ ...valid, portAvailable: async () => false })).checks.portAvailable, false);
});

test("preflight separates read-only authorization from pending mutating authorization", async () => {
  const readOnly = await evaluatePreflight({ ...valid, mode: "read-only", mutatingApproved: false });
  const pending = await evaluatePreflight({ ...valid, mutatingApproved: false });
  const otherCapability = await evaluatePreflight({
    ...valid,
    capability: "users",
    git: { ...git, branch: "feature/users-crud" },
    mutatingApproved: true,
  });
  assert.equal(readOnly.authorization, "READ_ONLY_AUTHORIZED");
  assert.equal(pending.authorization, "MUTATING_AUTHORIZATION_PENDING");
  assert.equal(otherCapability.authorization, "MUTATING_AUTHORIZATION_PENDING");
});

test("runner blocks before build when preflight fails and still invokes cleanup", async () => {
  let cleanupCalls = 0;
  let buildCalls = 0;
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: false, reason: "occupied-port" }),
    prepareBuild: async () => { buildCalls += 1; return 0; },
    runPlaywright: async () => ({ code: 0 }),
    cleanup: async () => { cleanupCalls += 1; return true; },
    isPortFree: async () => true,
  });
  assert.equal(result.status, "PREFLIGHT_BLOCKED");
  assert.equal(buildCalls, 0);
  assert.equal(cleanupCalls, 1);
});

test("runner reports build failure and runs cleanup without starting Playwright", async () => {
  let cleanupCalls = 0;
  let playwrightCalls = 0;
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 1,
    runPlaywright: async () => { playwrightCalls += 1; return { code: 0 }; },
    cleanup: async () => { cleanupCalls += 1; return true; },
    isPortFree: async () => true,
  });
  assert.equal(result.status, "E2E_FAIL");
  assert.equal(playwrightCalls, 0);
  assert.equal(cleanupCalls, 1);
});

test("runner reports Playwright failure and verifies owned process cleanup", async () => {
  let cleanupCalls = 0;
  let portChecks = 0;
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 1 }),
    cleanup: async () => { cleanupCalls += 1; return true; },
    isPortFree: async () => { portChecks += 1; return true; },
  });
  assert.equal(result.status, "E2E_FAIL");
  assert.equal(cleanupCalls, 1);
  assert.equal(portChecks, 1);
});

test("runner reports E2E pass only after cleanup and a free local port", async () => {
  let cleanupCalls = 0;
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 0 }),
    cleanup: async () => { cleanupCalls += 1; return true; },
    isPortFree: async () => true,
  });
  assert.equal(result.status, "E2E_PASS");
  assert.equal(cleanupCalls, 1);
});

test("runner reports incomplete cleanup when process cleanup or port verification fails", async () => {
  const processFailure = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 0 }),
    cleanup: async () => false,
    isPortFree: async () => true,
  });
  const portFailure = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 1 }),
    cleanup: async () => true,
    isPortFree: async () => false,
  });
  assert.equal(processFailure.status, "CLEANUP_INCOMPLETE");
  assert.equal(portFailure.status, "CLEANUP_INCOMPLETE");
});
