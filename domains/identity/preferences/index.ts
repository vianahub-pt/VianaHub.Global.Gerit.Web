export const identityPreferencesModule = {
  route: "/preferences",
} as const;

export { IdentityPreferencesProvider, useIdentityPreferences } from "@/domains/identity/preferences/preferences-provider";

export {
  type AppearancePreference,
  type CurrencyCodePreference,
  type DateFormatPreference,
  type NotificationPreferenceKey,
  type PreferenceLocale,
  type PreferencesTab,
  type TimeFormatPreference,
} from "@/domains/identity/preferences/use-user-preferences";

export { UserPreferencesPage } from "@/domains/identity/preferences/user-preferences-page";
