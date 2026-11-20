import type { useAuth } from "@/platform/auth";
import {
  isClientUpdateSuccess,
  normalizeCatalogOptions,
  normalizeClientDetail,
  normalizeClientPage,
  normalizeCreatedClientId,
  normalizeStatusDefinitionOptions,
  type CatalogOption,
  type ClientDetail,
  type ClientPage,
  type ClientPayload,
  type StatusDefinitionOption,
} from "./client-contract";

type ClientFetcher = ReturnType<typeof useAuth>["fetchWithAuth"];

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
  }
}

function apiMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as Record<string, unknown>;
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

async function requestJson(fetchWithAuth: ClientFetcher, path: string, init?: RequestInit): Promise<{ response: Response; payload: unknown }> {
  const response = await fetchWithAuth(path, init);
  if (!response) throw new Error("Authenticated request was not available.");
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new ClientApiError(response.status, apiMessage(payload, "Client request failed."));
  return { response, payload };
}

export async function getClientPage(fetchWithAuth: ClientFetcher, query: URLSearchParams): Promise<ClientPage> {
  const { payload } = await requestJson(fetchWithAuth, `/api/gerit/v1/clients/paged?${query.toString()}`, { method: "GET", cache: "no-store" });
  const page = normalizeClientPage(payload);
  if (!page) throw new Error("Invalid Client page response.");
  return page;
}

export async function getClientDetail(fetchWithAuth: ClientFetcher, clientId: number): Promise<ClientDetail> {
  const { payload } = await requestJson(fetchWithAuth, `/api/gerit/v1/clients/${clientId}`, { method: "GET", cache: "no-store" });
  const detail = normalizeClientDetail(payload);
  if (!detail || detail.id !== clientId) throw new Error("Invalid Client detail response.");
  return detail;
}

export interface ClientCatalogs {
  partyTypes: CatalogOption[];
  acquisitionSources: CatalogOption[];
  statusDefinitions: StatusDefinitionOption[];
}

export async function getClientCatalogs(fetchWithAuth: ClientFetcher): Promise<ClientCatalogs> {
  const paths = [
    "/api/gerit/v1/party-types",
    "/api/gerit/v1/acquisition-source-types",
    "/api/gerit/v1/status-domains",
    "/api/gerit/v1/status-definitions",
  ];
  const results = await Promise.all(paths.map((path) => requestJson(fetchWithAuth, path, { method: "GET", cache: "no-store" })));
  const partyTypes = normalizeCatalogOptions(results[0].payload);
  const acquisitionSources = normalizeCatalogOptions(results[1].payload);
  const statusDomains = normalizeCatalogOptions(results[2].payload);
  const definitions = normalizeStatusDefinitionOptions(results[3].payload);
  if (!partyTypes || !acquisitionSources || !statusDomains || !definitions) throw new Error("Invalid Client catalog response.");
  const clientDomain = statusDomains.find((item) => item.id === 1 && item.isActive);
  if (!clientDomain) throw new Error("Client status domain is unavailable.");
  return {
    partyTypes: partyTypes.filter((item) => item.isActive && (item.id === 1 || item.id === 2)),
    acquisitionSources: acquisitionSources.filter((item) => item.isActive),
    statusDefinitions: definitions.filter((item) => item.statusDomainId === clientDomain.id && item.isActive),
  };
}

export async function createClient(fetchWithAuth: ClientFetcher, payload: ClientPayload): Promise<number> {
  const { payload: responseBody } = await requestJson(fetchWithAuth, "/api/gerit/v1/clients/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const id = normalizeCreatedClientId(responseBody);
  if (!id) throw new Error("Invalid Client creation response.");
  return id;
}

export async function updateClient(fetchWithAuth: ClientFetcher, clientId: number, payload: ClientPayload): Promise<void> {
  const { payload: responseBody } = await requestJson(fetchWithAuth, `/api/gerit/v1/clients/${clientId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!isClientUpdateSuccess(responseBody)) throw new Error("Client update was not confirmed.");
}

export async function setClientActive(fetchWithAuth: ClientFetcher, clientId: number, active: boolean): Promise<void> {
  const operation = active ? "activate" : "deactivate";
  const { payload } = await requestJson(fetchWithAuth, `/api/gerit/v1/clients/${clientId}/${operation}`, { method: "PATCH" });
  if (payload !== true) throw new Error("Client lifecycle update was not confirmed.");
}

export async function deleteClient(fetchWithAuth: ClientFetcher, clientId: number): Promise<void> {
  const { payload } = await requestJson(fetchWithAuth, `/api/gerit/v1/clients/${clientId}`, { method: "DELETE" });
  if (payload !== true) throw new Error("Client deletion was not confirmed.");
}
