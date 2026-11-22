import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientContactPersonQuery,
  clientContactPersonFormFromDetail,
  initialClientContactPersonFormValues,
  normalizeClientContactPersonDetail,
  normalizeClientContactPersonPage,
  toClientContactPersonPayload,
  validateClientContactPersonForm,
} from "../../domains/operations/clients/client-contact-person-contract.ts";

const baseDetail = {
  id: 7, clientId: 42, name: "Synthetic Contact", email: "synthetic@example.invalid",
  phoneNumber: null, cellPhoneNumber: "+351900000001", isWhatsapp: true,
  isCellPhoneWhatsapp: true, jobTitle: "Advisor", department: null, isPrimary: true,
  isActive: true, createdAt: "2026-01-01T00:00:00Z",
};

test("Client contact normalization rejects wrong Client scope and malformed entries", () => {
  assert.equal(normalizeClientContactPersonDetail(baseDetail, 42)?.id, 7);
  assert.equal(normalizeClientContactPersonDetail(baseDetail, 43), null);
  assert.equal(normalizeClientContactPersonPage({ items: [{}], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 }), null);
  assert.equal(normalizeClientContactPersonPage({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0, totalPages: 0 })?.totalItems, 0);
});

test("Client contact query uses paged API names and explicit lifecycle filtering", () => {
  const query = buildClientContactPersonQuery({ search: " Synthetic ", status: "inactive", page: 2, pageSize: 20, sortDirection: "desc" });
  assert.equal(query.get("Search"), "Synthetic");
  assert.equal(query.get("PageNumber"), "2");
  assert.equal(query.get("PageSize"), "20");
  assert.equal(query.get("SortBy"), "Name");
  assert.equal(query.get("SortDirection"), "desc");
  assert.equal(query.get("IsActive"), "false");
  assert.equal(buildClientContactPersonQuery({ search: "", status: "all", page: 1, pageSize: 10, sortDirection: "asc" }).has("IsActive"), false);
});

test("form enforces API-required fields and WhatsApp phone dependency", () => {
  const empty = initialClientContactPersonFormValues();
  assert.equal(validateClientContactPersonForm(empty), "nameRequired");
  assert.equal(validateClientContactPersonForm({ ...empty, name: "Synthetic", email: "not-an-email" }), "emailInvalid");
  assert.equal(validateClientContactPersonForm({ ...empty, name: "Synthetic", email: "synthetic@example.invalid", hasCellPhoneWhatsapp: true }), "cellPhoneRequiredForWhatsapp");
  assert.equal(validateClientContactPersonForm({ ...empty, name: "Synthetic", email: "synthetic@example.invalid", cellPhoneNumber: "+351900000001", hasCellPhoneWhatsapp: true }), null);
});

test("serializer maps the single WhatsApp control to both API aliases and omits tenant", () => {
  const form = clientContactPersonFormFromDetail(baseDetail);
  const payload = toClientContactPersonPayload(form);
  assert.equal(payload.isWhatsapp, true);
  assert.equal(payload.isCellPhoneWhatsapp, true);
  assert.equal("tenantId" in payload, false);
  assert.equal(payload.email, "synthetic@example.invalid");
});
