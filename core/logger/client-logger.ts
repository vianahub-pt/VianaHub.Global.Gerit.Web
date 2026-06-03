const LOG_ENDPOINT = "/api/log/";

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

  // Fire-and-forget: não espera resposta para não bloquear UI
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: "error", message, meta }),
  }).catch(() => {
    // Silencioso - se falhar o log, não pode quebrar o app
  });
}
