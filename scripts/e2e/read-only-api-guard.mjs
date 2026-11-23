const AUTHENTICATION_POSTS = new Set(["/api/auth/login", "/api/auth/refresh"]);

export function classifyReadOnlyApiRequest({ pathname, method }) {
  const rawPath = typeof pathname === "string" ? pathname : "";
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    // Keep malformed paths visible to the fail-closed API prefix check below.
  }
  const apiPrefix = decodedPath.toLowerCase();
  const isApiRequest = apiPrefix === "/api" || apiPrefix.startsWith("/api/");
  if (!isApiRequest) return "outside-api";

  let path = rawPath;
  while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const verb = typeof method === "string" ? method.toUpperCase() : "";

  if (verb === "POST" && AUTHENTICATION_POSTS.has(path)) return "allow-authentication";
  if ((path === "/api/gerit/v1" || path.startsWith("/api/gerit/v1/")) && ["GET", "HEAD"].includes(verb)) {
    return "allow-business-read";
  }
  return "block";
}
