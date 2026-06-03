export async function logError(
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
    meta.error = message;
    meta.stack = error.stack;
    meta.errorMessage = error.message;
  } else if (error !== undefined && error !== null) {
    meta.error = String(error);
  }

  console.error(`[${context}] ${message}`, meta);

  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message,
        context,
        ...meta,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      }),
    });
  } catch {
    // Falha silenciosa - logging nao deve quebrar a UX
  }
}
