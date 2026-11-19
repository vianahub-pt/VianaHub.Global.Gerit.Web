import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasClaimPermission } from "../../platform/auth/permission-claims.ts";

const component = readFileSync("domains/operations/clients/clients-v1.tsx", "utf8");
const api = readFileSync("domains/operations/clients/client-api.ts", "utf8");
const locales = ["pt-PT", "pt-BR", "en-US", "es-ES"].map((locale) =>
  JSON.parse(readFileSync("locales/" + locale + "/common.json", "utf8")),
);

test("Client list uses official HubGrid with authorized row navigation and contained actions", () => {
  assert.match(component, /import \{ HubGrid, type HubGridColumn, type RowDensity \} from "@\/shared\/hub-grid"/);
  assert.match(component, /onRowClick=\{canGetBy && canUpdate \?/);
  assert.match(component, /event\.stopPropagation\(\); openDetail\(client\)/);
  assert.match(component, /event\.stopPropagation\(\); void toggleLifecycle\(client\)/);
  assert.match(component, /event\.stopPropagation\(\); setDeleteTarget\(client\)/);
});

test("Client list exposes disabled CSV import, State, and only edit/lifecycle/delete actions", () => {
  assert.match(component, /clients\.bulk\.upload\.unavailable/);
  assert.match(component, /statusColumnLabel=\{t\("clients\.table\.status"\)\}/);
  assert.doesNotMatch(component, /clients\.v1\.actions\.view|<Eye/);
  assert.match(component, /canUpdate && canGetBy.*?SquarePen/);
  assert.match(component, /canDeactivate.*?canActivate.*?PowerOff.*?Power/);
  assert.match(component, /canDelete.*?Trash2/);
  for (const [index, locale] of locales.entries()) {
    assert.ok(locale["clients.bulk.upload.unavailable"]);
    assert.equal(locale["clients.form.observation"], ["Observações", "Observações", "Notes", "Observaciones"][index]);
    assert.equal(locale["common.yes"], ["Sim", "Sim", "Yes", "Sí"][index]);
    assert.equal(locale["common.no"], ["Não", "Não", "No", "No"][index]);
    assert.ok(locale["clients.v1.lifecycle"] === "Estado" || locale["clients.v1.lifecycle"] === "Status");
  }
});

test("Client detail is directly editable and denies routes unless both read and update grants exist", () => {
  assert.match(component, /hasPermission\("Clients", "GetBy"\)/);
  assert.match(component, /hasPermission\("Clients", "Update"\)/);
  assert.match(component, /isEditingRoute \? \(!canRead \|\| !canUpdate\) : !canCreate/);
  assert.doesNotMatch(component, /actionAllowed|const \[editing|readOnly|client-edit|clients\.v1\.edit\.requiredPermission/);
  assert.match(component, /const fieldsDisabled = submitting \|\| catalogsLoading/);
  assert.match(component, /if \(!isHydrating && isAuthenticated && \(isEditingRoute \? canRead && canUpdate : canCreate\)\)/);
  assert.match(component, /if \(submitting \|\| \(isEditingRoute \? !canUpdate \|\| !client : !canCreate\)\) return/);
});

test("Client business status is active-domain controlled, defaulted, editable, and serialized from the selection", () => {
  assert.match(component, /<SelectField label=\{t\("clients\.v1\.fields\.businessStatus"\)\} value=\{values\.statusDefinitionId\}/);
  assert.match(component, /testId="client-business-status"/);
  assert.match(component, /const activeStatusOptions = catalogs\.statusDefinitions\.filter\(\(option\) => option\.statusDomainId === CLIENT_STATUS_DOMAIN_ID && option\.isActive\)/);
  assert.match(component, /const statusDefinitionId = selectedStatusDefinitionId/);
  assert.match(component, /const valuesWithSelectedStatus = \{ \.\.\.values, statusDefinitionId: String\(statusDefinitionId\) \}/);
  assert.match(component, /const currentStatusIsInactive = isEditingRoute/);
  assert.match(component, /disabled: true/);
  assert.match(api, /statusDefinitions: definitions\.filter\(\(item\) => item\.statusDomainId === clientDomain\.id && item\.isActive\)/);
  assert.doesNotMatch(component, /statusDefinitionId: isEditingRoute \? .*CLIENT_INITIAL_STATUS_DEFINITION_ID/);
});

test("Client form places fields in five aligned rows with one shared image and full-width observations", () => {
  assert.match(component, /client-fields-grid" className="grid grid-cols-1 gap-x-5 gap-y-5 lg:grid-cols-3"/);
  assert.match(component, /testId="client-party-type" className="lg:col-start-1 lg:row-start-1"/);
  assert.match(component, /testId="client-acquisition-source" className="lg:col-start-2 lg:row-start-1"/);
  assert.match(component, /lg:col-start-3 lg:row-start-1 lg:row-span-3"><HubImage/);
  assert.match(component, /testId="client-name" className="lg:col-start-1 lg:row-start-2"/);
  assert.match(component, /testId="client-business-status" className="lg:col-start-2 lg:row-start-2"/);
  assert.match(component, /testId="client-phone" className="lg:col-start-1 lg:row-start-4"/);
  assert.match(component, /testId="client-cell-phone" className="lg:col-start-2 lg:row-start-4"/);
  assert.match(component, /data-testid="client-whatsapp-field"[\s\S]*?lg:col-start-3 lg:row-start-4/);
  assert.match(component, /testId="client-email" className="lg:col-start-1 lg:row-start-5"/);
  assert.match(component, /testId="client-website" className="lg:col-start-2 lg:row-start-5"/);
  assert.equal((component.match(/testId="client-economic-activity"/g) ?? []).length, 1);
  assert.equal((component.match(/testId="client-number-employees"/g) ?? []).length, 1);
  assert.equal((component.match(/<HubImage /g) ?? []).length, 1);
  assert.match(component, /clients\.form\.observation/);
  assert.match(component, /data-testid="client-note" className="min-h-32 resize-y"/);
  assert.match(component, /lg:col-span-3 lg:row-start-6/);
});

test("WhatsApp remains an accessible boolean with an immediate localized Yes/No presentation", () => {
  assert.match(component, /<HubSwitch[\s\S]*?testId="client-whatsapp"/);
  assert.match(component, /aria-labelledby="client-whatsapp-label client-whatsapp-value"/);
  assert.match(component, /onCheckedChange=\{\(checked\) => updateValue\("isCellPhoneWhatsapp", checked\)\}/);
  assert.match(component, /t\(values\.isCellPhoneWhatsapp \? "common\.yes" : "common\.no"\)/);
  assert.match(component, /HubSwitch/);
});

test("Client authorization comes from grants and keeps HubImage shared", () => {
  const adminRoleWithoutClientClaims = { role: ["Admin"], permissions: { Clients: [] } };
  const partialClientClaims = { Clients: ["GetPaged", "GetBy", "Create"] };
  assert.equal(hasClaimPermission(adminRoleWithoutClientClaims.permissions, "Clients", "Delete"), false);
  assert.equal(hasClaimPermission(partialClientClaims, "Clients", "Update"), false);
  assert.equal(hasClaimPermission(partialClientClaims, "Clients", "Create"), true);
  assert.match(component, /hasPermission\("Clients", "(GetPaged|GetBy|Create|Update|Activate|Deactivate|Delete)"\)/);
  assert.match(component, /CLIENT_STATUS_DOMAIN_ID/);
  assert.match(component, /clients\.form\.observation/);
  assert.match(component, /data-testid="client-cancel"[\s\S]*?onClick=\{cancelForm\}/);
  assert.doesNotMatch(component, /roles\.some|decodeJwt|jwtDecode/);
  assert.match(component, /<HubImage urlImage=\{values\.urlImage\}/);
});
