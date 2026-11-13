import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCapabilitySpecPaths } from "./capability-specs.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[E2E capability] ${message}`);
  process.exit(1);
}

const slugs = process.argv.slice(2);
let specPaths;
try {
  specPaths = resolveCapabilitySpecPaths(slugs, repoRoot);
} catch (error) {
  fail(error instanceof Error ? error.message : "Invalid E2E capability selection.");
}

let playwrightCli;
try {
  const packageJsonPath = require.resolve("@playwright/test/package.json");
  const packageMetadata = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const cliEntry = packageMetadata.bin?.playwright;
  if (typeof cliEntry !== "string" || cliEntry.length === 0) {
    throw new Error("Installed @playwright/test metadata does not declare a Playwright CLI.");
  }
  playwrightCli = resolve(dirname(packageJsonPath), cliEntry);
} catch (error) {
  fail(`Unable to resolve the installed Playwright CLI (${error instanceof Error ? error.message : "package metadata unavailable"}).`);
}

const child = spawn(process.execPath, [playwrightCli, "test", ...specPaths, "--project=journey"], {
  cwd: repoRoot,
  env: process.env,
  shell: false,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`[E2E capability] Failed to start Playwright (${error.message}).`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
