import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const form = await readFile(new URL("../../domains/operations/roles/role-form-page.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../../domains/operations/roles/roles-page.tsx", import.meta.url), "utf8");
const contract = await readFile(new URL("../../domains/operations/roles/roles-contract.ts", import.meta.url), "utf8");

test("Roles form uses the published responsive layout and left-aligned footer actions", () => {
  assert.match(form, /sm:grid-cols-12/);
  assert.match(form, /sm:col-span-8 md:col-span-10/);
  assert.match(form, /sm:col-span-4 md:col-span-2/);
  assert.match(form, /sm:col-span-12/);
  assert.match(form, /flex flex-wrap justify-start gap-3/);
  assert.match(form, /<HubSwitch[\s\S]*?checked=\{formIsActive\}[\s\S]*?onCheckedChange=\{setFormIsActive\}/);
  assert.match(form, /<HubConfirmDialog[\s\S]*?variant="destructive"[\s\S]*?onConfirm=\{deleteRole\}/);
  assert.match(form, /ArrowLeft/);
  assert.match(form, /Trash2/);
  assert.match(form, /Save/);
  assert.match(form, /Loader2/);
});

test("Role name is immutable on update and form save never calls lifecycle PATCH", () => {
  assert.match(form, /disabled=\{submitting \|\| deleteSubmitting \|\| editing \|\| !access\.create\}/);
  assert.match(form, /method: editing \? "PUT" : "POST"/);
  assert.doesNotMatch(form, /method:\s*"PATCH"/);
  assert.match(contract, /return \{\s*description: description\.trim\(\),\s*isActive,/);
  assert.doesNotMatch(contract.match(/export function toRoleUpdatePayload[\s\S]*?\n}/)?.[0] ?? "", /name\s*:/i);
});

test("Roles list gates each route and mutation by its operation grant", () => {
  assert.match(list, /buildRoleAccess\(authRoles, hasPermission\)/);
  assert.match(list, /access\.getBy \? <button/);
  assert.match(list, /access\.create \? <button/);
  assert.match(list, /access\.bulkUpload \? <label/);
  assert.match(list, /role\.isActive \? access\.deactivate : access\.activate/);
  assert.match(list, /access\.delete \? <button/);
  assert.match(list, /access\.getPaged \? <HubGrid/);
  assert.match(list, /new FormData\(\)/);
  assert.match(list, /roles\/bulk-upload/);
  assert.match(list, /file\.name\.toLowerCase\(\)\.endsWith\("\.csv"\)/);
  assert.match(contract, /roles\.some\(\(role\) => ROLE_MANAGER_ROLES\.has\(role\.trim\(\)\.toLowerCase\(\)\)\)/);
});

test("all supported locales include the new Roles validation and authorization strings", async () => {
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"]) {
    const dictionary = JSON.parse(await readFile(new URL(`../../locales/${locale}/common.json`, import.meta.url), "utf8"));
    for (const key of ["roles.validation.nameTooLong", "roles.validation.descriptionRequired", "roles.validation.descriptionTooLong", "roles.errors.permissionDenied", "roles.errors.conflict", "roles.errors.notFound"]) {
      assert.equal(typeof dictionary[key], "string", `${locale} missing ${key}`);
      assert.ok(dictionary[key].length > 0, `${locale} empty ${key}`);
    }
  }
});
