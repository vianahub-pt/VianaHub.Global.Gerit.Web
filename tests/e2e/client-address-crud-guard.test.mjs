import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyClientAddressCrudRequest, validateCrudApproval, validateQaIdentityClaims, validateSyntheticAddressPayload } from "../../scripts/e2e/client-address-crud-guard.mjs";

const origin = "http://127.0.0.1:3100";
const clientId = 4242;
const userId = "9001";
const tenantId = "1";
const createdAddressIds = new Set([8402]);
function classify(method, pathname, extra = {}) {
  return classifyClientAddressCrudRequest({ pathname, method, origin, allowedOrigin: origin, clientId, expectedUserId: userId, expectedTenantId: tenantId, createdAddressIds, ...extra });
}

test("allows only exact create and mutations for the run-created address", () => {
  assert.equal(classify("POST", "/api/gerit/v1/clients/4242/addresses", { createdAddressIds: new Set() }), "allow-create");
  assert.equal(classify("PUT", "/api/gerit/v1/clients/4242/addresses/8402"), "allow-update");
  assert.equal(classify("PATCH", "/api/gerit/v1/clients/4242/addresses/8402/deactivate"), "allow-lifecycle");
  assert.equal(classify("DELETE", "/api/gerit/v1/clients/4242/addresses/8402"), "allow-delete");
  assert.equal(classify("GET", "/api/gerit/v1/clients/paged"), "allow-read");
  assert.equal(classify("GET", "/api/gerit/v1/clients/4242/addresses/paged"), "allow-read");
  assert.equal(classify("GET", "/api/gerit/v1/clients/4242/addresses/8402"), "allow-read");
  assert.equal(classify("GET", "/api/gerit/v1/address-types"), "allow-read");
});

test("blocks mutations to other clients, pre-existing addresses, repeated creates, unknown verbs, and unrelated reads", () => {
  assert.equal(classify("PUT", "/api/gerit/v1/clients/4242/addresses/99"), "block");
  assert.equal(classify("DELETE", "/api/gerit/v1/clients/7777/addresses/8402"), "block");
  assert.equal(classify("POST", "/api/gerit/v1/clients/4242/addresses"), "block");
  assert.equal(classify("POST", "/api/gerit/v1/clients/4242/addresses", { createdAddressIds: new Set(), createAttempted: true }), "block");
  assert.equal(classify("OPTIONS", "/api/gerit/v1/clients/4242/addresses/8402"), "block");
  assert.equal(classify("POST", "/api/gerit/v1/clients/4242/addresses/8402/bulk-upload"), "block");
  for (const path of ["/submit", "/auth/login", "/server-action", "/api/other-resource/write"]) {
    assert.equal(classify("POST", path), "block", `unexpected write path ${path}`);
    assert.equal(classify("PATCH", path), "block", `unexpected patch path ${path}`);
  }
  assert.equal(classify("PATCH", "/api/gerit/v1/clients/4242/addresses/8402/activate/extra"), "block");
  assert.equal(classify("GET", "/api/gerit/v1/roles"), "block");
  assert.equal(classify("GET", "/api/gerit/v1/clients/7777"), "block");
});

test("blocks off-origin, encoded, slash, case and traversal variants", () => {
  assert.equal(classifyClientAddressCrudRequest({ pathname: "/api/gerit/v1/clients/4242/addresses/8402", method: "DELETE", origin: "https://gerit-api.vianahub.pt", allowedOrigin: origin, clientId, createdAddressIds }), "block");
  for (const path of [
    "/api/gerit/v1/clients/4242/addresses/8402%2f..%2f99",
    "/api//gerit/v1/clients/4242/addresses/8402",
    "/api/gerit/v1/clients/4242/addresses/8402/../99",
    "/API/gerit/v1/clients/4242/addresses/8402",
    "/api\\gerit\\v1\\clients\\4242\\addresses\\8402",
  ]) assert.equal(classify("DELETE", path), "block", path);
});

test("authentication write exception is limited to exact login and refresh POST", () => {
  assert.equal(classify("POST", "/api/auth/login"), "allow-authentication");
  assert.equal(classify("POST", "/api/auth/refresh/"), "allow-authentication");
  assert.equal(classify("PUT", "/api/auth/login"), "block");
  assert.equal(classify("POST", "/api/auth/login/extra"), "block");
});

test("QA CRUD remains globally disabled while prior cleanup is unverified", () => {
  const policy = JSON.parse(readFileSync("scripts/e2e/environment-policy.json", "utf8"));
  assert.equal(policy.clientAddressCrudQaEnabled, false);
  const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
  assert.match(playwrightConfig, /E2E_CLIENT_ADDRESS_MODE === "qa"/);
  assert.match(playwrightConfig, /policy\.clientAddressCrudQaEnabled !== true/);
});

test("QA requires explicit run approval, verified cleanup, and the configured Client, user and tenant", () => {
  const approvalId = "9c2a4cb1-011f-4d19-8a3d-62b81bf8a829";
  const base = { mode: "qa", clientId: "4242", approvalId, approvalValue: `4242:${approvalId}`, mutatingApproved: true, allowedClientId: "4242", expectedUserId: userId, expectedTenantId: tenantId, platform: "win32", ci: "false" };
  assert.equal(validateCrudApproval(base).allowed, false, "cleanup policy defaults closed");
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true }).allowed, true);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, mutatingApproved: false }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, allowedClientId: "4243" }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, expectedUserId: "" }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, expectedTenantId: "" }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, approvalValue: "true" }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, platform: "linux" }).allowed, false);
  assert.equal(validateCrudApproval({ ...base, qaExecutionEnabled: true, ci: "true" }).allowed, false);
  assert.equal(validateCrudApproval({ mode: "mocked", platform: "win32", ci: "false" }).allowed, true);
  assert.equal(validateCrudApproval({ mode: "mocked", platform: "win32", ci: "true" }).allowed, false);
});

test("authenticated QA identity must match the configured user, tenant and email", () => {
  const claims = { sub: "9001", tenant_id: "1", email: "qa-user@example.invalid" };
  const expected = { expectedUserId: userId, expectedTenantId: tenantId, expectedEmail: "QA-User@example.invalid" };
  assert.equal(validateQaIdentityClaims(claims, expected), true);
  assert.equal(validateQaIdentityClaims({ ...claims, tenant_id: "2" }, expected), false);
  assert.equal(validateQaIdentityClaims({ ...claims, sub: "9002" }, expected), false);
  assert.equal(validateQaIdentityClaims({ ...claims, email: "other@example.invalid" }, expected), false);
  assert.equal(validateQaIdentityClaims(null, expected), false);
});

test("one synthetic create must carry the unique marker and remain non-primary", () => {
  const marker = "E2E-CA-9c2a4cb1-011f-4d19-8a3d-62b81bf8a829";
  assert.equal(validateSyntheticAddressPayload({ street: marker, isPrimary: false }, marker), true);
  assert.equal(validateSyntheticAddressPayload({ street: marker, isPrimary: true }, marker), false);
  assert.equal(validateSyntheticAddressPayload({ street: "other", isPrimary: false }, marker), false);
  assert.equal(validateSyntheticAddressPayload({ street: marker, isPrimary: false }, "E2E-CA-not-a-uuid"), false);
});