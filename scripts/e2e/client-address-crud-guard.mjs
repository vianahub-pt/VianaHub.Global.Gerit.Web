const AUTH_POSTS = new Set(["/api/auth/login", "/api/auth/refresh"]);
const ROOT = "/api/gerit/v1";

function normalizedPath(value) {
  if (typeof value !== "string" || value.includes("\\") || value.includes("%") || value.includes("//")) return null;
  const path = value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
  if (path !== path.trim() || /\/(?:\.|%2e)(?:\/|$)/i.test(path)) return null;
  return path;
}

function allowedReadPath(path, { clientId, createdAddressIds, expectedUserId, expectedTenantId }) {
  const base = `${ROOT}/clients/${clientId}/addresses`;
  const fixed = new Set([
    `${ROOT}/clients/paged`, `${ROOT}/clients/${clientId}`, `${ROOT}/address-types`,
    `${ROOT}/party-types`, `${ROOT}/acquisition-source-types`, `${ROOT}/status-domains`, `${ROOT}/status-definitions`,
    `${ROOT}/user-preferences/user/${expectedUserId}`, `${ROOT}/subscriptions/tenant/${expectedTenantId}`,
    `${base}/paged`,
  ]);
  if (fixed.has(path)) return true;
  const detail = path.match(new RegExp(`^${base}/(\\d+)$`));
  return Boolean(detail && createdAddressIds.has(Number(detail[1])));
}

export function classifyClientAddressCrudRequest({ pathname, method, origin, allowedOrigin, clientId, createdAddressIds = new Set(), createAttempted = false, phase = "active", expectedUserId = "", expectedTenantId = "" }) {
  const path = normalizedPath(pathname);
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!path || origin !== allowedOrigin) return "block";
  if (verb === "POST" && AUTH_POSTS.has(path)) return "allow-authentication";
  if (!path.startsWith(ROOT + "/")) return "block";

  if (verb === "GET" || verb === "HEAD") {
    return allowedReadPath(path, { clientId, createdAddressIds, expectedUserId, expectedTenantId }) ? "allow-read" : "block";
  }
  if (phase !== "active") return "block";

  const base = `${ROOT}/clients/${clientId}/addresses`;
  if (verb === "POST" && path === base && createdAddressIds.size === 0 && !createAttempted) return "allow-create";
  const match = path.match(new RegExp(`^${base}/(\\d+)(?:/(activate|deactivate))?$`));
  if (!match || !createdAddressIds.has(Number(match[1]))) return "block";
  if (verb === "PUT" && !match[2]) return "allow-update";
  if (verb === "PATCH" && (match[2] === "activate" || match[2] === "deactivate")) return "allow-lifecycle";
  if (verb === "DELETE" && !match[2]) return "allow-delete";
  return "block";
}

export function validateCrudApproval({ mode, clientId, approvalId, approvalValue, mutatingApproved = false, qaExecutionEnabled = false, allowedClientId, expectedUserId, expectedTenantId, platform = process.platform, ci = process.env.CI }) {
  if (mode === "mocked") return { allowed: platform === "win32" && ci !== "true", reason: "mocked-mode-host-only" };
  if (mode !== "qa") return { allowed: false, reason: "unknown-mode" };
  const id = Number(clientId);
  const nonce = typeof approvalId === "string" ? approvalId : "";
  const expected = `${id}:${nonce}`;
  const approvedClient = Number(allowedClientId);
  const approvedTenant = Number(expectedTenantId);
  const approvedUser = typeof expectedUserId === "string" ? expectedUserId.trim() : "";
  const allowed = platform === "win32" && ci !== "true" && mutatingApproved === true && qaExecutionEnabled === true &&
    Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(approvedClient) && approvedClient === id &&
    Number.isSafeInteger(approvedTenant) && approvedTenant > 0 && approvedUser.length > 0 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce) && approvalValue === expected;
  return { allowed, reason: allowed ? "per-run-client-identity-bound-approval" : "qa-mutation-approval-or-cleanup-verification-required" };
}

export function validateQaIdentityClaims(claims, { expectedUserId, expectedTenantId, expectedEmail }) {
  if (!claims || typeof claims !== "object") return false;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const expectedEmailNormalized = typeof expectedEmail === "string" ? expectedEmail.trim().toLowerCase() : "";
  return String(claims.sub ?? "") === String(expectedUserId ?? "") &&
    String(claims.tenant_id ?? "") === String(expectedTenantId ?? "") &&
    Boolean(email && expectedEmailNormalized && email === expectedEmailNormalized);
}

export function validateSyntheticAddressPayload(payload, marker) {
  const markerPattern = /^E2E-CA-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Boolean(payload && typeof payload === "object" && markerPattern.test(marker) && payload.street === marker && payload.isPrimary === false);
}