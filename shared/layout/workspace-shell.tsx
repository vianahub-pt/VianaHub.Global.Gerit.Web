"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, Menu, MoonStar, SunMedium, X } from "lucide-react";
  import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
  import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import type { ReactNode } from "react";
import { UserProfileMenu } from "@/domains/workspace/user-profile-menu";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { GeritLogo } from "@/shared/ui/gerit-logo";
import { DashboardShellProvider, useDashboardShell } from "@/shared/layout";
import { HubNav } from "@/shared/layout/hub-nav";
import { HubMenu } from "@/shared/layout/hub-menu";
import { HubBody } from "@/shared/layout/hub-body";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useWorkspaceMenuConfig } from "@/domains/workspace/workspace-menu-config";

function WorkspaceShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { isAuthenticated, isHydrating, session } = useAuth();
  const { state, toggleSidebar } = useDashboardShell();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const menuSections = useWorkspaceMenuConfig();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();

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

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileMenuOpen]);

  if (isHydrating || !isAuthenticated) {
    return <div className="h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <SidebarProvider open={!state.sidebarCollapsed} onOpenChange={(open) => { if (open !== !state.sidebarCollapsed) toggleSidebar(); }}>
      <div
        id={`workspace-shell-${generatedId}`}
        data-testid="workspace-shell-root"
        className="gerit-shell h-screen overflow-hidden bg-background text-foreground dark:bg-background dark:text-foreground"
        data-collapsed={state.sidebarCollapsed}
      >
        <HubNav
        left={
          <>
            <button
              ref={hamburgerRef}
              id={`hamburger-menu-${generatedId}`}
              type="button"
              data-testid="hamburger-menu"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              href="/"
              className="flex items-center justify-center rounded-lg transition-colors hover:bg-secondary px-2 py-1"
              aria-label={copy.openDashboard}
            >
              <GeritLogo
                variant="horizontal"
                theme={mounted && isDark ? "dark" : "light"}
                alt={copy.brand}
                width={142}
                height={36}
                className="h-8 w-auto"
                priority
              />
            </Link>
          </>
        }
        logo={tenantName ? (
          <>
            <span className="mx-2 text-muted-foreground" aria-hidden="true">|</span>
            <p className="truncate text-sm font-semibold text-foreground">
              {tenantName}
            </p>
          </>
        ) : undefined}
        right={
          <>
            <button
              id={`theme-toggle-${generatedId}`}
              type="button"
              data-testid="theme-toggle"
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

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            id="mobile-menu"
            ref={mobileMenuRef}
            data-testid="mobile-menu"
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-card shadow-xl animate-slide-in-left"
          >
            <div className="flex h-14 items-center justify-between border-b px-4">
              <GeritLogo variant="horizontal" width={120} height={30} />
              <button
                id={`close-mobile-menu-${generatedId}`}
                type="button"
                data-testid="close-mobile-menu"
                onClick={() => {
                  setMobileMenuOpen(false);
                  hamburgerRef.current?.focus();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <HubMenu
              sections={menuSections}
              collapsed={false}
              onToggleCollapse={toggleSidebar}
            />
          </aside>
        </div>
      )}

      <div
        className="flex h-[calc(100vh-3.5rem)] min-h-0"
        aria-hidden={mobileMenuOpen ? true : undefined}
      >
        <aside
          id={`desktop-sidebar-${generatedId}`}
          data-testid="desktop-sidebar"
          className="gerit-sidebar relative hidden h-full shrink-0 border-r border-border bg-card lg:flex flex-col"
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <HubMenu
            sections={menuSections}
            collapsed={state.sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            hoveredSection={hoveredSection ?? undefined}
            onSectionHover={setHoveredSection}
          />

          <button
            id={`toggle-sidebar-${generatedId}`}
            type="button"
            data-testid="toggle-sidebar"
            onClick={toggleSidebar}
            className="absolute right-[-1.05rem] bottom-0 z-10 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
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

        {state.sidebarCollapsed && sidebarHovered && (
          <Sidebar side="left" variant="floating" collapsible="none">
            <SidebarContent className="w-64">
              <HubMenu
                sections={menuSections}
                collapsed={false}
                onToggleCollapse={toggleSidebar}
              />
            </SidebarContent>
          </Sidebar>
        )}

        <HubBody>{children}</HubBody>
      </div>
      </div>
    </SidebarProvider>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <DashboardShellProvider>
      <WorkspaceShellFrame>{children}</WorkspaceShellFrame>
    </DashboardShellProvider>
  );
}
