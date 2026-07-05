"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/platform/auth";
import { normalizeAcquisitionSourceTypes } from "./client-utils";
import type { AcquisitionSourceType } from "./client-models";

export function useAcquisitionSourceTypes() {
  const { fetchWithAuth, tenantId, isAuthenticated, isHydrating } = useAuth();
  const [acquisitionSourceTypes, setAcquisitionSourceTypes] = useState<AcquisitionSourceType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const loadAcquisitionSourceTypes = useCallback(async () => {
    if (acquisitionSourceTypes.length > 0) return;
    setIsLoading(true);
    setIsError(false);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/acquisition-source-types", { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return;
      const parsed = normalizeAcquisitionSourceTypes(payload);
      setAcquisitionSourceTypes(parsed);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [acquisitionSourceTypes.length, fetchWithAuth]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated && tenantId) {
      void loadAcquisitionSourceTypes();
    }
  }, [isHydrating, isAuthenticated, tenantId, loadAcquisitionSourceTypes]);

  return { acquisitionSourceTypes, isLoading, isError };
}
