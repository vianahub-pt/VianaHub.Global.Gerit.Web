import { createConnection } from "node:net";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(true));
    socket.setTimeout(250);
  });
}

export async function waitForPortRelease(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortListening(host, port))) return true;
    await delay(100);
  }
  return !(await isPortListening(host, port));
}

export async function stopServerProcess(child, {
  host,
  port,
  isWindows = process.platform === "win32",
  stopWindowsTree,
  graceMs = 5_000,
  forceMs = 2_000,
} = {}) {
  if (!child?.pid) return waitForPortRelease(host, port, graceMs);

  const signal = (force) => {
    if (isWindows) {
      if (typeof stopWindowsTree === "function") stopWindowsTree();
      else child.kill(force ? "SIGKILL" : "SIGTERM");
      return;
    }

    try {
      process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
      try {
        child.kill(force ? "SIGKILL" : "SIGTERM");
      } catch (childError) {
        if (childError?.code !== "ESRCH") throw childError;
      }
    }
  };

  signal(false);
  if (await waitForPortRelease(host, port, graceMs)) return true;

  signal(true);
  return waitForPortRelease(host, port, forceMs);
}
