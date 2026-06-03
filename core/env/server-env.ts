function readEnvVariable(name: string, fallback: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

export const SERVER_ENV = {
  geritApiBaseUrl: readEnvVariable("GERIT_API_BASE_URL", "http://82.29.172.68"),
} as const;

