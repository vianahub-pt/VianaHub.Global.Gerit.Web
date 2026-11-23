import test from "node:test";
import assert from "node:assert/strict";
import { classifyReadOnlyApiRequest } from "../../scripts/e2e/read-only-api-guard.mjs";

test("read-only QA API guard allows only exact login/session posts and business reads", () => {
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/auth/login", method: "POST" }), "allow-authentication");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/auth/refresh", method: "post" }), "allow-authentication");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/gerit/v1/clients/paged", method: "GET" }), "allow-business-read");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/gerit/v1/address-types/", method: "HEAD" }), "allow-business-read");
});

test("read-only QA API guard blocks business writes, unknown API calls and auth variations", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/gerit/v1/clients/7/addresses", method }), "block");
  }
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/gerit/v1/clients/7/addresses/bulk-upload", method: "POST" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/unrecognized/resource", method: "GET" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/auth/login/", method: "PUT" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/api/auth/other", method: "POST" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/API/gerit/v1/clients", method: "GET" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/%61pi/gerit/v1/clients", method: "GET" }), "block");
  assert.equal(classifyReadOnlyApiRequest({ pathname: "/login/", method: "GET" }), "outside-api");
});
