"use client";

/* ---------- Visit Types ---------- */

export type VisitStatus = "Scheduled" | "InProgress" | "Completed" | "Cancelled";

export const VisitStatus = {
  Scheduled: "Scheduled" as VisitStatus,
  InProgress: "InProgress" as VisitStatus,
  Completed: "Completed" as VisitStatus,
  Cancelled: "Cancelled" as VisitStatus,
} as const;

export interface VisitItem {
  id: number;
  visitId?: number;
  tenantId: number;
  clientId: number;
  vehicleId: number;
  employeeId: number;
  teamId: number;
  visitDate: string;
  visitStatus: VisitStatus;
  notes?: string | null;
  isActive: boolean;
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VisitFormState {
  clientId: number;
  vehicleId: number;
  employeeId: number;
  teamId: number;
  visitDate: string;
  visitStatus: VisitStatus;
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

export interface VisitsPagedResponse {
  items?: VisitItem[];
  data?: VisitItem[];
  totalItems?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}