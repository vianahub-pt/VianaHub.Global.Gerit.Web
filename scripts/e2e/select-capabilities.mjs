import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const CAPABILITIES = ["actions", "user-preferences", "teams", "roles", "users"];

const capabilityCodePaths = new Map([
  ["actions", ["app/(workspace)/actions/", "domains/operations/actions/"]],
  ["user-preferences", ["app/(workspace)/preferences/", "domains/identity/preferences/"]],
  ["teams", ["app/(workspace)/teams/", "domains/operations/teams/"]],
  ["roles", ["app/(workspace)/roles/", "domains/operations/roles/"]],
  ["users", ["app/(workspace)/users/", "domains/operations/users/"]],
]);

const capabilityTestPaths = new Map([
  ["actions", ["tests/actions/", "tests/e2e/actions-journey.spec.ts"]],
  ["user-preferences", ["tests/preferences/", "tests/e2e/user-preferences-journey.spec.ts"]],
  ["teams", ["tests/teams/", "tests/e2e/teams-journey.spec.ts"]],
  ["roles", ["tests/roles/", "tests/e2e/roles-journey.spec.ts"]],
  ["users", ["tests/users/", "tests/e2e/users-journey.spec.ts", "tests/e2e/users-self-password.spec.ts"]],
]);

const ciOnlyPaths = new Set([
  ".github/workflows/ci.yml",
  "scripts/e2e/select-capabilities.mjs",
  "scripts/e2e/run-capability.mjs",
]);
const localeCommonPath = /^locales\/[^/]+\/common\.json$/;
const translationPrefixes = new Map([
  ["actions.", "actions"],
  ["preferences.", "user-preferences"],
  ["teams.", "teams"],
  ["roles.", "roles"],
  ["users.", "users"],
]);

function normalizePath(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesPath(file, path) {
  return path.endsWith("/") ? file.startsWith(path) : file === path;
}

function isDocumentation(file) {
  return file.startsWith("docs/") || /(?:^|\/)[^/]+\.(?:md|mdx)$/i.test(file);
}

function isKnownSharedSupport(file) {
  return file.startsWith("shared/") ||
    file.startsWith("platform/") ||
    file.startsWith("core/") ||
    file.startsWith("tests/e2e/helpers/") ||
    file.startsWith("scripts/e2e/") ||
    file.startsWith("locales/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "app/layout.tsx" ||
    file === "app/(workspace)/layout.tsx";
}

function normalizeScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new Error("E2E capability scope is required for non-documentation changes.");
  }
  const normalized = scope.map((item) => String(item).trim());
  if (normalized.some((item) => !CAPABILITIES.includes(item))) {
    throw new Error("E2E capability scope contains an unknown capability.");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("E2E capability scope contains duplicates.");
  }
  return CAPABILITIES.filter((capability) => normalized.includes(capability));
}

export function parseScopeFromPullRequestTitle(title) {
  const match = String(title ?? "").match(/^[a-z][a-z0-9-]*\(([^)]+)\)!?:\s*\S/i);
  if (!match) return [];
  const scope = match[1].split(/[,+]/).map((item) => item.trim()).filter(Boolean);
  return normalizeScope(scope);
}

export function selectCapabilities(files, {
  fullRegression = false,
  translationAnalysis,
  scope: declaredScope = [],
  scopeApproved = false,
} = {}) {
  if (fullRegression) {
    return {
      capabilities: [...CAPABILITIES],
      scope: [...CAPABILITIES],
      scopeApproved: true,
      runE2E: true,
      reason: "manual-full-regression",
      supportingChanges: [],
    };
  }

  const changedFiles = files.map((file) => normalizePath(file.trim())).filter(Boolean);
  if (changedFiles.length === 0) throw new Error("E2E scope validation failed: changed-file set is empty.");

  const nonDocumentation = changedFiles.filter((file) => !isDocumentation(file));
  if (nonDocumentation.length === 0) {
    return { capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "documentation-only", supportingChanges: [] };
  }

  const nonCiChanges = nonDocumentation.filter((file) => !ciOnlyPaths.has(file));
  if (nonCiChanges.length === 0) {
    return { capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "ci-validation-only", supportingChanges: [] };
  }

  const scope = normalizeScope(declaredScope);
  if (scope.length > 1 && scopeApproved !== true) {
    throw new Error("E2E scope validation failed: multiple capabilities require the e2e-scope-approved label.");
  }

  const changedCodeCapabilities = new Set();
  const changedTestCapabilities = new Set();
  const supportingChanges = [];
  const localeFiles = nonCiChanges.filter((file) => localeCommonPath.test(file));
  let translationAnalysisResult = translationAnalysis;

  for (const file of nonCiChanges) {
    if (localeCommonPath.test(file)) continue;

    let matched = false;
    for (const [capability, paths] of capabilityCodePaths) {
      if (paths.some((path) => matchesPath(file, path))) {
        changedCodeCapabilities.add(capability);
        matched = true;
      }
    }
    for (const [capability, paths] of capabilityTestPaths) {
      if (paths.some((path) => matchesPath(file, path))) {
        changedTestCapabilities.add(capability);
        if (!scope.includes(capability)) supportingChanges.push(file);
        matched = true;
      }
    }
    if (matched) continue;
    if (isKnownSharedSupport(file)) {
      supportingChanges.push(file);
      continue;
    }
    throw new Error("E2E scope validation failed: unclassified changed path '" + file + "'.");
  }

  if (localeFiles.length > 0) {
    if (!translationAnalysisResult?.ok ||
        !Array.isArray(translationAnalysisResult.changedKeys) ||
        !Array.isArray(translationAnalysisResult.removedKeys)) {
      throw new Error("E2E scope validation failed: locale change impact could not be determined.");
    }
    if (translationAnalysisResult.removedKeys.length > 0) {
      throw new Error("E2E scope validation failed: removed locale keys have ambiguous capability impact.");
    }
    for (const key of translationAnalysisResult.changedKeys) {
      const matches = [...translationPrefixes].filter(([prefix]) => key.startsWith(prefix));
      if (matches.length !== 1) {
        throw new Error("E2E scope validation failed: locale key '" + key + "' has ambiguous capability impact.");
      }
      const capability = matches[0][1];
      if (!scope.includes(capability)) {
        throw new Error("E2E scope validation failed: locale key '" + key + "' is outside declared scope.");
      }
      changedTestCapabilities.add(capability);
    }
  }

  const changedCapabilities = new Set([...changedCodeCapabilities, ...changedTestCapabilities]);
  const outsideScope = [...changedCodeCapabilities].filter((capability) => !scope.includes(capability));
  if (outsideScope.length > 0) {
    throw new Error("E2E scope validation failed: functional changes exceed declared scope (" + outsideScope.join(", ") + ").");
  }

  if (changedCodeCapabilities.size === 0 && changedTestCapabilities.size === 0 && localeFiles.length > 0) {
    return { capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "translation-no-semantic-change", supportingChanges: [] };
  }
  if (changedCodeCapabilities.size === 0 && changedTestCapabilities.size === 0) {
    throw new Error("E2E scope validation failed: shared-only changes do not prove the declared capability.");
  }
  const declaredCapabilitiesPresent = scope.filter((capability) => changedCapabilities.has(capability));
  if (declaredCapabilitiesPresent.length !== scope.length) {
    throw new Error("E2E scope validation failed: declared scope is not supported by capability-specific changed files.");
  }

  return {
    capabilities: [...scope],
    scope: [...scope],
    scopeApproved: scope.length > 1 && scopeApproved === true,
    runE2E: true,
    reason: "declared-capability-scope",
    supportingChanges: [...new Set(supportingChanges)].sort(),
  };
}

function parseLocale(content) {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Locale catalog must be a JSON object.");
  }
  for (const value of Object.values(parsed)) {
    if (typeof value !== "string") throw new Error("Locale catalog values must be strings.");
  }
  return parsed;
}

export function analyzeTranslationChanges(files, baseContents, headContents) {
  const changedKeys = new Set();
  const removedKeys = new Set();

  try {
    for (const file of files.map(normalizePath).filter((path) => localeCommonPath.test(path))) {
      if (!Object.hasOwn(baseContents, file) || !Object.hasOwn(headContents, file)) {
        throw new Error("Missing locale content for " + file + ".");
      }
      const base = parseLocale(baseContents[file]);
      const head = parseLocale(headContents[file]);
      for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
        if (!Object.hasOwn(head, key)) {
          removedKeys.add(key);
        } else if (!Object.hasOwn(base, key) || base[key] !== head[key]) {
          changedKeys.add(key);
        }
      }
    }
  } catch {
    return { ok: false, changedKeys: [], removedKeys: [] };
  }

  return {
    ok: true,
    changedKeys: [...changedKeys].sort(),
    removedKeys: [...removedKeys].sort(),
  };
}

export function validateE2EOutcome({ selectionStatus, capabilities, scope, scopeApproved, runE2E, reason, e2eStatus }) {
  if (selectionStatus !== "success") return { pass: false, reason: "selection-did-not-succeed" };
  if (!Array.isArray(capabilities) || capabilities.some((item) => !CAPABILITIES.includes(item))) {
    return { pass: false, reason: "invalid-capability-selection" };
  }
  if (typeof runE2E !== "boolean") return { pass: false, reason: "invalid-run-decision" };

  if (runE2E) {
    if (!Array.isArray(scope) || scope.length === 0 || scope.some((item) => !CAPABILITIES.includes(item))) {
      return { pass: false, reason: "invalid-declared-scope" };
    }
    if (new Set(scope).size !== scope.length) return { pass: false, reason: "duplicate-declared-scope" };
    if (scope.length > 1 && scopeApproved !== true) return { pass: false, reason: "multi-capability-scope-not-approved" };
    if (capabilities.length === 0) return { pass: false, reason: "selected-e2e-has-no-capabilities" };
    if (new Set(capabilities).size !== capabilities.length) return { pass: false, reason: "duplicate-capability-selection" };
    if (capabilities.some((item) => !scope.includes(item)) ||
        scope.some((item) => !capabilities.includes(item))) {
      return { pass: false, reason: "selected-capabilities-do-not-match-scope" };
    }
    return e2eStatus === "success"
      ? { pass: true, reason: "selected-e2e-succeeded" }
      : { pass: false, reason: "selected-e2e-did-not-succeed" };
  }

  if (capabilities.length !== 0) return { pass: false, reason: "capabilities-were-omitted" };
  if (!["documentation-only", "ci-validation-only"].includes(reason)) {
    return { pass: false, reason: "e2e-exemption-not-validated" };
  }
  return { pass: true, reason };
}

function localeAnalysis(base, head, file = "locales/pt-PT/common.json") {
  return analyzeTranslationChanges(
    [file],
    { [file]: JSON.stringify(base) },
    { [file]: JSON.stringify(head) },
  );
}

function selfTest() {
  const scoped = (files, scope, scopeApproved = false) => selectCapabilities(files, { scope, scopeApproved });
  assert.deepEqual(scoped(["domains/operations/users/users-page.tsx", "shared/ui/button.tsx"], ["users"]).capabilities, ["users"]);
  assert.deepEqual(scoped(["domains/operations/teams/teams-page.tsx"], ["teams"]).capabilities, ["teams"]);
  assert.deepEqual(scoped(["domains/operations/roles/roles-page.tsx"], ["roles"]).capabilities, ["roles"]);
  assert.deepEqual(scoped(["domains/operations/actions/actions-page.tsx"], ["actions"]).capabilities, ["actions"]);
  assert.deepEqual(scoped([
    "domains/operations/users/users-page.tsx",
    "tests/e2e/teams-journey.spec.ts",
    "tests/e2e/helpers/hub-grid-page-size.ts",
    "platform/auth/auth-context.tsx",
  ], ["users"]).capabilities, ["users"]);
  assert.deepEqual(scoped([
    "domains/operations/users/users-page.tsx",
    "domains/operations/teams/teams-page.tsx",
  ], ["teams", "users"], true).capabilities, ["teams", "users"]);
  assert.throws(() => scoped([
    "domains/operations/users/users-page.tsx",
    "domains/operations/teams/teams-page.tsx",
  ], ["users"]), /functional changes exceed declared scope/);
  assert.throws(() => scoped(["shared/ui/button.tsx"], ["users"]), /shared-only changes/);
  assert.throws(() => scoped(["src/new-capability/page.tsx"], ["users"]), /unclassified changed path/);
  assert.throws(() => scoped([
    "domains/operations/users/users-page.tsx",
    "domains/operations/teams/teams-page.tsx",
  ], ["teams", "users"]), /e2e-scope-approved label/);
  assert.throws(() => selectCapabilities(["domains/operations/users/users-page.tsx"]), /scope is required/);
  assert.deepEqual(parseScopeFromPullRequestTitle("feat(users): implement user management"), ["users"]);
  assert.deepEqual(parseScopeFromPullRequestTitle("feat(users+teams): coordinated capability change"), ["teams", "users"]);
  assert.throws(() => parseScopeFromPullRequestTitle("feat(unknown): change"), /unknown capability/);

  assert.deepEqual(selectCapabilities(["README.md", "docs/ci.md"]), {
    capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "documentation-only", supportingChanges: [],
  });
  assert.deepEqual(selectCapabilities([".github/workflows/ci.yml", "scripts/e2e/select-capabilities.mjs"]), {
    capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "ci-validation-only", supportingChanges: [],
  });
  assert.deepEqual(selectCapabilities([], { fullRegression: true }).capabilities, CAPABILITIES);

  const valid = (overrides = {}) => validateE2EOutcome({
    selectionStatus: "success", capabilities: ["users"], scope: ["users"],
    scopeApproved: false, runE2E: true, e2eStatus: "success", ...overrides,
  });
  assert.equal(valid().pass, true);
  assert.equal(valid({ e2eStatus: "failure" }).pass, false);
  assert.equal(valid({ capabilities: ["users", "teams"] }).pass, false);
  assert.equal(valid({ e2eStatus: "skipped" }).pass, false);
  assert.equal(valid({ selectionStatus: "failure" }).pass, false);
  assert.equal(valid({ selectionStatus: "cancelled" }).pass, false);
  assert.equal(valid({ capabilities: ["teams"] }).pass, false);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success", capabilities: [], scope: [], scopeApproved: false,
    runE2E: false, reason: "documentation-only",
  }).pass, true);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success", capabilities: [], scope: [], scopeApproved: false,
    runE2E: false, reason: "unmapped-impact",
  }).pass, false);

  const roleOnly = localeAnalysis({ "roles.actions.back": "Voltar" }, { "roles.actions.back": "Regressar" });
  assert.deepEqual(selectCapabilities(["locales/pt-PT/common.json"], { scope: ["roles"], translationAnalysis: roleOnly }).capabilities, ["roles"]);
  const unknownKey = localeAnalysis({ "navigation.back": "Voltar" }, { "navigation.back": "Regressar" });
  assert.throws(() => selectCapabilities(["locales/pt-PT/common.json"], { scope: ["users"], translationAnalysis: unknownKey }), /ambiguous capability impact/);
  const removedKey = localeAnalysis({ "roles.actions.back": "Voltar" }, {});
  assert.throws(() => selectCapabilities(["locales/pt-PT/common.json"], { scope: ["roles"], translationAnalysis: removedKey }), /removed locale keys/);
  assert.throws(() => selectCapabilities(["locales/pt-PT/common.json"], { scope: ["roles"] }), /impact could not be determined/);
  const formattingOnly = localeAnalysis({ "roles.actions.back": "Voltar" }, { "roles.actions.back": "Voltar" });
  assert.deepEqual(selectCapabilities(["locales/pt-PT/common.json"], { scope: ["roles"], translationAnalysis: formattingOnly }).runE2E, false);
  console.log("E2E capability scope self-tests passed.");
}

function readGitFile(ref, file) {
  return execFileSync("git", ["show", ref + ":" + file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function compareRefsPlan(files, baseRef, headRef, options) {
  const localeFiles = files.map(normalizePath).filter((file) => localeCommonPath.test(file));
  const baseContents = {};
  const headContents = {};
  try {
    for (const file of localeFiles) {
      baseContents[file] = readGitFile(baseRef, file);
      headContents[file] = readGitFile(headRef, file);
    }
  } catch {
    throw new Error("E2E scope validation failed: locale content could not be compared between base and head.");
  }
  const translationAnalysis = analyzeTranslationChanges(localeFiles, baseContents, headContents);
  return selectCapabilities(files, { ...options, translationAnalysis });
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1]) throw new Error("Missing value for " + name + ".");
  return args[index + 1];
}

try {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else if (process.argv.includes("--validate-outcome")) {
    let input;
    try {
      input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
      console.error("E2E Validation: invalid outcome input.");
      process.exit(1);
    }
    const outcome = validateE2EOutcome(input);
    console.log("E2E Validation: " + (outcome.pass ? "PASS" : "FAIL") + " (" + outcome.reason + ").");
    if (!outcome.pass) process.exitCode = 1;
  } else {
    const args = process.argv.slice(2);
    const fullRegression = args.includes("--full-regression");
    if (fullRegression) {
      process.stdout.write(JSON.stringify(selectCapabilities([], { fullRegression: true })) + "\n");
    } else {
      const compareIndex = args.indexOf("--compare");
      const title = readOption(args, "--scope-title");
      const approvedValue = readOption(args, "--scope-approved");
      const scope = parseScopeFromPullRequestTitle(title ?? "");
      const options = { scope, scopeApproved: approvedValue === "true" };
      const files = readFileSync(0, "utf8").split(/\r?\n/);
      const plan = compareIndex >= 0
        ? compareRefsPlan(files, args[compareIndex + 1], args[compareIndex + 2], options)
        : selectCapabilities(files, options);
      process.stdout.write(JSON.stringify(plan) + "\n");
    }
  }
} catch (error) {
  console.error("[E2E selection] " + (error instanceof Error ? error.message : "selection failed."));
  process.exitCode = 2;
}