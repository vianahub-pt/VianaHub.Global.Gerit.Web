"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STORAGE_KEYS } from "@/core/constants/storage-keys";
import { useAuth } from "@/platform/auth";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "@/platform/storage";

const TenantContext = createContext<{
  activeTenantId: number | null;
  tenantIds: number[];
  setActiveTenant: (tenantId: number) => void;
  clearTenantContext: () => void;
} | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated } = useAuth();
  const [activeTenantId, setActiveTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !session) {
      setActiveTenantId(null);
      removeStorageItem(STORAGE_KEYS.selectedTenantId);
      return;
    }

    const storedTenantId = Number(getStorageItem(STORAGE_KEYS.selectedTenantId));
    const nextTenantId =
      Number.isFinite(storedTenantId) && storedTenantId > 0
        ? storedTenantId
        : session.tenantId;

    setActiveTenantId(nextTenantId);
  }, [isAuthenticated, session]);

  const setActiveTenant = useCallback((tenantId: number) => {
    setActiveTenantId(tenantId);
    setStorageItem(STORAGE_KEYS.selectedTenantId, String(tenantId));
  }, []);

  const clearTenantContext = useCallback(() => {
    setActiveTenantId(null);
    removeStorageItem(STORAGE_KEYS.selectedTenantId);
  }, []);

  const value = useMemo(
    () => ({
      activeTenantId,
      tenantIds: activeTenantId === null ? [] : [activeTenantId],
      setActiveTenant,
      clearTenantContext,
    }),
    [activeTenantId, clearTenantContext, setActiveTenant],
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);

  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }

  return context;
}

