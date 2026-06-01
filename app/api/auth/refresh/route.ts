import { NextResponse } from "next/server";
import { logger } from "@/core/logger";
import { normalizeLanguageTag } from "@/platform/i18n/language";

interface RefreshRequestBody {
  tenantId: number;
  refreshToken: string;
}

function isRefreshRequestBody(payload: unknown): payload is RefreshRequestBody {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Partial<RefreshRequestBody>;

  return (
    typeof candidate.tenantId === "number" &&
    Number.isFinite(candidate.tenantId) &&
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.trim().length > 0
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
    logger.warn("Payload invalido recebido na renovacao de token", {
      context: "api.auth.refresh",
    });

    return buildJsonResponse(
      { message: "Pedido de renovacao invalido." },
      400,
    );
  }

  if (!isRefreshRequestBody(payload)) {
    logger.warn("Campos obrigatorios ausentes na renovacao de token", {
      context: "api.auth.refresh",
    });

    return buildJsonResponse(
      { message: "Tenant e refresh token sao obrigatorios." },
      400,
    );
  }

  try {
    const preferredLanguage = normalizeLanguageTag(
      request.headers.get("accept-language"),
    );
    const upstreamResponse = await fetch("http://82.29.172.68/v1/auth/refresh", {
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
      logger.warn("Renovacao de token rejeitada pelo servico remoto", {
        context: "api.auth.refresh",
        tenantId: payload.tenantId,
        statusCode: upstreamResponse.status,
      });

      return buildJsonResponse(
        parsedBody ?? { message: "Falha ao renovar token." },
        upstreamResponse.status,
      );
    }

    logger.info("Token renovado com sucesso", {
      context: "api.auth.refresh",
      tenantId: payload.tenantId,
    });

    return buildJsonResponse(parsedBody ?? {}, upstreamResponse.status);
  } catch (error) {
    logger.error("Erro ao contactar servico remoto de renovacao", {
      context: "api.auth.refresh",
      tenantId: payload.tenantId,
      error,
    });

    return buildJsonResponse(
      { message: "Nao foi possivel contactar o servico de renovacao." },
      502,
    );
  }
}
