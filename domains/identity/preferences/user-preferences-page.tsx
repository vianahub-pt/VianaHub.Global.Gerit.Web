"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Check,
  Clock3,
  Globe2,
  MoonStar,
  Palette,
  SunMedium,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  type AppearancePreference,
  type CurrencyCodePreference,
  type DateFormatPreference,
  type NotificationPreferenceKey,
  type PreferenceLocale,
  type TimeFormatPreference,
  useIdentityPreferences,
} from "@/domains/identity/preferences";
import { HubSwitch, HubTabs } from "@/shared/ui";

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "(UTC -05:00) America/Washington" },
  { value: "America/Sao_Paulo", label: "(UTC -03:00) America/Sao_Paulo" },
  { value: "Europe/Lisbon", label: "(UTC +00:00) Europe/Lisbon" },
  { value: "Europe/Madrid", label: "(UTC +01:00) Europe/Madrid" },
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY" }, // 🇵🇹 pt-PT | 🇪🇸 es-ES
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" }, // 🇺🇸 en-US
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" }, // 🇧🇷 pt-BR
] as const;
const CURRENCY_CODE_OPTIONS = [
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
  { value: "BRL", label: "BRL" },
] as const;

const DAY_START_OPTIONS = [
  { value: "01:00", label: "01:00" },
  { value: "01:30", label: "01:30" },
  { value: "02:00", label: "02:00" },
  { value: "02:30", label: "02:30" },
  { value: "03:00", label: "03:00" },
  { value: "03:30", label: "03:30" },
  { value: "04:00", label: "04:00" },
  { value: "04:30", label: "04:30" },
  { value: "05:00", label: "05:00" },
  { value: "05:30", label: "05:30" },
  { value: "06:00", label: "06:00" },
  { value: "06:30", label: "06:30" },
  { value: "07:00", label: "07:00" },
  { value: "07:30", label: "07:30" },
  { value: "08:00", label: "08:00" },
  { value: "08:30", label: "08:30" },
  { value: "09:00", label: "09:00" },
  { value: "09:30", label: "09:30" },
  { value: "10:00", label: "10:00" },
  { value: "10:30", label: "10:30" },
  { value: "11:00", label: "11:00" },
  { value: "11:30", label: "11:30" },
  { value: "12:00", label: "12:00" },
  { value: "12:30", label: "12:30" },
  { value: "13:00", label: "13:00" },
  { value: "13:30", label: "13:30" },
  { value: "14:00", label: "14:00" },
  { value: "14:30", label: "14:30" },
  { value: "15:00", label: "15:00" },
  { value: "15:30", label: "15:30" },
  { value: "16:00", label: "16:00" },
  { value: "16:30", label: "16:30" },
  { value: "17:00", label: "17:00" },
  { value: "17:30", label: "17:30" },
  { value: "18:00", label: "18:00" },
  { value: "18:30", label: "18:30" },
  { value: "19:00", label: "19:00" },
  { value: "19:30", label: "19:30" },
  { value: "20:00", label: "20:00" },
  { value: "20:30", label: "20:30" },
  { value: "21:00", label: "21:00" },
  { value: "21:30", label: "21:30" },
  { value: "22:00", label: "22:00" },
  { value: "22:30", label: "22:30" },
  { value: "23:00", label: "23:00" },
  { value: "23:30", label: "23:30" },
] as const;
const DAY_END_OPTIONS = DAY_START_OPTIONS;

const HIDDEN_NOTIFICATION_KEYS: ReadonlyArray<NotificationPreferenceKey> = [
  "integration",
  "longRunningTimer",
  "scheduledReports",
  "timeOff",
  "invoices",
];

function PreferenceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function UserPreferencesPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating, session } = useAuth();
  const { t } = useTranslation();
  const preferences = useIdentityPreferences();
  const { setActiveTab } = preferences;

  const timeFormatOptions = useMemo(
    () => [
      { value: "24h", label: t("preferences.timeFormat.24h") },
      { value: "12h", label: t("preferences.timeFormat.12h") },
    ],
    [t],
  );
  const notificationItems = useMemo(
    () =>
      (
        [
          "newsletter",
          "weeklyReport",
          "approval",
          "alerts",
          "reminders",
          "planner",
        ] as const
      ).map((key) => ({
        key,
        title: t(`preferences.notifications.${key}.title`),
        description: t(`preferences.notifications.${key}.description`),
      })),
    [t],
  );
  const visibleNotificationItems = useMemo(
    () =>
      notificationItems.filter(
        (item) => !HIDDEN_NOTIFICATION_KEYS.includes(item.key),
      ),
    [notificationItems],
  );

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, router]);

  useEffect(() => {
    setActiveTab("general");
  }, [setActiveTab]);

  return (
      <div data-testid="user-preferences-page-root" className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6">
        <header data-testid="preferences-page-header" className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                {t("preferences.title")}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                {t("preferences.subtitle")}
              </p>
            </div>

            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary sm:self-center"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {preferences.saveStatus === "saving"
                ? t("preferences.autosave.saving")
                : preferences.saveStatus === "error"
                  ? t("preferences.autosave.error")
                  : preferences.saveStatus === "saved"
                    ? t("preferences.autosave.saved")
                    : t("preferences.autosave.idle")}
            </div>
        </header>

        {!isHydrating && session && preferences.loadStatus === "error" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div
              role="alert"
              className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
            >
              {preferences.loadError}
            </div>
          </div>
        ) : isHydrating || !preferences.isHydrated || !session ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="rounded-sm border border-border/80 bg-card p-6 text-sm text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              {t("preferences.loading")}
            </div>
          </div>
        ) : (
          <>
            <HubTabs
              id="preferences-tabs"
              ariaLabel={t("preferences.title")}
              tabs={[
                { id: "general", label: t("preferences.tabs.general"), panel: null, panelId: "preferences-tab-panel" },
                { id: "email", label: t("preferences.tabs.email"), panel: null, panelId: "preferences-tab-panel" },
              ]}
              activeTab={preferences.state.activeTab}
              onTabChange={(tabId) => preferences.setActiveTab(tabId)}
              renderPanel={false}
            />

            <div id="preferences-tab-panel" role="tabpanel" aria-labelledby={`preferences-tabs-tab-${preferences.state.activeTab}`} tabIndex={0} className="space-y-6">
              {preferences.saveStatus === "error" && preferences.saveError ? (
                <div className="rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                  {preferences.saveError}
                </div>
              ) : null}

              {preferences.state.activeTab === "general" ? (
                <div className="grid items-start gap-6 xl:grid-cols-2">
                  <div className="space-y-6">
                    <section data-testid="preferences-theme-card" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                        <Palette className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                          {t("preferences.appearance.title")}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                          {t("preferences.appearance.description")}
                        </p>
                      </div>
                    </div>

                    <div
                      className="mt-6 grid gap-4 md:grid-cols-2"
                      role="radiogroup"
                      aria-label={t("preferences.appearance.title")}
                    >
                      {(
                        [
                          {
                            key: "light",
                            icon: SunMedium,
                            title: t("preferences.appearance.light.title"),
                            description: t(
                              "preferences.appearance.light.description",
                            ),
                          },
                          {
                            key: "dark",
                            icon: MoonStar,
                            title: t("preferences.appearance.dark.title"),
                            description: t(
                              "preferences.appearance.dark.description",
                            ),
                          },
                        ] as const
                      ).map((option) => {
                        const Icon = option.icon;
                        const active =
                          preferences.state.appearance === option.key;

                        return (
                          <button
                            key={option.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              preferences.setAppearance(
                                option.key as AppearancePreference,
                              );
                            }}
                            className={clsx(
                              "flex flex-col rounded-sm border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border/80 bg-card hover:border-primary",
                            )}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-card text-primary">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                              </div>
                              <span
                                className={clsx(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-primary-foreground transition-colors",
                                  active
                                    ? "border-primary bg-primary dark:border-ring dark:bg-primary"
                                    : "border-input bg-transparent text-transparent dark:border-border",
                                )}
                              >
                                <Check
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </span>
                            </div>
                            <p className="mt-4 text-base font-semibold text-foreground">
                              {option.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    </section>

                    <section data-testid="preferences-language-card" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                          <Globe2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-foreground dark:text-foreground">
                            {t("preferences.language.title")}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t("preferences.language.description")}
                          </p>
                          <div className="mt-4">
                            <PreferenceSelect
                              label={t("preferences.language.label")}
                              value={preferences.state.locale}
                              options={[
                                {
                                  value: "pt-PT",
                                  label: t("language.name.pt-PT"),
                                },
                                {
                                  value: "pt-BR",
                                  label: t("language.name.pt-BR"),
                                },
                                {
                                  value: "en-US",
                                  label: t("language.name.en-US"),
                                },
                                {
                                  value: "es-ES",
                                  label: t("language.name.es-ES"),
                                },
                              ]}
                              onChange={(value) => {
                                preferences.setLocale(
                                  value as PreferenceLocale,
                                );
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section data-testid="preferences-schedule-card" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                        <Clock3 className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                          {t("preferences.schedule.title")}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {t("preferences.schedule.description")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <PreferenceSelect
                        label={t("preferences.schedule.currencyCodeLabel")}
                        value={preferences.state.currencyCode}
                        options={CURRENCY_CODE_OPTIONS}
                        onChange={(value) => {
                          preferences.setCurrencyCode(
                            value as CurrencyCodePreference,
                          );
                        }}
                      />
                      <PreferenceSelect
                        label={t("preferences.schedule.timezoneLabel")}
                        value={preferences.state.timezone}
                        options={TIMEZONE_OPTIONS}
                        onChange={preferences.setTimezone}
                      />
                      <PreferenceSelect
                        label={t("preferences.schedule.dateFormatLabel")}
                        value={preferences.state.dateFormat}
                        options={DATE_FORMAT_OPTIONS}
                        onChange={(value) => {
                          preferences.setDateFormat(
                            value as DateFormatPreference,
                          );
                        }}
                      />

                      <PreferenceSelect
                        label={t("preferences.schedule.timeFormatLabel")}
                        value={preferences.state.timeFormat}
                        options={timeFormatOptions}
                        onChange={(value) => {
                          preferences.setTimeFormat(
                            value as TimeFormatPreference,
                          );
                        }}
                      />
                      <PreferenceSelect
                        label={t("preferences.schedule.dayStartLabel")}
                        value={preferences.state.dayStart}
                        options={DAY_START_OPTIONS}
                        onChange={preferences.setDayStart}
                      />
                      <PreferenceSelect
                        label={t("preferences.schedule.dayEndLabel")}
                        value={preferences.state.dayEnd}
                        options={DAY_END_OPTIONS}
                        onChange={preferences.setDayEnd}
                      />
                    </div>
                  </section>
                </div>
              ) : (
                <section data-testid="preferences-notifications-card" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                        {t("preferences.notifications.title")}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t("preferences.notifications.description")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    {visibleNotificationItems.map((item, index) => {
                      const checked =
                        preferences.state.emailNotifications[item.key];

                      return (
                        <label
                          key={item.key}
                          className={clsx(
                            "flex cursor-pointer items-start justify-between gap-4 py-4 transition-colors hover:bg-muted/50",
                            index > 0 &&
                              "border-t border-border/80",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground dark:text-foreground">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                              {item.description}
                            </p>
                          </div>

                          <HubSwitch
                            id={`email-notification-${item.key}`}
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              if (nextChecked !== checked) preferences.toggleEmailNotification(item.key);
                            }}
                            aria-label={`${t("preferences.notifications.toggleLabel")}: ${item.title}`}
                            className="mt-1"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
  );
}
