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
    return <div data-testid="access-guard-root">{fallback}</div>;
  }

  return <div data-testid="access-guard-root">{children}</div>;
}

