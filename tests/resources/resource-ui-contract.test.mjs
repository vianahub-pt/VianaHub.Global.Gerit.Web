import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const form = readFileSync(new URL("../../domains/operations/resources/resource-form-page.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../../domains/operations/resources/resources-page.tsx", import.meta.url), "utf8");
const locales = ["pt-PT", "pt-BR", "en-US", "es-ES"];

test("Resources form follows the Actions grid and the API name limit", () => {
  assert.match(form, /grid grid-cols-1 gap-6 sm:grid-cols-12/);
  assert.match(form, /sm:col-span-8 md:col-span-10/);
  assert.match(form, /sm:col-span-4 md:col-span-2/);
  assert.match(form, /sm:col-span-12/);
  assert.match(form, /maxLength=\{100\}/);
  assert.match(form, /name\.length > 100/);
  assert.match(form, /flex flex-wrap justify-start gap-3/);
  assert.match(form, /\["admin", "backoffice", "manager"\]/);
  assert.match(form, /hasPermission\("Resources", "Create"\)/);
});

test("Resources list uses the API paged, lifecycle, delete and CSV endpoints", () => {
  assert.match(page, /\/api\/gerit\/v1\/resources\/paged/);
  assert.match(page, /\/api\/gerit\/v1\/resources\/\$\{resource\.id\}\/\$\{operation\}/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /\/api\/gerit\/v1\/resources\/bulk-upload/);
  assert.match(page, /body\.append\("file", file\)/);
  for (const action of ["GetPaged", "GetBy", "Create", "Activate", "Deactivate", "Delete", "BulkUpload"]) {
    assert.match(page, new RegExp(`hasPermission\\("Resources", "${action}"\\)`));
  }
  assert.match(page, /!loading && !access\.getPaged/);
  assert.doesNotMatch(page, /\/api\/gerit\/v1\/actions/);
});

test("all supported locales define the Resources UI strings and 100-character limit", () => {
  for (const locale of locales) {
    const messages = JSON.parse(readFileSync(new URL(`../../locales/${locale}/common.json`, import.meta.url), "utf8"));
    for (const key of ["resources.title", "resources.actions.add", "resources.form.name", "resources.validation.fields", "resources.confirm.delete", "resources.bulk.upload.label", "resources.errors.permissionDenied"]) {
      assert.equal(typeof messages[key], "string", `${locale} is missing ${key}`);
    }
    assert.match(messages["resources.validation.fields"], /100/);
  }
});
