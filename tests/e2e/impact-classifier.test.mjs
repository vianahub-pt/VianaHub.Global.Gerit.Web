import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PRESENTATION_REGRESSION_TESTS, provePresentationAdapter } from "../../scripts/e2e/impact-classifier.mjs";
import { selectCapabilities, validateE2EOutcome } from "../../scripts/e2e/select-capabilities.mjs";
import { verifyStructuralSync } from "../../scripts/e2e/structural-sync.mjs";

const tests = {
  "tests/shared/ui-standard.test.mjs": "shared UI contracts",
  "tests/shared/hub-image.test.mjs": "HubImage props and locales",
  "tests/preferences/user-preferences-layout.test.mjs": "Preferences callbacks and layout",
  "tests/preferences/user-preferences-contract.test.mjs": "Preferences contract",
  "tests/users/permission-claims.test.mjs": "Users permissions",
  "tests/clients/client-ui-contract.test.mjs": "Client UI contract",
  "tests/e2e/hub-image-journey.spec.ts": 'page.route("**/api/**"); const mutations:',
  "tests/e2e/client-contact-person-journey.spec.ts": 'ClientContactPerson inline form and HubGrid journey',
};

const structuralSyncBaseSha = "a".repeat(40);
const structuralSyncHeadSha = "b".repeat(40);
const structuralSyncRepository = "vianahub-pt/VianaHub.Global.Gerit.Web";
const structuralSyncContext = (changedFiles = [], overrides = {}) => ({
  eventName: "pull_request",
  repositoryName: structuralSyncRepository,
  repository: { id: 731, full_name: structuralSyncRepository },
  pullRequest: {
    base: { ref: "develop", sha: structuralSyncBaseSha, repo: { id: 731, full_name: structuralSyncRepository } },
    head: { ref: "main", sha: structuralSyncHeadSha, repo: { id: 731, full_name: structuralSyncRepository } },
  },
  baseSha: structuralSyncBaseSha,
  headSha: structuralSyncHeadSha,
  changedFiles,
  ...overrides,
});
const structuralSyncEvidence = (changedFiles = [], overrides = {}) => ({
  isAncestor: true,
  mergeBase: structuralSyncBaseSha,
  baseTree: "tree-before",
  headTree: changedFiles.length === 0 ? "tree-before" : "tree-after-ci-only",
  changedFiles,
  mergeBaseChangedFiles: changedFiles,
  ...overrides,
});

test("verifies empty and explicitly allowlisted CI-only structural syncs from Git evidence", () => {
  const emptySync = verifyStructuralSync(structuralSyncContext(), () => structuralSyncEvidence());
  assert.deepEqual(emptySync, { candidate: true, verified: true, changedFiles: [] });

  const ciOnlyFiles = [
    "scripts/e2e/select-capabilities.mjs",
    "scripts/e2e/structural-sync.mjs",
    "tests/e2e/impact-classifier.test.mjs",
  ];
  const ciOnlySync = verifyStructuralSync(structuralSyncContext(ciOnlyFiles), () => structuralSyncEvidence(ciOnlyFiles));
  assert.deepEqual(ciOnlySync, { candidate: true, verified: true, changedFiles: ciOnlyFiles });
});

test("rejects structural sync claims with functional, shared, translation, dependency, HubSelect or unknown changes", () => {
  for (const file of [
    "domains/operations/clients/clients-v1.tsx",
    "shared/ui/hub-select.tsx",
    "locales/pt-PT/common.json",
    "package.json",
    "unclassified/anything.txt",
  ]) {
    assert.throws(
      () => verifyStructuralSync(structuralSyncContext([file]), () => structuralSyncEvidence([file])),
      /non-CI-only changes/,
      file,
    );
  }
});

test("rejects wrong refs, unrelated history, nonmatching merge-base and mismatched PR/Git file lists", () => {
  const ciOnlyFiles = ["scripts/e2e/select-capabilities.mjs"];
  assert.deepEqual(verifyStructuralSync(structuralSyncContext(ciOnlyFiles, {
    pullRequest: { ...structuralSyncContext().pullRequest, head: { ...structuralSyncContext().pullRequest.head, ref: "feature/other" } },
  }), () => structuralSyncEvidence(ciOnlyFiles)), { candidate: false, verified: false });
  assert.deepEqual(verifyStructuralSync(structuralSyncContext(ciOnlyFiles, {
    pullRequest: { ...structuralSyncContext().pullRequest, base: { ...structuralSyncContext().pullRequest.base, ref: "main" } },
  }), () => structuralSyncEvidence(ciOnlyFiles)), { candidate: false, verified: false });
  assert.throws(() => verifyStructuralSync(structuralSyncContext(ciOnlyFiles), () => structuralSyncEvidence(ciOnlyFiles, {
    isAncestor: false,
  })), /not an ancestor/);
  assert.throws(() => verifyStructuralSync(structuralSyncContext(ciOnlyFiles), () => structuralSyncEvidence(ciOnlyFiles, {
    mergeBase: "c".repeat(40),
  })), /merge-base/);
  assert.throws(() => verifyStructuralSync(structuralSyncContext(ciOnlyFiles), () => structuralSyncEvidence([])), /both Git diff ranges/);
  assert.throws(() => verifyStructuralSync(structuralSyncContext(ciOnlyFiles), () => structuralSyncEvidence(ciOnlyFiles, {
    mergeBaseChangedFiles: ["scripts/e2e/structural-sync.mjs"],
  })), /both Git diff ranges/);
});

const textareaBase = (id, field) => `import { useState } from "react";\nfunction Page() { const [description, setDescription] = useState(""); return <label data-testid="${id}"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="h-24 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring disabled:opacity-50" disabled={submitting} /></label>; }`;
const textareaHead = (id, field) => `import { useState } from "react";\nimport { Textarea } from "@/shared/ui/textarea";\nfunction Page() { const [description, setDescription] = useState(""); return <label data-testid="${id}"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="min-h-24 resize-y" disabled={submitting} /></label>; }`;
const preferenceBase = `export function UserPreferencesPage() { const preferences = useIdentityPreferences(); const { setActiveTab } = preferences;\n  return (<> {preferences.state.activeTab === "general"} {tabs.map((tab) => <button onClick={() => { preferences.setActiveTab(tab.key); }}>{tab.label}</button>} <input onChange={(event) => preferences.toggleEmailNotification(item.key)} checked={checked} /> <PreferenceSelect onChange={preferences.setTimezone} /> {preferences.setAppearance(x)} {preferences.setLocale(x)} {preferences.setCurrencyCode(x)} {preferences.setDateFormat(x)} {preferences.setTimeFormat(x)} {preferences.setDayStart} {preferences.setDayEnd} </>); }`;
const preferenceHead = `import { HubSwitch, HubTabs } from "@/shared/ui";\nexport function UserPreferencesPage() { const preferences = useIdentityPreferences(); const { setActiveTab } = preferences;\n  return (<><HubTabs tabs={tabs} activeTab={preferences.state.activeTab} onTabChange={(tabId) => preferences.setActiveTab(tabId)} renderPanel={false} /> <HubSwitch onCheckedChange={(nextChecked) => { if (nextChecked !== checked) { preferences.toggleEmailNotification(item.key); } }} checked={checked} /><PreferenceSelect onChange={preferences.setTimezone} /> {preferences.setAppearance(x)} {preferences.setLocale(x)} {preferences.setCurrencyCode(x)} {preferences.setDateFormat(x)} {preferences.setTimeFormat(x)} {preferences.setDayStart} {preferences.setDayEnd}</>); }`;
const usersBase = `import { ImagePicker } from "@/shared/ui/image-picker"; function Form() { return <ImagePicker value={urlImage} onChange={setUrlImage} pendingFile={pendingImageFile} onPendingFileChange={setPendingImageFile} disabled={!canUpdate} />; }`;
const usersHead = `import { HubImage } from "@/shared/ui"; function Form() { return <HubImage urlImage={urlImage} onUrlImageChange={setUrlImage} pendingFile={pendingImageFile} onPendingFileChange={setPendingImageFile} disabled={!canUpdate} />; }`;

function proof(file, base, head, testOverrides = {}) {
  return provePresentationAdapter(file, base, head, { ...tests, ...testOverrides });
}

test("proves controlled Textarea adapters while retaining value, callback and constraints", () => {
  for (const [file, id] of [
    ["domains/operations/actions/action-form-page.tsx", "action-description-field"],
    ["domains/operations/roles/role-form-page.tsx", "role-fields-section"],
    ["domains/operations/teams/team-form-page.tsx", "team-fields-section"],
  ]) assert.ok(proof(file, textareaBase(id), textareaHead(id)));
  assert.equal(proof("domains/operations/roles/role-form-page.tsx", textareaBase("role-fields-section"), textareaHead("role-fields-section").replace("setDescription(event.target.value)", "deleteRole(id)")), null);
});

test("proves Users HubImage migration only when the entire normalized consumer is equivalent", () => {
  const file = "domains/operations/users/user-form-page.tsx";
  assert.ok(proof(file, usersBase, usersHead));
  assert.equal(proof(file, usersBase, usersHead.replace("disabled={!canUpdate}", "disabled={false}")), null);
  assert.equal(proof(file, usersBase, usersHead.replace("onUrlImageChange={setUrlImage}", "onUrlImageChange={() => setUrlImage(\"https://attacker.invalid\")}")), null);
});

test("proves Preferences migration only when stateful callbacks remain equivalent", () => {
  const file = "domains/identity/preferences/user-preferences-page.tsx";
  assert.ok(proof(file, preferenceBase, preferenceHead));
  assert.equal(proof(file, preferenceBase, preferenceHead.replace("preferences.toggleEmailNotification(item.key)", "deleteUserPreference(item.key)")), null);
  assert.equal(proof(file, preferenceBase, preferenceHead.replace("preferences.setTimezone", "preferences.setLocale")), null);
});

test("requires every shared regression artifact and API interception evidence", () => {
  assert.equal(proof("domains/operations/actions/action-form-page.tsx", textareaBase("action-description-field"), textareaHead("action-description-field"), { "tests/preferences/user-preferences-contract.test.mjs": "" }), null);
  assert.equal(proof("domains/operations/actions/action-form-page.tsx", textareaBase("action-description-field"), textareaHead("action-description-field"), { "tests/e2e/hub-image-journey.spec.ts": "const mutations:" }), null);
});

test("selects Client functionally and reports verified presentation consumers", () => {
  const file = "domains/operations/users/user-form-page.tsx";
  const plan = selectCapabilities(["domains/operations/clients/clients-v1.tsx", file, "shared/ui/hub-switch.tsx"], {
    scope: ["clients"],
    baseContents: { [file]: usersBase },
    headContents: { [file]: usersHead },
    testContents: tests,
  });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.deepEqual(plan.presentationConsumers, ["users"]);
  assert.equal(plan.sharedUiRegressionRequired, true);
  assert.ok(plan.sharedComponents.includes("hub-switch"));
});

test("all valid classifier plans expose serializable workflow fields with semantic defaults", () => {
  const workflowFields = [
    "capabilities", "scope", "scopeApproved", "runE2E", "reason", "functionalCapabilities",
    "sharedComponents", "presentationConsumers", "sharedUiRegressionRequired", "structuralSyncVerified",
  ];
  const plans = [
    selectCapabilities(["README.md", "docs/ci.md"]),
    selectCapabilities([".github/workflows/ci.yml"]),
    selectCapabilities(["locales/pt-PT/common.json"], {
      scope: ["roles"],
      translationAnalysis: { ok: true, changedKeys: [], removedKeys: [] },
    }),
    selectCapabilities(["domains/operations/clients/clients-v1.tsx"], { scope: ["clients"] }),
    selectCapabilities(["domains/operations/clients/clients-v1.tsx", "shared/ui/hub-tabs.tsx"], { scope: ["clients"] }),
    selectCapabilities([], { fullRegression: true }),
  ];

  for (const plan of plans) {
    for (const field of workflowFields) assert.ok(Object.hasOwn(plan, field), field + " is required by CI");
    assert.ok(Array.isArray(plan.capabilities));
    assert.ok(Array.isArray(plan.scope));
    assert.equal(typeof plan.scopeApproved, "boolean");
    assert.equal(typeof plan.runE2E, "boolean");
    assert.equal(typeof plan.reason, "string");
    assert.ok(Array.isArray(plan.functionalCapabilities));
    assert.ok(Array.isArray(plan.sharedComponents));
    assert.ok(Array.isArray(plan.presentationConsumers));
    assert.equal(typeof plan.sharedUiRegressionRequired, "boolean");
    assert.equal(typeof plan.structuralSyncVerified, "boolean");
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, "workflow fields must round-trip through JSON");
  }

  const noSemanticTranslation = plans[2];
  assert.deepEqual(noSemanticTranslation.capabilities, []);
  assert.equal(noSemanticTranslation.runE2E, false);
  const sharedUi = plans[4];
  assert.deepEqual(sharedUi.sharedComponents, ["hub-tabs"]);
  assert.equal(sharedUi.sharedUiRegressionRequired, true);
});

test("direct HubTabs changes keep the functional Client plan and require mapped regressions", () => {
  const plan = selectCapabilities(["domains/operations/clients/clients-v1.tsx", "shared/ui/hub-tabs.tsx"], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.deepEqual(plan.presentationConsumers, []);
  assert.deepEqual(plan.sharedComponents, ["hub-tabs"]);
  assert.equal(plan.sharedUiRegressionRequired, true);
  assert.ok(plan.requiredRegressionTests.includes("tests/shared/ui-standard.test.mjs"));
});
test("package test gate and CI runner execute every required shared regression artifact", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const testCommand = packageJson.scripts.test;
  const runner = readFileSync("scripts/e2e/run-capability.mjs", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const e2eJob = workflow.slice(workflow.indexOf("  e2e-validation:"));
  assert.ok(e2eJob.indexOf("name: Install dependencies") < e2eJob.indexOf("name: Test capability selection and E2E outcomes"), "CI must install the TypeScript parser dependency before selector self-tests");
  assert.ok(e2eJob.indexOf("name: Install dependencies") < e2eJob.indexOf("name: Select affected E2E journeys"), "CI must install the TypeScript parser dependency before capability selection");
  for (const file of PRESENTATION_REGRESSION_TESTS) {
    if (file.endsWith(".spec.ts")) {
      assert.ok(runner.includes(file), "CI runner must select " + file);
    } else {
      const folder = file.split("/")[1];
      assert.ok(testCommand.includes(file) || testCommand.includes("tests/" + folder + "/*.test.mjs"), "npm test must select " + file);
    }
  }
  const journey = readFileSync("tests/e2e/hub-image-journey.spec.ts", "utf8");
  assert.ok(journey.includes('page.route("**/api/**"'), "shared journey must intercept all application API calls");
  assert.equal(journey.includes("route.continue()"), false, "shared journey must not forward API traffic to QA");

  assert.match(testCommand, /tests\/shared\/\*\.test\.mjs/);
  assert.match(e2eJob, /shared_components=\$\(node -e .*sharedComponents/);
  assert.match(e2eJob, /shared_components=\$shared_components/);
  assert.match(e2eJob, /SHARED_COMPONENTS:.*shared_components/);
  assert.match(e2eJob, /"sharedComponents":\$SHARED_COMPONENTS/);
  assert.match(e2eJob, /SHARED_REGRESSION_CONSUMERS:.*presentation_consumers/);
  assert.match(workflow, /name: Run required static and focused regression tests[\s\S]*?run: npm test/);
  assert.match(runner, /tests\/e2e\/hub-image-journey\.spec\.ts[\s\S]*?tests\/e2e\/client-contact-person-journey\.spec\.ts/);
});

test("Next 16 toolchain config is supporting scope but still requires the Client journey", () => {
  const files = [".eslintrc.json", "eslint.config.mjs", "next-env.d.ts", "tsconfig.json", "package.json", "package-lock.json", "tests/e2e/client-contact-person-journey.spec.ts"];
  const plan = selectCapabilities(files, { scope: ["clients"] });
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
  assert.ok(plan.supportingChanges.includes("eslint.config.mjs"));
  assert.throws(() => selectCapabilities(["eslint.config.mjs"], { scope: ["clients"] }), /shared-only changes do not prove the declared capability/);
});

test("sidebar purity correction is shared support and requires its focused regression", () => {
  const plan = selectCapabilities([
    "domains/operations/clients/clients-v1.tsx",
    "components/ui/sidebar.tsx",
    "tests/e2e/fixtures/index.ts",
    "tests/shared/ui-standard.test.mjs",
  ], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.sharedComponents, ["sidebar"]);
  assert.ok(plan.supportingChanges.includes("tests/e2e/fixtures/index.ts"));
  assert.equal(plan.sharedUiRegressionRequired, true);
  assert.ok(plan.requiredRegressionTests.includes("tests/shared/ui-standard.test.mjs"));
  assert.throws(() => selectCapabilities(["components/ui/sidebar.tsx"], { scope: ["clients"] }), /shared-only changes do not prove the declared capability/);
});

test("ClientAddress read-only QA journey is classified as Client-only E2E impact", () => {
  const plan = selectCapabilities(["tests/e2e/client-address-read-only-journey.spec.ts"], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
  assert.equal(plan.sharedUiRegressionRequired, false);
});
test("ClientAddress CRUD guard tests are classified as Client-only E2E impact", () => {
  const plan = selectCapabilities(["tests/e2e/client-address-crud-guard.test.mjs"], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
  assert.equal(plan.sharedUiRegressionRequired, false);
});

test("ClientAddress mocked CRUD journey is classified as Client-only E2E impact", () => {
  const plan = selectCapabilities(["tests/e2e/client-address-crud-journey.spec.ts"], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
  assert.equal(plan.sharedUiRegressionRequired, false);
});
test("HubGrid changes require the mocked ClientContactPerson journey and pass shared validation", () => {
  const plan = selectCapabilities([
    "domains/operations/clients/clients-v1-contacts.tsx",
    "shared/hub-grid/hub-grid.tsx",
    "tests/e2e/client-contact-person-journey.spec.ts",
  ], { scope: ["clients"] });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.sharedComponents, ["hub-grid"]);
  assert.equal(plan.sharedUiRegressionRequired, true);
  assert.ok(plan.requiredRegressionTests.includes("tests/e2e/client-contact-person-journey.spec.ts"));

  const outcome = validateE2EOutcome({
    selectionStatus: "success",
    capabilities: ["clients"],
    functionalCapabilities: ["clients"],
    scope: ["clients"],
    scopeApproved: false,
    runE2E: true,
    reason: plan.reason,
    e2eStatus: "success",
    sharedUiRegressionRequired: plan.sharedUiRegressionRequired,
    sharedComponents: plan.sharedComponents,
    presentationConsumers: plan.presentationConsumers,
    sharedRegressionConsumers: plan.presentationConsumers,
    sharedRegressionStatus: "success",
    regressionTestsStatus: "success",
  });
  assert.equal(outcome.pass, true, "the mocked ClientContactPerson journey is the registered HubGrid regression");
});
test("shared regression outcome accepts explicit HubTabs proof and otherwise fails closed", () => {
  const base = {
    selectionStatus: "success", capabilities: ["clients"], functionalCapabilities: ["clients"], scope: ["clients"],
    scopeApproved: false, runE2E: true, reason: "any-reason-value-is-non-authoritative", e2eStatus: "success",
    sharedUiRegressionRequired: true, sharedComponents: ["hub-tabs"], presentationConsumers: [],
    sharedRegressionConsumers: [], sharedRegressionStatus: "success", regressionTestsStatus: "success",
  };
  assert.equal(validateE2EOutcome(base).pass, true, "HubTabs direct test is in npm test and both CI stages succeeded");

  const consumerRegression = { ...base, sharedComponents: [], presentationConsumers: ["users", "roles"], sharedRegressionConsumers: ["users", "roles"] };
  assert.equal(validateE2EOutcome(consumerRegression).pass, true);
  assert.equal(validateE2EOutcome({ ...base, sharedComponents: [], presentationConsumers: [] }).reason, "shared-regression-evidence-missing");
  assert.equal(validateE2EOutcome({ ...base, sharedComponents: undefined }).reason, "invalid-shared-component-plan");
  assert.equal(validateE2EOutcome({ ...base, regressionTestsStatus: "skipped" }).reason, "required-regression-tests-did-not-succeed");
  assert.equal(validateE2EOutcome({ ...base, sharedRegressionStatus: "failure" }).reason, "shared-regression-did-not-succeed");
  assert.equal(validateE2EOutcome({ ...base, e2eStatus: "cancelled" }).pass, false);
  assert.equal(validateE2EOutcome({ ...base, sharedComponents: ["future-widget"] }).reason, "shared-component-regression-tests-undefined");
  assert.equal(validateE2EOutcome({ ...base, sharedComponents: ["hub-tabs", "hub-tabs"] }).reason, "invalid-shared-component-plan");
  assert.equal(validateE2EOutcome({ ...consumerRegression, sharedRegressionConsumers: ["users"] }).reason, "shared-regression-consumers-do-not-match-plan");
  assert.equal(validateE2EOutcome({ ...consumerRegression, regressionTestsStatus: "unknown" }).reason, "required-regression-tests-did-not-succeed");
  assert.equal(validateE2EOutcome({ ...base, capabilities: [], scope: [], functionalCapabilities: [] }).pass, false);
});
