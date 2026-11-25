import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluatePreflight } from "../../scripts/e2e/preflight.mjs";
import { runCapabilityLifecycle } from "../../scripts/e2e/runner-core.mjs";

const git = {
  root: "C:\\git\\VianaHub.Global.Gerit.Web",
  branch: "feature/equipment-types-crud",
  worktreeCount: 2,
  headSha: "a".repeat(40),
  worktrees: [
    `worktree C:\\git\\VianaHub.Global.Gerit.Web\nHEAD ${"a".repeat(40)}\nbranch refs/heads/feature/equipment-types-crud`,
    `worktree C:\\git\\VianaHub.Global.Gerit.Web-client-address-layout\nHEAD ${"b".repeat(40)}\nbranch refs/heads/feature/client-address-form-layout`,
  ],
  dirty: false,
  changedFiles: [],
};
const config = {
  E2E_BASE_URL: "http://127.0.0.1:3100",
  GERIT_API_BASE_URL: "https://gerit-api.vianahub.pt",
  E2E_USER_EMAIL: "configured",
  E2E_USER_PASSWORD: "configured",
};
const clientsCleanupSpec = await readFile("tests/e2e/clients-journey.spec.ts", "utf8");
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
const withBranch = (branch) => ({
  ...git,
  branch,
  worktrees: [git.worktrees[0].replace(`refs/heads/${git.branch}`, `refs/heads/${branch}`), git.worktrees[1]],
});

test("preflight accepts official local E2E configuration on a clean worktree", async () => {
  const result = await evaluatePreflight(valid);
  assert.equal(result.status, "PRECHECK_CONFIG_PASS");
  assert.equal(result.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  assert.equal(result.git.workingTreeDirty, false);
});

test("preflight accepts only scoped dirty Client files for local mocked visual validation", async () => {
  const result = await evaluatePreflight({
    ...valid,
    capability: "clients",
    mode: "read-only",
    git: { ...withBranch("feature/client-crud-v1"), dirty: true, changedFiles: ["domains/operations/clients/clients-v1-addresses.tsx"] },
    readText: async () => clientsCleanupSpec,
  });
  assert.equal(result.status, "PRECHECK_CONFIG_PASS");
  assert.equal(result.authorization, "READ_ONLY_AUTHORIZED");
});

test("preflight accepts scoped dirty Actions files only for the Actions mocked visual journey", async () => {
  const result = await evaluatePreflight({
    ...valid,
    capability: "actions",
    mode: "read-only",
    mockedVisual: true,
    git: {
      ...withBranch("feature/actions-isactive-form-refactor"),
      dirty: true,
      changedFiles: [
        "domains/operations/actions/action-form-page.tsx",
        "tests/e2e/actions-form-mocked-journey.spec.ts",
        "scripts/e2e/preflight.mjs",
      ],
    },
    readText: async () => await readFile("tests/e2e/actions-form-mocked-journey.spec.ts", "utf8"),
  });
  assert.equal(result.checks.workingTreePreserved, true);
  assert.equal(result.checks.canonicalSpec, true);
  assert.equal(result.checks.cleanupPlan, true);
  assert.equal(result.status, "PRECHECK_CONFIG_PASS");
});

test("preflight blocks Actions mocked visual with an unrelated dirty file or without mock mode", async () => {
  const dirtySecrets = await evaluatePreflight({
    ...valid,
    capability: "actions",
    mode: "read-only",
    mockedVisual: true,
    git: { ...withBranch("feature/actions-isactive-form-refactor"), dirty: true, changedFiles: [".env.e2e.local"] },
    readText: async () => await readFile("tests/e2e/actions-form-mocked-journey.spec.ts", "utf8"),
  });
  assert.equal(dirtySecrets.checks.workingTreePreserved, false);

  const noMockMode = await evaluatePreflight({
    ...valid,
    capability: "actions",
    mode: "read-only",
    git: { ...withBranch("feature/actions-isactive-form-refactor"), dirty: true, changedFiles: ["domains/operations/actions/action-form-page.tsx"] },
    readText: async () => await readFile("tests/e2e/actions-form-mocked-journey.spec.ts", "utf8"),
  });
  assert.equal(noMockMode.checks.workingTreePreserved, false);
});

test("preflight accepts the authorized EquipmentTypes visual hotfix branch", async () => {
  const result = await evaluatePreflight({
    ...valid,
    git: withBranch("hotfix/equipment-types-form-design"),
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

test("preflight allows separate worktrees but blocks an unregistered checkout, wrong branch, SHA or workspace", async () => {
  assert.equal((await evaluatePreflight({ ...valid, config: { ...config, GERIT_API_BASE_URL: "https://example.invalid" } })).checks.qaApiOrigin, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, branch: "develop" } })).checks.branch, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, root: "C:\\other" } })).checks.workspace, false);
  assert.equal((await evaluatePreflight(valid)).checks.activeWorktreeRegistered, true);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, worktreeCount: 1 } })).status, "PRECHECK_CONFIG_PASS");
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, worktrees: [git.worktrees[1]] } })).checks.activeWorktreeRegistered, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, headSha: "invalid" } })).checks.headShaValid, false);
  assert.equal((await evaluatePreflight({ ...valid, git: { ...git, worktrees: [git.worktrees[0].replace("HEAD " + "a".repeat(40), "HEAD " + "c".repeat(40)), git.worktrees[1]] } })).checks.activeWorktreeRegistered, false);
});

test("preflight blocks missing spec, missing cleanup plan, and an occupied port", async () => {
  assert.equal((await evaluatePreflight({ ...valid, fileExists: () => false })).checks.canonicalSpec, false);
  assert.equal((await evaluatePreflight({ ...valid, readText: async () => "randomUUID" })).checks.cleanupPlan, false);
  assert.equal((await evaluatePreflight({ ...valid, portAvailable: async () => false })).checks.portAvailable, false);
});

test("preflight blocks when another E2E run owns the shared port", async () => {
  const result = await evaluatePreflight({ ...valid, portAvailable: async () => false });
  assert.equal(result.status, "PREFLIGHT_BLOCKED");
  assert.equal(result.checks.portAvailable, false);
});

test("preflight blocks dirty worktrees containing files outside the selected Client E2E scope", async () => {
  const result = await evaluatePreflight({
    ...valid,
    capability: "clients",
    mode: "read-only",
    git: { ...withBranch("feature/client-crud-v1"), dirty: true, changedFiles: [".env.e2e.local"] },
    readText: async () => clientsCleanupSpec,
  });
  assert.equal(result.status, "PREFLIGHT_BLOCKED");
  assert.equal(result.checks.workingTreePreserved, false);
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
  const clientWithoutOptIn = await evaluatePreflight({
    ...valid,
    capability: "clients",
    git: withBranch("feature/client-crud-v1"),
    clientMutationApproved: false,
  });
  const clientWithoutFlag = await evaluatePreflight({
    ...valid,
    capability: "clients",
    git: withBranch("feature/client-crud-v1"),
    mutatingApproved: false,
    clientMutationApproved: true,
  });
  const clientApproved = await evaluatePreflight({
    ...valid,
    capability: "clients",
    git: withBranch("feature/client-crud-v1"),
    clientMutationApproved: true,
  });
  assert.equal(clientWithoutOptIn.authorization, "MUTATING_AUTHORIZATION_PENDING");
  assert.equal(clientWithoutFlag.authorization, "MUTATING_AUTHORIZATION_PENDING");
  assert.equal(clientApproved.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
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

test("runner reports missing QA fixtures as incomplete, never as E2E pass", async () => {
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 0, incomplete: "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE" }),
    cleanup: async () => true,
    isPortFree: async () => true,
  });
  assert.equal(result.status, "E2E_INCOMPLETE");
  assert.equal(result.reason, "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE");
});
test("runner preserves Playwright failures when fixture status is incomplete", async () => {
  const result = await runCapabilityLifecycle({
    preflight: async () => ({ pass: true }),
    prepareBuild: async () => 0,
    runPlaywright: async () => ({ code: 1, incomplete: "QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE" }),
    cleanup: async () => true,
    isPortFree: async () => true,
  });
  assert.equal(result.status, "E2E_FAIL");
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
