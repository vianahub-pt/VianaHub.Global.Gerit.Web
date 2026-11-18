import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CAPABILITIES } from "./capabilities.mjs";
import { verifyStructuralSync } from "./structural-sync.mjs";

export { CAPABILITIES };

const capabilityCodePaths = new Map([
  ["actions", ["app/(workspace)/actions/", "domains/operations/actions/"]],
  ["user-preferences", ["app/(workspace)/preferences/", "domains/identity/preferences/"]],
  ["teams", ["app/(workspace)/teams/", "domains/operations/teams/"]],
  ["roles", ["app/(workspace)/roles/", "domains/operations/roles/"]],
  ["users", ["app/(workspace)/users/", "domains/operations/users/"]],
  ["equipment-types", ["app/(workspace)/equipment-types/", "domains/operations/equipment-types/"]],
]);

const capabilityTestPaths = new Map([
  ["actions", ["tests/actions/", "tests/e2e/actions-journey.spec.ts"]],
  ["user-preferences", ["tests/preferences/", "tests/e2e/user-preferences-journey.spec.ts"]],
  ["teams", ["tests/teams/", "tests/e2e/teams-journey.spec.ts"]],
  ["roles", ["tests/roles/", "tests/e2e/roles-journey.spec.ts"]],
  ["users", ["tests/users/", "tests/e2e/users-journey.spec.ts", "tests/e2e/users-self-password.spec.ts"]],
  ["equipment-types", ["tests/equipment-types/", "tests/e2e/equipment-types-journey.spec.ts"]],
]);

const ciOnlyPaths = new Set([
  ".github/workflows/ci.yml",
  "scripts/e2e/select-capabilities.mjs",
  "scripts/e2e/run-capability.mjs",
  "scripts/e2e/structural-sync.mjs",
  "tests/e2e/auth.setup.ts",
]);
const localeCommonPath = /^locales\/[^/]+\/common\.json$/;
const translationPrefixes = new Map([
  ["actions.", "actions"],
  ["preferences.", "user-preferences"],
  ["teams.", "teams"],
  ["roles.", "roles"],
  ["users.", "users"],
  ["equipmentTypes.", "equipment-types"],
]);

const breadcrumbRemovalSourceFiles = [
  "domains/operations/actions/action-form-page.tsx",
  "domains/operations/clients/clients-create.tsx",
  "domains/operations/clients/clients-details.tsx",
  "domains/operations/roles/role-form-page.tsx",
  "domains/operations/teams/team-form-page.tsx",
];
const breadcrumbRemovalLocaleFiles = [
  "locales/en-US/common.json",
  "locales/es-ES/common.json",
  "locales/pt-BR/common.json",
  "locales/pt-PT/common.json",
];
const breadcrumbRemovalTestFile = "tests/e2e/actions.spec.ts";
const breadcrumbRemovalFiles = [
  ...breadcrumbRemovalSourceFiles,
  ...breadcrumbRemovalLocaleFiles,
  breadcrumbRemovalTestFile,
].sort();
const breadcrumbTranslationKeys = [
  "actions.breadcrumb.label",
  "roles.breadcrumb.label",
  "teams.breadcrumb.label",
  "users.breadcrumb.label",
].sort();

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
    file === "tests/e2e/preflight.test.mjs" ||
    file.startsWith("scripts/e2e/") ||
    file.startsWith("locales/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "playwright.config.ts" ||
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
  baseContents,
  headContents,
  scope: declaredScope = [],
  scopeTitle = "",
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

  if (isVerifiedBreadcrumbRemoval(changedFiles, { baseContents, headContents, translationAnalysis })) {
    return {
      capabilities: [],
      scope: [],
      scopeApproved: false,
      runE2E: false,
      reason: "verified-breadcrumb-removal",
      supportingChanges: [],
    };
  }

  const nonDocumentation = changedFiles.filter((file) => !isDocumentation(file));
  if (nonDocumentation.length === 0) {
    return { capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "documentation-only", supportingChanges: [] };
  }

  const nonCiChanges = nonDocumentation.filter((file) => !ciOnlyPaths.has(file));
  if (nonCiChanges.length === 0) {
    return { capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "ci-validation-only", supportingChanges: [] };
  }

  const scope = normalizeScope(declaredScope.length > 0 ? declaredScope : parseScopeFromPullRequestTitle(scopeTitle));
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

function hasNoRemainingTranslationConsumers(keys) {
  for (const key of keys) {
    try {
      execFileSync("git", [
        "grep",
        "-F",
        "-l",
        "--",
        key,
        ":(exclude)locales/**",
        ":(exclude)scripts/e2e/select-capabilities.mjs",
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return false;
    } catch (error) {
      if (error?.status !== 1) return false;
    }
  }
  return true;
}

function isVerifiedBreadcrumbRemoval(files, { baseContents, headContents, translationAnalysis }) {
  const normalizedFiles = [...new Set(files)].sort();
  const semanticFiles = normalizedFiles.filter((file) => !ciOnlyPaths.has(file));
  const classifierChanges = normalizedFiles.filter((file) => ciOnlyPaths.has(file));
  if (semanticFiles.length !== breadcrumbRemovalFiles.length ||
      semanticFiles.some((file, index) => file !== breadcrumbRemovalFiles[index]) ||
      classifierChanges.some((file) => file !== "scripts/e2e/select-capabilities.mjs")) return false;
  if (!baseContents || !headContents || !translationAnalysis?.ok ||
      translationAnalysis.changedKeys.length !== 0 ||
      translationAnalysis.removedKeys.length !== breadcrumbTranslationKeys.length ||
      [...translationAnalysis.removedKeys].sort().some((key, index) => key !== breadcrumbTranslationKeys[index]) ||
      !hasNoRemainingTranslationConsumers(breadcrumbTranslationKeys)) return false;

  for (const file of breadcrumbRemovalSourceFiles) {
    const base = baseContents[file]?.replaceAll("\r\n", "\n");
    const head = headContents[file]?.replaceAll("\r\n", "\n");
    if (typeof base !== "string" || typeof head !== "string") return false;

    let matches = 0;
    const withoutBreadcrumb = base.replace(
      /^[\t ]*<nav\b(?=[^\n]*breadcrumb)[^>\n]*>[\s\S]*?<\/nav>[\t ]*\n?/gim,
      () => {
        matches += 1;
        return "";
      },
    );
    if (matches !== 1 || withoutBreadcrumb !== head) return false;
  }

  for (const file of breadcrumbRemovalLocaleFiles) {
    const base = baseContents[file]?.replaceAll("\r\n", "\n");
    const head = headContents[file]?.replaceAll("\r\n", "\n");
    if (typeof base !== "string" || typeof head !== "string") return false;

    let expected = base;
    for (const key of breadcrumbTranslationKeys) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const keyLine = new RegExp(`^[\\t ]*"${escapedKey}":[^\\r\\n]*,\\r?\\n`, "m");
      const updated = expected.replace(keyLine, "");
      if (updated === expected) return false;
      expected = updated;
    }
    if (expected !== head) return false;
  }

  const baseTest = baseContents[breadcrumbRemovalTestFile]?.replaceAll("\r\n", "\n");
  const headTest = headContents[breadcrumbRemovalTestFile]?.replaceAll("\r\n", "\n");
  if (typeof baseTest !== "string" || typeof headTest !== "string") return false;

  const breadcrumbLabel = /^  breadcrumb: \/\^\(breadcrumb\|navegação estrutural\|ruta de navegación\)\$\/i,\r?\n/m;
  if (!breadcrumbLabel.test(baseTest)) return false;
  let expectedTest = baseTest.replace(breadcrumbLabel, "");

  const oldFunction = /^async function returnToListByBreadcrumb\(page: Page\) \{\r?\n[\s\S]*?^\}/m;
  const newFunction = [
    "async function returnToListByBackButton(page: Page) {",
    "  await page.getByRole(\"button\", { name: labels.back }).first().click({ timeout: 4_000 });",
    "  await expect(page).toHaveURL(/\\/actions\\/?$/, { timeout: 5_000 });",
    "  await assertListReady(page);",
    "}",
  ].join("\n");
  if (!oldFunction.test(expectedTest)) return false;
  expectedTest = expectedTest.replace(oldFunction, newFunction);
  expectedTest = expectedTest
    .replaceAll("Return to list via breadcrumb", "Return to list via back button")
    .replaceAll("returnToListByBreadcrumb", "returnToListByBackButton");
  return expectedTest === headTest;
}

export function validateE2EOutcome({ selectionStatus, capabilities, scope, scopeApproved, runE2E, reason, structuralSyncVerified, e2eStatus }) {
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
  if (reason === "verified-structural-sync") {
    const isEmptyStructuralPlan = Array.isArray(scope) && scope.length === 0 &&
      scopeApproved === false && e2eStatus === "skipped";
    return structuralSyncVerified === true && isEmptyStructuralPlan
      ? { pass: true, reason }
      : { pass: false, reason: "structural-sync-plan-invalid" };
  }
  if (structuralSyncVerified === true || !["documentation-only", "ci-validation-only", "verified-breadcrumb-removal"].includes(reason)) {
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

function breadcrumbRemovalFixture() {
  const files = [...breadcrumbRemovalFiles];
  const baseContents = {};
  const headContents = {};
  const baseNavigation = '<nav aria-label="Breadcrumb"><ol>Path</ol></nav><h1>Title</h1>\n';
  const headNavigation = "<h1>Title</h1>\n";
  for (const file of breadcrumbRemovalSourceFiles) {
    baseContents[file] = baseNavigation;
    headContents[file] = headNavigation;
  }

  const translations = `\n${breadcrumbTranslationKeys.map((key) => `  "${key}": "Breadcrumb label",`).join("\n")}\n  "other.title": "Keep this translation"\n`;
  const remainingTranslations = '\n  "other.title": "Keep this translation"\n';
  for (const file of breadcrumbRemovalLocaleFiles) {
    baseContents[file] = `{${translations}}`;
    headContents[file] = `{${remainingTranslations}}`;
  }

  baseContents[breadcrumbRemovalTestFile] = `  breadcrumb: /^(breadcrumb|navegação estrutural|ruta de navegación)$/i,\nasync function returnToListByBreadcrumb(page: Page) {\n  const breadcrumb = page.getByRole("navigation", { name: labels.breadcrumb });\n  await breadcrumb.getByRole("button", { name: labels.actionsLink }).click({ timeout: 4_000 });\n}\n"Return to list via breadcrumb"\n`;
  headContents[breadcrumbRemovalTestFile] = `async function returnToListByBackButton(page: Page) {\n  await page.getByRole("button", { name: labels.back }).first().click({ timeout: 4_000 });\n  await expect(page).toHaveURL(/\\/actions\\/?$/, { timeout: 5_000 });\n  await assertListReady(page);\n}\n"Return to list via back button"\n`;

  const localeFiles = breadcrumbRemovalLocaleFiles;
  return {
    files,
    baseContents,
    headContents,
    translationAnalysis: analyzeTranslationChanges(localeFiles, baseContents, headContents),
  };
}

function selfTest() {
  const scoped = (files, scope, scopeApproved = false) => selectCapabilities(files, { scope, scopeApproved });
  const breadcrumbFixture = breadcrumbRemovalFixture();
  const breadcrumbPlan = selectCapabilities(
    [...breadcrumbFixture.files, "scripts/e2e/select-capabilities.mjs"],
    breadcrumbFixture,
  );
  assert.deepEqual(breadcrumbPlan, {
    capabilities: [],
    scope: [],
    scopeApproved: false,
    runE2E: false,
    reason: "verified-breadcrumb-removal",
    supportingChanges: [],
  });
  const breadcrumbWithFunctionalChange = {
    ...breadcrumbFixture,
    headContents: {
      ...breadcrumbFixture.headContents,
      [breadcrumbRemovalSourceFiles[0]]: breadcrumbFixture.headContents[breadcrumbRemovalSourceFiles[0]] + "// unrelated behavior\n",
    },
    scope: ["actions", "teams", "roles"],
    scopeApproved: true,
  };
  assert.throws(
    () => selectCapabilities([...breadcrumbFixture.files, "scripts/e2e/select-capabilities.mjs"], breadcrumbWithFunctionalChange),
    /unclassified changed path/,
  );
  assert.throws(
    () => selectCapabilities([...breadcrumbFixture.files, "scripts/e2e/run-capability.mjs"], breadcrumbFixture),
    /E2E capability scope is required/,
  );
  assert.deepEqual(scoped(["domains/operations/users/users-page.tsx", "shared/ui/button.tsx"], ["users"]).capabilities, ["users"]);
  assert.deepEqual(scoped(["domains/operations/teams/teams-page.tsx"], ["teams"]).capabilities, ["teams"]);
  assert.deepEqual(scoped(["domains/operations/equipment-types/equipment-types-page.tsx"], ["equipment-types"]).capabilities, ["equipment-types"]);
  assert.deepEqual(scoped([
    "domains/operations/equipment-types/equipment-types-page.tsx",
    "playwright.config.ts",
    "scripts/e2e/preflight.mjs",
    "tests/e2e/preflight.test.mjs",
  ], ["equipment-types"]).capabilities, ["equipment-types"]);
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
  assert.deepEqual(selectCapabilities(["tests/e2e/auth.setup.ts"]), {
    capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "ci-validation-only", supportingChanges: [],
  });
  assert.throws(() => selectCapabilities([]), /changed-file set is empty/);
  const selectorOnlySyncPlan = selectCapabilities(["scripts/e2e/select-capabilities.mjs"]);
  assert.deepEqual(selectorOnlySyncPlan, {
    capabilities: [], scope: [], scopeApproved: false, runE2E: false, reason: "ci-validation-only", supportingChanges: [],
  });
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...selectorOnlySyncPlan,
    e2eStatus: "skipped",
  }).pass, true);
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
  assert.equal(validateE2EOutcome({
    selectionStatus: "success", capabilities: [], scope: [], scopeApproved: false,
    runE2E: false, reason: "verified-breadcrumb-removal",
  }).pass, true);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success", capabilities: ["teams"], scope: [], scopeApproved: false,
    runE2E: false, reason: "verified-breadcrumb-removal",
  }).pass, false);

  assert.deepEqual(selectCapabilities([".github/workflows/ci.yml"], {
    scopeTitle: "chore(sync): structural branch alignment",
  }).reason, "ci-validation-only");
  assert.throws(() => selectCapabilities([], {
    scopeTitle: "chore(sync): structural branch alignment",
  }), /changed-file set is empty/);
  assert.throws(() => selectCapabilities(["domains/operations/users/users-page.tsx"], {
    scopeTitle: "fix(unknown): change a functional page",
  }), /unknown capability/);

  const structuralSyncContext = ({
    eventName = "pull_request",
    repositoryName = "vianahub-pt/VianaHub.Global.Gerit.Web",
    repositoryFullName = "vianahub-pt/VianaHub.Global.Gerit.Web",
    repositoryId = 731,
    baseRepositoryId = repositoryId,
    headRepositoryId = repositoryId,
    baseRepositoryName = repositoryFullName,
    headRepositoryName = repositoryFullName,
    baseRef = "develop",
    headRef = "main",
    baseSha = "a".repeat(40),
    headSha = "b".repeat(40),
    pullRequestBaseSha = baseSha,
    pullRequestHeadSha = headSha,
  } = {}) => ({
    eventName,
    repositoryName,
    repository: { id: repositoryId, full_name: repositoryFullName },
    pullRequest: {
      base: { ref: baseRef, sha: pullRequestBaseSha, repo: { id: baseRepositoryId, full_name: baseRepositoryName } },
      head: { ref: headRef, sha: pullRequestHeadSha, repo: { id: headRepositoryId, full_name: headRepositoryName } },
    },
    baseSha,
    headSha,
    changedFiles: [],
  });
  const identicalTreeEvidence = {
    isAncestor: true,
    baseTree: "tree-identical",
    headTree: "tree-identical",
    changedFiles: [],
  };
  const structuralPlan = (context = structuralSyncContext(), evidence = identicalTreeEvidence, files = []) =>
    compareRefsPlan(files, context.baseSha, context.headSha, {
      scopeTitle: "chore(sync): structural branch alignment",
      structuralSyncContext: context,
    }, () => evidence);

  const verifiedStructuralPlan = structuralPlan();
  assert.deepEqual(verifiedStructuralPlan, {
    capabilities: [],
    scope: [],
    scopeApproved: false,
    runE2E: false,
    reason: "verified-structural-sync",
    structuralSyncVerified: true,
    supportingChanges: [],
  });
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...verifiedStructuralPlan,
    e2eStatus: "skipped",
  }).pass, true);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...verifiedStructuralPlan,
    structuralSyncVerified: false,
    e2eStatus: "skipped",
  }).pass, false);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...verifiedStructuralPlan,
    scope: ["users"],
    e2eStatus: "skipped",
  }).pass, false);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...verifiedStructuralPlan,
    scopeApproved: true,
    e2eStatus: "skipped",
  }).pass, false);
  assert.equal(validateE2EOutcome({
    selectionStatus: "success",
    ...verifiedStructuralPlan,
    e2eStatus: "success",
  }).pass, false);

  assert.throws(() => structuralPlan(structuralSyncContext({
    repositoryFullName: "another-owner/another-repository",
  })), /official repository/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    headRepositoryName: "fork-owner/VianaHub.Global.Gerit.Web",
    headRepositoryId: 999,
  })), /official repository/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    headRepositoryId: 999,
  })), /repository IDs/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    baseRef: "main",
  })), /changed-file set is empty/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    headRef: "develop",
  })), /changed-file set is empty/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    eventName: "workflow_dispatch",
  })), /changed-file set is empty/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    baseRepositoryId: 999,
  })), /repository IDs/);
  assert.throws(() => structuralPlan(structuralSyncContext({
    pullRequestHeadSha: "c".repeat(40),
  })), /event SHAs/);
  assert.throws(() => structuralPlan(structuralSyncContext(), identicalTreeEvidence, ["README.md"]), /changed-file list/);
  assert.throws(() => structuralPlan(structuralSyncContext(), { ...identicalTreeEvidence, isAncestor: false }), /not an ancestor/);
  assert.throws(() => structuralPlan(structuralSyncContext(), { ...identicalTreeEvidence, headTree: "different-tree" }), /trees are not identical/);
  assert.throws(() => structuralPlan(structuralSyncContext(), {
    ...identicalTreeEvidence,
    changedFiles: ["domains/operations/users/users-page.tsx"],
  }), /Git reports changed files/);

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

function readComparedFile(ref, file) {
  return ref === "WORKTREE" ? readFileSync(file, "utf8") : readGitFile(ref, file);
}

function compareRefsPlan(files, baseRef, headRef, options, readStructuralSyncEvidence) {
  const normalizedFiles = files.map((file) => normalizePath(file.trim())).filter(Boolean).sort();
  if (options.structuralSyncContext) {
    const structuralSync = verifyStructuralSync({
      ...options.structuralSyncContext,
      baseSha: baseRef,
      headSha: headRef,
      changedFiles: normalizedFiles,
    }, readStructuralSyncEvidence);
    if (structuralSync.verified) {
      return {
        capabilities: [],
        scope: [],
        scopeApproved: false,
        runE2E: false,
        reason: "verified-structural-sync",
        structuralSyncVerified: true,
        supportingChanges: [],
      };
    }
  }

  const localeFiles = files.map(normalizePath).filter((file) => localeCommonPath.test(file));
  const baseContents = {};
  const headContents = {};
  try {
    for (const file of localeFiles) {
      baseContents[file] = readGitFile(baseRef, file);
      headContents[file] = readComparedFile(headRef, file);
    }
  } catch {
    throw new Error("E2E scope validation failed: locale content could not be compared between base and head.");
  }
  const translationAnalysis = analyzeTranslationChanges(localeFiles, baseContents, headContents);
  const comparisonBase = {};
  const comparisonHead = {};
  const semanticFiles = normalizedFiles.filter((file) => !ciOnlyPaths.has(file));
  if (semanticFiles.length === breadcrumbRemovalFiles.length &&
      semanticFiles.every((file, index) => file === breadcrumbRemovalFiles[index])) {
    try {
      for (const file of breadcrumbRemovalFiles) {
        comparisonBase[file] = readGitFile(baseRef, file);
        comparisonHead[file] = readComparedFile(headRef, file);
      }
    } catch {
      throw new Error("E2E scope validation failed: Breadcrumb removal diff could not be compared between base and head.");
    }
  }
  return selectCapabilities(files, {
    ...options,
    translationAnalysis,
    baseContents: comparisonBase,
    headContents: comparisonHead,
  });
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
      const eventName = readOption(args, "--event-name");
      const eventPath = readOption(args, "--event-path");
      const repositoryName = readOption(args, "--repository-name");
      let structuralSyncContext;
      if (eventPath) {
        if (!eventName || !repositoryName) {
          throw new Error("Structural sync validation failed: pull request event context is incomplete.");
        }
        const event = JSON.parse(readFileSync(eventPath, "utf8"));
        structuralSyncContext = {
          eventName,
          repositoryName,
          repository: event.repository,
          pullRequest: event.pull_request,
        };
      }
      const options = { scopeTitle: title ?? "", scopeApproved: approvedValue === "true", structuralSyncContext };
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
