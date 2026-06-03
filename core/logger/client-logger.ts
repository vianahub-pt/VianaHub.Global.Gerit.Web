export function logError(
  context: string,
  message: string,
  error?: unknown,
  extra?: Record<string, unknown>,
) {
  const meta: Record<string, unknown> = {
    context,
    ...extra,
  };

  if (error instanceof Error) {
    meta.error = error.message;
    meta.stack = error.stack;
  } else if (error !== undefined && error !== null) {
    meta.error = String(error);
  }

  console.error(`[${context}] ${message}`, meta);
}
