"use client";

import clsx from "clsx";
import { Loader2, Power, PowerOff, SquarePen, Trash2, ArrowLeft } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Textarea } from "@/shared/ui/textarea";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";

import { useToast } from "@/shared/feedback";
import { logError } from "@/core/logger/client-logger";
import { ClientItem } from "@/domains/operations/clients/client-models";
import {
  HubGrid,
  type HubGridColumn,
  type RowDensity,
} from "@/shared/hub-grid";
import { HubTabs } from "@/shared/ui";
import {
  normalizeClient,
  normalizeErrorMessage,
  normalizeAddress,
  parsePagedAddresses,
  getAddressSortValue,
  normalizeContactNetwork,
  parsePagedContactNetwork,
  getContactNetworkSortValue,
} from "@/domains/operations/clients/client-utils";
import {
  FormField,
  SelectField,
  ToggleField,
  isIndividualType,
  isCompanyType,
  CLIENT_TYPE_OPTIONS,
  ORIGIN_OPTIONS,
  GENDER_OPTIONS,
  GENDER_OPTIONS_KEYS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS_KEYS,
  type IndividualFormState,
  type CompanyFormState,
  type ClientFormState,
  initialIndividualFormState,
  initialCompanyFormState,
  initialClientFormState,
} from "@/domains/operations/clients/clients-form-components";
import {
  type ClientFiscalDataItem,
  type ClientFiscalDataFormState,
  initialFiscalDataFormState,
  type ClientConsentItem,
  type ConsentTypeItem,
  type ClientConsentFormState,
  initialConsentFormState,
  type ClientHierarchyItem,
  type ClientHierarchyFormState,
  initialHierarchyFormState,
  type AddressItem,
  type AddressFormState,
  type AddressSortColumn,
  initialAddressFormState,
  type ContactNetworkItem,
  type ContactNetworkFormState,
  type ContactNetworkSortColumn,
  initialContactNetworkFormState,
} from "@/domains/operations/clients/client-models";
import { EUROPEAN_COUNTRIES_PLUS_BR_US } from "@/shared/utils/countries";

/* ---------- Constants ---------- */

const CONTACT_PAGE_SIZE = 25;
const ADDRESS_PAGE_SIZE = 25;
const FISCAL_DATA_PAGE_SIZE = 25;
const CONSENT_PAGE_SIZE = 25;
const HIERARCHY_PAGE_SIZE = 25;
const CONTACT_NETWORK_PAGE_SIZE = 25;
const CONTACT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const ADDRESS_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const CONSENT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const HIERARCHY_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];

/* ---------- Sort column types ---------- */

type ContactSortColumn = "Name" | "Email" | "Phone";
type ContactNetworkSortColumnLocal = "Name" | "Email" | "PhoneNumber" | "CellPhoneNumber" | "IsWhatsapp" | "IsPrimary";
type FiscalDataSortColumn = "TaxNumber" | "VatNumber" | "FiscalCountry" | "IsVatRegistered" | "Iban" | "FiscalEmail";
type ConsentSortColumn = "ConsentType" | "Granted" | "GrantedDate" | "RevokedDate" | "Origin";
type HierarchySortColumn = "ParentClient" | "ChildClient" | "RelationshipType";

/* ---------- Pagination helper ---------- */

const PAGE_BUTTON_MAX = 5;

function buildPageButtons(page: number, totalPages: number) {
  const pages: number[] = [];
  const normalTotal = Math.max(1, totalPages);
  let start = Math.max(1, page - Math.floor(PAGE_BUTTON_MAX / 2));
  const end = Math.min(normalTotal, start + PAGE_BUTTON_MAX - 1);
  start = Math.max(1, end - PAGE_BUTTON_MAX + 1);
  for (let index = start; index <= end; index += 1) {
    pages.push(index);
  }
  return pages;
}

/* ---------- Sort value helpers ---------- */

function getContactSortValue(item: ContactItem, column: ContactSortColumn) {
  switch (column) {
    case "Email":
      return (item.email ?? "").toLowerCase();
    case "Phone":
      return (item.phoneNumber ?? "").toLowerCase();
    default:
      return item.name.toLowerCase();
  }
}

function getFiscalDataSortValue(item: ClientFiscalDataItem, column: FiscalDataSortColumn) {
  switch (column) {
    case "VatNumber":
      return (item.vatNumber ?? "").toLowerCase();
    case "FiscalCountry":
      return (item.fiscalCountry ?? "").toLowerCase();
    case "IsVatRegistered":
      return item.isVatRegistered ? "1" : "0";
    case "Iban":
      return (item.iban ?? "").toLowerCase();
    case "FiscalEmail":
      return (item.fiscalEmail ?? "").toLowerCase();
    default:
      return (item.taxNumber ?? "").toLowerCase();
  }
}

/* ---------- Interfaces ---------- */

interface ContactItem {
  id: number;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  isPrimary: boolean;
}

interface ContactsPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

interface ContactFormState {
  name: string;
  email: string;
  phoneNumber: string;
}

interface FiscalDataFormState {
  taxNumber: string;
  vatNumber: string;
  fiscalCountry: string;
  isVatRegistered: boolean;
  iban: string;
  fiscalEmail: string;
}

interface FiscalDataPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

type ClientTab = "informacoes" | "contactos" | "contactNetwork" | "enderecos" | "fiscalData" | "consents" | "hierarchy";

const initialContactFormState: ContactFormState = {
  name: "",
  email: "",
  phoneNumber: "",
};

const initialFiscalDataFormStateLocal: FiscalDataFormState = {
  taxNumber: "",
  vatNumber: "",
  fiscalCountry: "PT",
  isVatRegistered: false,
  iban: "",
  fiscalEmail: "",
};

/* ---------- Resolve helper functions ---------- */

function resolveClientTypeValue(client: ClientItem | null): string {
  if (!client) return "";
  if (typeof client.clientType === "number") return String(client.clientType);
  return "";
}

function resolveOriginTypeValue(client: ClientItem | null): string {
  if (!client) return "";
  if (typeof client.originType === "number") return String(client.originType);
  return "";
}

/* ---------- Contact normalize/parse ---------- */

function normalizeContact(payload: unknown): ContactItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.contactId === "number"
          ? candidate.contactId
          : typeof candidate.contactId === "string"
            ? Number(candidate.contactId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.fullName === "string"
        ? candidate.fullName
        : typeof candidate.contactName === "string"
          ? candidate.contactName
          : "";
  const phoneNumber =
    typeof candidate.phoneNumber === "string"
      ? candidate.phoneNumber
      : typeof candidate.phone === "string"
        ? candidate.phone
        : typeof candidate.mobile === "string"
          ? candidate.mobile
          : null;
  const email = typeof candidate.email === "string" ? candidate.email : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;
  const isPrimaryValue =
    typeof candidate.isPrimary === "boolean"
      ? candidate.isPrimary
      : typeof candidate.isPrimary === "string"
        ? candidate.isPrimary.toLowerCase() === "true"
        : false;

  return {
    id: rawId,
    name,
    email,
    phoneNumber,
    isActive: Boolean(isActiveValue),
    isPrimary: Boolean(isPrimaryValue),
  };
}

function parsePagedContacts(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ContactItem[], totalItems: 0 };
  const candidate = payload as ContactsPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeContact)
    .filter((item): item is ContactItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

/* ---------- Fiscal Data normalize/parse ---------- */

function normalizeFiscalData(payload: unknown): ClientFiscalDataItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.fiscalDataId === "number"
          ? candidate.fiscalDataId
          : typeof candidate.fiscalDataId === "string"
            ? Number(candidate.fiscalDataId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const taxNumber = typeof candidate.taxNumber === "string" ? candidate.taxNumber : null;
  const vatNumber = typeof candidate.vatNumber === "string" ? candidate.vatNumber : null;
  const fiscalCountry = typeof candidate.fiscalCountry === "string" ? candidate.fiscalCountry : null;
  const isVatRegistered =
    typeof candidate.isVatRegistered === "boolean"
      ? candidate.isVatRegistered
      : typeof candidate.isVatRegistered === "string"
        ? candidate.isVatRegistered.toLowerCase() === "true"
        : false;
  const iban = typeof candidate.iban === "string" ? candidate.iban : null;
  const fiscalEmail = typeof candidate.fiscalEmail === "string" ? candidate.fiscalEmail : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;

  return {
    id: rawId,
    clientId: typeof candidate.clientId === "number" ? candidate.clientId : typeof candidate.clientId === "string" ? Number(candidate.clientId) : 0,
    taxNumber,
    vatNumber,
    fiscalCountry,
    isVatRegistered,
    iban,
    fiscalEmail,
    isActive: Boolean(isActiveValue),
  };
}

function parsePagedFiscalData(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ClientFiscalDataItem[], totalItems: 0 };
  const candidate = payload as FiscalDataPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeFiscalData)
    .filter((item): item is ClientFiscalDataItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

/* ---------- Consent normalize/parse ---------- */

function normalizeConsent(payload: unknown): ClientConsentItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.consentId === "number"
          ? candidate.consentId
          : typeof candidate.consentId === "string"
            ? Number(candidate.consentId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const consentTypeId = typeof candidate.consentTypeId === "number" ? candidate.consentTypeId : typeof candidate.consentTypeId === "string" ? Number(candidate.consentTypeId) : 0;
  const consentTypeName =
    typeof candidate.consentTypeName === "string"
      ? candidate.consentTypeName
      : typeof candidate.consentType === "string"
        ? candidate.consentType
        : null;
  const granted =
    typeof candidate.granted === "boolean"
      ? candidate.granted
      : typeof candidate.granted === "string"
        ? candidate.granted.toLowerCase() === "true"
        : false;
  const grantedDate =
    typeof candidate.grantedDate === "string" ? candidate.grantedDate : null;
  const revokedDate =
    typeof candidate.revokedDate === "string" ? candidate.revokedDate : null;
  const origin =
    typeof candidate.origin === "string" ? candidate.origin : null;
  const ipAddress =
    typeof candidate.ipAddress === "string" ? candidate.ipAddress : null;
  const userAgent =
    typeof candidate.userAgent === "string" ? candidate.userAgent : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;

  return {
    id: rawId,
    clientId: typeof candidate.clientId === "number" ? candidate.clientId : typeof candidate.clientId === "string" ? Number(candidate.clientId) : 0,
    consentTypeId,
    consentTypeName,
    granted,
    grantedDate,
    revokedDate,
    origin,
    ipAddress,
    userAgent,
    isActive: Boolean(isActiveValue),
  };
}

function parsePagedConsents(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ClientConsentItem[], totalItems: 0 };
  const candidate = payload as { items?: unknown; totalItems?: unknown };
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeConsent)
    .filter((item): item is ClientConsentItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

/* ---------- Hierarchy normalize/parse ---------- */

function normalizeHierarchy(payload: unknown): ClientHierarchyItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.id === "string"
        ? Number(candidate.id)
        : typeof candidate.hierarchyId === "number"
          ? candidate.hierarchyId
          : typeof candidate.hierarchyId === "string"
            ? Number(candidate.hierarchyId)
            : null;
  if (rawId === null || !Number.isFinite(rawId)) return null;

  const parentClientId = typeof candidate.parentClientId === "number" ? candidate.parentClientId : typeof candidate.parentClientId === "string" ? Number(candidate.parentClientId) : 0;
  const parentClientName =
    typeof candidate.parentClientName === "string"
      ? candidate.parentClientName
      : null;
  const childClientId = typeof candidate.childClientId === "number" ? candidate.childClientId : typeof candidate.childClientId === "string" ? Number(candidate.childClientId) : 0;
  const childClientName =
    typeof candidate.childClientName === "string"
      ? candidate.childClientName
      : null;
  const relationshipType =
    typeof candidate.relationshipType === "string" ? candidate.relationshipType : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.isActive === "string"
        ? candidate.isActive.toLowerCase() === "true"
        : typeof candidate.active === "boolean"
          ? candidate.active
          : typeof candidate.active === "string"
            ? candidate.active.toLowerCase() === "true"
            : typeof candidate.enabled === "boolean"
              ? candidate.enabled
              : typeof candidate.enabled === "string"
                ? candidate.enabled.toLowerCase() === "true"
                : true;

  return {
    id: rawId,
    parentClientId,
    parentClientName,
    childClientId,
    childClientName,
    relationshipType,
    isActive: Boolean(isActiveValue),
  };
}

function parsePagedHierarchy(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as ClientHierarchyItem[], totalItems: 0 };
  const candidate = payload as { items?: unknown; totalItems?: unknown };
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeHierarchy)
    .filter((item): item is ClientHierarchyItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

/* ---------- Consent Types normalize ---------- */

function normalizeConsentTypes(payload: unknown): ConsentTypeItem[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((candidate) => ({
      id: typeof candidate.id === "number" ? candidate.id : 0,
      name: typeof candidate.name === "string" ? candidate.name : "",
      description: typeof candidate.description === "string" ? candidate.description : null,
      isActive:
        typeof candidate.isActive === "boolean"
          ? candidate.isActive
          : typeof candidate.active === "boolean"
            ? candidate.active
            : true,
    }));
}

/* ==========================
   MAIN COMPONENT
   ========================== */

export function ClientsDetailsPage({ clientId: clientIdProp }: { clientId?: string }) {
  const { fetchWithAuth, isHydrating, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const clientLoadRequestRef = useRef(0);

  const clientId = useMemo(() => {
    if (!clientIdProp) return null;
    const parsed = Number(clientIdProp);
    return Number.isFinite(parsed) ? parsed : null;
  }, [clientIdProp]);

  /* ---------- Client state ---------- */

  const [client, setClient] = useState<ClientItem | null>(null);
  const [clientFormState, setClientFormState] = useState<ClientFormState>(initialClientFormState);
  const [loadingClient, setLoadingClient] = useState(false);
  const [submittingClient, setSubmittingClient] = useState(false);

  /* ---------- Contacts state ---------- */

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(initialContactFormState);
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactDeleteConfirmOpen, setContactDeleteConfirmOpen] = useState(false);
  const contactDeleteRef = useRef<ContactItem | null>(null);
  const [contactsBulkUploading, setContactsBulkUploading] = useState(false);

  /* ---------- Addresses state ---------- */

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressFormState, setAddressFormState] = useState<AddressFormState>(initialAddressFormState);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);
  const [addressSubmitting, setAddressSubmitting] = useState(false);
  const [addressDeleteConfirmOpen, setAddressDeleteConfirmOpen] = useState(false);
  const addressDeleteRef = useRef<AddressItem | null>(null);
  const [addressesBulkUploading, setAddressesBulkUploading] = useState(false);
  const [addressTypes, setAddressTypes] = useState<Array<{ id: number; name: string }>>([]);

  /* ---------- Fiscal Data state ---------- */

  const [fiscalData, setFiscalData] = useState<ClientFiscalDataItem[]>([]);
  const [fiscalDataLoading, setFiscalDataLoading] = useState(false);
  const [fiscalDataFormState, setFiscalDataFormState] = useState<FiscalDataFormState>(initialFiscalDataFormStateLocal);
  const [editingFiscalData, setEditingFiscalData] = useState<ClientFiscalDataItem | null>(null);
  const [fiscalDataSubmitting, setFiscalDataSubmitting] = useState(false);
  const [fiscalDataDeleteConfirmOpen, setFiscalDataDeleteConfirmOpen] = useState(false);
  const fiscalDataDeleteRef = useRef<ClientFiscalDataItem | null>(null);
  const [fiscalDataBulkUploading, setFiscalDataBulkUploading] = useState(false);

  /* ---------- Consents state ---------- */

  const [consents, setConsents] = useState<ClientConsentItem[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(false);
  const [consentFormState, setConsentFormState] = useState<ClientConsentFormState>(initialConsentFormState);
  const [editingConsent, setEditingConsent] = useState<ClientConsentItem | null>(null);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentDeleteConfirmOpen, setConsentDeleteConfirmOpen] = useState(false);
  const consentDeleteRef = useRef<ClientConsentItem | null>(null);
  const [consentBulkUploading, setConsentBulkUploading] = useState(false);
  const [consentTypes, setConsentTypes] = useState<ConsentTypeItem[]>([]);

  /* ---------- Hierarchy state ---------- */

  const [hierarchyItems, setHierarchyItems] = useState<ClientHierarchyItem[]>([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyFormState, setHierarchyFormState] = useState<ClientHierarchyFormState>(initialHierarchyFormState);
  const [editingHierarchy, setEditingHierarchy] = useState<ClientHierarchyItem | null>(null);
  const [hierarchySubmitting, setHierarchySubmitting] = useState(false);
  const [hierarchyDeleteConfirmOpen, setHierarchyDeleteConfirmOpen] = useState(false);
  const hierarchyDeleteRef = useRef<ClientHierarchyItem | null>(null);
  const [hierarchyBulkUploading, setHierarchyBulkUploading] = useState(false);

  /* ---------- Contact Network state ---------- */

  const [contactNetwork, setContactNetwork] = useState<ContactNetworkItem[]>([]);
  const [contactNetworkLoading, setContactNetworkLoading] = useState(false);
  const [contactNetworkFormState, setContactNetworkFormState] = useState<ContactNetworkFormState>(initialContactNetworkFormState);
  const [editingContactNetwork, setEditingContactNetwork] = useState<ContactNetworkItem | null>(null);
  const [contactNetworkSubmitting, setContactNetworkSubmitting] = useState(false);
  const [contactNetworkDeleteConfirmOpen, setContactNetworkDeleteConfirmOpen] = useState(false);
  const contactNetworkDeleteRef = useRef<ContactNetworkItem | null>(null);
  const [contactNetworkBulkUploading, setContactNetworkBulkUploading] = useState(false);

  /* ---------- Tab & lazy loading state ---------- */

  const [activeTab, setActiveTab] = useState<ClientTab>("informacoes");
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(["informacoes"]));

  const handleTabChange = useCallback((tab: ClientTab) => {
    setActiveTab(tab);
    setLoadedTabs((prev) => {
      if (prev.has(tab)) return prev;
      return new Set(prev).add(tab);
    });
  }, []);

  /* ---------- Contact grid state ---------- */

  const [contactGridDensity, setContactGridDensity] = useState<RowDensity>("medium");
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState<number>(CONTACT_GRID_PAGE_SIZE_OPTIONS[1]);
  const [contactSortBy, setContactSortBy] = useState<ContactSortColumn>("Name");
  const [contactSortDirection, setContactSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Address grid state ---------- */

  const [addressGridDensity, setAddressGridDensity] = useState<RowDensity>("medium");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressStatusFilter, setAddressStatusFilter] = useState("all");
  const [addressPage, setAddressPage] = useState(1);
  const [addressPageSize, setAddressPageSize] = useState<number>(ADDRESS_GRID_PAGE_SIZE_OPTIONS[1]);
  const [addressSortBy, setAddressSortBy] = useState<AddressSortColumn>("Street");
  const [addressSortDirection, setAddressSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Fiscal Data grid state ---------- */

  const [fiscalDataGridDensity, setFiscalDataGridDensity] = useState<RowDensity>("medium");
  const [fiscalDataSearch, setFiscalDataSearch] = useState("");
  const [fiscalDataStatusFilter, setFiscalDataStatusFilter] = useState("all");
  const [fiscalDataPage, setFiscalDataPage] = useState(1);
  const [fiscalDataPageSize, setFiscalDataPageSize] = useState<number>(FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS[1]);
  const [fiscalDataSortBy, setFiscalDataSortBy] = useState<FiscalDataSortColumn>("TaxNumber");
  const [fiscalDataSortDirection, setFiscalDataSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Consents grid state ---------- */

  const [consentGridDensity, setConsentGridDensity] = useState<RowDensity>("medium");
  const [consentSearch, setConsentSearch] = useState("");
  const [consentStatusFilter, setConsentStatusFilter] = useState("all");
  const [consentPage, setConsentPage] = useState(1);
  const [consentPageSize, setConsentPageSize] = useState<number>(CONSENT_GRID_PAGE_SIZE_OPTIONS[1]);
  const [consentSortBy, setConsentSortBy] = useState<ConsentSortColumn>("ConsentType");
  const [consentSortDirection, setConsentSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Hierarchy grid state ---------- */

  const [hierarchyGridDensity, setHierarchyGridDensity] = useState<RowDensity>("medium");
  const [hierarchySearch, setHierarchySearch] = useState("");
  const [hierarchyStatusFilter, setHierarchyStatusFilter] = useState("all");
  const [hierarchyPage, setHierarchyPage] = useState(1);
  const [hierarchyPageSize, setHierarchyPageSize] = useState<number>(HIERARCHY_GRID_PAGE_SIZE_OPTIONS[1]);
  const [hierarchySortBy, setHierarchySortBy] = useState<HierarchySortColumn>("ParentClient");
  const [hierarchySortDirection, setHierarchySortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Contact Network grid state ---------- */

  const [contactNetworkGridDensity, setContactNetworkGridDensity] = useState<RowDensity>("medium");
  const [contactNetworkSearch, setContactNetworkSearch] = useState("");
  const [contactNetworkStatusFilter, setContactNetworkStatusFilter] = useState("all");
  const [contactNetworkPage, setContactNetworkPage] = useState(1);
  const [contactNetworkPageSize, setContactNetworkPageSize] = useState<number>(CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS[1]);
  const [contactNetworkSortBy, setContactNetworkSortBy] = useState<ContactNetworkSortColumnLocal>("Name");
  const [contactNetworkSortDirection, setContactNetworkSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Reset helpers ---------- */

  const resetContactForm = useCallback(() => {
    setEditingContact(null);
    setContactFormState(initialContactFormState);
  }, []);

  const resetAddressForm = useCallback(() => {
    setEditingAddress(null);
    setAddressFormState(initialAddressFormState);
  }, []);

  const resetFiscalDataForm = useCallback(() => {
    setEditingFiscalData(null);
    setFiscalDataFormState(initialFiscalDataFormStateLocal);
  }, []);

  const resetConsentForm = useCallback(() => {
    setEditingConsent(null);
    setConsentFormState(initialConsentFormState);
  }, []);

  const resetHierarchyForm = useCallback(() => {
    setEditingHierarchy(null);
    setHierarchyFormState(initialHierarchyFormState);
  }, []);

  const resetContactNetworkForm = useCallback(() => {
    setEditingContactNetwork(null);
    setContactNetworkFormState(initialContactNetworkFormState);
  }, []);

  const resetClientForm = useCallback(() => {
    setClientFormState(initialClientFormState);
  }, []);

  const resetClientViewState = useCallback(() => {
    setClient(null);
    resetClientForm();
    resetContactForm();
    resetAddressForm();
    resetFiscalDataForm();
    resetConsentForm();
    resetHierarchyForm();
    resetContactNetworkForm();
    setContacts([]);
    setAddresses([]);
    setFiscalData([]);
    setConsents([]);
    setHierarchyItems([]);
    setContactNetwork([]);
    setActiveTab("informacoes");
    setLoadedTabs(new Set(["informacoes"]));
    setContactGridDensity("medium");
    setAddressGridDensity("medium");
    setFiscalDataGridDensity("medium");
    setConsentGridDensity("medium");
    setHierarchyGridDensity("medium");
    setContactNetworkGridDensity("medium");
    setContactSearch("");
    setAddressSearch("");
    setFiscalDataSearch("");
    setConsentSearch("");
    setHierarchySearch("");
    setContactNetworkSearch("");
    setContactStatusFilter("all");
    setAddressStatusFilter("all");
    setFiscalDataStatusFilter("all");
    setConsentStatusFilter("all");
    setHierarchyStatusFilter("all");
    setContactNetworkStatusFilter("all");
    setContactPage(1);
    setAddressPage(1);
    setFiscalDataPage(1);
    setConsentPage(1);
    setHierarchyPage(1);
    setContactNetworkPage(1);
    setContactPageSize(CONTACT_GRID_PAGE_SIZE_OPTIONS[1]);
    setAddressPageSize(ADDRESS_GRID_PAGE_SIZE_OPTIONS[1]);
    setFiscalDataPageSize(FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS[1]);
    setConsentPageSize(CONSENT_GRID_PAGE_SIZE_OPTIONS[1]);
    setHierarchyPageSize(HIERARCHY_GRID_PAGE_SIZE_OPTIONS[1]);
    setContactNetworkPageSize(CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS[1]);
    setContactSortBy("Name");
    setContactSortDirection("asc");
    setAddressSortBy("Street");
    setAddressSortDirection("asc");
    setFiscalDataSortBy("TaxNumber");
    setFiscalDataSortDirection("asc");
    setConsentSortBy("ConsentType");
    setConsentSortDirection("asc");
    setHierarchySortBy("ParentClient");
    setHierarchySortDirection("asc");
    setContactNetworkSortBy("Name");
    setContactNetworkSortDirection("asc");
  }, [resetAddressForm, resetClientForm, resetContactForm, resetFiscalDataForm, resetConsentForm, resetHierarchyForm, resetContactNetworkForm]);

  /* ---------- Load client ---------- */

  const loadClient = useCallback(async () => {
    if (!clientId) return;
    const requestId = ++clientLoadRequestRef.current;
    setLoadingClient(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/clients/${clientId}`, { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.errors.load")));
      }
      const normalized = normalizeClient(payload);
      if (normalized) {
        if (clientLoadRequestRef.current !== requestId) {
          return;
        }
        setClient(normalized);

         // Build individual form state from API response
         const ind = normalized.individual;
         const indState: IndividualFormState = {
           fullName: ind?.fullName ?? "",
           firstName: ind?.firstName ?? "",
           lastName: ind?.lastName ?? "",
           phoneNumber: ind?.phoneNumber ?? "",
           cellPhoneNumber: ind?.cellPhoneNumber ?? "",
           isWhatsapp: ind?.isWhatsapp ?? false,
           email: ind?.email ?? "",
           birthDate: ind?.birthDate ? ind.birthDate.substring(0, 10) : "",
           gender: ind?.gender ?? "",
           documentType: ind?.documentType ?? "",
           documentNumber: ind?.documentNumber ?? "",
           nationality: ind?.nationality ?? "",
         };

        // Build company form state from API response
        const comp = normalized.company;
        const compState: CompanyFormState = {
          legalName: comp?.legalName ?? "",
          tradeName: comp?.tradeName ?? "",
          phoneNumber: comp?.phoneNumber ?? "",
          cellPhoneNumber: comp?.cellPhoneNumber ?? "",
          isWhatsapp: comp?.isWhatsapp ?? false,
          email: comp?.email ?? "",
          site: comp?.site ?? "",
          companyRegistration: comp?.companyRegistration ?? "",
          cae: comp?.cae ?? "",
          numberOfEmployee:
            typeof comp?.numberOfEmployee === "number"
              ? String(comp.numberOfEmployee)
              : "",
          legalRepresentative: comp?.legalRepresentative ?? "",
        };

        setClientFormState({
          clientType: resolveClientTypeValue(normalized),
          originType: resolveOriginTypeValue(normalized),
          isActive: normalized.isActive,
          note: normalized.note ?? "",
          individual: indState,
          company: compState,
        });
      } else {
        if (clientLoadRequestRef.current !== requestId) {
          return;
        }
        setClient(null);
      }
    } catch (error) {
      if (clientLoadRequestRef.current !== requestId) {
        return;
      }
      logError("clients.details.loadClient", "Falha ao carregar cliente", error, {
        clientId: clientId ?? undefined,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.errors.load"),
        variant: "destructive",
      });
    } finally {
      if (clientLoadRequestRef.current === requestId) {
        setLoadingClient(false);
      }
    }
  }, [clientId, fetchWithAuth, t, toast]);

  /* ---------- Load contacts ---------- */

  const loadClientContacts = useCallback(async () => {
    if (!client?.id) {
      setContacts([]);
      return;
    }
    setContactsLoading(true);
    const query = new URLSearchParams({
      PageNumber: "1",
      PageSize: String(CONTACT_PAGE_SIZE),
      SortBy: "Name",
      SortDirection: "asc",
    });
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${client.id}/contacts/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.contacts.errors.load")));
      }
      const parsed = parsePagedContacts(payload);
      setContacts(parsed.items);
    } catch (error) {
      logError("clients.details.loadContacts", "Falha ao carregar contactos", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.contacts.errors.load"),
        variant: "destructive",
      });
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Load addresses ---------- */

  const loadClientAddresses = useCallback(async () => {
    if (!client?.id) {
      setAddresses([]);
      return;
    }
    setAddressesLoading(true);
    const query = new URLSearchParams({
      PageNumber: "1",
      PageSize: String(ADDRESS_PAGE_SIZE),
      SortBy: "Street",
      SortDirection: "asc",
    });
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${client.id}/addresses/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.addresses.errors.load")));
      }
      const parsed = parsePagedAddresses(payload);
      setAddresses(parsed.items);
    } catch (error) {
      logError("clients.details.loadAddresses", "Falha ao carregar endereços", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.addresses.errors.load"),
        variant: "destructive",
      });
      setAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Load address types ---------- */

  const loadAddressTypes = useCallback(async () => {
    if (addressTypes.length > 0) return;
    try {
      const response = await fetchWithAuth("/api/gerit/v1/address-types", { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return;
      if (Array.isArray(payload)) {
        const parsed = payload
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item) => ({
            id: typeof item.id === "number" ? item.id : 0,
            name: typeof item.name === "string" ? item.name : "",
          }));
        setAddressTypes(parsed);
      }
    } catch {
      // Silent fail — address types are optional
    }
  }, [addressTypes.length, fetchWithAuth]);

  /* ---------- Load fiscal data ---------- */

  const loadClientFiscalData = useCallback(async () => {
    if (!client?.id) {
      setFiscalData([]);
      return;
    }
    setFiscalDataLoading(true);
    const query = new URLSearchParams({
      PageNumber: "1",
      PageSize: String(FISCAL_DATA_PAGE_SIZE),
      SortBy: "TaxNumber",
      SortDirection: "asc",
    });
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${client.id}/fiscal-data/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.fiscalData.errors.load")));
      }
      const parsed = parsePagedFiscalData(payload);
      setFiscalData(parsed.items);
    } catch (error) {
      logError("clients.details.loadFiscalData", "Falha ao carregar dados fiscais", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.fiscalData.errors.load"),
        variant: "destructive",
      });
      setFiscalData([]);
    } finally {
      setFiscalDataLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Load consents ---------- */

  const loadClientConsents = useCallback(async () => {
    if (!client?.id) {
      setConsents([]);
      return;
    }
    setConsentsLoading(true);
    const query = new URLSearchParams({
      PageNumber: "1",
      PageSize: String(CONSENT_PAGE_SIZE),
      SortBy: "ConsentType",
      SortDirection: "asc",
    });
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${client.id}/consents/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.consents.errors.load")));
      }
      const parsed = parsePagedConsents(payload);
      setConsents(parsed.items);
    } catch (error) {
      logError("clients.details.loadConsents", "Falha ao carregar consentimentos", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.consents.errors.load"),
        variant: "destructive",
      });
      setConsents([]);
    } finally {
      setConsentsLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Load consent types ---------- */

  const loadConsentTypes = useCallback(async () => {
    if (consentTypes.length > 0) return;
    try {
      const response = await fetchWithAuth("/api/gerit/v1/clients/consent-types", { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return;
      const parsed = normalizeConsentTypes(payload);
      setConsentTypes(parsed);
    } catch {
      // Silent fail — consent types are optional
    }
  }, [consentTypes.length, fetchWithAuth]);

  /* ---------- Load hierarchy ---------- */

  const loadClientHierarchy = useCallback(async () => {
    if (!client?.id) {
      setHierarchyItems([]);
      return;
    }
    setHierarchyLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/hierarchies/by-parent/${client.id}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.hierarchy.errors.load")));
      }
      const parsed = parsePagedHierarchy(payload);
      setHierarchyItems(parsed.items);
    } catch (error) {
      logError("clients.details.loadHierarchy", "Falha ao carregar hierarquia", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.hierarchy.errors.load"),
        variant: "destructive",
      });
      setHierarchyItems([]);
    } finally {
      setHierarchyLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Load contact network ---------- */

  const loadClientContactNetwork = useCallback(async () => {
    if (!client?.id) {
      setContactNetwork([]);
      return;
    }
    setContactNetworkLoading(true);
    const query = new URLSearchParams({
      PageNumber: "1",
      PageSize: String(CONTACT_NETWORK_PAGE_SIZE),
      SortBy: "Name",
      SortDirection: "asc",
    });
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${client.id}/contacts/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.contacts.errors.load")));
      }
      const parsed = parsePagedContactNetwork(payload);
      setContactNetwork(parsed.items);
    } catch (error) {
      logError("clients.details.loadContactNetwork", "Falha ao carregar rede de contactos", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.contacts.errors.load"),
        variant: "destructive",
      });
      setContactNetwork([]);
    } finally {
      setContactNetworkLoading(false);
    }
  }, [client, fetchWithAuth, t, toast]);

  /* ---------- Effects ---------- */

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      if (clientId) {
        resetClientViewState();
        void loadClient();
      } else {
        resetClientViewState();
      }
    }
  }, [clientId, isAuthenticated, isHydrating, loadClient, resetClientViewState]);

  // Lazy load contacts when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("contactos") && client?.id && contacts.length === 0 && !contactsLoading) {
      void loadClientContacts();
    }
  }, [loadedTabs, client?.id, contacts.length, contactsLoading, loadClientContacts]);

  // Lazy load addresses when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("enderecos") && client?.id && addresses.length === 0 && !addressesLoading) {
      void loadClientAddresses();
    }
  }, [loadedTabs, client?.id, addresses.length, addressesLoading, loadClientAddresses]);

  // Lazy load address types when addresses tab becomes active
  useEffect(() => {
    if (loadedTabs.has("enderecos")) {
      void loadAddressTypes();
    }
  }, [loadedTabs, loadAddressTypes]);

  // Lazy load fiscal data when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("fiscalData") && client?.id && fiscalData.length === 0 && !fiscalDataLoading) {
      void loadClientFiscalData();
    }
  }, [loadedTabs, client?.id, fiscalData.length, fiscalDataLoading, loadClientFiscalData]);

  // Lazy load consents when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("consents") && client?.id && consents.length === 0 && !consentsLoading) {
      void loadClientConsents();
      void loadConsentTypes();
    }
  }, [loadedTabs, client?.id, consents.length, consentsLoading, loadClientConsents, loadConsentTypes]);

  // Lazy load hierarchy when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("hierarchy") && client?.id && hierarchyItems.length === 0 && !hierarchyLoading) {
      void loadClientHierarchy();
    }
  }, [loadedTabs, client?.id, hierarchyItems.length, hierarchyLoading, loadClientHierarchy]);

  // Lazy load contact network when tab becomes active
  useEffect(() => {
    if (loadedTabs.has("contactNetwork") && client?.id && contactNetwork.length === 0 && !contactNetworkLoading) {
      void loadClientContactNetwork();
    }
  }, [loadedTabs, client?.id, contactNetwork.length, contactNetworkLoading, loadClientContactNetwork]);

  /* ---------- Client type change handler ---------- */

  const handleClientTypeChange = useCallback(
    (newClientType: string) => {
      setClientFormState((prev) => ({
        ...prev,
        clientType: newClientType,
        individual: { ...initialIndividualFormState },
        company: { ...initialCompanyFormState },
      }));
    },
    [],
  );

  /* ---------- Client submit ---------- */

  const handleClientSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const clientTypeValue = clientFormState.clientType.trim();
      const originTypeValue = clientFormState.originType.trim();
      const noteValue = clientFormState.note.trim();

      // Resolve numeric client type
      const clientTypeNumber =
        clientTypeValue.length > 0 && !Number.isNaN(Number(clientTypeValue))
          ? Number(clientTypeValue)
          : null;

      // Validate based on client type
      if (isIndividualType(clientTypeNumber ?? undefined)) {
        const ind = clientFormState.individual;
        if (!ind.firstName.trim() || !ind.lastName.trim()) {
          toast({
            title: t("clients.toasts.validationTitle"),
            description: t("clients.validation.individualRequired"),
            variant: "destructive",
          });
          return;
        }
      } else if (isCompanyType(clientTypeNumber ?? undefined)) {
        const comp = clientFormState.company;
        if (!comp.legalName.trim()) {
          toast({
            title: t("clients.toasts.validationTitle"),
            description: t("clients.validation.companyRequired"),
            variant: "destructive",
          });
          return;
        }
      } else {
        // Fallback: basic name + phone validation from individual fields
        const ind = clientFormState.individual;
        if (!ind.firstName.trim() || !ind.lastName.trim()) {
          toast({
            title: t("clients.toasts.validationTitle"),
            description: t("clients.validation.individualRequired"),
            variant: "destructive",
          });
          return;
        }
      }

      setSubmittingClient(true);
      try {
        const originNumber =
          originTypeValue.length > 0 && !Number.isNaN(Number(originTypeValue))
            ? Number(originTypeValue)
            : null;

        const payload: Record<string, unknown> = {
          clientType: clientTypeNumber,
          originType: originNumber,
          isActive: clientFormState.isActive,
          note: noteValue.length > 0 ? noteValue : null,
        };

         // Add individual or company nested data
         if (isIndividualType(clientTypeNumber ?? undefined)) {
           const ind = clientFormState.individual;
           payload.individual = {
             fullName: ind.fullName.trim() || `${ind.firstName.trim()} ${ind.lastName.trim()}`.trim(),
             firstName: ind.firstName.trim(),
             lastName: ind.lastName.trim(),
             phoneNumber: ind.phoneNumber.trim(),
             cellPhoneNumber: ind.cellPhoneNumber.trim(),
             isWhatsapp: ind.isWhatsapp,
             email: ind.email.trim() || null,
             birthDate: ind.birthDate.length > 0 ? ind.birthDate : null,
             gender: ind.gender.length > 0 ? ind.gender : null,
             documentType: ind.documentType.length > 0 ? ind.documentType : null,
             documentNumber: ind.documentNumber.length > 0 ? ind.documentNumber : null,
             nationality: ind.nationality.length > 0 ? ind.nationality : null,
           };
        } else if (isCompanyType(clientTypeNumber ?? undefined)) {
          const comp = clientFormState.company;
          payload.company = {
            legalName: comp.legalName.trim(),
            tradeName: comp.tradeName.trim(),
            phoneNumber: comp.phoneNumber.trim(),
            cellPhoneNumber: comp.cellPhoneNumber.trim(),
            isWhatsapp: comp.isWhatsapp,
            email: comp.email.trim() || null,
            site: comp.site.trim() || null,
            companyRegistration: comp.companyRegistration.length > 0 ? comp.companyRegistration : null,
            cae: comp.cae.length > 0 ? comp.cae : null,
            numberOfEmployee: comp.numberOfEmployee.length > 0 && !Number.isNaN(Number(comp.numberOfEmployee))
              ? Number(comp.numberOfEmployee)
              : null,
            legalRepresentative: comp.legalRepresentative.length > 0 ? comp.legalRepresentative : null,
          };
        }

        const isEditing = Boolean(client?.id);
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client?.id}`
          : "/api/gerit/v1/clients";
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(normalizeErrorMessage(responsePayload, t("clients.errors.save")));
        }
        const normalized = normalizeClient(responsePayload);
        if (normalized) {
          setClient(normalized);

           const ind = normalized.individual;
           const comp = normalized.company;
           setClientFormState({
             clientType: resolveClientTypeValue(normalized),
             originType: resolveOriginTypeValue(normalized),
             isActive: normalized.isActive,
             note: normalized.note ?? "",
             individual: {
               fullName: ind?.fullName ?? "",
               firstName: ind?.firstName ?? "",
               lastName: ind?.lastName ?? "",
               phoneNumber: ind?.phoneNumber ?? "",
               cellPhoneNumber: ind?.cellPhoneNumber ?? "",
               isWhatsapp: ind?.isWhatsapp ?? false,
               email: ind?.email ?? "",
               birthDate: ind?.birthDate ? ind.birthDate.substring(0, 10) : "",
               gender: ind?.gender ?? "",
               documentType: ind?.documentType ?? "",
               documentNumber: ind?.documentNumber ?? "",
               nationality: ind?.nationality ?? "",
             },
             company: {
               legalName: comp?.legalName ?? "",
               tradeName: comp?.tradeName ?? "",
               phoneNumber: comp?.phoneNumber ?? "",
               cellPhoneNumber: comp?.cellPhoneNumber ?? "",
               isWhatsapp: comp?.isWhatsapp ?? false,
               email: comp?.email ?? "",
               site: comp?.site ?? "",
               companyRegistration: comp?.companyRegistration ?? "",
               cae: comp?.cae ?? "",
               numberOfEmployee:
                 typeof comp?.numberOfEmployee === "number"
                   ? String(comp.numberOfEmployee)
                   : "",
               legalRepresentative: comp?.legalRepresentative ?? "",
             },
           });
          if (!isEditing) {
            void router.replace(`/clients-details/${normalized.id}/`);
          }
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing ? t("clients.toasts.updated") : t("clients.toasts.created"),
        });
      } catch (error) {
        logError("clients.details.clientSubmit", "Falha ao salvar cliente", error, {
          clientId: client?.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.errors.save"),
          variant: "destructive",
        });
      } finally {
        setSubmittingClient(false);
      }
    },
    [
      client,
      clientFormState,
      fetchWithAuth,
      router,
      t,
      toast,
    ],
  );

  /* ---------- Client toggle status ---------- */

  const handleClientToggleStatus = useCallback(async () => {
    if (!client) return;
    try {
      const endpoint = client.isActive
        ? `/api/gerit/v1/clients/${client.id}/deactivate`
        : `/api/gerit/v1/clients/${client.id}/activate`;
      const response = await fetchWithAuth(endpoint, { method: "PATCH" });
      if (!response) return;
      const responsePayload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(responsePayload, t("clients.errors.status")));
      }
      toast({
        title: t("clients.toasts.successTitle"),
        description: client.isActive
          ? t("clients.toasts.deactivated")
          : t("clients.toasts.activated"),
      });
      await loadClient();
    } catch (error) {
      logError("clients.details.toggleStatus", "Falha ao alterar estado do cliente", error, {
        clientId: client?.id,
      });
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.errors.status"),
        variant: "destructive",
      });
    }
  }, [client, fetchWithAuth, loadClient, t, toast]);

  /* ---------- Contact submit ---------- */

  const handleContactSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const name = contactFormState.name.trim();
      const phoneNumber = contactFormState.phoneNumber.trim();
      const email = contactFormState.email.trim();
      if (!name || !phoneNumber) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.contacts.validation.required"),
          variant: "destructive",
        });
        return;
      }
      setContactSubmitting(true);
      try {
        const payload = {
          name,
          phoneNumber,
          email: email.length > 0 ? email : null,
        };
        const isEditing = editingContact !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client.id}/contacts/${editingContact?.id}`
          : `/api/gerit/v1/clients/${client.id}/contacts`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.contacts.toasts.updated")
            : t("clients.contacts.toasts.created"),
        });
        resetContactForm();
        await loadClientContacts();
      } catch (error) {
        logError("clients.details.contactSubmit", "Falha ao salvar contacto", error, {
          clientId: client?.id,
          contactName: contactFormState.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.save"),
          variant: "destructive",
        });
      } finally {
        setContactSubmitting(false);
      }
    },
    [client, contactFormState, editingContact, fetchWithAuth, loadClientContacts, resetContactForm, t, toast],
  );

  const handleContactEdit = useCallback((contact: ContactItem) => {
    setEditingContact(contact);
    setContactFormState({
      name: contact.name,
      email: contact.email ?? "",
      phoneNumber: contact.phoneNumber ?? "",
    });
  }, []);

  const handleContactToggleStatus = useCallback(
    async (contact: ContactItem) => {
      if (!client?.id) return;
      try {
        const endpoint = contact.isActive
          ? `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: contact.isActive
            ? t("clients.contacts.toasts.deactivated")
            : t("clients.contacts.toasts.activated"),
        });
        await loadClientContacts();
      } catch (error) {
        logError("clients.details.contactToggleStatus", "Falha ao alterar estado do contacto", error, {
          clientId: client?.id,
          contactId: contact.id,
          contactName: contact.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientContacts, t, toast],
  );

  const handleContactDelete = useCallback(
    (contact: ContactItem) => {
      contactDeleteRef.current = contact;
      setContactDeleteConfirmOpen(true);
    },
    [],
  );

  const handleContactDeleteConfirm = useCallback(async () => {
    const contact = contactDeleteRef.current;
    contactDeleteRef.current = null;
    setContactDeleteConfirmOpen(false);
    if (!contact || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.contacts.toasts.deleted"),
        });
        await loadClientContacts();
      } catch (error) {
        logError("clients.details.contactDelete", "Falha ao eliminar contacto", error, {
          clientId: client?.id,
          contactId: contact.id,
          contactName: contact.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientContacts, t, toast],
  );

  /* ---------- Contact Network submit ---------- */

  const handleContactNetworkSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const name = contactNetworkFormState.name.trim();
      const phoneNumber = contactNetworkFormState.phoneNumber.trim();
      const email = contactNetworkFormState.email.trim();
      const cellPhoneNumber = contactNetworkFormState.cellPhoneNumber.trim();
      if (!name || !phoneNumber) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.contacts.validation.required"),
          variant: "destructive",
        });
        return;
      }
      setContactNetworkSubmitting(true);
      try {
        const payload = {
          name,
          phoneNumber,
          email: email.length > 0 ? email : null,
          cellPhoneNumber: cellPhoneNumber.length > 0 ? cellPhoneNumber : null,
          isWhatsapp: contactNetworkFormState.isWhatsapp,
          isPrimary: contactNetworkFormState.isPrimary,
        };
        const isEditing = editingContactNetwork !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client.id}/contacts/${editingContactNetwork?.id}`
          : `/api/gerit/v1/clients/${client.id}/contacts`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.contacts.toasts.updated")
            : t("clients.contacts.toasts.created"),
        });
        resetContactNetworkForm();
        await loadClientContactNetwork();
      } catch (error) {
        logError("clients.details.contactNetworkSubmit", "Falha ao salvar contacto da rede", error, {
          clientId: client?.id,
          contactName: contactNetworkFormState.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.save"),
          variant: "destructive",
        });
      } finally {
        setContactNetworkSubmitting(false);
      }
    },
    [client, contactNetworkFormState, editingContactNetwork, fetchWithAuth, loadClientContactNetwork, resetContactNetworkForm, t, toast],
  );

  const handleContactNetworkEdit = useCallback((contact: ContactNetworkItem) => {
    setEditingContactNetwork(contact);
    setContactNetworkFormState({
      name: contact.name,
      email: contact.email ?? "",
      phoneNumber: contact.phoneNumber ?? "",
      cellPhoneNumber: contact.cellPhoneNumber ?? "",
      isWhatsapp: contact.isWhatsapp,
      isPrimary: contact.isPrimary,
    });
  }, []);

  const handleContactNetworkToggleStatus = useCallback(
    async (contact: ContactNetworkItem) => {
      if (!client?.id) return;
      try {
        const endpoint = contact.isActive
          ? `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: contact.isActive
            ? t("clients.contacts.toasts.deactivated")
            : t("clients.contacts.toasts.activated"),
        });
        await loadClientContactNetwork();
      } catch (error) {
        logError("clients.details.contactNetworkToggleStatus", "Falha ao alterar estado do contacto da rede", error, {
          clientId: client?.id,
          contactId: contact.id,
          contactName: contact.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientContactNetwork, t, toast],
  );

  const handleContactNetworkDelete = useCallback(
    (contact: ContactNetworkItem) => {
      contactNetworkDeleteRef.current = contact;
      setContactNetworkDeleteConfirmOpen(true);
    },
    [],
  );

  const handleContactNetworkDeleteConfirm = useCallback(async () => {
    const contact = contactNetworkDeleteRef.current;
    contactNetworkDeleteRef.current = null;
    setContactNetworkDeleteConfirmOpen(false);
    if (!contact || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.contacts.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.contacts.toasts.deleted"),
        });
        await loadClientContactNetwork();
      } catch (error) {
        logError("clients.details.contactNetworkDelete", "Falha ao eliminar contacto da rede", error, {
          clientId: client?.id,
          contactId: contact.id,
          contactName: contact.name,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.contacts.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientContactNetwork, t, toast],
  );

  /* ---------- Address submit ---------- */

  const handleAddressSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const street = addressFormState.street.trim();
      const neighborhood = addressFormState.neighborhood.trim();
      const city = addressFormState.city.trim();
      const state = addressFormState.state.trim();
      const postalCode = addressFormState.postalCode.trim();
      const country = addressFormState.country.trim();
      if (!street || !city || !neighborhood || !state || !country || !addressFormState.addressTypeId) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.addresses.validation.required"),
          variant: "destructive",
        });
        return;
      }
      setAddressSubmitting(true);
      try {
        const payload = {
          addressTypeId: addressFormState.addressTypeId ? Number(addressFormState.addressTypeId) : null,
          street,
          number: addressFormState.number.trim().length > 0 ? addressFormState.number.trim() : null,
          complement: addressFormState.complement.trim().length > 0 ? addressFormState.complement.trim() : null,
          neighborhood,
          city,
          state: state.length > 0 ? state : null,
          postalCode: postalCode.length > 0 ? postalCode : null,
          country: country.length > 0 ? country : null,
          latitude: addressFormState.latitude.trim().length > 0 ? addressFormState.latitude.trim() : null,
          longitude: addressFormState.longitude.trim().length > 0 ? addressFormState.longitude.trim() : null,
          note: addressFormState.note.trim().length > 0 ? addressFormState.note.trim() : null,
          isPrimary: addressFormState.isPrimary,
        };
        const isEditing = editingAddress !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client.id}/addresses/${editingAddress?.id}`
          : `/api/gerit/v1/clients/${client.id}/addresses`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.addresses.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.addresses.toasts.updated")
            : t("clients.addresses.toasts.created"),
        });
        resetAddressForm();
        await loadClientAddresses();
      } catch (error) {
        logError("clients.details.addressSubmit", "Falha ao salvar endereço", error, {
          clientId: client?.id,
          street: addressFormState.street,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.addresses.errors.save"),
          variant: "destructive",
        });
      } finally {
        setAddressSubmitting(false);
      }
    },
    [addressFormState, client, editingAddress, fetchWithAuth, loadClientAddresses, resetAddressForm, t, toast],
  );

  const handleAddressEdit = useCallback((address: AddressItem) => {
    setEditingAddress(address);
    setAddressFormState({
      addressTypeId: address.addressTypeId != null ? String(address.addressTypeId) : "",
      street: address.street ?? "",
      number: address.number ?? "",
      complement: address.complement ?? "",
      neighborhood: address.neighborhood ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      postalCode: address.postalCode ?? "",
      country: address.country ?? "",
      latitude: address.latitude ?? "",
      longitude: address.longitude ?? "",
      note: address.note ?? "",
      isPrimary: address.isPrimary,
    });
  }, []);

  const handleAddressToggleStatus = useCallback(
    async (address: AddressItem) => {
      if (!client?.id) return;
      try {
        const endpoint = address.isActive
          ? `/api/gerit/v1/clients/${client.id}/addresses/${address.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/addresses/${address.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.addresses.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: address.isActive
            ? t("clients.addresses.toasts.deactivated")
            : t("clients.addresses.toasts.activated"),
        });
        await loadClientAddresses();
      } catch (error) {
        logError("clients.details.addressToggleStatus", "Falha ao alterar estado do endereço", error, {
          clientId: client?.id,
          addressId: address.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.addresses.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientAddresses, t, toast],
  );

  const handleAddressDelete = useCallback(
    (address: AddressItem) => {
      addressDeleteRef.current = address;
      setAddressDeleteConfirmOpen(true);
    },
    [],
  );

  const handleAddressDeleteConfirm = useCallback(async () => {
    const address = addressDeleteRef.current;
    addressDeleteRef.current = null;
    setAddressDeleteConfirmOpen(false);
    if (!address || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/addresses/${address.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.addresses.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.addresses.toasts.deleted"),
        });
        await loadClientAddresses();
      } catch (error) {
        logError("clients.details.addressDelete", "Falha ao eliminar endereço", error, {
          clientId: client?.id,
          addressId: address.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.addresses.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientAddresses, t, toast],
  );

  /* ---------- Fiscal Data submit ---------- */

  const handleFiscalDataSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const taxNumber = fiscalDataFormState.taxNumber.trim();
      const fiscalCountry = fiscalDataFormState.fiscalCountry.trim();
      const isVatRegistered = fiscalDataFormState.isVatRegistered;
      const fiscalEmail = fiscalDataFormState.fiscalEmail.trim();

      // Validate required fields
      if (!taxNumber || !fiscalCountry || !isVatRegistered || !fiscalEmail) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.fiscalData.validation.requiredAll"),
          variant: "destructive",
        });
        return;
      }
      setFiscalDataSubmitting(true);
      try {
        const payload = {
          taxNumber,
          vatNumber: fiscalDataFormState.vatNumber.trim() || null,
          fiscalCountry,
          isVatRegistered,
          iban: fiscalDataFormState.iban.trim() || null,
          fiscalEmail,
        };
        const isEditing = editingFiscalData !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client.id}/fiscal-data/${editingFiscalData?.id}`
          : `/api/gerit/v1/clients/${client.id}/fiscal-data`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.fiscalData.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.fiscalData.toasts.updated")
            : t("clients.fiscalData.toasts.created"),
        });
        resetFiscalDataForm();
        await loadClientFiscalData();
      } catch (error) {
        logError("clients.details.fiscalDataSubmit", "Falha ao salvar dados fiscais", error, {
          clientId: client?.id,
          taxNumber: fiscalDataFormState.taxNumber,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.fiscalData.errors.save"),
          variant: "destructive",
        });
      } finally {
        setFiscalDataSubmitting(false);
      }
    },
    [client, fiscalDataFormState, editingFiscalData, fetchWithAuth, loadClientFiscalData, resetFiscalDataForm, t, toast],
  );

  const handleFiscalDataEdit = useCallback((data: ClientFiscalDataItem) => {
    setEditingFiscalData(data);
    setFiscalDataFormState({
      taxNumber: data.taxNumber ?? "",
      vatNumber: data.vatNumber ?? "",
      fiscalCountry: data.fiscalCountry ?? "",
      isVatRegistered: data.isVatRegistered,
      iban: data.iban ?? "",
      fiscalEmail: data.fiscalEmail ?? "",
    });
  }, []);

  const handleFiscalDataToggleStatus = useCallback(
    async (data: ClientFiscalDataItem) => {
      if (!client?.id) return;
      try {
        const endpoint = data.isActive
          ? `/api/gerit/v1/clients/${client.id}/fiscal-data/${data.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/fiscal-data/${data.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.fiscalData.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: data.isActive
            ? t("clients.fiscalData.toasts.deactivated")
            : t("clients.fiscalData.toasts.activated"),
        });
        await loadClientFiscalData();
      } catch (error) {
        logError("clients.details.fiscalDataToggleStatus", "Falha ao alterar estado dos dados fiscais", error, {
          clientId: client?.id,
          fiscalDataId: data.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.fiscalData.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientFiscalData, t, toast],
  );

  const handleFiscalDataDelete = useCallback(
    (data: ClientFiscalDataItem) => {
      fiscalDataDeleteRef.current = data;
      setFiscalDataDeleteConfirmOpen(true);
    },
    [],
  );

  const handleFiscalDataDeleteConfirm = useCallback(async () => {
    const data = fiscalDataDeleteRef.current;
    fiscalDataDeleteRef.current = null;
    setFiscalDataDeleteConfirmOpen(false);
    if (!data || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/fiscal-data/${data.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.fiscalData.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.fiscalData.toasts.deleted"),
        });
        await loadClientFiscalData();
      } catch (error) {
        logError("clients.details.fiscalDataDelete", "Falha ao eliminar dados fiscais", error, {
          clientId: client?.id,
          fiscalDataId: data.id,
          taxNumber: data.taxNumber,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.fiscalData.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientFiscalData, t, toast],
  );

  /* ---------- Consents submit ---------- */

  const handleConsentSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const consentTypeId = consentFormState.consentTypeId.trim();
      if (!consentTypeId) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.consents.validation.required"),
          variant: "destructive",
        });
        return;
      }
      setConsentSubmitting(true);
      try {
        const payload = {
          consentTypeId: Number(consentTypeId),
          granted: consentFormState.granted,
          grantedDate: consentFormState.grantedDate || null,
          revokedDate: consentFormState.revokedDate || null,
          origin: consentFormState.origin.trim() || null,
          ipAddress: consentFormState.ipAddress.trim() || null,
          userAgent: consentFormState.userAgent.trim() || null,
        };
        const isEditing = editingConsent !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/${client.id}/consents/${editingConsent?.id}`
          : `/api/gerit/v1/clients/${client.id}/consents`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.consents.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.consents.toasts.updated")
            : t("clients.consents.toasts.created"),
        });
        resetConsentForm();
        await loadClientConsents();
      } catch (error) {
        logError("clients.details.consentSubmit", "Falha ao salvar consentimento", error, {
          clientId: client?.id,
          consentTypeId: consentFormState.consentTypeId,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.consents.errors.save"),
          variant: "destructive",
        });
      } finally {
        setConsentSubmitting(false);
      }
    },
    [client, consentFormState, editingConsent, fetchWithAuth, loadClientConsents, resetConsentForm, t, toast],
  );

  const handleConsentEdit = useCallback((data: ClientConsentItem) => {
    setEditingConsent(data);
    setConsentFormState({
      consentTypeId: String(data.consentTypeId),
      granted: data.granted,
      grantedDate: data.grantedDate ?? "",
      revokedDate: data.revokedDate ?? "",
      origin: data.origin ?? "",
      ipAddress: data.ipAddress ?? "",
      userAgent: data.userAgent ?? "",
    });
  }, []);

  const handleConsentToggleStatus = useCallback(
    async (data: ClientConsentItem) => {
      if (!client?.id) return;
      try {
        const endpoint = data.isActive
          ? `/api/gerit/v1/clients/${client.id}/consents/${data.id}/deactivate`
          : `/api/gerit/v1/clients/${client.id}/consents/${data.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.consents.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: data.isActive
            ? t("clients.consents.toasts.deactivated")
            : t("clients.consents.toasts.activated"),
        });
        await loadClientConsents();
      } catch (error) {
        logError("clients.details.consentToggleStatus", "Falha ao alterar estado do consentimento", error, {
          clientId: client?.id,
          consentId: data.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.consents.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientConsents, t, toast],
  );

  const handleConsentDelete = useCallback(
    (data: ClientConsentItem) => {
      consentDeleteRef.current = data;
      setConsentDeleteConfirmOpen(true);
    },
    [],
  );

  const handleConsentDeleteConfirm = useCallback(async () => {
    const data = consentDeleteRef.current;
    consentDeleteRef.current = null;
    setConsentDeleteConfirmOpen(false);
    if (!data || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/consents/${data.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.consents.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.consents.toasts.deleted"),
        });
        await loadClientConsents();
      } catch (error) {
        logError("clients.details.consentDelete", "Falha ao eliminar consentimento", error, {
          clientId: client?.id,
          consentId: data.id,
          consentTypeName: data.consentTypeName,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.consents.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientConsents, t, toast],
  );

  /* ---------- Hierarchy submit ---------- */

  const handleHierarchySubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const parentClientId = hierarchyFormState.parentClientId.trim();
      const childClientId = hierarchyFormState.childClientId.trim();
      if (!parentClientId || !childClientId) {
        toast({
          title: t("clients.toasts.validationTitle"),
          description: t("clients.hierarchy.validation.required"),
          variant: "destructive",
        });
        return;
      }
      setHierarchySubmitting(true);
      try {
        const payload = {
          parentClientId: Number(parentClientId),
          childClientId: Number(childClientId),
          relationshipType: hierarchyFormState.relationshipType.trim() || null,
        };
        const isEditing = editingHierarchy !== null;
        const endpoint = isEditing
          ? `/api/gerit/v1/clients/hierarchies/${editingHierarchy?.id}`
          : `/api/gerit/v1/clients/hierarchies`;
        const response = await fetchWithAuth(endpoint, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.hierarchy.errors.save")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing
            ? t("clients.hierarchy.toasts.updated")
            : t("clients.hierarchy.toasts.created"),
        });
        resetHierarchyForm();
        await loadClientHierarchy();
      } catch (error) {
        logError("clients.details.hierarchySubmit", "Falha ao salvar hierarquia", error, {
          clientId: client?.id,
          parentClientId: hierarchyFormState.parentClientId,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.hierarchy.errors.save"),
          variant: "destructive",
        });
      } finally {
        setHierarchySubmitting(false);
      }
    },
    [client, hierarchyFormState, editingHierarchy, fetchWithAuth, loadClientHierarchy, resetHierarchyForm, t, toast],
  );

  const handleHierarchyEdit = useCallback((data: ClientHierarchyItem) => {
    setEditingHierarchy(data);
    setHierarchyFormState({
      parentClientId: String(data.parentClientId),
      childClientId: String(data.childClientId),
      relationshipType: data.relationshipType ?? "",
    });
  }, []);

  const handleHierarchyToggleStatus = useCallback(
    async (data: ClientHierarchyItem) => {
      if (!client?.id) return;
      try {
        const endpoint = data.isActive
          ? `/api/gerit/v1/clients/hierarchies/${data.id}/deactivate`
          : `/api/gerit/v1/clients/hierarchies/${data.id}/activate`;
        const response = await fetchWithAuth(endpoint, { method: "PATCH" });
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.hierarchy.errors.status")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: data.isActive
            ? t("clients.hierarchy.toasts.deactivated")
            : t("clients.hierarchy.toasts.activated"),
        });
        await loadClientHierarchy();
      } catch (error) {
        logError("clients.details.hierarchyToggleStatus", "Falha ao alterar estado da relação", error, {
          clientId: client?.id,
          hierarchyId: data.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.hierarchy.errors.status"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientHierarchy, t, toast],
  );

  const handleHierarchyDelete = useCallback(
    (data: ClientHierarchyItem) => {
      hierarchyDeleteRef.current = data;
      setHierarchyDeleteConfirmOpen(true);
    },
    [],
  );

  const handleHierarchyDeleteConfirm = useCallback(async () => {
    const data = hierarchyDeleteRef.current;
    hierarchyDeleteRef.current = null;
    setHierarchyDeleteConfirmOpen(false);
    if (!data || !client?.id) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/hierarchies/${data.id}`,
          { method: "DELETE" },
        );
        if (!response) return;
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(responsePayload, t("clients.hierarchy.errors.delete")),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.hierarchy.toasts.deleted"),
        });
        await loadClientHierarchy();
      } catch (error) {
        logError("clients.details.hierarchyDelete", "Falha ao eliminar relação", error, {
          clientId: client?.id,
          hierarchyId: data.id,
          parentClientName: data.parentClientName,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error ? error.message : t("clients.hierarchy.errors.delete"),
          variant: "destructive",
        });
      }
    },
    [client, fetchWithAuth, loadClientHierarchy, t, toast],
  );

  /* ---------- Bulk upload handlers ---------- */

  const handleContactsBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || contactsBulkUploading || !client?.id) return;
      setContactsBulkUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/contacts/bulk-upload`,
          { method: "POST", body: formData },
        );
        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              payload,
              t("clients.bulk.upload.error", { resource: t("clients.contacts.title") }),
            ),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.bulk.upload.success", { resource: t("clients.contacts.title") }),
        });
        await loadClientContacts();
      } catch (error) {
        logError("clients.details.contactsBulkUpload", "Falha no upload em massa de contactos", error, {
          clientId: client?.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.bulk.upload.error", { resource: t("clients.contacts.title") }),
          variant: "destructive",
        });
      } finally {
        setContactsBulkUploading(false);
      }
    },
    [client, contactsBulkUploading, fetchWithAuth, loadClientContacts, t, toast],
  );

  const handleContactNetworkBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || contactNetworkBulkUploading || !client?.id) return;
      setContactNetworkBulkUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/contacts/bulk-upload`,
          { method: "POST", body: formData },
        );
        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              payload,
              t("clients.bulk.upload.error", { resource: t("clients.contacts.title") }),
            ),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.bulk.upload.success", { resource: t("clients.contacts.title") }),
        });
        await loadClientContactNetwork();
      } catch (error) {
        logError("clients.details.contactNetworkBulkUpload", "Falha no upload em massa de contactos da rede", error, {
          clientId: client?.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.bulk.upload.error", { resource: t("clients.contacts.title") }),
          variant: "destructive",
        });
      } finally {
        setContactNetworkBulkUploading(false);
      }
    },
    [client, contactNetworkBulkUploading, fetchWithAuth, loadClientContactNetwork, t, toast],
  );

  const handleAddressesBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || addressesBulkUploading || !client?.id) return;
      setAddressesBulkUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/addresses/bulk-upload`,
          { method: "POST", body: formData },
        );
        if (!response) return;
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            normalizeErrorMessage(
              payload,
              t("clients.bulk.upload.error", { resource: t("clients.addresses.title") }),
            ),
          );
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: t("clients.bulk.upload.success", { resource: t("clients.addresses.title") }),
        });
        await loadClientAddresses();
      } catch (error) {
        logError("clients.details.addressesBulkUpload", "Falha no upload em massa de endereços", error, {
          clientId: client?.id,
        });
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.bulk.upload.error", { resource: t("clients.addresses.title") }),
          variant: "destructive",
        });
      } finally {
        setAddressesBulkUploading(false);
      }
    },
    [addressesBulkUploading, client, fetchWithAuth, loadClientAddresses, t, toast],
  );

  /* ---------- Derived contact/address data ---------- */

  const primaryContact = useMemo(
    () => contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null,
    [contacts],
  );

  const primaryAddress = useMemo(
    () => addresses.find((a) => a.isPrimary) ?? addresses[0] ?? null,
    [addresses],
  );

  /* ---------- Contact grid ---------- */

  const gridDensityOptions = useMemo(
    () => [
      { key: "compact" as const, label: t("clients.grid.density.slow") },
      { key: "medium" as const, label: t("clients.grid.density.medium") },
      { key: "expanded" as const, label: t("clients.grid.density.expanded") },
    ],
    [t],
  );

  const contactColumns = useMemo<HubGridColumn<ContactItem>[]>(
    () => [
      { key: "Name", label: t("clients.contacts.table.name") },
      { key: "Phone", label: t("clients.contacts.table.phone") },
      { key: "Email", label: t("clients.contacts.table.email") },
      { key: "Primary", label: t("clients.contacts.table.primary") },
    ],
    [t],
  );

  const contactStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredContacts = useMemo(() => {
    const searchTerm = contactSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (contactStatusFilter !== "all") {
        const expected = contactStatusFilter === "active";
        if (contact.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      const email = contact.email ?? "";
      const phone = contact.phoneNumber ?? "";
      return (
        contact.name.toLowerCase().includes(searchTerm) ||
        email.toLowerCase().includes(searchTerm) ||
        phone.toLowerCase().includes(searchTerm)
      );
    });
  }, [contactSearch, contactStatusFilter, contacts]);

  const sortedContacts = useMemo(() => {
    const items = [...filteredContacts];
    items.sort((current, next) => {
      const a = getContactSortValue(current, contactSortBy);
      const b = getContactSortValue(next, contactSortBy);
      const comparison = a.localeCompare(b);
      return contactSortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [filteredContacts, contactSortBy, contactSortDirection]);

  const contactTotalPages = Math.max(1, Math.ceil(sortedContacts.length / contactPageSize));

  useEffect(() => {
    setContactPage((current) => Math.min(current, contactTotalPages));
  }, [contactTotalPages]);

  const contactPageButtons = useMemo(
    () => buildPageButtons(contactPage, contactTotalPages),
    [contactPage, contactTotalPages],
  );

  const visibleContacts = useMemo(() => {
    const startIndex = (contactPage - 1) * contactPageSize;
    return sortedContacts.slice(startIndex, startIndex + contactPageSize);
  }, [contactPage, contactPageSize, sortedContacts]);

  const contactPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedContacts.length) }),
    [sortedContacts.length, t],
  );

  useEffect(() => {
    setContactPage(1);
  }, [contactStatusFilter, contactSearch, contactSortBy, contactSortDirection, contactPageSize]);

  const contactRowCells = useCallback(
    (contact: ContactItem) => [
      contact.name,
      contact.phoneNumber ?? "-",
      contact.email ?? "-",
      contact.isPrimary ? (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {t("common.no")}
        </span>
      ),
    ],
    [t],
  );

  const renderContactStatus = useCallback(
    (contact: ContactItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {contact.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderContactActions = useCallback(
    (contact: ContactItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleContactEdit(contact)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleContactToggleStatus(contact)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            contact.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {contact.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => void handleContactDelete(contact)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleContactDelete, handleContactEdit, handleContactToggleStatus, t],
  );

  const handleContactSort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as ContactSortColumn;
      if (normalized === contactSortBy) {
        setContactSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setContactSortDirection("asc");
      setContactSortBy(normalized);
    },
    [contactSortBy],
  );

  /* ---------- Contact Network grid ---------- */

  const contactNetworkColumns = useMemo<HubGridColumn<ContactNetworkItem>[]>(
    () => [
      { key: "Name", label: t("clients.contacts.table.name") },
      { key: "PhoneNumber", label: t("clients.contacts.table.phone") },
      { key: "CellPhoneNumber", label: t("clients.contacts.table.cellPhone") },
      { key: "Email", label: t("clients.contacts.table.email") },
      { key: "IsWhatsapp", label: t("clients.contacts.table.isWhatsapp") },
      { key: "IsPrimary", label: t("clients.contacts.table.primary") },
    ],
    [t],
  );

  const contactNetworkStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredContactNetwork = useMemo(() => {
    const searchTerm = contactNetworkSearch.trim().toLowerCase();
    return contactNetwork.filter((contact) => {
      if (contactNetworkStatusFilter !== "all") {
        const expected = contactNetworkStatusFilter === "active";
        if (contact.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      const email = contact.email ?? "";
      const phone = contact.phoneNumber ?? "";
      const cellPhone = contact.cellPhoneNumber ?? "";
      return (
        contact.name.toLowerCase().includes(searchTerm) ||
        email.toLowerCase().includes(searchTerm) ||
        phone.toLowerCase().includes(searchTerm) ||
        cellPhone.toLowerCase().includes(searchTerm)
      );
    });
  }, [contactNetworkSearch, contactNetworkStatusFilter, contactNetwork]);

  const sortedContactNetwork = useMemo(() => {
    const items = [...filteredContactNetwork];
    items.sort((current, next) => {
      const a = getContactNetworkSortValue(current, contactNetworkSortBy);
      const b = getContactNetworkSortValue(next, contactNetworkSortBy);
      const comparison = a.localeCompare(b);
      return contactNetworkSortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [filteredContactNetwork, contactNetworkSortBy, contactNetworkSortDirection]);

  const contactNetworkTotalPages = Math.max(1, Math.ceil(sortedContactNetwork.length / contactNetworkPageSize));

  useEffect(() => {
    setContactNetworkPage((current) => Math.min(current, contactNetworkTotalPages));
  }, [contactNetworkTotalPages]);

  const contactNetworkPageButtons = useMemo(
    () => buildPageButtons(contactNetworkPage, contactNetworkTotalPages),
    [contactNetworkPage, contactNetworkTotalPages],
  );

  const visibleContactNetwork = useMemo(() => {
    const startIndex = (contactNetworkPage - 1) * contactNetworkPageSize;
    return sortedContactNetwork.slice(startIndex, startIndex + contactNetworkPageSize);
  }, [contactNetworkPage, contactNetworkPageSize, sortedContactNetwork]);

  const contactNetworkPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedContactNetwork.length) }),
    [sortedContactNetwork.length, t],
  );

  useEffect(() => {
    setContactNetworkPage(1);
  }, [contactNetworkStatusFilter, contactNetworkSearch, contactNetworkSortBy, contactNetworkSortDirection, contactNetworkPageSize]);

  const contactNetworkRowCells = useCallback(
    (contact: ContactNetworkItem) => [
      contact.name,
      contact.phoneNumber ?? "-",
      contact.cellPhoneNumber ?? "-",
      contact.email ?? "-",
      contact.isWhatsapp ? (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {t("common.no")}
        </span>
      ),
      contact.isPrimary ? (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {t("common.no")}
        </span>
      ),
    ],
    [t],
  );

  const renderContactNetworkStatus = useCallback(
    (contact: ContactNetworkItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {contact.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderContactNetworkActions = useCallback(
    (contact: ContactNetworkItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleContactNetworkEdit(contact)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleContactNetworkToggleStatus(contact)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            contact.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {contact.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => void handleContactNetworkDelete(contact)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleContactNetworkDelete, handleContactNetworkEdit, handleContactNetworkToggleStatus, t],
  );

  const handleContactNetworkSort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as ContactNetworkSortColumnLocal;
      if (normalized === contactNetworkSortBy) {
        setContactNetworkSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setContactNetworkSortDirection("asc");
      setContactNetworkSortBy(normalized);
    },
    [contactNetworkSortBy],
  );

  /* ---------- Address grid ---------- */

  const addressColumns = useMemo<HubGridColumn<AddressItem>[]>(
    () => [
      { key: "Street", label: t("clients.addresses.table.street") },
      { key: "City", label: t("clients.addresses.table.city") },
      { key: "State", label: t("clients.addresses.table.state") },
      { key: "PostalCode", label: t("clients.addresses.table.postalCode") },
    ],
    [t],
  );

  const addressStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredAddresses = useMemo(() => {
    const searchTerm = addressSearch.trim().toLowerCase();
    return addresses.filter((address) => {
      if (addressStatusFilter !== "all") {
        const expected = addressStatusFilter === "active";
        if (address.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      const street = address.street ?? "";
      const city = address.city ?? "";
      return (
        street.toLowerCase().includes(searchTerm) ||
        city.toLowerCase().includes(searchTerm)
      );
    });
  }, [addressSearch, addressStatusFilter, addresses]);

  const sortedAddresses = useMemo(() => {
    const items = [...filteredAddresses];
    items.sort((current, next) => {
      const a = getAddressSortValue(current, addressSortBy);
      const b = getAddressSortValue(next, addressSortBy);
      const comparison = a.localeCompare(b);
      return addressSortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [addressSortBy, addressSortDirection, filteredAddresses]);

  const addressTotalPages = Math.max(1, Math.ceil(sortedAddresses.length / addressPageSize));

  useEffect(() => {
    setAddressPage((current) => Math.min(current, addressTotalPages));
  }, [addressTotalPages]);

  const addressPageButtons = useMemo(
    () => buildPageButtons(addressPage, addressTotalPages),
    [addressPage, addressTotalPages],
  );

  const visibleAddresses = useMemo(() => {
    const startIndex = (addressPage - 1) * addressPageSize;
    return sortedAddresses.slice(startIndex, startIndex + addressPageSize);
  }, [addressPage, addressPageSize, sortedAddresses]);

  const addressPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedAddresses.length) }),
    [sortedAddresses.length, t],
  );

  useEffect(() => {
    setAddressPage(1);
  }, [addressStatusFilter, addressSearch, addressSortBy, addressSortDirection, addressPageSize]);

  const addressRowCells = useCallback(
    (address: AddressItem) => [
      address.street ?? "-",
      address.city ?? "-",
      address.state ?? "-",
      address.postalCode ?? "-",
    ],
    [],
  );

  const renderAddressStatus = useCallback(
    (address: AddressItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {address.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderAddressActions = useCallback(
    (address: AddressItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleAddressEdit(address)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleAddressToggleStatus(address)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            address.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {address.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => void handleAddressDelete(address)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleAddressDelete, handleAddressEdit, handleAddressToggleStatus, t],
  );

  const handleAddressSort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as AddressSortColumn;
      if (normalized === addressSortBy) {
        setAddressSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setAddressSortDirection("asc");
      setAddressSortBy(normalized);
    },
    [addressSortBy],
  );

  /* ---------- Fiscal Data grid ---------- */

  const fiscalDataColumns = useMemo<HubGridColumn<ClientFiscalDataItem>[]>(
    () => [
      { key: "TaxNumber", label: t("clients.fiscalData.table.taxNumber") },
      { key: "VatNumber", label: t("clients.fiscalData.table.vatNumber") },
      { key: "FiscalCountry", label: t("clients.fiscalData.table.fiscalCountry") },
      { key: "IsVatRegistered", label: t("clients.fiscalData.table.isVatRegistered") },
      { key: "Iban", label: t("clients.fiscalData.table.iban") },
      { key: "FiscalEmail", label: t("clients.fiscalData.table.fiscalEmail") },
    ],
    [t],
  );

  const fiscalDataStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredFiscalData = useMemo(() => {
    const searchTerm = fiscalDataSearch.trim().toLowerCase();
    return fiscalData.filter((item) => {
      if (fiscalDataStatusFilter !== "all") {
        const expected = fiscalDataStatusFilter === "active";
        if (item.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      return (
        (item.taxNumber ?? "").toLowerCase().includes(searchTerm) ||
        (item.vatNumber ?? "").toLowerCase().includes(searchTerm) ||
        (item.fiscalEmail ?? "").toLowerCase().includes(searchTerm)
      );
    });
  }, [fiscalDataSearch, fiscalDataStatusFilter, fiscalData]);

  const sortedFiscalData = useMemo(() => {
    const items = [...filteredFiscalData];
    items.sort((current, next) => {
      const a = getFiscalDataSortValue(current, fiscalDataSortBy);
      const b = getFiscalDataSortValue(next, fiscalDataSortBy);
      const comparison = a.localeCompare(b);
      return fiscalDataSortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [filteredFiscalData, fiscalDataSortBy, fiscalDataSortDirection]);

  const fiscalDataTotalPages = Math.max(1, Math.ceil(sortedFiscalData.length / fiscalDataPageSize));

  useEffect(() => {
    setFiscalDataPage((current) => Math.min(current, fiscalDataTotalPages));
  }, [fiscalDataTotalPages]);

  const fiscalDataPageButtons = useMemo(
    () => buildPageButtons(fiscalDataPage, fiscalDataTotalPages),
    [fiscalDataPage, fiscalDataTotalPages],
  );

  const visibleFiscalData = useMemo(() => {
    const startIndex = (fiscalDataPage - 1) * fiscalDataPageSize;
    return sortedFiscalData.slice(startIndex, startIndex + fiscalDataPageSize);
  }, [fiscalDataPage, fiscalDataPageSize, sortedFiscalData]);

  const fiscalDataPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedFiscalData.length) }),
    [sortedFiscalData.length, t],
  );

  useEffect(() => {
    setFiscalDataPage(1);
  }, [fiscalDataStatusFilter, fiscalDataSearch, fiscalDataSortBy, fiscalDataSortDirection, fiscalDataPageSize]);

  const fiscalDataRowCells = useCallback(
    (item: ClientFiscalDataItem) => [
      item.taxNumber ?? "-",
      item.vatNumber ?? "-",
      item.fiscalCountry ?? "-",
      item.isVatRegistered ? (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {t("common.no")}
        </span>
      ),
      item.iban ?? "-",
      item.fiscalEmail ?? "-",
    ],
    [t],
  );

  const renderFiscalDataStatus = useCallback(
    (item: ClientFiscalDataItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {item.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderFiscalDataActions = useCallback(
    (item: ClientFiscalDataItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleFiscalDataEdit(item)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleFiscalDataToggleStatus(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            item.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {item.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => handleFiscalDataDelete(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleFiscalDataDelete, handleFiscalDataEdit, handleFiscalDataToggleStatus, t],
  );

  const handleFiscalDataSort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as FiscalDataSortColumn;
      if (normalized === fiscalDataSortBy) {
        setFiscalDataSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setFiscalDataSortDirection("asc");
      setFiscalDataSortBy(normalized);
    },
    [fiscalDataSortBy],
  );

  /* ---------- Consent grid ---------- */

  const consentColumns = useMemo<HubGridColumn<ClientConsentItem>[]>(
    () => [
      { key: "ConsentType", label: t("clients.consents.table.consentType") },
      { key: "Granted", label: t("clients.consents.table.granted") },
      { key: "GrantedDate", label: t("clients.consents.table.grantedDate") },
      { key: "RevokedDate", label: t("clients.consents.table.revokedDate") },
      { key: "Origin", label: t("clients.consents.table.origin") },
    ],
    [t],
  );

  const consentStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredConsents = useMemo(() => {
    const searchTerm = consentSearch.trim().toLowerCase();
    return consents.filter((item) => {
      if (consentStatusFilter !== "all") {
        const expected = consentStatusFilter === "active";
        if (item.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      return (
        (item.consentTypeName ?? "").toLowerCase().includes(searchTerm) ||
        (item.origin ?? "").toLowerCase().includes(searchTerm)
      );
    });
  }, [consentSearch, consentStatusFilter, consents]);

  const sortedConsents = useMemo(() => {
    const items = [...filteredConsents];
    items.sort((current, next) => {
      let a = "";
      let b = "";
      switch (consentSortBy) {
        case "ConsentType":
          a = (current.consentTypeName ?? "").toLowerCase();
          b = (next.consentTypeName ?? "").toLowerCase();
          break;
        case "Granted":
          a = current.granted ? "1" : "0";
          b = next.granted ? "1" : "0";
          break;
        case "GrantedDate":
          a = (current.grantedDate ?? "").toLowerCase();
          b = (next.grantedDate ?? "").toLowerCase();
          break;
        case "RevokedDate":
          a = (current.revokedDate ?? "").toLowerCase();
          b = (next.revokedDate ?? "").toLowerCase();
          break;
        case "Origin":
          a = (current.origin ?? "").toLowerCase();
          b = (next.origin ?? "").toLowerCase();
          break;
      }
      const comparison = a.localeCompare(b);
      return consentSortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [filteredConsents, consentSortBy, consentSortDirection]);

  const consentTotalPages = Math.max(1, Math.ceil(sortedConsents.length / consentPageSize));

  useEffect(() => {
    setConsentPage((current) => Math.min(current, consentTotalPages));
  }, [consentTotalPages]);

  const consentPageButtons = useMemo(
    () => buildPageButtons(consentPage, consentTotalPages),
    [consentPage, consentTotalPages],
  );

  const visibleConsents = useMemo(() => {
    const startIndex = (consentPage - 1) * consentPageSize;
    return sortedConsents.slice(startIndex, startIndex + consentPageSize);
  }, [consentPage, consentPageSize, sortedConsents]);

  const consentPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedConsents.length) }),
    [sortedConsents.length, t],
  );

  useEffect(() => {
    setConsentPage(1);
  }, [consentStatusFilter, consentSearch, consentSortBy, consentSortDirection, consentPageSize]);

  const consentRowCells = useCallback(
    (item: ClientConsentItem) => [
      item.consentTypeName ?? "-",
      item.granted ? (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {t("common.yes")}
        </span>
      ) : (
        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {t("common.no")}
        </span>
      ),
      item.grantedDate ?? "-",
      item.revokedDate ?? "-",
      item.origin ?? "-",
    ],
    [t],
  );

  const renderConsentStatus = useCallback(
    (item: ClientConsentItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {item.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderConsentActions = useCallback(
    (item: ClientConsentItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleConsentEdit(item)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleConsentToggleStatus(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            item.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {item.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => handleConsentDelete(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleConsentDelete, handleConsentEdit, handleConsentToggleStatus, t],
  );

  const handleConsentSort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as ConsentSortColumn;
      if (normalized === consentSortBy) {
        setConsentSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setConsentSortDirection("asc");
      setConsentSortBy(normalized);
    },
    [consentSortBy],
  );

  /* ---------- Hierarchy grid ---------- */

  const hierarchyColumns = useMemo<HubGridColumn<ClientHierarchyItem>[]>(
    () => [
      { key: "ParentClient", label: t("clients.hierarchy.table.parentClient") },
      { key: "ChildClient", label: t("clients.hierarchy.table.childClient") },
      { key: "RelationshipType", label: t("clients.hierarchy.table.relationshipType") },
    ],
    [t],
  );

  const hierarchyStatusFilterOptions = useMemo(
    () => [
      { value: "active", label: t("clients.filters.active") },
      { value: "inactive", label: t("clients.filters.inactive") },
      { value: "all", label: t("clients.filters.all") },
    ],
    [t],
  );

  const filteredHierarchy = useMemo(() => {
    const searchTerm = hierarchySearch.trim().toLowerCase();
    return hierarchyItems.filter((item) => {
      if (hierarchyStatusFilter !== "all") {
        const expected = hierarchyStatusFilter === "active";
        if (item.isActive !== expected) return false;
      }
      if (!searchTerm) return true;
      return (
        (item.parentClientName ?? "").toLowerCase().includes(searchTerm) ||
        (item.childClientName ?? "").toLowerCase().includes(searchTerm) ||
        (item.relationshipType ?? "").toLowerCase().includes(searchTerm)
      );
    });
  }, [hierarchySearch, hierarchyStatusFilter, hierarchyItems]);

  const sortedHierarchy = useMemo(() => {
    const items = [...filteredHierarchy];
    items.sort((current, next) => {
      let a = "";
      let b = "";
      switch (hierarchySortBy) {
        case "ParentClient":
          a = (current.parentClientName ?? "").toLowerCase();
          b = (next.parentClientName ?? "").toLowerCase();
          break;
        case "ChildClient":
          a = (current.childClientName ?? "").toLowerCase();
          b = (next.childClientName ?? "").toLowerCase();
          break;
        case "RelationshipType":
          a = (current.relationshipType ?? "").toLowerCase();
          b = (next.relationshipType ?? "").toLowerCase();
          break;
      }
      const comparison = a.localeCompare(b);
      return hierarchySortDirection === "asc" ? comparison : -comparison;
    });
    return items;
  }, [filteredHierarchy, hierarchySortBy, hierarchySortDirection]);

  const hierarchyTotalPages = Math.max(1, Math.ceil(sortedHierarchy.length / hierarchyPageSize));

  useEffect(() => {
    setHierarchyPage((current) => Math.min(current, hierarchyTotalPages));
  }, [hierarchyTotalPages]);

  const hierarchyPageButtons = useMemo(
    () => buildPageButtons(hierarchyPage, hierarchyTotalPages),
    [hierarchyPage, hierarchyTotalPages],
  );

  const visibleHierarchy = useMemo(() => {
    const startIndex = (hierarchyPage - 1) * hierarchyPageSize;
    return sortedHierarchy.slice(startIndex, startIndex + hierarchyPageSize);
  }, [hierarchyPage, hierarchyPageSize, sortedHierarchy]);

  const hierarchyPageCaption = useMemo(
    () => t("hubgrid.itemsLabel", { count: Math.max(0, sortedHierarchy.length) }),
    [sortedHierarchy.length, t],
  );

  useEffect(() => {
    setHierarchyPage(1);
  }, [hierarchyStatusFilter, hierarchySearch, hierarchySortBy, hierarchySortDirection, hierarchyPageSize]);

  const hierarchyRowCells = useCallback(
    (item: ClientHierarchyItem) => [
      item.parentClientName ?? "-",
      item.childClientName ?? "-",
      item.relationshipType ?? "-",
    ],
    [],
  );

  const renderHierarchyStatus = useCallback(
    (item: ClientHierarchyItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-muted-foreground dark:text-muted-foreground",
        )}
      >
        {item.isActive ? t("clients.status.active") : t("clients.status.inactive")}
      </span>
    ),
    [t],
  );

  const renderHierarchyActions = useCallback(
    (item: ClientHierarchyItem) => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleHierarchyEdit(item)}
          className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => void handleHierarchyToggleStatus(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-primary dark:border-border dark:text-muted-foreground dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          title={
            item.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          {item.isActive
            ? <PowerOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            : <Power className="h-4 w-4 text-green-500 dark:text-green-400" />}
        </button>
        <button
          type="button"
          onClick={() => handleHierarchyDelete(item)}
          className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
        </button>
      </div>
    ),
    [handleHierarchyDelete, handleHierarchyEdit, handleHierarchyToggleStatus, t],
  );

  const handleHierarchySort = useCallback(
    (columnKey: string) => {
      const normalized = columnKey as HierarchySortColumn;
      if (normalized === hierarchySortBy) {
        setHierarchySortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setHierarchySortDirection("asc");
      setHierarchySortBy(normalized);
    },
    [hierarchySortBy],
  );

  /* ---------- Derived values ---------- */

  const isEditing = Boolean(client?.id);

  const resolvedClientType =
    clientFormState.clientType.length > 0
      ? Number(clientFormState.clientType)
      : client?.clientType ?? null;

  const showIndividualFields = isIndividualType(resolvedClientType ?? undefined);
  const showCompanyFields = isCompanyType(resolvedClientType ?? undefined);

  /* ---------- Individual form field updaters ---------- */

  const updateIndividual = useCallback(
    (field: keyof IndividualFormState, value: string | boolean) => {
      setClientFormState((prev) => ({
        ...prev,
        individual: { ...prev.individual, [field]: value },
      }));
    },
    [],
  );

  /* ---------- Company form field updaters ---------- */

  const updateCompany = useCallback(
    (field: keyof CompanyFormState, value: string | boolean) => {
      setClientFormState((prev) => ({
        ...prev,
        company: { ...prev.company, [field]: value },
      }));
    },
    [],
  );

  /* ---------- Render: Individual form fields ---------- */

  const renderIndividualFields = () => {
    const ind = clientFormState.individual;
    return (
      <div className="rounded-sm border border-border bg-surface p-5 dark:border-border dark:bg-surface">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground dark:text-muted-foreground">
          {t("clients.form.individual.sectionTitle")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Line 1: Nome completo — 3 colunas */}
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField
              label={t("clients.form.individual.fullName")}
              value={ind.fullName}
              onChange={(v) => updateIndividual("fullName", v)}
            />
          </div>
          {/* Line 2: Nome próprio | Apelido | Origem */}
          <FormField
            label={t("clients.form.individual.firstName")}
            value={ind.firstName}
            onChange={(v) => updateIndividual("firstName", v)}
            required
          />
          <FormField
            label={t("clients.form.individual.lastName")}
            value={ind.lastName}
            onChange={(v) => updateIndividual("lastName", v)}
            required
          />
          <SelectField
            label={t("clients.form.origin")}
            value={clientFormState.originType}
            onChange={(v) =>
              setClientFormState((prev) => ({ ...prev, originType: v }))
            }
            options={ORIGIN_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            placeholder={t("clients.form.selectOption")}
          />
          {/* Line 3: E-mail — 3 colunas */}
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField
              label={t("clients.form.individual.email")}
              value={ind.email}
              onChange={(v) => updateIndividual("email", v)}
              type="email"
            />
          </div>
          {/* Line 4: Telefone | Telemóvel | WhatsApp */}
          <FormField
            label={t("clients.form.individual.phoneNumber")}
            value={ind.phoneNumber}
            onChange={(v) => updateIndividual("phoneNumber", v)}
          />
          <FormField
            label={t("clients.form.individual.cellPhoneNumber")}
            value={ind.cellPhoneNumber}
            onChange={(v) => updateIndividual("cellPhoneNumber", v)}
          />
          <ToggleField
            label={t("clients.form.individual.isWhatsapp")}
            checked={ind.isWhatsapp}
            onChange={(v) => updateIndividual("isWhatsapp", v)}
            onLabel={t("clients.switch.on")}
            offLabel={t("clients.switch.off")}
          />
          {/* Line 5: Data nascimento | Género | Nacionalidade */}
          <FormField
            label={t("clients.form.individual.birthDate")}
            value={ind.birthDate}
            onChange={(v) => updateIndividual("birthDate", v)}
            type="date"
          />
          <SelectField
            label={t("clients.form.individual.gender")}
            value={ind.gender}
            onChange={(v) => updateIndividual("gender", v)}
            options={GENDER_OPTIONS.map((g) => ({
              value: g,
              label: t(GENDER_OPTIONS_KEYS[g] ?? g),
            }))}
            placeholder={t("clients.form.selectOption")}
          />
          <FormField
            label={t("clients.form.individual.nationality")}
            value={ind.nationality}
            onChange={(v) => updateIndividual("nationality", v)}
          />
          {/* Line 6: Tipo documento | Nº Documento | Ativar/Desativar */}
          <SelectField
            label={t("clients.form.individual.documentType")}
            value={ind.documentType}
            onChange={(v) => updateIndividual("documentType", v)}
            options={DOCUMENT_TYPE_OPTIONS.map((d) => ({
              value: d,
              label: t(DOCUMENT_TYPE_OPTIONS_KEYS[d] ?? d),
            }))}
            placeholder={t("clients.form.selectOption")}
          />
          <FormField
            label={t("clients.form.individual.documentNumber")}
            value={ind.documentNumber}
            onChange={(v) => updateIndividual("documentNumber", v)}
          />
          <ToggleField
            label={t("clients.switch.status")}
            checked={clientFormState.isActive}
            onChange={(v) =>
              setClientFormState((prev) => ({ ...prev, isActive: v }))
            }
            onLabel={t("clients.switch.active")}
            offLabel={t("clients.switch.inactive")}
          />
        </div>
        {/* Line 7: Observações — abaixo do grid */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
            {t("clients.form.observation")}
          </label>
          <Textarea
            value={clientFormState.note}
            onChange={(event) =>
              setClientFormState((prev) => ({
                ...prev,
                note: event.target.value,
              }))
            }
            rows={3}
          />
        </div>
      </div>
    );
  };

  /* ---------- Render: Company form fields ---------- */

  const renderCompanyFields = () => {
    const comp = clientFormState.company;
    return (
      <div className="rounded-sm border border-border bg-surface p-5 dark:border-border dark:bg-surface">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground dark:text-muted-foreground">
          {t("clients.form.company.sectionTitle")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Line 1: Razão Social + Nome Comercial */}
          <FormField
            label={t("clients.form.company.legalName")}
            value={comp.legalName}
            onChange={(v) => updateCompany("legalName", v)}
            required
          />
          <FormField
            label={t("clients.form.company.tradeName")}
            value={comp.tradeName}
            onChange={(v) => updateCompany("tradeName", v)}
            className="sm:col-span-2 lg:col-span-2"
          />
          {/* Line 2: Telefone + Telemóvel + WhatsApp */}
          <FormField
            label={t("clients.form.company.phoneNumber")}
            value={comp.phoneNumber}
            onChange={(v) => updateCompany("phoneNumber", v)}
          />
          <FormField
            label={t("clients.form.company.cellPhoneNumber")}
            value={comp.cellPhoneNumber}
            onChange={(v) => updateCompany("cellPhoneNumber", v)}
          />
          <ToggleField
            label={t("clients.form.company.isWhatsapp")}
            checked={comp.isWhatsapp}
            onChange={(v) => updateCompany("isWhatsapp", v)}
            onLabel={t("clients.switch.on")}
            offLabel={t("clients.switch.off")}
          />
          {/* Line 3: E-mail + Site + N.º Funcionários */}
          <FormField
            label={t("clients.form.company.email")}
            value={comp.email}
            onChange={(v) => updateCompany("email", v)}
            type="email"
          />
          <FormField
            label={t("clients.form.company.site")}
            value={comp.site}
            onChange={(v) => updateCompany("site", v)}
            type="url"
          />
          <FormField
            label={t("clients.form.company.numberOfEmployee")}
            value={comp.numberOfEmployee}
            onChange={(v) => updateCompany("numberOfEmployee", v)}
            type="number"
          />
          {/* Line 4: Representante Legal (full width) */}
          <FormField
            label={t("clients.form.company.legalRepresentative")}
            value={comp.legalRepresentative}
            onChange={(v) => updateCompany("legalRepresentative", v)}
            className="sm:col-span-2 lg:col-span-3"
          />
          {/* Line 5: NIF + CAE + Origem */}
          <FormField
            label={t("clients.form.company.companyRegistration")}
            value={comp.companyRegistration}
            onChange={(v) => updateCompany("companyRegistration", v)}
          />
          <FormField
            label={t("clients.form.company.cae")}
            value={comp.cae}
            onChange={(v) => updateCompany("cae", v)}
          />
          <SelectField
            label={t("clients.form.origin")}
            value={clientFormState.originType}
            onChange={(v) =>
              setClientFormState((prev) => ({ ...prev, originType: v }))
            }
            options={ORIGIN_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            placeholder={t("clients.form.selectOption")}
          />
          {/* Line 6: Estado */}
          <ToggleField
            label={t("clients.switch.status")}
            checked={clientFormState.isActive}
            onChange={(v) =>
              setClientFormState((prev) => ({ ...prev, isActive: v }))
            }
            onLabel={t("clients.switch.active")}
            offLabel={t("clients.switch.inactive")}
          />
          {/* Line 7: Observações (full width) */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1.5 block text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
              {t("clients.form.observation")}
            </label>
            <Textarea
              value={clientFormState.note}
              onChange={(event) =>
                setClientFormState((prev) => ({
                  ...prev,
                  note: event.target.value,
                }))
              }
              rows={3}
            />
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Render: Info tab ---------- */

  const renderInfoTab = () => (
    <form onSubmit={(e) => void handleClientSubmit(e)} className="space-y-6">
      {/* Client type selector */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t("clients.form.clientType")}
          value={clientFormState.clientType}
          onChange={handleClientTypeChange}
          options={CLIENT_TYPE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
          }))}
          placeholder={t("clients.form.selectOption")}
        />
      </div>

      {/* Dynamic individual/company fields */}
      {showIndividualFields && renderIndividualFields()}
      {showCompanyFields && renderCompanyFields()}

      {/* Footer: Voltar + Guardar */}
      <div className="flex justify-start gap-3">
        <button
          type="button"
          onClick={() => router.push("/clients/")}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("clients.actions.back")}
        </button>
        <button
          type="submit"
          disabled={submittingClient}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
        >
          {submittingClient && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("clients.actions.save")}
        </button>
      </div>
    </form>
  );

  /* ---------- Render: Contacts tab ---------- */

  const renderContactsTab = () => {
    if (!loadedTabs.has("contactos")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Contact form */}
        <form
          onSubmit={(e) => void handleContactSubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label={t("clients.contacts.form.name")}
              value={contactFormState.name}
              onChange={(v) =>
                setContactFormState((prev) => ({ ...prev, name: v }))
              }
              required
            />
            <FormField
              label={t("clients.contacts.form.email")}
              value={contactFormState.email}
              onChange={(v) =>
                setContactFormState((prev) => ({ ...prev, email: v }))
              }
              type="email"
            />
            <FormField
              label={t("clients.contacts.form.phone")}
              value={contactFormState.phoneNumber}
              onChange={(v) =>
                setContactFormState((prev) => ({ ...prev, phoneNumber: v }))
              }
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={contactSubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {contactSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingContact ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingContact && (
              <button
                type="button"
                onClick={resetContactForm}
                className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
            {/* Bulk upload */}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary">
              {contactsBulkUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t("clients.contacts.bulk.label")}
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  void handleContactsBulkUpload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </form>

        {/* Contacts grid */}
        <HubGrid
          columns={contactColumns}
          items={visibleContacts}
          renderRowCells={contactRowCells}
          renderStatus={renderContactStatus}
          renderActions={renderContactActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.contacts.table.actions")}
          rowDensity={contactGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setContactGridDensity}
          sortBy={contactSortBy}
          sortDirection={contactSortDirection}
          onSort={handleContactSort}
          statusFilter={contactStatusFilter}
          statusFilterOptions={contactStatusFilterOptions}
          onStatusFilterChange={setContactStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={contactSearch}
          onSearchChange={setContactSearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={contactsLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.contacts.empty")}
          pageCaption={contactPageCaption}
          page={contactPage}
          totalPages={contactTotalPages}
          pageButtons={contactPageButtons}
          onPageChange={setContactPage}
          pageSize={contactPageSize}
          pageSizeOptions={CONTACT_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setContactPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(contact) => contact.id}
        />
      </div>
    );
  };

  /* ---------- Render: Contact Network tab ---------- */

  const renderContactNetworkTab = () => {
    if (!loadedTabs.has("contactNetwork")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Contact Network form */}
        <form
          onSubmit={(e) => void handleContactNetworkSubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label={t("clients.contacts.form.name")}
              value={contactNetworkFormState.name}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, name: v }))
              }
              required
            />
            <FormField
              label={t("clients.contacts.form.email")}
              value={contactNetworkFormState.email}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, email: v }))
              }
              type="email"
            />
            <FormField
              label={t("clients.contacts.form.phone")}
              value={contactNetworkFormState.phoneNumber}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, phoneNumber: v }))
              }
              required
            />
            <FormField
              label={t("clients.contacts.form.cellPhone")}
              value={contactNetworkFormState.cellPhoneNumber}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, cellPhoneNumber: v }))
              }
            />
            <ToggleField
              label={t("clients.contacts.form.isWhatsapp")}
              checked={contactNetworkFormState.isWhatsapp}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, isWhatsapp: v }))
              }
              onLabel={t("common.yes")}
              offLabel={t("common.no")}
            />
            <ToggleField
              label={t("clients.contacts.form.isPrimary")}
              checked={contactNetworkFormState.isPrimary}
              onChange={(v) =>
                setContactNetworkFormState((prev) => ({ ...prev, isPrimary: v }))
              }
              onLabel={t("common.yes")}
              offLabel={t("common.no")}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={contactNetworkSubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {contactNetworkSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingContactNetwork ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingContactNetwork && (
              <button
                type="button"
                onClick={resetContactNetworkForm}
                className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
            {/* Bulk upload */}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary">
              {contactNetworkBulkUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t("clients.contacts.bulk.label")}
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  void handleContactNetworkBulkUpload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </form>

        {/* Contact Network grid */}
        <HubGrid
          columns={contactNetworkColumns}
          items={visibleContactNetwork}
          renderRowCells={contactNetworkRowCells}
          renderStatus={renderContactNetworkStatus}
          renderActions={renderContactNetworkActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.contacts.table.actions")}
          rowDensity={contactNetworkGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setContactNetworkGridDensity}
          sortBy={contactNetworkSortBy}
          sortDirection={contactNetworkSortDirection}
          onSort={handleContactNetworkSort}
          statusFilter={contactNetworkStatusFilter}
          statusFilterOptions={contactNetworkStatusFilterOptions}
          onStatusFilterChange={setContactNetworkStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={contactNetworkSearch}
          onSearchChange={setContactNetworkSearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={contactNetworkLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.contacts.empty")}
          pageCaption={contactNetworkPageCaption}
          page={contactNetworkPage}
          totalPages={contactNetworkTotalPages}
          pageButtons={contactNetworkPageButtons}
          onPageChange={setContactNetworkPage}
          pageSize={contactNetworkPageSize}
          pageSizeOptions={CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setContactNetworkPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(contact) => contact.id}
        />

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          open={contactNetworkDeleteConfirmOpen}
          onOpenChange={setContactNetworkDeleteConfirmOpen}
          onConfirm={() => void handleContactNetworkDeleteConfirm()}
          title={t("clients.toasts.validationTitle")}
          description={
            contactNetworkDeleteRef.current
              ? t("clients.contacts.confirm.delete", { name: contactNetworkDeleteRef.current.name })
              : ""
          }
          confirmLabel={t("clients.actions.delete")}
          cancelLabel={t("clients.actions.cancel")}
        />
      </div>
    );
  };

  /* ---------- Render: Addresses tab ---------- */

  const renderAddressesTab = () => {
    if (!loadedTabs.has("enderecos")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Address form */}
        <form
          onSubmit={(e) => void handleAddressSubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Linha 1: Tipo de endereço — col 1 */}
            <div>
              <SelectField
                label={t("clients.addresses.form.addressType")}
                value={addressFormState.addressTypeId}
                onChange={(v) =>
                  setAddressFormState((prev) => ({ ...prev, addressTypeId: v }))
                }
                options={addressTypes.map((at) => ({ value: String(at.id), label: at.name }))}
                placeholder={t("clients.addresses.form.addressTypePlaceholder")}
                required
              />
            </div>
            {/* Linha 2: Rua — col 1, Número — col 2, Complemento — col 3 */}
            <FormField
              className="sm:col-start-1"
              label={t("clients.addresses.form.street")}
              value={addressFormState.street}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, street: v }))
              }
              required
            />
            <FormField
              label={t("clients.addresses.form.number")}
              value={addressFormState.number}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, number: v }))
              }
            />
            <FormField
              label={t("clients.addresses.form.complement")}
              value={addressFormState.complement}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, complement: v }))
              }
            />
            {/* Linha 3: Bairro — col 1, Cidade — col 2, Distrito — col 3 */}
            <FormField
              label={t("clients.addresses.form.neighborhood")}
              value={addressFormState.neighborhood}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, neighborhood: v }))
              }
              required
            />
            <FormField
              label={t("clients.addresses.form.city")}
              value={addressFormState.city}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, city: v }))
              }
              required
            />
            <FormField
              label={t("clients.addresses.form.state")}
              value={addressFormState.state}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, state: v }))
              }
              required
            />
            {/* Linha 4-5: País — col 1, Código postal — col 2, Observações — col 3 row-span-2 */}
            <FormField
              label={t("clients.addresses.form.country")}
              value={addressFormState.country}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, country: v }))
              }
              required
            />
            <FormField
              label={t("clients.addresses.form.postalCode")}
              value={addressFormState.postalCode}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, postalCode: v }))
              }
              required
            />
            <div className="sm:row-span-2 flex flex-col">
              <label className="mb-1.5 block text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
                {t("clients.addresses.form.note")}
              </label>
              <Textarea
                value={addressFormState.note}
                onChange={(event) =>
                  setAddressFormState((prev) => ({ ...prev, note: event.target.value }))
                }
                rows={2}
                className="flex-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-border dark:bg-card dark:text-foreground"
              />
            </div>
            {/* Linha 5: Latitude — col 1, Longitude — col 2 */}
            <FormField
              label={t("clients.addresses.form.latitude")}
              value={addressFormState.latitude}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, latitude: v }))
              }
              type="number"
            />
            <FormField
              label={t("clients.addresses.form.longitude")}
              value={addressFormState.longitude}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, longitude: v }))
              }
              type="number"
            />
            {/* Linha 6: Endereço principal — col 1 */}
            <div>
              <ToggleField
                label={t("clients.addresses.form.isPrimary")}
                checked={addressFormState.isPrimary}
                onChange={(v) =>
                  setAddressFormState((prev) => ({ ...prev, isPrimary: v }))
                }
                onLabel={t("clients.addresses.form.isPrimaryOn")}
                offLabel={t("clients.addresses.form.isPrimaryOff")}
              />
            </div>
            {/* Linha 7: Separator — col span 3 */}
            <div className="sm:col-span-3 border-t border-border dark:border-border" />
            {/* Linha 8: Botões — col span 3 */}
            <div className="sm:col-span-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={addressSubmitting}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
              >
                {addressSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingAddress ? t("clients.actions.save") : t("clients.actions.add")}
              </button>
              {editingAddress && (
                <button
                  type="button"
                  onClick={resetAddressForm}
                  className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
                >
                  {t("clients.actions.cancel")}
                </button>
              )}
              {/* Bulk upload */}
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary">
                {addressesBulkUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("clients.addresses.bulk.label")}
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    void handleAddressesBulkUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </form>

        {/* Addresses grid */}
        <HubGrid
          columns={addressColumns}
          items={visibleAddresses}
          renderRowCells={addressRowCells}
          renderStatus={renderAddressStatus}
          renderActions={renderAddressActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.addresses.table.actions")}
          rowDensity={addressGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setAddressGridDensity}
          sortBy={addressSortBy}
          sortDirection={addressSortDirection}
          onSort={handleAddressSort}
          statusFilter={addressStatusFilter}
          statusFilterOptions={addressStatusFilterOptions}
          onStatusFilterChange={setAddressStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={addressSearch}
          onSearchChange={setAddressSearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={addressesLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.addresses.empty")}
          pageCaption={addressPageCaption}
          page={addressPage}
          totalPages={addressTotalPages}
          pageButtons={addressPageButtons}
          onPageChange={setAddressPage}
          pageSize={addressPageSize}
          pageSizeOptions={ADDRESS_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setAddressPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(address) => address.id}
        />
      </div>
    );
  };

  /* ---------- Render: Fiscal Data tab ---------- */

  const renderFiscalDataTab = () => {
    if (!loadedTabs.has("fiscalData")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Fiscal Data form */}
        <form
          onSubmit={(e) => void handleFiscalDataSubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label={t("clients.fiscalData.form.taxNumber")}
              value={fiscalDataFormState.taxNumber}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, taxNumber: v }))
              }
              required
            />
            <FormField
              label={t("clients.fiscalData.form.vatNumber")}
              value={fiscalDataFormState.vatNumber}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, vatNumber: v }))
              }
            />
            <SelectField
              label={t("clients.fiscalData.form.fiscalCountry")}
              value={fiscalDataFormState.fiscalCountry}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, fiscalCountry: v }))
              }
              options={EUROPEAN_COUNTRIES_PLUS_BR_US.map((c) => ({
                value: c.code,
                label: c.name,
              }))}
              placeholder={t("clients.form.selectOption")}
              required
            />
            <ToggleField
              label={t("clients.fiscalData.form.isVatRegistered")}
              checked={fiscalDataFormState.isVatRegistered}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, isVatRegistered: v }))
              }
              onLabel={t("common.yes")}
              offLabel={t("common.no")}
            />
            <FormField
              label={t("clients.fiscalData.form.iban")}
              value={fiscalDataFormState.iban}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, iban: v }))
              }
            />
            <FormField
              label={t("clients.fiscalData.form.fiscalEmail")}
              value={fiscalDataFormState.fiscalEmail}
              onChange={(v) =>
                setFiscalDataFormState((prev) => ({ ...prev, fiscalEmail: v }))
              }
              type="email"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={fiscalDataSubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {fiscalDataSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingFiscalData ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingFiscalData && (
              <button
                type="button"
                onClick={resetFiscalDataForm}
                className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
          </div>
        </form>

        {/* Fiscal Data grid */}
        <HubGrid
          columns={fiscalDataColumns}
          items={visibleFiscalData}
          renderRowCells={fiscalDataRowCells}
          renderStatus={renderFiscalDataStatus}
          renderActions={renderFiscalDataActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.fiscalData.table.actions")}
          rowDensity={fiscalDataGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setFiscalDataGridDensity}
          sortBy={fiscalDataSortBy}
          sortDirection={fiscalDataSortDirection}
          onSort={handleFiscalDataSort}
          statusFilter={fiscalDataStatusFilter}
          statusFilterOptions={fiscalDataStatusFilterOptions}
          onStatusFilterChange={setFiscalDataStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={fiscalDataSearch}
          onSearchChange={setFiscalDataSearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={fiscalDataLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.fiscalData.empty")}
          pageCaption={fiscalDataPageCaption}
          page={fiscalDataPage}
          totalPages={fiscalDataTotalPages}
          pageButtons={fiscalDataPageButtons}
          onPageChange={setFiscalDataPage}
          pageSize={fiscalDataPageSize}
          pageSizeOptions={FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setFiscalDataPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(item) => item.id}
        />
      </div>
    );
  };

  /* ---------- Render: Consents tab ---------- */

  const renderConsentsTab = () => {
    if (!loadedTabs.has("consents")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Consent form */}
        <form
          onSubmit={(e) => void handleConsentSubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
                {t("clients.consents.form.consentType")}
              </label>
              <select
                value={consentFormState.consentTypeId}
                onChange={(e) =>
                  setConsentFormState((prev) => ({ ...prev, consentTypeId: e.target.value }))
                }
                className="flex h-10 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-card dark:text-muted-foreground"
              >
                <option value="">{t("clients.form.selectOption")}</option>
                {consentTypes.map((ct) => (
                  <option key={ct.id} value={String(ct.id)}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </div>
            <FormField
              label={t("clients.consents.form.origin")}
              value={consentFormState.origin}
              onChange={(v) =>
                setConsentFormState((prev) => ({ ...prev, origin: v }))
              }
            />
            <FormField
              label={t("clients.consents.form.grantedDate")}
              value={consentFormState.grantedDate}
              onChange={(v) =>
                setConsentFormState((prev) => ({ ...prev, grantedDate: v }))
              }
              type="date"
            />
            <FormField
              label={t("clients.consents.form.revokedDate")}
              value={consentFormState.revokedDate}
              onChange={(v) =>
                setConsentFormState((prev) => ({ ...prev, revokedDate: v }))
              }
              type="date"
            />
            <FormField
              label={t("clients.consents.form.ipAddress")}
              value={consentFormState.ipAddress}
              onChange={(v) =>
                setConsentFormState((prev) => ({ ...prev, ipAddress: v }))
              }
            />
            <FormField
              label={t("clients.consents.form.userAgent")}
              value={consentFormState.userAgent}
              onChange={(v) =>
                setConsentFormState((prev) => ({ ...prev, userAgent: v }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={consentSubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {consentSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingConsent ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingConsent && (
              <button
                type="button"
                onClick={resetConsentForm}
                className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
          </div>
        </form>

        {/* Consents grid */}
        <HubGrid
          columns={consentColumns}
          items={visibleConsents}
          renderRowCells={consentRowCells}
          renderStatus={renderConsentStatus}
          renderActions={renderConsentActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.consents.table.actions")}
          rowDensity={consentGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setConsentGridDensity}
          sortBy={consentSortBy}
          sortDirection={consentSortDirection}
          onSort={handleConsentSort}
          statusFilter={consentStatusFilter}
          statusFilterOptions={consentStatusFilterOptions}
          onStatusFilterChange={setConsentStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={consentSearch}
          onSearchChange={setConsentSearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={consentsLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.consents.empty")}
          pageCaption={consentPageCaption}
          page={consentPage}
          totalPages={consentTotalPages}
          pageButtons={consentPageButtons}
          onPageChange={setConsentPage}
          pageSize={consentPageSize}
          pageSizeOptions={CONSENT_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setConsentPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(item) => item.id}
        />
      </div>
    );
  };

  /* ---------- Render: Hierarchy tab ---------- */

  const renderHierarchyTab = () => {
    if (!loadedTabs.has("hierarchy")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Hierarchy form */}
        <form
          onSubmit={(e) => void handleHierarchySubmit(e)}
          className="rounded-sm border border-border bg-surface p-4 dark:border-border dark:bg-surface"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label={t("clients.hierarchy.form.parentClient")}
              value={hierarchyFormState.parentClientId}
              onChange={(v) =>
                setHierarchyFormState((prev) => ({ ...prev, parentClientId: v }))
              }
              required
            />
            <FormField
              label={t("clients.hierarchy.form.childClient")}
              value={hierarchyFormState.childClientId}
              onChange={(v) =>
                setHierarchyFormState((prev) => ({ ...prev, childClientId: v }))
              }
              required
            />
            <FormField
              label={t("clients.hierarchy.form.relationshipType")}
              value={hierarchyFormState.relationshipType}
              onChange={(v) =>
                setHierarchyFormState((prev) => ({ ...prev, relationshipType: v }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={hierarchySubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {hierarchySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingHierarchy ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingHierarchy && (
              <button
                type="button"
                onClick={resetHierarchyForm}
                className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-primary dark:hover:text-primary"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
          </div>
        </form>

        {/* Hierarchy grid */}
        <HubGrid
          columns={hierarchyColumns}
          items={visibleHierarchy}
          renderRowCells={hierarchyRowCells}
          renderStatus={renderHierarchyStatus}
          renderActions={renderHierarchyActions}
          statusColumnLabel={t("clients.table.status")}
          actionsColumnLabel={t("clients.hierarchy.table.actions")}
          rowDensity={hierarchyGridDensity}
          densityOptions={gridDensityOptions}
          onDensityChange={setHierarchyGridDensity}
          sortBy={hierarchySortBy}
          sortDirection={hierarchySortDirection}
          onSort={handleHierarchySort}
          statusFilter={hierarchyStatusFilter}
          statusFilterOptions={hierarchyStatusFilterOptions}
          onStatusFilterChange={setHierarchyStatusFilter}
          statusFilterLabel={t("clients.filters.statusLabel")}
          searchValue={hierarchySearch}
          onSearchChange={setHierarchySearch}
          searchPlaceholder={t("clients.filters.search")}
          loading={hierarchyLoading}
          loadingText={t("clients.loading")}
          emptyText={t("clients.hierarchy.empty")}
          pageCaption={hierarchyPageCaption}
          page={hierarchyPage}
          totalPages={hierarchyTotalPages}
          pageButtons={hierarchyPageButtons}
          onPageChange={setHierarchyPage}
          pageSize={hierarchyPageSize}
          pageSizeOptions={HIERARCHY_GRID_PAGE_SIZE_OPTIONS}
          onPageSizeChange={setHierarchyPageSize}
          paginationPreviousLabel={t("clients.pagination.previous")}
          paginationNextLabel={t("clients.pagination.next")}
          paginationPageLabel={t("clients.pagination.page")}
          paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(item) => item.id}
        />
      </div>
    );
  };

  /* ==========================
     RENDER
     ========================== */

  return (
    <>
      <div data-testid="client-details-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-muted px-4 py-4 sm:px-6 dark:bg-muted">
          {/* ---------- Header ---------- */}
          <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-background px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push("/clients/")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-primary dark:hover:bg-muted dark:hover:text-primary"
                title={t("clients.actions.back")}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <nav aria-label="Breadcrumb" className="mb-1">
                  <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <li>
                      <button type="button" onClick={() => router.push("/clients/")} className="hover:text-primary transition-colors">
                        {t("clients.title")}
                      </button>
                    </li>
                    <li aria-hidden="true">/</li>
                    <li className="text-foreground font-medium" aria-current="page">
                      {isEditing
                        ? client?.individual?.fullName ?? client?.name ?? t("clients.form.editTitle")
                        : t("clients.form.newTitle")}
                    </li>
                  </ol>
                </nav>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">
                    {isEditing
                      ? client?.individual?.fullName ?? client?.name ?? t("clients.form.editTitle")
                      : t("clients.form.newTitle")}
                  </h1>
                  {client && (
                    <span
                      className={clsx(
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        client.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                      )}
                    >
                      {client.isActive ? t("clients.status.active") : t("clients.status.inactive")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {client ? client.clientTypeDescription ?? "" : t("clients.detail.helper")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {client && (
                <button
                  type="button"
                  onClick={() => void handleClientToggleStatus()}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold transition-colors",
                    client.isActive
                      ? "border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/30"
                      : "border-green-300 bg-white text-green-700 hover:bg-green-50 dark:border-green-800 dark:bg-transparent dark:text-green-400 dark:hover:bg-green-950/30",
                  )}
                >
                  <Power className="h-4 w-4" />
                  {client.isActive ? t("clients.actions.deactivate") : t("clients.actions.activate")}
                </button>
              )}
            </div>
          </div>

          {/* ---------- Loading state ---------- */}
          {loadingClient && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground dark:text-muted-foreground">
                {t("clients.loading")}
              </span>
            </div>
          )}

          {/* ---------- Tabs ---------- */}
          {!loadingClient && (
            <HubTabs<ClientTab>
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabs={[
                {
                  id: "informacoes",
                  label: t("clients.detail.tabs.clientSummary"),
                  panel: renderInfoTab(),
                },
                {
                  id: "contactos",
                  label: t("clients.detail.tabs.contactsSummary"),
                  panel: renderContactsTab(),
                },
                {
                  id: "contactNetwork",
                  label: t("clients.detail.tabs.contactNetworkSummary"),
                  panel: renderContactNetworkTab(),
                },
                {
                  id: "enderecos",
                  label: t("clients.detail.tabs.addressesSummary"),
                  panel: renderAddressesTab(),
                },
                {
                  id: "fiscalData",
                  label: t("clients.detail.tabs.fiscalDataSummary"),
                  panel: renderFiscalDataTab(),
                },
                {
                  id: "consents",
                  label: t("clients.detail.tabs.consentsSummary"),
                  panel: renderConsentsTab(),
                },
                {
                  id: "hierarchy",
                  label: t("clients.detail.tabs.hierarchySummary"),
                  panel: renderHierarchyTab(),
                },
              ]}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={contactDeleteConfirmOpen}
        onOpenChange={setContactDeleteConfirmOpen}
        title={t("clients.toasts.validationTitle")}
        description={
          contactDeleteRef.current
            ? t("clients.contacts.confirm.delete", { name: contactDeleteRef.current.name })
            : ""
        }
        confirmLabel={t("clients.actions.delete")}
        cancelLabel={t("clients.actions.cancel")}
        onConfirm={() => void handleContactDeleteConfirm()}
      />
      <ConfirmDialog
        open={addressDeleteConfirmOpen}
        onOpenChange={setAddressDeleteConfirmOpen}
        title={t("clients.toasts.validationTitle")}
        description={
          addressDeleteRef.current
            ? t("clients.addresses.confirm.delete", { street: addressDeleteRef.current.street ?? t("clients.addresses.table.street") })
            : ""
        }
        confirmLabel={t("clients.actions.delete")}
        cancelLabel={t("clients.actions.cancel")}
        onConfirm={() => void handleAddressDeleteConfirm()}
      />
      <ConfirmDialog
        open={fiscalDataDeleteConfirmOpen}
        onOpenChange={setFiscalDataDeleteConfirmOpen}
        title={t("clients.toasts.validationTitle")}
        description={
          fiscalDataDeleteRef.current
            ? t("clients.fiscalData.confirm.delete", { taxNumber: fiscalDataDeleteRef.current.taxNumber ?? t("clients.fiscalData.table.taxNumber") })
            : ""
        }
        confirmLabel={t("clients.actions.delete")}
        cancelLabel={t("clients.actions.cancel")}
        onConfirm={() => void handleFiscalDataDeleteConfirm()}
      />
      <ConfirmDialog
        open={consentDeleteConfirmOpen}
        onOpenChange={setConsentDeleteConfirmOpen}
        title={t("clients.toasts.validationTitle")}
        description={
          consentDeleteRef.current
            ? t("clients.consents.confirm.delete", { consentTypeName: consentDeleteRef.current.consentTypeName ?? t("clients.consents.table.consentType") })
            : ""
        }
        confirmLabel={t("clients.actions.delete")}
        cancelLabel={t("clients.actions.cancel")}
        onConfirm={() => void handleConsentDeleteConfirm()}
      />
      <ConfirmDialog
        open={hierarchyDeleteConfirmOpen}
        onOpenChange={setHierarchyDeleteConfirmOpen}
        title={t("clients.toasts.validationTitle")}
        description={
          hierarchyDeleteRef.current
            ? t("clients.hierarchy.confirm.delete", { parentClientName: hierarchyDeleteRef.current.parentClientName ?? t("clients.hierarchy.table.parentClient"), childClientName: hierarchyDeleteRef.current.childClientName ?? t("clients.hierarchy.table.childClient") })
            : ""
        }
        confirmLabel={t("clients.actions.delete")}
        cancelLabel={t("clients.actions.cancel")}
        onConfirm={() => void handleHierarchyDeleteConfirm()}
      />
    </>
  );
}
