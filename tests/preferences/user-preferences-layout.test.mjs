import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preferences = readFileSync("domains/identity/preferences/user-preferences-page.tsx", "utf8");
const client = readFileSync("domains/operations/clients/clients-v1.tsx", "utf8");

test("Preferences uses the Client content margins, header, tabs spacing, and surface tokens", () => {
  const clientContent = "gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6";
  const clientHeader = "mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between";
  const clientSurface = "rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]";

  assert.ok(client.includes(clientContent));
  assert.ok(preferences.includes(clientContent));
  assert.ok(client.includes(clientHeader));
  assert.ok(preferences.includes(clientHeader));
  assert.ok(client.includes(clientSurface));
  assert.equal((preferences.match(/rounded-sm border border-border\/80 bg-surface p-6 shadow-\[0_10px_30px_rgba\(0,0,0,0\.08\)\]/g) ?? []).length, 4);
  assert.match(preferences, /<HubTabs[\s\S]*?renderPanel=\{false\}\s*\/>/);
  assert.doesNotMatch(preferences, /renderPanel=\{false\}\s+className=/);
  assert.doesNotMatch(preferences, /rounded-\[(?:1\.|2\.|3\.)/);
});

test("Preferences keeps all groups, controlled state, autosave, and accessibility hooks", () => {
  for (const group of ["preferences-theme-card", "preferences-language-card", "preferences-schedule-card", "preferences-notifications-card"]) {
    assert.ok(preferences.includes(group), `missing ${group}`);
  }
  for (const preservedBehavior of [
    "preferences.setActiveTab(tabId)",
    "preferences.setAppearance(",
    "preferences.setLocale(",
    "preferences.setCurrencyCode(",
    "preferences.setTimezone",
    "preferences.setDateFormat(",
    "preferences.setTimeFormat(",
    "preferences.setDayStart}",
    "preferences.setDayEnd}",
    "preferences.toggleEmailNotification(item.key)",
    'role="radiogroup"',
    'role="radio"',
    'role="status"',
    'aria-live="polite"',
  ]) assert.ok(preferences.includes(preservedBehavior), `missing behavior ${preservedBehavior}`);
  assert.match(preferences, /HubSwitch[\s\S]*?onCheckedChange=\{\(nextChecked\)[\s\S]*?preferences\.toggleEmailNotification\(item\.key\)/);
});
