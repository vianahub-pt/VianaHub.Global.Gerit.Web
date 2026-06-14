"use client";

export interface ClientIndividual {
  id?: number;
  tenantId?: number;
  clientId?: number;
  displayName?: string;
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

/* ---------- Client Fiscal Data ---------- */

export interface ClientFiscalDataItem {
  id: number;
  clientId: number;
  taxNumber: string | null;
  vatNumber: string | null;
  fiscalCountry: string | null;
  isVatRegistered: boolean;
  iban: string | null;
  fiscalEmail: string | null;
  isActive: boolean;
}

export interface ClientFiscalDataFormState {
  taxNumber: string;
  vatNumber: string;
  fiscalCountry: string;
  isVatRegistered: boolean;
  iban: string;
  fiscalEmail: string;
}

export const initialFiscalDataFormState: ClientFiscalDataFormState = {
  taxNumber: "",
  vatNumber: "",
  fiscalCountry: "",
  isVatRegistered: false,
  iban: "",
  fiscalEmail: "",
};

/* ---------- Client Consents ---------- */

export interface ConsentTypeItem {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface ClientConsentItem {
  id: number;
  clientId: number;
  consentTypeId: number;
  consentTypeName: string | null;
  granted: boolean;
  grantedDate: string | null;
  revokedDate: string | null;
  origin: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
}

export interface ClientConsentFormState {
  consentTypeId: string;
  granted: boolean;
  grantedDate: string;
  revokedDate: string;
  origin: string;
  ipAddress: string;
  userAgent: string;
}

export const initialConsentFormState: ClientConsentFormState = {
  consentTypeId: "",
  granted: false,
  grantedDate: "",
  revokedDate: "",
  origin: "",
  ipAddress: "",
  userAgent: "",
};

/* ---------- Client Hierarchy ---------- */

export interface ClientHierarchyItem {
  id: number;
  parentClientId: number;
  parentClientName: string | null;
  childClientId: number;
  childClientName: string | null;
  relationshipType: string | null;
  isActive: boolean;
}

export interface ClientHierarchyFormState {
  parentClientId: string;
  childClientId: string;
  relationshipType: string;
}

export const initialHierarchyFormState: ClientHierarchyFormState = {
  parentClientId: "",
  childClientId: "",
  relationshipType: "",
};
