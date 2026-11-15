import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUsersQuery,
  isUserPhoneNumberLengthValid,
  isUserUpdateSuccess,
  normalizeCreatedUserId,
  normalizeUserDetail,
  normalizeUserPage,
  toUserCreatePayload,
  toUserPasswordPayload,
  toUserUpdatePayload,
  validatePassword,
  validateUserImageUrl,
} from "../../domains/operations/users/users-contract.ts";

const queryBase = {
  search: "  alex@example.test ", status: "all", page: 2, pageSize: 20,
  sortBy: "LastAccessAt", sortDirection: "desc",
};

test("All omits IsActive and query uses supported API parameter names", () => {
  const query = buildUsersQuery(queryBase);
  assert.equal(query.has("IsActive"), false);
  assert.equal(query.toString().includes("IsActive="), false);
  assert.equal(query.get("Search"), "alex@example.test");
  assert.equal(query.get("PageNumber"), "2");
  assert.equal(query.get("PageSize"), "20");
  assert.equal(query.get("SortBy"), "LastAccessAt");
  assert.equal(query.get("SortDirection"), "desc");
});

test("Active and Inactive send boolean IsActive values", () => {
  assert.equal(buildUsersQuery({ ...queryBase, status: "active" }).get("IsActive"), "true");
  assert.equal(buildUsersQuery({ ...queryBase, status: "inactive" }).get("IsActive"), "false");
});

test("create and update payloads match current API DTOs without tenant data", () => {
  const create = toUserCreatePayload(" Ada Lovelace ", " ada@example.test ", "Aa1!secret", "Aa1!secret", "+351 910 000 000", "https://example.test/ada.png");
  const update = toUserUpdatePayload(" Ada Byron ", " ada@example.test ", " +351 210 000 000 ", "https://example.test/ada-new.png");
  assert.deepEqual(create, {
    name: "Ada Lovelace", email: "ada@example.test", password: "Aa1!secret", confirmPassword: "Aa1!secret",
    phoneNumber: "+351 910 000 000", urlImage: "https://example.test/ada.png",
  });
  assert.deepEqual(Object.keys(create).sort(), ["confirmPassword", "email", "name", "password", "phoneNumber", "urlImage"]);
  assert.deepEqual(update, {
    name: "Ada Byron", email: "ada@example.test", phoneNumber: "+351 210 000 000",
    urlImage: "https://example.test/ada-new.png",
  });
  assert.deepEqual(Object.keys(update).sort(), ["email", "name", "phoneNumber", "urlImage"]);
  assert.equal(Object.keys(update).some((key) => /^(password|passwordhash)$/i.test(key)), false);
  assert.deepEqual(toUserCreatePayload("Ada", "ada@example.test", "Aa1!secret", "Aa1!secret", "", ""), {
    name: "Ada", email: "ada@example.test", password: "Aa1!secret", confirmPassword: "Aa1!secret",
    phoneNumber: null, urlImage: null,
  });
  assert.deepEqual(toUserUpdatePayload("Ada", "ada@example.test", "", ""), {
    name: "Ada", email: "ada@example.test", phoneNumber: null, urlImage: null,
  });
  const password = toUserPasswordPayload("OldAa1!", "NewAa1!");
  assert.deepEqual(password, { currentPassword: "OldAa1!", newPassword: "NewAa1!" });
  for (const payload of [create, update, password]) {
    assert.equal("tenantId" in payload || "TenantId" in payload, false);
    assert.equal("x-tenant-id" in payload, false);
  }
});

test("list and detail normalization include API fields and omit technical display fields", () => {
  const page = normalizeUserPage({
    items: [{ id: 7, name: "Ada", email: "ada@example.test", phoneNumber: null, lastAccessAt: null, isActive: true }],
    pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1,
  });
  assert.deepEqual(page?.items[0], {
    id: 7, name: "Ada", email: "ada@example.test", phoneNumber: null, lastAccessAt: null, isActive: true,
  });
  assert.equal(normalizeUserPage({ items: [{}], pageNumber: 1, pageSize: 10, totalItems: 1, totalPages: 1 }), null);

  const detail = normalizeUserDetail({
    id: 7, name: "Ada", email: "ada@example.test", phoneNumber: null, lastAccessAt: null, isActive: true,
    urlImage: "https://example.test/ada.png", isDeleted: false, createdBy: 2,
    createdAt: "2026-01-01T00:00:00Z", modifiedBy: null, modifiedAt: null,
  });
  assert.deepEqual(detail, {
    id: 7, name: "Ada", email: "ada@example.test", phoneNumber: null, lastAccessAt: null, isActive: true,
    urlImage: "https://example.test/ada.png", isDeleted: false, createdBy: 2,
    createdAt: "2026-01-01T00:00:00Z", modifiedBy: null, modifiedAt: null,
  });
  assert.equal(normalizeUserDetail({ id: 7, name: "Ada" }), null);
});

test("create ID and boolean update response are validated against HTTP contracts", () => {
  assert.equal(normalizeCreatedUserId({ id: 42 }), 42);
  assert.equal(normalizeCreatedUserId({ id: "42" }), null);
  assert.equal(normalizeCreatedUserId({ id: 0 }), null);
  assert.equal(isUserUpdateSuccess(true), true);
  assert.equal(isUserUpdateSuccess(false), false);
  assert.equal(isUserUpdateSuccess({ id: 42 }), false);
});

test("password and image validation match API constraints", () => {
  assert.equal(validatePassword("Aa1!abcd"), true);
  assert.equal(validatePassword("Aa1!abc"), false);
  assert.equal(validatePassword("AA1!ABCD"), false);
  assert.equal(validatePassword("Aa1abcde"), false);
  assert.equal(validateUserImageUrl(""), true);
  assert.equal(validateUserImageUrl("https://example.test/user.png"), true);
  assert.equal(validateUserImageUrl("javascript:alert(1)"), false);
  assert.equal(validateUserImageUrl("https://user:pass@example.test/image.png"), false);
});

test("image URL is preserved when unchanged, removal maps to null, and local URLs are rejected", () => {
  assert.equal(toUserUpdatePayload("Ada", "ada@example.test", "+351 210 000 000", "https://example.test/existing.png").urlImage, "https://example.test/existing.png");
  assert.equal(toUserUpdatePayload("Ada", "ada@example.test", "+351 210 000 000", "").urlImage, null);
  assert.equal(toUserCreatePayload("Ada", "ada@example.test", "Aa1!secret", "Aa1!secret", "", "").urlImage, null);
  assert.equal(validateUserImageUrl("blob:https://example.test/id"), false);
  assert.equal(validateUserImageUrl("data:image/png;base64,abc"), false);
});

test("phone number length follows separate create and update API limits", () => {
  assert.equal(isUserPhoneNumberLengthValid("1".repeat(20), true), true);
  assert.equal(isUserPhoneNumberLengthValid("1".repeat(21), true), false);
  assert.equal(isUserPhoneNumberLengthValid("1".repeat(50), false), true);
  assert.equal(isUserPhoneNumberLengthValid("1".repeat(51), false), false);
});
