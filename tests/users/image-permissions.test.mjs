import assert from "node:assert/strict";
import { test } from "node:test";
import { hasClaimPermission } from "../../platform/auth/permission-claims.ts";
import {
  IMAGE_PICKER_MAX_SIZE_BYTES,
  validateImageFile,
} from "../../shared/ui/image-picker-utils.ts";

test("API lowercase permission claims match case-insensitively without granting absent actions", () => {
  const permissions = { users: ["create", "update"] };
  assert.equal(hasClaimPermission(permissions, "Users", "Create"), true);
  assert.equal(hasClaimPermission(permissions, "USERS", "update"), true);
  assert.equal(hasClaimPermission(permissions, "Users", "Delete"), false);
  assert.equal(hasClaimPermission({}, "Users", "Create"), false);
  assert.equal(hasClaimPermission({ Users: null }, "Users", "Create"), false);
});

test("image selection validates supported MIME types and file size", () => {
  assert.equal(validateImageFile({ type: "image/png", size: 1024 }), "valid");
  assert.equal(validateImageFile({ type: "image/jpeg", size: IMAGE_PICKER_MAX_SIZE_BYTES }), "valid");
  assert.equal(validateImageFile({ type: "image/svg+xml", size: 100 }), "unsupported-type");
  assert.equal(validateImageFile({ type: "image/webp", size: IMAGE_PICKER_MAX_SIZE_BYTES + 1 }), "too-large");
  assert.equal(validateImageFile({ type: "image/webp", size: 0 }), "too-large");
});
test("image picker keeps a controlled value without exposing an image URL editor", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../shared/ui/image-picker.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /type="url"|users\.form\.urlImage|users\.image\.urlHelp/);
  assert.match(source, /value: string/);
  assert.match(source, /onChange: \(value: string\) => void/);
  assert.match(source, /onChange\(""\)/);
  assert.match(source, /URL\.createObjectURL\(pendingFile\)/);
  assert.match(source, /URL\.revokeObjectURL\(objectUrl\)/);
});
