import type {
  AppearancePreference,
  CurrencyCodePreference,
  DateFormatPreference,
  NotificationPreferenceKey,
  PreferenceLocale,
  TimeFormatPreference,
} from "@/domains/identity/preferences/use-user-preferences";

export interface UserPreferencesApiState {
  appearance: AppearancePreference;
  locale: PreferenceLocale;
  currencyCode: CurrencyCodePreference;
  timezone: string;
  dateFormat: DateFormatPreference;
  timeFormat: TimeFormatPreference;
  dayStart: string;
  dayEnd: string;
  emailNotifications: Record<NotificationPreferenceKey, boolean>;
}

export interface UserPreferencesApiResponse {
  id: number;
  tenantId: number;
  tenant?: string;
  userId: number;
  user?: string;
  appearance: string | null;
  locale: string | null;
  currencyCode: string | null;
  timezone: string | null;
  dateFormat: string | null;
  timeFormat: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  emailNewsletter: boolean;
  emailWeeklyReport: boolean;
  emailApproval: boolean;
  emailAlerts: boolean;
  emailReminders: boolean;
  emailPlanner: boolean;
  isActive?: boolean;
}

export function isUserPreferencesApiResponse(
  payload: unknown,
): payload is UserPreferencesApiResponse {
  if (typeof payload !== "object" || payload === null) return false;

  const candidate = payload as Partial<UserPreferencesApiResponse>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.tenantId === "number" &&
    typeof candidate.userId === "number" &&
    typeof candidate.emailNewsletter === "boolean" &&
    typeof candidate.emailWeeklyReport === "boolean" &&
    typeof candidate.emailApproval === "boolean" &&
    typeof candidate.emailAlerts === "boolean" &&
    typeof candidate.emailReminders === "boolean" &&
    typeof candidate.emailPlanner === "boolean"
  );
}

export interface UserPreferencesApiPayload {
  appearance: AppearancePreference;
  locale: PreferenceLocale;
  currencyCode: CurrencyCodePreference;
  timezone: string;
  dateFormat: DateFormatPreference;
  timeFormat: TimeFormatPreference;
  dayStart: string;
  dayEnd: string;
  emailNewsletter: boolean;
  emailWeeklyReport: boolean;
  emailApproval: boolean;
  emailAlerts: boolean;
  emailReminders: boolean;
  emailPlanner: boolean;
}

export type PreferencesLoadOutcome =
  | { kind: "loaded" }
  | { kind: "missing" }
  | { kind: "error"; messageKey: "forbidden" | "loadFailed" };

export function classifyPreferencesLoadStatus(
  status: number,
): PreferencesLoadOutcome {
  if (status >= 200 && status < 300) return { kind: "loaded" };
  if (status === 410) return { kind: "missing" };
  if (status === 403) return { kind: "error", messageKey: "forbidden" };
  return { kind: "error", messageKey: "loadFailed" };
}

export function canPersistPreferencesAfterLoad(
  status: "loading" | "loaded" | "missing" | "error",
) {
  return status === "loaded" || status === "missing";
}

export function preferencesSaveErrorKey(status: number) {
  switch (status) {
    case 400:
      return "invalid" as const;
    case 403:
      return "forbidden" as const;
    case 409:
      return "conflict" as const;
    case 410:
      return "unavailable" as const;
    default:
      return "saveFailed" as const;
  }
}

export function buildUserPreferencesApiPayload(
  state: UserPreferencesApiState,
): UserPreferencesApiPayload {
  return {
    appearance: state.appearance,
    locale: state.locale,
    currencyCode: state.currencyCode,
    timezone: state.timezone,
    dateFormat: state.dateFormat,
    timeFormat: state.timeFormat,
    dayStart: state.dayStart,
    dayEnd: state.dayEnd,
    emailNewsletter: state.emailNotifications.newsletter,
    emailWeeklyReport: state.emailNotifications.weeklyReport,
    emailApproval: state.emailNotifications.approval,
    emailAlerts: state.emailNotifications.alerts,
    emailReminders: state.emailNotifications.reminders,
    emailPlanner: state.emailNotifications.planner,
  };
}
