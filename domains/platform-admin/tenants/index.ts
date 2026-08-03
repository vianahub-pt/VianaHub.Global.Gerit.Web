export const platformTenantsModule = {
  route: "/platform-admin/tenants",
} as const;

export type { TenantItem } from "@/domains/platform-admin/tenants/tenant-models";
export {
  normalizeTenant,
  parsePagedTenants,
  normalizeErrorMessage,
} from "@/domains/platform-admin/tenants/tenant-utils";
export { TenantsPage } from "@/domains/platform-admin/tenants/tenants-page";
