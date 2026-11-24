import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const api = readFileSync(resolve("domains/operations/clients/client-address-api.ts"), "utf8");
const contract = readFileSync(resolve("domains/operations/clients/client-address-contract.ts"), "utf8");

test("ClientAddress API client uses the verified routes, methods and response guards", () => {
  assert.match(api, /\/api\/gerit\/v1\/clients\/.*\/addresses/);
  assert.match(api, /"\/paged\?" \+ query\.toString\(\)/);
  assert.match(api, /"\/api\/gerit\/v1\/address-types"/);
  assert.match(api, /method: "GET", cache: "no-store"/);
  assert.match(api, /method: "POST"[\s\S]*JSON\.stringify\(payload\)/);
  assert.match(api, /method: "PUT"[\s\S]*JSON\.stringify\(payload\)/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /method: "DELETE"/);
  assert.match(api, /\/bulk-upload/);
  assert.match(api, /if \(!Number\.isInteger\(value\) \|\| value <= 0\)/);
  assert.match(api, /response\.ok/);
  assert.match(api, /response\.json\(\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(contract, /tenantId|TenantId/);
});

test("ClientAddress CSV upload is multipart and appends the selected file under the API field name", () => {
  assert.match(api, /const form = new FormData\(\); form\.append\("file", file\)/);
  assert.ok(api.includes('path(clientId) + "/bulk-upload"'));
});
