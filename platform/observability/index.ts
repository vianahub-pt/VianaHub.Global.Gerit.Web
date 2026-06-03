import { logger } from "@/core/logger";

export function trackEvent(eventName: string, metadata?: Record<string, unknown>) {
  logger.info(`observability.event.${eventName}`, {
    context: "platform.observability",
    ...metadata,
  });
}

