"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useUserPreferences } from "@/domains/identity/preferences/use-user-preferences";

type IdentityPreferencesValue = ReturnType<typeof useUserPreferences>;
const IdentityPreferencesContext = createContext<IdentityPreferencesValue | null>(null);

export function IdentityPreferencesProvider({ children }: { children: ReactNode }) {
  const preferences = useUserPreferences();
  return (
    <IdentityPreferencesContext.Provider value={preferences}>
      {children}
    </IdentityPreferencesContext.Provider>
  );
}

export function useIdentityPreferences() {
  const preferences = useContext(IdentityPreferencesContext);
  if (!preferences) {
    throw new Error("useIdentityPreferences must be used within IdentityPreferencesProvider");
  }
  return preferences;
}
