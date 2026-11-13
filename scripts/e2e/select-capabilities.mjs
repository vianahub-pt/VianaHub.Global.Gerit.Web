import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const CAPABILITIES = ["actions", "user-preferences", "teams", "roles"];

const capabilityPaths = new Map([
  ["actions", ["app/(workspace)/actions/", "domains/operations/actions/", "tests/e2e/actions-journey.spec.ts"]],
  ["user-preferences", ["app/(workspace)/preferences/", "domains/identity/preferences/", "tests/e2e/user-preferences-journey.spec.ts"]],
  ["teams", ["app/(workspace)/teams/", "domains/operations/teams/", "tests/e2e/teams-journey.spec.ts"]],
  ["roles", ["app/(workspace)/roles/", "domains/operations/roles/", "tests/e2e/roles-journey.spec.ts"]],
]);

const ciOnlyPaths = new Set([".github/workflows/ci.yml", "scripts/e2e/select-capabilities.mjs"]);
const localeCommonPath = /^locales\/[^/]+\/common\.json$/;
const translationPrefixes = new Map([
  ["actions.", "actions"],
  ["preferences.", "user-preferences"],
  ["teams.", "teams"],
  ["roles.", "roles"],
]);

function normalizePath(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isDocumentation(file) {
  return file.startsWith("docs/") || /(?:^|\/)[^/]+\.(?:md|mdx)$/i.test(file);
}

export function selectCapabilities(files, { fullRegression = false, translationAnalysis } = {}) {
  if (fullRegression) return { capabilities: [...CAPABILITIES], runE2E: true, reason: "manual-full-regression" };

  const changedFiles = files.map((file) => normalizePath(file.trim())).filter(Boolean);
  if (changedFiles.length === 0) {
    return { capabilities: [...CAPABILITIES], runE2E: true, reason: "empty-change-set" };
  }

  const selected = new Set();
  let hasUnmappedChange = false;
  let hasNonDocumentationChange = false;
  let hasTranslationAnalysisFailure = false;
  let hasLocaleCatalogChange = false;
  let hasOtherNonCiChange = false;

  for (const file of changedFiles) {
    if (isDocumentation(file)) continue;

    hasNonDocumentationChange = true;
    if (ciOnlyPaths.has(file)) continue;

    if (localeCommonPath.test(file)) {
      hasLocaleCatalogChange = true;
      if (!translationAnalysis?.ok || !Array.isArray(translationAnalysis.changedKeys) || !Array.isArray(translationAnalysis.removedKeys)) {
        hasTranslationAnalysisFailure = true;
        continue;
      }
      if (translationAnalysis.removedKeys.length > 0) {
        hasUnmappedChange = true;
        continue;
      }
      for (const key of translationAnalysis.changedKeys) {
        const matches = [...translationPrefixes].filter(([prefix]) => key.startsWith(prefix));
        if (matches.length !== 1) {
          hasUnmappedChange = true;
          continue;
        }
        selected.add(matches[0][1]);
      }
      continue;
    }

    hasOtherNonCiChange = true;
    let matched = false;
    for (const [capability, paths] of capabilityPaths) {
      if (paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path))) {
        selected.add(capability);
        matched = true;
      }
    }
    if (!matched) hasUnmappedChange = true;
  }

  if (hasTranslationAnalysisFailure) {
    return { capabilities: [...CAPABILITIES], runE2E: true, reason: "translation-analysis-failed" };
  }
  if (hasUnmappedChange) return { capabilities: [...CAPABILITIES], runE2E: true, reason: "unmapped-impact" };
  const capabilities = CAPABILITIES.filter((capability) => selected.has(capability));
  if (capabilities.length > 0) return { capabilities, runE2E: true, reason: "capability-impact" };
  if (hasLocaleCatalogChange && !hasOtherNonCiChange) {
    return { capabilities: [], runE2E: false, reason: "translation-no-semantic-change" };
  }
  if (hasNonDocumentationChange) return { capabilities: [], runE2E: false, reason: "ci-validation-only" };
  return { capabilities: [], runE2E: false, reason: "documentation-only" };
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
        throw new Error(`Missing locale content for ${file}.`);
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

export function validateE2EOutcome({ selectionStatus, capabilities, runE2E, reason, e2eStatus }) {
  if (selectionStatus !== "success") return { pass: false, reason: "selection-did-not-succeed" };
  if (!Array.isArray(capabilities) || capabilities.some((item) => !CAPABILITIES.includes(item))) {
    return { pass: false, reason: "invalid-capability-selection" };
  }
  if (typeof runE2E !== "boolean") return { pass: false, reason: "invalid-run-decision" };

  if (runE2E) {
    if (capabilities.length === 0) return { pass: false, reason: "selected-e2e-has-no-capabilities" };
    if (new Set(capabilities).size !== capabilities.length) return { pass: false, reason: "duplicate-capability-selection" };
    return e2eStatus === "success"
      ? { pass: true, reason: "selected-e2e-succeeded" }
      : { pass: false, reason: "selected-e2e-did-not-succeed" };
  }

  if (capabilities.length !== 0) return { pass: false, reason: "capabilities-were-omitted" };
  if (!["documentation-only", "ci-validation-only", "translation-no-semantic-change"].includes(reason)) {
    return { pass: false, reason: "e2e-exemption-not-validated" };
  }
  return { pass: true, reason };
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
  const valid = (overrides = {}) => validateE2EOutcome({ selectionStatus: "success", capabilities: ["roles"], runE2E: true, e2eStatus: "success", ...overrides });
  assert.equal(valid().pass, true);
  assert.equal(valid({ e2eStatus: "failure" }).pass, false);
  assert.equal(valid({ capabilities: ["teams", "roles"], e2eStatus: "failure" }).pass, false);
  assert.equal(valid({ e2eStatus: "skipped" }).pass, false);
  assert.equal(valid({ selectionStatus: "failure" }).pass, false);
  assert.equal(valid({ selectionStatus: "cancelled" }).pass, false);
  assert.equal(validateE2EOutcome({ selectionStatus: "success", capabilities: [], runE2E: false, reason: "documentation-only" }).pass, true);
  assert.equal(validateE2EOutcome({ selectionStatus: "success", capabilities: [], runE2E: false, reason: "ci-validation-only" }).pass, true);
  assert.equal(validateE2EOutcome({ selectionStatus: "success", capabilities: [], runE2E: false, reason: "unmapped-impact" }).pass, false);
  assert.equal(validateE2EOutcome({ selectionStatus: "success", capabilities: [], runE2E: false, reason: "documentation-only", e2eStatus: "skipped" }).pass, true);

  const localeFile = "locales/pt-PT/common.json";
  const localeAnalysis = (base, head) => analyzeTranslationChanges(
    [localeFile],
    { [localeFile]: JSON.stringify(base) },
    { [localeFile]: JSON.stringify(head) },
  );
  const roleOnly = localeAnalysis({ "roles.actions.back": "Voltar" }, { "roles.actions.back": "Voltar atrás" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: roleOnly }).capabilities, ["roles"]);
  const preferencesFile = "locales/pt-PT/common.json";
  const preferencesOnly = localeAnalysis({ "preferences.title": "Preferências" }, { "preferences.title": "As minhas preferências" });
  assert.deepEqual(selectCapabilities([preferencesFile], { translationAnalysis: preferencesOnly }).capabilities, ["user-preferences"]);
  const usersWithoutJourney = localeAnalysis({ "users.title": "Utilizadores" }, { "users.title": "Contas" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: usersWithoutJourney }).capabilities, CAPABILITIES);
  const multiCapability = localeAnalysis(
    { "roles.actions.back": "Voltar", "teams.actions.back": "Voltar" },
    { "roles.actions.back": "Regressar", "teams.actions.back": "Voltar atrás" },
  );
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: multiCapability }).capabilities, ["teams", "roles"]);
  const sharedKey = localeAnalysis({ "navigation.back": "Voltar" }, { "navigation.back": "Regressar" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: sharedKey }).capabilities, CAPABILITIES);
  const unknownKey = localeAnalysis({ "futureCapability.label": "Antes" }, { "futureCapability.label": "Depois" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: unknownKey }).capabilities, CAPABILITIES);
  const removedKey = localeAnalysis({ "roles.actions.back": "Voltar" }, {});
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: removedKey }).capabilities, CAPABILITIES);
  const failedAnalysis = analyzeTranslationChanges([localeFile], { [localeFile]: "{" }, { [localeFile]: "{}" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: failedAnalysis }), {
    capabilities: [...CAPABILITIES], runE2E: true, reason: "translation-analysis-failed",
  });
  assert.deepEqual(selectCapabilities([localeFile]), {
    capabilities: [...CAPABILITIES], runE2E: true, reason: "translation-analysis-failed",
  });
  const formattingOnly = localeAnalysis({ "roles.actions.back": "Voltar" }, { "roles.actions.back": "Voltar" });
  assert.deepEqual(selectCapabilities([localeFile], { translationAnalysis: formattingOnly }), {
    capabilities: [], runE2E: false, reason: "translation-no-semantic-change",
  });
  assert.equal(validateE2EOutcome({
    selectionStatus: "success", capabilities: [], runE2E: false, reason: "translation-no-semantic-change",
  }).pass, true);
  console.log("E2E selection, locale key comparison, and fallback self-tests passed.");
}

function readGitFile(ref, file) {
  return execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function compareRefsPlan(files, baseRef, headRef) {
  const localeFiles = files.map(normalizePath).filter((file) => localeCommonPath.test(file));
  const baseContents = {};
  const headContents = {};
  try {
    for (const file of localeFiles) {
      baseContents[file] = readGitFile(baseRef, file);
      headContents[file] = readGitFile(headRef, file);
    }
  } catch {
    return { capabilities: [...CAPABILITIES], runE2E: true, reason: "translation-analysis-failed" };
  }
  const translationAnalysis = analyzeTranslationChanges(localeFiles, baseContents, headContents);
  return selectCapabilities(files, { translationAnalysis });
}

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
  console.log(`E2E Validation: ${outcome.pass ? "PASS" : "FAIL"} (${outcome.reason}).`);
  if (!outcome.pass) process.exitCode = 1;
} else {
  const fullRegression = process.argv.includes("--full-regression");
  const input = fullRegression ? [] : readFileSync(0, "utf8").split(/\r?\n/);
  const compareIndex = process.argv.indexOf("--compare");
  const plan = compareIndex >= 0
    ? compareRefsPlan(input, process.argv[compareIndex + 1], process.argv[compareIndex + 2])
    : selectCapabilities(input, { fullRegression });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
