import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectCapabilities } from "../../scripts/e2e/select-capabilities.mjs";

test("ClientContactPerson implementation and journey classify as functional Client", () => {
  const source = readFileSync(resolve("domains/operations/clients/clients-v1-contacts.tsx"), "utf8");
  const testSource = readFileSync(resolve("tests/e2e/client-contact-person-journey.spec.ts"), "utf8");
  const plan = selectCapabilities([
    "domains/operations/clients/clients-v1-contacts.tsx",
    "tests/e2e/client-contact-person-journey.spec.ts",
  ], { scope: ["clients"], baseContents: {}, headContents: {}, testContents: {
    "domains/operations/clients/clients-v1-contacts.tsx": source,
    "tests/e2e/client-contact-person-journey.spec.ts": testSource,
  } });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
});

test("ClientContactPerson journey does not classify outside its declared capability", () => {
  assert.throws(() => selectCapabilities([
    "domains/operations/clients/clients-v1-contacts.tsx",
    "tests/e2e/client-contact-person-journey.spec.ts",
  ], { scope: ["users"], baseContents: {}, headContents: {}, testContents: {} }), /functional changes exceed declared scope/i);
});

test("ClientContactPerson uses one inline form above HubGrid with direct edit and no detail surface", () => {
  const source = readFileSync(resolve("domains/operations/clients/clients-v1-contacts.tsx"), "utf8");
  const journey = readFileSync(resolve("tests/e2e/client-contact-person-journey.spec.ts"), "utf8");
  assert.match(source, /client-contact-inline-form-panel/);
  assert.match(source, /<HubGrid/);
  assert.ok(source.indexOf("client-contact-inline-form-panel") < source.indexOf("canRead ? <HubGrid"));
  assert.match(source, /getClientContactPersonDetail\(fetchWithAuth, clientId, contactId\)/);
  assert.match(source, /client-contact-edit-\$\{contact\.id\}/);
  assert.doesNotMatch(source, /client-contact-detail|actions\.view|onRowClick/);
  assert.match(journey, /mutationsBeforeCancel|mutationCount/);
  assert.match(journey, /unexpectedWrites/);
  assert.match(journey, /user-preferences\/user/);
});


test("Client child tabs require a persisted parent that matches the validated route id", () => {
  const source = readFileSync(resolve("domains/operations/clients/clients-v1.tsx"), "utf8");
  const tabs = readFileSync(resolve("shared/ui/hub-tabs.tsx"), "utf8");
  const journey = readFileSync(resolve("tests/e2e/client-contact-person-journey.spec.ts"), "utf8");
  assert.match(source, /clientTabsEnabled = isEditingRoute && validId && !loading && client !== null && client\.id === parsedId/);
  assert.match(source, /disabled: item\.id !== "client" && !clientTabsEnabled/);
  assert.match(source, /<div hidden=\{selectedTab !== "contacts"\}>/);
  assert.match(source, /ClientContactPersonsPanel[\s\S]*clientId=\{clientTabsEnabled \? client\.id : null\}[\s\S]*active=\{selectedTab === "contacts" && clientTabsEnabled && !loading\}/);
  assert.match(source, /key=\{String\(clientTabsEnabled \? client\.id : parsedId \?\? "unavailable"\)\}/);
  assert.match(tabs, /if \(tabs\.find\(\(tab\) => tab\.id === tabId\)\?\.disabled\) return/);
  assert.match(tabs, /disabled=\{tab\.disabled\}/);
  assert.match(tabs, /tabs\.filter\(\(tab\) => !tab\.disabled\)/);
  assert.match(tabs, /find\(\(tab\) => tab\.id === resolvedActiveTab && !tab\.disabled\)/);
  assert.match(journey, /client-create-tabs-disabled/);
  assert.match(journey, /setClientCreateStatus\(500\)/);
  assert.match(journey, /setClientCreateStatus\(201\)/);
  assert.match(journey, /not-a-valid-id/);
  assert.match(journey, /contactReadsBeforeHide/);
  assert.match(journey, /filterPreservedAcrossTabSwitch/);
  assert.match(journey, /pendingContacts|address|fiscal/i);
});

test("mocked visual harness rejects unexpected preference writes immediately", () => {
  const journey = readFileSync(resolve("tests/e2e/client-contact-person-journey.spec.ts"), "utf8");
  assert.match(journey, /if \(preferencesMatch && method !== "GET"\) \{[\s\S]*unexpectedWrites\.push\(method \+ " " \+ path\);[\s\S]*return json\(route, 599,/);
  assert.match(journey, /if \(method === "GET" \|\| method === "HEAD"\) \{[\s\S]*options\.blockUnmockedReads[\s\S]*unexpectedReads\.push\(method \+ " " \+ path\);[\s\S]*return json\(route, 599,[\s\S]*return route\.continue\(\);[\s\S]*unexpectedWrites\.push\(method \+ " " \+ path\);[\s\S]*return json\(route, 599,/);
});
test("ClientContactPerson read and mutation grants remain independently scoped", () => {
  const source = readFileSync(resolve("domains/operations/clients/clients-v1-contacts.tsx"), "utf8");
  for (const action of ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete"]) {
    assert.ok(source.includes(`hasPermission("ClientContactPersons", "${action}")`));
  }
  assert.match(source, /clientId === null \|\| !canRead/);
  assert.match(source, /mode === "create" \? !canCreate : !canUpdate/);
});
