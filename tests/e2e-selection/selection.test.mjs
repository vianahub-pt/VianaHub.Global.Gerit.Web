import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createSelectionPlan,
  selectCapabilities,
  validateE2eValidation,
} from "../../scripts/e2e/ci-selection.mjs";

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

test("isolated Roles change selects only Roles E2E", () => {
  assert.deepEqual(selectCapabilities(["domains/operations/roles/roles-page.tsx"]).capabilities, ["roles"]);
});

test("isolated Actions and UserPreferences changes select their own journeys", () => {
  assert.deepEqual(selectCapabilities(["domains/operations/actions/actions-page.tsx"]).capabilities, ["actions"]);
  assert.deepEqual(selectCapabilities(["domains/identity/preferences/user-preferences-page.tsx"]).capabilities, ["user-preferences"]);
});

test("isolated Teams change selects only Teams E2E", () => {
  assert.deepEqual(selectCapabilities(["tests/e2e/teams-journey.spec.ts"]).capabilities, ["teams"]);
});

test("multiple capability changes select both journeys", () => {
  assert.deepEqual(selectCapabilities([
    "domains/operations/teams/teams-page.tsx",
    "app/(workspace)/roles/page.tsx",
  ]).capabilities, ["teams", "roles"]);
});

test("authentication and shared component changes select full regression", () => {
  for (const file of ["platform/auth/auth-context.tsx", "shared/ui/input.tsx"]) {
    const result = selectCapabilities([file]);
    assert.equal(result.fullRegression, true);
    assert.deepEqual(result.capabilities, ["actions", "user-preferences", "teams", "roles"]);
  }
});

test("documentation-only changes produce a valid no-E2E plan", () => {
  const plan = createSelectionPlan({ baseSha, headSha, changedFiles: ["docs/ci.md", "AGENTS.md"] });
  assert.deepEqual(plan.capabilities, []);
  assert.equal(plan.reason, "documentation-only");
  const result = validateE2eValidation({
    selectorResult: "success",
    e2eResult: "skipped",
    e2eRequiredOutput: "false",
    expectedPlanDigest: plan.planDigest,
    evidenceDigest: "",
    plan,
    evidence: null,
  });
  assert.equal(result.pass, true);
});

test("unknown impact selects full regression", () => {
  const result = selectCapabilities(["shared/layout/new-shell.tsx"]);
  assert.equal(result.fullRegression, true);
  assert.equal(result.reason, "shared-or-unknown-impact");
});

test("manual full regression includes every currently supported capability", () => {
  const result = createSelectionPlan({ baseSha, headSha, changedFiles: [], forceFullRegression: true });
  assert.equal(result.fullRegression, true);
  assert.deepEqual(result.capabilities, ["actions", "user-preferences", "teams", "roles"]);
});

test("failed, cancelled, or unstarted selected E2E cannot pass aggregation", () => {
  const plan = createSelectionPlan({ baseSha, headSha, changedFiles: ["domains/operations/roles/roles-page.tsx"] });
  for (const e2eResult of ["failure", "cancelled", "skipped", ""]) {
    const result = validateE2eValidation({
      selectorResult: "success",
      e2eResult,
      e2eRequiredOutput: "true",
      expectedPlanDigest: plan.planDigest,
      evidenceDigest: "",
      plan,
      evidence: null,
    });
    assert.equal(result.pass, false, `unexpected PASS for E2E result ${e2eResult || "missing"}`);
  }
});

test("selected E2E cannot pass without complete evidence", () => {
  const plan = createSelectionPlan({ baseSha, headSha, changedFiles: ["domains/operations/teams/teams-page.tsx"] });
  const result = validateE2eValidation({
    selectorResult: "success",
    e2eResult: "success",
    e2eRequiredOutput: "true",
    expectedPlanDigest: plan.planDigest,
    evidenceDigest: "",
    plan,
    evidence: null,
  });
  assert.equal(result.pass, false);
});

test("selected E2E passes aggregation only with a matching report for every capability", () => {
  const plan = createSelectionPlan({ baseSha, headSha, changedFiles: ["domains/operations/roles/roles-page.tsx"] });
  const evidence = {
    planDigest: plan.planDigest,
    capabilities: ["roles"],
    results: { roles: "passed" },
    reports: ["roles/playwright-report/index.html"],
    result: "passed",
  };
  const evidenceDigest = createHash("sha256").update(`${JSON.stringify(evidence, null, 2)}\n`).digest("hex");
  const result = validateE2eValidation({
    selectorResult: "success",
    e2eResult: "success",
    e2eRequiredOutput: "true",
    expectedPlanDigest: plan.planDigest,
    evidenceDigest,
    plan,
    evidence: { ...evidence, evidenceDigest },
    evidenceFiles: ["roles/playwright-report/index.html"],
  });
  assert.equal(result.pass, true);
});

test("validation CLI accepts a complete, digest-matched Playwright artifact", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "gerit-e2e-validation-"));
  try {
    const plan = createSelectionPlan({ baseSha, headSha, changedFiles: ["domains/operations/roles/roles-page.tsx"] });
    const evidence = {
      planDigest: plan.planDigest,
      capabilities: ["roles"],
      results: { roles: "passed" },
      reports: ["roles/playwright-report/index.html"],
      result: "passed",
    };
    evidence.evidenceDigest = createHash("sha256").update(`${JSON.stringify(evidence, null, 2)}\n`).digest("hex");

    await mkdir(join(scratch, ".e2e-plan"), { recursive: true });
    await mkdir(join(scratch, ".e2e-artifacts", "roles", "playwright-report"), { recursive: true });
    await writeFile(join(scratch, ".e2e-plan", "selection.json"), `${JSON.stringify(plan, null, 2)}\n`);
    await writeFile(join(scratch, ".e2e-artifacts", "summary.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    await writeFile(join(scratch, ".e2e-artifacts", "roles", "playwright-report", "index.html"), "<html>report</html>");

    const script = resolve(fileURLToPath(new URL("../../scripts/e2e/validate-e2e-validation.mjs", import.meta.url)));
    const result = spawnSync(process.execPath, [script, ".e2e-plan/selection.json", ".e2e-artifacts/summary.json"], {
      cwd: scratch,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        SELECTOR_RESULT: "success",
        E2E_RESULT: "success",
        E2E_REQUIRED: "true",
        EXPECTED_PLAN_DIGEST: plan.planDigest,
        E2E_EVIDENCE_DIGEST: evidence.evidenceDigest,
      },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /E2E Validation\] PASS/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
