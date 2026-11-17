import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authenticateFromLogin } from "./helpers/auth";

const equipmentMenuLabel = /^(equipment types|tipos de equipamento|tipos de equipo)$/i;
const resourcesMenuLabel = /^(teams and resources|equipas e recursos|equipes e recursos|equipos y recursos)$/i;
const nameLabel = /^(name|nome|nombre)$/i;
const descriptionLabel = /^(description|descrição|descripción|descripcion)$/i;
const searchLabel = /^(search by name or description|pesquisar por nome ou descrição|buscar por nombre o descripción)$/i;

interface ApiResult { status: number; body: unknown }

async function api(page: Page, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ requestMethod, requestPath, requestBody }) => {
    const raw = localStorage.getItem("gerit.auth.session.v1");
    const session = raw ? JSON.parse(raw) as { accessToken?: string } : {};
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: {
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(requestBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  }, { requestMethod: method, requestPath: path, requestBody: body });
}

async function installVisualPointer(page: Page) {
  await page.addInitScript((showPointer: boolean) => {
    if (!showPointer) return;
    const install = () => {
      const pointer = document.createElement("div");
      pointer.id = "gerit-e2e-pointer";
      pointer.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;border:2px solid #ff3b30;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:#ff3b3040";
      document.body.appendChild(pointer);
      document.addEventListener("pointermove", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }, process.env.E2E_VISUAL === "true");
}

test("EquipmentTypes CRUD, lifecycle, CSV and deterministic cleanup", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const unique = `E2E-EQT-${randomUUID()}`;
  const createdNames = [`${unique}-ui`, `${unique}-csv`];
  let primaryId: number | null = null;
  const httpEvidence: Record<string, number> = {};
  const cleanupEvidence: Array<{ id: number; deleteStatus?: number; getStatus?: number }> = [];
  let residualCount = 0;

  try {
    await installVisualPointer(page);
    await authenticateFromLogin(page);
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    const section = sidebar.getByRole("button", { name: resourcesMenuLabel });
    if (await section.getAttribute("aria-expanded") === "false") await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await sidebar.getByRole("link", { name: equipmentMenuLabel }).click();
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    await expect(page.getByTestId("equipment-types-page-root")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await page.getByRole("button", { name: /add|adicionar|añadir/i }).click();
    await expect(page).toHaveURL(/\/equipment-types\/new\/$/);
    await expect(page.getByTestId("equipment-types-create-page-root")).toBeVisible();
    await page.getByLabel(nameLabel).fill(createdNames[0]);
    await page.getByRole("textbox", { name: descriptionLabel }).fill(`${unique} description`);
    const createResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/equipment-types");
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    const created = await createResponse;
    httpEvidence.create = created.status();
    expect(httpEvidence.create).toBe(201);
    const createdBody = await created.json() as { id?: unknown };
    expect(Number.isInteger(createdBody.id)).toBe(true);
    if (typeof createdBody.id !== "number") throw new Error("EquipmentTypes create response has no ID.");
    primaryId = createdBody.id;
    await expect(page).toHaveURL(new RegExp(`/equipment-types/${primaryId}/$`));
    await expect(page.getByTestId("equipment-type-details-page-root")).toBeVisible();
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/equipment-types/${primaryId}`)).body).toMatchObject({ id: primaryId, name: createdNames[0], isActive: true });

    await page.getByRole("textbox", { name: descriptionLabel }).fill(`${unique} updated`);
    const updateResponse = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith(`/equipment-types/${primaryId}/`));
    await page.getByRole("button", { name: /save|guardar|salvar/i }).click();
    httpEvidence.update = (await updateResponse).status();
    expect(httpEvidence.update).toBe(204);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/equipment-types/${primaryId}`)).body).toMatchObject({ description: `${unique} updated` });

    const deactivateResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/equipment-types/${primaryId}/deactivate/`));
    await page.getByRole("button", { name: /deactivate|desativar/i }).click();
    httpEvidence.deactivate = (await deactivateResponse).status();
    expect(httpEvidence.deactivate).toBe(200);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/equipment-types/${primaryId}`)).body).toMatchObject({ isActive: false });
    const activateResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/equipment-types/" + primaryId + "/activate/"));
    await page.getByRole("button", { name: /activate|ativar/i }).click();
    httpEvidence.activate = (await activateResponse).status();
    expect(httpEvidence.activate).toBe(200);
    await expect.poll(async () => (await api(page, "GET", `/api/gerit/v1/equipment-types/${primaryId}`)).body).toMatchObject({ isActive: true });

    await page.getByRole("button", { name: /back|voltar/i }).click();
    await expect(page).toHaveURL(/\/equipment-types\/$/);
    const search = page.getByPlaceholder(searchLabel);
    await search.fill(unique);
    await expect(page.getByRole("row", { name: new RegExp(createdNames[0]) })).toBeVisible();

    const csvInput = page.locator("#equipment-types-csv-upload");
    await expect(csvInput).toBeAttached();
    const csv = `Name;Description\r\n${createdNames[1]};${unique} csv description\r\n`;
    const uploadResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.replace(/\/$/, "") === "/api/gerit/v1/equipment-types/bulk-upload");
    await csvInput.setInputFiles({ name: "equipment-types-e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const uploadResponse = await uploadResponsePromise;
    httpEvidence.csvImport = uploadResponse.status();
    expect(httpEvidence.csvImport).toBe(200);
    expect(await uploadResponse.json()).toBe(true);
    const paged = await api(page, "GET", `/api/gerit/v1/equipment-types/paged?Search=${encodeURIComponent(unique)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`);
    httpEvidence.csvPersistenceList = paged.status;
    expect(paged.status).toBe(200);
    expect((paged.body as { items?: Array<{ name: string }> }).items?.some((item) => item.name === createdNames[1])).toBe(true);

    const deleteResponsePromise = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname.endsWith(`/equipment-types/${primaryId}/`));
    await page.getByRole("row", { name: new RegExp(createdNames[0]) }).getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete|eliminar|excluir/i }).click();
    const deleteResponse = await deleteResponsePromise;
    httpEvidence.delete = deleteResponse.status();
    expect(httpEvidence.delete).toBe(200);
    httpEvidence.postDeleteGet = (await api(page, "GET", "/api/gerit/v1/equipment-types/" + primaryId)).status;
    expect(httpEvidence.postDeleteGet).toBe(410);
  } finally {
    if (page.url() !== "about:blank") {
      const searchResult = await api(page, "GET", `/api/gerit/v1/equipment-types/paged?Search=${encodeURIComponent(unique)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`).catch(() => null);
      if (searchResult?.status !== 200) throw new Error("EquipmentTypes cleanup could not list this run's unique prefix.");
      const matches = searchResult?.status === 200 && typeof searchResult.body === "object" && searchResult.body !== null && Array.isArray((searchResult.body as { items?: unknown }).items)
        ? (searchResult.body as { items: Array<{ id: number; name: string }> }).items.filter((item) => createdNames.includes(item.name)) : [];
      for (const item of matches) {
        const current = await api(page, "GET", "/api/gerit/v1/equipment-types/" + item.id).catch(() => ({ status: 0, body: null }));
        if (current.status === 410) {
          cleanupEvidence.push({ id: item.id, getStatus: 410 });
          continue;
        }
        if (current.status !== 200) throw new Error("EquipmentTypes cleanup could not determine its temporary record state.");
        const deleted = await api(page, "DELETE", "/api/gerit/v1/equipment-types/" + item.id).catch(() => null);
        cleanupEvidence.push({ id: item.id, deleteStatus: deleted?.status });
        if (deleted?.status !== 200) throw new Error("EquipmentTypes test cleanup did not confirm DELETE 200.");
        const gone = await api(page, "GET", "/api/gerit/v1/equipment-types/" + item.id).catch(() => ({ status: 0, body: null }));
        cleanupEvidence[cleanupEvidence.length - 1].getStatus = gone.status;
        if (gone.status !== 410) throw new Error("EquipmentTypes test cleanup could not verify GET 410.");
      }
      const remaining = await api(page, "GET", `/api/gerit/v1/equipment-types/paged?Search=${encodeURIComponent(unique)}&PageNumber=1&PageSize=100&SortBy=Name&SortDirection=asc`).catch(() => null);
      if (remaining?.status !== 200) throw new Error("EquipmentTypes cleanup could not verify the final inventory.");
      const residuals = remaining?.status === 200 && typeof remaining.body === "object" && remaining.body !== null && Array.isArray((remaining.body as { items?: unknown }).items)
        ? (remaining.body as { items: Array<{ id: number; name: string }> }).items.filter((item) => createdNames.includes(item.name)) : [];
      residualCount = residuals.length;
      if (residuals.length > 0) throw new Error("EquipmentTypes test left records from its own unique prefix.");
    }
    await testInfo.attach("equipment-types-http-cleanup-evidence", {
      body: Buffer.from(JSON.stringify({
        uniquePrefix: unique,
        http: httpEvidence,
        cleanup: cleanupEvidence,
        residualCount,
      }, null, 2)),
      contentType: "application/json",
    });
  }
});
