"use client";

import clsx from "clsx";
import { Loader2, Power, SquarePen, Trash2, ArrowLeft } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { WorkspaceShell } from "@/shared/layout";
import { useToast } from "@/shared/feedback";
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
} from "@/domains/operations/clients/client-utils";

/* ---------- Constants ---------- */

const CONTACT_PAGE_SIZE = 25;
const ADDRESS_PAGE_SIZE = 25;
const CONTACT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const ADDRESS_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];

/* ---------- Sort column types ---------- */

type ContactSortColumn = "Name" | "Email" | "Phone";
type AddressSortColumn = "Street" | "City" | "State" | "PostalCode" | "Country";

/* ---------- Pagination helper ---------- */

const PAGE_BUTTON_MAX = 5;

function buildPageButtons(page: number, totalPages: number) {
  const pages: number[] = [];
  const normalTotal = Math.max(1, totalPages);
  let start = Math.max(1, page - Math.floor(PAGE_BUTTON_MAX / 2));
  let end = Math.min(normalTotal, start + PAGE_BUTTON_MAX - 1);
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

function getAddressSortValue(item: AddressItem, column: AddressSortColumn) {
  switch (column) {
    case "City":
      return (item.city ?? "").toLowerCase();
    case "State":
      return (item.state ?? "").toLowerCase();
    case "PostalCode":
      return (item.postalCode ?? "").toLowerCase();
    case "Country":
      return (item.country ?? "").toLowerCase();
    default:
      return (item.street ?? "").toLowerCase();
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

interface AddressItem {
  id: number;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  isActive: boolean;
  isPrimary: boolean;
}

interface AddressesPagedResponse {
  items?: unknown;
  totalItems?: unknown;
}

/* ---------- Individual form state ---------- */

interface IndividualFormState {
  displayName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  cellPhoneNumber: string;
  isWhatsapp: boolean;
  email: string;
  birthDate: string;
  gender: string;
  documentType: string;
  documentNumber: string;
  nationality: string;
}

const initialIndividualFormState: IndividualFormState = {
  displayName: "",
  firstName: "",
  lastName: "",
  phoneNumber: "",
  cellPhoneNumber: "",
  isWhatsapp: false,
  email: "",
  birthDate: "",
  gender: "",
  documentType: "",
  documentNumber: "",
  nationality: "",
};

/* ---------- Company form state ---------- */

interface CompanyFormState {
  legalName: string;
  tradeName: string;
  phoneNumber: string;
  cellPhoneNumber: string;
  isWhatsapp: boolean;
  email: string;
  site: string;
  companyRegistration: string;
  cae: string;
  numberOfEmployee: string;
  legalRepresentative: string;
}

const initialCompanyFormState: CompanyFormState = {
  legalName: "",
  tradeName: "",
  phoneNumber: "",
  cellPhoneNumber: "",
  isWhatsapp: false,
  email: "",
  site: "",
  companyRegistration: "",
  cae: "",
  numberOfEmployee: "",
  legalRepresentative: "",
};

/* ---------- Client form state ---------- */

interface ClientFormState {
  clientType: string;
  originType: string;
  isActive: boolean;
  note: string;
  individual: IndividualFormState;
  company: CompanyFormState;
}

interface ContactFormState {
  name: string;
  email: string;
  phoneNumber: string;
}

interface AddressFormState {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

type ClientTab = "informacoes" | "contactos" | "enderecos";

const initialClientFormState: ClientFormState = {
  clientType: "",
  originType: "",
  isActive: true,
  note: "",
  individual: { ...initialIndividualFormState },
  company: { ...initialCompanyFormState },
};

const initialContactFormState: ContactFormState = {
  name: "",
  email: "",
  phoneNumber: "",
};

const initialAddressFormState: AddressFormState = {
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

/* ---------- Enum options ---------- */

interface EnumOption {
  value: string;
  labelKey: string;
  description: string;
}

const CLIENT_TYPE_OPTIONS: EnumOption[] = [
  { value: "1", labelKey: "clients.enums.clientType.PessoaSingular", description: "Pessoa Singular" },
  { value: "2", labelKey: "clients.enums.clientType.RecibosVerdes", description: "Recibos Verdes" },
  { value: "3", labelKey: "clients.enums.clientType.Freelancer", description: "Freelancer" },
  { value: "4", labelKey: "clients.enums.clientType.PessoaJuridica", description: "Pessoa Jurídica" },
  { value: "5", labelKey: "clients.enums.clientType.SociedadeUnipessoalQuotas", description: "Sociedade Unipessoal por Quotas" },
];

const ORIGIN_OPTIONS: EnumOption[] = [
  { value: "1", labelKey: "clients.enums.origin.Outros", description: "Outros" },
  { value: "2", labelKey: "clients.enums.origin.Instagram", description: "Instagram" },
  { value: "3", labelKey: "clients.enums.origin.Facebook", description: "Facebook" },
  { value: "4", labelKey: "clients.enums.origin.LinkedIn", description: "LinkedIn" },
  { value: "5", labelKey: "clients.enums.origin.YouTube", description: "YouTube" },
  { value: "6", labelKey: "clients.enums.origin.WhatsApp", description: "WhatsApp" },
  { value: "7", labelKey: "clients.enums.origin.TikTok", description: "TikTok" },
  { value: "8", labelKey: "clients.enums.origin.Google", description: "Google" },
  { value: "9", labelKey: "clients.enums.origin.Amigos", description: "Amigos" },
  { value: "10", labelKey: "clients.enums.origin.Tv", description: "TV" },
  { value: "11", labelKey: "clients.enums.origin.Radio", description: "Rádio" },
  { value: "12", labelKey: "clients.enums.origin.Jornal", description: "Jornal" },
  { value: "13", labelKey: "clients.enums.origin.Revista", description: "Revista" },
];

const GENDER_OPTIONS = ["Masculino", "Feminino", "Outro"];

const GENDER_OPTIONS_KEYS: Record<string, string> = {
  Masculino: "clients.form.gender.male",
  Feminino: "clients.form.gender.female",
  Outro: "clients.form.gender.other",
};

const DOCUMENT_TYPE_OPTIONS = ["CC", "Passaporte", "Outro"];

const DOCUMENT_TYPE_OPTIONS_KEYS: Record<string, string> = {
  CC: "clients.form.documentType.cc",
  Passaporte: "clients.form.documentType.passport",
  Outro: "clients.form.documentType.other",
};

/* ---------- Client type helpers ---------- */

const INDIVIDUAL_CLIENT_TYPES = new Set([1]);
const COMPANY_CLIENT_TYPES = new Set([4]);

function isIndividualType(clientType: number | undefined): boolean {
  return typeof clientType === "number" && INDIVIDUAL_CLIENT_TYPES.has(clientType);
}

function isCompanyType(clientType: number | undefined): boolean {
  return typeof clientType === "number" && COMPANY_CLIENT_TYPES.has(clientType);
}

/* ---------- ToggleField component ---------- */

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  onLabel: string;
  offLabel: string;
}

function ToggleField({
  label,
  checked,
  onChange,
  disabled,
  className,
  onLabel,
  offLabel,
}: ToggleFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-[#94a5b4] dark:text-[#8da7b4]">
        {label}
      </span>
      <div className="flex w-full">
        <label className="relative inline-flex">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="peer sr-only"
          />
          <span className="flex h-7 w-12 items-center rounded-full bg-[#d7e0e5] px-1 transition-colors peer-checked:bg-[#08aee5] dark:bg-[#284451] dark:peer-checked:bg-[#11b7ff]">
            <span className="h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </span>
          <span className="ml-2 flex items-center text-sm text-[#1f2c3e] dark:text-[#d6e6ee]">
            {checked ? onLabel : offLabel}
          </span>
        </label>
      </div>
    </div>
  );
}

/* ---------- Form field component ---------- */

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  required,
  className,
}: FormFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-semibold text-[#94a5b4] dark:text-[#8da7b4]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-sm border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#1f2c3e] placeholder:text-[#94a5b4] focus:border-[#08aee5] focus:outline-none focus:ring-1 focus:ring-[#08aee5] disabled:opacity-50 dark:border-[#1c2c3a] dark:bg-[#101827] dark:text-[#d6e6ee] dark:placeholder:text-[#5a7080] dark:focus:border-[#08aee5]"
      />
    </div>
  );
}

/* ---------- Select field component ---------- */

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  className,
}: SelectFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label className="text-sm font-semibold text-[#94a5b4] dark:text-[#8da7b4]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-sm border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#1f2c3e] focus:border-[#08aee5] focus:outline-none focus:ring-1 focus:ring-[#08aee5] disabled:opacity-50 dark:border-[#1c2c3a] dark:bg-[#101827] dark:text-[#d6e6ee] dark:focus:border-[#08aee5]"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

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
      : typeof candidate.contactId === "number"
        ? candidate.contactId
        : null;
  if (rawId === null) return null;

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
      : typeof candidate.active === "boolean"
        ? candidate.active
        : typeof candidate.enabled === "boolean"
          ? candidate.enabled
          : true;
  const isPrimaryValue =
    typeof candidate.isPrimary === "boolean" ? candidate.isPrimary : false;

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

/* ---------- Address normalize/parse ---------- */

function normalizeAddress(payload: unknown): AddressItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  const rawId =
    typeof candidate.id === "number"
      ? candidate.id
      : typeof candidate.addressId === "number"
        ? candidate.addressId
        : null;
  if (rawId === null) return null;

  const street =
    typeof candidate.street === "string"
      ? candidate.street
      : typeof candidate.addressLine1 === "string"
        ? candidate.addressLine1
        : typeof candidate.address === "string"
          ? candidate.address
          : typeof candidate.line1 === "string"
            ? candidate.line1
            : null;
  const city =
    typeof candidate.city === "string"
      ? candidate.city
      : typeof candidate.town === "string"
        ? candidate.town
        : null;
  const state =
    typeof candidate.state === "string"
      ? candidate.state
      : typeof candidate.region === "string"
        ? candidate.region
        : typeof candidate.district === "string"
          ? candidate.district
          : null;
  const postalCode =
    typeof candidate.postalCode === "string"
      ? candidate.postalCode
      : typeof candidate.zipCode === "string"
        ? candidate.zipCode
        : null;
  const country =
    typeof candidate.country === "string"
      ? candidate.country
      : typeof candidate.countryCode === "string"
        ? candidate.countryCode
        : typeof candidate.regionCode === "string"
          ? candidate.regionCode
          : null;
  const isActiveValue =
    typeof candidate.isActive === "boolean"
      ? candidate.isActive
      : typeof candidate.active === "boolean"
        ? candidate.active
        : typeof candidate.enabled === "boolean"
          ? candidate.enabled
          : true;
  const isPrimaryValue =
    typeof candidate.isPrimary === "boolean" ? candidate.isPrimary : false;

  return {
    id: rawId,
    street,
    city,
    state,
    postalCode,
    country,
    isActive: Boolean(isActiveValue),
    isPrimary: Boolean(isPrimaryValue),
  };
}

function parsePagedAddresses(payload: unknown) {
  if (typeof payload !== "object" || payload === null)
    return { items: [] as AddressItem[], totalItems: 0 };
  const candidate = payload as AddressesPagedResponse;
  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const items = rawItems
    .map(normalizeAddress)
    .filter((item): item is AddressItem => item !== null);
  return {
    items,
    totalItems:
      typeof candidate.totalItems === "number" ? candidate.totalItems : items.length,
  };
}

/* ==========================
   MAIN COMPONENT
   ========================== */

export function ClientsDetailsPage() {
  const { fetchWithAuth, isHydrating, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const clientId = useMemo(() => {
    const raw = searchParams.get("clientId");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

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
  const [contactsBulkUploading, setContactsBulkUploading] = useState(false);

  /* ---------- Addresses state ---------- */

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressFormState, setAddressFormState] = useState<AddressFormState>(initialAddressFormState);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);
  const [addressSubmitting, setAddressSubmitting] = useState(false);
  const [addressesBulkUploading, setAddressesBulkUploading] = useState(false);

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

  /* ---------- Reset helpers ---------- */

  const resetContactForm = useCallback(() => {
    setEditingContact(null);
    setContactFormState(initialContactFormState);
  }, []);

  const resetAddressForm = useCallback(() => {
    setEditingAddress(null);
    setAddressFormState(initialAddressFormState);
  }, []);

  const resetClientForm = useCallback(() => {
    setClientFormState(initialClientFormState);
  }, []);

  /* ---------- Load client ---------- */

  const loadClient = useCallback(async () => {
    if (!clientId) return;
    setLoadingClient(true);
    try {
      const response = await fetchWithAuth(`/api/gerit/v1/clients/${clientId}`, { method: "GET" });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.errors.load")));
      }
      const normalized = normalizeClient(payload);
      if (normalized) {
        setClient(normalized);

        // Build individual form state from API response
        const ind = normalized.individual;
        const indState: IndividualFormState = {
          displayName: ind?.displayName ?? "",
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
        setClient(null);
      }
    } catch (error) {
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error ? error.message : t("clients.errors.load"),
        variant: "destructive",
      });
    } finally {
      setLoadingClient(false);
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
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.contacts.errors.load")));
      }
      const parsed = parsePagedContacts(payload);
      setContacts(parsed.items);
    } catch (error) {
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
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t("clients.addresses.errors.load")));
      }
      const parsed = parsePagedAddresses(payload);
      setAddresses(parsed.items);
    } catch (error) {
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

  /* ---------- Effects ---------- */

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      if (clientId) {
        void loadClient();
      } else {
        setClient(null);
        resetClientForm();
        setContacts([]);
        setAddresses([]);
        setLoadedTabs(new Set(["informacoes"]));
      }
    }
  }, [clientId, isAuthenticated, isHydrating, loadClient, resetClientForm]);

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
            displayName: ind.displayName.trim() || `${ind.firstName.trim()} ${ind.lastName.trim()}`.trim(),
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
              displayName: ind?.displayName ?? "",
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
            void router.replace(`/operations/clients-details?clientId=${normalized.id}`);
          }
        }
        toast({
          title: t("clients.toasts.successTitle"),
          description: isEditing ? t("clients.toasts.updated") : t("clients.toasts.created"),
        });
      } catch (error) {
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
    async (contact: ContactItem) => {
      const confirmed = window.confirm(
        t("clients.contacts.confirm.delete", { name: contact.name }),
      );
      if (!confirmed) return;
      if (!client?.id) return;
      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/contacts/${contact.id}`,
          { method: "DELETE" },
        );
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

  /* ---------- Address submit ---------- */

  const handleAddressSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!client) return;
      const street = addressFormState.street.trim();
      const city = addressFormState.city.trim();
      const state = addressFormState.state.trim();
      const postalCode = addressFormState.postalCode.trim();
      const country = addressFormState.country.trim();
      if (!street || !city) {
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
          street,
          city,
          state: state.length > 0 ? state : null,
          postalCode: postalCode.length > 0 ? postalCode : null,
          country: country.length > 0 ? country : null,
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
      street: address.street ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      postalCode: address.postalCode ?? "",
      country: address.country ?? "",
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
    async (address: AddressItem) => {
      const label = address.street ?? t("clients.addresses.table.street");
      const confirmed = window.confirm(
        t("clients.addresses.confirm.delete", { street: label }),
      );
      if (!confirmed) return;
      if (!client?.id) return;
      try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${client.id}/addresses/${address.id}`,
          { method: "DELETE" },
        );
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
      { key: "Email", label: t("clients.contacts.table.email") },
      { key: "Phone", label: t("clients.contacts.table.phone") },
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
      contact.email ?? "-",
      contact.phoneNumber ?? "-",
    ],
    [],
  );

  const renderContactStatus = useCallback(
    (contact: ContactItem) => (
      <span
        className={clsx(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          "text-[#3E515B] dark:text-[#84a0c0]",
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
          className="inline-flex h-8 w-8 items-center justify-center text-[#1f2f3f] transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={() => void handleContactToggleStatus(contact)}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={
            contact.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={() => void handleContactDelete(contact)}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#ffd7e1]"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
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
          "text-[#3E515B] dark:text-[#84a0c0]",
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
          className="inline-flex h-8 w-8 items-center justify-center text-[#1f2f3f] transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={t("clients.actions.edit")}
        >
          <SquarePen className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={() => void handleAddressToggleStatus(address)}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#0cbbf6] dark:border-[#38505d] dark:text-[#9eb1bc] dark:hover:text-white"
          title={
            address.isActive
              ? t("clients.actions.deactivate")
              : t("clients.actions.activate")
          }
        >
          <Power className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
        </button>
        <button
          type="button"
          onClick={() => void handleAddressDelete(address)}
          className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-[#ffd7e1]"
          title={t("clients.actions.delete")}
        >
          <Trash2 className="h-4 w-4 text-[#3E515B] dark:text-[#84a0c0]" />
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
      <div className="rounded-sm border border-[#cbd5e1] bg-[#f9fbff] p-5 dark:border-[#1c2c3a] dark:bg-[#101827]">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#94a5b4] dark:text-[#8da7b4]">
          {t("clients.form.individual.sectionTitle")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Line 1: Nome completo — 3 colunas */}
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField
              label={t("clients.form.individual.displayName")}
              value={ind.displayName}
              onChange={(v) => updateIndividual("displayName", v)}
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
          <label className="mb-1.5 block text-sm font-semibold text-[#94a5b4] dark:text-[#8da7b4]">
            {t("clients.form.observation")}
          </label>
          <textarea
            value={clientFormState.note}
            onChange={(event) =>
              setClientFormState((prev) => ({
                ...prev,
                note: event.target.value,
              }))
            }
            rows={3}
            className="w-full rounded-sm border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#1f2c3e] placeholder:text-[#94a5b4] focus:border-[#08aee5] focus:outline-none focus:ring-1 focus:ring-[#08aee5] dark:border-[#1c2c3a] dark:bg-[#101827] dark:text-[#d6e6ee] dark:placeholder:text-[#5a7080] dark:focus:border-[#08aee5]"
          />
        </div>
      </div>
    );
  };

  /* ---------- Render: Company form fields ---------- */

  const renderCompanyFields = () => {
    const comp = clientFormState.company;
    return (
      <div className="rounded-sm border border-[#cbd5e1] bg-[#f9fbff] p-5 dark:border-[#1c2c3a] dark:bg-[#101827]">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#94a5b4] dark:text-[#8da7b4]">
          {t("clients.form.company.sectionTitle")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          />
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
            label={t("clients.form.company.companyRegistration")}
            value={comp.companyRegistration}
            onChange={(v) => updateCompany("companyRegistration", v)}
          />
          <FormField
            label={t("clients.form.company.cae")}
            value={comp.cae}
            onChange={(v) => updateCompany("cae", v)}
          />
          <FormField
            label={t("clients.form.company.numberOfEmployee")}
            value={comp.numberOfEmployee}
            onChange={(v) => updateCompany("numberOfEmployee", v)}
            type="number"
          />
          <FormField
            label={t("clients.form.company.legalRepresentative")}
            value={comp.legalRepresentative}
            onChange={(v) => updateCompany("legalRepresentative", v)}
          />
          <ToggleField
            label={t("clients.form.company.isWhatsapp")}
            checked={comp.isWhatsapp}
            onChange={(v) => updateCompany("isWhatsapp", v)}
            onLabel={t("clients.switch.on")}
            offLabel={t("clients.switch.off")}
          />
          {/* Company fields: Origin */}
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
        {/* Observações */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-semibold text-[#94a5b4] dark:text-[#8da7b4]">
            {t("clients.form.observation")}
          </label>
          <textarea
            value={clientFormState.note}
            onChange={(event) =>
              setClientFormState((prev) => ({
                ...prev,
                note: event.target.value,
              }))
            }
            rows={3}
            className="w-full rounded-sm border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#1f2c3e] placeholder:text-[#94a5b4] focus:border-[#08aee5] focus:outline-none focus:ring-1 focus:ring-[#08aee5] dark:border-[#1c2c3a] dark:bg-[#101827] dark:text-[#d6e6ee] dark:placeholder:text-[#5a7080] dark:focus:border-[#08aee5]"
          />
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
          onClick={() => router.push("/operations/clients/")}
          className="inline-flex items-center gap-2 rounded-sm border border-[#c9d2e0] bg-white px-6 py-2.5 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("clients.actions.back")}
        </button>
        <button
          type="submit"
          disabled={submittingClient}
          className="inline-flex items-center gap-2 rounded-sm bg-[#08aee5] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0695c5] disabled:opacity-50 dark:bg-[#11b7ff] dark:hover:bg-[#08aee5]"
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
        <div className="flex items-center justify-center py-12 text-sm text-[#94a5b4]">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Contact form */}
        <form
          onSubmit={(e) => void handleContactSubmit(e)}
          className="rounded-sm border border-[#cbd5e1] bg-[#f9fbff] p-4 dark:border-[#1c2c3a] dark:bg-[#101827]"
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
              className="inline-flex items-center gap-2 rounded-sm bg-[#08aee5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0695c5] disabled:opacity-50 dark:bg-[#11b7ff] dark:hover:bg-[#08aee5]"
            >
              {contactSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingContact ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingContact && (
              <button
                type="button"
                onClick={resetContactForm}
                className="rounded-sm border border-[#c9d2e0] bg-white px-4 py-2 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
            {/* Bulk upload */}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[#c9d2e0] bg-white px-4 py-2 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]">
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

  /* ---------- Render: Addresses tab ---------- */

  const renderAddressesTab = () => {
    if (!loadedTabs.has("enderecos")) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-[#94a5b4]">
          {t("clients.detail.loadingTab")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Address form */}
        <form
          onSubmit={(e) => void handleAddressSubmit(e)}
          className="rounded-sm border border-[#cbd5e1] bg-[#f9fbff] p-4 dark:border-[#1c2c3a] dark:bg-[#101827]"
        >
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              label={t("clients.addresses.form.street")}
              value={addressFormState.street}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, street: v }))
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
            />
            <FormField
              label={t("clients.addresses.form.postalCode")}
              value={addressFormState.postalCode}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, postalCode: v }))
              }
            />
            <FormField
              label={t("clients.addresses.form.country")}
              value={addressFormState.country}
              onChange={(v) =>
                setAddressFormState((prev) => ({ ...prev, country: v }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={addressSubmitting}
              className="inline-flex items-center gap-2 rounded-sm bg-[#08aee5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0695c5] disabled:opacity-50 dark:bg-[#11b7ff] dark:hover:bg-[#08aee5]"
            >
              {addressSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingAddress ? t("clients.actions.save") : t("clients.actions.add")}
            </button>
            {editingAddress && (
              <button
                type="button"
                onClick={resetAddressForm}
                className="rounded-sm border border-[#c9d2e0] bg-white px-4 py-2 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]"
              >
                {t("clients.actions.cancel")}
              </button>
            )}
            {/* Bulk upload */}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[#c9d2e0] bg-white px-4 py-2 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]">
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
        </form>

        {/* Addresses grid */}
        <HubGrid
          columns={addressColumns}
          items={visibleAddresses}
          renderRowCells={addressRowCells}
          renderStatus={renderAddressStatus}
          renderActions={renderAddressActions}
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

  /* ==========================
     RENDER
     ========================== */

  return (
    <WorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-[#f5f6f8] px-4 py-4 sm:px-6 dark:bg-[#243143]">
          {/* ---------- Header ---------- */}
          <div className="mb-6 flex flex-col gap-4 rounded-sm border border-[#dfe6ed]/80 bg-white px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-[#132131] dark:bg-[#0d161f] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push("/operations/clients/")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-[#94a5b4] transition-colors hover:bg-[#f0f4f8] hover:text-[#08aee5] dark:hover:bg-[#1a2a36] dark:hover:text-[#08aee5]"
                title={t("clients.actions.back")}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-[#0f172a] dark:text-white sm:text-3xl">
                    {isEditing
                      ? client?.individual?.displayName ?? client?.name ?? t("clients.form.editTitle")
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
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-[#7aa4c0] dark:text-[#84a0c0]">
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
              <Loader2 className="h-8 w-8 animate-spin text-[#08aee5]" />
              <span className="ml-3 text-sm text-[#7aa4c0] dark:text-[#84a0c0]">
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
                  id: "enderecos",
                  label: t("clients.detail.tabs.addressesSummary"),
                  panel: renderAddressesTab(),
                },
              ]}
            />
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
