const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const serverPath = path.join(__dirname, 'agentic-supervisor-mcp.js');
const child = spawn(process.execPath, [serverPath], { cwd: path.resolve(path.dirname(serverPath), '..'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const lines = readline.createInterface({ input: child.stdout });
const pending = new Map();
const stderr = [];
child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP request timed out: ${method}`)); }, 4000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function main() {
try {
  const init = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'agentic-fixture', version: '1' } });
  assert.equal(init.result?.serverInfo?.name, 'agentic-supervisor');
  assert.equal(init.result?.protocolVersion, '2025-11-25');
  const listing = await request('tools/list');
  assert.deepEqual(listing.result.tools.map(({ name }) => name).sort(), ['get_status', 'resume_request', 'start_request']);
  const status = await request('tools/call', { name: 'get_status', arguments: {} });
  assert.ok(status.result?.structuredContent);
  const invalidStart = await request('tools/call', { name: 'start_request', arguments: { request_envelope: { request_id: 'bad' } } });
  assert.equal(invalidStart.result?.isError, true);
  const envelopeFields = [1, 'req-0123456789abcdef0123456789abcdef', new Date().toISOString(), 'VianaHub.Global.Gerit.Web', 'feature', 'Synthetic contact user@example.com', 'codex-desktop'];
  const digest = require('node:crypto').createHash('sha256').update(envelopeFields.map((value) => Buffer.from(String(value), 'utf8').toString('base64')).join('.'), 'utf8').digest('hex');
  const invalidPii = await request('tools/call', { name: 'start_request', arguments: { request_envelope: { schema_version: 1, request_id: envelopeFields[1], received_at: envelopeFields[2], target_repository: envelopeFields[3], request_type_hint: envelopeFields[4], user_requirement_verbatim: envelopeFields[5], source: envelopeFields[6], content_sha256: digest } } });
  assert.equal(invalidPii.result?.isError, true);
  const invalidResume = await request('tools/call', { name: 'resume_request', arguments: { request_id: 'bad' } });
  assert.equal(invalidResume.result?.isError, true);
  const unknown = await request('tools/call', { name: 'run_shell', arguments: { command: 'whoami' } });
  assert.equal(unknown.result?.isError, true);

  const repoRoot = path.resolve(__dirname, '..');
  const fixtureParent = path.join(repoRoot, `.agentic-mcp-fixtures-${crypto.randomUUID()}`);
  const fixtureRoot = path.join(fixtureParent, 'VianaHub.Global.Gerit.Web');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  try {
    for (const relative of ['AGENTS.md', 'docs/agentic', 'scripts/agentic-common.ps1', 'scripts/agentic-loop.ps1', 'scripts/agentic-vnext-lifecycle.ps1', 'scripts/agentic-start.ps1', 'scripts/agentic-resume.ps1', 'scripts/agentic-status.ps1', 'scripts/agentic-supervisor-mcp.js', '.codex/agents', 'agentic/prompts']) {
      fs.cpSync(path.join(repoRoot, relative), path.join(fixtureRoot, relative), { recursive: true, force: true });
    }
    for (const directory of ['agentic/state', 'agentic/journal']) fs.mkdirSync(path.join(fixtureRoot, directory), { recursive: true });
    const { spawnSync } = require('node:child_process');
    const init = spawnSync('git', ['-C', fixtureRoot, 'init', '--initial-branch=fixture', '--quiet'], { encoding: 'utf8', windowsHide: true });
    assert.equal(init.status, 0, `isolated git fixture setup failed: ${init.stderr}`);
    const originalBranchResult=spawnSync('git',['-C',fixtureRoot,'branch','--show-current'],{encoding:'utf8',windowsHide:true});
    const originalBranch=originalBranchResult.stdout.trim();
    const isolated = spawn(process.execPath, [path.join(fixtureRoot, 'scripts', 'agentic-supervisor-mcp.js')], {
      cwd: fixtureRoot, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    const isolatedLines = readline.createInterface({ input: isolated.stdout });
    const isolatedPending = new Map();
    const isolatedErrors = [];
    isolated.stderr.on('data', (chunk) => isolatedErrors.push(chunk.toString('utf8')));
    isolatedLines.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (isolatedPending.has(message.id)) { isolatedPending.get(message.id)(message); isolatedPending.delete(message.id); }
    });
    let isolatedId = 1;
    const isolatedRequest = (method, params = {}) => {
      const id = isolatedId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { isolatedPending.delete(id); reject(new Error(`isolated MCP request timed out: ${method}`)); }, 65000);
        isolatedPending.set(id, (message) => { clearTimeout(timer); resolve(message); });
        isolated.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    };
    try {
      const isolatedInit = await isolatedRequest('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'agentic-isolated-fixture', version: '1' } });
      assert.equal(isolatedInit.result?.serverInfo?.name, 'agentic-supervisor');
      const requestId = 'req-1123456789abcdef0123456789abcdef';
      const fields = [1, requestId, new Date().toISOString(), 'VianaHub.Global.Gerit.Web', 'feature', 'Synthetic infrastructure start fixture.', 'codex-desktop'];
      const envelope = {
        schema_version: fields[0], request_id: fields[1], received_at: fields[2], target_repository: fields[3],
        request_type_hint: fields[4], user_requirement_verbatim: fields[5], source: fields[6],
        content_sha256: crypto.createHash('sha256').update(fields.map((value) => Buffer.from(String(value), 'utf8').toString('base64')).join('.'), 'utf8').digest('hex'),
      };
      const started = await isolatedRequest('tools/call', { name: 'start_request', arguments: { request_envelope: envelope } });
      if (!started.result?.structuredContent) {
        const statePath = path.join(fixtureRoot, 'agentic/state/loop-state.json');
        const checkpoint = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : 'missing';
        throw new Error(`MCP start failed ${JSON.stringify(started)}; checkpoint=${checkpoint}`);
      }
      assert.equal(started.result?.structuredContent?.request_id, requestId, `${JSON.stringify(started)} state=${fs.existsSync(path.join(fixtureRoot,'agentic/state/loop-state.json'))?fs.readFileSync(path.join(fixtureRoot,'agentic/state/loop-state.json'),'utf8'):'missing'}`);
      assert.ok(['REQUEST_ACCEPTED', 'PREFLIGHT_PREPARING', 'PREFLIGHT_ANALYZING', 'FAILED'].includes(started.result?.structuredContent?.state));
      assert.equal(started.result?.isError, undefined);
      const initialStatePath = path.join(fixtureRoot, 'agentic/state/loop-state.json');
      const initialDeadline = Date.now() + 15000;
      let initialCheckpoint;
      while (Date.now() < initialDeadline) {
        if (fs.existsSync(initialStatePath)) {
          initialCheckpoint = JSON.parse(fs.readFileSync(initialStatePath, 'utf8'));
          if (initialCheckpoint.request_id === requestId && initialCheckpoint.state === 'FAILED') break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(initialCheckpoint?.state, 'FAILED', 'valid start_request must finish its isolated no-origin fetch with a persisted FAILED checkpoint');
      const stored = fs.readFileSync(path.join(fixtureRoot, 'agentic/state/requests', `${requestId}.json`));
      const statePath = path.join(fixtureRoot, 'agentic/state/loop-state.json');
      const blockedState = {
        schema_version: 2, request_id: requestId, goal_id: requestId,
        request_envelope_path: `agentic/state/requests/${requestId}.json`,
        request_envelope_sha256: envelope.content_sha256,
        request_envelope_file_sha256: crypto.createHash('sha256').update(stored).digest('hex'),
        request_type_hint: 'feature', base_branch: 'develop', branch: 'pending-preflight', origin_branch: 'expected-original-branch',
        state: 'BLOCKED', pending_action: 'synthetic external preflight dependency', pending_phase: 'PREFLIGHT_ANALYZING',
      };
      fs.writeFileSync(statePath, `${JSON.stringify(blockedState, null, 2)}\n`, 'utf8');
      fs.writeFileSync(path.join(fixtureRoot, 'agentic/journal/current.md'), [
        '# Agentic journal', '', `- goal_id: ${requestId}`, '- branch: pending-preflight', '- base_branch: develop', '- started_at: 2026-01-01T00:00:00Z', '',
      ].join('\n'), 'utf8');
      const resumed = await isolatedRequest('tools/call', { name: 'resume_request', arguments: { request_id: requestId } });
      assert.equal(resumed.result?.structuredContent?.request_id, requestId);
      assert.equal(resumed.result?.structuredContent?.state, 'BLOCKED');
      const currentBranch = spawnSync('git', ['-C', fixtureRoot, 'branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
      assert.equal(currentBranch.status, 0);
      assert.equal(currentBranch.stdout.trim(), originalBranch, 'isolated start/resume fixture must preserve branch identity');
      process.stdout.write('MCP_FIXTURES: PASS initialize, narrow tools, status, invalid input, valid start/resume handoff, no-shell surface\n');
    } finally {
      isolated.kill();
    }
  } finally {
    const resolvedParent = path.resolve(fixtureParent);
    if (!resolvedParent.startsWith(`${repoRoot}${path.sep}`)) throw new Error('isolated fixture cleanup path escaped workspace');
    fs.rmSync(resolvedParent, { recursive: true, force: true });
  }
} catch (error) {
  process.stderr.write(`${error.message}\n${stderr.join('')}`);
  process.exitCode = 1;
} finally {
  child.kill();
}
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
