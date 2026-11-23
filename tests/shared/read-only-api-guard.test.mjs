import test from "node:test";
import assert from "node:assert/strict";
import { classifyReadOnlyApiRequest } from "../../scripts/e2e/read-only-api-guard.mjs";

const localOrigin = "http://127.0.0.1:3100";
const localRequest = (pathname, method) => classifyReadOnlyApiRequest({
  pathname,
  method,
  origin: localOrigin,
  allowedOrigin: localOrigin,
});

test("read-only guard permits only exact local authentication POSTs and same-origin business reads", () => {
  assert.equal(localRequest("/api/auth/login", "POST"), "allow-authentication");
  assert.equal(localRequest("/api/auth/login/", "POST"), "allow-authentication");
  assert.equal(localRequest("/api/auth/refresh", "post"), "allow-authentication");
  assert.equal(localRequest("/api/gerit/v1/clients/paged", "GET"), "allow-business-read");
  assert.equal(localRequest("/api/gerit/v1/address-types/", "HEAD"), "allow-business-read");
  assert.equal(localRequest("/login/", "GET"), "outside-api");
  assert.equal(localRequest("/_next/static/chunk.js", "HEAD"), "outside-api");
});

test("all non-read methods are blocked on paths both inside and outside API routes", () => {
  const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE", "PROPFIND"];
  const paths = ["/api/gerit/v1/clients/7/addresses", "/submit", "/login/", "/assets/upload", "/"];
  for (const method of mutatingMethods) {
    for (const pathname of paths) {
      assert.equal(localRequest(pathname, method), "block", `${method} ${pathname}`);
    }
  }
});

test("only exact authentication POST paths and the local origin are exempted", () => {
  for (const pathname of [
    "/api/auth/login//",
    "/API/auth/login",
    "/api/auth/login/extra",
    "/api/auth/%6cogin",
    "/%61pi/auth/login",
  ]) {
    assert.equal(localRequest(pathname, "POST"), "block", pathname);
  }
  assert.equal(classifyReadOnlyApiRequest({
    pathname: "/api/auth/login",
    method: "POST",
    origin: "https://example.invalid",
    allowedOrigin: localOrigin,
  }), "block");
  assert.equal(classifyReadOnlyApiRequest({
    pathname: "/api/gerit/v1/clients",
    method: "GET",
    origin: "https://example.invalid",
    allowedOrigin: localOrigin,
  }), "block");
});

test("API path encoding, casing, slashes and path normalization fail closed", () => {
  for (const pathname of [
    "/API/gerit/v1/clients",
    "/%61pi/gerit/v1/clients",
    "/api%2fgerit/v1/clients",
    "/%2561pi/gerit/v1/clients",
    "/%2525252561pi/gerit/v1/clients",
    "//api/gerit/v1/clients",
    "/api//gerit/v1/clients",
    "/foo/../api/gerit/v1/clients",
    "/foo/%2e%2e/api/gerit/v1/clients",
    "/api/gerit/v1/clients%2f7",
    "/api\\gerit\\v1\\clients",
    "/api/gerit/v1/clients///",
  ]) {
    assert.equal(localRequest(pathname, "GET"), "block", pathname);
  }
  assert.equal(localRequest("/api/unrecognized/resource", "GET"), "block");
  assert.equal(localRequest("/api/auth/login", "GET"), "block");
});

test("unknown API write endpoints and direct API paths never become allowed reads", () => {
  assert.equal(localRequest("/api/unrecognized/resource", "POST"), "block");
  assert.equal(classifyReadOnlyApiRequest({
    pathname: "/api/gerit/v1/clients",
    method: "GET",
    origin: "https://gerit-api.vianahub.pt",
    allowedOrigin: localOrigin,
  }), "block");
});
