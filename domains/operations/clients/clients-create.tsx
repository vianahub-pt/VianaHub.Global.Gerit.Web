"use client";

import clsx from "clsx";
import { ArrowLeft, Loader2, Power, PowerOff, SquarePen, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";

import { useToast } from "@/shared/feedback";
import { logError } from "@/core/logger/client-logger";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { HubTabs } from "@/shared/ui";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  normalizeClient,
  normalizeClientError,
  normalizeErrorMessage,
  parsePagedAddresses,
  getAddressSortValue,
  normalizeContactNetwork,
  parsePagedContactNetwork,
  getContactNetworkSortValue,
  type ContactNetworkPagedResponse,
  normalizeFiscalData,
  parsePagedFiscalData,
  getFiscalDataSortValue,
  normalizeConsent,
  parsePagedConsents,
  normalizeConsentTypes,
} from "@/domains/operations/clients/client-utils";
import { Textarea } from "@/shared/ui/textarea";
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
  type AddressItem,
  type AddressFormState,
  type AddressSortColumn,
  initialAddressFormState,
  type ContactNetworkItem,
  type ContactNetworkFormState,
  type ContactNetworkSortColumn,
  initialContactNetworkFormState,
  type ClientFiscalDataItem,
  type ClientFiscalDataFormState,
  initialFiscalDataFormState,
  type FiscalDataSortColumn,
  type ClientConsentItem,
  type ConsentTypeItem,
  type ClientConsentFormState,
  initialConsentFormState,
  type ConsentSortColumn,
} from "@/domains/operations/clients/client-models";
import { EUROPEAN_COUNTRIES_PLUS_BR_US } from "@/shared/utils/countries";

/* ---------- Constants ---------- */

const CONTACT_PAGE_SIZE = 25;
const CONTACT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const ADDRESS_PAGE_SIZE = 25;
const ADDRESS_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const CONTACT_NETWORK_PAGE_SIZE = 25;
const CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const FISCAL_DATA_PAGE_SIZE = 25;
const FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];
const CONSENT_PAGE_SIZE = 25;
const CONSENT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50];

/* ---------- Sort column types ---------- */

type ContactSortColumn = "Name" | "Email" | "Phone";
type ContactNetworkSortColumnLocal = "Name" | "Email" | "PhoneNumber" | "CellPhoneNumber" | "IsWhatsapp" | "IsPrimary";
type FiscalDataSortColumnLocal = "TaxNumber" | "VatNumber" | "FiscalCountry" | "IsVatRegistered" | "Iban" | "FiscalEmail";
type ConsentSortColumnLocal = "ConsentType" | "Granted" | "GrantedDate" | "RevokedDate" | "Origin";

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

const initialContactFormState: ContactFormState = {
  name: "",
  email: "",
  phoneNumber: "",
};

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

export function ClientsCreatePage() {
  const { fetchWithAuth } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [clientFormState, setClientFormState] = useState<ClientFormState>(
    initialClientFormState,
  );
  const [submitting, setSubmitting] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  /* ---------- Contacts state ---------- */

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(initialContactFormState);
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactDeleteConfirmOpen, setContactDeleteConfirmOpen] = useState(false);
  const contactDeleteRef = useRef<ContactItem | null>(null);
  const [contactsBulkUploading, setContactsBulkUploading] = useState(false);

  /* ---------- Contact grid state ---------- */

  const [contactGridDensity, setContactGridDensity] = useState<RowDensity>("medium");
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState<number>(CONTACT_GRID_PAGE_SIZE_OPTIONS[1]);
  const [contactSortBy, setContactSortBy] = useState<ContactSortColumn>("Name");
  const [contactSortDirection, setContactSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Address types ---------- */

  const [addressTypes, setAddressTypes] = useState<Array<{ id: number; name: string }>>([]);

  /* ---------- Addresses state ---------- */

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressFormState, setAddressFormState] = useState<AddressFormState>(initialAddressFormState);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);
  const [addressSubmitting, setAddressSubmitting] = useState(false);
  const [addressDeleteConfirmOpen, setAddressDeleteConfirmOpen] = useState(false);
  const addressDeleteRef = useRef<AddressItem | null>(null);

  /* ---------- Address grid state ---------- */

  const [addressGridDensity, setAddressGridDensity] = useState<RowDensity>("medium");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressStatusFilter, setAddressStatusFilter] = useState("all");
  const [addressPage, setAddressPage] = useState(1);
  const [addressPageSize, setAddressPageSize] = useState<number>(ADDRESS_GRID_PAGE_SIZE_OPTIONS[1]);
  const [addressSortBy, setAddressSortBy] = useState<AddressSortColumn>("Street");
  const [addressSortDirection, setAddressSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Contact Network state ---------- */

  const [contactNetwork, setContactNetwork] = useState<ContactNetworkItem[]>([]);
  const [contactNetworkLoading, setContactNetworkLoading] = useState(false);
  const [contactNetworkFormState, setContactNetworkFormState] = useState<ContactNetworkFormState>(initialContactNetworkFormState);
  const [editingContactNetwork, setEditingContactNetwork] = useState<ContactNetworkItem | null>(null);
  const [contactNetworkSubmitting, setContactNetworkSubmitting] = useState(false);
  const [contactNetworkDeleteConfirmOpen, setContactNetworkDeleteConfirmOpen] = useState(false);
  const contactNetworkDeleteRef = useRef<ContactNetworkItem | null>(null);
  const [contactNetworkBulkUploading, setContactNetworkBulkUploading] = useState(false);

  /* ---------- Contact Network grid state ---------- */

  const [contactNetworkGridDensity, setContactNetworkGridDensity] = useState<RowDensity>("medium");
  const [contactNetworkSearch, setContactNetworkSearch] = useState("");
  const [contactNetworkStatusFilter, setContactNetworkStatusFilter] = useState("all");
  const [contactNetworkPage, setContactNetworkPage] = useState(1);
  const [contactNetworkPageSize, setContactNetworkPageSize] = useState<number>(CONTACT_NETWORK_GRID_PAGE_SIZE_OPTIONS[1]);
  const [contactNetworkSortBy, setContactNetworkSortBy] = useState<ContactNetworkSortColumn>("Name");
  const [contactNetworkSortDirection, setContactNetworkSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Fiscal Data state ---------- */

  const [fiscalData, setFiscalData] = useState<ClientFiscalDataItem[]>([]);
  const [fiscalDataLoading, setFiscalDataLoading] = useState(false);
  const [fiscalDataFormState, setFiscalDataFormState] = useState<ClientFiscalDataFormState>(initialFiscalDataFormState);
  const [editingFiscalData, setEditingFiscalData] = useState<ClientFiscalDataItem | null>(null);
  const [fiscalDataSubmitting, setFiscalDataSubmitting] = useState(false);
  const [fiscalDataDeleteConfirmOpen, setFiscalDataDeleteConfirmOpen] = useState(false);
  const fiscalDataDeleteRef = useRef<ClientFiscalDataItem | null>(null);
  const [fiscalDataBulkUploading, setFiscalDataBulkUploading] = useState(false);

  /* ---------- Fiscal Data grid state ---------- */

  const [fiscalDataGridDensity, setFiscalDataGridDensity] = useState<RowDensity>("medium");
  const [fiscalDataSearch, setFiscalDataSearch] = useState("");
  const [fiscalDataStatusFilter, setFiscalDataStatusFilter] = useState("all");
  const [fiscalDataPage, setFiscalDataPage] = useState(1);
  const [fiscalDataPageSize, setFiscalDataPageSize] = useState<number>(FISCAL_DATA_GRID_PAGE_SIZE_OPTIONS[1]);
  const [fiscalDataSortBy, setFiscalDataSortBy] = useState<FiscalDataSortColumnLocal>("TaxNumber");
  const [fiscalDataSortDirection, setFiscalDataSortDirection] = useState<"asc" | "desc">("asc");

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

  /* ---------- Consents grid state ---------- */

  const [consentGridDensity, setConsentGridDensity] = useState<RowDensity>("medium");
  const [consentSearch, setConsentSearch] = useState("");
  const [consentStatusFilter, setConsentStatusFilter] = useState("all");
  const [consentPage, setConsentPage] = useState(1);
  const [consentPageSize, setConsentPageSize] = useState<number>(CONSENT_GRID_PAGE_SIZE_OPTIONS[1]);
  const [consentSortBy, setConsentSortBy] = useState<ConsentSortColumnLocal>("ConsentType");
  const [consentSortDirection, setConsentSortDirection] = useState<"asc" | "desc">("asc");

  /* ---------- Tab lazy loading state ---------- */

  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(["informacoes"]));

  const handleTabChange = useCallback((tab: ClientCreateTab) => {
    setActiveTab(tab);
    setLoadedTabs((prev) => {
      if (prev.has(tab)) return prev;
      return new Set(prev).add(tab);
    });
  }, []);

  type ClientCreateTab =
    | "informacoes"
    | "contactos"
    | "contactNetwork"
    | "enderecos"
    | "fiscalData"
    | "consents"
    | "hierarchy";

  const [activeTab, setActiveTab] = useState<ClientCreateTab>("informacoes");

  /* ---------- Client type change handler ---------- */

  const handleClientTypeChange = useCallback((newClientType: string) => {
    setClientFormState((prev) => ({
      ...prev,
      clientType: newClientType,
      individual: { ...initialIndividualFormState },
      company: { ...initialCompanyFormState },
    }));
  }, []);

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

  /* ---------- Derived values ---------- */

  const resolvedClientType =
    clientFormState.clientType.length > 0
      ? Number(clientFormState.clientType)
      : null;

  const showIndividualFields = isIndividualType(
    resolvedClientType ?? undefined,
  );
  const showCompanyFields = isCompanyType(resolvedClientType ?? undefined);

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

  /* ---------- Submit handler ---------- */

  const handleSubmit = useCallback(
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
            description: `${t("clients.validation.individualRequired")} ${t("clients.validation.suggestion")}`,
            variant: "destructive",
          });
          return;
        }
      } else if (isCompanyType(clientTypeNumber ?? undefined)) {
        const comp = clientFormState.company;
        if (!comp.legalName.trim()) {
          toast({
            title: t("clients.toasts.validationTitle"),
            description: `${t("clients.validation.companyRequired")} ${t("clients.validation.suggestion")}`,
            variant: "destructive",
          });
          return;
        }
      } else {
        // Fallback: basic name validation from individual fields
        const ind = clientFormState.individual;
        if (!ind.firstName.trim() || !ind.lastName.trim()) {
          toast({
            title: t("clients.toasts.validationTitle"),
            description: `${t("clients.validation.individualRequired")} ${t("clients.validation.suggestion")}`,
            variant: "destructive",
          });
          return;
        }
      }

      setSubmitting(true);
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
          const computedFullName = `${ind.firstName.trim()} ${ind.lastName.trim()}`.trim();
          payload.individual = {
            fullName:
              ind.fullName.trim() ||
              `${ind.firstName.trim()} ${ind.lastName.trim()}`.trim(),
            firstName: ind.firstName.trim(),
            lastName: ind.lastName.trim(),
            phoneNumber: ind.phoneNumber.trim(),
            cellPhoneNumber: ind.cellPhoneNumber.trim(),
            isWhatsapp: ind.isWhatsapp,
            email: ind.email.trim() || null,
            birthDate: ind.birthDate.length > 0 ? ind.birthDate : null,
            gender: ind.gender.length > 0 ? ind.gender : null,
            documentType: ind.documentType.length > 0 ? ind.documentType : null,
            documentNumber:
              ind.documentNumber.length > 0 ? ind.documentNumber : null,
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
            companyRegistration:
              comp.companyRegistration.length > 0
                ? comp.companyRegistration
                : null,
            cae: comp.cae.length > 0 ? comp.cae : null,
            numberOfEmployee:
              comp.numberOfEmployee.length > 0 &&
              !Number.isNaN(Number(comp.numberOfEmployee))
                ? Number(comp.numberOfEmployee)
                : null,
            legalRepresentative:
              comp.legalRepresentative.length > 0
                ? comp.legalRepresentative
                : null,
          };
        }

        const response = await fetchWithAuth("/api/gerit/v1/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response) return;
        const responsePayload = (await response
          .json()
          .catch(() => null)) as unknown;
        const statusCode = response.status;
        if (!response.ok) {
          const normalized = normalizeClientError(
            responsePayload,
            t("clients.errors.save"),
          );
          const err = new Error(normalized.message);
          if (normalized.errorId) {
            (err as any).errorId = normalized.errorId;
          }
          throw err;
        }
        let createdId: number | null = null;
        const normalized = normalizeClient(responsePayload);
        if (normalized) {
          createdId = normalized.id;
        } else {
          // Fallback: extrai o id diretamente do payload bruto da API
          // (o POST pode retornar formato diferente do GET)
          const raw = responsePayload as Record<string, unknown> | null;
          if (raw && typeof raw.id === "number") {
            createdId = raw.id;
          }
        }

        const isCreated = statusCode === 201;

        // If API returned 201 (created) we should show success toast even when
        // the API doesn't return the created resource id. If we do have an id,
        // store it in state to unlock tabs instead of redirecting.
        if (isCreated || createdId !== null) {
          toast({
            title: t("clients.toasts.successTitle"),
            description: t("clients.toasts.created"),
            duration: 5000,
          });

          if (createdId !== null) {
            setCreatedClientId(String(createdId));
            handleTabChange("contactos");
          }
        }
      } catch (error) {
        logError("clients.create", "Falha ao salvar cliente", error);

        let errorMessage = t("clients.errors.save");
        let errorId: string | undefined;

        if (error instanceof Error) {
          errorMessage = error.message;
          if ("errorId" in error) {
            errorId = (error as any).errorId;
          } else {
            const idMatch = error.message.match(/ID[:\s]+([a-f0-9-]+)/i);
            if (idMatch) errorId = idMatch[1];
          }
        }

        toast({
          title: t("clients.toasts.errorTitle"),
          description: errorId
            ? `${errorMessage} (ID do erro: ${errorId})`
            : errorMessage,
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [clientFormState, fetchWithAuth, router, t, toast],
  );

  /* ---------- Reset helpers ---------- */

  const resetContactForm = useCallback(() => {
    setEditingContact(null);
    setContactFormState(initialContactFormState);
  }, []);

  /* ---------- Load contacts ---------- */

  const loadClientContacts = useCallback(async () => {
    if (!createdClientId) {
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
        `/api/gerit/v1/clients/${createdClientId}/contacts/paged?${query.toString()}`,
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
      logError("clients.create.loadContacts", "Falha ao carregar contactos", error, {
        clientId: createdClientId,
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
  }, [createdClientId, fetchWithAuth, t, toast]);

  /* ---------- Fiscal Data load ---------- */

  const loadFiscalData = useCallback(async () => {
    if (!createdClientId) {
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
        `/api/gerit/v1/clients/${createdClientId}/fiscal-data/paged?${query.toString()}`,
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
      logError("clients.create.loadFiscalData", "Falha ao carregar dados fiscais", error, {
        clientId: createdClientId,
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
  }, [createdClientId, fetchWithAuth, t, toast]);

  /* ---------- Consents load ---------- */

  const loadConsents = useCallback(async () => {
    if (!createdClientId) {
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
        `/api/gerit/v1/clients/${createdClientId}/consents/paged?${query.toString()}`,
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
      logError("clients.create.loadConsents", "Falha ao carregar consentimentos", error, {
        clientId: createdClientId,
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
  }, [createdClientId, fetchWithAuth, t, toast]);

  /* ---------- Load consent types ---------- */

  const loadConsentTypes = useCallback(async () => {
    if (consentTypes.length > 0) return;
    try {
      const response = await fetchWithAuth("/api/gerit/v1/consent-types", { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return;
      const parsed = normalizeConsentTypes(payload);
      setConsentTypes(parsed);
    } catch {
      // Silent fail — consent types are optional
    }
  }, [consentTypes.length, fetchWithAuth]);

  /* ---------- Contact submit ---------- */

  const handleContactSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!createdClientId) return;
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
          ? `/api/gerit/v1/clients/${createdClientId}/contacts/${editingContact?.id}`
          : `/api/gerit/v1/clients/${createdClientId}/contacts`;
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
        logError("clients.create.contactSubmit", "Falha ao salvar contacto", error, {
          clientId: createdClientId,
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
    [createdClientId, contactFormState, editingContact, fetchWithAuth, loadClientContacts, resetContactForm, t, toast],
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
      if (!createdClientId) return;
      try {
        const endpoint = contact.isActive
          ? `/api/gerit/v1/clients/${createdClientId}/contacts/${contact.id}/deactivate`
          : `/api/gerit/v1/clients/${createdClientId}/contacts/${contact.id}/activate`;
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
        logError("clients.create.contactToggleStatus", "Falha ao alterar estado do contacto", error, {
          clientId: createdClientId,
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
    [createdClientId, fetchWithAuth, loadClientContacts, t, toast],
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
    if (!contact || !createdClientId) return;
    try {
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${createdClientId}/contacts/${contact.id}`,
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
        logError("clients.create.contactDelete", "Falha ao eliminar contacto", error, {
          clientId: createdClientId,
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
    [createdClientId, fetchWithAuth, loadClientContacts, t, toast],
  );

  const handleContactsBulkUpload = useCallback(
    async (file: File | null) => {
      if (!file || contactsBulkUploading || !createdClientId) return;
      setContactsBulkUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth(
          `/api/gerit/v1/clients/${createdClientId}/contacts/bulk-upload`,
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
        logError("clients.create.contactsBulkUpload", "Falha no upload em massa de contactos", error, {
          clientId: createdClientId,
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
    [createdClientId, contactsBulkUploading, fetchWithAuth, loadClientContacts, t, toast],
  );

  /* ---------- Contact grid ---------- */

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

  const gridDensityOptions = useMemo(
    () => [
      { key: "compact" as const, label: t("clients.grid.density.slow") },
      { key: "medium" as const, label: t("clients.grid.density.medium") },
      { key: "expanded" as const, label: t("clients.grid.density.expanded") },
    ],
    [t],
  );

  /* ---------- Contact page effects ---------- */

  useEffect(() => {
    setContactPage((current) => Math.min(current, contactTotalPages));
  }, [contactTotalPages]);

  useEffect(() => {
    setContactPage(1);
  }, [contactStatusFilter, contactSearch, contactSortBy, contactSortDirection, contactPageSize]);

  /* ---------- Lazy load contacts when tab becomes active ---------- */

  useEffect(() => {
    if (loadedTabs.has("contactos") && createdClientId && contacts.length === 0 && !contactsLoading) {
      void loadClientContacts();
    }
  }, [loadedTabs, createdClientId, contacts.length, contactsLoading, loadClientContacts]);

  /* ---------- Lazy load fiscal data when tab becomes active ---------- */

  useEffect(() => {
    if (loadedTabs.has("fiscalData") && createdClientId && fiscalData.length === 0 && !fiscalDataLoading) {
      void loadFiscalData();
    }
  }, [loadedTabs, createdClientId, fiscalData.length, fiscalDataLoading, loadFiscalData]);

  /* ---------- Lazy load consents when tab becomes active ---------- */

  useEffect(() => {
    if (loadedTabs.has("consents") && createdClientId && consents.length === 0 && !consentsLoading) {
      void loadConsents();
      void loadConsentTypes();
    }
  }, [loadedTabs, createdClientId, consents.length, consentsLoading, loadConsents, loadConsentTypes]);

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

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          open={contactDeleteConfirmOpen}
          onOpenChange={setContactDeleteConfirmOpen}
          onConfirm={() => void handleContactDeleteConfirm()}
          title={t("clients.contacts.deleteConfirm.title")}
          description={t("clients.contacts.deleteConfirm.description")}
          confirmLabel={t("clients.actions.confirm")}
          cancelLabel={t("clients.actions.cancel")}
        />
      </div>
    );
  };

  /* ---------- Addresses: reset form ---------- */

  const resetAddressForm = useCallback(() => {
    setEditingAddress(null);
    setAddressFormState(initialAddressFormState);
  }, []);

  /* ---------- Address types: load ---------- */

  const loadAddressTypes = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/gerit/v1/address-types", { method: "GET" });
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return;
      const items = Array.isArray(payload) ? payload : typeof payload === "object" && payload !== null && "items" in payload ? (payload as Record<string, unknown>).items : null;
      if (Array.isArray(items)) {
        setAddressTypes(
          items
            .map((item: unknown) => {
              if (typeof item !== "object" || item === null) return null;
              const record = item as Record<string, unknown>;
              const id = typeof record.id === "number" ? record.id : typeof record.id === "string" ? Number(record.id) : null;
              const name = typeof record.name === "string" ? record.name : typeof record.description === "string" ? record.description : "";
              if (id === null || !Number.isFinite(id)) return null;
              return { id, name };
            })
            .filter((item): item is { id: number; name: string } => item !== null),
        );
      }
    } catch {
      // silently ignore
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    void loadAddressTypes();
  }, [loadAddressTypes]);

  /* ---------- Addresses: load ---------- */

  const loadAddresses = useCallback(async () => {
    if (!createdClientId) {
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
        `/api/gerit/v1/clients/${createdClientId}/addresses/paged?${query.toString()}`,
        { method: "GET" },
      );
      if (!response) return;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(
          normalizeErrorMessage(payload, t("clients.addresses.errors.load")),
        );
      }
      const parsed = parsePagedAddresses(payload);
      setAddresses(parsed.items);
    } catch (error) {
      logError("clients.create.loadAddresses", "Falha ao carregar endereços", error);
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("clients.addresses.errors.load"),
        variant: "destructive",
      });
      setAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, [createdClientId, fetchWithAuth, t, toast]);

  /* ---------- Addresses: load on tab activate ---------- */

  useEffect(() => {
    if (createdClientId && activeTab === "enderecos") {
      void loadAddresses();
    }
  }, [createdClientId, activeTab, loadAddresses]);

  /* ---------- Addresses: submit (create/update) ---------- */

  const handleAddressSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!createdClientId) return;
      const street = addressFormState.street.trim();
      const city = addressFormState.city.trim();
      const neighborhood = addressFormState.neighborhood.trim();
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
          ? `/api/gerit/v1/clients/${createdClientId}/addresses/${editingAddress?.id}`
          : `/api/gerit/v1/clients/${createdClientId}/addresses`;
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
        await loadAddresses();
      } catch (error) {
        logError("clients.create.addressSubmit", "Falha ao salvar endereço", error);
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.addresses.errors.save"),
          variant: "destructive",
        });
      } finally {
        setAddressSubmitting(false);
      }
    },
    [
      addressFormState,
      createdClientId,
      editingAddress,
      fetchWithAuth,
      loadAddresses,
      resetAddressForm,
      t,
      toast,
    ],
  );

  /* ---------- Addresses: edit ---------- */

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

  /* ---------- Addresses: toggle status ---------- */

  const handleAddressToggleStatus = useCallback(
    async (address: AddressItem) => {
      if (!createdClientId) return;
      try {
        const endpoint = address.isActive
          ? `/api/gerit/v1/clients/${createdClientId}/addresses/${address.id}/deactivate`
          : `/api/gerit/v1/clients/${createdClientId}/addresses/${address.id}/activate`;
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
        await loadAddresses();
      } catch (error) {
        logError("clients.create.addressToggleStatus", "Falha ao alterar estado do endereço", error);
        toast({
          title: t("clients.toasts.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("clients.addresses.errors.status"),
          variant: "destructive",
        });
      }
    },
    [createdClientId, fetchWithAuth, loadAddresses, t, toast],
  );

  /* ---------- Addresses: delete ---------- */

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
    if (!address || !createdClientId) return;
    try {
      const response = await fetchWithAuth(
        `/api/gerit/v1/clients/${createdClientId}/addresses/${address.id}`,
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
      await loadAddresses();
    } catch (error) {
      logError("clients.create.addressDelete", "Falha ao eliminar endereço", error);
      toast({
        title: t("clients.toasts.errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("clients.addresses.errors.delete"),
        variant: "destructive",
      });
    }
  }, [createdClientId, fetchWithAuth, loadAddresses, t, toast]);

  /* ---------- Addresses: grid derived ---------- */

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

  const addressColumns = useMemo<HubGridColumn<AddressItem>[]>(
    () => [
      { key: "Street", label: t("clients.addresses.table.street") },
      { key: "City", label: t("clients.addresses.table.city") },
      { key: "State", label: t("clients.addresses.table.state") },
      { key: "PostalCode", label: t("clients.addresses.table.postalCode") },
    ],
    [t],
  );

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

  /* ==========================
     RENDER
     ========================== */

  return (
      <div data-testid="clients-create-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
          {/* ---------- Header ---------- */}
          <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push("/clients/")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary dark:hover:bg-secondary dark:hover:text-primary"
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
                      {t("clients.form.newTitle")}
                    </li>
                  </ol>
                </nav>
                <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">
                  {t("clients.form.newTitle")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">
                  {t("clients.detail.helper")}
                </p>
              </div>
            </div>
          </div>

          {/* ---------- Tabs ---------- */}
          <HubTabs<ClientCreateTab>
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabs={[
              {
                id: "informacoes",
                label: t("clients.detail.tabs.clientSummary"),
                panel: (
                  <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
                    {/* Client type selector */}
                    <div className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
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
                    </div>

                    {/* Dynamic individual/company fields */}
                    {showIndividualFields && renderIndividualFields()}
                    {showCompanyFields && renderCompanyFields()}

                    {/* Footer: Voltar + Guardar */}
                    <div className="flex justify-start gap-3">
                      <button
                        type="button"
                        onClick={() => router.push("/clients/")}
                        className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary dark:border-input dark:bg-card dark:text-muted-foreground dark:hover:border-ring dark:hover:text-primary"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {t("clients.actions.back")}
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("clients.actions.save")}
                      </button>
                    </div>
                  </form>
                ),
              },
              {
                id: "contactos",
                label: t("clients.detail.tabs.contactsSummary"),
                disabled: !createdClientId,
                panel: createdClientId ? (
                  renderContactsTab()
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("clients.create.tabs.saveFirst")}
                  </div>
                ),
              },
              {
                id: "enderecos",
                label: t("clients.detail.tabs.addressesSummary"),
                disabled: !createdClientId,
                panel: createdClientId ? (
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
                        <SelectField
                          label={t("clients.addresses.form.country")}
                          value={addressFormState.country}
                          onChange={(v) =>
                            setAddressFormState((prev) => ({ ...prev, country: v }))
                          }
                          options={EUROPEAN_COUNTRIES_PLUS_BR_US.map((c) => ({
                            value: c.code,
                            label: c.name,
                          }))}
                          placeholder={t("clients.form.selectOption")}
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

                    {/* Delete confirmation */}
                    <ConfirmDialog
                      open={addressDeleteConfirmOpen}
                      onOpenChange={setAddressDeleteConfirmOpen}
                      title={t("clients.actions.delete")}
                      description={
                        addressDeleteRef.current
                          ? t("clients.addresses.confirm.delete", {
                              street: addressDeleteRef.current.street ?? "",
                            })
                          : t("clients.addresses.confirm.delete", { street: "" })
                      }
                      onConfirm={() => void handleAddressDeleteConfirm()}
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("clients.create.tabs.saveFirst")}
                  </div>
                ),
              },
              {
                id: "fiscalData",
                label: t("clients.detail.tabs.fiscalDataSummary"),
                disabled: !createdClientId,
                panel: createdClientId ? (
                  <div>Conteúdo de Dados Fiscais (placeholder por agora)</div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("clients.create.tabs.saveFirst")}
                  </div>
                ),
              },
              {
                id: "consents",
                label: t("clients.detail.tabs.consentsSummary"),
                disabled: !createdClientId,
                panel: createdClientId ? (
                  <div>Conteúdo de Consentimentos (placeholder por agora)</div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("clients.create.tabs.saveFirst")}
                  </div>
                ),
              },
              {
                id: "hierarchy",
                label: t("clients.detail.tabs.hierarchySummary"),
                disabled: !createdClientId,
                panel: createdClientId ? (
                  <div>Conteúdo de Hierarquia (placeholder por agora)</div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("clients.create.tabs.saveFirst")}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
  );
}
