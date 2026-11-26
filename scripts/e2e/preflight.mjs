import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateE2EBuild } from "./build-fingerprint.mjs";
import { CAPABILITIES } from "./capabilities.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const expectedRepo = "C:\\git\\VianaHub.Global.Gerit.Web";
const policy = JSON.parse(await readFile(resolve(scriptDir, "environment-policy.json"), "utf8"));

function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function gitValue(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function inspectGit() {
  const root = gitValue(["rev-parse", "--show-toplevel"]);
  const branch = gitValue(["branch", "--show-current"]);
  const worktrees = gitValue(["worktree", "list", "--porcelain"]).split(/\r?\n(?=worktree )/).filter(Boolean);
  const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\r?\n$/, "");
  const headSha = gitValue(["rev-parse", "HEAD"]);
  const changedFiles = status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1));
  return { root, branch, worktreeCount: worktrees.length, worktrees, headSha, dirty: status.length > 0, changedFiles };
}

function normalizePath(path) {
  return String(path || "").replaceAll("/", "\\").replace(/[\\]+$/, "").toLowerCase();
}

const CLIENT_E2E_WORKING_FILES = new Set([
  "domains/operations/clients/clients-v1-addresses.tsx",
  "domains/operations/clients/clients-v1-contacts.tsx",
  "package.json",
  "scripts/e2e/preflight.mjs",
  "scripts/e2e/run-capability.mjs",
  "scripts/e2e/select-capabilities.mjs",
  "scripts/e2e/run-lock.mjs",
  "tests/e2e/client-address-crud-journey.spec.ts",
  "tests/e2e/client-contact-person-journey.spec.ts",
  "tests/e2e/preflight.test.mjs",
  "tests/e2e/run-lock.test.mjs",
]);
const TEAMS_VISUAL_WORKING_FILES = new Set([
  "domains/operations/teams/team-form-page.tsx",
  "domains/operations/teams/teams-contract.ts",
  "domains/operations/teams/teams-page.tsx",
  "locales/en-US/common.json",
  "locales/es-ES/common.json",
  "locales/pt-BR/common.json",
  "locales/pt-PT/common.json",
  "package.json",
  "scripts/e2e/preflight.mjs",
  "scripts/e2e/run-capability.mjs",
  "scripts/e2e/select-capabilities.mjs",
  "tests/e2e/impact-classifier.test.mjs",
  "tests/e2e/preflight.test.mjs",
  "tests/e2e/run-capability.test.mjs",
  "tests/e2e/teams-form-mocked-journey.spec.ts",
  "tests/e2e/teams-journey.spec.ts",
  "tests/actions/teams-contract.test.mjs",
  "tests/teams/teams-ui-contract.test.mjs",
]);
const ACTIONS_VISUAL_WORKING_FILES = new Set([
  "domains/operations/actions/action-contract.ts",
  "domains/operations/actions/action-form-page.tsx",
  "scripts/e2e/preflight.mjs",
  "scripts/e2e/run-capability.mjs",
  "scripts/e2e/select-capabilities.mjs",
  "tests/actions/action-contract.test.mjs",
  "tests/e2e/actions-form-mocked-journey.spec.ts",
  "tests/e2e/actions-journey.spec.ts",
  "tests/e2e/actions-cleanup.test.mjs",
  "scripts/e2e/actions-cleanup.mjs",
  "scripts/e2e/actions-cleanup.d.mts",
  "tests/e2e/preflight.test.mjs",
]);

function isExpectedBranch(branch, capability) {
  if (capability === "clients" && branch === "refactor/global-spa-ux-foundations") {
    return true;
  }
  if (capability === "equipment-types") {
    return branch === "feature/equipment-types-crud" || branch === "hotfix/equipment-types-form-design";
  }
  return /^(feature|fix|hotfix)\/[a-z0-9][a-z0-9-]*$/i.test(branch);
}

export function portIsAvailable(port = 3100, host = "127.0.0.1") {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.listen(port, host, () => server.close(() => resolvePort(true)));
  });
}

function hasEquipmentTypesCleanupPlan(specText) {
  return specText.includes("finally") &&
    specText.includes("randomUUID") &&
    specText.includes("DELETE") &&
    specText.includes("410");
}

function hasReadOnlyClientAddressPlan(specText) {
  return specText.includes("installReadOnlyApiGuard") &&
    specText.includes('page.context().route("**/*"') &&
    specText.includes("classifyReadOnlyApiRequest") &&
    specText.includes('route.abort("blockedbyclient")') &&
    specText.includes("allowedOrigin") &&
    specText.includes("E2E_READ_ONLY_HOMOLOGATION_STATUS") &&
    specText.includes("QA_READ_ONLY_HOMOLOGATION_INCOMPLETE_FIXTURE_UNAVAILABLE") &&
    specText.includes("blockedRequests") &&
    specText.includes("expect(blockedRequests).toEqual([])");
}

function hasActionsMockedVisualPlan(specText) {
  return specText.includes('page.route("**/api/**"') &&
    specText.includes('path === "/api/auth/login" && method === "POST"') &&
    specText.includes('route.fulfill({ status: 200') &&
    specText.includes("unexpectedRequests.push") &&
    specText.includes('new URL(item.url()).pathname === "/api/auth/login"') &&
    specText.includes('businessRequests.filter((item) => item.method === "POST")') &&
    specText.includes('businessRequests.filter((item) => item.method === "PUT")') &&
    specText.includes('expect(businessRequests.some((item) => item.method === "PATCH")).toBe(false)');
}

function hasTeamsMockedVisualPlan(specText) {
  return specText.includes('page.route("**/api/**"') &&
    specText.includes('path === "/api/auth/login" && method === "POST"') &&
    specText.includes('path === "/api/gerit/v1/teams" && method === "POST"') &&
    specText.includes('path === "/api/gerit/v1/teams/" + teamId && method === "PUT"') &&
    specText.includes("unexpectedRequests.push") &&
    specText.includes("expect(unexpectedRequests).toEqual([])") &&
    !specText.includes("route.continue()");
}

function hasClientsCleanupPlan(specText) {
  return /const createdClientIds = new Set<number>\(\)/.test(specText) &&
    /createdClientIds\.add\(clientId\)/.test(specText) &&
    /for \(const id of createdClientIds\)/.test(specText) &&
    /finally\s*\{[\s\S]*cleanupCreatedClients\(page, createdClientIds\)/.test(specText) &&
    /api\(page, "DELETE", "\/api\/gerit\/v1\/clients\/" \+ id\)/.test(specText) &&
    /expect\(\[200, 410\]\)\.toContain\(cleanupDelete\.status\)/.test(specText) &&
    /api\(page, "GET", "\/api\/gerit\/v1\/clients\/" \+ id\)/.test(specText) &&
    /expect\(cleanupGone\.status\)\.toBe\(410\)/.test(specText) &&
    /expect\(deleteResponse\.status\(\)\)\.toBe\(200\)/.test(specText) &&
    /expect\(goneResponse\.status\(\)\)\.toBe\(410\)/.test(specText);
}

export async function evaluatePreflight({
  capability,
  mode = "mutating",
  stage = "execution",
  mutatingApproved = false,
  clientMutationApproved = false,
  actionsMutationApproved = false,
  readOnlyVisual = false,
  mockedVisual = false,
  platform = process.platform,
  git = inspectGit(),
  config = {},
  portAvailable = () => portIsAvailable(),
  buildCurrent = async () => {
    const result = await validateE2EBuild(config.GERIT_API_BASE_URL || policy.apiOrigin, repoRoot);
    return result.current;
  },
  fileExists = existsSync,
  readText = (file) => readFile(file, "utf8"),
} = {}) {
  const checks = {};
  checks.windowsHost = platform === "win32";
  checks.workspace = normalizePath(git.root) === normalizePath(expectedRepo);
  const activeWorktree = (git.worktrees || []).some((entry) => {
    const lines = String(entry).split(/\r?\n/);
    const values = Object.fromEntries(lines.map((line) => {
      const separator = line.indexOf(" ");
      return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
    }));
    return normalizePath(values.worktree) === normalizePath(git.root) &&
      values.HEAD === git.headSha &&
      (!values.branch || values.branch === `refs/heads/${git.branch}`);
  });
  checks.activeWorktreeRegistered = activeWorktree;
  checks.headShaValid = /^[0-9a-f]{40}$/i.test(git.headSha || "");
  checks.branch = isExpectedBranch(git.branch, capability);
  checks.actionsAuthorizedBranch = capability !== "actions" || ["feature/actions-isactive-form-refactor", "fix/actions-form-switch-save-redirect"].includes(git.branch);
  checks.actionsIdentityConfigured = capability !== "actions" || mode !== "mutating" || (typeof config.E2E_USER_EMAIL === "string" && config.E2E_USER_EMAIL.trim().length > 0);
  const normalizedChangedFiles = Array.isArray(git.changedFiles)
    ? git.changedFiles.map((file) => String(file).replaceAll("\\", "/"))
    : [];
  const scopedClientVisualChanges = capability === "clients" && mode === "read-only" && normalizedChangedFiles.length > 0 &&
    normalizedChangedFiles.every((file) => CLIENT_E2E_WORKING_FILES.has(file));
  const scopedActionsVisualChanges = capability === "actions" && mode === "read-only" && mockedVisual && normalizedChangedFiles.length > 0 &&
    normalizedChangedFiles.every((file) => ACTIONS_VISUAL_WORKING_FILES.has(file));
  const scopedTeamsVisualChanges = capability === "teams" && mode === "read-only" && mockedVisual && normalizedChangedFiles.length > 0 &&
    normalizedChangedFiles.every((file) => TEAMS_VISUAL_WORKING_FILES.has(file));
  checks.workingTreePreserved = !git.dirty || scopedClientVisualChanges || scopedActionsVisualChanges || scopedTeamsVisualChanges;
  const actionsManifestPath = resolve(repoRoot, ".e2e-debug/actions-journey/cleanup-manifest.json");
  if (capability === "actions" && mode === "mutating" && fileExists(actionsManifestPath)) {
    try {
      const manifest = JSON.parse(await readText(actionsManifestPath));
      checks.actionsCleanupManifestClear = manifest?.schemaVersion === 1 && manifest.status === "verified" && Array.isArray(manifest.records) && manifest.records.every((record) => record?.status === "verified");
    } catch { checks.actionsCleanupManifestClear = false; }
  } else checks.actionsCleanupManifestClear = capability !== "actions" || mode !== "mutating";
  checks.localBaseUrl = config.E2E_BASE_URL === policy.localE2EOrigin;
  let apiOrigin = "";
  try { apiOrigin = new URL(config.GERIT_API_BASE_URL || "").origin; } catch {}
  checks.qaApiOrigin = apiOrigin === policy.apiOrigin;
  checks.credentialsConfigured = Boolean(config.E2E_USER_EMAIL && config.E2E_USER_PASSWORD);
  checks.capabilityAllowed = CAPABILITIES.includes(capability);

  const selectedSpec = readOnlyVisual && capability === "clients"
    ? "client-address-read-only-journey.spec.ts"
    : mockedVisual && capability === "teams"
      ? "teams-form-mocked-journey.spec.ts"
      : mockedVisual && capability === "actions"
        ? "actions-form-mocked-journey.spec.ts"
      : capability + "-journey.spec.ts";
  const spec = resolve(repoRoot, "tests", "e2e", selectedSpec);
  checks.canonicalSpec = checks.capabilityAllowed && fileExists(spec);
  if (readOnlyVisual) {
    checks.readOnlyMutationGuard = capability === "clients" && checks.canonicalSpec && hasReadOnlyClientAddressPlan(await readText(spec));
    checks.cleanupPlan = checks.readOnlyMutationGuard;
  } else if (mockedVisual && capability === "teams" && checks.canonicalSpec) {
    checks.cleanupPlan = hasTeamsMockedVisualPlan(await readText(spec));
  } else if (mockedVisual && capability === "actions" && checks.canonicalSpec) {
    checks.cleanupPlan = hasActionsMockedVisualPlan(await readText(spec));
  } else if (capability === "actions" && mode === "mutating" && checks.canonicalSpec) {
    const text = await readText(spec);
    const cleanupText = await readText(resolve(scriptDir, "actions-cleanup.mjs"));
    checks.cleanupPlan = text.includes("registerOwnedAction") && text.includes("cleanupOwnedActions") && text.includes("test.afterEach") && cleanupText.includes("deleteAttempted") && cleanupText.includes("followUpReadHttp");
  } else if (capability === "equipment-types" && checks.canonicalSpec) {
    checks.cleanupPlan = hasEquipmentTypesCleanupPlan(await readText(spec));
  } else if (capability === "clients" && checks.canonicalSpec) {
    checks.cleanupPlan = hasClientsCleanupPlan(await readText(spec));
  } else {
    checks.cleanupPlan = checks.canonicalSpec;
  }
  checks.portAvailable = await portAvailable();
  checks.buildCurrent = stage === "prepare" ? "will-refresh" : await buildCurrent();

  const technicalPass = Object.entries(checks)
    .filter(([key]) => !(key === "buildCurrent" && stage === "prepare"))
    .every(([, passed]) => passed === true);
  const authorization = mode === "read-only"
    ? (policy.readOnlySmokeAuthorized ? "READ_ONLY_AUTHORIZED" : "MUTATING_AUTHORIZATION_PENDING")
    : (mutatingApproved && policy.mutatingApprovalRequiredPerRun &&
      (capability === "equipment-types" || (capability === "clients" && clientMutationApproved) || (capability === "actions" && actionsMutationApproved && checks.actionsAuthorizedBranch && checks.actionsIdentityConfigured && checks.actionsCleanupManifestClear))
      ? "MUTATING_AUTHORIZATION_CONFIRMED"
      : "MUTATING_AUTHORIZATION_PENDING");
  return {
    status: technicalPass ? "PRECHECK_CONFIG_PASS" : "PREFLIGHT_BLOCKED",
    authorization,
    capability,
    mode,
    checks,
    git: {
      branch: git.branch,
      worktreeCount: git.worktreeCount,
      workingTreeDirty: git.dirty,
      headSha: git.headSha,
      changedFiles: git.changedFiles || [],
    },
  };
}

function parseArgs(args) {
  const result = { capability: "", mode: "mutating", stage: "execution", mutatingApproved: false, readOnlyVisual: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--mode") result.mode = args[++i] || "";
    else if (args[i] === "--stage") result.stage = args[++i] || "";
    else if (args[i] === "--mutating-approved") result.mutatingApproved = true;
    else if (args[i] === "--read-only-visual") result.readOnlyVisual = true;
    else if (args[i].startsWith("--")) throw new Error("Unknown preflight option.");
    else if (result.capability) throw new Error("Select exactly one E2E capability.");
    else result.capability = args[i];
  }
  if (!["read-only", "mutating"].includes(result.mode)) throw new Error("Mode must be read-only or mutating.");
  if (!["prepare", "execution"].includes(result.stage)) throw new Error("Stage must be prepare or execution.");
  if (result.readOnlyVisual && (result.capability !== "clients" || result.mode !== "read-only" || result.mutatingApproved)) {
    throw new Error("Read-only visual preflight requires Client read-only mode without mutation approval.");
  }
  return result;
}

export async function loadConfig() {
  const localFile = resolve(repoRoot, ".env.e2e.local");
  const fromFile = existsSync(localFile) ? parseEnvFile(await readFile(localFile, "utf8")) : {};
  return {
    ...fromFile,
    ...Object.fromEntries(["E2E_BASE_URL", "GERIT_API_BASE_URL", "E2E_USER_EMAIL", "E2E_USER_PASSWORD"]
      .filter((key) => process.env[key] !== undefined && process.env[key] !== "")
      .map((key) => [key, process.env[key]])),
  };
}

async function selfTest() {
  const validGit = {
    root: expectedRepo,
    branch: "feature/equipment-types-crud",
    worktreeCount: 2,
    worktrees: [
      `worktree ${expectedRepo}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/feature/equipment-types-crud`,
      "worktree C:/git/VianaHub.Global.Gerit.Web-client-address-layout\nHEAD " + "b".repeat(40) + "\nbranch refs/heads/feature/client-address-form-layout",
    ],
    headSha: "a".repeat(40),
    dirty: false,
    changedFiles: [],
  };
  const validConfig = {
    E2E_BASE_URL: policy.localE2EOrigin,
    GERIT_API_BASE_URL: policy.apiOrigin,
    E2E_USER_EMAIL: "configured",
    E2E_USER_PASSWORD: "configured",
  };
  const common = {
    capability: "equipment-types",
    mode: "mutating",
    mutatingApproved: true,
    platform: "win32",
    git: validGit,
    config: validConfig,
    portAvailable: async () => true,
    buildCurrent: async () => true,
    fileExists: () => true,
    readText: async () => "finally randomUUID DELETE 410",
  };
  const gitWithBranch = (branch) => ({
    ...validGit,
    branch,
    worktrees: [validGit.worktrees[0].replace(`refs/heads/${validGit.branch}`, `refs/heads/${branch}`), validGit.worktrees[1]],
  });
  const pass = await evaluatePreflight(common);
  assert.equal(pass.status, "PRECHECK_CONFIG_PASS");
  assert.equal(pass.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  const hotfixBranch = await evaluatePreflight({
    ...common,
    git: gitWithBranch("hotfix/equipment-types-form-design"),
  });
  assert.equal(hotfixBranch.status, "PRECHECK_CONFIG_PASS");
  assert.equal(hotfixBranch.checks.branch, true);
  const wrongUrl = await evaluatePreflight({ ...common, config: { ...validConfig, E2E_BASE_URL: "http://localhost:3000" } });
  assert.equal(wrongUrl.status, "PREFLIGHT_BLOCKED");
  const unknown = await evaluatePreflight({ ...common, capability: "unknown" });
  assert.equal(unknown.checks.capabilityAllowed, false);
  const otherCapability = await evaluatePreflight({ ...common, capability: "users", git: { ...validGit, branch: "feature/users-crud" } });
  assert.equal(otherCapability.checks.capabilityAllowed, true);
  assert.equal(otherCapability.checks.canonicalSpec, true);
  const noCredentials = await evaluatePreflight({ ...common, config: { ...validConfig, E2E_USER_PASSWORD: "" } });
  assert.equal(noCredentials.checks.credentialsConfigured, false);
  const pending = await evaluatePreflight({ ...common, mutatingApproved: false });
  assert.equal(pending.authorization, "MUTATING_AUTHORIZATION_PENDING");
  const occupiedPort = await evaluatePreflight({ ...common, portAvailable: async () => false });
  assert.equal(occupiedPort.checks.portAvailable, false);
  const unsafeWorkingTree = await evaluatePreflight({
    ...common,
    capability: "clients",
    mode: "read-only",
    git: { ...gitWithBranch("feature/client-crud-v1"), dirty: true, changedFiles: [".env.e2e.local"] },
  });
  assert.equal(unsafeWorkingTree.status, "PREFLIGHT_BLOCKED");
  assert.equal(unsafeWorkingTree.checks.workingTreePreserved, false);
  const staleBuild = await evaluatePreflight({ ...common, buildCurrent: async () => false });
  assert.equal(staleBuild.checks.buildCurrent, false);
  const clientSpec = await readFile(resolve(repoRoot, "tests/e2e/clients-journey.spec.ts"), "utf8");
  const clientBase = {
    ...common,
    capability: "clients",
    git: gitWithBranch("feature/client-crud-v1"),
    stage: "prepare",
    buildCurrent: async () => true,
    fileExists: (path) => path.endsWith("clients-journey.spec.ts"),
    readText: async () => clientSpec,
  };
  const authorizedRefactorBranch = await evaluatePreflight({
    ...clientBase,
    mode: "read-only",
    mutatingApproved: false,
    clientMutationApproved: false,
    git: gitWithBranch("refactor/global-spa-ux-foundations"),
  });
  assert.equal(authorizedRefactorBranch.status, "PRECHECK_CONFIG_PASS");
  assert.equal(authorizedRefactorBranch.checks.branch, true);
  assert.equal(authorizedRefactorBranch.authorization, "READ_ONLY_AUTHORIZED");
  const clientNoOptIn = await evaluatePreflight({ ...clientBase, mutatingApproved: true, clientMutationApproved: false });
  assert.equal(clientNoOptIn.checks.canonicalSpec, true);
  assert.equal(clientNoOptIn.checks.cleanupPlan, true);
  assert.equal(clientNoOptIn.authorization, "MUTATING_AUTHORIZATION_PENDING");
  const clientNoFlag = await evaluatePreflight({ ...clientBase, mutatingApproved: false, clientMutationApproved: true });
  assert.equal(clientNoFlag.authorization, "MUTATING_AUTHORIZATION_PENDING");
  const clientApproved = await evaluatePreflight({ ...clientBase, mutatingApproved: true, clientMutationApproved: true });
  assert.equal(clientApproved.status, "PRECHECK_CONFIG_PASS");
  assert.equal(clientApproved.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  const clientWithoutCleanup = await evaluatePreflight({ ...clientBase, readText: async () => "randomUUID DELETE finally" });
  assert.equal(clientWithoutCleanup.checks.cleanupPlan, false);
  const readOnlySpecText = await readFile(resolve(repoRoot, "tests/e2e/client-address-read-only-journey.spec.ts"), "utf8");
  const readOnlyClient = await evaluatePreflight({
    ...clientBase,
    mode: "read-only",
    mutatingApproved: false,
    readOnlyVisual: true,
    fileExists: (path) => path.endsWith("client-address-read-only-journey.spec.ts"),
    readText: async () => readOnlySpecText,
  });
  assert.equal(readOnlyClient.status, "PRECHECK_CONFIG_PASS");
  assert.equal(readOnlyClient.authorization, "READ_ONLY_AUTHORIZED");
  assert.equal(readOnlyClient.checks.readOnlyMutationGuard, true);
  const readOnlyWithoutGuard = await evaluatePreflight({
    ...clientBase,
    mode: "read-only",
    readOnlyVisual: true,
    fileExists: () => true,
    readText: async () => "no mutation guard",
  });
  assert.equal(readOnlyWithoutGuard.status, "PREFLIGHT_BLOCKED");
  assert.equal(readOnlyWithoutGuard.checks.readOnlyMutationGuard, false);
  assert.throws(() => parseArgs(["clients", "--read-only-visual"]), /Client read-only mode/);
  const readOnly = await evaluatePreflight({ ...common, mode: "read-only", mutatingApproved: false });
  assert.equal(readOnly.authorization, "READ_ONLY_AUTHORIZED");
  const missingCleanup = await evaluatePreflight({ ...common, readText: async () => "randomUUID" });
  assert.equal(missingCleanup.checks.cleanupPlan, false);
  const actionsGit = gitWithBranch("feature/actions-isactive-form-refactor");
  const actionsConfig = { ...validConfig };
  const actionsPreflight = { ...common, capability: "actions", mode: "mutating", mutatingApproved: true, actionsMutationApproved: true, git: actionsGit, config: actionsConfig, stage: "prepare", fileExists: (path) => path.endsWith("actions-journey.spec.ts") || path.endsWith("cleanup-manifest.json"), readText: async (path) => path.endsWith("cleanup-manifest.json") ? JSON.stringify({ schemaVersion: 1, status: "verified", records: [{ id: 1230, name: "synthetic", status: "verified" }] }) : path.endsWith("actions-cleanup.mjs") ? await readFile(resolve(repoRoot, "scripts/e2e/actions-cleanup.mjs"), "utf8") : await readFile(resolve(repoRoot, "tests/e2e/actions-journey.spec.ts"), "utf8") };
  const actionsApproved = await evaluatePreflight(actionsPreflight);
  assert.equal(actionsApproved.status, "PRECHECK_CONFIG_PASS");
  assert.equal(actionsApproved.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  assert.equal((await evaluatePreflight({ ...actionsPreflight, actionsMutationApproved: false })).authorization, "MUTATING_AUTHORIZATION_PENDING");
  assert.equal((await evaluatePreflight({ ...actionsPreflight, git: { ...actionsGit, branch: "feature/other" } })).checks.actionsAuthorizedBranch, false);
  assert.equal((await evaluatePreflight({ ...actionsPreflight, git: { ...actionsGit, dirty: true } })).checks.workingTreePreserved, false);
  assert.equal(actionsApproved.checks.actionsIdentityConfigured, true);
  assert.equal((await evaluatePreflight({ ...actionsPreflight, config: { ...validConfig, E2E_USER_EMAIL: "" } })).checks.actionsIdentityConfigured, false);
  assert.equal((await evaluatePreflight({ ...actionsPreflight, readText: async (path) => path.endsWith("cleanup-manifest.json") ? JSON.stringify({ schemaVersion: 1, status: "pending", records: [{ id: 1230, name: "synthetic", status: "pending" }] }) : path.endsWith("actions-cleanup.mjs") ? await readFile(resolve(repoRoot, "scripts/e2e/actions-cleanup.mjs"), "utf8") : await readFile(resolve(repoRoot, "tests/e2e/actions-journey.spec.ts"), "utf8") })).checks.actionsCleanupManifestClear, false);

  const authenticationReadOnly = await evaluatePreflight({
    ...common,
    capability: "authentication",
    mode: "read-only",
    mutatingApproved: false,
    git: gitWithBranch("hotfix/login-e2e-hydration"),
    stage: "prepare",
    fileExists: (path) => path.endsWith("authentication-journey.spec.ts"),
    readText: async () => await readFile(resolve(repoRoot, "tests/e2e/authentication-journey.spec.ts"), "utf8"),
  });
  assert.equal(authenticationReadOnly.status, "PRECHECK_CONFIG_PASS");
  assert.equal(authenticationReadOnly.authorization, "READ_ONLY_AUTHORIZED");
  assert.equal(authenticationReadOnly.checks.canonicalSpec, true);

  console.log("E2E preflight self-tests passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--self-test")) {
    await selfTest();
  } else {
    try {
      const args = parseArgs(process.argv.slice(2));
      const config = await loadConfig();
      const result = await evaluatePreflight({
        ...args,
        clientMutationApproved: process.env.E2E_CLIENT_QA_MUTATION_APPROVAL === "true",
        actionsMutationApproved: args.capability === "actions" && process.argv.includes("--actions-qa-approved"),
        config,
      });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (result.status !== "PRECHECK_CONFIG_PASS" || result.authorization.endsWith("_PENDING")) process.exitCode = 2;
    } catch (error) {
      console.error("[E2E preflight] " + (error instanceof Error ? error.message : "preflight failed."));
      process.exitCode = 2;
    }
  }
}
