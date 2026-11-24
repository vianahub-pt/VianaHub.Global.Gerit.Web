import { closeSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export function acquireE2ERunLock({ lockPath = resolve(tmpdir(), "vianahub-gerit-web-e2e.lock"), root, pid = process.pid } = {}) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Another Gerit Web E2E run owns the shared port and artifact lock.");
    throw error;
  }

  try {
    writeFileSync(descriptor, JSON.stringify({ pid, root, startedAt: new Date().toISOString() }), "utf8");
  } catch (error) {
    closeSync(descriptor);
    unlinkSync(lockPath);
    throw error;
  }

  let released = false;
  return {
    lockPath,
    release() {
      if (released) return;
      closeSync(descriptor);
      unlinkSync(lockPath);
      released = true;
    },
  };
}
