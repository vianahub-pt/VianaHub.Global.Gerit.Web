const AUTHENTICATION_POSTS = new Set(["/api/auth/login", "/api/auth/refresh"]);
const BUSINESS_API_ROOT = "/api/gerit/v1";
const BACKSLASH = String.fromCharCode(92);

function apiLikePath(pathname) {
  let candidate = pathname;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slashPath = candidate.replaceAll(BACKSLASH, "/");
    const lowerPath = slashPath.toLowerCase();
    if (lowerPath === "/api" || lowerPath.startsWith("/api/") || lowerPath.startsWith("//api/")) return true;
    try {
      const normalized = new URL(slashPath, "http://read-only-guard.invalid").pathname.toLowerCase();
      if (normalized === "/api" || normalized.startsWith("/api/") || normalized.startsWith("//api/")) return true;
    } catch {
      return true;
    }
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      return lowerPath.includes("api");
    }
  }
  return candidate !== pathname;
}

function isCanonicalApiPath(pathname) {
  return pathname === pathname.trim() &&
    !pathname.includes(BACKSLASH) &&
    !pathname.includes("%") &&
    !pathname.includes("//") &&
    pathname.startsWith("/api/");
}

function isExactAuthenticationPath(pathname) {
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return AUTHENTICATION_POSTS.has(path) &&
    (pathname === path || pathname === `${path}/`);
}

export function classifyReadOnlyApiRequest({ pathname, method, origin, allowedOrigin }) {
  const path = typeof pathname === "string" ? pathname : "";
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  const isLocalOrigin = typeof allowedOrigin === "string" && origin === allowedOrigin;

  if (verb === "POST" && isLocalOrigin && isExactAuthenticationPath(path)) {
    return "allow-authentication";
  }

  if (verb !== "GET" && verb !== "HEAD") return "block";
  if (!apiLikePath(path)) return "outside-api";
  if (!isLocalOrigin || !isCanonicalApiPath(path)) return "block";

  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalizedPath !== BUSINESS_API_ROOT && !normalizedPath.startsWith(`${BUSINESS_API_ROOT}/`)) {
    return "block";
  }

  return "allow-business-read";
}
