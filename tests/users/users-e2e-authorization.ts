export const USERS_QA_API_ORIGIN = "https://gerit-api.vianahub.pt";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authorizeUsersQaMutations(apiBaseUrl: string | undefined, perRunApproval: string | undefined) {
  if (!apiBaseUrl) throw new Error("GERIT_API_BASE_URL must explicitly identify the Users QA API.");
  let target: URL;
  try {
    target = new URL(apiBaseUrl);
  } catch {
    throw new Error("GERIT_API_BASE_URL is invalid; refusing Users mutations.");
  }

  if (target.origin !== USERS_QA_API_ORIGIN || target.pathname !== "/" || target.search || target.hash || target.username || target.password) {
    throw new Error(`Users mutations are permitted only against the exact QA origin ${USERS_QA_API_ORIGIN}.`);
  }
  if (!perRunApproval || !UUID_PATTERN.test(perRunApproval)) {
    throw new Error("Set E2E_USERS_QA_MUTATION_APPROVAL to a new UUID for this explicitly authorized QA run.");
  }

  return { target: target.origin };
}
