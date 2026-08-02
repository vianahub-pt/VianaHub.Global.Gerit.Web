"use client";

/* ---------- Subscription Types ---------- */

export interface SubscriptionItem {
  id: number;
  tenantId: number;
  name: string;
  description?: string;
  price: number;
  billingCycle: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionFormState {
  name: string;
  description: string;
  price: number;
  billingCycle: string;
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