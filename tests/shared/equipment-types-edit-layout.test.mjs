import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("domains/operations/equipment-types/equipment-type-form-page.tsx", "utf8");
const contract = readFileSync("domains/operations/equipment-types/equipment-types-contract.ts", "utf8");

test("EquipmentTypes edit form omits metadata presentation and keeps the basic CRUD controls", () => {
  assert.doesNotMatch(page, /equipmentTypes\.detail\.(metadata|idLabel|createdAtLabel)|equipment-type-created-at|equipment-type-id|dateLabel|createdDate/);
  assert.match(page, /id="equipment-type-name"/);
  assert.match(page, /id="equipment-type-description"/);
  for (const key of ["equipmentTypes.actions.back", "equipmentTypes.actions.save", "equipmentTypes.actions.activate", "equipmentTypes.actions.deactivate", "equipmentTypes.actions.delete"]) {
    assert.ok(page.includes(key), `missing ${key}`);
  }
  for (const permission of ["canUpdate", "canActivate", "canDeactivate", "canDelete"]) assert.ok(page.includes(permission));
  assert.match(page, /normalizeEquipmentTypeDetail/);
});

test("EquipmentTypes keeps ID and CreatedAt in its API detail contract", () => {
  assert.match(contract, /id:\s*number/);
  assert.match(contract, /createdAt:\s*string/);
  assert.match(contract, /Number\.isInteger\(value\.id\)/);
  assert.match(contract, /typeof value\.createdAt !== "string"/);
});
