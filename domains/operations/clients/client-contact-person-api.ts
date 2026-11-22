import type { useAuth } from "@/platform/auth";
import { normalizeCreatedClientId } from "./client-contract";
import {
  normalizeClientContactPersonDetail,
  normalizeClientContactPersonPage,
  type ClientContactPersonDetail,
  type ClientContactPersonPage,
  type ClientContactPersonPayload,
} from "./client-contact-person-contract";
import { ClientApiError } from "./client-api";

type ClientFetcher = ReturnType<typeof useAuth>["fetchWithAuth"];

function assertPositiveId(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error("Invalid " + name + ".");
}

function clientContactsPath(clientId: number, contactId?: number): string {
  assertPositiveId(clientId, "Client ID");
  const base = "/api/gerit/v1/clients/" + clientId + "/contacts";
  if (contactId === undefined) return base;
  assertPositiveId(contactId, "Client contact ID");
  return base + "/" + contactId;
}

function apiMessage(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "Client contact request failed.";
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    for (const value of Object.values(candidate.errors as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const message = value.find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (message) return message;
    }
  }
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Client contact request failed.";
}

function apiErrorCode(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  for (const value of [candidate.code, candidate.errorCode, candidate.type]) {
    if (typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{1,100}$/.test(value)) return value;
  }
  if (typeof candidate.extensions === "object" && candidate.extensions !== null) {
    const code = (candidate.extensions as Record<string, unknown>).code;
    if (typeof code === "string" && /^[A-Za-z][A-Za-z0-9_.-]{1,100}$/.test(code)) return code;
  }
  return null;
}

async function requestJson(fetchWithAuth: ClientFetcher, path: string, init?: RequestInit): Promise<{ payload: unknown }> {
  const response = await fetchWithAuth(path, init);
  if (!response) throw new Error("Authenticated request was not available.");
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new ClientApiError(response.status, apiMessage(payload), apiErrorCode(payload));
  return { payload };
}

export async function getClientContactPersonPage(fetchWithAuth: ClientFetcher, clientId: number, query: URLSearchParams): Promise<ClientContactPersonPage> {
  const { payload } = await requestJson(fetchWithAuth, clientContactsPath(clientId) + "/paged?" + query.toString(), { method: "GET", cache: "no-store" });
  const page = normalizeClientContactPersonPage(payload);
  if (!page) throw new Error("Invalid Client contact page response.");
  return page;
}

export async function getClientContactPersonDetail(fetchWithAuth: ClientFetcher, clientId: number, contactId: number): Promise<ClientContactPersonDetail> {
  const { payload } = await requestJson(fetchWithAuth, clientContactsPath(clientId, contactId), { method: "GET", cache: "no-store" });
  const detail = normalizeClientContactPersonDetail(payload, clientId);
  if (!detail || detail.id !== contactId) throw new Error("Invalid Client contact detail response.");
  return detail;
}

export async function createClientContactPerson(fetchWithAuth: ClientFetcher, clientId: number, payload: ClientContactPersonPayload): Promise<number> {
  const { payload: responseBody } = await requestJson(fetchWithAuth, clientContactsPath(clientId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const id = normalizeCreatedClientId(responseBody);
  if (!id) throw new Error("Invalid Client contact creation response.");
  return id;
}

export async function updateClientContactPerson(fetchWithAuth: ClientFetcher, clientId: number, contactId: number, payload: ClientContactPersonPayload): Promise<void> {
  const { payload: responseBody } = await requestJson(fetchWithAuth, clientContactsPath(clientId, contactId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (responseBody !== true) throw new Error("Client contact update was not confirmed.");
}

export async function setClientContactPersonActive(fetchWithAuth: ClientFetcher, clientId: number, contactId: number, active: boolean): Promise<void> {
  const operation = active ? "activate" : "deactivate";
  const { payload } = await requestJson(fetchWithAuth, clientContactsPath(clientId, contactId) + "/" + operation, { method: "PATCH" });
  if (payload !== true) throw new Error("Client contact lifecycle update was not confirmed.");
}

export async function deleteClientContactPerson(fetchWithAuth: ClientFetcher, clientId: number, contactId: number): Promise<void> {
  const { payload } = await requestJson(fetchWithAuth, clientContactsPath(clientId, contactId), { method: "DELETE" });
  if (payload !== true) throw new Error("Client contact deletion was not confirmed.");
}
