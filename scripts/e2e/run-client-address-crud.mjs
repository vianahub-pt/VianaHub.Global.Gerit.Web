import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCrudApproval, validateCrudGitState } from "./client-address-crud-guard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const branchName = "feature/client-address-qa-crud-journey";

export function parseArgs(args) {
  let mode = null; let clientId = null; let approvalId = null; let mutatingApproved = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mocked" || arg === "--qa") {
      if (mode) throw new Error("Select exactly one of --mocked or --qa.");
      mode = arg === "--mocked" ? "mocked" : "qa";
    } else if (arg === "--client-id") { clientId = args[++index] ?? null; }
    else if (arg === "--approval-id") { approvalId = args[++index] ?? null; }
    else if (arg === "--mutating-approved") { mutatingApproved = true; }
    else if (arg.startsWith("--")) throw new Error("Unknown ClientAddress CRUD runner option.");
    else throw new Error("Unexpected positional argument.");
  }
  if (!mode) throw new Error("Select --mocked for synthetic validation or --qa for separately approved QA execution.");
  if (mode === "mocked" && (clientId || approvalId || mutatingApproved)) throw new Error("Mocked mode cannot accept QA target or mutation approval options.");
  if (mode === "qa" && (!clientId || !approvalId || !mutatingApproved)) throw new Error("QA mode requires --client-id, --approval-id, and --mutating-approved.");
  return { mode, clientId, approvalId, mutatingApproved };
}

function selfTest() {
  assert.deepEqual(parseArgs(["--mocked"]), { mode: "mocked", clientId: null, approvalId: null, mutatingApproved: false });
  assert.equal(parseArgs(["--qa", "--client-id", "42", "--approval-id", "123e4567-e89b-42d3-a456-426614174000", "--mutating-approved"]).mode, "qa");
  assert.throws(() => parseArgs(["--mocked", "--qa"]), /exactly one/);
  assert.throws(() => parseArgs(["--qa"]), /requires/);
  assert.throws(() => parseArgs(["--mocked", "--client-id", "42"]), /cannot accept/);
  console.log("ClientAddress CRUD runner self-tests passed.");
}

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }
let invocation;
try { invocation = parseArgs(process.argv.slice(2)); }
catch (error) { console.error("[ClientAddress CRUD] " + (error instanceof Error ? error.message : "Invalid invocation.")); process.exit(2); }

if (process.platform !== "win32" || process.env.CI === "true") {
  console.error("[ClientAddress CRUD] This local runner is restricted to the authorized Windows host."); process.exit(2);
}
try {
  const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  const originDevelop = git(["rev-parse", "--verify", "origin/develop^{commit}"]);
  const worktreeClean = git(["status", "--porcelain", "--untracked-files=all"]) === "";
  let commitValid = false;
  try { execFileSync("git", ["cat-file", "-e", "HEAD^{commit}"], { cwd: repoRoot, stdio: "ignore" }); commitValid = true; }
  catch { commitValid = false; }
  const gitState = validateCrudGitState({ mode: invocation.mode, branch, head, originDevelop, worktreeClean, commitValid });
  if (!gitState.allowed) throw new Error(gitState.reason);
} catch (error) {
  console.error("[ClientAddress CRUD] Preflight blocked: " + (error instanceof Error ? error.message : "Git preflight failed.")); process.exit(2);
}

const policy = JSON.parse(readFileSync(resolve(repoRoot, "scripts/e2e/environment-policy.json"), "utf8"));
const localE2eConfig = resolve(repoRoot, ".env.e2e.local");
if (existsSync(localE2eConfig)) {
  try { process.loadEnvFile(localE2eConfig); }
  catch { console.error("[ClientAddress CRUD] Local E2E configuration could not be loaded."); process.exit(2); }
}
if (invocation.mode === "qa") {
  const approval = validateCrudApproval({
    mode: "qa", clientId: invocation.clientId, approvalId: invocation.approvalId,
    approvalValue: process.env.E2E_CLIENT_ADDRESS_QA_APPROVAL, mutatingApproved: invocation.mutatingApproved,
    qaExecutionEnabled: policy.clientAddressCrudQaEnabled === true,
    allowedClientId: process.env.E2E_CLIENT_ADDRESS_QA_ALLOWED_CLIENT_ID,
    expectedUserId: process.env.E2E_CLIENT_ADDRESS_QA_EXPECTED_USER_ID,
    expectedTenantId: process.env.E2E_CLIENT_ADDRESS_QA_EXPECTED_TENANT_ID,
  });
  let configuredApiOrigin = "";
  let configuredWebOrigin = "";
  try { configuredApiOrigin = new URL(process.env.GERIT_API_BASE_URL ?? "").origin; } catch { /* fail closed below */ }
  try { configuredWebOrigin = new URL(process.env.E2E_BASE_URL ?? "").origin; } catch { /* fail closed below */ }
  const targetMatchesPolicy = policy.mutatingApprovalRequiredPerRun === true &&
    policy.clientAddressCrudQaEnabled === true &&
    configuredWebOrigin === policy.localE2EOrigin &&
    configuredApiOrigin === policy.apiOrigin;
  if (!approval.allowed || !targetMatchesPolicy || !existsSync(resolve(repoRoot, ".env.e2e.local"))) {
    console.error("[ClientAddress CRUD] QA preflight blocked: per-run approval, QA policy or local E2E configuration is missing or does not match."); process.exit(2);
  }
} else if (policy.localE2EOrigin !== "http://127.0.0.1:3100") {
  console.error("[ClientAddress CRUD] Mocked preflight blocked: local E2E origin does not match the approved policy."); process.exit(2);
}

let playwrightCli;
try {
  const packagePath = require.resolve("@playwright/test/package.json");
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  playwrightCli = resolve(dirname(packagePath), metadata.bin?.playwright ?? "");
  if (!existsSync(playwrightCli)) throw new Error("Playwright CLI unavailable.");
} catch {
  console.error("[ClientAddress CRUD] Installed Playwright CLI is unavailable."); process.exit(2);
}

const env = {
  ...process.env,
  E2E_CLIENT_ADDRESS_MODE: invocation.mode,
  E2E_VISUAL: "true",
  E2E_SANITIZED_ARTIFACTS: "true",
  E2E_CLIENT_ADDRESS_MUTATING_APPROVED: invocation.mutatingApproved ? "true" : "false",
};
if (invocation.mode === "qa") {
  env.E2E_CLIENT_ADDRESS_QA_CLIENT_ID = String(Number(invocation.clientId));
  env.E2E_CLIENT_ADDRESS_QA_APPROVAL_ID = invocation.approvalId;
}
const prepare = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm run e2e:prepare"], { cwd: repoRoot, env, stdio: "inherit", shell: false });
if (prepare.error || prepare.status !== 0) process.exit(prepare.status ?? 1);
const result = spawnSync(process.execPath, [playwrightCli, "test", "tests/e2e/client-address-crud-journey.spec.ts", "--project=journey", "--headed"], { cwd: repoRoot, env, stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
