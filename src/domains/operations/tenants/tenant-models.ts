"use client";

/* ---------- Tenant Types ---------- */

export interface TenantItem {
  id: number;
  name: string;
  code: string;
  cnpj?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
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
