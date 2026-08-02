"use client";

/* ---------- Visit Types ---------- */

export interface VisitItem {
  id: number;
  tenantId: number;
  clientId: number;
  vehicleId: number;
  employeeId: number;
  teamId: number;
  visitDate: string;
  visitStatus: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VisitFormState {
  clientId: number;
  vehicleId: number;
  employeeId: number;
  teamId: number;
  visitDate: string;
  visitStatus: string;
  notes: string;
  isActive: boolean;
}

export const initialVisitFormState: VisitFormState = {
  clientId: 0,
  vehicleId: 0,
  employeeId: 0,
  teamId: 0,
  visitDate: "",
  visitStatus: "Scheduled",
  notes: "",
  isActive: true,
};

export type VisitSortColumn =
  | "clientId"
  | "vehicleId"
  | "employeeId"
  | "teamId"
  | "visitDate"
  | "visitStatus"
  | "isActive"
  | "createdAt";

export type VisitStatusFilter = "active" | "inactive" | "all";