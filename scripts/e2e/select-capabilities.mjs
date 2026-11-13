import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const CAPABILITIES = ["actions", "user-preferences", "teams", "roles"];

const capabilityPaths = new Map([
  ["actions", ["app/(workspace)/actions/", "domains/operations/actions/", "tests/e2e/actions-journey.spec.ts"]],
  ["user-preferences", ["app/(workspace)/preferences/", "domains/identity/preferences/", "tests/e2e/user-preferences-journey.spec.ts"]],
  ["teams", ["app/(workspace)/teams/", "domains/operations/teams/", "tests/e2e/teams-journey.spec.ts"]],
  ["roles", ["app/(workspace)/roles/", "domains/operations/roles/", "tests/e2e/roles-journey.spec.ts"]],
]);

const ciOnlyPaths = new Set([".github/workflows/ci.yml", "scripts/e2e/select-capabilities.mjs"]);

function normalizePath(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isDocumentation(file) {
  return file.startsWith("docs/") || /(?:^|\/)[^/]+\.(?:md|mdx)$/i.test(file);
}

export function selectCapabilities(files, { fullRegression = false } = {}) {
  if (fullRegression) return { capabilities: [...CAPABILITIES], runE2E: true, reason: "manual-full-regression" };

  const changedFiles = files.map((file) => normalizePath(file.trim())).filter(Boolean);
  if (changedFiles.length === 0) {
    return { capabilities: [...CAPABILITIES], runE2E: true, reason: "empty-change-set" };
  }

  const selected = new Set();
  let hasUnmappedChange = false;
  let hasNonDocumentationChange = false;

  for (const file of changedFiles) {
    if (isDocumentation(file)) continue;

    hasNonDocumentationChange = true;
    if (ciOnlyPaths.has(file)) continue;

    let matched = false;
    for (const [capability, paths] of capabilityPaths) {
      if (paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path))) {
        selected.add(capability);
        matched = true;
      }
    }
    if (!matched) hasUnmappedChange = true;
  }

  if (hasUnmappedChange) return { capabilities: [...CAPABILITIES], runE2E: true, reason: "unmapped-impact" };
  const capabilities = CAPABILITIES.filter((capability) => selected.has(capability));
  if (capabilities.length > 0) return { capabilities, runE2E: true, reason: "capability-impact" };
  if (hasNonDocumentationChange) return { capabilities: [], runE2E: false, reason: "ci-validation-only" };
  return { capabilities: [], runE2E: false, reason: "documentation-only" };
}

function selfTest() {
  assert.deepEqual(selectCapabilities(["domains/operations/teams/teams-page.tsx"]).capabilities, ["teams"]);
  assert.deepEqual(selectCapabilities(["domains/operations/roles/roles-page.tsx"]).capabilities, ["roles"]);
  assert.deepEqual(selectCapabilities(["domains/operations/actions/actions-page.tsx"]).capabilities, ["actions"]);
  assert.deepEqual(selectCapabilities(["domains/identity/preferences/user-preferences-page.tsx"]).capabilities, ["user-preferences"]);
  assert.deepEqual(selectCapabilities(["app/(workspace)/teams/page.tsx", "app/(workspace)/roles/page.tsx"]).capabilities, ["teams", "roles"]);
  assert.deepEqual(selectCapabilities(["platform/auth/session.ts"]).capabilities, CAPABILITIES);
  assert.deepEqual(selectCapabilities(["shared/forms/input.tsx"]).capabilities, CAPABILITIES);
  assert.deepEqual(selectCapabilities(["src/new-capability/page.tsx"]).capabilities, CAPABILITIES);
  assert.equal(selectCapabilities(["README.md", "docs/ci.md"]).runE2E, false);
  assert.equal(selectCapabilities([".github/workflows/ci.yml"]).runE2E, false);
  assert.deepEqual(selectCapabilities([".github/workflows/ci.yml", "domains/operations/teams/teams-page.tsx"]).capabilities, ["teams"]);
  assert.deepEqual(selectCapabilities([], { fullRegression: true }).capabilities, CAPABILITIES);
  assert.deepEqual(selectCapabilities([]).capabilities, CAPABILITIES);
  console.log("E2E capability selection: 13 scenarios passed.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const fullRegression = process.argv.includes("--full-regression");
  const input = fullRegression ? [] : readFileSync(0, "utf8").split(/\r?\n/);
  process.stdout.write(`${JSON.stringify(selectCapabilities(input, { fullRegression }))}\n`);
}
