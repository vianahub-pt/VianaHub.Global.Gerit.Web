import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const component = read("shared/ui/hub-select.tsx");
const primitives = read("shared/ui/select.tsx");

test("HubSelect has a generic typed, controlled/uncontrolled public contract", () => {
  for (const expression of [
    /export interface HubSelectOption/, /value: string/, /label: ReactNode/, /disabled\?: boolean/,
    /export interface HubSelectProps/, /value\?: string/, /defaultValue\?: string/,
    /onValueChange\?: \(value: string\) => void/, /placeholder\?: string/, /required\?: boolean/,
    /name\?: string/, /id\?: string/, /ariaLabel\?: string/, /description\?: ReactNode/,
    /error\?: ReactNode/, /variant\?: HubSelectVariant/, /searchable\?: boolean/, /preserveOptionOrder\?: boolean/, /searchText\?: string/, /sortLabel\?: string/,
  ]) assert.match(component, expression);
  assert.match(component, /value !== undefined \? \{ value \} : \{\}/);
  assert.match(component, /searchable = true/);
  assert.match(component, /if \(searchable\)/);
  assert.match(component, /sortHubSelectOptionsByLocalizedName/);
  assert.match(component, /defaultValue !== undefined \? \{ defaultValue \} : \{\}/);
});

test("HubSelect delegates portal, positioning and options to the existing Radix primitives", () => {
  assert.match(component, /from "@\/shared\/ui\/select"/);
  assert.match(component, /<SelectContent className=\{contentClassName\}>/);
  assert.match(component, /options\.map\(\(option\)/);
  assert.match(component, /disabled=\{option\.disabled\}/);
  assert.match(primitives, /import \* as SelectPrimitive from "@radix-ui\/react-select"/);
  assert.match(primitives, /<SelectPrimitive\.Portal>/);
  assert.match(primitives, /position = "popper"/);
  assert.match(primitives, /data-\[highlighted\]:bg-accent data-\[highlighted\]:text-accent-foreground/);
  assert.match(primitives, /data-\[state=checked\]:bg-primary\/10/);
  assert.match(primitives, /data-\[state=checked\]:text-primary/);
  assert.match(primitives, /<SelectPrimitive\.ItemIndicator>/);
});

test("HubSelect supplies accessible labels, required/disabled/error states and default/compact variants", () => {
  assert.match(component, /htmlFor=\{controlId\}/);
  assert.match(component, /aria-labelledby=\{label \? labelId : undefined\}/);
  assert.match(component, /aria-describedby=\{describedBy \|\| undefined\}/);
  assert.match(component, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(component, /aria-required=\{required \|\| undefined\}/);
  assert.match(component, /role="combobox"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /variant === "compact"/);
  assert.doesNotMatch(component, /clients|equipmentTypes|preferences|actions|users|fetchWithAuth|\/api\//i);
});

test("HubSelect is adopted by every current eligible select consumer", () => {
  const login = read("platform/auth/login-screen.tsx");
  const preferences = read("domains/identity/preferences/user-preferences-page.tsx");
  const grid = read("shared/hub-grid/hub-grid.tsx");
  const client = read("domains/operations/clients/clients-v1.tsx");
  const legacyClient = read("domains/operations/clients/clients-form-components.tsx");
  for (const source of [login, preferences, grid, client, legacyClient]) assert.match(source, /HubSelect/);
  for (const source of [login, preferences, grid, client, legacyClient]) {
    assert.doesNotMatch(source, /NativeSelect|SelectTrigger|SelectContent|SelectItem|SelectValue|<select/);
  }
});
