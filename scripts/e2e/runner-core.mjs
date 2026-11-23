export async function runCapabilityLifecycle({
  preflight,
  prepareBuild,
  runPlaywright,
  cleanup,
  isPortFree,
}) {
  let result = { status: "PREFLIGHT_BLOCKED", reason: "preflight-not-run" };
  let playwrightStarted = false;
  try {
    const prepareResult = await preflight("prepare");
    if (!prepareResult.pass) {
      result = { status: "PREFLIGHT_BLOCKED", reason: prepareResult.reason || "prepare-preflight-blocked" };
    } else {
      const buildExitCode = await prepareBuild();
      if (buildExitCode !== 0) {
        result = { status: "E2E_FAIL", reason: "e2e-build-failed" };
      } else {
        const executionResult = await preflight("execution");
        if (!executionResult.pass) {
          result = { status: "PREFLIGHT_BLOCKED", reason: executionResult.reason || "execution-preflight-blocked" };
        } else {
          playwrightStarted = true;
          const playwrightResult = await runPlaywright();
          if (playwrightResult.code !== 0) {
            result = { status: "E2E_FAIL", reason: "selected-playwright-spec-failed", exitCode: playwrightResult.code };
          } else if (playwrightResult.incomplete) {
            result = { status: "E2E_INCOMPLETE", reason: playwrightResult.incomplete };
          } else {
            result = { status: "E2E_PASS", reason: "selected-playwright-spec-passed" };
          }
        }
      }
    }
  } catch (error) {
    result = {
      status: "E2E_FAIL",
      reason: "runner-error",
      error: error instanceof Error ? error.name : "unknown-runner-error",
    };
  } finally {
    let cleanupComplete = false;
    try {
      cleanupComplete = (await cleanup()) === true;
    } catch {
      cleanupComplete = false;
    }
    let portFree = true;
    if (playwrightStarted) {
      try {
        portFree = (await isPortFree()) === true;
      } catch {
        portFree = false;
      }
    }
    if (!cleanupComplete || !portFree) {
      result = {
        status: "CLEANUP_INCOMPLETE",
        reason: !cleanupComplete ? "owned-process-cleanup-failed" : "port-3100-remains-occupied",
      };
    }
  }
  return result;
}
