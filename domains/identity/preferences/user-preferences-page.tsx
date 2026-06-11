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
import { WorkspaceShell } from "@/shared/layout";
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
    <WorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-muted px-4 py-4 dark:border-border dark:bg-muted sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground dark:text-muted-foreground">
                {t("preferences.sectionLabel")}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground dark:text-foreground">
                {t("preferences.title")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                {t("preferences.subtitle")}
              </p>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary dark:bg-primary/10 dark:text-primary">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {preferences.saveStatus === "saving"
                ? t("preferences.autosave.saving")
                : preferences.saveStatus === "error"
                  ? t("preferences.autosave.error")
                  : preferences.saveStatus === "saved"
                    ? t("preferences.autosave.saved")
                    : t("preferences.autosave.idle")}
            </div>
          </div>
        </div>

        {isHydrating || !preferences.isHydrated || !session ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="rounded-[1.75rem] border border-input bg-background px-6 py-5 text-sm text-muted-foreground shadow-[0_24px_60px_rgba(15,23,42,0.1)] dark:border-border dark:bg-background dark:text-foreground">
              {t("preferences.loading")}
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-muted px-4 py-3 dark:border-border dark:bg-muted sm:px-6">
              <div
                className="inline-flex rounded-[1.25rem] bg-muted p-1 dark:bg-muted"
                role="tablist"
                aria-label={t("preferences.title")}
              >
                {(
                  [
                    { key: "general", label: t("preferences.tabs.general") },
                    { key: "email", label: t("preferences.tabs.email") },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={preferences.state.activeTab === tab.key}
                    onClick={() => {
                      preferences.setActiveTab(tab.key);
                    }}
                    className={clsx(
                      "rounded-[1rem] px-4 py-2.5 text-sm font-semibold tracking-[0.02em] transition-colors sm:px-5",
                      preferences.state.activeTab === tab.key
                        ? "bg-primary text-primary-foreground shadow-[0_18px_30px_rgba(6,168,168,0.22)]"
                        : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
              {preferences.saveStatus === "error" && preferences.saveError ? (
                <div className="mb-3 rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive dark:border-destructive/30 dark:bg-destructive/10 dark:text-destructive">
                  {preferences.saveError}
                </div>
              ) : null}

              {preferences.state.activeTab === "general" ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
                  <section className="rounded-[1.75rem] border border-border bg-background p-5 dark:border-border dark:bg-card">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary">
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
                              "flex flex-col rounded-[1.5rem] border p-5 text-left transition-colors",
                              active
                                ? "border-primary bg-primary/10 shadow-[0_20px_40px_rgba(6,168,168,0.14)] dark:border-ring dark:bg-primary/10"
                                : "border-input bg-card hover:border-primary dark:border-border dark:bg-card dark:hover:border-ring",
                            )}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-primary dark:bg-background dark:text-primary">
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
                            <p className="mt-5 text-base font-semibold text-foreground dark:text-foreground">
                              {option.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-8 rounded-[1.5rem] border border-input bg-card p-5 dark:border-border dark:bg-card">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-primary dark:bg-background dark:text-primary">
                          <Globe2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="w-full">
                          <h3 className="text-base font-semibold text-foreground dark:text-foreground">
                            {t("preferences.language.title")}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                            {t("preferences.language.description")}
                          </p>
                          <div className="mt-5">
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
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-border bg-background p-5 dark:border-border dark:bg-card">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ring/10 text-ring dark:bg-ring/10 dark:text-ring">
                        <Clock3 className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                          {t("preferences.schedule.title")}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                          {t("preferences.schedule.description")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
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
                <section className="rounded-[1.75rem] border border-border bg-background p-5 dark:border-border dark:bg-card">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ring/10 text-ring dark:bg-ring/10 dark:text-ring">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground dark:text-foreground">
                        {t("preferences.notifications.title")}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                        {t("preferences.notifications.description")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-border dark:border-border">
                    {visibleNotificationItems.map((item, index) => {
                      const checked =
                        preferences.state.emailNotifications[item.key];

                      return (
                        <label
                          key={item.key}
                          className={clsx(
                            "flex cursor-pointer items-start justify-between gap-4 bg-card px-5 py-4 transition-colors hover:bg-muted dark:bg-card dark:hover:bg-card",
                            index > 0 &&
                              "border-t border-border dark:border-border",
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

                          <span className="relative mt-1 shrink-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                preferences.toggleEmailNotification(item.key);
                              }}
                              aria-label={`${t("preferences.notifications.toggleLabel")}: ${item.title}`}
                              className="peer sr-only"
                            />
                            <span className="flex h-7 w-12 items-center rounded-full bg-muted px-1 transition-colors peer-checked:bg-primary dark:bg-muted dark:peer-checked:bg-primary">
                              <span className="h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                            </span>
                          </span>
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
    </WorkspaceShell>
  );
}
