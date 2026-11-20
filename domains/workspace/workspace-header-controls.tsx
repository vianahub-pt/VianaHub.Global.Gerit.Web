"use client";

import { useEffect, useRef, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import {
  SUPPORTED_LANGUAGES,
  type Language,
  useTranslation,
} from "@/platform/i18n";
import { useIdentityPreferences } from "@/domains/identity/preferences";
import { useToast } from "@/shared/feedback/use-toast";
import { HubSelect } from "@/shared/ui";

export function WorkspaceHeaderControls() {
  const { resolvedTheme } = useTheme();
  const preferences = useIdentityPreferences();
  const { toast } = useToast();
  const lastPreferenceErrorRef = useRef<string | null>(null);
  const { language, t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    const error = preferences.saveStatus === "error" ? preferences.saveError : preferences.loadError;
    if (!error) {
      lastPreferenceErrorRef.current = null;
      return;
    }
    if (lastPreferenceErrorRef.current === error) return;
    lastPreferenceErrorRef.current = error;
    toast({ title: t("preferences.autosave.error"), description: error, variant: "destructive" });
  }, [preferences.loadError, preferences.saveError, preferences.saveStatus, t, toast]);

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      data-testid="workspace-header-controls"
      data-preferences-hydrated={preferences.isHydrated ? "true" : "false"}
    >
      <HubSelect
        ariaLabel={t("auth.login.localeLabel")}
        value={language}
        onValueChange={(value) => preferences.setLocale(value as Language)}
        options={SUPPORTED_LANGUAGES.map((option) => ({
          value: option,
          label: t(`language.short.${option}`),
        }))}
        variant="compact"
        triggerClassName="w-14 px-1 sm:w-[4.5rem] sm:px-2"
        testId="workspace-language-select"
        disabled={preferences.loadStatus === "loading"}
      />
      <button
        type="button"
        data-testid="theme-toggle"
        onClick={() => preferences.setAppearance(isDark ? "light" : "dark")}
        disabled={preferences.loadStatus === "loading"}
        className="inline-flex h-8 w-8 items-center sm:h-9 sm:w-9 justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50"
        aria-label={isDark ? t("workspace.toggleThemeToLight") : t("workspace.toggleThemeToDark")}
        title={isDark ? t("workspace.toggleThemeToLight") : t("workspace.toggleThemeToDark")}
      >
        {isDark ? (
          <SunMedium className="h-4 w-4" aria-hidden="true" />
        ) : (
          <MoonStar className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
