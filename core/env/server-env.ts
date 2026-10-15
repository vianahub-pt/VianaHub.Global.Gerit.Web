function readRequiredUrl(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`Server environment variable ${name} must be a valid URL`);
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0 ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0
  ) {
    throw new Error(
      `Server environment variable ${name} must be an HTTP(S) base URL without credentials, query, or fragment`,
    );
  }

  return value.replace(/\/+$/, "");
}

export function buildGeritApiUrl(path: string, search = "") {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(
    normalizedPath,
    `${SERVER_ENV.geritApiBaseUrl}/`,
  );
  url.search = search;

  return url.toString();
}

export const SERVER_ENV = {
  get geritApiBaseUrl() {
    return readRequiredUrl("GERIT_API_BASE_URL");
  },
} as const;
