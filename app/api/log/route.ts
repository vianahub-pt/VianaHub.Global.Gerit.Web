import { logger } from "@/core/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { level = "error", message, ...meta } = body;

    if (level === "error") {
      logger.error(message, { origin: "client-side", ...meta });
    } else if (level === "warn") {
      logger.warn(message, { origin: "client-side", ...meta });
    } else {
      logger.info(message, { origin: "client-side", ...meta });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
