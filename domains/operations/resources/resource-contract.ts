export interface ResourceDetailResponse {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

export interface ResourceCreateFormState {
  name: string;
  description: string;
  isActive: boolean;
}

export interface ResourceUpdateFormState {
  description: string;
  isActive: boolean;
}

export interface ResourceCreatePayload {
  name: string;
  description: string;
  isActive: boolean;
}

export interface ResourceUpdatePayload {
  description: string;
  isActive: boolean;
}

export const emptyResourceCreateFormState: ResourceCreateFormState = {
  name: "",
  description: "",
  isActive: true,
};

export function normalizeResourceDetail(payload: unknown): ResourceDetailResponse | null {
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.id !== "number" ||
    typeof candidate.name !== "string" ||
    !candidate.name ||
    typeof candidate.description !== "string" ||
    typeof candidate.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    isActive: candidate.isActive,
  };
}

export function isResourceForRoute(
  resource: ResourceDetailResponse | null,
  resourceId: number | null,
): resource is ResourceDetailResponse {
  return resource !== null && resourceId !== null && resource.id === resourceId;
}

export function toResourceUpdateFormState(resource: ResourceDetailResponse): ResourceUpdateFormState {
  return {
    description: resource.description,
    isActive: resource.isActive,
  };
}

export function toResourceCreatePayload(name: string, description: string, isActive: boolean): ResourceCreatePayload {
  return { name, description, isActive };
}

export function toResourceUpdatePayload(description: string, isActive: boolean): ResourceUpdatePayload {
  return { description, isActive };
}

export function isLatestResourceRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
