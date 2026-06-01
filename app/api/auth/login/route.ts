import { NextResponse } from "next/server";
import { logger, redactEmail } from "@/core/logger";
import { normalizeLanguageTag } from "@/platform/i18n/language";

interface LoginRequestBody {
  email: string;
  password: string;
}

function isLoginRequestBody(payload: unknown): payload is LoginRequestBody {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Partial<LoginRequestBody>;

  return (
    typeof candidate.email === "string" &&
    candidate.email.trim().length > 0 &&
    typeof candidate.password === "string" &&
    candidate.password.trim().length > 0
  );
}

function buildJsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    logger.warn("Payload invalido recebido na autenticacao", {
      context: "api.auth.login",
    });

    return buildJsonResponse(
      { message: "Pedido de autenticacao invalido." },
      400,
    );
  }

  if (!isLoginRequestBody(payload)) {
    logger.warn("Campos obrigatorios ausentes na autenticacao", {
      context: "api.auth.login",
    });

    return buildJsonResponse(
      { message: "Email e password sao obrigatorios." },
      400,
    );
  }

  try {
    const preferredLanguage = normalizeLanguageTag(
      request.headers.get("accept-language"),
    );
    logger.info("Tentativa de autenticacao iniciada", {
      context: "api.auth.login",
      email: redactEmail(payload.email),
    });

    const upstreamResponse = await fetch("http://82.29.172.68/v1/auth/login", {
      method: "POST",
      headers: {
        "Accept-Language": preferredLanguage,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const rawResponse = await upstreamResponse.text();
    let parsedBody: unknown = null;

    if (rawResponse) {
      try {
        parsedBody = JSON.parse(rawResponse);
      } catch {
        parsedBody = { message: rawResponse };
      }
    }

    if (!upstreamResponse.ok) {
      logger.warn("Autenticacao rejeitada pelo servico remoto", {
        context: "api.auth.login",
        email: redactEmail(payload.email),
        statusCode: upstreamResponse.status,
      });

      return buildJsonResponse(
        parsedBody ?? { message: "Falha ao autenticar utilizador." },
        upstreamResponse.status,
      );
    }

    if (typeof parsedBody === "object" && parsedBody !== null) {
      const candidate = parsedBody as Record<string, unknown>;

      logger.info("Autenticacao concluida com sucesso", {
        context: "api.auth.login",
        tenantId: candidate.tenantId,
        userId: candidate.userId,
        email:
          typeof candidate.email === "string"
            ? redactEmail(candidate.email)
            : redactEmail(payload.email),
      });
    }

    return buildJsonResponse(parsedBody ?? {}, upstreamResponse.status);
  } catch (error) {
      logger.error("Erro ao contactar servico remoto de autenticacao", {
        context: "api.auth.login",
        email: redactEmail(payload.email),
        error,
      });

    return buildJsonResponse(
      { message: "Nao foi possivel contactar o servico de autenticacao." },
      502,
    );
  }
}
