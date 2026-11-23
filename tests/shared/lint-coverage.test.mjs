import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ESLint } from "eslint";
import { LINT_IGNORES } from "../../eslint.config.mjs";

const requiredSourceDirectories = [
  "app",
  "components",
  "lib",
  "src",
  "domains",
  "platform",
  "shared",
  "core",
  "hooks",
];

test("lint covers application source directories and keeps React purity enabled", async () => {
  const packageJson = await import("../../package.json", { with: { type: "json" } });
  assert.equal(packageJson.default.scripts.lint, "eslint .");

  for (const directory of requiredSourceDirectories) {
    assert.ok(existsSync(new URL(`../../${directory}/`, import.meta.url)), `${directory} must exist`);
    assert.ok(
      !LINT_IGNORES.some((pattern) => pattern === `${directory}/**` || pattern === `**/${directory}/**`),
      `${directory} must not be excluded from lint`,
    );
  }

  for (const generatedPath of [
    "**/node_modules/**",
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".e2e-debug/**",
    "logs/**",
    "playwright/.auth/**",
    "next-env.d.ts",
  ]) {
    assert.ok(LINT_IGNORES.includes(generatedPath), `${generatedPath} must be explicitly ignored`);
  }

  const eslint = new ESLint();
  const sidebarConfig = await eslint.calculateConfigForFile("components/ui/sidebar.tsx");
  assert.equal(sidebarConfig.rules["react-hooks/purity"][0], 2);
});
