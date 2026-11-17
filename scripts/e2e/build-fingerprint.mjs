import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const e2eBuildDir = ".next-e2e";
export const e2eManifestPath = resolve(repoRoot, e2eBuildDir, "e2e-build-manifest.json");

function includedRepoFiles(root) {
  const listing = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "buffer",
  }).toString("utf8");
  return [...new Set(listing.split("\0").filter(Boolean))]
    .map((item) => item.replaceAll("\\", "/"))
    .filter((item) => !item.startsWith(".next") &&
      !item.startsWith("node_modules/") &&
      !item.startsWith("playwright-report/") &&
      !item.startsWith("test-results/") &&
      !item.startsWith(".git/") &&
      !/^\.env(?:\.|$)/i.test(item))
    .sort();
}

export async function computeSourceFingerprint(root = repoRoot) {
  const hash = createHash("sha256");
  for (const relativePath of includedRepoFiles(root)) {
    hash.update(relativePath);
    hash.update("\0");
    try {
      hash.update(await readFile(resolve(root, relativePath)));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        hash.update("[missing]");
      } else {
        throw error;
      }
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function writeE2EBuildManifest(apiBaseUrl, root = repoRoot) {
  const fingerprint = await computeSourceFingerprint(root);
  const apiOrigin = new URL(apiBaseUrl).origin;
  const manifest = {
    schemaVersion: 1,
    sourceFingerprint: fingerprint,
    apiOrigin,
    builtAtUtc: new Date().toISOString(),
  };
  await writeFile(resolve(root, e2eBuildDir, "e2e-build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

export async function validateE2EBuild(apiBaseUrl, root = repoRoot) {
  const manifestPath = resolve(root, e2eBuildDir, "e2e-build-manifest.json");
  if (!existsSync(manifestPath)) return { current: false, reason: "build-manifest-missing" };
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return { current: false, reason: "build-manifest-invalid" };
  }
  if (manifest.schemaVersion !== 1 || typeof manifest.sourceFingerprint !== "string") {
    return { current: false, reason: "build-manifest-invalid" };
  }
  if (manifest.apiOrigin !== new URL(apiBaseUrl).origin) {
    return { current: false, reason: "build-api-origin-mismatch" };
  }
  if (manifest.sourceFingerprint !== await computeSourceFingerprint(root)) {
    return { current: false, reason: "source-fingerprint-mismatch" };
  }
  return { current: true, reason: "source-and-api-match" };
}
