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
  const status = gitValue(["status", "--porcelain=v1", "--untracked-files=all"]);
  return { root, branch, worktreeCount: worktrees.length, dirty: status.length > 0 };
}

function isExpectedBranch(branch, capability) {
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

export async function evaluatePreflight({
  capability,
  mode = "mutating",
  stage = "execution",
  mutatingApproved = false,
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
  checks.workspace = git.root.toLowerCase().replaceAll("/", "\\") === expectedRepo.toLowerCase();
  checks.singleWorktree = git.worktreeCount === 1;
  checks.branch = isExpectedBranch(git.branch, capability);
  checks.workingTreePreserved = true;
  checks.localBaseUrl = config.E2E_BASE_URL === policy.localE2EOrigin;
  let apiOrigin = "";
  try { apiOrigin = new URL(config.GERIT_API_BASE_URL || "").origin; } catch {}
  checks.qaApiOrigin = apiOrigin === policy.apiOrigin;
  checks.credentialsConfigured = Boolean(config.E2E_USER_EMAIL && config.E2E_USER_PASSWORD);
  checks.capabilityAllowed = CAPABILITIES.includes(capability);

  const spec = resolve(repoRoot, "tests", "e2e", capability + "-journey.spec.ts");
  checks.canonicalSpec = checks.capabilityAllowed && fileExists(spec);
  if (capability === "equipment-types" && checks.canonicalSpec) {
    checks.cleanupPlan = hasEquipmentTypesCleanupPlan(await readText(spec));
  } else {
    checks.cleanupPlan = checks.canonicalSpec;
  }
  checks.portAvailable = await portAvailable();
  checks.buildCurrent = stage === "prepare" ? "will-refresh" : await buildCurrent();

  const technicalPass = Object.entries(checks)
    .filter(([key]) => key !== "workingTreePreserved" && !(key === "buildCurrent" && stage === "prepare"))
    .every(([, passed]) => passed === true);
  const authorization = mode === "read-only"
    ? (policy.readOnlySmokeAuthorized ? "READ_ONLY_AUTHORIZED" : "MUTATING_AUTHORIZATION_PENDING")
    : (mutatingApproved && policy.mutatingApprovalRequiredPerRun &&
      capability === "equipment-types"
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
    },
  };
}

function parseArgs(args) {
  const result = { capability: "", mode: "mutating", stage: "execution", mutatingApproved: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--mode") result.mode = args[++i] || "";
    else if (args[i] === "--stage") result.stage = args[++i] || "";
    else if (args[i] === "--mutating-approved") result.mutatingApproved = true;
    else if (args[i].startsWith("--")) throw new Error("Unknown preflight option.");
    else if (result.capability) throw new Error("Select exactly one E2E capability.");
    else result.capability = args[i];
  }
  if (!["read-only", "mutating"].includes(result.mode)) throw new Error("Mode must be read-only or mutating.");
  if (!["prepare", "execution"].includes(result.stage)) throw new Error("Stage must be prepare or execution.");
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
    worktreeCount: 1,
    dirty: true,
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
  const pass = await evaluatePreflight(common);
  assert.equal(pass.status, "PRECHECK_CONFIG_PASS");
  assert.equal(pass.authorization, "MUTATING_AUTHORIZATION_CONFIRMED");
  const hotfixBranch = await evaluatePreflight({
    ...common,
    git: { ...validGit, branch: "hotfix/equipment-types-form-design" },
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
  const staleBuild = await evaluatePreflight({ ...common, buildCurrent: async () => false });
  assert.equal(staleBuild.checks.buildCurrent, false);
  const readOnly = await evaluatePreflight({ ...common, mode: "read-only", mutatingApproved: false });
  assert.equal(readOnly.authorization, "READ_ONLY_AUTHORIZED");
  const missingCleanup = await evaluatePreflight({ ...common, readText: async () => "randomUUID" });
  assert.equal(missingCleanup.checks.cleanupPlan, false);
  console.log("E2E preflight self-tests passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--self-test")) {
    await selfTest();
  } else {
    try {
      const args = parseArgs(process.argv.slice(2));
      const config = await loadConfig();
      const result = await evaluatePreflight({ ...args, config });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (result.status !== "PRECHECK_CONFIG_PASS" || result.authorization.endsWith("_PENDING")) process.exitCode = 2;
    } catch (error) {
      console.error("[E2E preflight] " + (error instanceof Error ? error.message : "preflight failed."));
      process.exitCode = 2;
    }
  }
}
