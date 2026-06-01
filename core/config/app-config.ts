import { SERVER_ENV } from "@/core/env/server-env";

export const APP_CONFIG = {
  name: "Gerit",
  description: "VianaHub - Solucoes Tecnologicas",
  api: {
    geritBaseUrl: SERVER_ENV.geritApiBaseUrl,
  },
} as const;

