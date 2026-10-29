import { test as base, expect, type Page } from "@playwright/test";

export interface ActionData {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface ApiResult {
  status: number;
  body: unknown;
}

interface ActionFixture {
  createdActionIds: number[];
  registerCreatedAction: (id: number) => void;
  markActionDeleted: (id: number) => void;
  createAction: (name: string, description?: string) => Promise<ActionData>;
}

function safeApiErrors(payload: unknown, secrets: string[]) {
  if (typeof payload !== "object" || payload === null) return "";
  const body = payload as { title?: unknown; errors?: unknown };
  const details: string[] = [];
  if (typeof body.title === "string" && body.title.trim()) details.push(body.title.trim());
  if (typeof body.errors === "object" && body.errors !== null) {
    for (const [field, messages] of Object.entries(body.errors as Record<string, unknown>)) {
      const values = Array.isArray(messages) ? messages : [messages];
      for (const value of values) {
        if (typeof value === "string" && value.trim()) details.push(`${field}: ${value.trim()}`);
      }
    }
  }
  return secrets.reduce((safe, secret) => secret ? safe.split(secret).join("[redacted]") : safe, details.join("; "))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted token]")
    .slice(0, 300);
}

async function authenticatedRequest(page: Page, method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<ApiResult> {
  if (page.url() === "about:blank") await page.goto("/");
  return page.evaluate(async ({ requestMethod, requestPath, requestBody }) => {
    const sessionKey = "gerit.auth.session.v1";
    const rawSession = localStorage.getItem(sessionKey);
    if (!rawSession) throw new Error("The E2E browser has no authenticated Gerit session in storageState.");
    let session = JSON.parse(rawSession) as { accessToken?: unknown; refreshToken?: unknown; tenantId?: unknown };
    if (typeof session.accessToken !== "string") throw new Error("The E2E Gerit session has no access token.");

    const send = (accessToken: string) => fetch(requestPath, {
      method: requestMethod,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(requestBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    });

    let response = await send(session.accessToken);
    if (response.status === 401 && typeof session.refreshToken === "string" && typeof session.tenantId === "number") {
      const refreshResponse = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: session.tenantId, refreshToken: session.refreshToken }),
      });
      const refreshed = await refreshResponse.json().catch(() => null) as unknown;
      if (refreshResponse.ok && typeof refreshed === "object" && refreshed !== null) {
        session = { ...session, ...(refreshed as Record<string, unknown>) };
        localStorage.setItem(sessionKey, JSON.stringify(session));
        if (typeof session.accessToken === "string") response = await send(session.accessToken);
      }
    }
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { requestMethod: method, requestPath: path, requestBody: body });
}

function actionFrom(payload: unknown): ActionData | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as Record<string, unknown>;
  return typeof value.id === "number" && typeof value.name === "string" && typeof value.isActive === "boolean"
    ? { id: value.id, name: value.name, description: typeof value.description === "string" ? value.description : null, isActive: value.isActive }
    : null;
}

export const test = base.extend<ActionFixture>({
  createdActionIds: async ({}, use) => {
    const ids: number[] = [];
    await use(ids);
  },
  registerCreatedAction: async ({ createdActionIds }, use) => {
    await use((id) => {
      if (!createdActionIds.includes(id)) createdActionIds.push(id);
    });
  },
  markActionDeleted: async ({ createdActionIds }, use) => {
    await use((id) => {
      const index = createdActionIds.indexOf(id);
      if (index >= 0) createdActionIds.splice(index, 1);
    });
  },
  createAction: async ({ page, registerCreatedAction }, use) => {
    await use(async (name, description = `E2E managed description for ${name}`) => {
      const createResult = await authenticatedRequest(page, "POST", "/api/gerit/v1/actions/", { name, description });
      const createError = safeApiErrors(createResult.body, [name, description]);
      expect(createResult.status, `Action create must return HTTP 201${createError ? `; ${createError}` : ""}`).toBe(201);
      const createBody = createResult.body as { id?: unknown } | null;
      expect(typeof createBody?.id, "Action create response must contain only its generated ID").toBe("number");
      if (typeof createBody?.id !== "number") throw new Error("The Actions API create response did not contain an ID.");

      registerCreatedAction(createBody.id);
      const detailResult = await authenticatedRequest(page, "GET", `/api/gerit/v1/actions/${createBody.id}`);
      expect(detailResult.status, "Action detail setup request must return HTTP 200").toBe(200);
      const action = actionFrom(detailResult.body);
      expect(action, "Action detail response must match the current contract").not.toBeNull();
      if (!action) throw new Error("The Actions API detail response did not contain a valid Action record.");
      return action;
    });
  },
  page: async ({ page, createdActionIds }, use) => {
    await use(page);
    for (const id of [...createdActionIds].reverse()) {
      try {
        const result = await authenticatedRequest(page, "DELETE", `/api/gerit/v1/actions/${id}`);
        if (result.status !== 200 && result.status !== 404 && result.status !== 410) {
          console.warn(`E2E cleanup for its own Action ID ${id} returned HTTP ${result.status}.`);
        }
      } catch {
        console.warn("E2E cleanup could not reach the Actions API for an Action ID created by this test.");
      }
    }
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("workspace-shell-root"), "Chromium must reuse the authenticated setup storageState").toBeVisible();
});

export { expect };
export type { Page };
