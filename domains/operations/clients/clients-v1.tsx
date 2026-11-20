"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Power, PowerOff, Plus, Save, SquarePen, Trash2, X } from "lucide-react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { HubImage, HubSelect, HubSwitch, HubTabs } from "@/shared/ui";
import {
  buildClientsQuery, CLIENT_INITIAL_STATUS_DEFINITION_ID,
  CLIENT_NAME_MAX_LENGTH, CLIENT_NOTE_MAX_LENGTH, CLIENT_STATUS_DOMAIN_ID, initialClientFormValues,
  resolveClientStatusDefinitionId, validateClientForm, toClientPayload, type ClientDetail, type ClientFormValues,
  type ClientRecord, type ClientSortField, type ClientStatusFilter, type CatalogOption,
} from "./client-contract";
import {
  ClientApiError, createClient, deleteClient, getClientCatalogs, getClientDetail,
  getClientPage, setClientActive, updateClient, type ClientCatalogs,
} from "./client-api";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const EMPTY_CATALOGS: ClientCatalogs = { partyTypes: [], acquisitionSources: [], statusDefinitions: [] };
type ClientTab = "client" | "contacts" | "addresses" | "documents" | "fiscalData";

function pageButtons(page: number, totalPages: number): number[] {
  const end = Math.min(Math.max(1, totalPages), Math.max(1, page + 2));
  const start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function apiErrorMessage(error: unknown, fallback: string, notFound?: string) {
  if (error instanceof ClientApiError && error.status === 410 && notFound) return notFound;
  return error instanceof Error && error.message ? error.message : fallback;
}

function Field({ label, value, onChange, disabled, required, maxLength, type = "text", testId, min, max, className }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
  required?: boolean; maxLength?: number; type?: string; testId?: string; min?: string; max?: string; className?: string;
}) {
  return <label className={"flex flex-col gap-1.5 text-sm font-medium text-foreground " + (className ?? "")}>
    <span>{label}{required ? " *" : ""}</span>
    <Input data-testid={testId} type={type} value={value} required={required} maxLength={maxLength} min={min} max={max} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

function SelectField({ label, value, onChange, options, disabled, required, placeholder, testId, className }: {
  label: string; value: string; onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>; disabled?: boolean;
  required?: boolean; placeholder: string; testId?: string; className?: string;
}) {
  return <HubSelect
    label={label}
    value={value}
    onValueChange={onChange}
    options={options}
    placeholder={placeholder}
    required={required}
    disabled={disabled}
    variant="default"
    testId={testId}
    className={className}
  />;
}

function LifecycleBadge({ active, label }: { active: boolean; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>{label}</span>;
}

export function ClientListPage() {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<ClientRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<ClientSortField>("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const requestSequence = useRef(0);
  const canRead = hasPermission("Clients", "GetPaged");
  const canGetBy = hasPermission("Clients", "GetBy");
  const canCreate = hasPermission("Clients", "Create");
  const canUpdate = hasPermission("Clients", "Update");
  const canActivate = hasPermission("Clients", "Activate");
  const canDeactivate = hasPermission("Clients", "Deactivate");
  const canDelete = hasPermission("Clients", "Delete");

  const columns = useMemo<HubGridColumn<ClientRecord>[]>(() => [
    { key: "Name", label: t("clients.v1.fields.name") },
    { key: "PhoneNumber", label: t("clients.v1.fields.phoneNumber") },
    { key: "PartyTypeId", label: t("clients.v1.fields.partyType"), sortable: true },
  ], [t]);
  const densityOptions = useMemo(() => [
    { key: "compact" as RowDensity, label: t("clients.grid.density.slow") },
    { key: "medium" as RowDensity, label: t("clients.grid.density.medium") },
    { key: "expanded" as RowDensity, label: t("clients.grid.density.expanded") },
  ], [t]);

  const loadClients = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!canRead) { setItems([]); setTotalItems(0); setTotalPages(1); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const query = buildClientsQuery({ search, status, page, pageSize, sortBy, sortDirection });
      const result = await getClientPage(fetchWithAuth, query);
      if (sequence !== requestSequence.current) return;
      setItems(result.items); setTotalItems(result.totalItems); setTotalPages(Math.max(1, result.totalPages));
      if (result.pageNumber !== page) setPage(result.pageNumber);
      if (PAGE_SIZE_OPTIONS.includes(result.pageSize)) setPageSize(result.pageSize);
    } catch (loadError) {
      if (sequence !== requestSequence.current) return;
      const message = apiErrorMessage(loadError, t("clients.v1.errors.load"));
      setError(message); setItems([]); setTotalItems(0); setTotalPages(1);
      toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [canRead, fetchWithAuth, page, pageSize, search, sortBy, sortDirection, status, t, toast]);

  useEffect(() => {
    if (!isHydrating && isAuthenticated) void loadClients();
    return () => { requestSequence.current += 1; };
  }, [isAuthenticated, isHydrating, loadClients]);

  const openDetail = (client: ClientRecord) => { if (canGetBy) router.push(`/clients/${client.id}/`); };
  const toggleLifecycle = async (client: ClientRecord) => {
    if (!(client.isActive ? canDeactivate : canActivate) || busyId !== null) return;
    setBusyId(client.id);
    try {
      await setClientActive(fetchWithAuth, client.id, !client.isActive);
      toast({ title: t("clients.toasts.successTitle"), description: t(client.isActive ? "clients.toasts.deactivated" : "clients.toasts.activated") });
      await loadClients();
    } catch (toggleError) {
      toast({ title: t("clients.toasts.errorTitle"), description: apiErrorMessage(toggleError, t("clients.v1.errors.lifecycle")), variant: "destructive" });
    } finally { setBusyId(null); }
  };
  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || !canDelete || busyId !== null) return;
    setBusyId(target.id);
    try {
      await deleteClient(fetchWithAuth, target.id);
      setDeleteTarget(null);
      toast({ title: t("clients.toasts.successTitle"), description: t("clients.toasts.deleted") });
      await loadClients();
    } catch (deleteError) {
      toast({ title: t("clients.toasts.errorTitle"), description: apiErrorMessage(deleteError, t("clients.v1.errors.delete")), variant: "destructive" });
    } finally { setBusyId(null); }
  };
  const sort = (key: string) => {
    if (!["Name", "PhoneNumber", "PartyTypeId"].includes(key)) return;
    const next = key as ClientSortField;
    setSortDirection((current) => sortBy === next ? current === "asc" ? "desc" : "asc" : "asc");
    setSortBy(next); setPage(1);
  };
  const renderActions = (client: ClientRecord): ReactNode => <div className="flex items-center justify-end gap-1">
    {canUpdate && canGetBy && <button type="button" className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" aria-label={t("clients.actions.edit")} title={t("clients.actions.edit")} onClick={(event) => { event.stopPropagation(); openDetail(client); }}><SquarePen className="h-4 w-4" aria-hidden="true" /></button>}

    {((client.isActive && canDeactivate) || (!client.isActive && canActivate)) && <button type="button" className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" disabled={busyId === client.id} aria-label={t(client.isActive ? "clients.v1.actions.deactivate" : "clients.v1.actions.activate")} title={t(client.isActive ? "clients.v1.actions.deactivate" : "clients.v1.actions.activate")} onClick={(event) => { event.stopPropagation(); void toggleLifecycle(client); }}>{client.isActive ? <PowerOff className="h-4 w-4 text-red-500" aria-hidden="true" /> : <Power className="h-4 w-4 text-green-500" aria-hidden="true" />}</button>}
    {canDelete && <button type="button" className="inline-flex h-8 w-8 items-center justify-center hover:text-destructive disabled:opacity-50" disabled={busyId === client.id} aria-label={t("clients.actions.delete")} title={t("clients.actions.delete")} onClick={(event) => { event.stopPropagation(); setDeleteTarget(client); }}><Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" /></button>}
  </div>;
  if (!isHydrating && isAuthenticated && !canRead) return (
    <div data-testid="clients-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6">
        <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("clients.v1.errors.forbidden")}</section>
      </div>
    </div>
  );

  return (
    <div data-testid="clients-page-root" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6">
        <div className="mb-5 overflow-hidden rounded-sm border border-border/80 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-4 border-b border-border/70 bg-muted px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[0.03em] text-foreground">{t("clients.title")}</h1>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">{t("clients.subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start"><button type="button" disabled aria-describedby="client-bulk-upload-unavailable" title={t("clients.bulk.upload.unavailable")} className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-card px-4 text-sm font-medium text-muted-foreground opacity-70">{t("clients.bulk.upload.label")}</button>{canCreate && <button type="button" className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90" onClick={() => router.push("/clients/new/")}><Plus className="h-4 w-4" aria-hidden="true" />{t("clients.actions.add")}</button>}<span id="client-bulk-upload-unavailable" className="sr-only">{t("clients.bulk.upload.unavailable")}</span></div>
          </div>
        </div>
        {error && <p role="alert" className="mb-5 rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive">{error}</p>}
        <HubGrid
          title={t("clients.title")} subtitle={t("clients.subtitle")} columns={columns} items={items}
          renderRowCells={(client) => [client.name ?? "—", client.phoneNumber ?? "—", client.partyTypeName ?? "—"]}
          renderStatus={(client) => <LifecycleBadge active={client.isActive} label={t(client.isActive ? "clients.status.active" : "clients.status.inactive")} />}
          statusColumnLabel={t("clients.table.status")} renderActions={renderActions} actionsColumnLabel={t("clients.table.actions")}
          rowDensity={rowDensity} densityOptions={densityOptions} onDensityChange={setRowDensity}
          sortBy={sortBy} sortDirection={sortDirection} onSort={sort}
          statusFilter={status} statusFilterOptions={[{ value: "all", label: t("clients.filters.all") }, { value: "active", label: t("clients.filters.active") }, { value: "inactive", label: t("clients.filters.inactive") }]}
          onStatusFilterChange={(value) => { if (["all", "active", "inactive"].includes(value)) { setStatus(value as ClientStatusFilter); setPage(1); } }}
          statusFilterLabel={t("clients.filters.statusLabel")} searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("clients.filters.search")}
          loading={loading} loadingText={t("clients.loading")} emptyText={t("clients.empty")}
          pageCaption={t("clients.v1.pagination", { count: totalItems })} page={page} totalPages={totalPages} pageButtons={pageButtons(page, totalPages)} onPageChange={setPage}
          pageSize={pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} onPageSizeChange={(value) => { if (PAGE_SIZE_OPTIONS.includes(value)) { setPageSize(value); setPage(1); } }}
          paginationPreviousLabel={t("clients.pagination.previous")} paginationNextLabel={t("clients.pagination.next")} paginationPageLabel={t("clients.pagination.page")} paginationPerPageLabel={t("clients.pagination.perPage")}
          getRowKey={(client) => client.id} onRowClick={canGetBy && canUpdate ? (client) => openDetail(client) : undefined}
        />
        <ConfirmDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && busyId === null) setDeleteTarget(null); }}
          title={t("clients.v1.delete.title")} description={t("clients.v1.delete.description", { name: deleteTarget?.name ?? "" })}
          confirmLabel={t("clients.actions.delete")} cancelLabel={t("clients.actions.cancel")} onConfirm={() => void confirmDelete()} />
      </div>
    </div>
  );
}
export function ClientFormPage({ clientId }: { clientId?: string }) {
  const isEditingRoute = clientId !== undefined;
  const parsedId = isEditingRoute ? Number(clientId) : null;
  const validId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0;
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<ClientCatalogs>(EMPTY_CATALOGS);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [values, setValues] = useState<ClientFormValues>(initialClientFormValues);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(isEditingRoute);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [tab, setTab] = useState<ClientTab>("client");
  const requestSequence = useRef(0);
  const canCreate = hasPermission("Clients", "Create");
  const canRead = hasPermission("Clients", "GetBy");
  const canUpdate = hasPermission("Clients", "Update");
  const canActivate = hasPermission("Clients", "Activate");
  const canDeactivate = hasPermission("Clients", "Deactivate");
  const canDelete = hasPermission("Clients", "Delete");

  const loadCatalogs = useCallback(async () => {
    setCatalogsLoading(true); setCatalogError(null);
    try {
      const result = await getClientCatalogs(fetchWithAuth);
      setCatalogs(result);
      if (!isEditingRoute && !result.statusDefinitions.some((option) => option.id === CLIENT_INITIAL_STATUS_DEFINITION_ID)) {
        setValues((current) => ({ ...current, statusDefinitionId: "" }));
        setCatalogError(t("clients.v1.errors.initialStatus"));
      }
    } catch (error) { setCatalogError(apiErrorMessage(error, t("clients.v1.errors.catalogs"))); }
    finally { setCatalogsLoading(false); }
  }, [fetchWithAuth, isEditingRoute, t]);

  const applyDetail = useCallback((detail: ClientDetail, currentCatalogs: ClientCatalogs) => {
    const statusDefinitionId = resolveClientStatusDefinitionId("update", detail);
    const statusIsActive = statusDefinitionId !== null && currentCatalogs.statusDefinitions.some((option) => option.id === statusDefinitionId && option.statusDomainId === CLIENT_STATUS_DOMAIN_ID && option.isActive);
    setValues({
      ...initialClientFormValues(),
      partyTypeId: String(detail.partyTypeId), acquisitionSourceTypeId: String(detail.acquisitionSourceTypeId),
      name: detail.name ?? "", phoneNumber: detail.phoneNumber ?? "", cellPhoneNumber: detail.cellPhoneNumber ?? "",
      isCellPhoneWhatsapp: detail.isCellPhoneWhatsapp, email: detail.email ?? "", websiteUrl: detail.websiteUrl ?? "",
      birthDate: detail.birthDate ? detail.birthDate.slice(0, 10) : "", gender: detail.gender ?? "", nationality: detail.nationality ?? "",
      companyRegistrationNumber: detail.companyRegistrationNumber ?? "", economicActivityCode: detail.economicActivityCode ?? "",
      numberOfEmployees: detail.numberOfEmployees === null ? "" : String(detail.numberOfEmployees),
      urlImage: detail.urlImage ?? "", note: detail.note ?? "",
      statusDefinitionId: statusDefinitionId === null ? "" : String(statusDefinitionId),
    });
    setFormError(statusIsActive ? null : t("clients.v1.errors.invalidBusinessStatus"));
  }, [t]);
  const loadClient = useCallback(async () => {
    if (parsedId === null || !validId || !canRead || !canUpdate) return;
    const sequence = ++requestSequence.current; setLoading(true); setFormError(null);
    try {
      const detail = await getClientDetail(fetchWithAuth, parsedId);
      if (sequence !== requestSequence.current) return;
      setClient(detail); applyDetail(detail, catalogs);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setFormError(apiErrorMessage(error, t("clients.v1.errors.loadDetail"), t("clients.v1.errors.notFound")));
      setClient(null);
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [applyDetail, canRead, canUpdate, catalogs, fetchWithAuth, parsedId, t, validId]);

  useEffect(() => { if (!isHydrating && isAuthenticated && (isEditingRoute ? canRead && canUpdate : canCreate)) void loadCatalogs(); }, [canCreate, canRead, canUpdate, isAuthenticated, isEditingRoute, isHydrating, loadCatalogs]);
  useEffect(() => {
    if (!isEditingRoute || !validId) {
      if (isEditingRoute && !validId) { setFormError(t("clients.v1.errors.invalidId")); setLoading(false); }
      return;
    }
    if (!isHydrating && isAuthenticated && !catalogsLoading && catalogs.partyTypes.length > 0) void loadClient();
    return () => { requestSequence.current += 1; };
  }, [catalogs.partyTypes.length, catalogsLoading, isAuthenticated, isEditingRoute, isHydrating, loadClient, t, validId]);

  const updateValue = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const cancelForm = () => {
    if (isEditingRoute) {
      if (!client) return;
      applyDetail(client, catalogs);
    } else {
      setValues(initialClientFormValues());
    }
    setPendingImageFile(null);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || (isEditingRoute ? !canUpdate || !client : !canCreate)) return;
    if (pendingImageFile) {
      const message = t("hubImage.uploadUnavailable");
      setFormError(message);
      toast({ title: t("clients.toasts.validationTitle"), description: message, variant: "destructive" });
      return;
    }
    const mode = isEditingRoute ? "update" : "create";
    const statusDefinitionId = selectedStatusDefinitionId;
    if (!selectedStatusIsValid) {
      const message = t("clients.v1.errors.invalidBusinessStatus");
      setFormError(message);
      toast({ title: t("clients.toasts.validationTitle"), description: message, variant: "destructive" });
      return;
    }
    const valuesWithSelectedStatus = { ...values, statusDefinitionId: String(statusDefinitionId) };
    const validationError = validateClientForm(valuesWithSelectedStatus, mode);
    const partyTypeId = Number(values.partyTypeId);
    const sourceId = Number(values.acquisitionSourceTypeId);
    const referencesValid = catalogs.partyTypes.some((option) => option.id === partyTypeId) &&
      catalogs.acquisitionSources.some((option) => option.id === sourceId) &&
      catalogs.statusDefinitions.some((option) => option.id === statusDefinitionId && option.statusDomainId === CLIENT_STATUS_DOMAIN_ID && option.isActive);
    if (validationError || !referencesValid) {
      const field = validationError ?? "references";
      const key = field === "partyTypeConsistency" ? "clients.v1.validation.partyTypeConsistency" : `clients.v1.validation.${field}`;
      toast({ title: t("clients.toasts.validationTitle"), description: t(key), variant: "destructive" });
      return;
    }
    setSubmitting(true); setFormError(null);
    try {
      const payload = toClientPayload(valuesWithSelectedStatus);
      if (isEditingRoute && client) {
        await updateClient(fetchWithAuth, client.id, payload);
        const updated = await getClientDetail(fetchWithAuth, client.id);
        setClient(updated); applyDetail(updated, catalogs);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.v1.toasts.updated") });
      } else {
        const id = await createClient(fetchWithAuth, payload);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.v1.toasts.created") });
        router.push(`/clients/${id}/`);
      }
    } catch (saveError) {
      const message = apiErrorMessage(saveError, t("clients.v1.errors.save"), t("clients.v1.errors.notFound"));
      setFormError(message); toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const toggleLifecycle = async () => {
    if (!client || lifecycleSubmitting) return;
    if (!(client.isActive ? canDeactivate : canActivate)) return;
    setLifecycleSubmitting(true);
    try {
      await setClientActive(fetchWithAuth, client.id, !client.isActive);
      const updated = await getClientDetail(fetchWithAuth, client.id);
      setClient(updated); applyDetail(updated, catalogs);
      toast({ title: t("clients.toasts.successTitle"), description: t(client.isActive ? "clients.toasts.deactivated" : "clients.toasts.activated") });
    } catch (error) {
      const message = apiErrorMessage(error, t("clients.v1.errors.lifecycle"), t("clients.v1.errors.notFound"));
      setFormError(message); toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setLifecycleSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!client || !canDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteClient(fetchWithAuth, client.id); setDeleteOpen(false);
      toast({ title: t("clients.toasts.successTitle"), description: t("clients.toasts.deleted") }); router.push("/clients/");
    } catch (error) {
      const message = apiErrorMessage(error, t("clients.v1.errors.delete"), t("clients.v1.errors.notFound"));
      setFormError(message); toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setDeleteSubmitting(false); }
  };

  const activePartyTypes = catalogs.partyTypes.filter((option) => option.isActive && (option.id === 1 || option.id === 2));
  const activeSources = catalogs.acquisitionSources.filter((option) => option.isActive);
  const isIndividual = values.partyTypeId === "1";
  const isOrganization = values.partyTypeId === "2";
  const canSave = isEditingRoute ? canUpdate : canCreate;
  const activeStatusOptions = catalogs.statusDefinitions.filter((option) => option.statusDomainId === CLIENT_STATUS_DOMAIN_ID && option.isActive);
  const currentStatusId = client?.statusDomainId === CLIENT_STATUS_DOMAIN_ID && client.statusDefinitionId !== null
    ? String(client.statusDefinitionId)
    : "";
  const currentStatusIsInactive = isEditingRoute && currentStatusId !== "" && !activeStatusOptions.some((option) => String(option.id) === currentStatusId);
  const businessStatusOptions = currentStatusIsInactive
    ? [{ value: currentStatusId, label: client?.statusDefinitionName ?? t("clients.v1.errors.invalidBusinessStatus"), disabled: true }, ...activeStatusOptions.map((option) => ({ value: String(option.id), label: option.name }))]
    : activeStatusOptions.map((option) => ({ value: String(option.id), label: option.name }));
  const selectedStatusDefinitionId = Number(values.statusDefinitionId);
  const selectedStatusIsValid = Number.isInteger(selectedStatusDefinitionId) && selectedStatusDefinitionId > 0 &&
    activeStatusOptions.some((option) => option.id === selectedStatusDefinitionId);
  const fieldsDisabled = submitting || catalogsLoading;

  if (!isHydrating && isAuthenticated && (isEditingRoute ? (!canRead || !canUpdate) : !canCreate)) return (
    <div data-testid={isEditingRoute ? "client-detail-page" : "client-create-page"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-auto bg-background px-4 py-4 sm:px-6">
        <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("clients.v1.errors.forbidden")}</section>
      </div>
    </div>
  );

  const relatedTabs: Array<{ id: ClientTab; label: string }> = [
    { id: "client", label: t("clients.v1.tabs.client") },
    { id: "contacts", label: t("clients.v1.tabs.contacts") },
    { id: "addresses", label: t("clients.v1.tabs.addresses") },
    { id: "documents", label: t("clients.v1.tabs.documents") },
    { id: "fiscalData", label: t("clients.v1.tabs.fiscalData") },
  ];
  const relatedTabContent: Record<Exclude<ClientTab, "client">, string> = {
    contacts: t("clients.v1.tabs.pendingContacts"), addresses: t("clients.v1.tabs.pendingAddresses"),
    documents: t("clients.v1.tabs.pendingDocuments"), fiscalData: t("clients.v1.tabs.pendingFiscalData"),
  };

  const title = isEditingRoute ? client?.name ?? t("clients.v1.detail.title") : t("clients.v1.create.title");

  return (
    <div data-testid={isEditingRoute ? "client-detail-page" : "client-create-page"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => router.push("/clients/")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" title={t("clients.actions.back")} aria-label={t("clients.actions.back")}><ArrowLeft className="h-5 w-5" /></button>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
                {client ? <LifecycleBadge active={client.isActive} label={t(client.isActive ? "clients.status.active" : "clients.status.inactive")} /> : null}
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">{isEditingRoute ? t("clients.v1.detail.subtitle") : t("clients.v1.create.subtitle")}</p>
            </div>
          </div>
          {isEditingRoute && client && <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {((client.isActive && canDeactivate) || (!client.isActive && canActivate)) && <button type="button" className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50" data-testid="client-lifecycle-toggle" disabled={lifecycleSubmitting} onClick={() => void toggleLifecycle()}>{lifecycleSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : client.isActive ? <PowerOff className="h-4 w-4 text-red-500" aria-hidden="true" /> : <Power className="h-4 w-4 text-green-500" aria-hidden="true" />}{t(client.isActive ? "clients.v1.actions.deactivate" : "clients.v1.actions.activate")}</button>}

            {canDelete && <button type="button" className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:border-destructive" data-testid="client-delete" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" />{t("clients.actions.delete")}</button>}
          </div>}
        </header>

        <HubTabs<ClientTab>
          id="client-v1-tabs"
          ariaLabel={t("clients.v1.tabs.label")}
          tabs={relatedTabs.map((item) => ({ ...item, panel: null, panelId: "client-v1-tab-panel" }))}
          activeTab={tab}
          onTabChange={setTab}
          renderPanel={false}
          className="mb-6"
        />

        {formError && <p role="alert" className="mb-4 rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive">{formError}</p>}
        {catalogError && <p role="alert" className="mb-4 rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive">{catalogError}</p>}
        <div id="client-v1-tab-panel" role="tabpanel" aria-labelledby={`client-v1-tabs-tab-${tab}`} tabIndex={0}>
        {loading || catalogsLoading ? <div role="status" className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("clients.loading")}</span></div> : tab !== "client" ? (
          <section className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h2 className="text-lg font-semibold text-foreground">{relatedTabs.find((item) => item.id === tab)?.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{relatedTabContent[tab as Exclude<ClientTab, "client">]}</p>
          </section>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-6" data-testid="client-form">
            <section data-testid="client-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <fieldset disabled={fieldsDisabled} data-testid="client-fields-grid" className="grid grid-cols-1 gap-x-5 gap-y-5 lg:grid-cols-3">
                <SelectField label={t("clients.v1.fields.partyType")} value={values.partyTypeId} onChange={(value) => setValues((current) => ({ ...current, partyTypeId: value, ...(value === "1" ? { companyRegistrationNumber: "", economicActivityCode: "", numberOfEmployees: "" } : { birthDate: "", gender: "", nationality: "" }) }))} options={activePartyTypes.map((item: CatalogOption) => ({ value: String(item.id), label: item.name }))} disabled={fieldsDisabled || isEditingRoute} required placeholder={t("clients.v1.select")} testId="client-party-type" className="lg:col-start-1 lg:row-start-1" />
                <SelectField label={t("clients.v1.fields.acquisitionSource")} value={values.acquisitionSourceTypeId} onChange={(value) => updateValue("acquisitionSourceTypeId", value)} options={activeSources.map((item) => ({ value: String(item.id), label: item.name }))} disabled={fieldsDisabled} required placeholder={t("clients.v1.select")} testId="client-acquisition-source" className="lg:col-start-2 lg:row-start-1" />
                <div className="lg:col-start-3 lg:row-start-1 lg:row-span-3"><HubImage urlImage={values.urlImage} onUrlImageChange={(urlImage) => updateValue("urlImage", urlImage)} pendingFile={pendingImageFile} onPendingFileChange={(file) => { setPendingImageFile(file); if (!file) setFormError(null); }} disabled={fieldsDisabled} /></div>

                <Field label={t("clients.v1.fields.name")} value={values.name} onChange={(value) => updateValue("name", value)} disabled={fieldsDisabled} required maxLength={CLIENT_NAME_MAX_LENGTH} testId="client-name" className="lg:col-start-1 lg:row-start-2" />
                <SelectField label={t("clients.v1.fields.businessStatus")} value={values.statusDefinitionId} onChange={(value) => { updateValue("statusDefinitionId", value); setFormError(null); setCatalogError(null); }} options={businessStatusOptions} disabled={fieldsDisabled} required placeholder={t("clients.v1.select")} testId="client-business-status" className="lg:col-start-2 lg:row-start-2" />

                {isOrganization && <>
                  <Field label={t("clients.v1.fields.companyRegistrationNumber")} value={values.companyRegistrationNumber} onChange={(value) => updateValue("companyRegistrationNumber", value)} disabled={fieldsDisabled} testId="client-company-registration" className="lg:col-start-1 lg:row-start-3" />
                  <Field label={t("clients.v1.fields.economicActivityCode")} value={values.economicActivityCode} onChange={(value) => updateValue("economicActivityCode", value)} disabled={fieldsDisabled} testId="client-economic-activity" className="lg:col-start-2 lg:row-start-3" />
                </>}
                {isIndividual && <>
                  <Field label={t("clients.v1.fields.birthDate")} value={values.birthDate} onChange={(value) => updateValue("birthDate", value)} disabled={fieldsDisabled} type="date" max={new Date().toISOString().slice(0, 10)} testId="client-birth-date" className="lg:col-start-1 lg:row-start-3" />
                  <Field label={t("clients.v1.fields.gender")} value={values.gender} onChange={(value) => updateValue("gender", value)} disabled={fieldsDisabled} testId="client-gender" className="lg:col-start-2 lg:row-start-3" />
                </>}

                <Field label={t("clients.v1.fields.phoneNumber")} value={values.phoneNumber} onChange={(value) => updateValue("phoneNumber", value)} disabled={fieldsDisabled} testId="client-phone" className="lg:col-start-1 lg:row-start-4" />
                <Field label={t("clients.v1.fields.cellPhoneNumber")} value={values.cellPhoneNumber} onChange={(value) => updateValue("cellPhoneNumber", value)} disabled={fieldsDisabled} testId="client-cell-phone" className="lg:col-start-2 lg:row-start-4" />
                <div data-testid="client-whatsapp-field" className="flex h-full flex-col justify-between gap-1.5 lg:col-start-3 lg:row-start-4">
                  <span id="client-whatsapp-label" className="text-sm font-medium text-foreground">{t("clients.v1.fields.whatsapp")}</span>
                  <label htmlFor="client-whatsapp" className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                    <HubSwitch id="client-whatsapp" testId="client-whatsapp" aria-labelledby="client-whatsapp-label client-whatsapp-value" checked={values.isCellPhoneWhatsapp} disabled={fieldsDisabled} onCheckedChange={(checked) => updateValue("isCellPhoneWhatsapp", checked)} />
                    <span id="client-whatsapp-value" data-testid="client-whatsapp-value">{t(values.isCellPhoneWhatsapp ? "common.yes" : "common.no")}</span>
                  </label>
                </div>

                <Field label={t("clients.v1.fields.email")} value={values.email} onChange={(value) => updateValue("email", value)} disabled={fieldsDisabled} testId="client-email" className="lg:col-start-1 lg:row-start-5" />
                <Field label={t("clients.v1.fields.websiteUrl")} value={values.websiteUrl} onChange={(value) => updateValue("websiteUrl", value)} disabled={fieldsDisabled} testId="client-website" className="lg:col-start-2 lg:row-start-5" />
                {isIndividual && <Field label={t("clients.v1.fields.nationality")} value={values.nationality} onChange={(value) => updateValue("nationality", value)} disabled={fieldsDisabled} testId="client-nationality" className="lg:col-start-3 lg:row-start-5" />}
                {isOrganization && <Field label={t("clients.v1.fields.numberOfEmployees")} value={values.numberOfEmployees} onChange={(value) => updateValue("numberOfEmployees", value)} disabled={fieldsDisabled} type="number" min="0" testId="client-number-employees" className="lg:col-start-3 lg:row-start-5" />}

                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground lg:col-span-3 lg:row-start-6"><span>{t("clients.form.observation")}</span><Textarea data-testid="client-note" className="min-h-32 resize-y" value={values.note} maxLength={!isEditingRoute ? CLIENT_NOTE_MAX_LENGTH : undefined} disabled={fieldsDisabled} onChange={(event) => updateValue("note", event.target.value)} /></label>
              </fieldset>
            </section>
            {canSave && <div className="flex flex-wrap justify-start gap-3">
              <button type="button" data-testid="client-back" onClick={() => router.push("/clients/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" />{t("clients.actions.back")}</button>
              <button type="button" data-testid="client-cancel" className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50" disabled={submitting} onClick={cancelForm}><X className="h-4 w-4" />{t("clients.actions.cancel")}</button>
              <button type="submit" data-testid="client-save" className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50" disabled={submitting || catalogsLoading || Boolean(pendingImageFile) || !selectedStatusIsValid}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t("clients.actions.save")}</button>
            </div>}
          </form>
        )}
        </div>

        {isEditingRoute && client && <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!open && !deleteSubmitting) setDeleteOpen(false); }}
          title={t("clients.v1.delete.title")} description={t("clients.v1.delete.description", { name: client.name ?? "" })}
          confirmLabel={t("clients.actions.delete")} cancelLabel={t("clients.actions.cancel")} onConfirm={() => void confirmDelete()} />}
      </div>
    </div>
  );
}
