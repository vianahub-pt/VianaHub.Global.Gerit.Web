"use client";

import { useAccessControl } from "@/platform/access-control/use-access-control";

interface AccessGuardProps {
  resource: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AccessGuard({
  resource,
  action,
  children,
  fallback = null,
}: AccessGuardProps) {
  const { can } = useAccessControl();

  if (!can(resource, action)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

