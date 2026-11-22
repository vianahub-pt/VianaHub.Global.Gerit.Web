import type { useAuth } from "@/platform/auth";
import { ClientApiError } from "./client-api";
import {
  normalizeAddressTypes, normalizeClientAddressDetail, normalizeClientAddressPage,
  type AddressTypeOption, type ClientAddressDetail, type ClientAddressPage, type ClientAddressPayload,
} from "./client-address-contract";

type ClientFetcher = ReturnType<typeof useAuth>["fetchWithAuth"];
function assertId(value: number, name: string) { if (!Number.isInteger(value) || value <= 0) throw new Error("Invalid " + name + "."); }
function path(clientId: number, addressId?: number) {
  assertId(clientId, "Client ID");
  const base = "/api/gerit/v1/clients/" + clientId + "/addresses";
  if (addressId === undefined) return base;
  assertId(addressId, "Client address ID");
  return base + "/" + addressId;
}
function message(body: unknown) {
  if (typeof body !== "object" || body === null) return "Client address request failed.";
  const item = body as Record<string, unknown>;
  if (typeof item.errors === "object" && item.errors !== null) for (const value of Object.values(item.errors as Record<string, unknown>)) {
    if (Array.isArray(value)) { const found = value.find((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())); if (found) return found; }
  }
  for (const value of [item.message, item.error, item.title]) if (typeof value === "string" && value.trim()) return value;
  return "Client address request failed.";
}
async function request(fetchWithAuth: ClientFetcher, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchWithAuth(url, init);
  if (!response) throw new Error("Authenticated request was not available.");
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new ClientApiError(response.status, message(body));
  return body;
}
export async function getClientAddressPage(fetchWithAuth: ClientFetcher, clientId: number, query: URLSearchParams): Promise<ClientAddressPage> {
  const page = normalizeClientAddressPage(await request(fetchWithAuth, path(clientId) + "/paged?" + query.toString(), { method: "GET", cache: "no-store" }));
  if (!page) throw new Error("Invalid Client address page response.");
  return page;
}
export async function getClientAddressDetail(fetchWithAuth: ClientFetcher, clientId: number, addressId: number): Promise<ClientAddressDetail> {
  const detail = normalizeClientAddressDetail(await request(fetchWithAuth, path(clientId, addressId), { method: "GET", cache: "no-store" }), clientId);
  if (!detail || detail.id !== addressId) throw new Error("Invalid Client address detail response.");
  return detail;
}
export async function getAddressTypes(fetchWithAuth: ClientFetcher): Promise<AddressTypeOption[]> {
  const options = normalizeAddressTypes(await request(fetchWithAuth, "/api/gerit/v1/address-types", { method: "GET", cache: "no-store" }));
  if (!options) throw new Error("Invalid address type catalog response.");
  return options;
}
export async function createClientAddress(fetchWithAuth: ClientFetcher, clientId: number, payload: ClientAddressPayload): Promise<number> {
  const body = await request(fetchWithAuth, path(clientId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (typeof body !== "object" || body === null || !Number.isInteger((body as Record<string, unknown>).id) || ((body as Record<string, unknown>).id as number) <= 0) throw new Error("Invalid Client address creation response.");
  return (body as { id: number }).id;
}
export async function updateClientAddress(fetchWithAuth: ClientFetcher, clientId: number, addressId: number, payload: ClientAddressPayload): Promise<void> {
  if (await request(fetchWithAuth, path(clientId, addressId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) !== true) throw new Error("Client address update was not confirmed.");
}
export async function setClientAddressActive(fetchWithAuth: ClientFetcher, clientId: number, addressId: number, active: boolean): Promise<void> {
  const operation = active ? "activate" : "deactivate";
  if (await request(fetchWithAuth, path(clientId, addressId) + "/" + operation, { method: "PATCH" }) !== true) throw new Error("Client address lifecycle update was not confirmed.");
}
export async function deleteClientAddress(fetchWithAuth: ClientFetcher, clientId: number, addressId: number): Promise<void> {
  if (await request(fetchWithAuth, path(clientId, addressId), { method: "DELETE" }) !== true) throw new Error("Client address deletion was not confirmed.");
}
export async function bulkUploadClientAddresses(fetchWithAuth: ClientFetcher, clientId: number, file: File): Promise<void> {
  const form = new FormData(); form.append("file", file);
  if (await request(fetchWithAuth, path(clientId) + "/bulk-upload", { method: "POST", body: form }) !== true) throw new Error("Client address import was not confirmed.");
}
