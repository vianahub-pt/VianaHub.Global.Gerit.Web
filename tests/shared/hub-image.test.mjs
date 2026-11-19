import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  HUB_IMAGE_ACCEPTED_TYPES,
  HUB_IMAGE_MAX_SIZE_BYTES,
  validateHubImageFile,
} from "../../shared/ui/hub-image-utils.ts";

test("HubImage validates supported MIME types and the 5 MB limit", () => {
  assert.deepEqual(HUB_IMAGE_ACCEPTED_TYPES, ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(HUB_IMAGE_MAX_SIZE_BYTES, 5 * 1024 * 1024);
  assert.equal(validateHubImageFile({ type: "image/png", size: 1024 }), "valid");
  assert.equal(validateHubImageFile({ type: "image/jpeg", size: HUB_IMAGE_MAX_SIZE_BYTES }), "valid");
  assert.equal(validateHubImageFile({ type: "image/svg+xml", size: 100 }), "unsupported-type");
  assert.equal(validateHubImageFile({ type: "image/webp", size: HUB_IMAGE_MAX_SIZE_BYTES + 1 }), "too-large");
  assert.equal(validateHubImageFile({ type: "image/webp", size: 0 }), "too-large");
});

test("HubImage exposes only generic UrlImage and pending-file props; previews stay temporary", async () => {
  const source = await readFile(new URL("../../shared/ui/hub-image.tsx", import.meta.url), "utf8");
  assert.match(source, /export interface HubImageProps/);
  assert.match(source, /urlImage: string/);
  assert.match(source, /onUrlImageChange: \(urlImage: string\) => void/);
  assert.match(source, /pendingFile: File \| null/);
  assert.match(source, /onPendingFileChange: \(file: File \| null\) => void/);
  assert.match(source, /URL\.createObjectURL\(pendingFile\)/);
  assert.match(source, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(source, /const displayedUrl = previewUrl \?\? urlImage/);
  assert.doesNotMatch(source, /onUrlImageChange\(previewUrl\)|type="url"|users\.|clients\.|\/api\//i);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
});

test("shared translations define every HubImage state in all supported locales", async () => {
  const keys = [
    "hubImage.title", "hubImage.choose", "hubImage.replace", "hubImage.remove",
    "hubImage.empty", "hubImage.previewAlt", "hubImage.loading", "hubImage.loaded",
    "hubImage.loadError", "hubImage.invalidType", "hubImage.tooLarge",
    "hubImage.selected", "hubImage.uploadUnavailable", "hubImage.dropHint", "hubImage.dropZoneLabel",
  ];
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"]) {
    const translations = JSON.parse(await readFile(new URL("../../locales/" + locale + "/common.json", import.meta.url), "utf8"));
    for (const key of keys) assert.equal(typeof translations[key], "string", locale + " is missing " + key);
    assert.equal(Object.keys(translations).some((key) => key.startsWith("users.image.")), false, locale + " retains a Users-only image namespace");
  }
});

test("shared UI publicly exports HubImage", async () => {
  const barrel = await readFile(new URL("../../shared/ui/index.ts", import.meta.url), "utf8");
  assert.match(barrel, /export \{ HubImage \} from "@\/shared\/ui\/hub-image"/);
  assert.match(barrel, /export type \{ HubImageProps \} from "@\/shared\/ui\/hub-image"/);
});
test("HubImage drop zone is clickable, keyboard accessible, validates drops, and respects disabled", async () => {
  const source = await readFile(new URL("../../shared/ui/hub-image.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid="hub-image-dropzone"[\s\S]*?role="button"/);
  assert.match(source, /aria-disabled=\{disabled\}/);
  assert.match(source, /onClick=\{openFilePicker\}/);
  assert.match(source, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(source, /onDragOver=\{handleDragOver\}[\s\S]*?onDrop=\{handleDrop\}/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /if \(!disabled\) chooseFile\(event\.dataTransfer\.files\.item\(0\)/);
  assert.match(source, /if \(!disabled\) fileInputRef\.current\?\.click\(\)/);
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(source, /<label[^>]*hubImage\.choose|hubImage\.choose\}\s*<input/);
});
