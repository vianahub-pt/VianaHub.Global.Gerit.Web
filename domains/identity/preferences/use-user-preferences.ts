"use client";

import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { STORAGE_KEYS } from "@/core/constants/storage-keys";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "@/platform/storage";
import { type Language } from "@/platform/i18n";

const USER_PREFERENCES_STORAGE_KEY_PREFIX = STORAGE_KEYS.userPreferencesPrefix;
const USER_PREFERENCES_CURRENT_STORAGE_KEY =
  STORAGE_KEYS.userPreferencesCurrent;

export type PreferencesTab = "general" | "email";
export type AppearancePreference = "light" | "dark";
export type PreferenceLocale = Language;
export type DateFormatPreference = "DD-MM-YYYY" | "MM/DD/YYYY" | "DD/MM/YYYY";
export type TimeFormatPreference = "24h" | "12h";
export type CurrencyCodePreference = "EUR" | "USD" | "BRL";
export type NotificationPreferenceKey =
  | "newsletter"
  | "integration"
  | "weeklyReport"
  | "longRunningTimer"
  | "scheduledReports"
  | "approval"
  | "timeOff"
  | "alerts"
  | "reminders"
  | "planner"
  | "invoices";

interface UserPreferencesState {
  activeTab: PreferencesTab;
  appearance: AppearancePreference;
  locale: PreferenceLocale;
  currencyCode: CurrencyCodePreference;
  timezone: string;
  dateFormat: DateFormatPreference;
  timeFormat: TimeFormatPreference;
  dayStart: string;
  dayEnd: string;
  emailNotifications: Record<NotificationPreferenceKey, boolean>;
  hydrated: boolean;
}

interface UserPreferencesApiResponse {
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

interface UserPreferencesApiPayload {
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

interface StoredUserPreferencesSnapshot {
  recordId: number | null;
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

type PreferencesSaveStatus = "idle" | "saving" | "saved" | "error";

type UserPreferencesAction =
  | { type: "HYDRATE"; payload: UserPreferencesState }
  | { type: "SET_ACTIVE_TAB"; payload: PreferencesTab }
  | { type: "SET_APPEARANCE"; payload: AppearancePreference }
  | { type: "SET_LOCALE"; payload: PreferenceLocale }
  | { type: "SET_CURRENCY_CODE"; payload: CurrencyCodePreference }
  | { type: "SET_TIMEZONE"; payload: string }
  | { type: "SET_DATE_FORMAT"; payload: DateFormatPreference }
  | { type: "SET_TIME_FORMAT"; payload: TimeFormatPreference }
  | { type: "SET_DAY_START"; payload: string }
  | { type: "SET_DAY_END"; payload: string }
  | { type: "TOGGLE_EMAIL_NOTIFICATION"; payload: NotificationPreferenceKey };

const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationPreferenceKey,
  boolean
> = {
  newsletter: false,
  integration: true,
  weeklyReport: false,
  longRunningTimer: false,
  scheduledReports: true,
  approval: true,
  timeOff: true,
  alerts: true,
  reminders: true,
  planner: true,
  invoices: false,
};

const INITIAL_STATE: UserPreferencesState = {
  activeTab: "general",
  appearance: "light",
  locale: "pt-PT",
  currencyCode: "EUR",
  timezone: "Europe/Lisbon",
  dateFormat: "DD-MM-YYYY",
  timeFormat: "24h",
  dayStart: "09:00",
  dayEnd: "18:00",
  emailNotifications: DEFAULT_NOTIFICATION_PREFERENCES,
  hydrated: false,
};

function getPreferencesStorageKey(sessionKey: string) {
  return `${USER_PREFERENCES_STORAGE_KEY_PREFIX}.${sessionKey}`;
}

function normalizeLocaleValue(
  value: unknown,
  fallback: PreferenceLocale,
): PreferenceLocale {
  return value === "en-US" || value === "pt-PT" || value === "pt-BR" || value === "es-ES"
    ? value
    : fallback;
}

function normalizeAppearanceValue(
  value: unknown,
  fallback: AppearancePreference,
): AppearancePreference {
  return value === "dark" || value === "light" ? value : fallback;
}

function normalizeCurrencyCodeValue(
  value: unknown,
  fallback: CurrencyCodePreference,
): CurrencyCodePreference {
  return value === "EUR" || value === "USD" || value === "BRL"
    ? value
    : fallback;
}

function normalizeTimeFormat(
  value: unknown,
  fallback: TimeFormatPreference,
): TimeFormatPreference {
  return value === "12h" || value === "24h" ? value : fallback;
}

function normalizeDateFormat(
  value: unknown,
  fallback: DateFormatPreference,
): DateFormatPreference {
  if (value === "MM/DD/YYYY" || value === "MM-DD-YYYY") {
    return "MM/DD/YYYY";
  }

  if (value === "DD-MM-YYYY") {
    return "DD-MM-YYYY";
  }

  if (value === "DD/MM/YYYY") {
    return "DD/MM/YYYY";
  }
  return fallback;
}

function normalizeDayStart(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const match = value.match(/^(\d{2}):(\d{2})/);

  if (!match) {
    return fallback;
  }

  return `${match[1]}:${match[2]}`;
}

function normalizeDayEnd(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const match = value.match(/^(\d{2}):(\d{2})/);

  if (!match) {
    return fallback;
  }

  return `${match[1]}:${match[2]}`;
}

function normalizeNotificationPreferences(
  value: unknown,
): Record<NotificationPreferenceKey, boolean> {
  const notifications = { ...DEFAULT_NOTIFICATION_PREFERENCES };

  if (typeof value !== "object" || value === null) {
    return notifications;
  }

  const candidate = value as Record<string, unknown>;

  (
    Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as NotificationPreferenceKey[]
  ).forEach((key) => {
    if (typeof candidate[key] === "boolean") {
      notifications[key] = candidate[key];
    }
  });

  return notifications;
}

function toApiDayStart(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function createDefaultState(input: {
  appearance: AppearancePreference;
  locale: PreferenceLocale;
}): UserPreferencesState {
  return {
    ...INITIAL_STATE,
    activeTab: "general",
    appearance: input.appearance,
    locale: input.locale,
    currencyCode: INITIAL_STATE.currencyCode,
    emailNotifications: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    hydrated: true,
  };
}

function isUserPreferencesApiResponse(
  payload: unknown,
): payload is UserPreferencesApiResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

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

function mapApiResponseToState(
  payload: UserPreferencesApiResponse,
  fallbackState: UserPreferencesState,
): UserPreferencesState {
  return {
    activeTab: "general",
    appearance: normalizeAppearanceValue(
      payload.appearance,
      fallbackState.appearance,
    ),
    locale: normalizeLocaleValue(payload.locale, fallbackState.locale),
    currencyCode: normalizeCurrencyCodeValue(
      payload.currencyCode,
      fallbackState.currencyCode,
    ),
    timezone:
      typeof payload.timezone === "string" && payload.timezone.trim().length > 0
        ? payload.timezone
        : fallbackState.timezone,
    dateFormat: normalizeDateFormat(
      payload.dateFormat,
      fallbackState.dateFormat,
    ),
    timeFormat: normalizeTimeFormat(
      payload.timeFormat,
      fallbackState.timeFormat,
    ),
    dayStart: normalizeDayStart(payload.dayStart, fallbackState.dayStart),
    dayEnd: normalizeDayEnd(payload.dayEnd, fallbackState.dayEnd),
    emailNotifications: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      newsletter: payload.emailNewsletter,
      weeklyReport: payload.emailWeeklyReport,
      approval: payload.emailApproval,
      alerts: payload.emailAlerts,
      reminders: payload.emailReminders,
      planner: payload.emailPlanner,
    },
    hydrated: true,
  };
}

function buildApiPayload(
  state: UserPreferencesState,
): UserPreferencesApiPayload {
  return {
    appearance: state.appearance,
    locale: state.locale,
    currencyCode: state.currencyCode,
    timezone: state.timezone,
    dateFormat: state.dateFormat,
    timeFormat: state.timeFormat,
    dayStart: toApiDayStart(state.dayStart),
    dayEnd: toApiDayStart(state.dayEnd),
    emailNewsletter: state.emailNotifications.newsletter,
    emailWeeklyReport: state.emailNotifications.weeklyReport,
    emailApproval: state.emailNotifications.approval,
    emailAlerts: state.emailNotifications.alerts,
    emailReminders: state.emailNotifications.reminders,
    emailPlanner: state.emailNotifications.planner,
  };
}

function buildStoredPreferencesSnapshot(
  state: UserPreferencesState,
  recordId: number | null,
): StoredUserPreferencesSnapshot {
  return {
    recordId,
    appearance: state.appearance,
    locale: state.locale,
    currencyCode: state.currencyCode,
    timezone: state.timezone,
    dateFormat: state.dateFormat,
    timeFormat: state.timeFormat,
    dayStart: state.dayStart,
    dayEnd: state.dayEnd,
    emailNotifications: { ...state.emailNotifications },
  };
}

function persistStoredPreferences(
  sessionKey: string,
  state: UserPreferencesState,
  recordId: number | null,
) {
  const snapshot = buildStoredPreferencesSnapshot(state, recordId);
  const serializedSnapshot = JSON.stringify(snapshot);

  setStorageItem(getPreferencesStorageKey(sessionKey), serializedSnapshot);
  setStorageItem(USER_PREFERENCES_CURRENT_STORAGE_KEY, serializedSnapshot);
}

function restoreStoredPreferences(
  sessionKey: string,
): { state: UserPreferencesState; recordId: number | null } | null {
  const rawSnapshot = getStorageItem(getPreferencesStorageKey(sessionKey));

  if (!rawSnapshot) {
    return null;
  }

  try {
    const parsedSnapshot = JSON.parse(rawSnapshot) as unknown;

    if (typeof parsedSnapshot !== "object" || parsedSnapshot === null) {
      removeStorageItem(getPreferencesStorageKey(sessionKey));
      return null;
    }

    const candidate = parsedSnapshot as Partial<StoredUserPreferencesSnapshot>;
    const fallbackState = createDefaultState({
      appearance: INITIAL_STATE.appearance,
      locale: INITIAL_STATE.locale,
    });

    return {
      recordId:
        typeof candidate.recordId === "number" ? candidate.recordId : null,
      state: {
        activeTab: "general",
        appearance: normalizeAppearanceValue(
          candidate.appearance,
          fallbackState.appearance,
        ),
        locale: normalizeLocaleValue(candidate.locale, fallbackState.locale),
        currencyCode: normalizeCurrencyCodeValue(
          candidate.currencyCode,
          fallbackState.currencyCode,
        ),
        timezone:
          typeof candidate.timezone === "string" &&
          candidate.timezone.trim().length > 0
            ? candidate.timezone
            : fallbackState.timezone,
        dateFormat: normalizeDateFormat(
          candidate.dateFormat,
          fallbackState.dateFormat,
        ),
        timeFormat: normalizeTimeFormat(
          candidate.timeFormat,
          fallbackState.timeFormat,
        ),
        dayStart: normalizeDayStart(candidate.dayStart, fallbackState.dayStart),
        dayEnd: normalizeDayEnd(candidate.dayEnd, fallbackState.dayEnd),
        emailNotifications: normalizeNotificationPreferences(
          candidate.emailNotifications,
        ),
        hydrated: true,
      },
    };
  } catch {
    removeStorageItem(getPreferencesStorageKey(sessionKey));
    return null;
  }
}

function extractRecordId(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as { id?: unknown };

  return typeof candidate.id === "number" ? candidate.id : null;
}

function normalizeApiErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return "Nao foi possivel guardar as preferencias.";
  }

  const candidate = payload as {
    message?: unknown;
    title?: unknown;
    error?: unknown;
    errors?: unknown;
  };

  if (
    typeof candidate.message === "string" &&
    candidate.message.trim().length > 0
  ) {
    return candidate.message;
  }

  if (
    typeof candidate.error === "string" &&
    candidate.error.trim().length > 0
  ) {
    return candidate.error;
  }

  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    const firstErrorGroup = Object.values(
      candidate.errors as Record<string, unknown>,
    ).find((value) => Array.isArray(value) && value.length > 0);

    if (
      Array.isArray(firstErrorGroup) &&
      typeof firstErrorGroup[0] === "string" &&
      firstErrorGroup[0].trim().length > 0
    ) {
      return firstErrorGroup[0];
    }
  }

  if (
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0
  ) {
    return candidate.title;
  }

  return "Nao foi possivel guardar as preferencias.";
}

function userPreferencesReducer(
  state: UserPreferencesState,
  action: UserPreferencesAction,
): UserPreferencesState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...action.payload,
        activeTab: "general",
      };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };
    case "SET_APPEARANCE":
      return { ...state, appearance: action.payload };
    case "SET_LOCALE":
      return { ...state, locale: action.payload };
    case "SET_CURRENCY_CODE":
      return { ...state, currencyCode: action.payload };
    case "SET_TIMEZONE":
      return { ...state, timezone: action.payload };
    case "SET_DATE_FORMAT":
      return { ...state, dateFormat: action.payload };
    case "SET_TIME_FORMAT":
      return { ...state, timeFormat: action.payload };
    case "SET_DAY_START":
      return { ...state, dayStart: action.payload };
    case "SET_DAY_END":
      return { ...state, dayEnd: action.payload };
    case "TOGGLE_EMAIL_NOTIFICATION":
      return {
        ...state,
        emailNotifications: {
          ...state.emailNotifications,
          [action.payload]: !state.emailNotifications[action.payload],
        },
      };
    default:
      return state;
  }
}

export function useUserPreferences() {
  const { session, fetchWithAuth } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { state: translationState, setLocale } = useTranslation();
  const [state, dispatch] = useReducer(userPreferencesReducer, INITIAL_STATE);
  const hydratedUserKeyRef = useRef<string | null>(null);
  const recordIdRef = useRef<number | null>(null);
  const lastSyncedPayloadRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<PreferencesSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const themeAppearance = useMemo(
    () => normalizeAppearanceValue(resolvedTheme, INITIAL_STATE.appearance),
    [resolvedTheme],
  );
  const normalizedLocale = useMemo(
    () => normalizeLocaleValue(translationState.locale, INITIAL_STATE.locale),
    [translationState.locale],
  );
  const sessionKey = useMemo(
    () => (session === null ? null : `${session.tenantId}:${session.userId}`),
    [session],
  );

  useEffect(() => {
    if (sessionKey !== null) {
      return;
    }

    hydratedUserKeyRef.current = null;
    recordIdRef.current = null;
    lastSyncedPayloadRef.current = null;
    setSaveStatus("idle");
    setSaveError(null);

    dispatch({
      type: "HYDRATE",
      payload: INITIAL_STATE,
    });
  }, [sessionKey]);

  useEffect(() => {
    if (!session || !sessionKey) {
      return;
    }

    if (hydratedUserKeyRef.current === sessionKey) {
      return;
    }

    const restoredSnapshot = restoreStoredPreferences(sessionKey);
    const fallbackState =
      restoredSnapshot?.state ??
      createDefaultState({
        appearance: themeAppearance,
        locale: normalizedLocale,
      });
    let ignore = false;

    const applyState = (
      nextState: UserPreferencesState,
      recordId: number | null,
    ) => {
      recordIdRef.current = recordId;
      lastSyncedPayloadRef.current = JSON.stringify(buildApiPayload(nextState));
      persistStoredPreferences(sessionKey, nextState, recordId);
      setSaveStatus("saved");
      setSaveError(null);
      dispatch({
        type: "HYDRATE",
        payload: nextState,
      });

      if (nextState.appearance !== themeAppearance) {
        setTheme(nextState.appearance);
      }

      if (nextState.locale !== normalizedLocale) {
        setLocale(nextState.locale);
      }
    };

    if (restoredSnapshot) {
      applyState(restoredSnapshot.state, restoredSnapshot.recordId);
    }

    const hydratePreferences = async () => {
      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/user-preferences/user/${session.userId}`,
          {
            method: "GET",
            headers: {
              "Accept-Language": normalizedLocale,
            },
          },
        );

        if (ignore) {
          return;
        }

        if (response.status === 404) {
          applyState(fallbackState, null);
          return;
        }

        if (!response.ok) {
          throw new Error("Nao foi possivel carregar as preferencias.");
        }

        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;

        if (!isUserPreferencesApiResponse(responsePayload)) {
          throw new Error("Resposta invalida de preferencias.");
        }

        const hydratedState = mapApiResponseToState(
          responsePayload,
          fallbackState,
        );

        applyState(hydratedState, responsePayload.id);
      } catch {
        if (ignore) {
          return;
        }

        applyState(fallbackState, restoredSnapshot?.recordId ?? null);
      } finally {
        hydratedUserKeyRef.current = sessionKey;
      }
    };

    void hydratePreferences();

    return () => {
      ignore = true;
    };
  }, [
    fetchWithAuth,
    normalizedLocale,
    session,
    sessionKey,
    setLocale,
    setTheme,
    themeAppearance,
  ]);

  const resolveRecordIdByUser = useCallback(async () => {
    if (!session) {
      return null;
    }

    const response = await fetchWithAuth(
      `/api/gerit/v1/user-preferences/user/${session.userId}`,
      {
        method: "GET",
        headers: {
          "Accept-Language": normalizedLocale,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const responsePayload = (await response
      .json()
      .catch(() => null)) as unknown;

    return isUserPreferencesApiResponse(responsePayload)
      ? responsePayload.id
      : null;
  }, [fetchWithAuth, normalizedLocale, session]);

  const persistPreferences = useCallback(
    async (nextState: UserPreferencesState, payloadString: string) => {
      if (!session) {
        return;
      }

      const payload = buildApiPayload(nextState);
      const hasRecord = recordIdRef.current !== null;
      const endpoint = hasRecord
        ? `/api/gerit/v1/user-preferences/${recordIdRef.current}`
        : "/api/gerit/v1/user-preferences";
      const response = await fetchWithAuth(endpoint, {
        method: hasRecord ? "PUT" : "POST",
        headers: {
          "Accept-Language": nextState.locale,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;
        throw new Error(normalizeApiErrorMessage(responsePayload));
      }

      let persistedRecordId = recordIdRef.current;

      if (!hasRecord) {
        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;
        persistedRecordId =
          extractRecordId(responsePayload) ?? (await resolveRecordIdByUser());
      }

      recordIdRef.current = persistedRecordId;
      lastSyncedPayloadRef.current = payloadString;
      setSaveStatus("saved");
      setSaveError(null);

      if (sessionKey) {
        persistStoredPreferences(sessionKey, nextState, persistedRecordId);
      }
    },
    [fetchWithAuth, resolveRecordIdByUser, session, sessionKey],
  );

  useEffect(() => {
    if (!session || !sessionKey || !state.hydrated) {
      return;
    }

    persistStoredPreferences(sessionKey, state, recordIdRef.current);

    const payloadString = JSON.stringify(buildApiPayload(state));

    if (payloadString === lastSyncedPayloadRef.current) {
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    void persistPreferences(state, payloadString).catch((error) => {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Nao foi possivel guardar as preferencias.";

      setSaveStatus("error");
      setSaveError(message);
      console.error("Falha ao guardar preferencias do utilizador.", error);
    });
  }, [persistPreferences, session, sessionKey, state]);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }

    if (state.appearance !== themeAppearance) {
      setTheme(state.appearance);
    }
  }, [setTheme, state.appearance, state.hydrated, themeAppearance]);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }

    if (state.locale !== normalizedLocale) {
      setLocale(state.locale);
    }
  }, [normalizedLocale, setLocale, state.hydrated, state.locale]);

  const actions = useMemo(
    () => ({
      setActiveTab: (tab: PreferencesTab) =>
        dispatch({ type: "SET_ACTIVE_TAB", payload: tab }),
      setAppearance: (appearance: AppearancePreference) =>
        dispatch({ type: "SET_APPEARANCE", payload: appearance }),
      setLocale: (locale: PreferenceLocale) =>
        dispatch({ type: "SET_LOCALE", payload: locale }),
      setCurrencyCode: (currencyCode: CurrencyCodePreference) =>
        dispatch({ type: "SET_CURRENCY_CODE", payload: currencyCode }),
      setTimezone: (timezone: string) =>
        dispatch({ type: "SET_TIMEZONE", payload: timezone }),
      setDateFormat: (dateFormat: DateFormatPreference) =>
        dispatch({ type: "SET_DATE_FORMAT", payload: dateFormat }),
      setTimeFormat: (timeFormat: TimeFormatPreference) =>
        dispatch({ type: "SET_TIME_FORMAT", payload: timeFormat }),
      setDayStart: (dayStart: string) =>
        dispatch({ type: "SET_DAY_START", payload: dayStart }),
      setDayEnd: (dayEnd: string) =>
        dispatch({ type: "SET_DAY_END", payload: dayEnd }),
      toggleEmailNotification: (key: NotificationPreferenceKey) =>
        dispatch({ type: "TOGGLE_EMAIL_NOTIFICATION", payload: key }),
    }),
    [],
  );

  return useMemo(
    () => ({
      state,
      isHydrated: state.hydrated,
      saveStatus,
      saveError,
      ...actions,
    }),
    [actions, saveError, saveStatus, state],
  );
}
