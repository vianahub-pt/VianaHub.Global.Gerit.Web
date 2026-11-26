import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";
import { discoverCsvTeamIds, reconcileTeamsRun } from "./helpers/teams-cleanup";
import { selectHubGridPageSize } from "./helpers/hub-grid-page-size";

const nameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripción|descripcion)$/i;
const searchPlaceholder = /^(search by name or description|pesquisar por nome ou descrição|buscar por nome ou descrição|buscar por nombre o descripción)$/i;
const teamsResourcesLabel = /^(teams and resources|equipas e recursos|equipes e recursos|equipos y recursos)$/i;
const teamsMenuLabel = /^(teams|equipas|equipes|equipos)$/i;

async function waitForToastToClear(page: Page) {
  await page.mouse.move(0, 0);
  const openToasts = page.locator('[role="status"][data-state="open"], [role="alert"][data-state="open"]');
  for (const toast of await openToasts.all()) await toast.locator('button[toast-close]').click();
  await expect(openToasts).toHaveCount(0, { timeout: 2_000 });
}

async function installVisualPointer(page: Page) {
  await page.addInitScript((visual) => {
    if (!visual) return;
    const install = () => {
      if (document.getElementById("gerit-e2e-pointer-style")) return;
      const style = document.createElement("style");
      style.id = "gerit-e2e-pointer-style";
      style.textContent = "#gerit-e2e-pointer{position:fixed;z-index:2147483647;left:0;top:0;width:20px;height:20px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);opacity:0;transition:left .12s ease-out,top .12s ease-out,opacity .08s ease;box-shadow:0 0 0 4px rgba(255,59,48,.22)}#gerit-e2e-pointer.visible{opacity:.9}#gerit-e2e-pointer.clicked{animation:gerit-e2e-click .45s ease-out}@keyframes gerit-e2e-click{0%{box-shadow:0 0 0 3px rgba(255,59,48,.45);transform:translate(-50%,-50%) scale(.8)}100%{box-shadow:0 0 0 15px rgba(255,59,48,0);transform:translate(-50%,-50%) scale(1.2)}}";
      document.head.appendChild(style);
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      document.body.appendChild(pointer);
      const movePointer = (x: number, y: number) => {
        pointer.style.left = `${x}px`;
        pointer.style.top = `${y}px`;
        pointer.classList.add("visible");
      };
      document.addEventListener("pointermove", (event) => movePointer(event.clientX, event.clientY), true);
      document.addEventListener("focusin", (event) => {
        const bounds = (event.target as HTMLElement).getBoundingClientRect();
        movePointer(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      }, true);
      document.addEventListener("pointerdown", () => {
        pointer.classList.remove("clicked");
        void pointer.offsetWidth;
        pointer.classList.add("clicked");
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");
}

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
    const response = await fetch(path, {
      method,
      headers: {
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { method, path, body });
}

test("Teams canonical CRUD, status filters, CSV and cleanup", async ({ page }) => {
  test.setTimeout(240_000);
  const createdIds = new Set<number>();
  const unique = randomUUID();
  const teamName = `E2E Team ${unique}`;
  const description = `E2E Description ${unique}`;
  const updatedDescription = `E2E Updated ${unique}`;
  const csvName = `E2E CSV ${unique}`;
  let csvImportAttempted = false;
  const queries: URL[] = [];
  const queryResponses: URL[] = [];
  const statusPatches: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname.startsWith("/api/gerit/v1/teams/")) statusPatches.push(url.pathname);
    if (url.pathname.endsWith("/teams/paged") || url.pathname.endsWith("/teams/paged/")) queries.push(url);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith("/teams/paged") || url.pathname.endsWith("/teams/paged/")) queryResponses.push(url);
  });

  try {
    await installVisualPointer(page);
    await page.goto("/login/", { waitUntil: "domcontentloaded" });
    await authenticateFromLogin(page);
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const teamsSectionButton = sidebar.getByRole("button", { name: teamsResourcesLabel });
    await expect(teamsSectionButton).toBeVisible();
    const expanded = await teamsSectionButton.getAttribute("aria-expanded");
    if (expanded === "false") await teamsSectionButton.click();
    else if (expanded !== "true") throw new Error("Teams and Resources menu does not expose an expansion state.");
    await expect(teamsSectionButton).toHaveAttribute("aria-expanded", "true");
    const teamsLink = sidebar.getByRole("link", { name: teamsMenuLabel });
    await expect(teamsLink).toBeVisible();
    await teamsLink.click();
    await expect(page).toHaveURL(/\/teams\/$/);
    await expect(page.getByTestId("teams-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageNumber")).toBe("1");
    await expect.poll(() => queryResponses.at(-1)?.searchParams.get("PageSize")).toBe("10");
    const pageSize20Request = await selectHubGridPageSize(page, 20);
    expect(new URL(pageSize20Request.url()).searchParams.get("PageSize")).toBe("20");
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageSize")).toBe("20");
    await expect.poll(() => queryResponses.at(-1)?.searchParams.get("PageSize")).toBe("20");
    const pageSize10Request = await selectHubGridPageSize(page, 10);
    expect(new URL(pageSize10Request.url()).searchParams.get("PageSize")).toBe("10");
    await expect.poll(() => queries.at(-1)?.searchParams.get("PageSize")).toBe("10");
    await expect.poll(() => queryResponses.at(-1)?.searchParams.get("PageSize")).toBe("10");

    await page.getByRole("button", { name: /add|adicionar|agregar/i }).click();
    await expect(page).toHaveURL(/\/teams\/new\/?$/);
    await expect(page.getByTestId("teams-create-page-root")).toBeVisible();
    await expect(page.getByTestId("teams-page-root")).toHaveCount(0);
    await page.getByLabel(nameLabel).fill(teamName);
    await page.getByLabel(descriptionLabel).fill(description);
    await waitForToastToClear(page);
    const createResponsePromise = page.waitForResponse((response) => response.status() === 201 && response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/"));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json() as { id?: unknown };
    expect(typeof createBody.id).toBe("number");
    if (typeof createBody.id === "number") createdIds.add(createBody.id);
    expect(createResponse.request().postDataJSON()).toMatchObject({ name: teamName, description, isActive: true });
    await expect(page).toHaveURL(/\/teams\/$/);
    await expect(page.getByTestId("teams-page-root")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /team created successfully|equipa criada com sucesso|equipe criada com sucesso|equipo creado con éxito/i }).first()).toBeVisible();
    await waitForToastToClear(page);

    expect(createBody.id).toEqual(expect.any(Number));
    const row = page.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible();
    const createdDetailResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "GET" && new URL(response.url()).pathname === `/api/gerit/v1/teams/${String(createBody.id)}/`);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/teams/${String(createBody.id)}/?$`));
    await expect(page.getByTestId("team-details-page-root")).toBeVisible();
    await expect(page.getByTestId("team-fields-section")).toBeVisible();
    await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
    await expect(page.getByRole("button", { name: /activate|ativar|activar|deactivate|desativar|desactivar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete|eliminar|excluir/i })).toBeVisible();
    await expect(page.getByLabel(nameLabel)).toHaveValue(teamName);
    await expect(page.getByLabel(descriptionLabel)).toHaveValue(description);
    await expect(page.getByTestId("team-is-active-switch")).toBeChecked();
    const createdDetailResponse = await createdDetailResponsePromise;
    expect(new URL(createdDetailResponse.url()).pathname).toBe(`/api/gerit/v1/teams/${String(createBody.id)}/`);

    await page.getByLabel(nameLabel).fill(`${teamName} edited`);
    await page.getByLabel(descriptionLabel).fill(updatedDescription);
    await page.getByTestId("team-is-active-switch").click();
    await expect(page.getByTestId("team-is-active-switch")).not.toBeChecked();
    expect(statusPatches).toEqual([]);
    await waitForToastToClear(page);
    const updateResponsePromise = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/`));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(204);
    expect(updateResponse.request().postDataJSON()).toMatchObject({ name: `${teamName} edited`, description: updatedDescription, isActive: false });
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`)).body)
      .toMatchObject({ name: `${teamName} edited`, description: updatedDescription, isActive: false });
    expect(statusPatches).toEqual([]);
    await expect(page).toHaveURL(/\/teams\/$/);
    await expect(page.getByRole("status").filter({ hasText: /team updated successfully|equipa atualizada com sucesso|equipe atualizada com sucesso|equipo actualizado con éxito/i }).first()).toBeVisible();
    await waitForToastToClear(page);
    const updatedRow = page.getByRole("row").filter({ hasText: `${teamName} edited` });
    await expect(updatedRow).toBeVisible();
    const statusFilter = page.getByRole("combobox", { name: /status|estado/i }).first();
    await statusFilter.click();
    await page.getByRole("option", { name: /^(inactive|inativo|inativa|inactiva|inactivos|inactivas)$/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("IsActive")).toBe("false");
    await statusFilter.click();
    await page.getByRole("option", { name: /^(active|ativo|ativa|activa|activos|activas)$/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.get("IsActive")).toBe("true");
    await statusFilter.click();
    await page.getByRole("option", { name: /show all|mostrar todos/i }).click();
    await expect.poll(() => queries.at(-1)?.searchParams.has("IsActive")).toBe(false);

    const search = page.getByPlaceholder(searchPlaceholder);
    await search.fill(teamName);
    await expect(updatedRow).toBeVisible();
    await expect.poll(() => queries.at(-1)?.searchParams.get("Search")).toBe(teamName);
    const gridActivateResponsePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/activate/`));
    await updatedRow.getByRole("button", { name: /activate|ativar|activar/i }).click();
    expect((await gridActivateResponsePromise).ok()).toBe(true);
    expect(statusPatches).toEqual([`/api/gerit/v1/teams/${String(createBody.id)}/activate/`]);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`)).body).toMatchObject({ isActive: true });

    const deleteResponsePromise = page.waitForResponse((response) => response.status() === 200 && response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/teams/${String(createBody.id)}/`));
    await updatedRow.click();
    await expect(page).toHaveURL(new RegExp(`/teams/${String(createBody.id)}/?$`));
    await page.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    expect((await deleteResponsePromise).status()).toBe(200);
    const deletedDetail = await api(page, "GET", `/api/gerit/v1/teams/${String(createBody.id)}/`);
    expect([404, 410]).toContain(deletedDetail.status);
    createdIds.delete(createBody.id as number);
    await waitForToastToClear(page);
    await expect(page).toHaveURL(/\/teams\/?$/);

    const csvInput = page.locator('input[type="file"][accept=".csv"]');
    await csvInput.setInputFiles({ name: "teams.txt", mimeType: "text/plain", buffer: Buffer.from("not csv", "utf8") });
    await expect(page.getByText(/select a csv file|selecione um ficheiro csv|seleccione un archivo csv/i).last()).toBeVisible();
    await waitForToastToClear(page);

    const emptyUploadPromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/bulk-upload/"));
    await csvInput.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("Name;Description\n", "utf8") });
    const emptyUpload = await emptyUploadPromise;
    expect(emptyUpload.status()).toBe(400);
    await expect(page.getByRole("alert").last()).toBeVisible();
    await waitForToastToClear(page);

    const csv = `Name;Description\n${csvName};CSV description ${unique}\n`;
    const existingCsvIds = await discoverCsvTeamIds(
      csvName,
      (pageNumber, pageSize) => api(
        page,
        "GET",
        "/api/gerit/v1/teams/paged/?Search=" + encodeURIComponent(csvName) +
          "&PageNumber=" + pageNumber + "&PageSize=" + pageSize + "&SortBy=Name&SortDirection=asc",
      ),
      0,
    );
    expect(existingCsvIds).toEqual([]);
    const uploadResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/teams/bulk-upload/"));
    csvImportAttempted = true;
    await csvInput.setInputFiles({ name: "teams.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);
    await waitForToastToClear(page);
    await search.fill(csvName);
    await expect(page.getByRole("row").filter({ hasText: csvName })).toBeVisible();
  } finally {
    const cleanup = await reconcileTeamsRun({
      knownIds: createdIds,
      csvImportAttempted,
      csvName,
      api: {
        getPage: (pageNumber, pageSize) => api(
          page,
          "GET",
          "/api/gerit/v1/teams/paged/?Search=" + encodeURIComponent(csvName) +
            "&PageNumber=" + pageNumber + "&PageSize=" + pageSize + "&SortBy=Name&SortDirection=asc",
        ),
        deleteById: (id) => api(page, "DELETE", "/api/gerit/v1/teams/" + id + "/").catch(() => null),
        getById: (id) => api(page, "GET", "/api/gerit/v1/teams/" + id + "/").catch(() => null),
      },
    });
    if (cleanup.errors.length > 0) {
      const pending = cleanup.pendingIdentifiers.length > 0
        ? " Pending synthetic identifiers requiring recovery: " + cleanup.pendingIdentifiers.join(", ") + "."
        : "";
      throw new Error("Teams E2E cleanup failed: " + cleanup.errors.join("; ") + "." + pending);
    }
  }
});

test("Teams pagination size remains operable without writes", async ({ page }) => {
  await installVisualPointer(page);
  const observedPageSizes: string[] = [];
  const apiWrites: string[] = [];
  const respondedPageSizes: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/gerit/v1/") && request.method() !== "GET") {
      apiWrites.push(request.method() + " " + url.pathname);
    }
    if (url.pathname.endsWith("/teams/paged/") || url.pathname.endsWith("/teams/paged")) {
      observedPageSizes.push(url.searchParams.get("PageSize") ?? "");
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith("/teams/paged/") || url.pathname.endsWith("/teams/paged")) {
      respondedPageSizes.push(url.searchParams.get("PageSize") ?? "");
    }
  });

  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await authenticateFromLogin(page);
  const sidebar = page.getByTestId("desktop-sidebar");
  const teamsSectionButton = sidebar.getByRole("button", { name: teamsResourcesLabel });
  if (await teamsSectionButton.getAttribute("aria-expanded") === "false") await teamsSectionButton.click();
  await sidebar.getByRole("link", { name: teamsMenuLabel }).click();
  await expect(page.getByTestId("teams-page-root")).toBeVisible();

  await expect.poll(() => observedPageSizes.at(-1)).toBe("10");
  await expect.poll(() => respondedPageSizes.at(-1)).toBe("10");
  const pageSize20Request = await selectHubGridPageSize(page, 20);
  expect(new URL(pageSize20Request.url()).searchParams.get("PageSize")).toBe("20");
  await expect.poll(() => observedPageSizes.at(-1)).toBe("20");
  await expect.poll(() => respondedPageSizes.at(-1)).toBe("20");
  const pageSize10Request = await selectHubGridPageSize(page, 10);
  expect(new URL(pageSize10Request.url()).searchParams.get("PageSize")).toBe("10");
  await expect.poll(() => observedPageSizes.at(-1)).toBe("10");
  await expect.poll(() => respondedPageSizes.at(-1)).toBe("10");
  expect(apiWrites).toEqual([]);
});
