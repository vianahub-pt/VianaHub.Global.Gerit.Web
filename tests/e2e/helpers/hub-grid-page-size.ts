import { expect, type Page, type Request } from "@playwright/test";

const pageSizeName = /^(per page|por página|por pagina)$/i;

function isPageSizeRequest(request: Request, resource: string, pageSize: number) {
  const url = new URL(request.url());
  return request.method() === "GET" &&
    (url.pathname === "/api/gerit/v1/" + resource + "/paged/" ||
      url.pathname === "/api/gerit/v1/" + resource + "/paged") &&
    url.searchParams.get("PageSize") === String(pageSize);
}

export async function selectHubGridPageSize(page: Page, pageSize: number): Promise<Request> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error("HubGrid page size must be a positive integer.");
  }

  const resource = new URL(page.url()).pathname.split("/").filter(Boolean)[0];
  if (!resource) throw new Error("Cannot determine the current HubGrid resource from the page URL.");

  const combobox = page.getByRole("combobox", { name: pageSizeName });
  await expect(combobox).toBeVisible();
  await combobox.click();
  await expect(page.getByRole("listbox")).toBeVisible();

  const option = page.getByRole("option", { name: String(pageSize), exact: true });
  await option.scrollIntoViewIfNeeded();
  await expect(option).toBeVisible();

  // Attach after opening the list and immediately before the selection; earlier requests already
  // emitted their request event and are therefore excluded. Each call awaits its own response.
  const freshRequests: Request[] = [];
  const recordFreshRequest = (request: Request) => {
    if (isPageSizeRequest(request, resource, pageSize)) freshRequests.push(request);
  };
  page.on("request", recordFreshRequest);
  try {
    await option.click();
    await expect(combobox).toHaveText(String(pageSize));
    await expect.poll(() => freshRequests.length).toBeGreaterThan(0);
  } finally {
    page.off("request", recordFreshRequest);
  }
  await expect(combobox).toHaveText(String(pageSize));

  const request = freshRequests[0];
  if (!request) throw new Error("HubGrid did not emit a fresh page-size GET request.");
  const response = await request.response();
  expect(response, "HubGrid page-size GET must receive a response").not.toBeNull();
  expect(response!.ok(), "HubGrid page-size GET must succeed").toBe(true);
  return request;
}
