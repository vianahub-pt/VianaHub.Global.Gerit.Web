import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectCapabilities } from "../../scripts/e2e/select-capabilities.mjs";

const panelPath = "domains/operations/clients/clients-v1-addresses.tsx";
const journeyPath = "tests/e2e/client-contact-person-journey.spec.ts";

test("ClientAddress implementation and mocked journey classify as functional Client coverage", () => {
  const panel = readFileSync(resolve(panelPath), "utf8");
  const journey = readFileSync(resolve(journeyPath), "utf8");
  const changed = [panelPath, "domains/operations/clients/client-address-api.ts", "domains/operations/clients/client-address-contract.ts", "tests/clients/client-address-contract.test.mjs", "tests/clients/client-address-api.test.mjs", journeyPath];
  const plan = selectCapabilities(changed, { scope: ["clients"], baseContents: {}, headContents: {}, testContents: { [panelPath]: panel, [journeyPath]: journey } });
  assert.deepEqual(plan.functionalCapabilities, ["clients"]);
  assert.deepEqual(plan.capabilities, ["clients"]);
  assert.equal(plan.runE2E, true);
});

test("ClientAddress keeps grants independent and blocks child requests before a persisted Client", () => {
  const panel = readFileSync(resolve(panelPath), "utf8");
  const page = readFileSync(resolve("domains/operations/clients/clients-v1.tsx"), "utf8");
  for (const grant of ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete", "BulkUpload"]) {
    assert.ok(panel.includes(`hasPermission("ClientAddresses", "${grant}")`), `missing ${grant} grant`);
  }
  assert.match(panel, /clientId === null \|\| !canRead/);
  assert.match(panel, /clientId === null \|\| submitting/);
  assert.match(panel, /clientId === null \|\| !canBulkUpload/);
  assert.match(page, /ClientAddressesPanel[\s\S]*clientId=\{clientTabsEnabled \? client\.id : null\}[\s\S]*active=\{selectedTab === "addresses" && clientTabsEnabled && !loading\}/);
  assert.match(panel, /getClientAddressDetail\(fetchWithAuth, clientId, addressId\)/);
  assert.match(panel, /setForm\(clientAddressFormFromDetail\(result\)\)/);
  assert.doesNotMatch(panel, /tenantId|TenantId/);
});
