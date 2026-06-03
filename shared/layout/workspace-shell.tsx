"use client";

import clsx from "clsx";
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
import { TenantSidebar } from "@/shared/layout/tenant-sidebar";

function WorkspaceShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { isAuthenticated, isHydrating, session } = useAuth();
  const { state, toggleSidebar } = useDashboardShell();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

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
    return <div className="h-screen bg-[#041118]" aria-hidden="true" />;
  }

  return (
    <div
      className="gerit-shell h-screen overflow-hidden bg-[#f3f5f7] text-[#11191f] dark:bg-[#041118] dark:text-slate-100"
      data-collapsed={state.sidebarCollapsed}
    >
      <header className="relative z-20 flex h-14 items-center justify-between border-b border-[#d9dee2] bg-[#f7f8fa] px-4 sm:px-6 dark:border-[#17313a] dark:bg-[#041118]">
        <div className="flex min-w-0 items-center">
          <div
            className={clsx(
              "flex shrink-0 items-center px-2",
              state.sidebarCollapsed ? "w-[4.25rem]" : "w-[10.25rem]",
            )}
          >
            <Link
              href="/"
              className="flex h-10 w-full items-center justify-center rounded-full transition-colors hover:bg-[#edf3f6] dark:hover:bg-[#0d1f28]"
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
          </div>

          {tenantName ? (
            <>
              <span className="mx-2 h-7 w-px shrink-0 bg-[#d7dfe3] dark:bg-[#21424d]" />
              <p className="truncate text-sm font-medium text-[#4a5860] dark:text-[#b9cbd3]">
                {tenantName}
              </p>
            </>
          ) : null}
        </div>

        <div className="relative ml-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setTheme(isDark ? "light" : "dark");
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ced5da] bg-[#f8fafb] text-[#73818a] transition-colors hover:text-[#11191f] dark:border-[#23414b] dark:bg-[#06161d] dark:text-[#a0b2ba] dark:hover:text-white"
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
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
        <aside className="gerit-sidebar relative hidden h-full shrink-0 border-r border-[#d9dee2] bg-[#eef1f4] dark:border-[#17313a] dark:bg-[#07161d] lg:flex">
          <TenantSidebar collapsed={state.sidebarCollapsed} />

          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute right-[-1.05rem] top-1/2 z-10 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-[#d9dee2] bg-[#eef1f4] text-[#acb5bb] transition-colors hover:text-[#526168] dark:border-[#17313a] dark:bg-[#07161d] dark:text-[#8096a0] dark:hover:text-white"
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

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f6f8] dark:bg-[#0a171f]">
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
