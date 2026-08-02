"use client";

/* ---------- Tenant Types ---------- */

export interface TenantItem {
  id: number;
  tenantId?: number;
  name: string;
  code: string;
  cnpj?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TenantFormState {
  name: string;
  code: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  isActive: boolean;
}

export const initialTenantFormState: TenantFormState = {
  name: "",
  code: "",
  cnpj: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "",
  isActive: true,
};

export type TenantSortColumn = "name" | "code" | "cnpj" | "isActive" | "createdAt";

export type TenantStatusFilter = "active" | "inactive" | "all";

export interface TenantsPagedResponse {
  items?: TenantItem[];
  data?: TenantItem[];
  totalItems?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}