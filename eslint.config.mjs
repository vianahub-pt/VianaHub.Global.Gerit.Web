import nextCoreWebVitalsConfig from "eslint-config-next/core-web-vitals";

// Next 15 used react-hooks 5.2.0. Keep its rules-of-hooks/exhaustive-deps
// baseline while making React 19's purity check explicit under the Next 16
// plugin. Adopt the other React Hooks 7 diagnostics separately, after review.
const reactHooksV7OnlyRules = new Set([
  "react-hooks/static-components",
  "react-hooks/use-memo",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/incompatible-library",
  "react-hooks/immutability",
  "react-hooks/globals",
  "react-hooks/refs",
  "react-hooks/set-state-in-effect",
  "react-hooks/error-boundaries",
  "react-hooks/set-state-in-render",
  "react-hooks/unsupported-syntax",
  "react-hooks/config",
  "react-hooks/gating",
]);

const nextCoreWebVitals = nextCoreWebVitalsConfig.map((config) => {
  if (!config.rules) return config;
  return {
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules).filter(([rule]) => !reactHooksV7OnlyRules.has(rule)),
    ),
  };
});

export const LINT_IGNORES = Object.freeze([
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
]);

const config = [
  { ignores: LINT_IGNORES },
  ...nextCoreWebVitals,
  {
    files: ["tests/e2e/fixtures/**/*.ts"],
    // Playwright's fixture callback is named `use`; it is not a React Hook.
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];

export default config;
