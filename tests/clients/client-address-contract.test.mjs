import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildClientAddressQuery, clientAddressFormFromDetail, initialClientAddressFormValues,
  normalizeAddressTypes, normalizeClientAddressDetail, normalizeClientAddressPage,
  toClientAddressPayload, validateClientAddressForm,
} from "../../domains/operations/clients/client-address-contract.ts";

const detail = {
  id: 12, clientId: 42, addressTypeId: 3, addressTypeName: "Billing", countryCode: "ZZ",
  street: "Synthetic Avenue", streetNumber: "7", complement: null, neighborhood: "Centre",
  city: "Porto", district: "Porto", postalCode: "4000-001", latitude: 41.15, longitude: -8.61,
  note: null, isPrimary: true, isActive: true, createdAt: "2026-01-01T00:00:00Z",
};
const addressTypes = new Set([3]);

test("ClientAddress contracts normalize exact API summaries, pages, details, and reject mismatched Client scope", () => {
  const summary = { id: 12, addressTypeName: "Billing", countryCode: "ZZ", street: "Synthetic Avenue", isPrimary: true, isActive: true };
  assert.deepEqual(normalizeClientAddressPage({ items: [summary], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 })?.items[0], summary);
  assert.equal(normalizeClientAddressPage({ items: [{}], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 }), null);
  assert.equal(normalizeClientAddressDetail(detail, 42)?.id, 12);
  assert.equal(normalizeClientAddressDetail(detail, 43), null);
  assert.deepEqual(normalizeAddressTypes([{ id: 3, name: "Billing", isActive: true }]), [{ id: 3, name: "Billing", isActive: true }]);
  assert.equal(normalizeAddressTypes([{ id: "3", name: "Billing" }]), null);
  assert.equal(normalizeAddressTypes([{ id: 3, name: "Billing" }]), null);
});

test("ClientAddress paged query uses API field names and every displayed API sort field", () => {
  const query = buildClientAddressQuery({ search: " Porto ", status: "inactive", page: 2, pageSize: 20, sortBy: "Street", sortDirection: "desc" });
  assert.equal(query.get("Search"), "Porto"); assert.equal(query.get("PageNumber"), "2");
  assert.equal(query.get("PageSize"), "20"); assert.equal(query.get("SortBy"), "Street");
  assert.equal(query.get("SortDirection"), "desc"); assert.equal(query.get("IsActive"), "false");
  const countryQuery = buildClientAddressQuery({ search: "", status: "all", page: 1, pageSize: 10, sortBy: "CountryCode", sortDirection: "asc" });
  assert.equal(countryQuery.get("SortBy"), "CountryCode");
  const panel = readFileSync(resolve("domains/operations/clients/clients-v1-addresses.tsx"), "utf8");
  assert.match(panel, /key: "Street"[^\n]*sortable: true/);
  assert.match(panel, /key: "CountryCode"[^\n]*sortable: true/);
  assert.match(panel, /key !== "Street" && key !== "CountryCode"/);
  assert.equal(buildClientAddressQuery({ search: "", status: "all", page: 1, pageSize: 10, sortBy: "Street", sortDirection: "asc" }).has("IsActive"), false);
});

test("ClientAddress validation follows API required fields, limits, coordinate pairing and ranges", () => {
  const empty = initialClientAddressFormValues();
  assert.equal(validateClientAddressForm(empty, addressTypes), "addressTypeRequired");
  const valid = { ...empty, addressTypeId: "3", countryCode: "zz", street: " Synthetic Street ", city: "Porto", postalCode: "4000" };
  assert.equal(validateClientAddressForm(valid, addressTypes), null);
  assert.equal(toClientAddressPayload(valid).countryCode, "ZZ");
  assert.equal(toClientAddressPayload(valid).street, "Synthetic Street");
  assert.equal("tenantId" in toClientAddressPayload(valid), false);
  assert.equal(validateClientAddressForm({ ...valid, latitude: "41" }, addressTypes), "coordinatesPairRequired");
  assert.equal(validateClientAddressForm({ ...valid, latitude: "91", longitude: "0" }, addressTypes), "latitudeInvalid");
  assert.equal(validateClientAddressForm({ ...valid, latitude: "0", longitude: "181" }, addressTypes), "longitudeInvalid");
  assert.equal(validateClientAddressForm({ ...valid, street: "x".repeat(201) }, addressTypes), "streetMaximumLength");
});

test("ClientAddress edit preserves unknown two-character country and complete detail values", () => {
  const form = clientAddressFormFromDetail(detail);
  assert.equal(form.countryCode, "ZZ");
  assert.equal(form.streetNumber, "7");
  assert.equal(form.latitude, "41.15");
  assert.equal(toClientAddressPayload(form).countryCode, "ZZ");
});

test("ClientAddress form fields follow the approved responsive desktop order", () => {
  const panel = readFileSync(resolve("domains/operations/clients/clients-v1-addresses.tsx"), "utf8");
  const formStart = panel.indexOf("<form ");
  const formContentStart = panel.indexOf(">", formStart) + 1;
  const formEnd = panel.indexOf("</form>", formContentStart);
  const form = formStart >= 0 && formEnd >= formContentStart ? panel.slice(formContentStart, formEnd) : null;
  assert.ok(form, "ClientAddress form should remain present");
  assert.match(form, /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3/);
  const fields = [
    'testId="client-address-addressTypeId"', 'field("street"', 'field("streetNumber"',
    'field("complement"', 'field("neighborhood"', 'field("city"', 'field("district"',
    'field("postalCode"', 'testId="client-address-countryCode"', 'field("latitude"',
    'field("longitude"', 'testId="client-address-isPrimary"', 'data-testid="client-address-note"',
  ];
  const positions = fields.map((field) => form.indexOf(field));
  assert.ok(positions.every((position) => position >= 0), "all existing fields should remain in the form");
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(form, /className="col-span-full flex[^\"]*"[^>]*><span>\{t\("clients\.addresses\.form\.note"\)\}/);
});
test("ClientAddress new labels and validation messages exist in all four supported locales", () => {
  const keys = [
    "clients.addresses.form.title", "clients.addresses.form.countryPlaceholder", "clients.addresses.form.countryLegacy",
    "clients.addresses.form.legacyType", "clients.addresses.loadingDetail", "clients.addresses.loadingTypes",
    "clients.addresses.errors.catalog", "clients.addresses.errors.unauthenticated", "clients.addresses.errors.forbidden",
    "clients.addresses.errors.conflict", "clients.addresses.errors.unavailable", "clients.addresses.errors.readPermission",
    "clients.addresses.errors.validation", "clients.addresses.validation.addressTypeRequired", "clients.addresses.validation.streetRequired",
    "clients.addresses.validation.streetMaximumLength", "clients.addresses.validation.streetNumberMaximumLength",
    "clients.addresses.validation.complementMaximumLength", "clients.addresses.validation.neighborhoodMaximumLength",
    "clients.addresses.validation.cityRequired", "clients.addresses.validation.cityMaximumLength", "clients.addresses.validation.districtMaximumLength",
    "clients.addresses.validation.postalCodeRequired", "clients.addresses.validation.postalCodeMaximumLength",
    "clients.addresses.validation.countryCodeInvalid", "clients.addresses.validation.noteMaximumLength",
    "clients.addresses.validation.coordinatesPairRequired", "clients.addresses.validation.latitudeInvalid",
    "clients.addresses.validation.longitudeInvalid",
  ];
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"]) {
    const translations = JSON.parse(readFileSync(resolve(`locales/${locale}/common.json`), "utf8"));
    for (const key of keys) assert.equal(typeof translations[key], "string", `${locale} missing ${key}`);
  }
});
