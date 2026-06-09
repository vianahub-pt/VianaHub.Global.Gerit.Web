"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTenant } from "@/platform/tenant/tenant-context";
import { useHttpClient } from "@/platform/api/http/http-client";

interface SubscriptionSnapshot {
  tenantId: number;
  planName: string | null;
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
}

const SubscriptionContext = createContext<{
  state: SubscriptionSnapshot | null;
  isLoading: boolean;
} | null>(null);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeTenantId } = useTenant();
  const httpClient = useHttpClient();
  const [state, setState] = useState<SubscriptionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeTenantId === null) {
      setState(null);
      setIsLoading(false);
      return;
    }

    let disposed = false;

    const loadSubscription = async () => {
      setIsLoading(true);

      try {
        const response = await httpClient.get(
          `/api/gerit/v1/subscriptions/tenant/${activeTenantId}`,
        );

        if (!response || !response.ok) {
          if (!disposed) {
            setState({
              tenantId: activeTenantId,
              planName: null,
              status: null,
              trialEndsAt: null,
              currentPeriodEndsAt: null,
            });
          }
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (!disposed) {
          setState({
            tenantId: activeTenantId,
            planName:
              typeof payload?.planName === "string" ? payload.planName : null,
            status:
              typeof payload?.status === "string" ? payload.status : null,
            trialEndsAt:
              typeof payload?.trialEndsAt === "string"
                ? payload.trialEndsAt
                : null,
            currentPeriodEndsAt:
              typeof payload?.currentPeriodEndsAt === "string"
                ? payload.currentPeriodEndsAt
                : null,
          });
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadSubscription();

    return () => {
      disposed = true;
    };
  }, [activeTenantId, httpClient]);

  const value = useMemo(
    () => ({
      state,
      isLoading,
    }),
    [isLoading, state],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);

  if (!context) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }

  return context;
}

