"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth";
import { queryKeys } from "@/platform/query";
import { normalizeAcquisitionSourceTypes } from "./client-utils";
import type { AcquisitionSourceType } from "./client-models";

export function useAcquisitionSourceTypes() {
  const { fetchWithAuth, tenantId } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.acquisitionSourceTypes(tenantId ?? 0),
    queryFn: async () => {
      const response = await fetchWithAuth("/api/gerit/v1/acquisition-source-types", {
        method: "GET",
      });
      if (!response) return [];
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error("Failed to fetch acquisition source types");
      }
      return normalizeAcquisitionSourceTypes(payload);
    },
    enabled: typeof tenantId === "number" && tenantId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    acquisitionSourceTypes: (data as AcquisitionSourceType[]) ?? [],
    isLoading,
    isError,
    error,
    refetch,
  };
}