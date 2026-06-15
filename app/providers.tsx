"use client";

import { AppProviders } from "@/platform/providers";

export function Providers({ children }: { children: React.ReactNode }) {
  return <div data-testid="providers-root"><AppProviders>{children}</AppProviders></div>;
}
