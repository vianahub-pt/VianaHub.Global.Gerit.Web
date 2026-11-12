import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTeamsQuery,
  normalizeTeam,
  normalizeTeamSummary,
  toTeamPayload,
} from "../../domains/operations/teams/teams-contract.ts";

const queryBase = { search: "  crew ", page: 2, pageSize: 20, sortBy: "Name", sortDirection: "desc" };

test("All leaves IsActive out of the query string", () => {
  const query = buildTeamsQuery({ ...queryBase, status: "all" });
  assert.equal(query.has("IsActive"), false);
  assert.equal(query.toString().includes("IsActive="), false);
  assert.equal(query.get("Search"), "crew");
});

test("Active and Inactive send the exact boolean status values", () => {
  assert.equal(buildTeamsQuery({ ...queryBase, status: "active" }).get("IsActive"), "true");
  assert.equal(buildTeamsQuery({ ...queryBase, status: "inactive" }).get("IsActive"), "false");
});

test("normalizes the API paged summary, whose DTO omits Description", () => {
  assert.deepEqual(normalizeTeamSummary({ id: 7, name: "Crew", isActive: true }), {
    id: 7, name: "Crew", description: null, isActive: true,
  });
  assert.equal(normalizeTeam({ id: 7, name: "Crew", isActive: true }), null);
});

test("normalizes detail and rejects mismatched or incomplete API data", () => {
  const detail = { id: 7, tenantId: 4, name: "Crew", description: "Day shift", isActive: false, createdAt: "2026-01-01" };
  assert.deepEqual(normalizeTeam(detail), { id: 7, name: "Crew", description: "Day shift", isActive: false });
  assert.equal(normalizeTeam({ ...detail, id: 0 }), null);
  assert.equal(normalizeTeam({ ...detail, isActive: "false" }), null);
});

test("preserves a non-empty Description in create and update payloads", () => {
  assert.deepEqual(toTeamPayload(" Crew ", " Day shift "), { name: "Crew", description: " Day shift " });
  assert.deepEqual(toTeamPayload("Crew", "  "), { name: "Crew", description: null });
});
