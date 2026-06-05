"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { WorkspaceShell } from "@/shared/layout";
import { useToast } from "@/shared/feedback";
import { logError } from "@/core/logger/client-logger";
import { normalizeClient, normalizeClientError } from "@/domains/operations/clients/client-utils";
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

export function ClientsCreatePage() {
  const { fetchWithAuth } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [clientFormState, setClientFormState] = useState<ClientFormState>(initialClientFormState);
  const [submitting, setSubmitting] = useState(false);

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

  const showIndividualFields = isIndividualType(resolvedClientType ?? undefined);
  const showCompanyFields = isCompanyType(resolvedClientType ?? undefined);

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
        // Fallback: basic name validation from individual fields
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

        const response = await fetchWithAuth("/api/gerit/v1/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responsePayload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          const normalized = normalizeClientError(responsePayload, t("clients.errors.save"));
          const err = new Error(normalized.message);
          if (normalized.errorId) {
            (err as any).errorId = normalized.errorId;
          }
          throw err;
        }
        const normalized = normalizeClient(responsePayload);
        if (normalized) {
          toast({
            title: t("clients.toasts.successTitle"),
            description: t("clients.toasts.created"),
          });
          setTimeout(() => {
            void router.replace(`/clients-details/${normalized.id}/`);
          }, 1500);
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
                onClick={() => router.push("/clients/")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-[#94a5b4] transition-colors hover:bg-[#f0f4f8] hover:text-[#08aee5] dark:hover:bg-[#1a2a36] dark:hover:text-[#08aee5]"
                title={t("clients.actions.back")}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold text-[#0f172a] dark:text-white sm:text-3xl">
                  {t("clients.form.newTitle")}
                </h1>
                <p className="mt-1 text-sm uppercase tracking-[0.3em] text-[#7aa4c0] dark:text-[#84a0c0]">
                  {t("clients.detail.helper")}
                </p>
              </div>
            </div>
          </div>

          {/* ---------- Form ---------- */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            {/* Client type selector */}
            <div className="rounded-sm border border-[#dfe6ed]/80 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-[#132131] dark:bg-[#0d161f]">
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
                className="inline-flex items-center gap-2 rounded-sm border border-[#c9d2e0] bg-white px-6 py-2.5 text-sm font-semibold text-[#1f2f3f] transition-colors hover:border-[#08aee5] hover:text-[#08aee5] dark:border-[#203040] dark:bg-[#0c1721] dark:text-[#8da7b4] dark:hover:border-[#08aee5] dark:hover:text-[#08aee5]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("clients.actions.back")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-sm bg-[#08aee5] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0695c5] disabled:opacity-50 dark:bg-[#11b7ff] dark:hover:bg-[#08aee5]"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("clients.actions.save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </WorkspaceShell>
  );
}
