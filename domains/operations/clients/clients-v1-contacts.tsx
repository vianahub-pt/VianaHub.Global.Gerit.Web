"use client";

import { Loader2, Power, PowerOff, SquarePen, Trash2, Upload, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { HubGrid, type HubGridColumn, type RowDensity } from "@/shared/hub-grid";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { HubSwitch, Input } from "@/shared/ui";
import {
  buildClientContactPersonQuery,
  clientContactPersonFormFromDetail,
  CLIENT_CONTACT_DEPARTMENT_MAX_LENGTH,
  CLIENT_CONTACT_EMAIL_MAX_LENGTH,
  CLIENT_CONTACT_JOB_TITLE_MAX_LENGTH,
  CLIENT_CONTACT_NAME_MAX_LENGTH,
  CLIENT_CONTACT_PAGE_SIZE_OPTIONS,
  CLIENT_CONTACT_PHONE_MAX_LENGTH,
  initialClientContactPersonFormValues,
  toClientContactPersonPayload,
  validateClientContactPersonForm,
  type ClientContactPersonDetail,
  type ClientContactPersonFormValues,
  type ClientContactPersonSummary,
  type ClientContactStatusFilter,
} from "./client-contact-person-contract";
import { ClientApiError } from "./client-api";
import {
  createClientContactPerson,
  deleteClientContactPerson,
  getClientContactPersonDetail,
  getClientContactPersonPage,
  setClientContactPersonActive,
  updateClientContactPerson,
} from "./client-contact-person-api";

type ContactFetcher = ReturnType<typeof useAuth>["fetchWithAuth"];
type ContactMode = "idle" | "create" | "edit";

const emptyPage = {
  items: [] as ClientContactPersonSummary[],
  pageNumber: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
};

function errorText(error: unknown, fallback: string, t: (key: string) => string): string {
  if (error instanceof ClientApiError) {
    if (error.status === 409) {
      const code = error.code?.toLocaleLowerCase() ?? "";
      const message = error.message.toLocaleLowerCase();
      if ((/email|e-mail/.test(code) && /duplicate|exists|already/.test(code)) || /email|e-mail|correo electrónico/.test(message)) return t("clients.contacts.errors.emailConflict");
      if ((/(primary|isprimary)/.test(code) && /duplicate|exists|already/.test(code)) || /primary|principal/.test(message)) return t("clients.contacts.errors.primaryConflict");
      return t("clients.contacts.errors.conflict");
    }
    if (error.status === 410) return t("clients.contacts.errors.unavailable");
  }
  return error instanceof Error ? error.message : fallback;
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
  maxLength,
  type = "text",
  testId,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required?: boolean;
  maxLength: number;
  type?: string;
  testId: string;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      <span>{label}{required ? " *" : ""}</span>
      <Input
        data-testid={testId}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}

export function ClientContactPersonsPanel({ clientId, active = true }: { clientId: number | null; active?: boolean }) {
  const { fetchWithAuth, hasPermission, isAuthenticated, isHydrating } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const canRead = hasPermission("ClientContactPersons", "GetPaged");
  const canGetBy = hasPermission("ClientContactPersons", "GetBy");
  const canCreate = hasPermission("ClientContactPersons", "Create");
  const canUpdate = hasPermission("ClientContactPersons", "Update");
  const canActivate = hasPermission("ClientContactPersons", "Activate");
  const canDeactivate = hasPermission("ClientContactPersons", "Deactivate");
  const canDelete = hasPermission("ClientContactPersons", "Delete");

  const [mode, setMode] = useState<ContactMode>("idle");
  const [pageData, setPageData] = useState(emptyPage);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientContactStatusFilter>("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rowDensity, setRowDensity] = useState<RowDensity>("medium");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ClientContactPersonDetail | null>(null);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientContactPersonFormValues>(initialClientContactPersonFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTarget = useRef<ClientContactPersonSummary | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const detailRequestId = useRef(0);
  const pageRequestSequence = useRef(0);

  const loadPage = useCallback(async () => {
    if (!activeRef.current || clientId === null || !canRead) return;
    const requestSequence = ++pageRequestSequence.current;
    setLoading(true);
    setError(null);
    const query = buildClientContactPersonQuery({ search, status, page, pageSize, sortDirection });
    try {
      const result = await getClientContactPersonPage(fetchWithAuth, clientId, query);
      if (requestSequence !== pageRequestSequence.current) return;
      setPageData(result);
      if (result.pageNumber !== page) setPage(result.pageNumber);
    } catch (cause) {
      if (requestSequence !== pageRequestSequence.current) return;
      setPageData(emptyPage);
      setError(errorText(cause, t("clients.contacts.errors.load"), t));
    } finally {
      if (requestSequence === pageRequestSequence.current) setLoading(false);
    }
  }, [canRead, clientId, fetchWithAuth, page, pageSize, search, sortDirection, status, t]);

  useEffect(() => {
    if (!active || isHydrating || !isAuthenticated || clientId === null || !canRead) {
      pageRequestSequence.current += 1;
      return;
    }
    void loadPage();
    return () => { pageRequestSequence.current += 1; };
  }, [active, canRead, clientId, isAuthenticated, isHydrating, loadPage]);

  useEffect(() => {
    if (active && canCreate && mode === "idle" && editingContactId === null) setMode("create");
  }, [active, canCreate, editingContactId, mode]);

  const beginEdit = useCallback(async (contactId: number) => {
    if (!activeRef.current || clientId === null || !canGetBy || !canUpdate || detailLoading) return;
    const requestId = ++detailRequestId.current;
    setMode("edit");
    setDetail(null);
    setEditingContactId(contactId);
    setDetailLoading(true);
    setFormError(null);
    try {
      const result = await getClientContactPersonDetail(fetchWithAuth, clientId, contactId);
      if (requestId !== detailRequestId.current) return;
      setDetail(result);
      setForm(clientContactPersonFormFromDetail(result));
    } catch (cause) {
      if (requestId !== detailRequestId.current) return;
      setForm(initialClientContactPersonFormValues());
      setMode(canCreate ? "create" : "idle");
      setEditingContactId(null);
      setError(errorText(cause, t("clients.contacts.errors.unavailable"), t));
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, [canCreate, canGetBy, canUpdate, clientId, detailLoading, fetchWithAuth, t]);

  const beginCreate = useCallback(() => {
    detailRequestId.current += 1;
    setDetail(null);
    setEditingContactId(null);
    setDetailLoading(false);
    setForm(initialClientContactPersonFormValues());
    setFormError(null);
    if (!canCreate) return;
    setMode("create");
    requestAnimationFrame(() => firstFieldRef.current?.focus({ preventScroll: true }));
  }, [canCreate]);

  const cancelForm = useCallback(() => {
    detailRequestId.current += 1;
    setFormError(null);
    setDetail(null);
    setEditingContactId(null);
    setDetailLoading(false);
    setForm(initialClientContactPersonFormValues());
    setMode(canCreate ? "create" : "idle");
  }, [canCreate]);

  useEffect(() => {
    if (mode !== "edit" || detailLoading || !active) return;
    firstFieldRef.current?.focus({ preventScroll: true });
  }, [active, detailLoading, mode]);

  const revealFormIfOutsideViewport = useCallback(() => {
    const firstField = firstFieldRef.current;
    if (!firstField) return;
    const bounds = firstField.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      firstField.scrollIntoView({ behavior: "instant", block: "nearest" });
    }
  }, []);

  const updateField = useCallback((field: keyof ClientContactPersonFormValues, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  }, []);

  const submitForm = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (clientId === null || submitting || mode === "idle" || (mode === "create" ? !canCreate : !canUpdate)) return;
    const validationKey = validateClientContactPersonForm(form);
    if (validationKey) {
      setFormError(t("clients.contacts.validation." + validationKey));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = toClientContactPersonPayload(form);
      let contactId = editingContactId ?? undefined;
      if (mode === "create") {
        contactId = await createClientContactPerson(fetchWithAuth, clientId, payload);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.contacts.toasts.created") });
      } else {
        if (!contactId) return;
        await updateClientContactPerson(fetchWithAuth, clientId, contactId, payload);
        toast({ title: t("clients.toasts.successTitle"), description: t("clients.contacts.toasts.updated") });
      }
      await loadPage();
      setDetail(null);
      setEditingContactId(null);
      setForm(initialClientContactPersonFormValues());
      setMode(canCreate ? "create" : "idle");
    } catch (cause) {
      setFormError(errorText(cause, t("clients.contacts.errors.save"), t));
    } finally {
      setSubmitting(false);
    }
  }, [canCreate, canUpdate, clientId, editingContactId, fetchWithAuth, form, loadPage, mode, submitting, t, toast]);

  const toggleStatus = useCallback(async (contact: ClientContactPersonSummary) => {
    if (clientId === null || busyId !== null) return;
    const allowed = contact.isActive ? canDeactivate : canActivate;
    if (!allowed) return;
    setBusyId(contact.id);
    setError(null);
    try {
      await setClientContactPersonActive(fetchWithAuth, clientId, contact.id, !contact.isActive);
      toast({
        title: t("clients.toasts.successTitle"),
        description: t(contact.isActive ? "clients.contacts.toasts.deactivated" : "clients.contacts.toasts.activated"),
      });
      await loadPage();
    } catch (cause) {
      setError(errorText(cause, t("clients.contacts.errors.status"), t));
    } finally {
      setBusyId(null);
    }
  }, [busyId, canActivate, canDeactivate, clientId, fetchWithAuth, loadPage, t, toast]);

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget.current;
    if (!target || clientId === null || !canDelete || busyId !== null) return;
    setBusyId(target.id);
    setError(null);
    try {
      await deleteClientContactPerson(fetchWithAuth, clientId, target.id);
      toast({ title: t("clients.toasts.successTitle"), description: t("clients.contacts.toasts.deleted") });
      setDeleteOpen(false);
      deleteTarget.current = null;
      await loadPage();
      if (editingContactId === target.id) {
        setDetail(null);
        setEditingContactId(null);
      setForm(initialClientContactPersonFormValues());
      setFormError(null);
      setMode(canCreate ? "create" : "idle");
      }
    } catch (cause) {
      setError(errorText(cause, t("clients.contacts.errors.delete"), t));
    } finally {
      setBusyId(null);
    }
  }, [busyId, canDelete, clientId, editingContactId, fetchWithAuth, loadPage, t, toast]);

  const columns = useMemo<HubGridColumn<ClientContactPersonSummary>[]>(() => [
    { key: "Name", label: t("clients.contacts.table.name"), sortable: true },
    { key: "CellPhoneNumber", label: t("clients.contacts.table.cellPhone") },
    { key: "IsPrimary", label: t("clients.contacts.table.primary") },
  ], [t]);

  const renderStatus = useCallback((contact: ClientContactPersonSummary) => (
    <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (contact.isActive
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
      {t(contact.isActive ? "clients.status.active" : "clients.status.inactive")}
    </span>
  ), [t]);

  const renderActions = useCallback((contact: ClientContactPersonSummary): ReactNode => {
    const canToggle = contact.isActive ? canDeactivate : canActivate;
    if (!canUpdate && !canToggle && !canDelete) return null;
    return (
      <div className="flex items-center justify-end gap-2">
        {canUpdate && canGetBy ? <button type="button" data-testid={`client-contact-edit-${contact.id}`} disabled={busyId === contact.id || detailLoading} onClick={(event) => { event.stopPropagation(); revealFormIfOutsideViewport(); void beginEdit(contact.id); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t("clients.contacts.actions.edit")} aria-label={t("clients.contacts.actions.edit")}><SquarePen className="h-4 w-4" aria-hidden="true" /></button> : null}
        {canToggle ? <button type="button" disabled={busyId === contact.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(contact); }} className="inline-flex h-8 w-8 items-center justify-center text-foreground hover:text-primary disabled:opacity-50" title={t(contact.isActive ? "clients.actions.deactivate" : "clients.actions.activate")} aria-label={t(contact.isActive ? "clients.actions.deactivate" : "clients.actions.activate")}>{busyId === contact.id ? <Loader2 className="h-4 w-4 animate-spin" /> : contact.isActive ? <PowerOff className="h-4 w-4 text-red-500" aria-hidden="true" /> : <Power className="h-4 w-4 text-green-500" aria-hidden="true" />}</button> : null}
        {canDelete ? <button type="button" disabled={busyId === contact.id} onClick={(event) => { event.stopPropagation(); deleteTarget.current = contact; setDeleteOpen(true); }} className="inline-flex h-8 w-8 items-center justify-center text-destructive hover:text-destructive disabled:opacity-50" title={t("clients.actions.delete")} aria-label={t("clients.actions.delete")}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
      </div>
    );
  }, [beginEdit, busyId, canActivate, canDeactivate, canDelete, canGetBy, canUpdate, detailLoading, revealFormIfOutsideViewport, t, toggleStatus]);

  const pageButtons = useMemo(() => {
    const count = Math.max(1, pageData.totalPages);
    const start = Math.max(1, Math.min(page - 2, count - 4));
    return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  }, [page, pageData.totalPages]);

  if (clientId === null) {
    return <section data-testid="client-contact-persons-unavailable" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]"><h2 className="text-lg font-semibold text-foreground">{t("clients.contacts.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("clients.contacts.errors.clientRequired")}</p></section>;
  }

  if (!isHydrating && isAuthenticated && !canRead) {
    return <section data-testid="client-contact-persons-forbidden" role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{t("clients.contacts.errors.forbidden")}</section>;
  }

    const canSubmit = mode === "create" ? canCreate : mode === "edit" && canUpdate;
    const fieldsDisabled = submitting || detailLoading || mode === "idle";
    const field = (key: keyof ClientContactPersonFormValues, labelKey: string, maxLength: number, required = false, type = "text") => (
      <Field key={key} inputRef={key === "name" ? firstFieldRef : undefined} label={t(labelKey)} value={form[key] as string} onChange={(value) => updateField(key, value)} disabled={fieldsDisabled} required={required} maxLength={maxLength} type={type} testId={"client-contact-" + key} />
    );
    return (
      <section data-testid="client-contact-person-panel" className="space-y-4">
        {error ? <p role="alert" data-testid="client-contact-error" className="rounded-sm border border-destructive/40 bg-card p-4 text-sm text-destructive">{error}<button type="button" onClick={() => void loadPage()} className="ml-3 underline">{t("clients.contacts.actions.retry")}</button></p> : null}
        {canCreate || canUpdate ? <section data-testid="client-contact-inline-form-panel" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t(mode === "edit" ? "clients.contacts.actions.edit" : mode === "create" ? "clients.contacts.actions.new" : "clients.contacts.form.selectToEdit")}</h2>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button type="button" disabled aria-describedby="client-contact-csv-unavailable" title={t("clients.bulk.upload.unavailable")} className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-card px-3 text-sm font-medium text-muted-foreground opacity-70"><Upload className="h-4 w-4" aria-hidden="true" />{t("clients.contacts.bulk.label")}</button>
              {canCreate ? <button type="button" data-testid="client-contact-new" disabled={detailLoading || submitting} onClick={beginCreate} className="inline-flex h-9 items-center gap-2 rounded-sm border border-primary/50 bg-card px-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{t("clients.actions.add")}</button> : null}
            </div>
            {detailLoading ? <p role="status" className="w-full text-sm text-muted-foreground">{t("clients.contacts.loading")}</p> : null}
          </div>
          <span id="client-contact-csv-unavailable" className="sr-only">{t("clients.bulk.upload.unavailable")}</span>
          <form onSubmit={(event) => void submitForm(event)} className="space-y-5" data-testid="client-contact-form" noValidate>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {field("name", "clients.contacts.form.name", CLIENT_CONTACT_NAME_MAX_LENGTH, true)}
              {field("email", "clients.contacts.form.email", CLIENT_CONTACT_EMAIL_MAX_LENGTH, true, "email")}
              <div data-testid="client-contact-status" className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">{t("clients.contacts.table.status")}</span>
                <span className="flex min-h-10 items-center text-sm text-muted-foreground">{detail ? t(detail.isActive ? "clients.status.active" : "clients.status.inactive") : "—"}</span>
              </div>
              {field("phoneNumber", "clients.contacts.form.phone", CLIENT_CONTACT_PHONE_MAX_LENGTH)}
              {field("cellPhoneNumber", "clients.contacts.form.cellPhone", CLIENT_CONTACT_PHONE_MAX_LENGTH)}
              <div className="flex min-h-10 items-center">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                  <HubSwitch checked={form.hasCellPhoneWhatsapp} onCheckedChange={(value) => updateField("hasCellPhoneWhatsapp", value)} disabled={fieldsDisabled} testId="client-contact-whatsapp" />
                  <span>{t("clients.contacts.form.cellPhoneWhatsapp")}</span>
                </label>
              </div>
              {field("jobTitle", "clients.contacts.form.jobTitle", CLIENT_CONTACT_JOB_TITLE_MAX_LENGTH)}
              {field("department", "clients.contacts.form.department", CLIENT_CONTACT_DEPARTMENT_MAX_LENGTH)}
              <div className="flex min-h-10 items-center">
                {(!detail || detail.isActive) ? <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                  <HubSwitch checked={form.isPrimary} onCheckedChange={(value) => updateField("isPrimary", value)} disabled={fieldsDisabled} testId="client-contact-primary" />
                  <span>{t("clients.contacts.form.isPrimary")}</span>
                </label> : null}
              </div>
            </div>
            {formError ? <p role="alert" data-testid="client-contact-form-error" className="rounded-sm border border-destructive/40 bg-card p-3 text-sm text-destructive">{formError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={cancelForm} disabled={submitting || detailLoading || mode === "idle"} className="inline-flex h-10 items-center rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50">{t("clients.actions.cancel")}</button>
              <button type="submit" disabled={!canSubmit || fieldsDisabled} className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("clients.actions.save")}</button>
            </div>
          </form>
        </section> : null}
        {canRead ? <HubGrid
            title={t("clients.contacts.title")}
            subtitle={t("clients.contacts.subtitle")}
            columns={columns}
            items={pageData.items}
            renderRowCells={(contact) => [contact.name, contact.cellPhoneNumber || "—", t(contact.isPrimary ? "clients.contacts.value.yes" : "clients.contacts.value.no")]}
            renderStatus={renderStatus}
            statusColumnLabel={t("clients.contacts.table.status")}
            renderActions={renderActions}
            actionsColumnLabel={t("clients.contacts.table.actions")}
            rowDensity={rowDensity}
            densityOptions={[{ key: "compact", label: t("clients.grid.density.slow") }, { key: "medium", label: t("clients.grid.density.medium") }, { key: "expanded", label: t("clients.grid.density.expanded") }]}
            onDensityChange={setRowDensity}
            sortBy="Name"
            sortDirection={sortDirection}
            onSort={() => { setSortDirection((current) => current === "asc" ? "desc" : "asc"); setPage(1); }}
            statusFilter={status}
            statusFilterOptions={[{ value: "all", label: t("clients.filters.all") }, { value: "active", label: t("clients.filters.active") }, { value: "inactive", label: t("clients.filters.inactive") }]}
            onStatusFilterChange={(value) => { setStatus(value as ClientContactStatusFilter); setPage(1); }}
            statusFilterLabel={t("clients.filters.statusLabel")}
            searchValue={search}
            onSearchChange={(value) => { setSearch(value); setPage(1); }}
            searchPlaceholder={t("clients.contacts.filters.search")}
            loading={loading}
            loadingText={t("clients.contacts.loading")}
            emptyText={t("clients.contacts.empty")}
            pageCaption={t("hubgrid.itemsLabel", { count: pageData.totalItems })}
            page={page}
            totalPages={Math.max(1, pageData.totalPages)}
            pageButtons={pageButtons}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={[...CLIENT_CONTACT_PAGE_SIZE_OPTIONS]}
            onPageSizeChange={(value) => { setPageSize(value); setPage(1); }}
            paginationPreviousLabel={t("clients.pagination.previous")}
            paginationNextLabel={t("clients.pagination.next")}
            paginationPageLabel={t("clients.pagination.page")}
            paginationPerPageLabel={t("clients.pagination.perPage")}
            getRowKey={(contact) => contact.id}
          /> : <div role="status" className="rounded-sm border border-border bg-surface p-6 text-sm text-muted-foreground">{t("clients.contacts.loading")}</div>}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={(open) => { if (busyId === null) setDeleteOpen(open); }}
          title={t("clients.contacts.deleteConfirm.title")}
          description={t("clients.contacts.deleteConfirm.description", { name: deleteTarget.current?.name ?? "" })}
          confirmLabel={t("clients.actions.delete")}
          cancelLabel={t("clients.actions.cancel")}
          onConfirm={() => void confirmDelete()}
        />
      </section>
    );
}
