import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export function resolveCapabilitySpecPaths(slugs, repoRoot) {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    throw new Error("Provide one or more capability slugs using lowercase letters, digits, and single hyphens.");
  }

  const canonicalDirectory = resolve(repoRoot, "tests", "e2e");
  return slugs.map((slug) => {
    const nativeSpecPath = resolve(canonicalDirectory, `${slug}-journey.spec.ts`);
    if (!nativeSpecPath.startsWith(`${canonicalDirectory}${sep}`) || !existsSync(nativeSpecPath)) {
      throw new Error(`Canonical journey not found for capability '${slug}'.`);
    }
    return relative(repoRoot, nativeSpecPath).split(sep).join("/");
  });
}
