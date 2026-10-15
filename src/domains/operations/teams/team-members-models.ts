"use client";

/* ---------- Team Member Types ---------- */

export interface TeamMemberItem {
  id: number;
  teamMemberId?: number;
  tenantId: number;
  teamId: number;
  team?: string | null;
  employeeId: number;
  employee?: string | null;
  isLeader: boolean;
  startDateTime: string;
  endDateTime?: string | null;
  isActive: boolean;
  active?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TeamMemberFormState {
  teamId: number;
  employeeId: number;
  isLeader: boolean;
  startDateTime: string;
  endDateTime: string;
  isActive: boolean;
}

export const initialTeamMemberFormState: TeamMemberFormState = {
  teamId: 0,
  employeeId: 0,
  isLeader: false,
  startDateTime: "",
  endDateTime: "",
  isActive: true,
};

export type TeamMemberSortColumn =
  | "team"
  | "employee"
  | "isLeader"
  | "startDateTime"
  | "endDateTime"
  | "isActive"
  | "createdAt";

export type TeamMemberStatusFilter = "active" | "inactive" | "all";

export interface TeamMembersPagedResponse {
  items?: TeamMemberItem[];
  data?: TeamMemberItem[];
  totalItems?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}