import { execFileSync } from "node:child_process";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSelectionPlan } from "./ci-selection.mjs";

const shaPattern = /^[0-9a-f]{40,64}$/i;
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;
const forceFullRegression = process.env.FULL_REGRESSION === "true";

if (!shaPattern.test(baseSha ?? "") || !shaPattern.test(headSha ?? "")) {
  throw new Error("BASE_SHA and HEAD_SHA must be full commit SHAs.");
}

let changedFiles = [];
if (!forceFullRegression) {
  const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRD", "-z", `${baseSha}...${headSha}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  changedFiles = output.split("\0").filter(Boolean);
}

const plan = createSelectionPlan({ baseSha, headSha, changedFiles, forceFullRegression });
const outputDirectory = resolve(".e2e-plan");
await mkdir(outputDirectory);
await writeFile(resolve(outputDirectory, "selection.json"), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });

const outputs = [
  `capabilities=${JSON.stringify(plan.capabilities)}`,
  `e2e_required=${plan.capabilities.length > 0}`,
  `plan_digest=${plan.planDigest}`,
].join("\n") + "\n";
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputs, "utf8");

console.log(`[E2E selection] ${plan.reason}; capabilities=${plan.capabilities.join(",") || "none"}; fullRegression=${plan.fullRegression}`);
