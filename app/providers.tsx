"use client";

import { AppProviders } from "@/platform/providers";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
