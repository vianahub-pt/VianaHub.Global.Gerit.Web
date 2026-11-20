import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PRESENTATION_REGRESSION_TESTS, provePresentationAdapter } from "../../scripts/e2e/impact-classifier.mjs";
import { selectCapabilities, validateE2EOutcome } from "../../scripts/e2e/select-capabilities.mjs";

const tests = {
  "tests/shared/ui-standard.test.mjs": "shared UI contracts",
  "tests/shared/hub-image.test.mjs": "HubImage props and locales",
  "tests/preferences/user-preferences-layout.test.mjs": "Preferences callbacks and layout",
  "tests/preferences/user-preferences-contract.test.mjs": "Preferences contract",
  "tests/users/permission-claims.test.mjs": "Users permissions",
  "tests/clients/client-ui-contract.test.mjs": "Client UI contract",
  "tests/e2e/hub-image-journey.spec.ts": 'page.route("**/api/**"); const mutations:',
};

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
