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

  // Migration #241 - New domain query keys
  tenants: (filters?: Record<string, unknown>) =>
    ["tenants", filters ?? {}] as const,
  employees: (tenantId: number, filters?: Record<string, unknown>) =>
    ["employees", tenantId, filters ?? {}] as const,
  visits: (tenantId: number, filters?: Record<string, unknown>) =>
    ["visits", tenantId, filters ?? {}] as const,
  subscriptions: (tenantId: number, filters?: Record<string, unknown>) =>
    ["subscriptions", tenantId, filters ?? {}] as const,
  catalogs: (catalogType: string, filters?: Record<string, unknown>) =>
    ["catalogs", catalogType, filters ?? {}] as const,
  identity: {
    users: (tenantId: string, filters?: Record<string, unknown>) =>
      ["identity", "users", tenantId, filters ?? {}] as const,
    roles: (tenantId: string, filters?: Record<string, unknown>) =>
      ["identity", "roles", tenantId, filters ?? {}] as const,
    permissions: (tenantId: string, filters?: Record<string, unknown>) =>
      ["identity", "permissions", tenantId, filters ?? {}] as const,
    tenants: (filters?: Record<string, unknown>) =>
      ["identity", "tenants", filters ?? {}] as const,
  },
} as const;