import { createHash } from "node:crypto";

export const CAPABILITIES = Object.freeze(["actions", "user-preferences", "teams", "roles"]);

const rules = Object.freeze({
  actions: [
    /^app\/\(workspace\)\/actions\//,
    /^domains\/operations\/actions\//,
    /^tests\/e2e\/actions(?:[-./]|$)/,
    /^tests\/actions\/action-contract\.test\.mjs$/,
  ],
  "user-preferences": [
    /^app\/\(workspace\)\/preferences\//,
    /^domains\/identity\/preferences\//,
    /^tests\/e2e\/user-preferences(?:[-./]|$)/,
    /^tests\/preferences\//,
  ],
  teams: [
    /^app\/\(workspace\)\/teams\//,
    /^domains\/operations\/teams\//,
    /^tests\/e2e\/teams(?:[-./]|$)/,
    /^tests\/actions\/teams-contract\.test\.mjs$/,
  ],
  roles: [
    /^app\/\(workspace\)\/roles\//,
    /^domains\/(?:identity|operations)\/roles\//,
    /^tests\/e2e\/roles(?:[-./]|$)/,
    /^tests\/roles\//,
    /^tests\/actions\/roles-contract\.test\.mjs$/,
  ],
});

function isDocumentationPath(path) {
  return path.startsWith("docs/") || /\.(?:md|mdx|rst|txt)$/i.test(path) || /^(?:LICENSE|NOTICE|CHANGELOG)(?:\.|$)/i.test(path);
}

export function selectCapabilities(changedFiles, { forceFullRegression = false } = {}) {
  const normalized = [...new Set(changedFiles.map((path) => path.replaceAll("\\", "/").replace(/^\.\//, "")))].sort();

  if (forceFullRegression) {
    return { capabilities: [...CAPABILITIES], fullRegression: true, reason: "manual-full-regression" };
  }

  if (normalized.length === 0) {
    return { capabilities: [...CAPABILITIES], fullRegression: true, reason: "empty-or-unknown-diff" };
  }

  const selected = new Set();
  for (const path of normalized) {
    let matched = false;
    for (const capability of CAPABILITIES) {
      if (rules[capability].some((pattern) => pattern.test(path))) {
        selected.add(capability);
        matched = true;
      }
    }
    if (!matched && !isDocumentationPath(path)) {
      return { capabilities: [...CAPABILITIES], fullRegression: true, reason: "shared-or-unknown-impact" };
    }
  }

  if (selected.size === 0) {
    return { capabilities: [], fullRegression: false, reason: "documentation-only" };
  }

  return {
    capabilities: CAPABILITIES.filter((capability) => selected.has(capability)),
    fullRegression: false,
    reason: "capability-changes",
  };
}

function canonicalPlan(plan) {
  return JSON.stringify({
    baseSha: plan.baseSha,
    headSha: plan.headSha,
    changedFiles: plan.changedFiles,
    capabilities: plan.capabilities,
    fullRegression: plan.fullRegression,
    reason: plan.reason,
  });
}

export function digestPlan(plan) {
  return createHash("sha256").update(canonicalPlan(plan)).digest("hex");
}

export function createSelectionPlan({ baseSha, headSha, changedFiles, forceFullRegression = false }) {
  const selection = selectCapabilities(changedFiles, { forceFullRegression });
  const plan = { baseSha, headSha, changedFiles: [...changedFiles].sort(), ...selection };
  return { ...plan, planDigest: digestPlan(plan) };
}

export function isValidSelectionPlan(plan, expectedDigest) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.capabilities) || !Array.isArray(plan.changedFiles)) return false;
  if (!plan.capabilities.every((capability) => CAPABILITIES.includes(capability))) return false;
  if (new Set(plan.capabilities).size !== plan.capabilities.length) return false;
  if (typeof plan.fullRegression !== "boolean" || typeof plan.reason !== "string") return false;
  if (plan.fullRegression && (plan.capabilities.length !== CAPABILITIES.length || CAPABILITIES.some((item) => !plan.capabilities.includes(item)))) return false;
  return typeof expectedDigest === "string" && plan.planDigest === expectedDigest && digestPlan(plan) === expectedDigest;
}

export function validateE2eValidation({
  selectorResult,
  e2eResult,
  e2eRequiredOutput,
  expectedPlanDigest,
  evidenceDigest,
  plan,
  evidence,
  evidenceFiles = [],
}) {
  if (selectorResult !== "success") return { pass: false, reason: `E2E selection job ended with ${selectorResult || "no result"}.` };
  if (!isValidSelectionPlan(plan, expectedPlanDigest)) return { pass: false, reason: "Selection plan is missing, invalid, or has a mismatched digest." };

  const e2eRequired = plan.capabilities.length > 0;
  if (e2eRequiredOutput !== String(e2eRequired)) return { pass: false, reason: "E2E required output does not match the selection plan." };

  if (!e2eRequired) {
    if (plan.reason !== "documentation-only" || e2eResult !== "skipped") {
      return { pass: false, reason: "E2E was skipped without a valid documentation-only selection." };
    }
    return { pass: true, reason: "No E2E applies to the verified documentation-only diff." };
  }

  if (e2eResult !== "success") return { pass: false, reason: `Selected E2E job ended with ${e2eResult || "no result"}.` };
  if (!evidence || evidence.result !== "passed" || evidence.planDigest !== expectedPlanDigest) {
    return { pass: false, reason: "Selected E2E evidence is missing or does not match the selection plan." };
  }
  if (JSON.stringify(evidence.capabilities) !== JSON.stringify(plan.capabilities)) {
    return { pass: false, reason: "Evidence does not cover exactly the selected capabilities." };
  }
  if (evidenceDigest !== evidence.evidenceDigest) return { pass: false, reason: "Evidence digest output is missing or mismatched." };

  if (!Array.isArray(evidence.reports)) return { pass: false, reason: "E2E evidence report list is invalid." };
  const reported = new Set(evidence.reports);
  for (const capability of plan.capabilities) {
    if (evidence.results?.[capability] !== "passed") return { pass: false, reason: `E2E evidence for ${capability} is not PASS.` };
    const report = `${capability}/playwright-report/index.html`;
    if (!reported.has(report) || !evidenceFiles.includes(report)) return { pass: false, reason: `Valid Playwright report for ${capability} is absent.` };
  }

  return { pass: true, reason: "Every selected E2E completed and has matching Playwright evidence." };
}
