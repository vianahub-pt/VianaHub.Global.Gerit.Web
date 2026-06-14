"use client";

import clsx from "clsx";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

/* ---------- Individual form state ---------- */

export interface IndividualFormState {
  fullName: string;
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

export const initialIndividualFormState: IndividualFormState = {
  fullName: "",
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

export interface CompanyFormState {
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

export const initialCompanyFormState: CompanyFormState = {
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

export interface ClientFormState {
  clientType: string;
  originType: string;
  isActive: boolean;
  note: string;
  individual: IndividualFormState;
  company: CompanyFormState;
}

export const initialClientFormState: ClientFormState = {
  clientType: "",
  originType: "",
  isActive: true,
  note: "",
  individual: { ...initialIndividualFormState },
  company: { ...initialCompanyFormState },
};

/* ---------- Enum options ---------- */

export interface EnumOption {
  value: string;
  labelKey: string;
  description: string;
}

export const CLIENT_TYPE_OPTIONS: EnumOption[] = [
  { value: "1", labelKey: "clients.enums.clientType.PessoaSingular", description: "Pessoa Singular" },
  { value: "2", labelKey: "clients.enums.clientType.RecibosVerdes", description: "Recibos Verdes" },
  { value: "3", labelKey: "clients.enums.clientType.Freelancer", description: "Freelancer" },
  { value: "4", labelKey: "clients.enums.clientType.PessoaJuridica", description: "Pessoa Jurídica" },
  { value: "5", labelKey: "clients.enums.clientType.SociedadeUnipessoalQuotas", description: "Sociedade Unipessoal por Quotas" },
];

export const ORIGIN_OPTIONS: EnumOption[] = [
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

export const GENDER_OPTIONS = ["Masculino", "Feminino", "Outro"];

export const GENDER_OPTIONS_KEYS: Record<string, string> = {
  Masculino: "clients.form.gender.male",
  Feminino: "clients.form.gender.female",
  Outro: "clients.form.gender.other",
};

export const DOCUMENT_TYPE_OPTIONS = ["CC", "Passaporte", "Outro"];

export const DOCUMENT_TYPE_OPTIONS_KEYS: Record<string, string> = {
  CC: "clients.form.documentType.cc",
  Passaporte: "clients.form.documentType.passport",
  Outro: "clients.form.documentType.other",
};

/* ---------- Client type helpers ---------- */

const INDIVIDUAL_CLIENT_TYPES = new Set([1, 2, 3]);
const COMPANY_CLIENT_TYPES = new Set([4, 5]);

export function isIndividualType(clientType: number | undefined): boolean {
  return typeof clientType === "number" && INDIVIDUAL_CLIENT_TYPES.has(clientType);
}

export function isCompanyType(clientType: number | undefined): boolean {
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

export function ToggleField({
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
      <span className="mb-1.5 block text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
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
          <span className="flex h-7 w-12 items-center rounded-full bg-input px-1 transition-colors peer-checked:bg-primary dark:bg-input dark:peer-checked:bg-primary">
            <span className="h-5 w-5 rounded-full bg-card transition-transform peer-checked:translate-x-5" />
          </span>
          <span className="ml-2 flex items-center text-sm text-foreground dark:text-foreground">
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
  error?: string;
  errorId?: string;
}

export function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  required,
  className,
  error,
  errorId,
}: FormFieldProps) {
  const inputId = errorId || undefined;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && errorId ? `${errorId}-error` : undefined}
        className={clsx(
          error
            ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/55"
            : "",
        )}
      />
      {error && errorId && (
        <p id={`${errorId}-error`} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
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

export function SelectField({
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
      <label className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
