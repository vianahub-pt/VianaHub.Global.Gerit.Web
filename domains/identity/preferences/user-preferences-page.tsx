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
      <span className="text-sm font-medium text-[#4b5961] dark:text-[#d1dde2]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="h-12 rounded-2xl border border-[#d5dde2] bg-white px-4 text-sm text-[#11191f] outline-none transition-colors focus:border-[#06a8a8] dark:border-[#21424d] dark:bg-[#0d1c24] dark:text-[#edf6fb] dark:focus:border-[#11b7ff]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
        <div className="border-b border-[#d9dee2] bg-[#eff2f4] px-4 py-4 dark:border-[#17313a] dark:bg-[#22303a] sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#7a8790] dark:text-[#90a7b1]">
                {t("preferences.sectionLabel")}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#11191f] dark:text-white">
                {t("preferences.title")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
                {t("preferences.subtitle")}
              </p>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#e7f8f7] px-3 py-2 text-xs font-medium text-[#047474] dark:bg-[#0d2930] dark:text-[#83e3e3]">
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
            <div className="rounded-[1.75rem] border border-[#d4dde1] bg-white px-6 py-5 text-sm text-[#4b5961] shadow-[0_24px_60px_rgba(15,23,42,0.1)] dark:border-[#17313a] dark:bg-[#07161d] dark:text-[#d7e1e7]">
              {t("preferences.loading")}
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-[#d9dee2] bg-[#eff2f4] px-4 py-3 dark:border-[#17313a] dark:bg-[#22303a] sm:px-6">
              <div
                className="inline-flex rounded-[1.25rem] bg-[#edf2f4] p-1 dark:bg-[#0c1b23]"
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
                        ? "bg-[#06a8a8] text-white shadow-[0_18px_30px_rgba(6,168,168,0.22)]"
                        : "text-[#6a767e] hover:text-[#11191f] dark:text-[#9cb1ba] dark:hover:text-white",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
              {preferences.saveStatus === "error" && preferences.saveError ? (
                <div className="mb-3 rounded-[1.25rem] border border-[#f0c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9f2f2f] dark:border-[#5c2a2f] dark:bg-[#2a1417] dark:text-[#ffb8b8]">
                  {preferences.saveError}
                </div>
              ) : null}

              {preferences.state.activeTab === "general" ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
                  <section className="rounded-[1.75rem] border border-[#d7e0e5] bg-white p-5 dark:border-[#17313a] dark:bg-[#0a171e]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f7f6] text-[#06a8a8] dark:bg-[#0e2d35] dark:text-[#79e0e0]">
                        <Palette className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[#11191f] dark:text-white">
                          {t("preferences.appearance.title")}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
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
                                ? "border-[#06a8a8] bg-[#effcfb] shadow-[0_20px_40px_rgba(6,168,168,0.14)] dark:border-[#11b7ff] dark:bg-[#0d2930]"
                                : "border-[#d6dde2] bg-[#f8fafb] hover:border-[#06a8a8] dark:border-[#21424d] dark:bg-[#0d1c24] dark:hover:border-[#11b7ff]",
                            )}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#06a8a8] dark:bg-[#08161d] dark:text-[#9be8f0]">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                              </div>
                              <span
                                className={clsx(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-white transition-colors",
                                  active
                                    ? "border-[#06a8a8] bg-[#06a8a8] dark:border-[#11b7ff] dark:bg-[#11b7ff]"
                                    : "border-[#c9d3d8] bg-transparent text-transparent dark:border-[#335260]",
                                )}
                              >
                                <Check
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </span>
                            </div>
                            <p className="mt-5 text-base font-semibold text-[#11191f] dark:text-white">
                              {option.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-8 rounded-[1.5rem] border border-[#d6dde2] bg-[#f8fafb] p-5 dark:border-[#21424d] dark:bg-[#0d1c24]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#06a8a8] dark:bg-[#08161d] dark:text-[#9be8f0]">
                          <Globe2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="w-full">
                          <h3 className="text-base font-semibold text-[#11191f] dark:text-white">
                            {t("preferences.language.title")}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
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

                  <section className="rounded-[1.75rem] border border-[#d7e0e5] bg-white p-5 dark:border-[#17313a] dark:bg-[#0a171e]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf3ff] text-[#3b82f6] dark:bg-[#10263d] dark:text-[#8bbcff]">
                        <Clock3 className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[#11191f] dark:text-white">
                          {t("preferences.schedule.title")}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
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
                <section className="rounded-[1.75rem] border border-[#d7e0e5] bg-white p-5 dark:border-[#17313a] dark:bg-[#0a171e]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef7ff] text-[#3b82f6] dark:bg-[#10263d] dark:text-[#8bbcff]">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[#11191f] dark:text-white">
                        {t("preferences.notifications.title")}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
                        {t("preferences.notifications.description")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[#d7e0e5] dark:border-[#21424d]">
                    {visibleNotificationItems.map((item, index) => {
                      const checked =
                        preferences.state.emailNotifications[item.key];

                      return (
                        <label
                          key={item.key}
                          className={clsx(
                            "flex cursor-pointer items-start justify-between gap-4 bg-[#fbfcfd] px-5 py-4 transition-colors hover:bg-[#f3f8fa] dark:bg-[#0d1c24] dark:hover:bg-[#11222b]",
                            index > 0 &&
                              "border-t border-[#d7e0e5] dark:border-[#21424d]",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#11191f] dark:text-white">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[#60707a] dark:text-[#b9cbd3]">
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
                            <span className="flex h-7 w-12 items-center rounded-full bg-[#d7e0e5] px-1 transition-colors peer-checked:bg-[#06a8a8] dark:bg-[#284451] dark:peer-checked:bg-[#11b7ff]">
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
