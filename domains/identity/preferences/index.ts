export const identityPreferencesModule = {
  route: "/settings/preferences",
} as const;

export {
  useUserPreferences as useIdentityPreferences,
  type AppearancePreference,
  type CurrencyCodePreference,
  type DateFormatPreference,
  type NotificationPreferenceKey,
  type PreferenceLocale,
  type PreferencesTab,
  type TimeFormatPreference,
} from "@/domains/identity/preferences/use-user-preferences";

export { UserPreferencesPage } from "@/domains/identity/preferences/user-preferences-page";
