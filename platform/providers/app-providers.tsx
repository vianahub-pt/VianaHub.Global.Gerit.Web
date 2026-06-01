"use client";

import { Toaster } from "@/shared/ui";
import { AuthProvider } from "@/platform/auth";
import { EntitlementsProvider } from "@/platform/entitlements/entitlements-context";
import { TranslationProvider } from "@/platform/i18n";
import { ThemeProvider } from "@/platform/providers/theme-provider";
import { SubscriptionProvider } from "@/platform/subscription/subscription-context";
import { TenantProvider } from "@/platform/tenant/tenant-context";
import { WorkspaceBootstrapProvider } from "@/platform/workspace-bootstrap/workspace-bootstrap-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TranslationProvider>
        <AuthProvider>
          <TenantProvider>
            <SubscriptionProvider>
              <EntitlementsProvider>
                <WorkspaceBootstrapProvider>
                  {children}
                  <Toaster />
                </WorkspaceBootstrapProvider>
              </EntitlementsProvider>
            </SubscriptionProvider>
          </TenantProvider>
        </AuthProvider>
      </TranslationProvider>
    </ThemeProvider>
  );
}
