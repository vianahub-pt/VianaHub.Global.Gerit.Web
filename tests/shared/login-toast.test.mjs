import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("login success toast interpolates the authenticated user and tenant in every locale", () => {
  const loginScreen = read("platform/auth/login-screen.tsx");
  assert.match(
    loginScreen,
    /t\("auth\.login\.toasts\.successDescription",\s*\{\s*user:\s*session\.userName,\s*tenant:\s*session\.tenantName,?\s*\}\)/,
  );

  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"]) {
    const dictionary = JSON.parse(read("locales/" + locale + "/common.json"));
    const description = dictionary["auth.login.toasts.successDescription"];
    assert.equal(typeof description, "string", locale + " has a login success description");
    assert.match(description, /\{\{user\}\}/, locale + " interpolates the user name");
    assert.match(description, /\{\{tenant\}\}/, locale + " interpolates the tenant name");
  }
});
