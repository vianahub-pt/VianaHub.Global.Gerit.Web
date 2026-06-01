"use client";

import { useMemo } from "react";
import { useAuth } from "@/platform/auth";
import { useEntitlements } from "@/platform/entitlements/entitlements-context";

export function useAccessControl() {
  const { hasPermission, isAuthenticated } = useAuth();
  const entitlements = useEntitlements();

  return useMemo(
    () => ({
      can: (resource: string, action: string) => {
        if (!isAuthenticated) {
          return false;
        }

        return hasPermission(resource, action);
      },
      canWithEntitlement: (
        resource: string,
        action: string,
        requirement: keyof typeof entitlements,
      ) => {
        if (!isAuthenticated || !hasPermission(resource, action)) {
          return false;
        }

        return Boolean(entitlements[requirement]);
      },
      entitlements,
    }),
    [entitlements, hasPermission, isAuthenticated],
  );
}

