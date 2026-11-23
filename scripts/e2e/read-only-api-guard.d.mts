export type ReadOnlyApiDecision = "allow-authentication" | "allow-business-read" | "block" | "outside-api";
export function classifyReadOnlyApiRequest(input: { pathname: string; method: string; origin?: string; allowedOrigin?: string }): ReadOnlyApiDecision;
