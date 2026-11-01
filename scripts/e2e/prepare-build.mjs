import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nextEnvPath = resolve(repoRoot, "next-env.d.ts");
const e2eBuildDir = ".next-e2e";
const environment = { ...process.env, NEXT_DIST_DIR: e2eBuildDir };
const canonicalNextEnv = await readFile(nextEnvPath);
const startedAt = performance.now();
const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "npm";
const args = isWindows ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];

console.log(`[E2E] Developer artifact preparation: NEXT_DIST_DIR=${e2eBuildDir} npm run build`);

let buildExitCode = 1;
try {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  buildExitCode = result.status ?? 1;
} finally {
  const generatedNextEnv = await readFile(nextEnvPath);
  if (!generatedNextEnv.equals(canonicalNextEnv)) {
    await writeFile(nextEnvPath, canonicalNextEnv);
    console.log("[E2E] restored next-env.d.ts to its pre-build canonical state");
  } else {
    console.log("[E2E] next-env.d.ts unchanged");
  }
}

console.log(`[E2E] artifact preparation ${buildExitCode === 0 ? "complete" : "failed"} (${((performance.now() - startedAt) / 1000).toFixed(1)}s)`);
process.exitCode = buildExitCode;
