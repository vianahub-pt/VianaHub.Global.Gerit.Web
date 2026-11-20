import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const layout = read("app/(workspace)/layout.tsx");
const controls = read("domains/workspace/workspace-header-controls.tsx");
const preferencesProvider = read("domains/identity/preferences/preferences-provider.tsx");
const preferencesHook = read("domains/identity/preferences/use-user-preferences.ts");
const shell = read("shared/layout/workspace-shell.tsx");
const nav = read("shared/layout/hub-nav.tsx");

test("authenticated layout shares one identity-preferences instance with Header and pages", () => {
  assert.match(layout, /<IdentityPreferencesProvider>[\s\S]*<WorkspaceShell headerControls=\{<WorkspaceHeaderControls \/>\}>/);
  assert.match(preferencesProvider, /const preferences = useUserPreferences\(\)/);
  assert.match(preferencesProvider, /IdentityPreferencesContext\.Provider value=\{preferences\}/);
  assert.match(preferencesProvider, /useContext\(IdentityPreferencesContext\)/);
  assert.equal((preferencesProvider.match(/useUserPreferences\(\)/g) ?? []).length, 1);
  const consumerHook = preferencesProvider.split("export function useIdentityPreferences()")[1];
  assert.ok(consumerHook);
  assert.doesNotMatch(consumerHook, /useUserPreferences\(\)/);
});

test("global Header uses HubSelect and the canonical persisted preference actions", () => {
  assert.match(controls, /import \{ HubSelect \} from "@\/shared\/ui"/);
  assert.match(controls, /SUPPORTED_LANGUAGES\.map/);
  assert.match(controls, /variant="compact"/);
  assert.match(controls, /preferences\.setLocale\(value as Language\)/);
  assert.match(controls, /preferences\.setAppearance\(isDark \? "light" : "dark"\)/);
  assert.match(controls, /testId="workspace-language-select"/);
  assert.match(controls, /aria-label=\{isDark \? t\("workspace\.toggleThemeToLight"\) : t\("workspace\.toggleThemeToDark"\)\}/);
  assert.doesNotMatch(controls, /setTheme\(/);
  assert.match(controls, /preferences\.saveStatus === "error"/);
  assert.match(controls, /variant: "destructive"/);
});

test("theme and language actions update both the preference state and their global providers", () => {
  assert.match(preferencesHook, /setAppearance: \(appearance: AppearancePreference\) => \{\s*setTheme\(appearance\);\s*dispatch\(\{ type: "SET_APPEARANCE", payload: appearance \}\);/);
  assert.match(preferencesHook, /setLocale: \(locale: PreferenceLocale\) => \{\s*setTranslationLocale\(locale\);\s*dispatch\(\{ type: "SET_LOCALE", payload: locale \}\);/);
  assert.match(preferencesHook, /payloadString === lastSyncedPayloadRef\.current/);
});

test("WorkspaceShell exposes Header controls without a second theme implementation", () => {
  assert.match(shell, /headerControls\?: ReactNode/);
  assert.match(shell, /\{headerControls\}/);
  assert.doesNotMatch(shell, /data-testid="theme-toggle"|setTheme\(/);
  assert.match(shell, /resolvedTheme/);
  assert.match(nav, /min-w-0 flex-1/);
  assert.match(nav, /shrink-0 items-center/);
});

test("all supported locales provide language labels and theme actions", () => {
  const locales = ["pt-PT", "pt-BR", "en-US", "es-ES"];
  for (const locale of locales) {
    const messages = JSON.parse(read(`locales/${locale}/common.json`));
    for (const language of locales) assert.ok(messages[`language.short.${language}`], `${locale}: missing ${language}`);
    assert.ok(messages["workspace.toggleThemeToDark"], `${locale}: missing dark theme action`);
    assert.ok(messages["workspace.toggleThemeToLight"], `${locale}: missing light theme action`);
  }
});
