import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("domains/operations/equipment-types/equipment-type-form-page.tsx", "utf8");
const contract = readFileSync("domains/operations/equipment-types/equipment-types-contract.ts", "utf8");
const list = readFileSync("domains/operations/equipment-types/equipment-types-page.tsx", "utf8");
const locales = ["pt-PT", "pt-BR", "en-US", "es-ES"];

test("EquipmentTypes form follows the responsive Actions form contract", () => {
  assert.doesNotMatch(page, /equipmentTypes\.detail\.(metadata|idLabel|createdAtLabel)|equipment-type-created-at|equipment-type-id|dateLabel|createdDate/);
  assert.match(page, /id="equipment-type-name"/);
  assert.match(page, /id="equipment-type-description"/);
  assert.match(page, /grid grid-cols-1 gap-6 sm:grid-cols-12/);
  assert.match(page, /sm:col-span-8 md:col-span-10/);
  assert.match(page, /sm:col-span-4 md:col-span-2/);
  assert.match(page, /w-full sm:col-span-12/);
  assert.match(page, /<HubSwitch[\s\S]*?checked=\{formIsActive\}[\s\S]*?onCheckedChange=\{setFormIsActive\}/);
  assert.match(page, /flex flex-wrap justify-start gap-3/);
  assert.match(page, /<ArrowLeft[\s\S]*?equipmentTypes\.actions\.back[\s\S]*?<Trash2[\s\S]*?equipmentTypes\.actions\.delete[\s\S]*?<Save[\s\S]*?equipmentTypes\.actions\.save/);
  assert.match(page, /<HubConfirmDialog[\s\S]*?variant="destructive"[\s\S]*?loading=\{deleteSubmitting\}/);
  for (const key of ["equipmentTypes.actions.back", "equipmentTypes.actions.save", "equipmentTypes.actions.delete"]) {
    assert.ok(page.includes(key), `missing ${key}`);
  }
  for (const permission of ["canUpdate", "canCreate", "canDelete"]) assert.ok(page.includes(permission));
  assert.match(page, /currentItem\.isActive \? "equipmentTypes\.status\.active" : "equipmentTypes\.status\.inactive"/);
  assert.doesNotMatch(page, /equipmentTypes\.actions\.(activate|deactivate)/);
  assert.doesNotMatch(page, /method:\s*"PATCH"/);
  assert.match(page, /normalizeEquipmentTypeDetail/);
  assert.match(page, /router\.push\("\/equipment-types\/"\)/);
  assert.doesNotMatch(page, /router\.push\(`\/equipment-types\/\$\{/);
  assert.match(page, /useState\(true\)/);
  assert.match(page, /setFormIsActive\(detail\.isActive\)/);
  assert.match(page, /submitLock\.current = true/);
  assert.match(page, /method: editing \? "PUT" : "POST"/);
  assert.match(page, /toEquipmentTypePayload\(name, description, formIsActive\)/);
  assert.match(page, /if \(editing\)[\s\S]*?response\.status !== 204[\s\S]*?router\.push\("\/equipment-types\/"\)/);
  assert.match(page, /response\.status !== 201[\s\S]*?router\.push\("\/equipment-types\/"\)/);
  assert.match(page, /response\.status === 204 \? null : await response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(page, /catch \(error\)[\s\S]*?equipmentTypes\.toasts\.errorTitle/);
  assert.match(page, /disabled=\{submitting \|\| deleteSubmitting \|\| \(editing \? !canUpdate : !canCreate\)\}/);
  assert.match(list, /method: "PATCH"/);
  assert.match(list, /hasPermission\("EquipmentTypes", "Activate"\)/);
  assert.match(list, /hasPermission\("EquipmentTypes", "Deactivate"\)/);
});

test("EquipmentTypes keeps ID and CreatedAt in its API detail contract", () => {
  assert.match(contract, /id:\s*number/);
  assert.match(contract, /createdAt:\s*string/);
  assert.match(contract, /Number\.isInteger\(value\.id\)/);
  assert.match(contract, /typeof value\.createdAt !== "string"/);
});

test("EquipmentTypes reuses translated form, status, and toast labels in every locale", () => {
  const paths = [
    ["equipmentTypes", "actions", "back"],
    ["equipmentTypes", "actions", "delete"],
    ["equipmentTypes", "actions", "save"],
    ["equipmentTypes", "form", "subtitle"],
    ["equipmentTypes", "status", "active"],
    ["equipmentTypes", "status", "inactive"],
    ["equipmentTypes", "table", "status"],
    ["equipmentTypes", "toasts", "successTitle"],
    ["equipmentTypes", "toasts", "created"],
    ["equipmentTypes", "toasts", "updated"],
  ];
  for (const locale of locales) {
    const translations = JSON.parse(readFileSync(`locales/${locale}/common.json`, "utf8"));
    for (const path of paths) {
      const value = translations[path.join(".")];
      assert.equal(typeof value, "string", `${locale} is missing ${path.join(".")}`);
      assert.notEqual(value.trim(), "", `${locale} has an empty ${path.join(".")}`);
    }
  }
});
