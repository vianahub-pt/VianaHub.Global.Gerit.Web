export const queryKeys = {
  users: (tenantId: number, filters?: Record<string, unknown>) =>
    ["users", tenantId, filters ?? {}] as const,
  roles: (tenantId: number) => ["roles", tenantId] as const,
  subscription: (tenantId: number) => ["subscription", tenantId] as const,
  entitlements: (tenantId: number) => ["entitlements", tenantId] as const,
  interventions: (tenantId: number, filters?: Record<string, unknown>) =>
    ["interventions", tenantId, filters ?? {}] as const,
  clients: (tenantId: number, filters?: Record<string, unknown>) =>
    ["clients", tenantId, filters ?? {}] as const,
  acquisitionSourceTypes: (tenantId: number) =>
    ["acquisitionSourceTypes", tenantId] as const,
} as const;

