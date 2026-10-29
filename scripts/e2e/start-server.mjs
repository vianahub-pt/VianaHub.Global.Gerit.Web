import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const host = "127.0.0.1";
const port = 3100;
const baseURL = `http://${host}:${port}`;
const isWindows = process.platform === "win32";
const e2eBuildDir = ".next-e2e";
const e2eEnvironment = { ...process.env, NEXT_DIST_DIR: e2eBuildDir };

function getWindowsPortOwner() {
  const escapedRoot = repoRoot.replaceAll("'", "''");
  const command = `
    $listener = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess)
      [pscustomobject]@{ pid = $listener.OwningProcess; name = $process.Name; repo = [bool]($process.CommandLine -and $process.CommandLine.Contains('${escapedRoot}')) } | ConvertTo-Json -Compress
    }
  `;
  try {
    const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

function getRepoNextProcesses() {
  const escapedRoot = repoRoot.replaceAll("'", "''");
  if (isWindows) {
    const command = `
      Get-CimInstance Win32_Process | Where-Object {
        $_.Name -notmatch '^(powershell|pwsh)\\.exe$' -and $_.CommandLine -and
        $_.CommandLine.Contains('${escapedRoot}') -and
        $_.CommandLine -match '(next[^\\r\\n]*(start|build)|npm[^\\r\\n]*run[^\\r\\n]*(start|build))'
      } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; name = $_.Name } } | ConvertTo-Json -Compress
    `;
    try {
      const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!output) return [];
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
    return output.split(/\r?\n/).flatMap((line) => {
      if (!line.includes(repoRoot) || !/(next[^\n]*(start|build)|npm[^\n]*run[^\n]*(start|build))/.test(line)) return [];
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      return match ? [{ pid: Number(match[1]), name: match[2].split(/\s+/)[0] }] : [];
    });
  } catch {
    return [];
  }
}

function assertPortIsFree() {
  return new Promise((resolveCheck, rejectCheck) => {
    const probe = createServer();
    probe.once("error", () => {
      const owner = isWindows ? getWindowsPortOwner() : null;
      const details = owner
        ? ` PID ${owner.pid} (${owner.name}, repo match: ${owner.repo ? "yes" : "no"})`
        : " owner process could not be identified";
      rejectCheck(new Error(`[E2E] Port ${port} is already in use at ${host}:${port};${details}. No process was stopped or reused.`));
    });
    probe.listen(port, host, () => probe.close(() => resolveCheck()));
  });
}

function assertNoRepoNextProcesses() {
  const processes = getRepoNextProcesses();
  if (processes.length > 0) {
    const summary = processes.map(({ pid, name }) => `${name} PID ${pid}`).join(", ");
    throw new Error(`[E2E] Cannot build/start while this checkout has another Next start/build process that may use ${e2eBuildDir}: ${summary}. No process was stopped.`);
  }
}

function assertE2EBuildValid() {
  const requiredFiles = ["BUILD_ID", "prerender-manifest.json", "routes-manifest.json", "required-server-files.json"];
  const missing = requiredFiles.filter((file) => !existsSync(resolve(repoRoot, e2eBuildDir, file)));
  if (missing.length > 0) {
    throw new Error(`[E2E] Production build ${e2eBuildDir} is invalid; missing ${missing.join(", ")}. Run the isolated E2E build before starting the server.`);
  }
  console.log(`[E2E] production build validated: ${e2eBuildDir}`);
}

async function checkReadinessOnce() {
  const loginStartedAt = performance.now();
  const loginResponse = await fetch(`${baseURL}/login/`, { signal: AbortSignal.timeout(2_000) });
  if (loginResponse.status !== 200) {
    return { ready: false, reason: `GET /login/ returned HTTP ${loginResponse.status}` };
  }
  const loginHTML = await loginResponse.text();
  if (!loginHTML.includes('data-testid="login-screen-root"')) {
    return { ready: false, reason: "GET /login/ HTML did not contain login-screen-root" };
  }
  console.log(`[E2E] /login/ HTTP 200 with login-screen-root: ${((performance.now() - loginStartedAt) / 1000).toFixed(2)}s`);

  const proxyStartedAt = performance.now();
  const proxyResponse = await fetch(`${baseURL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5_000),
  });
  if (proxyResponse.status !== 400) {
    return { ready: false, reason: `controlled POST /api/auth/login returned HTTP ${proxyResponse.status}, expected 400` };
  }
  console.log(`[E2E] login proxy HTTP 400: ${((performance.now() - proxyStartedAt) / 1000).toFixed(2)}s`);
  return { ready: true, reason: "" };
}

async function waitForReadiness(child) {
  const startedAt = performance.now();
  const deadline = startedAt + 15_000;
  let lastReason = "server is starting";
  let rejectOnExit;
  const serverExit = new Promise((_, reject) => { rejectOnExit = reject; });
  child.once("exit", (code, signal) => {
    rejectOnExit(new Error(`[E2E] next start exited before readiness (code ${code ?? "unknown"}, signal ${signal ?? "none"}).`));
  });

  while (performance.now() < deadline) {
    try {
      const result = await checkReadinessOnce();
      if (result.ready) {
        console.log(`[E2E] application readiness complete: ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
        return;
      }
      lastReason = result.reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "request error";
    }
    await Promise.race([
      new Promise((resolveDelay) => setTimeout(resolveDelay, 250)),
      serverExit,
    ]);
  }
  throw new Error(`[E2E] Production application readiness failed within 15s: ${lastReason}.`);
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWindows) {
    try {
      const command = `
        $root = ${child.pid}
        $all = @(Get-CimInstance Win32_Process)
        $ids = [System.Collections.Generic.List[int]]::new()
        $ids.Add($root)
        $changed = $true
        while ($changed) {
          $changed = $false
          foreach ($item in $all) {
            $processIdValue = [int]$item.ProcessId
            if ($ids.Contains([int]$item.ParentProcessId) -and -not $ids.Contains($processIdValue)) { $ids.Add($processIdValue); $changed = $true }
          }
        }
        for ($index = $ids.Count - 1; $index -ge 0; $index--) { Stop-Process -Id $ids[$index] -Force -ErrorAction SilentlyContinue }
      `;
      execFileSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

let child;
let shuttingDown = false;
async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child) await stopChild(child);
  process.exitCode = exitCode;
}

try {
  await assertPortIsFree();
  assertNoRepoNextProcesses();

  if (process.env.E2E_ALLOW_EXISTING_STORAGE_STATE !== "1") {
    await rm(resolve(repoRoot, "playwright/.auth/user.json"), { force: true });
    console.log("[E2E] stale storageState cleared: yes");
  }

  assertE2EBuildValid();
  console.log(`[E2E] using prebuilt artifact: ${e2eBuildDir}`);

  assertNoRepoNextProcesses();
  await assertPortIsFree();

  const serverStartedAt = performance.now();
  const command = isWindows ? "cmd.exe" : "npm";
  const args = isWindows
    ? ["/d", "/s", "/c", "npm run start -- -H 127.0.0.1 -p 3100"]
    : ["run", "start", "--", "-H", "127.0.0.1", "-p", "3100"];
  child = spawn(command, args, {
    cwd: repoRoot,
    detached: !isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    env: e2eEnvironment,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", () => {
    void shutdown(1);
  });
  child.once("exit", (code) => {
    if (!shuttingDown) process.exitCode = code ?? 1;
  });

  await waitForReadiness(child);
  console.log(`[E2E] production server start complete: ${((performance.now() - serverStartedAt) / 1000).toFixed(2)}s`);

  process.on("SIGINT", () => { void shutdown(0); });
  process.on("SIGTERM", () => { void shutdown(0); });
  await new Promise((resolveExit) => child.once("exit", resolveExit));
} catch (error) {
  if (child) await stopChild(child);
  console.error(error instanceof Error ? error.message : "[E2E] Production server startup failed.");
  process.exitCode = 1;
}
