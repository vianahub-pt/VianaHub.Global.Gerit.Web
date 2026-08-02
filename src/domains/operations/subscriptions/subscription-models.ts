"use client";

/* ---------- Subscription Types ---------- */

export type BillingCycle = "Monthly" | "Quarterly" | "SemiAnnual" | "Annual";

export const BillingCycle = {
  Monthly: "Monthly" as BillingCycle,
  Quarterly: "Quarterly" as BillingCycle,
  SemiAnnual: "SemiAnnual" as BillingCycle,
  Annual: "Annual" as BillingCycle,
} as const;

export interface SubscriptionItem {
  id: number;
  subscriptionId?: number;
  tenantId: number;
  name: string;
  description?: string | null;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SubscriptionFormState {
  name: string;
  description: string;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
}

export const initialSubscriptionFormState: SubscriptionFormState = {
  name: "",
  description: "",
  price: 0,
  billingCycle: "Monthly",
  isActive: true,
};

export type SubscriptionSortColumn =
  | "name"
  | "price"
  | "billingCycle"
  | "isActive"
  | "createdAt";

export type SubscriptionStatusFilter = "active" | "inactive" | "all";

export interface SubscriptionsPagedResponse {
  items?: SubscriptionItem[];
  data?: SubscriptionItem[];
  totalItems?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}