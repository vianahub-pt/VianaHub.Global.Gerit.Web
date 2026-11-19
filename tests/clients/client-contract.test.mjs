import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClientsQuery,
  CLIENT_INITIAL_STATUS_DEFINITION_ID,
  CLIENT_STATUS_DOMAIN_ID,
  resolveClientStatusDefinitionId,
  initialClientFormValues,
  isClientUpdateSuccess,
  normalizeClientDetail,
  normalizeClientPage,
  normalizeCreatedClientId,
  toClientPayload,
  validateClientForm,
} from "../../domains/operations/clients/client-contract.ts";
import { readFile } from "node:fs/promises";

const baseForm = {
  ...initialClientFormValues(),
  partyTypeId: "1",
  acquisitionSourceTypeId: "3",
  name: "Ada Lovelace",
};

test("paged Client query follows API filter and pagination names", () => {
  const query = buildClientsQuery({ search: " Ada ", status: "all", page: 2, pageSize: 20, sortBy: "Name", sortDirection: "desc" });
  assert.equal(query.get("Search"), "Ada");
  assert.equal(query.get("PageNumber"), "2");
  assert.equal(query.get("PageSize"), "20");
  assert.equal(query.get("SortBy"), "Name");
  assert.equal(query.get("SortDirection"), "desc");
  assert.equal(query.has("IsActive"), false);
  assert.equal(buildClientsQuery({ search: "", status: "active", page: 1, pageSize: 10, sortBy: "PhoneNumber", sortDirection: "asc" }).get("IsActive"), "true");
  assert.equal(buildClientsQuery({ search: "", status: "inactive", page: 1, pageSize: 10, sortBy: "PhoneNumber", sortDirection: "asc" }).get("IsActive"), "false");
});

test("Client list and detail normalize the official flat read DTOs", () => {
  const page = normalizeClientPage({
    items: [{ id: 9, partyTypeName: "Pessoa singular", name: "Ada", phoneNumber: null, isActive: true }],
    pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1,
  });
  assert.deepEqual(page?.items[0], { id: 9, partyTypeName: "Pessoa singular", name: "Ada", phoneNumber: null, isActive: true });
  assert.deepEqual(normalizeClientPage({ items: [{ id: 10, partyTypeName: "Pessoa singular", name: "Ada", isActive: true }], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 })?.items[0], { id: 10, partyTypeName: "Pessoa singular", name: "Ada", phoneNumber: null, isActive: true });
  assert.equal(normalizeClientPage({ items: [{}], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 }), null);

  const detail = normalizeClientDetail({
    id: 9, tenantId: 2, tenant: "tenant", partyTypeId: 1, partyType: "Pessoa singular",
    acquisitionSourceTypeId: 3, acquisitionSourceType: "Google",
    name: "Ada Lovelace", isCellPhoneWhatsapp: false,


    statusDefinitionId: 4, statusDefinitionName: "Potencial", statusDomainId: 1,
    statusDomainName: "Cliente", isActive: true, createdAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(detail?.partyTypeId, 1);
  assert.equal(detail?.phoneNumber, null);
  assert.equal(detail?.companyRegistrationNumber, null);
  assert.equal(detail?.partyTypeName, "Pessoa singular");
  assert.equal(detail?.statusDefinitionId, 4);
  assert.equal(normalizeClientDetail({ id: 9, partyTypeId: 1 }), null);
});

test("Individual payload has only official fields and no legacy or tenant values", () => {
  const payload = toClientPayload({ ...baseForm, phoneNumber: " +351 210 ", birthDate: "1990-01-02", gender: "X", nationality: "PT", urlImage: "", note: " note " });
  assert.deepEqual(payload, {
    partyTypeId: 1, acquisitionSourceTypeId: 3, urlImage: null, note: "note", name: "Ada Lovelace",
    phoneNumber: "+351 210", cellPhoneNumber: null, isCellPhoneWhatsapp: false, email: null, websiteUrl: null,
    birthDate: "1990-01-02", gender: "X", nationality: "PT", companyRegistrationNumber: null,
    economicActivityCode: null, numberOfEmployees: null, statusDefinitionId: CLIENT_INITIAL_STATUS_DEFINITION_ID,
    statusDomainId: CLIENT_STATUS_DOMAIN_ID,
  });
  assert.equal("isActive" in payload, false);
  assert.equal("tenantId" in payload, false);
  assert.equal("individual" in payload || "company" in payload || "tradeName" in payload || "legalRepresentative" in payload || "score" in payload, false);
});

test("Organization payload clears incompatible individual values and keeps canonical properties", () => {
  const payload = toClientPayload({
    ...baseForm, partyTypeId: "2", name: "Acme Ltd", companyRegistrationNumber: "123",
    economicActivityCode: "6201", numberOfEmployees: "8", birthDate: "", gender: "", nationality: "",
    statusDefinitionId: "1",
  });
  assert.equal(payload.partyTypeId, 2);
  assert.equal(payload.name, "Acme Ltd");
  assert.equal(payload.companyRegistrationNumber, "123");
  assert.equal(payload.economicActivityCode, "6201");
  assert.equal(payload.numberOfEmployees, 8);
  assert.equal(payload.birthDate, null);
  assert.equal(payload.gender, null);
  assert.equal(payload.nationality, null);
  assert.deepEqual(Object.keys(payload).sort(), [
    "acquisitionSourceTypeId", "birthDate", "cellPhoneNumber", "companyRegistrationNumber", "economicActivityCode",
    "email", "gender", "isCellPhoneWhatsapp", "name", "nationality", "numberOfEmployees", "note", "partyTypeId",
    "phoneNumber", "statusDefinitionId", "statusDomainId", "urlImage", "websiteUrl",
  ].sort());
});

test("form validation matches Client API constraints and party consistency", () => {
  assert.equal(validateClientForm(baseForm, "create"), null);
  assert.equal(validateClientForm({ ...baseForm, name: "" }, "create"), "name");
  assert.equal(validateClientForm({ ...baseForm, name: "A".repeat(501) }, "create"), "name");
  assert.equal(validateClientForm({ ...baseForm, urlImage: "x".repeat(501) }, "create"), "urlImage");
  assert.equal(validateClientForm({ ...baseForm, note: "x".repeat(1001) }, "create"), "note");
  assert.equal(validateClientForm({ ...baseForm, birthDate: "2999-01-01" }, "update"), "birthDate");
  assert.equal(validateClientForm({ ...baseForm, numberOfEmployees: "-1" }, "update"), "numberOfEmployees");
  assert.equal(validateClientForm({ ...baseForm, partyTypeId: "1", companyRegistrationNumber: "123" }, "update"), "partyTypeConsistency");
  assert.equal(validateClientForm({ ...baseForm, partyTypeId: "2", gender: "X" }, "update"), "partyTypeConsistency");
  assert.equal(validateClientForm({ ...baseForm, note: "x".repeat(1001) }, "update"), null);
});

test("create ID and boolean PUT response follow endpoint contracts", () => {
  assert.equal(normalizeCreatedClientId({ id: 42 }), 42);
  assert.equal(normalizeCreatedClientId({ id: "42" }), null);
  assert.equal(isClientUpdateSuccess(true), true);
  assert.equal(isClientUpdateSuccess(false), false);
  assert.equal(isClientUpdateSuccess({ id: 42 }), false);
});

test("Client create defaults to Potential and updates preserve a valid existing business status", () => {
  assert.equal(resolveClientStatusDefinitionId("create"), 4);
  assert.equal(resolveClientStatusDefinitionId("update", { statusDefinitionId: 6, statusDomainId: 1 }), 6);
  assert.equal(resolveClientStatusDefinitionId("update", { statusDefinitionId: 4, statusDomainId: 2 }), null);
  assert.equal(resolveClientStatusDefinitionId("update", { statusDefinitionId: null, statusDomainId: 1 }), null);
  const existingStatusPayload = toClientPayload({ ...baseForm, statusDefinitionId: "6" });
  assert.equal(existingStatusPayload.statusDefinitionId, 6);
  assert.equal(existingStatusPayload.statusDomainId, 1);
});

test("WhatsApp remains a boolean in the Client payload", () => {
  assert.equal(toClientPayload({ ...baseForm, isCellPhoneWhatsapp: true }).isCellPhoneWhatsapp, true);
  assert.equal(toClientPayload({ ...baseForm, isCellPhoneWhatsapp: false }).isCellPhoneWhatsapp, false);
});
test("Client lifecycle uses a bodyless IsActive endpoint and does not write business status", async () => {
  const source = await readFile(new URL("../../domains/operations/clients/client-api.ts", import.meta.url), "utf8");
  assert.match(source, /const operation = active \? "activate" : "deactivate"/);
  assert.match(source, /\/\$\{clientId\}\/\$\{operation\}.*method: "PATCH"/s);
  assert.match(source, /setClientActive[\s\S]*?method: "PATCH"/);
  assert.doesNotMatch(source, /setClientActive[\s\S]*?body:/);
});
