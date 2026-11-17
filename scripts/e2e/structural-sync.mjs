import { execFileSync } from "node:child_process";

const expectedRepository = "vianahub-pt/VianaHub.Global.Gerit.Web";
const shaPattern = /^[a-f0-9]{40}$/i;

function readGitEvidence(baseSha, headSha) {
  const run = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  run(["cat-file", "-e", `${baseSha}^{commit}`]);
  run(["cat-file", "-e", `${headSha}^{commit}`]);

  let isAncestor = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseSha, headSha], { stdio: "ignore" });
    isAncestor = true;
  } catch (error) {
    if (error?.status !== 1) throw error;
  }

  return {
    isAncestor,
    baseTree: run(["rev-parse", "--verify", `${baseSha}^{tree}`]),
    headTree: run(["rev-parse", "--verify", `${headSha}^{tree}`]),
    changedFiles: run(["diff", "--name-only", `${baseSha}...${headSha}`]).split(/\r?\n/).filter(Boolean),
  };
}

function requireIdentity(value, name) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Structural sync validation failed: ${name} is missing.`);
  }
  return String(value);
}

function normalizedRepositoryName(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function verifyStructuralSync(context, getGitEvidence = readGitEvidence) {
  const pullRequest = context?.pullRequest;
  const base = pullRequest?.base;
  const head = pullRequest?.head;
  const candidate = context?.eventName === "pull_request" && base?.ref === "develop" && head?.ref === "main";
  if (!candidate) return { candidate: false, verified: false };

  const expectedName = normalizedRepositoryName(expectedRepository);
  const eventName = normalizedRepositoryName(context.repositoryName);
  const payloadName = normalizedRepositoryName(context.repository?.full_name);
  const baseName = normalizedRepositoryName(base?.repo?.full_name);
  const headName = normalizedRepositoryName(head?.repo?.full_name);
  if ([eventName, payloadName, baseName, headName].some((name) => name !== expectedName)) {
    throw new Error("Structural sync validation failed: repository identity does not match the official repository.");
  }

  const eventRepositoryId = requireIdentity(context.repository?.id, "event repository ID");
  const baseRepositoryId = requireIdentity(base?.repo?.id, "base repository ID");
  const headRepositoryId = requireIdentity(head?.repo?.id, "head repository ID");
  if (eventRepositoryId !== baseRepositoryId || eventRepositoryId !== headRepositoryId) {
    throw new Error("Structural sync validation failed: repository IDs do not match.");
  }

  const baseSha = requireIdentity(context.baseSha, "base SHA");
  const headSha = requireIdentity(context.headSha, "head SHA");
  if (!shaPattern.test(baseSha) || !shaPattern.test(headSha) ||
      baseSha.toLowerCase() !== String(base.sha ?? "").toLowerCase() ||
      headSha.toLowerCase() !== String(head.sha ?? "").toLowerCase()) {
    throw new Error("Structural sync validation failed: event SHAs are missing, invalid, or inconsistent.");
  }

  const eventFiles = (context.changedFiles ?? []).map((file) => String(file).trim()).filter(Boolean);
  if (eventFiles.length !== 0) {
    throw new Error("Structural sync validation failed: changed-file list is not empty.");
  }

  const gitEvidence = getGitEvidence(baseSha, headSha);
  if (gitEvidence.isAncestor !== true) {
    throw new Error("Structural sync validation failed: develop is not an ancestor of main.");
  }
  if (!gitEvidence.baseTree || gitEvidence.baseTree !== gitEvidence.headTree) {
    throw new Error("Structural sync validation failed: base and head trees are not identical.");
  }
  if (!Array.isArray(gitEvidence.changedFiles) || gitEvidence.changedFiles.length !== 0) {
    throw new Error("Structural sync validation failed: Git reports changed files.");
  }

  return { candidate: true, verified: true };
}
