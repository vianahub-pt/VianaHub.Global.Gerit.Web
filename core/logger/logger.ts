import fs from "fs";
import path from "path";
import {
  createLogger,
  format,
  transports,
  type Logger,
} from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const LOG_DIRECTORY = path.join(process.cwd(), "logs");

function ensureLogDirectory() {
  if (!fs.existsSync(LOG_DIRECTORY)) {
    fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
  }
}

function serializeMeta(meta: Record<string, unknown>) {
  const entries = Object.entries(meta);

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value]) => {
      if (value instanceof Error) {
        return `${key}=${value.message}`;
      }

      if (typeof value === "object" && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }

      return `${key}=${String(value)}`;
    })
    .join(" ");
}

const humanReadableFileFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = serializeMeta(meta as Record<string, unknown>);

    return metaStr
      ? `${timestamp} ${level}: ${message} ${metaStr}`
      : `${timestamp} ${level}: ${message}`;
  }),
);

function createWinstonLogger() {
  ensureLogDirectory();

  return createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    defaultMeta: {
      service: "gerit-front",
    },
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json(),
    ),
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          format.printf(({ timestamp, level, message, ...meta }) => {
            const serializedMeta = serializeMeta(meta as Record<string, unknown>);

            return serializedMeta
              ? `${timestamp} ${level}: ${message} ${serializedMeta}`
              : `${timestamp} ${level}: ${message}`;
          }),
        ),
      }),
      new DailyRotateFile({
        filename: path.join(LOG_DIRECTORY, "%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        maxFiles: "30d",
        format: humanReadableFileFormat,
      }),
    ],
  });
}

declare global {
  var geritLogger: Logger | undefined;
}

export const logger = globalThis.geritLogger ?? createWinstonLogger();

if (process.env.NODE_ENV !== "production") {
  globalThis.geritLogger = logger;
}

export function redactEmail(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return "***";
  }

  const visiblePrefix = localPart.slice(0, 2);

  return `${visiblePrefix}${"*".repeat(
    Math.max(localPart.length - 2, 1),
  )}@${domainPart}`;
}
