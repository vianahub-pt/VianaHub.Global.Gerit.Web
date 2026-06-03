export const SUPPORTED_LANGUAGES = [
  "pt-PT",
  "pt-BR",
  "en-US",
  "es-ES",
] as const;
export const DEFAULT_LANGUAGE = "pt-PT";

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language)
  );
}

export function normalizeLanguageTag(
  value: string | null | undefined,
): Language {
  if (!value) {
    return DEFAULT_LANGUAGE;
  }

  const primaryValue = value.split(",")[0]?.trim();

  if (isSupportedLanguage(primaryValue)) {
    return primaryValue;
  }

  const baseLanguage = primaryValue?.split("-")[0]?.toLowerCase();

  if (baseLanguage === "en") {
    return "en-US";
  }

  if (baseLanguage === "es") {
    return "es-ES";
  }
  if (baseLanguage === "pt") {
    return "pt-PT";
  }
  if (baseLanguage === "br") {
    return "pt-BR";
  }

  return "pt-PT";
}
