import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const form = await readFile("domains/operations/teams/team-form-page.tsx", "utf8");
const page = await readFile("domains/operations/teams/teams-page.tsx", "utf8");
const contract = await readFile("domains/operations/teams/teams-contract.ts", "utf8");
const runner = await readFile("scripts/e2e/run-capability.mjs", "utf8");
const mockJourney = await readFile("tests/e2e/teams-form-mocked-journey.spec.ts", "utf8");

test("Teams form uses the confirmed POST/PUT status contract and 12-column layout", () => {
  assert.match(contract, /toTeamPayload\(name: string, description: string, isActive: boolean\)/);
  assert.match(form, /method: editing \? "PUT" : "POST"/);
  assert.match(form, /toTeamPayload\(normalizedName, normalizedDescription, formIsActive\)/);
  assert.match(form, /sm:grid-cols-12/);
  assert.match(form, /sm:col-span-8 md:col-span-10/);
  assert.match(form, /sm:col-span-4 md:col-span-2/);
  assert.match(form, /sm:col-span-12/);
  assert.match(form, /<HubSwitch/);
  assert.match(form, /data-testid="team-persisted-status"/);
  assert.match(form, /ArrowLeft/);
  assert.match(form, /Trash2/);
  assert.match(form, /Save/);
  assert.doesNotMatch(form, /method: "PATCH"/);
  assert.doesNotMatch(form, /handleToggleStatus/);
});

test("Teams list keeps independent lifecycle PATCH and checks each grant", () => {
  for (const grant of ["GetPaged", "GetBy", "Create", "Update", "Delete", "Activate", "Deactivate", "BulkUpload"]) {
    assert.ok(page.includes('hasPermission("Teams", "' + grant + '")'), "missing grant " + grant);
  }
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /statusFilterOptions/);
  assert.match(page, /onPageChange/);
  assert.match(page, /onSort/);
});

test("Teams CI and visual smoke use isolated API mocks without forwarding business requests", () => {
  assert.match(runner, /capability === "teams" && env\.CI === "true"[\s\S]*?teams-form-mocked-journey\.spec\.ts/);
  assert.match(mockJourney, /page\.route\("\*\*\/api\/\*\*"/);
  assert.match(mockJourney, /path === "\/api\/auth\/login" && method === "POST"/);
  assert.match(mockJourney, /path === "\/api\/gerit\/v1\/teams" && method === "POST"/);
  assert.match(mockJourney, /unexpectedRequests\.push/);
  assert.match(mockJourney, /expect\(unexpectedRequests\)\.toEqual\(\[\]\)/);
  assert.doesNotMatch(mockJourney, /route\.continue\(\)/);
});

test("Teams grants, status and permission error are translated in all supported locales", async () => {
  for (const locale of ["pt-PT", "pt-BR", "en-US", "es-ES"]) {
    const translations = JSON.parse(await readFile("locales/" + locale + "/common.json", "utf8"));
    assert.ok(translations["teams.errors.permission"]);
    assert.ok(translations["teams.validation.fields"]);
    assert.ok(translations["common.yes"]);
    assert.ok(translations["common.no"]);
  }
});
