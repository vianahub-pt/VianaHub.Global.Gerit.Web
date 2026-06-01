"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import { useAuth } from "@/platform/auth";

const WorkspaceBootstrapContext = createContext<{
  ready: boolean;
}>({
  ready: false,
});

export function WorkspaceBootstrapProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isHydrating } = useAuth();

  const ready = useMemo(() => {
    return !isHydrating;
  }, [isHydrating]);

  return (
    <WorkspaceBootstrapContext.Provider value={{ ready }}>
      {children}
    </WorkspaceBootstrapContext.Provider>
  );
}

export function useWorkspaceBootstrap() {
  return useContext(WorkspaceBootstrapContext);
}
