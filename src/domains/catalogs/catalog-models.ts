"use client";

/* ---------- Catalog Types ---------- */

export interface VehicleType {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface FuelType {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface StatusDefinition {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface AcquisitionSourceType {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

export interface ConsentType {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface ConsentOriginType {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

export type CatalogSortColumn = "name" | "description" | "isActive";
export type CatalogStatusFilter = "active" | "inactive" | "all";
