import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_PREFERENCES_SWITCH_FOCUS_CLASSES } from "../../domains/identity/preferences/user-preferences-ui.ts";

test("notification switches expose a visible keyboard focus ring on the peer control", () => {
  const classes = USER_PREFERENCES_SWITCH_FOCUS_CLASSES.split(/\s+/);

  assert.ok(classes.includes("peer-focus-visible:ring-2"));
  assert.ok(classes.includes("peer-focus-visible:ring-ring"));
  assert.ok(classes.includes("peer-focus-visible:ring-offset-2"));
  assert.ok(classes.includes("peer-focus-visible:ring-offset-background"));
  assert.ok(!classes.includes("peer-focus-visible:outline-none"));
  assert.ok(!classes.includes("peer-focus-visible:ring-0"));
});
