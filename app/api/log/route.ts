import { NextRequest } from "next/server";
import { logger } from "@/core/logger";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      level?: string;
      message?: string;
      meta?: Record<string, unknown>;
    };
    const level = body.level ?? "error";
    const message = body.message ?? "Log sem mensagem";
    const meta = body.meta ?? {};

    logger.log(level, `[client] ${message}`, meta);

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 }); // silencioso - não pode quebrar o app
  }
}
