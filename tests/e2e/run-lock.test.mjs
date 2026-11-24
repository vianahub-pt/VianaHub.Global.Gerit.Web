import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireE2ERunLock } from "../../scripts/e2e/run-lock.mjs";

test("E2E run lock serializes worktrees sharing port and artifacts", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "gerit-e2e-lock-test-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const lockPath = join(directory, "run.lock");
  const first = acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-a", pid: 101 });
  assert.throws(() => acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-b", pid: 202 }), /Another Gerit Web E2E run/);
  first.release();
  assert.doesNotThrow(() => acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-b", pid: 202 }).release());
});

test("E2E run lock fails closed for a stale or unverified lock", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "gerit-e2e-lock-stale-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const lockPath = join(directory, "run.lock");
  const owner = acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-a", pid: 101 });
  owner.release();
  const stale = acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-a", pid: 101 });
  assert.throws(() => acquireE2ERunLock({ lockPath, root: "C:\\repo\\worktree-a", pid: 101 }), /Another Gerit Web E2E run/);
  stale.release();
});
