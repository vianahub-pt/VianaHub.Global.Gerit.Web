export type ClientAddressStatusFilter = "all" | "active" | "inactive";
export type ClientAddressSortField = "Street" | "City" | "PostalCode" | "CountryCode";

export interface ClientAddressSummary {
  id: number;
  addressTypeName: string | null;
  countryCode: string | null;
  street: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ClientAddressDetail extends ClientAddressSummary {
  clientId: number;
  addressTypeId: number;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  createdAt: string;
}

export interface ClientAddressPage {
  items: ClientAddressSummary[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AddressTypeOption { id: number; name: string; isActive: boolean; }

export interface ClientAddressFormValues {
  addressTypeId: string;
  countryCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  district: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  note: string;
  isPrimary: boolean;
}

export interface ClientAddressPayload {
  addressTypeId: number;
  countryCode: string;
  street: string;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  district: string | null;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  isPrimary: boolean;
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nullableString = (value: unknown): string | null => typeof value === "string" ? value : null;
const numeric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function normalizeClientAddressSummary(value: unknown): ClientAddressSummary | null {
  const item = record(value);
  if (!item || !Number.isInteger(item.id) || typeof item.isActive !== "boolean" || typeof item.isPrimary !== "boolean") return null;
  return {
    id: item.id as number,
    addressTypeName: nullableString(item.addressTypeName),
    countryCode: nullableString(item.countryCode),
    street: nullableString(item.street),
    isPrimary: item.isPrimary,
    isActive: item.isActive,
  };
}

export function normalizeClientAddressDetail(value: unknown, expectedClientId: number): ClientAddressDetail | null {
  const item = record(value);
  const summary = normalizeClientAddressSummary(value);
  if (!item || !summary || item.clientId !== expectedClientId || !Number.isInteger(item.addressTypeId) || typeof item.createdAt !== "string") return null;
  return {
    ...summary,
    clientId: expectedClientId,
    addressTypeId: item.addressTypeId as number,
    streetNumber: nullableString(item.streetNumber),
    complement: nullableString(item.complement),
    neighborhood: nullableString(item.neighborhood),
    city: nullableString(item.city),
    district: nullableString(item.district),
    postalCode: nullableString(item.postalCode),
    latitude: numeric(item.latitude),
    longitude: numeric(item.longitude),
    note: nullableString(item.note),
    createdAt: item.createdAt,
  };
}

export function normalizeClientAddressPage(value: unknown): ClientAddressPage | null {
  const page = record(value);
  if (!page || !Array.isArray(page.items)) return null;
  const items = page.items.map(normalizeClientAddressSummary);
  if (items.some((item) => item === null) ||
      !Number.isInteger(page.pageNumber) || !Number.isInteger(page.pageSize) ||
      !Number.isInteger(page.totalItems) || !Number.isInteger(page.totalPages)) return null;
  return { items: items as ClientAddressSummary[], pageNumber: page.pageNumber as number, pageSize: page.pageSize as number, totalItems: page.totalItems as number, totalPages: page.totalPages as number };
}

export function normalizeAddressTypes(value: unknown): AddressTypeOption[] | null {
  if (!Array.isArray(value)) return null;
  const result: AddressTypeOption[] = [];
  for (const raw of value) {
    const item = record(raw);
    if (!item || !Number.isInteger(item.id) || typeof item.name !== "string" || typeof item.isActive !== "boolean") return null;
    result.push({ id: item.id as number, name: item.name, isActive: item.isActive });
  }
  return result;
}

export function buildClientAddressQuery(input: { search: string; status: ClientAddressStatusFilter; page: number; pageSize: number; sortBy: ClientAddressSortField; sortDirection: "asc" | "desc" }): URLSearchParams {
  const query = new URLSearchParams({ Search: input.search.trim(), PageNumber: String(input.page), PageSize: String(input.pageSize), SortBy: input.sortBy, SortDirection: input.sortDirection });
  if (input.status !== "all") query.set("IsActive", String(input.status === "active"));
  return query;
}

export function initialClientAddressFormValues(): ClientAddressFormValues {
  return { addressTypeId: "", countryCode: "", street: "", streetNumber: "", complement: "", neighborhood: "", city: "", district: "", postalCode: "", latitude: "", longitude: "", note: "", isPrimary: false };
}

export function clientAddressFormFromDetail(detail: ClientAddressDetail): ClientAddressFormValues {
  return { addressTypeId: String(detail.addressTypeId), countryCode: detail.countryCode ?? "", street: detail.street ?? "", streetNumber: detail.streetNumber ?? "", complement: detail.complement ?? "", neighborhood: detail.neighborhood ?? "", city: detail.city ?? "", district: detail.district ?? "", postalCode: detail.postalCode ?? "", latitude: detail.latitude === null ? "" : String(detail.latitude), longitude: detail.longitude === null ? "" : String(detail.longitude), note: detail.note ?? "", isPrimary: detail.isPrimary };
}

export function validateClientAddressForm(form: ClientAddressFormValues, validAddressTypeIds: ReadonlySet<number>): string | null {
  if (!Number.isInteger(Number(form.addressTypeId)) || !validAddressTypeIds.has(Number(form.addressTypeId))) return "addressTypeRequired";
  if (!form.street.trim()) return "streetRequired";
  if (form.street.trim().length > 200) return "streetMaximumLength";
  if (form.streetNumber.length > 20) return "streetNumberMaximumLength";
  if (form.complement.length > 100) return "complementMaximumLength";
  if (form.neighborhood.length > 100) return "neighborhoodMaximumLength";
  if (!form.city.trim()) return "cityRequired";
  if (form.city.trim().length > 100) return "cityMaximumLength";
  if (form.district.length > 100) return "districtMaximumLength";
  if (!form.postalCode.trim()) return "postalCodeRequired";
  if (form.postalCode.trim().length > 20) return "postalCodeMaximumLength";
  if (!/^[A-Za-z0-9]{2}$/.test(form.countryCode.trim())) return "countryCodeInvalid";
  if (form.note.length > 500) return "noteMaximumLength";
  const latEmpty = form.latitude.trim() === "";
  const lonEmpty = form.longitude.trim() === "";
  if (latEmpty !== lonEmpty) return "coordinatesPairRequired";
  if (!latEmpty) {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return "latitudeInvalid";
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "longitudeInvalid";
  }
  return null;
}

export function toClientAddressPayload(form: ClientAddressFormValues): ClientAddressPayload {
  const optional = (value: string) => value.trim() || null;
  const latitude = form.latitude.trim() === "" ? null : Number(form.latitude);
  const longitude = form.longitude.trim() === "" ? null : Number(form.longitude);
  return {
    addressTypeId: Number(form.addressTypeId),
    countryCode: form.countryCode.trim().toUpperCase(),
    street: form.street.trim(),
    streetNumber: optional(form.streetNumber),
    complement: optional(form.complement),
    neighborhood: optional(form.neighborhood),
    city: form.city.trim(),
    district: optional(form.district),
    postalCode: form.postalCode.trim(),
    latitude,
    longitude,
    note: optional(form.note),
    isPrimary: form.isPrimary,
  };
}
