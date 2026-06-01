"use client";

export interface ClientItem {
  id: number;
  tenantId?: number;
  clientType?: number;
  clientTypeDescription?: string;
  origin?: string;
  name: string;
  phone: string;
  email?: string | null;
  website?: string | null;
  urlImage?: string | null;
  contact?: string | null;
  score?: number | null;
  consent?: boolean;
  remarks?: string | null;
  isActive: boolean;
}
