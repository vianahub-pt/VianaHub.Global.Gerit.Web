"use client";

export interface TenantItem {
  id: number;
  partyTypeId: number;
  acquisitionSourceTypeId: number;
  name: string;
  email: string;
  websiteUrl: string;
  imageUrl: string;
  note: string;
  isActive: boolean;
}
