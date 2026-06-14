"use client";

export interface ClientIndividual {
  id?: number;
  tenantId?: number;
  clientId?: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  cellPhoneNumber?: string;
  isWhatsapp?: boolean;
  email?: string;
  birthDate?: string;
  gender?: string;
  documentType?: string;
  documentNumber?: string;
  nationality?: string;
  isActive?: boolean;
}

export interface ClientCompany {
  id?: number;
  tenantId?: number;
  clientId?: number;
  legalName?: string;
  tradeName?: string;
  phoneNumber?: string;
  cellPhoneNumber?: string;
  isWhatsapp?: boolean;
  email?: string;
  site?: string;
  companyRegistration?: string;
  cae?: string;
  numberOfEmployee?: number;
  legalRepresentative?: string;
  isActive?: boolean;
}

export interface ClientItem {
  id: number;
  tenantId?: number;
  clientType?: number;
  clientTypeDescription?: string;
  originType?: number;
  originTypeDescription?: string;
  name: string;
  phone: string;
  email?: string | null;
  urlImage?: string | null;
  note?: string | null;
  isActive: boolean;
  individual?: ClientIndividual;
  company?: ClientCompany;
}
