export interface ActionDetailResponse {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface ActionCreateFormState {
  name: string;
  description: string;
}

export interface ActionUpdateFormState {
  description: string;
}

export interface ActionUpdatePayload {
  description: string;
}

export const emptyActionCreateFormState: ActionCreateFormState = {
  name: "",
  description: "",
};

export function normalizeActionDetail(payload: unknown): ActionDetailResponse | null {
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.id !== "number" ||
    typeof candidate.name !== "string" ||
    !candidate.name ||
    (typeof candidate.description !== "string" && candidate.description !== null) ||
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

export function isActionForRoute(
  action: ActionDetailResponse | null,
  actionId: number | null,
): action is ActionDetailResponse {
  return action !== null && actionId !== null && action.id === actionId;
}

export function toActionUpdateFormState(action: ActionDetailResponse): ActionUpdateFormState {
  return {
    description: action.description ?? "",
  };
}

export function toActionUpdatePayload(description: string): ActionUpdatePayload {
  return { description };
}

export function isLatestActionRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
