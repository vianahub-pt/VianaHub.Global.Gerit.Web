import { execFileSync } from "node:child_process";

const expectedRepository = "vianahub-pt/VianaHub.Global.Gerit.Web";
const shaPattern = /^[a-f0-9]{40}$/i;
const structuralSyncCiOnlyFiles = new Set([
  "scripts/e2e/select-capabilities.mjs",
  "scripts/e2e/structural-sync.mjs",
  "tests/e2e/impact-classifier.test.mjs",
]);

function normalizeFileList(files) {
  return files.map((file) => String(file).replaceAll("\\", "/").trim()).filter(Boolean).sort();
}

function sameFileList(left, right) {
  return left.length === right.length && left.every((file, index) => file === right[index]);
}

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
    mergeBase: run(["merge-base", baseSha, headSha]),
    baseTree: run(["rev-parse", "--verify", `${baseSha}^{tree}`]),
    headTree: run(["rev-parse", "--verify", `${headSha}^{tree}`]),
    changedFiles: run(["diff", "--name-only", baseSha, headSha]).split(/\r?\n/).filter(Boolean),
    mergeBaseChangedFiles: run(["diff", "--name-only", `${baseSha}...${headSha}`]).split(/\r?\n/).filter(Boolean),
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

  if (!Array.isArray(context.changedFiles)) {
    throw new Error("Structural sync validation failed: changed-file list is missing.");
  }
  const eventFiles = normalizeFileList(context.changedFiles);
  if (new Set(eventFiles).size !== eventFiles.length) {
    throw new Error("Structural sync validation failed: changed-file list contains duplicates.");
  }

  const gitEvidence = getGitEvidence(baseSha, headSha);
  if (gitEvidence.isAncestor !== true) {
    throw new Error("Structural sync validation failed: develop is not an ancestor of main.");
  }
  if (gitEvidence.mergeBase !== baseSha) {
    throw new Error("Structural sync validation failed: merge-base does not match the PR base SHA.");
  }
  if (!gitEvidence.baseTree || !gitEvidence.headTree) {
    throw new Error("Structural sync validation failed: Git tree evidence is missing.");
  }
  if (!Array.isArray(gitEvidence.changedFiles) || !Array.isArray(gitEvidence.mergeBaseChangedFiles)) {
    throw new Error("Structural sync validation failed: Git changed-file evidence is missing.");
  }

  const treeDiffFiles = normalizeFileList(gitEvidence.changedFiles);
  const mergeBaseDiffFiles = normalizeFileList(gitEvidence.mergeBaseChangedFiles);
  if ((treeDiffFiles.length === 0) !== (gitEvidence.baseTree === gitEvidence.headTree)) {
    throw new Error("Structural sync validation failed: tree hashes do not match the Git file diff.");
  }
  if (new Set(treeDiffFiles).size !== treeDiffFiles.length || new Set(mergeBaseDiffFiles).size !== mergeBaseDiffFiles.length ||
      !sameFileList(eventFiles, mergeBaseDiffFiles) || !sameFileList(treeDiffFiles, mergeBaseDiffFiles)) {
    throw new Error("Structural sync validation failed: PR file list does not match both Git diff ranges.");
  }

  const disallowedFiles = treeDiffFiles.filter((file) => !structuralSyncCiOnlyFiles.has(file));
  if (disallowedFiles.length > 0) {
    throw new Error("Structural sync validation failed: non-CI-only changes are present (" + disallowedFiles.join(", ") + ").");
  }

  return { candidate: true, verified: true, changedFiles: treeDiffFiles };
}
