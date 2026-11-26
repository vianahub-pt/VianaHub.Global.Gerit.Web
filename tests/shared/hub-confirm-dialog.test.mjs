import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const component = read("shared/ui/hub-confirm-dialog.tsx");
const adapter = read("shared/ui/confirm-dialog.tsx");
const barrel = read("shared/ui/index.ts");

test("HubConfirmDialog exposes a capability-independent controlled API", () => {
  for (const property of [
    "open: boolean",
    "onOpenChange: (open: boolean) => void",
    "title: React.ReactNode",
    "description: React.ReactNode",
    "confirmLabel: React.ReactNode",
    "cancelLabel: React.ReactNode",
    "onConfirm: () => void | Promise<void>",
    "variant?: HubConfirmDialogVariant",
    "loading?: boolean",
    "disabled?: boolean",
  ]) assert.ok(component.includes(property), "missing " + property);

  assert.ok(component.includes('type HubConfirmDialogVariant = "default" | "destructive"'));
  assert.ok(component.includes('from "@/shared/ui/alert-dialog"'));
  assert.doesNotMatch(component, /fetchWithAuth|useTranslation|hubConfirmDialog|Actions|Teams|Clients|Users/);
  assert.ok(barrel.includes("export { HubConfirmDialog }"));
});

test("HubConfirmDialog preserves real focus movement and native action activation", () => {
  for (const behavior of [
    "cancelRef.current?.focus()",
    "onCloseAutoFocus",
    "returnFocusTarget.focus()",
    'event.key !== "ArrowLeft" && event.key !== "ArrowRight"',
    "nextTarget.focus()",
    "focus-visible:ring-2",
    "focus:ring-2",
    "onEscapeKeyDown",

    "event.preventDefault();",
  ]) assert.ok(component.includes(behavior), "missing behavior " + behavior);
  assert.doesNotMatch(component, /aria-selected/);
  assert.ok(component.includes("target !== cancelRef.current && target !== confirmRef.current"));
});

test("HubConfirmDialog keeps async dialogs controlled and blocks duplicate destructive actions while loading", () => {
  for (const behavior of [
    "Promise.resolve(result).then(",
    'variant === "destructive" && busy',
    "if (!nextOpen && destructiveBusy) return",
    "disabled={destructiveBusy}",
    "disabled={disabled || busy}",
    "if (disabled || busy || confirmLock.current) return",
  ]) assert.ok(component.includes(behavior), "missing behavior " + behavior);
  assert.ok(adapter.includes("HubConfirmDialog"));
  assert.ok(adapter.includes("useTranslation"));
  assert.ok(adapter.includes('t("clients.actions.confirm")'));
  assert.ok(adapter.includes('t("clients.actions.cancel")'));
  assert.ok(adapter.includes('testId = "confirm-dialog"'));
  assert.ok(adapter.includes("props.onOpenChange(false)"), "legacy ConfirmDialog keeps closing after confirmation");
});

test("legacy adapter keeps localized defaults and direct HubConfirmDialog consumers provide labels", () => {
  const expectedLabels = {
    "pt-PT": ["Cancelar", "Confirmar"],
    "pt-BR": ["Cancelar", "Confirmar"],
    "en-US": ["Cancel", "Confirm"],
    "es-ES": ["Cancelar", "Confirmar"],
  };
  for (const [locale, [cancel, confirm]] of Object.entries(expectedLabels)) {
    const dictionary = JSON.parse(read("locales/" + locale + "/common.json"));
    assert.equal(dictionary["clients.actions.cancel"], cancel, locale + " has a localized cancel label");
    assert.equal(dictionary["clients.actions.confirm"], confirm, locale + " has a localized confirm label");
    assert.ok(!("hubConfirmDialog.cancel" in dictionary), locale + " has no generic cancel key");
    assert.ok(!("hubConfirmDialog.confirm" in dictionary), locale + " has no generic confirm key");
  }

  for (const path of ["domains/operations/teams/teams-page.tsx", "domains/operations/teams/team-form-page.tsx"]) {
    const consumer = read(path);
    assert.match(consumer, /<HubConfirmDialog[\s\S]*?confirmLabel=/, path + " provides confirmLabel");
    assert.match(consumer, /<HubConfirmDialog[\s\S]*?cancelLabel=/, path + " provides cancelLabel");
  }

  const legacyConsumer = read("domains/operations/clients/clients-create.tsx");
  assert.match(legacyConsumer, /<ConfirmDialog[\s\S]*?description=[\s\S]*?onConfirm=/, "legacy consumers without explicit labels remain supported by adapter defaults");
});
