"use client";

/* ---------- Client Addresses ---------- */

export interface AddressItem {
  id: number;
  addressTypeId: number | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  note: string | null;
  isActive: boolean;
  isPrimary: boolean;
}

export interface AddressFormState {
  addressTypeId: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  note: string;
  isPrimary: boolean;
}

export type AddressSortColumn = "Street" | "City" | "State" | "PostalCode" | "Country";

export const initialAddressFormState: AddressFormState = {
  addressTypeId: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  postalCode: "",
  country: "PT",
  latitude: "",
  longitude: "",
  note: "",
  isPrimary: false,
};

/* ---------- Client Contact Network ---------- */

export interface ContactNetworkItem {
  id: number;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  cellPhoneNumber: string | null;
  isWhatsapp: boolean;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ContactNetworkFormState {
  name: string;
  email: string;
  phoneNumber: string;
  cellPhoneNumber: string;
  isWhatsapp: boolean;
  isPrimary: boolean;
}

export type ContactNetworkSortColumn = "Name" | "Email" | "PhoneNumber" | "CellPhoneNumber" | "IsWhatsapp" | "IsPrimary";

export const initialContactNetworkFormState: ContactNetworkFormState = {
  name: "",
  email: "",
  phoneNumber: "",
  cellPhoneNumber: "",
  isWhatsapp: false,
  isPrimary: false,
};

/* ---------- Client Individual ---------- */

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
  fiscalCountry: "PT",
  isVatRegistered: false,
  iban: "",
  fiscalEmail: "",
};

export type FiscalDataSortColumn = "TaxNumber" | "VatNumber" | "FiscalCountry" | "IsVatRegistered" | "IBAN" | "FiscalEmail";

/* ---------- Client Consents ---------- */

export interface ConsentTypeItem {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface ConsentOriginTypeItem {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

export interface ClientConsentItem {
  id: number;
  tenantId: number;
  clientId: number;
  client: string;
  consentTypeId: number;
  consentType: string;
  consentOriginTypeId: number;
  consentOriginType: string;
  granted: boolean;
  grantedDate: string;
  revokedDate?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
}

export interface ClientConsentFormState {
  consentTypeId: string;
  consentOriginTypeId: string;
  granted: boolean;
  grantedDate: string;
  revokedDate: string;
  ipAddress: string;
  userAgent: string;
}

export const initialConsentFormState: ClientConsentFormState = {
  consentTypeId: "",
  consentOriginTypeId: "",
  granted: false,
  grantedDate: "",
  revokedDate: "",
  ipAddress: "",
  userAgent: "",
};

export type ConsentSortColumn = "consentType" | "consentOriginType" | "granted" | "grantedDate" | "isActive";


