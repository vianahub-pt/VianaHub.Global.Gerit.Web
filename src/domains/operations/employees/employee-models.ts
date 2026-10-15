"use client";

/* ---------- Employee Types ---------- */

export interface EmployeeItem {
  id: number;
  employeeId?: number;
  tenantId: number;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  function: string;
  isActive: boolean;
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
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

export type EmployeeSortColumn =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "function"
  | "isActive"
  | "createdAt";

export type EmployeeStatusFilter = "active" | "inactive" | "all";

export interface EmployeesPagedResponse {
  items?: EmployeeItem[];
  data?: EmployeeItem[];
  totalItems?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}