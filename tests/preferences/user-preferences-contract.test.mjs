import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUserPreferencesApiPayload,
  canPersistPreferencesAfterLoad,
  classifyPreferencesLoadStatus,
  isUserPreferencesApiResponse,
  preferencesSaveErrorKey,
} from "../../domains/identity/preferences/user-preferences-contract.ts";

const state = {
  appearance: "dark",
  locale: "en-US",
  currencyCode: "USD",
  timezone: "Europe/Lisbon",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "12h",
  dayStart: "08:30",
  dayEnd: "17:00",
  emailNotifications: {
    newsletter: true,
    integration: false,
    weeklyReport: true,
    longRunningTimer: false,
    scheduledReports: false,
    approval: true,
    timeOff: false,
    alerts: true,
    reminders: false,
    planner: true,
    invoices: false,
  },
};

test("GET 200 is classified as an existing preference response", () => {
  assert.deepEqual(classifyPreferencesLoadStatus(200), { kind: "loaded" });
  assert.equal(canPersistPreferencesAfterLoad("loaded"), true);
  assert.equal(isUserPreferencesApiResponse({
    id: 7,
    tenantId: 2,
    userId: 9,
    emailNewsletter: false,
    emailWeeklyReport: false,
    emailApproval: true,
    emailAlerts: true,
    emailReminders: true,
    emailPlanner: true,
  }), true);
});

test("GET 410 is the only not-found outcome that permits creating a preference", () => {
  assert.deepEqual(classifyPreferencesLoadStatus(410), { kind: "missing" });
  assert.equal(canPersistPreferencesAfterLoad("missing"), true);
  assert.notDeepEqual(classifyPreferencesLoadStatus(404), { kind: "missing" });
});

test("GET 403 remains an authorization error and blocks persistence", () => {
  assert.deepEqual(classifyPreferencesLoadStatus(403), {
    kind: "error",
    messageKey: "forbidden",
  });
  assert.equal(canPersistPreferencesAfterLoad("error"), false);
});

test("GET 5xx remains a loading error and blocks persistence", () => {
  assert.deepEqual(classifyPreferencesLoadStatus(503), {
    kind: "error",
    messageKey: "loadFailed",
  });
  assert.equal(canPersistPreferencesAfterLoad("loading"), false);
  assert.equal(canPersistPreferencesAfterLoad("error"), false);
});

test("create payload contains only API fields, six email flags, and HH:mm times", () => {
  const payload = buildUserPreferencesApiPayload(state);

  assert.deepEqual(payload, {
    appearance: "dark",
    locale: "en-US",
    currencyCode: "USD",
    timezone: "Europe/Lisbon",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    dayStart: "08:30",
    dayEnd: "17:00",
    emailNewsletter: true,
    emailWeeklyReport: true,
    emailApproval: true,
    emailAlerts: true,
    emailReminders: false,
    emailPlanner: true,
  });
  assert.equal("userId" in payload, false);
  assert.equal("integration" in payload, false);
  assert.equal("invoices" in payload, false);
});

test("update payload uses the same API contract and HH:mm time format", () => {
  const payload = buildUserPreferencesApiPayload({ ...state, dayStart: "09:00", dayEnd: "18:30" });
  assert.equal(payload.dayStart, "09:00");
  assert.equal(payload.dayEnd, "18:30");
});

test("save failures map HTTP statuses to localized message keys", () => {
  assert.equal(preferencesSaveErrorKey(400), "invalid");
  assert.equal(preferencesSaveErrorKey(403), "forbidden");
  assert.equal(preferencesSaveErrorKey(409), "conflict");
  assert.equal(preferencesSaveErrorKey(410), "unavailable");
  assert.equal(preferencesSaveErrorKey(500), "saveFailed");
});
