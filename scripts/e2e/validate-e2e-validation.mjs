import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateE2eValidation } from "./ci-selection.mjs";

async function readJson(path) {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")), raw: await readFile(path, "utf8") };
  } catch {
    return { value: null, raw: "" };
  }
}

const [planPath, evidencePath] = process.argv.slice(2);
const plan = (await readJson(resolve(planPath ?? ""))).value;
const evidenceFile = await readJson(resolve(evidencePath ?? ""));
const evidence = evidenceFile.value;
const evidenceFiles = [];
if (evidence?.reports && Array.isArray(evidence.reports)) {
  for (const path of evidence.reports) {
    if (typeof path !== "string" || path.startsWith("/") || path.split(/[\\/]/).includes("..")) continue;
    try {
      await readFile(resolve(".e2e-artifacts", path));
      evidenceFiles.push(path);
    } catch {
      // Missing reports are passed to the validator as absent evidence.
    }
  }
}

const computedEvidenceDigest = evidence
  ? createHash("sha256").update(`${JSON.stringify({
    planDigest: evidence.planDigest,
    capabilities: evidence.capabilities,
    results: evidence.results,
    reports: evidence.reports,
    result: evidence.result,
  }, null, 2)}\n`).digest("hex")
  : "";
const outcome = evidence && evidence.evidenceDigest !== computedEvidenceDigest
  ? { pass: false, reason: "Evidence summary digest is invalid." }
  : validateE2eValidation({
    selectorResult: process.env.SELECTOR_RESULT,
    e2eResult: process.env.E2E_RESULT,
    e2eRequiredOutput: process.env.E2E_REQUIRED,
    expectedPlanDigest: process.env.EXPECTED_PLAN_DIGEST,
    evidenceDigest: process.env.E2E_EVIDENCE_DIGEST,
    plan,
    evidence,
    evidenceFiles,
  });

console.log(`[E2E Validation] ${outcome.pass ? "PASS" : "FAIL"}: ${outcome.reason}`);
if (!outcome.pass) process.exitCode = 1;
