"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Power, PowerOff, SquarePen, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { HubSelect, HubSwitch, Input, Textarea } from "@/shared/ui";
import { sortHubSelectOptionsByLocalizedName } from "@/shared/ui/hub-select-utils";
import { ClientApiError } from "./client-api";
import {
  buildClientAddressQuery, clientAddressFormFromDetail, initialClientAddressFormValues,
  toClientAddressPayload, validateClientAddressForm,
  type AddressTypeOption, type ClientAddressDetail, type ClientAddressFormValues,
  type ClientAddressSortField, type ClientAddressStatusFilter, type ClientAddressSummary,
} from "./client-address-contract";
import {
  bulkUploadClientAddresses, createClientAddress, deleteClientAddress, getAddressTypes,
  getClientAddressDetail, getClientAddressPage, setClientAddressActive, updateClientAddress,
} from "./client-address-api";

const PAGE_SIZES = [10, 20, 50, 100];
const EMPTY_PAGE = { items: [] as ClientAddressSummary[], pageNumber: 1, pageSize: 10, totalItems: 0, totalPages: 1 };
type Mode = "idle" | "create" | "edit";
type CountryOption = { value: string; label: string; searchText: string };

function localizedCountries(locale: string): CountryOption[] {
  if (typeof Intl.DisplayNames !== "function") return [];
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const unknownRegionLabel = names.of("ZZ");
  const options: CountryOption[] = [];
  for (let first = 65; first <= 90; first += 1) for (let second = 65; second <= 90; second += 1) {
    const code = String.fromCharCode(first, second);
    const label = names.of(code);
    if (label && label.toUpperCase() !== code && label !== unknownRegionLabel) options.push({ value: code, label, searchText: `${label} ${code}` });
  }
  return options.sort((left, right) => left.label.localeCompare(right.label, locale));
}

function apiError(error: unknown, t: (key: string) => string, fallback: string): string {
  if (error instanceof ClientApiError) {
    if (error.status === 400) return t("clients.addresses.errors.validation");
    if (error.status === 401) return t("clients.addresses.errors.unauthenticated");
    if (error.status === 403) return t("clients.addresses.errors.forbidden");
    if (error.status === 409) return t("clients.addresses.errors.conflict");
    if (error.status === 410) return t("clients.addresses.errors.unavailable");
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ClientAddressesPanel({ clientId, active = true }: { clientId: number | null; active?: boolean }) {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating } = useAuth();
  const { t, state } = useTranslation();
  const { toast } = useToast();
  const canRead = hasPermission("ClientAddresses", "GetPaged");
  const canGetBy = hasPermission("ClientAddresses", "GetBy");
  const canCreate = hasPermission("ClientAddresses", "Create");
  const canUpdate = hasPermission("ClientAddresses", "Update");
  const canActivate = hasPermission("ClientAddresses", "Activate");
  const canDeactivate = hasPermission("ClientAddresses", "Deactivate");
  const canDelete = hasPermission("ClientAddresses", "Delete");
  const canBulkUpload = hasPermission("ClientAddresses", "BulkUpload");
  const canReadTypes = hasPermission("AddressTypes", "GetAll");

  const [items, setItems] = useState(EMPTY_PAGE);
  const [addressTypes, setAddressTypes] = useState<AddressTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [form, setForm] = useState<ClientAddressFormValues>(initialClientAddressFormValues);
  const [detail, setDetail] = useState<ClientAddressDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientAddressStatusFilter>("all");
  const [sortBy, setSortBy] = useState<ClientAddressSortField>("Street");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [density, setDensity] = useState<RowDensity>("medium");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTarget = useRef<ClientAddressSummary | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pageSequence = useRef(0);
  const detailSequence = useRef(0);

  const loadPage = useCallback(async () => {
    if (!activeRef.current || clientId === null || !canRead) return;
    const sequence = ++pageSequence.current;
    setPageLoading(true); setPageError(null);
    try {
      const result = await getClientAddressPage(fetchWithAuth, clientId, buildClientAddressQuery({ search, status, page, pageSize, sortBy, sortDirection }));
      if (sequence !== pageSequence.current) return;
      setItems(result);
      if (result.pageNumber !== page) setPage(result.pageNumber);
      if (PAGE_SIZES.includes(result.pageSize)) setPageSize(result.pageSize);
    } catch (error) {
      if (sequence !== pageSequence.current) return;
      setItems(EMPTY_PAGE); setPageError(apiError(error, t, t("clients.addresses.errors.load")));
    } finally { if (sequence === pageSequence.current) setPageLoading(false); }
  }, [canRead, clientId, fetchWithAuth, page, pageSize, search, sortBy, sortDirection, status, t]);

  useEffect(() => {
    if (!active || isHydrating || !isAuthenticated || clientId === null || !canRead) { pageSequence.current += 1; return; }
    void loadPage();
    return () => { pageSequence.current += 1; };
  }, [active, canRead, clientId, isAuthenticated, isHydrating, loadPage]);

  useEffect(() => {
    if (!active || isHydrating || !isAuthenticated || clientId === null || !canReadTypes || addressTypes.length > 0) return;
    let live = true;
    setTypesLoading(true);
    void getAddressTypes(fetchWithAuth).then((result) => { if (live) setAddressTypes(result); })
      .catch((error: unknown) => { if (live) setFormError(apiError(error, t, t("clients.addresses.errors.catalog"))); })
      .finally(() => { if (live) setTypesLoading(false); });
    return () => { live = false; };
  }, [active, addressTypes.length, canReadTypes, clientId, fetchWithAuth, isAuthenticated, isHydrating, t]);

  useEffect(() => {
    if (active && canCreate && mode === "idle" && !detail) setMode("create");
  }, [active, canCreate, detail, mode]);

  const beginCreate = useCallback(() => {
    if (!activeRef.current || !canCreate || submitting || detailLoading) return;
    detailSequence.current += 1; setDetail(null); setForm(initialClientAddressFormValues()); setFormError(null); setMode("create");
  }, [canCreate, detailLoading, submitting]);

  const beginEdit = useCallback(async (addressId: number) => {
    if (!activeRef.current || clientId === null || !canGetBy || !canUpdate || detailLoading || submitting) return;
    const sequence = ++detailSequence.current;
    setDetailLoading(true); setFormError(null); setMode("edit"); setDetail(null);
    try {
      const result = await getClientAddressDetail(fetchWithAuth, clientId, addressId);
      if (sequence !== detailSequence.current) return;
      setDetail(result); setForm(clientAddressFormFromDetail(result));
    } catch (error) {
      if (sequence !== detailSequence.current) return;
      setMode(canCreate ? "create" : "idle"); setForm(initialClientAddressFormValues());
      setPageError(apiError(error, t, t("clients.addresses.errors.unavailable")));
    } finally { if (sequence === detailSequence.current) setDetailLoading(false); }
  }, [canCreate, canGetBy, canUpdate, clientId, detailLoading, fetchWithAuth, submitting, t]);

  const cancelForm = useCallback(() => {
    detailSequence.current += 1; setDetail(null); setDetailLoading(false); setForm(initialClientAddressFormValues());
    setFormError(null); setMode(canCreate ? "create" : "idle");
  }, [canCreate]);

  const updateField = (key: keyof ClientAddressFormValues, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value })); setFormError(null);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (clientId === null || submitting || (mode === "create" ? !canCreate : mode !== "edit" || !canUpdate || !detail)) return;
    const validTypes = new Set(addressTypes.filter((item) => item.isActive).map((item) => item.id));
    if (mode === "edit" && detail) validTypes.add(detail.addressTypeId);
    const validation = validateClientAddressForm(form, validTypes);
    if (validation) { setFormError(t(`clients.addresses.validation.${validation}`)); return; }
    setSubmitting(true); setFormError(null);
    try {
      const payload = toClientAddressPayload(form);
      if (mode === "create") {
        await createClientAddress(fetchWithAuth, clientId, payload);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.addresses.toasts.created") });
      } else if (detail) {
        await updateClientAddress(fetchWithAuth, clientId, detail.id, payload);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.addresses.toasts.updated") });
      }
      setDetail(null); setForm(initialClientAddressFormValues()); setFormError(null); setMode(canCreate ? "create" : "idle");
      await loadPage();
    } catch (error) {
      const message = apiError(error, t, t("clients.addresses.errors.save"));
      setFormError(message); toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async (address: ClientAddressSummary) => {
    if (clientId === null || busyId !== null) return;
    if (address.isActive ? !canDeactivate : !canActivate) return;
    setBusyId(address.id); setPageError(null);
    try {
      await setClientAddressActive(fetchWithAuth, clientId, address.id, !address.isActive);
      toast({ title: t("clients.toasts.successTitle"), description: t(address.isActive ? "clients.addresses.toasts.deactivated" : "clients.addresses.toasts.activated") });
      await loadPage();
    } catch (error) { setPageError(apiError(error, t, t("clients.addresses.errors.status"))); }
    finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    const target = deleteTarget.current;
    if (!target || clientId === null || !canDelete || busyId !== null) return;
    setBusyId(target.id); setPageError(null);
    try {
      await deleteClientAddress(fetchWithAuth, clientId, target.id);
      toast({ title: t("clients.toasts.successTitle"), description: t("clients.addresses.toasts.deleted") });
      setDeleteOpen(false); deleteTarget.current = null;
      if (detail?.id === target.id) cancelForm();
      await loadPage();
    } catch (error) { setPageError(apiError(error, t, t("clients.addresses.errors.delete"))); }
    finally { setBusyId(null); }
  };

  const uploadCsv = async (file: File | null) => {
    if (!file || clientId === null || !canBulkUpload || bulkLoading) return;
    setBulkLoading(true); setPageError(null);
    try {
      await bulkUploadClientAddresses(fetchWithAuth, clientId, file);
      toast({ title: t("clients.toasts.successTitle"), description: t("clients.bulk.upload.success", { resource: t("clients.addresses.title") }) });
      await loadPage();
    } catch (error) {
      const message = apiError(error, t, t("clients.bulk.upload.error", { resource: t("clients.addresses.title") }));
      setPageError(message); toast({ title: t("clients.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally { setBulkLoading(false); }
  };

  const columns = useMemo<HubGridColumn<ClientAddressSummary>[]>(() => [
    { key: "Street", label: t("clients.addresses.table.street"), sortable: true },
    { key: "CountryCode", label: t("clients.addresses.table.country"), sortable: true },
    { key: "AddressTypeName", label: t("clients.addresses.form.addressType"), sortable: false },
  ], [t]);
  const renderActions = useCallback((address: ClientAddressSummary): ReactNode => {
    const canToggle = address.isActive ? canDeactivate : canActivate;
    return <div className="flex items-center justify-end gap-1">
      {canUpdate && canGetBy ? <button type="button" data-testid={`client-address-edit-${address.id}`} disabled={detailLoading || busyId === address.id} onClick={(event) => { event.stopPropagation(); void beginEdit(address.id); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t("clients.actions.edit")} aria-label={t("clients.actions.edit")}><SquarePen className="h-4 w-4" aria-hidden="true" /></button> : null}
      {canToggle ? <button type="button" data-testid={`client-address-toggle-${address.id}`} disabled={busyId === address.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(address); }} className="inline-flex h-8 w-8 items-center justify-center hover:text-primary disabled:opacity-50" title={t(address.isActive ? "clients.actions.deactivate" : "clients.actions.activate")} aria-label={t(address.isActive ? "clients.actions.deactivate" : "clients.actions.activate")}>{busyId === address.id ? <Loader2 className="h-4 w-4 animate-spin" /> : address.isActive ? <PowerOff className="h-4 w-4 text-red-500" aria-hidden="true" /> : <Power className="h-4 w-4 text-green-500" aria-hidden="true" />}</button> : null}
      {canDelete ? <button type="button" data-testid={`client-address-delete-${address.id}`} disabled={busyId === address.id} onClick={(event) => { event.stopPropagation(); deleteTarget.current = address; setDeleteOpen(true); }} className="inline-flex h-8 w-8 items-center justify-center text-destructive hover:text-destructive disabled:opacity-50" title={t("clients.actions.delete")} aria-label={t("clients.actions.delete")}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
    </div>;
  }, [beginEdit, busyId, canActivate, canDeactivate, canDelete, canGetBy, canUpdate, detailLoading, t]);

  const countryOptions = useMemo(() => {
    const options = localizedCountries(state.locale);
    if (form.countryCode && !options.some((option) => option.value === form.countryCode)) options.unshift({ value: form.countryCode, label: t("clients.addresses.form.countryLegacy", { code: form.countryCode }), searchText: form.countryCode });
    return options;
  }, [form.countryCode, state.locale, t]);
  const countries = useMemo(() => sortHubSelectOptionsByLocalizedName(countryOptions, state.locale), [countryOptions, state.locale]);
  const activeTypes = useMemo(() => addressTypes.filter((item) => item.isActive).map((item) => ({ value: String(item.id), label: item.name })), [addressTypes]);
  const typeOptions = detail && !activeTypes.some((item) => item.value === String(detail.addressTypeId))
    ? [{ value: String(detail.addressTypeId), label: detail.addressTypeName ?? t("clients.addresses.form.legacyType", { id: detail.addressTypeId }) }, ...activeTypes]
    : activeTypes;
  const pageButtons = useMemo(() => {
    const count = Math.max(1, items.totalPages); const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [items.totalPages, page]);

  if (clientId === null) return <section data-testid="client-addresses-unavailable" className="rounded-sm border border-border/80 bg-surface p-6"><h2 className="text-lg font-semibold">{t("clients.addresses.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("clients.contacts.errors.clientRequired")}</p></section>;
  if (!isHydrating && isAuthenticated && !canRead && !canCreate && !canUpdate && !canBulkUpload) return <section data-testid="client-addresses-forbidden" role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("clients.addresses.errors.forbidden")}</section>;

  const field = (name: keyof ClientAddressFormValues, key: string, maxLength: number, required = false, type = "text") => <label key={name} className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-foreground"><span>{t(key)}{required ? " *" : ""}</span><Input data-testid={`client-address-${name}`} type={type} value={form[name] as string} onChange={(event) => updateField(name, event.currentTarget.value)} disabled={submitting || detailLoading || mode === "idle"} required={required} maxLength={maxLength} min={name === "latitude" ? "-90" : name === "longitude" ? "-180" : undefined} max={name === "latitude" ? "90" : name === "longitude" ? "180" : undefined} step={type === "number" ? "any" : undefined} /></label>;
  const canSubmit = mode === "create" ? canCreate : mode === "edit" && canUpdate && detail !== null;
  const bulkUploadControl = canBulkUpload ? <label data-testid="client-address-bulk-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium has-[:disabled]:cursor-wait">{bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t("clients.addresses.bulk.label")}<input type="file" accept=".csv,text/csv" disabled={bulkLoading} className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; void uploadCsv(file); event.currentTarget.value = ""; }} /></label> : null;

  return <section data-testid="client-addresses-panel" className="space-y-4">
    {pageError ? <p role="alert" data-testid="client-address-error" className="rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive">{pageError}<button type="button" onClick={() => void loadPage()} className="ml-3 underline">{t("clients.contacts.actions.retry")}</button></p> : null}
    {(canCreate || canUpdate) ? <section data-testid="client-address-form-panel" className="rounded-sm border border-border/80 bg-surface p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t(mode === "edit" ? "clients.actions.edit" : "clients.addresses.form.title")}</h2><div className="flex flex-wrap items-center justify-end gap-2">{bulkUploadControl}{canCreate ? <button type="button" data-testid="client-address-new" onClick={beginCreate} disabled={submitting || detailLoading} className="rounded-sm border border-primary/50 px-3 py-2 text-sm font-medium text-primary disabled:opacity-50">{t("clients.actions.add")}</button> : null}</div>{detailLoading ? <p role="status" className="w-full text-sm text-muted-foreground">{t("clients.addresses.loadingDetail")}</p> : null}</div>
      {typesLoading ? <p role="status" className="mb-3 text-sm text-muted-foreground">{t("clients.addresses.loadingTypes")}</p> : null}
      <form onSubmit={(event) => void submitForm(event)} className="space-y-4" data-testid="client-address-form">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HubSelect label={t("clients.addresses.form.addressType")} value={form.addressTypeId} onValueChange={(value) => updateField("addressTypeId", value)} options={typeOptions} placeholder={t("clients.addresses.form.addressTypePlaceholder")} disabled={submitting || detailLoading || typesLoading || !canReadTypes} required testId="client-address-addressTypeId" />
          {field("street", "clients.addresses.form.street", 200, true)}
          {field("streetNumber", "clients.addresses.form.number", 20)}
          {field("complement", "clients.addresses.form.complement", 100)}
          {field("neighborhood", "clients.addresses.form.neighborhood", 100)}
          {field("city", "clients.addresses.form.city", 100, true)}
          {field("district", "clients.addresses.form.state", 100)}
          {field("postalCode", "clients.addresses.form.postalCode", 20, true)}
          <HubSelect label={t("clients.addresses.form.country")} value={form.countryCode} onValueChange={(value) => updateField("countryCode", value)} options={countries} placeholder={t("clients.addresses.form.countryPlaceholder")} disabled={submitting || detailLoading} required searchable testId="client-address-countryCode" />
          {field("latitude", "clients.addresses.form.latitude", 40, false, "number")}
          {field("longitude", "clients.addresses.form.longitude", 40, false, "number")}
          <label className="inline-flex min-w-0 items-center gap-3 text-sm font-medium"><HubSwitch checked={form.isPrimary} onCheckedChange={(value) => updateField("isPrimary", value)} disabled={submitting || detailLoading || mode === "idle"} testId="client-address-isPrimary" /><span>{t("clients.addresses.form.isPrimary")}</span></label>
          <label className="col-span-full flex min-w-0 flex-col gap-1.5 text-sm font-medium text-foreground"><span>{t("clients.addresses.form.note")}</span><Textarea data-testid="client-address-note" value={form.note} onChange={(event) => updateField("note", event.currentTarget.value)} maxLength={500} disabled={submitting || detailLoading || mode === "idle"} className="min-h-24 resize-y" /></label>
        </div>
        {formError ? <p role="alert" data-testid="client-address-form-error" className="rounded-sm border border-destructive/40 p-3 text-sm text-destructive">{formError}</p> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
          {canSubmit ? <><button type="button" onClick={cancelForm} disabled={submitting || detailLoading} className="rounded-sm border border-border px-4 py-2 text-sm">{t("clients.actions.cancel")}</button><button type="submit" disabled={submitting || typesLoading || activeTypes.length === 0} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("clients.actions.save")}</button></> : null}
        </div>
      </form>
    </section> : null}
    {!canCreate && !canUpdate && bulkUploadControl ? <div className="flex flex-wrap items-center justify-end gap-2">{bulkUploadControl}</div> : null}
    {canRead ? <HubGrid title={t("clients.addresses.title")} subtitle={t("clients.addresses.subtitle")} columns={columns} items={items.items}
      renderRowCells={(address) => [address.street ?? "—", address.countryCode ?? "—", address.addressTypeName ?? "—"]}
      renderStatus={(address) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${address.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>{t(address.isActive ? "clients.status.active" : "clients.status.inactive")}</span>}
      statusColumnLabel={t("clients.table.status")} renderActions={renderActions} actionsColumnLabel={t("clients.addresses.table.actions")}
      rowDensity={density} densityOptions={[{ key: "compact", label: t("clients.grid.density.slow") }, { key: "medium", label: t("clients.grid.density.medium") }, { key: "expanded", label: t("clients.grid.density.expanded") }]} onDensityChange={setDensity}
      sortBy={sortBy} sortDirection={sortDirection} onSort={(key) => { if (key !== "Street" && key !== "CountryCode") return; const next = key as ClientAddressSortField; setSortDirection((current) => sortBy === next ? current === "asc" ? "desc" : "asc" : "asc"); setSortBy(next); setPage(1); }}
      statusFilter={status} statusFilterOptions={[{ value: "all", label: t("clients.filters.all") }, { value: "active", label: t("clients.filters.active") }, { value: "inactive", label: t("clients.filters.inactive") }]} onStatusFilterChange={(value) => { if (["all", "active", "inactive"].includes(value)) { setStatus(value as ClientAddressStatusFilter); setPage(1); } }} statusFilterLabel={t("clients.filters.statusLabel")}
      searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={t("clients.filters.search")} loading={pageLoading} loadingText={t("clients.loading")} emptyText={t("clients.addresses.empty")}
      pageCaption={t("hubgrid.itemsLabel", { count: items.totalItems })} page={page} totalPages={Math.max(1, items.totalPages)} pageButtons={pageButtons} onPageChange={setPage} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageSizeChange={(value) => { if (PAGE_SIZES.includes(value)) { setPageSize(value); setPage(1); } }}
      paginationPreviousLabel={t("clients.pagination.previous")} paginationNextLabel={t("clients.pagination.next")} paginationPageLabel={t("clients.pagination.page")} paginationPerPageLabel={t("clients.pagination.perPage")} getRowKey={(address) => address.id} /> : <p role="status" className="rounded-sm border border-border bg-surface p-4 text-sm text-muted-foreground">{t("clients.addresses.errors.readPermission")}</p>}
    <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (busyId === null) setDeleteOpen(open); }} title={t("clients.actions.delete")} description={t("clients.addresses.confirm.delete", { street: deleteTarget.current?.street ?? "" })} confirmLabel={t("clients.actions.delete")} cancelLabel={t("clients.actions.cancel")} onConfirm={() => void confirmDelete()} />
  </section>;
}
