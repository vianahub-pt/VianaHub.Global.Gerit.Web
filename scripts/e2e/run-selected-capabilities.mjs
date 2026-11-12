import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES, isValidSelectionPlan } from "./ci-selection.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const planPath = resolve(process.argv[2] ?? "");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const expectedPlanDigest = process.env.EXPECTED_PLAN_DIGEST;
if (!isValidSelectionPlan(plan, expectedPlanDigest)) throw new Error("Downloaded E2E selection plan is invalid or stale.");
if (plan.capabilities.length === 0 || plan.capabilities.some((item) => !CAPABILITIES.includes(item))) {
  throw new Error("Selected E2E runner requires one or more known capabilities.");
}

const buildFiles = ["BUILD_ID", "prerender-manifest.json", "routes-manifest.json", "required-server-files.json"];
const missingBuildFiles = buildFiles.filter((file) => !existsSync(resolve(repoRoot, ".next-e2e", file)));
if (missingBuildFiles.length > 0) throw new Error(`Reused E2E build is incomplete: ${missingBuildFiles.join(", ")}.`);

const artifactRoot = resolve(repoRoot, ".e2e-artifacts");
await mkdir(artifactRoot);
const results = {};
const reports = [];
let allPassed = true;

function runCapability(capability) {
  const script = resolve(repoRoot, "scripts/e2e/run-capability.mjs");
  if (!script.startsWith(`${resolve(repoRoot, "scripts/e2e")}${sep}`)) throw new Error("Capability runner resolved outside scripts/e2e.");
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, capability], {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", () => resolveRun(1));
    child.once("exit", (code) => resolveRun(code ?? 1));
  });
}

for (const capability of plan.capabilities) {
  console.log(`[E2E selection] Starting ${capability} journey.`);
  const exitCode = await runCapability(capability);
  const reportSource = resolve(repoRoot, "playwright-report");
  const reportRelative = `${capability}/playwright-report/index.html`;
  const reportTarget = resolve(artifactRoot, capability, "playwright-report");
  if (existsSync(reportSource)) await cp(reportSource, reportTarget, { recursive: true, force: true });
  const resultsSource = resolve(repoRoot, "test-results");
  if (existsSync(resultsSource)) await cp(resultsSource, resolve(artifactRoot, capability, "test-results"), { recursive: true, force: true });

  const validReport = existsSync(resolve(artifactRoot, capability, "playwright-report", "index.html"));
  results[capability] = exitCode === 0 && validReport ? "passed" : "failed";
  if (validReport) reports.push(reportRelative);
  if (results[capability] !== "passed") allPassed = false;
  console.log(`[E2E selection] ${capability}: ${results[capability]} (exit=${exitCode}, report=${validReport ? "present" : "missing"}).`);
}

const evidence = {
  planDigest: expectedPlanDigest,
  capabilities: plan.capabilities,
  results,
  reports,
  result: allPassed && reports.length === plan.capabilities.length ? "passed" : "failed",
};
const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
const evidenceDigest = createHash("sha256").update(evidenceText).digest("hex");
evidence.evidenceDigest = evidenceDigest;
const finalEvidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(resolve(artifactRoot, "summary.json"), finalEvidenceText, "utf8");

if (evidence.result !== "passed") {
  process.exitCode = 1;
} else if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `evidence_digest=${evidenceDigest}\n`, "utf8");
}
