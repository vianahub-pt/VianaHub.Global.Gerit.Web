import { logger } from "@/core/logger";
import { DEFAULT_LANGUAGE } from "@/platform/i18n/language";

const FORWARDED_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
] as const;

function buildUpstreamUrl(request: Request, path: string[]) {
  const url = new URL(request.url);
  const normalizedPath = path.join("/");

  return `http://82.29.172.68/${normalizedPath}${url.search}`;
}

async function proxyRequest(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const resolvedParams = await params;
  const upstreamUrl = buildUpstreamUrl(request, resolvedParams.path);
  const headers = new Headers();

  FORWARDED_HEADERS.forEach((headerName) => {
    const headerValue = request.headers.get(headerName);

    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  });

  if (!headers.has("accept-language")) {
    headers.set("accept-language", DEFAULT_LANGUAGE);
  }

  const method = request.method.toUpperCase();
  const requestBody =
    method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body: requestBody && requestBody.length > 0 ? requestBody : undefined,
      cache: "no-store",
    });

    // Loga respostas de erro da API (4xx/5xx) para diagnóstico
    if (!upstreamResponse.ok) {
      const responseBody = await upstreamResponse.text().catch(() => "");
      logger.warn("API Gerit retornou erro", {
        context: "api.gerit.proxy",
        method,
        upstreamUrl,
        status: upstreamResponse.status,
        response: responseBody.slice(0, 500),
      });

      const responseHeaders = new Headers();
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) responseHeaders.set("Content-Type", contentType);
      responseHeaders.set("Cache-Control", "no-store");

      return new Response(responseBody, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");

    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }

    responseHeaders.set("Cache-Control", "no-store");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error("Erro ao encaminhar pedido para a API Gerit", {
      context: "api.gerit.proxy",
      method,
      upstreamUrl,
      error,
    });

    return Response.json(
      { message: "Nao foi possivel contactar a API do Gerit." },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
