"use client";

/* ---------- Employee Types ---------- */

export interface EmployeeItem {
  id: number;
  tenantId: number;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  function: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  function: string;
  isActive: boolean;
}

export const initialEmployeeFormState: EmployeeFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  function: "",
  isActive: true,
};

export type EmployeeSortColumn = "firstName" | "lastName" | "email" | "phone" | "function" | "isActive" | "createdAt";
export type EmployeeStatusFilter = "active" | "inactive" | "all";