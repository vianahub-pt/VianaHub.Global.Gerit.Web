"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { UserProfileMenu } from "@/domains/workspace/user-profile-menu";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { GeritLogo } from "@/shared/ui/gerit-logo";
import { DashboardShellProvider, useDashboardShell } from "@/shared/layout";
import { HubNav } from "@/shared/layout/hub-nav";
import { HubMenu } from "@/shared/layout/hub-menu";
import { useWorkspaceMenuConfig } from "@/domains/workspace/workspace-menu-config";

function WorkspaceShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { isAuthenticated, isHydrating, session } = useAuth();
  const { state, toggleSidebar } = useDashboardShell();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const menuSections = useWorkspaceMenuConfig();

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const tenantName = session?.tenantName?.trim() ?? "";
  const copy = useMemo(
    () => ({
      brand: t("workspace.brand"),
      openUserMenu: t("workspace.openUserMenu"),
      toggleThemeToDark: t("workspace.toggleThemeToDark"),
      toggleThemeToLight: t("workspace.toggleThemeToLight"),
      profileLabel: t("workspace.profileLabel"),
      profileDescription: t("workspace.profileDescription"),
      preferencesLabel: t("workspace.preferencesLabel"),
      signOutLabel: t("workspace.signOutLabel"),
      fallbackName: t("workspace.fallbackName"),
      fallbackEmail: t("workspace.fallbackEmail"),
      openDashboard: t("workspace.openDashboard"),
      toggleSidebar: t("workspace.toggleSidebar"),
    }),
    [t],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, router]);

  if (isHydrating || !isAuthenticated) {
    return <div className="h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <div
      className="gerit-shell h-screen overflow-hidden bg-background text-foreground dark:bg-background dark:text-foreground"
      data-collapsed={state.sidebarCollapsed}
    >
      <HubNav
        logo={
          <Link
            href="/"
            className="flex h-10 items-center justify-center rounded-full transition-colors hover:bg-secondary"
            aria-label={copy.openDashboard}
          >
            <GeritLogo
              variant="horizontal"
              theme={mounted && isDark ? "dark" : "light"}
              alt={copy.brand}
              width={142}
              height={36}
              className="h-9 w-auto"
              priority
            />
          </Link>
        }
        left={tenantName ? (
          <>
            <span className="mx-2 h-7 w-px shrink-0 bg-border" />
            <p className="truncate text-sm font-medium text-muted-foreground">
              {tenantName}
            </p>
          </>
        ) : undefined}
        right={
          <>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              aria-label={
                isDark ? copy.toggleThemeToLight : copy.toggleThemeToDark
              }
            >
              {mounted && isDark ? (
                <SunMedium className="h-4 w-4" aria-hidden="true" />
              ) : (
                <MoonStar className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <UserProfileMenu
              openMenuLabel={copy.openUserMenu}
              fallbackName={copy.fallbackName}
              fallbackEmail={copy.fallbackEmail}
              profileLabel={copy.profileLabel}
              profileDescription={copy.profileDescription}
              preferencesLabel={copy.preferencesLabel}
              signOutLabel={copy.signOutLabel}
            />
          </>
        }
      />

      <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
        <aside className="gerit-sidebar relative hidden h-full shrink-0 border-r border-border bg-card lg:flex">
          <HubMenu
            sections={menuSections}
            collapsed={state.sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />

          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute right-[-1.05rem] top-1/2 z-10 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label={copy.toggleSidebar}
            aria-expanded={!state.sidebarCollapsed}
          >
            {state.sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background dark:bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <DashboardShellProvider>
      <WorkspaceShellFrame>{children}</WorkspaceShellFrame>
    </DashboardShellProvider>
  );
}
