import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const input = read("shared/ui/input.tsx");
const select = read("shared/ui/select.tsx");
const textarea = read("shared/ui/textarea.tsx");
const toggle = read("shared/ui/hub-switch.tsx");
const tabs = read("shared/ui/hub-tabs.tsx");
const client = read("domains/operations/clients/clients-v1.tsx");
const legacyClientFields = read("domains/operations/clients/clients-form-components.tsx");
const preferences = read("domains/identity/preferences/user-preferences-page.tsx");
const remainingTextareaPages = [
  "domains/operations/teams/team-form-page.tsx",
  "domains/operations/roles/role-form-page.tsx",
  "domains/operations/actions/action-form-page.tsx",
].map(read);
const barrel = read("shared/ui/index.ts");

test("shared field components expose consistent tokens and HubSelect is public", () => {
  for (const token of ["h-12", "rounded-[12px]", "border-border", "bg-card", "px-4", "text-sm", "text-foreground", "focus-visible:ring-2", "disabled:opacity-50"]) assert.ok(input.includes(token), `Input missing ${token}`);
  assert.match(barrel, /export \{ HubSelect \} from "@\/shared\/ui\/hub-select"/);
  assert.doesNotMatch(barrel, /NativeSelect|SelectTrigger|SelectContent|SelectItem/);
  for (const token of ["h-12", "rounded-[12px]", "border-border", "bg-card", "px-4", "text-sm", "text-foreground", "focus-visible:ring-2", "disabled:opacity-50"]) {
    assert.ok(select.includes(token), `Radix Select controls missing ${token}`);
  }
  assert.match(select, /data-\[state=checked\]:bg-primary\/10 data-\[state=checked\]:text-primary/);
});

test("Textarea shares field states but keeps a multiline minimum height and resize", () => {
  assert.match(textarea, /controlClasses\.replace\("h-12", "min-h-24"\)/);
  assert.match(textarea, /resize-y/);
  for (const token of ["border-destructive", "focus-visible:ring", "disabled:opacity-50", "read-only:bg-muted"]) assert.ok(input.includes(token));
});

test("Teams, Roles and Actions retain the shared multiline field", () => {
  for (const page of remainingTextareaPages) {
    assert.match(page, /import \{ Textarea \} from "@\/shared\/ui\/textarea"/);
    assert.match(page, /<Textarea[\s\S]*?rows=\{3\}/);
    assert.doesNotMatch(page, /<textarea/);
  }
});

test("HubSwitch exposes a controlled accessible boolean with visible focus and on/off styling", () => {
  assert.match(toggle, /checked: boolean/);
  assert.match(toggle, /onCheckedChange: \(checked: boolean\) => void/);
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked=\{checked\}/);
  assert.match(toggle, /onCheckedChange\(event\.currentTarget\.checked\)/);
  assert.match(toggle, /peer-focus-visible:ring-2/);
  assert.match(toggle, /checked \? "bg-primary" : "bg-muted"/);
  assert.match(toggle, /checked && "translate-x-5"/);
  assert.match(toggle, /peer-disabled:opacity-50|disabled && "cursor-not-allowed opacity-50"/);
  assert.match(barrel, /HubSwitch/);
});

test("Preferences keeps callbacks and shared tabs/switch", () => {
  assert.match(preferences, /HubSelect, HubSwitch, HubTabs/);
  assert.match(preferences, /value=\{value\}[\s\S]*?onValueChange=\{onChange\}[\s\S]*?options=\{options\}/);
  assert.match(preferences, /<HubSwitch/);
  assert.match(preferences, /preferences\.toggleEmailNotification\(item\.key\)/);
  assert.match(preferences, /preferences\.setActiveTab\(tabId\)/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{isActive\}/);
  assert.match(tabs, /border-b-2 border-transparent/);
  assert.match(tabs, /ArrowRight/);
  assert.match(tabs, /ArrowLeft/);
  assert.match(tabs, /event\.key === "Home"/);
  assert.match(tabs, /event\.key === "End"/);
  assert.match(tabs, /tabRefs\.current\.get\(next\.id\)\?\.focus\(\)/);
  assert.match(tabs, /aria-disabled=\{tab\.disabled \|\| undefined\}/);
  assert.match(client, /<HubTabs<ClientTab>/);
  assert.match(preferences, /<HubTabs/);
});

test("Preferences tab navigation keeps the controlled state callback", () => {
  assert.match(preferences, /activeTab=\{preferences\.state\.activeTab\}/);
  assert.match(preferences, /preferences\.setActiveTab\(tabId\)/);
  assert.match(preferences, /preferences-tabs-tab-\$\{preferences\.state\.activeTab\}/);
});

test("Client V1 and legacy Client fields both use HubSelect and preserve callbacks", () => {
  assert.match(client, /HubImage, HubSelect, HubSwitch, HubTabs/);
  assert.match(client, /<HubSelect[\s\S]*?onValueChange=\{onChange\}[\s\S]*?required=\{required\}/);
  assert.match(legacyClientFields, /import \{ HubSelect \} from "@\/shared\/ui"/);
  assert.match(legacyClientFields, /<HubSelect[\s\S]*?onValueChange=\{onChange\}[\s\S]*?options=\{options\}/);
  assert.doesNotMatch(client, /NativeSelect|<select/);
  assert.doesNotMatch(legacyClientFields, /SelectTrigger|SelectContent|SelectItem|<select/);
  assert.match(client, /<HubSwitch[\s\S]*?checked=\{values\.isCellPhoneWhatsapp\}[\s\S]*?onCheckedChange=\{\(checked\) => updateValue\("isCellPhoneWhatsapp", checked\)\}/);
  assert.match(client, /values\.isCellPhoneWhatsapp \? "common\.yes" : "common\.no"/);
  assert.doesNotMatch(client, /data-testid="client-whatsapp" type="checkbox"/);
  const toggleField = legacyClientFields.split("/* ---------- Form field component ---------- */")[0];
  assert.match(toggleField, /<HubSwitch[\s\S]*?checked=\{checked\}[\s\S]*?onCheckedChange=\{onChange\}/);
  assert.ok(toggleField.includes('aria-labelledby={labelId + " " + valueId}'));
  assert.ok(toggleField.includes("{checked ? onLabel : offLabel}"));
});
