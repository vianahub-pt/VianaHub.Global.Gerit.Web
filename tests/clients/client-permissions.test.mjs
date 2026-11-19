import test from "node:test";
import assert from "node:assert/strict";
import { missingRequiredPermissionGrants } from "../e2e/helpers/permission-claims.ts";

const requiredClientActions = ["GetPaged", "GetBy", "Create", "Update", "Activate", "Deactivate", "Delete"];
const fullClientClaims = {
  role: ["BackOffice"],
  permissions: { Clients: requiredClientActions },
};

test("Client authorization accepts an allowed role with every required action grant", () => {
  assert.deepEqual(
    missingRequiredPermissionGrants(fullClientClaims, "Clients", ["Admin", "BackOffice"], requiredClientActions),
    [],
  );
});

test("Client authorization fails closed when claims, role, resource, or any required action is missing", () => {
  assert.deepEqual(
    missingRequiredPermissionGrants(null, "Clients", ["Admin", "BackOffice"], requiredClientActions),
    ["permission claims"],
  );
  assert.deepEqual(
    missingRequiredPermissionGrants(
      { ...fullClientClaims, role: ["Manager"] },
      "Clients",
      ["Admin", "BackOffice"],
      requiredClientActions,
    )[0],
    "Admin/BackOffice role",
  );
  assert.deepEqual(
    missingRequiredPermissionGrants(
      { role: ["Admin"], permissions: { Clients: ["GetPaged", "Create"] } },
      "Clients",
      ["Admin", "BackOffice"],
      requiredClientActions,
    ),
    ["GetBy", "Update", "Activate", "Deactivate", "Delete"],
  );
});
