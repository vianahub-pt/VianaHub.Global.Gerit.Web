"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import { useSubscription } from "@/platform/subscription/subscription-context";

interface Entitlements {
  hasPremiumFeatures: boolean;
  maxUsers: number | null;
  maxPhotosPerIntervention: number | null;
  allowedFileTypes: string[] | null;
}

const EntitlementsContext = createContext<Entitlements>({
  hasPremiumFeatures: false,
  maxUsers: null,
  maxPhotosPerIntervention: null,
  allowedFileTypes: null,
});

const PLAN_ENTITLEMENTS: Record<string, Entitlements> = {
  basic: {
    hasPremiumFeatures: false,
    maxUsers: 10,
    maxPhotosPerIntervention: 15,
    allowedFileTypes: ["jpg", "jpeg", "png", "pdf"],
  },
  pro: {
    hasPremiumFeatures: true,
    maxUsers: 50,
    maxPhotosPerIntervention: 50,
    allowedFileTypes: ["jpg", "jpeg", "png", "pdf", "doc", "docx"],
  },
  enterprise: {
    hasPremiumFeatures: true,
    maxUsers: null,
    maxPhotosPerIntervention: null,
    allowedFileTypes: null,
  },
};

export function EntitlementsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state } = useSubscription();

  const value = useMemo(() => {
    if (!state?.planName) {
      return {
        hasPremiumFeatures: false,
        maxUsers: null,
        maxPhotosPerIntervention: null,
        allowedFileTypes: null,
      };
    }

    const normalizedPlanName = state.planName.toLowerCase();
    return (
      PLAN_ENTITLEMENTS[normalizedPlanName] ?? {
        hasPremiumFeatures: false,
        maxUsers: null,
        maxPhotosPerIntervention: null,
        allowedFileTypes: null,
      }
    );
  }, [state?.planName]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  return useContext(EntitlementsContext);
}

