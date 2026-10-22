'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const PROTOCOL_VERSION = '2025-11-25';
const REPOSITORY_NAME = 'VianaHub.Global.Gerit.Web';
const ROOT = path.resolve(process.cwd());
const REQUEST_ID = /^req-[0-9a-f]{32}$/;
const RECEIVED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const activeSupervisors = new Map();
const SECRET_PATTERNS = [
  /\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/-]{8,}={0,2}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b(?:password|passwd|secret|token|jwt|api[_ -]?key|private[_ -]?key|connection[_ -]?string)\s*[:=]\s*\S+/i,
  /-----BEGIN\s+(?:[A-Z0-9 ]+\s+)?PRIVATE KEY-----/i,
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@/i,
];
const PII_PATTERNS = [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i];

function assertWorkspace() {
  if (path.basename(ROOT).toLowerCase() !== REPOSITORY_NAME.toLowerCase()) {
    throw new Error('MCP server must run from the configured Gerit repository.');
  }
  for (const required of ['AGENTS.md', 'docs/agentic/1-architecture.md', 'scripts/agentic-start.ps1']) {
    if (!fs.existsSync(path.join(ROOT, required))) throw new Error('MCP server workspace validation failed.');
  }
}

function digestEnvelope(envelope) {
  const values = [
    String(envelope.schema_version),
    envelope.request_id,
    envelope.received_at,
    envelope.target_repository,
    envelope.request_type_hint,
    envelope.user_requirement_verbatim,
    envelope.source,
  ];
  return crypto.createHash('sha256').update(values.map((value) => Buffer.from(value, 'utf8').toString('base64')).join('.'), 'utf8').digest('hex');
}

function validateEnvelope(envelope) {
  const fields = ['schema_version', 'request_id', 'received_at', 'target_repository', 'request_type_hint', 'user_requirement_verbatim', 'source', 'content_sha256'];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Request Envelope must be an object.');
  if (Object.keys(envelope).some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(envelope, key))) throw new Error('Request Envelope fields are invalid.');
  if (envelope.schema_version !== 1) throw new Error('Unsupported Request Envelope schema version.');
  if (typeof envelope.request_id !== 'string' || !REQUEST_ID.test(envelope.request_id)) throw new Error('Request Envelope identity is invalid.');
  if (envelope.target_repository !== REPOSITORY_NAME || envelope.source !== 'codex-desktop') throw new Error('Request Envelope target is not trusted.');
  if (!['feature', 'fix', 'hotfix'].includes(envelope.request_type_hint)) throw new Error('Request type hint is invalid.');
  if (typeof envelope.received_at !== 'string' || !RECEIVED_AT.test(envelope.received_at) || Number.isNaN(Date.parse(envelope.received_at))) throw new Error('Request Envelope timestamp must be canonical UTC ISO-8601 with millisecond precision.');
  if (typeof envelope.user_requirement_verbatim !== 'string' || envelope.user_requirement_verbatim.trim().length === 0 || envelope.user_requirement_verbatim.length > 100000) throw new Error('User requirement is missing or exceeds the size limit.');
  if (SECRET_PATTERNS.some((pattern) => pattern.test(envelope.user_requirement_verbatim))) throw new Error('Request Envelope rejected sensitive content; the value was not recorded.');
  if (PII_PATTERNS.some((pattern) => pattern.test(envelope.user_requirement_verbatim))) throw new Error('Request Envelope rejected likely personal data; the value was not recorded.');
  if (typeof envelope.content_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.content_sha256) || digestEnvelope(envelope) !== envelope.content_sha256) throw new Error('Request Envelope hash is invalid.');
  return envelope;
}

function ensureLocalStateDirectory() {
  const stateDir = path.join(ROOT, 'agentic', 'state');
  const requestsDir = path.join(stateDir, 'requests');
  for (const directory of [path.join(ROOT, 'agentic'), stateDir, requestsDir]) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('Request artifact path contains a symbolic link.');
    fs.mkdirSync(directory, { recursive: true });
  }
  return requestsDir;
}

function persistEnvelope(envelope) {
  const requestsDir = ensureLocalStateDirectory();
  const filePath = path.join(requestsDir, `${envelope.request_id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  try {
    const descriptor = fs.openSync(filePath, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error('Request artifact path is unsafe.');
    let existingEnvelope;
    try { existingEnvelope = validateEnvelope(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
    catch { throw new Error('Existing request identity failed integrity validation.'); }
    if (existingEnvelope.content_sha256 !== envelope.content_sha256 || !fs.readFileSync(filePath).equals(bytes)) throw new Error('Request ID already exists with different immutable content.');
  }
  return filePath;
}

function readStatus() {
  const filePath = path.join(ROOT, 'agentic', 'state', 'loop-state.json');
  if (!fs.existsSync(filePath)) return null;
  if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error('Supervisor state path is unsafe.');
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const safe = {
    request_id: typeof state.request_id === 'string' ? state.request_id : null,
    state: typeof state.state === 'string' ? state.state : 'UNKNOWN',
    branch: typeof state.branch === 'string' ? state.branch : null,
    base_branch: typeof state.base_branch === 'string' ? state.base_branch : null,
    updated_at: typeof state.updated_at === 'string' ? state.updated_at : null,
    pending_action: typeof state.pending_action === 'string' ? state.pending_action : null,
    no_changes: state.no_changes === true,
    failure: state.failure_diagnostic && typeof state.failure_diagnostic.message === 'string' ? state.failure_diagnostic.message.replace(/[\r\n]/g, ' ').slice(0, 300) : null,
  };
  return safe;
}

function safeChildEnvironment() {
  const allowed = ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'ProgramData', 'ComSpec', 'CODEX_HOME'];
  const environment = {};
  for (const name of allowed) {
    const actualName = Object.keys(process.env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (actualName && process.env[actualName]) environment[actualName] = process.env[actualName];
  }
  return environment;
}

function sanitizeDiagnostic(value) {
  let text = String(value || '').replace(/[\r\n]+/g, ' ').slice(0, 1000);
  for (const pattern of [...SECRET_PATTERNS, ...PII_PATTERNS]) text = text.replace(pattern, '[REDACTED]');
  return text.slice(0, 300);
}

async function launchSupervisor(resume, requestId) {
  const scriptName = resume ? 'agentic-resume.ps1' : 'agentic-start.ps1';
  const parameter = '-RequestId';
  const scriptPath = path.join(ROOT, 'scripts', scriptName);
  const candidates = process.platform === 'win32' ? ['pwsh.exe', 'powershell.exe'] : ['pwsh'];
  let lastError;
  for (const executable of candidates) {
    try {
      const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, parameter, requestId], {
        cwd: ROOT,
        env: safeChildEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const output = [];
      child.stdout.on('data', (chunk) => { if (output.join('').length < 4000) output.push(chunk.toString('utf8')); });
      child.stderr.on('data', (chunk) => { if (output.join('').length < 4000) output.push(chunk.toString('utf8')); });
      child.agenticDiagnostic = output;
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      activeSupervisors.set(requestId, child);
      child.once('exit', () => { if (activeSupervisors.get(requestId) === child) activeSupervisors.delete(requestId); });
      return child;
    } catch (error) { lastError = error; }
  }
  throw new Error(lastError ? 'Trusted Supervisor Host could not be launched.' : 'PowerShell Supervisor Host is unavailable.');
}

async function waitForAcceptedRequest(requestId, allowedStates, supervisorProcess, previousStatus = null) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const state = readStatus();
    const changedCheckpoint = !previousStatus || state?.updated_at !== previousStatus.updated_at || state?.state !== previousStatus.state;
    if (state && state.request_id === requestId && changedCheckpoint && allowedStates.includes(state.state)) return state;
    if (state && state.request_id === requestId && changedCheckpoint && ['FAILED', 'BLOCKED'].includes(state.state)) return state;
    if (supervisorProcess && supervisorProcess.exitCode !== null) {
      if (state && state.request_id === requestId) return state;
      throw new Error(`Trusted Supervisor Host exited before persisting a checkpoint (exit code ${supervisorProcess.exitCode}). ${sanitizeDiagnostic((supervisorProcess.agenticDiagnostic || []).join(''))}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Supervisor Host did not persist the requested checkpoint in time.');
}

function jsonSchema(type, properties, required) {
  return { type, properties, required, additionalProperties: false };
}

const tools = [
  {
    name: 'start_request',
    description: 'Validates an immutable Request Envelope, persists it once, and starts the trusted Agentic Supervisor Host for this repository.',
    inputSchema: jsonSchema('object', {
      request_envelope: jsonSchema('object', {
        schema_version: { type: 'integer', const: 1 },
        request_id: { type: 'string', pattern: '^req-[0-9a-f]{32}$' },
        received_at: { type: 'string', format: 'date-time' },
        target_repository: { type: 'string', const: REPOSITORY_NAME },
        request_type_hint: { type: 'string', enum: ['feature', 'fix', 'hotfix'] },
        user_requirement_verbatim: { type: 'string', minLength: 1, maxLength: 100000 },
        source: { type: 'string', const: 'codex-desktop' },
        content_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      }, ['schema_version', 'request_id', 'received_at', 'target_repository', 'request_type_hint', 'user_requirement_verbatim', 'source', 'content_sha256']),
    }, ['request_envelope']),
  },
  {
    name: 'resume_request',
    description: 'Resumes the exact persisted execution after the Supervisor validates request, branch, base, specification, journal, and evidence identity.',
    inputSchema: jsonSchema('object', { request_id: { type: 'string', pattern: '^req-[0-9a-f]{32}$' } }, ['request_id']),
  },
  {
    name: 'get_status',
    description: 'Returns sanitized persisted state and evidence references for the current execution or the requested identity.',
    inputSchema: jsonSchema('object', { request_id: { type: 'string', pattern: '^req-[0-9a-f]{32}$' } }, []),
  },
];

async function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
  if (name === 'get_status') {
    if (Object.keys(args).some((key) => key !== 'request_id')) throw new Error('Status arguments are invalid.');
    if (args.request_id !== undefined && (typeof args.request_id !== 'string' || !REQUEST_ID.test(args.request_id))) throw new Error('Request ID is invalid.');
    const status = readStatus();
    if (!status) return { status: 'IDLE', request_id: null };
    if (args.request_id && status.request_id !== args.request_id) throw new Error('No checkpoint exists for that request identity.');
    return status;
  }
  if (name === 'start_request') {
    if (Object.keys(args).length !== 1 || !Object.hasOwn(args, 'request_envelope')) throw new Error('start_request arguments are invalid.');
    const envelope = validateEnvelope(args.request_envelope);
    const existingState = readStatus();
    if (existingState && existingState.request_id === envelope.request_id) {
      const existingPath = path.join(ROOT, 'agentic', 'state', 'requests', `${envelope.request_id}.json`);
      if (!fs.existsSync(existingPath)) throw new Error('Existing request identity failed integrity validation.');
      let persisted;
      try { persisted = validateEnvelope(JSON.parse(fs.readFileSync(existingPath, 'utf8'))); }
      catch { throw new Error('Existing request identity failed integrity validation.'); }
      if (persisted.content_sha256 !== envelope.content_sha256) throw new Error('Request ID already exists with different immutable content.');
      return existingState;
    }
    if (existingState && !['IDLE', 'ALREADY_SATISFIED', 'FAILED', 'WAITING_HUMAN_MERGE'].includes(existingState.state)) throw new Error('Another Agentic execution is active.');
    persistEnvelope(envelope);
    const supervisorProcess = await launchSupervisor(false, envelope.request_id);
    return await waitForAcceptedRequest(envelope.request_id, ['REQUEST_ACCEPTED', 'PREFLIGHT_PREPARING', 'PREFLIGHT_ANALYZING', 'ALREADY_SATISFIED', 'BRANCH_PREPARED', 'ARCHITECTURE', 'DOR_VALIDATION', 'IMPLEMENTING', 'TESTING', 'REVIEWING', 'CORRECTING', 'QUALITY_GATES', 'OBSERVABILITY_VERIFICATION', 'REQUIREMENT_VERIFICATION', 'SCOPE_DIFF_VERIFICATION', 'READY_TO_COMMIT', 'READY_TO_PR', 'WAITING_FOR_QUOTA', 'BLOCKED', 'WAITING_HUMAN_MERGE'], supervisorProcess);
  }
  if (name === 'resume_request') {
    if (Object.keys(args).length !== 1 || !Object.hasOwn(args, 'request_id')) throw new Error('resume_request arguments are invalid.');
    if (typeof args.request_id !== 'string' || !REQUEST_ID.test(args.request_id)) throw new Error('Request ID is invalid.');
    const status = readStatus();
    if (!status || status.request_id !== args.request_id) throw new Error('No matching execution checkpoint exists.');
    if (['IDLE', 'ALREADY_SATISFIED', 'FAILED', 'WAITING_HUMAN_MERGE'].includes(status.state)) throw new Error('Execution is terminal and cannot be resumed.');
    const active = activeSupervisors.get(args.request_id);
    if (active && active.exitCode === null) return status;
    const supervisorProcess = await launchSupervisor(true, args.request_id);
    return await waitForAcceptedRequest(args.request_id, ['RESUMING', 'WAITING_FOR_QUOTA', 'BLOCKED', 'REQUEST_ACCEPTED', 'PREFLIGHT_PREPARING', 'PREFLIGHT_ANALYZING', 'BRANCH_PREPARED', 'ARCHITECTURE', 'DOR_VALIDATION', 'IMPLEMENTING', 'TESTING', 'REVIEWING', 'CORRECTING', 'QUALITY_GATES', 'OBSERVABILITY_VERIFICATION', 'REQUIREMENT_VERIFICATION', 'SCOPE_DIFF_VERIFICATION', 'READY_TO_COMMIT', 'READY_TO_PR'], supervisorProcess, status);
  }
  throw new Error('Unknown Agentic Supervisor tool.');
}

function respond(id, result, error) {
  const response = error
    ? { jsonrpc: '2.0', id, error: { code: -32603, message: error } }
    : { jsonrpc: '2.0', id, result };
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleMessage(message) {
  const hasId = Object.hasOwn(message, 'id');
  if (message.method === 'initialize') {
    respond(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'agentic-supervisor', version: '1.0.0' },
      instructions: 'This local bridge exposes only start_request, resume_request, and get_status. It never exposes shell execution or arbitrary filesystem mutation. Preserve the user requirement verbatim in a validated Request Envelope. The Supervisor Host owns state, Git, gates, artifacts, and lifecycle decisions. Never merge or deploy.',
    });
    return;
  }
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return;
  if (message.method === 'ping') { if (hasId) respond(message.id, {}); return; }
  if (message.method === 'tools/list') { respond(message.id, { tools }); return; }
  if (message.method === 'tools/call') {
    try {
      const params = message.params || {};
      const value = await callTool(params.name, params.arguments || {});
      respond(message.id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
    } catch (error) {
      const messageText = String(error && error.message ? error.message : 'Agentic Supervisor tool failed.').replace(/[\r\n]/g, ' ').slice(0, 300);
      respond(message.id, { content: [{ type: 'text', text: messageText }], isError: true });
    }
    return;
  }
  if (hasId) respond(message.id, undefined, 'Method not found.');
}

try { assertWorkspace(); }
catch (error) { process.stderr.write(`agentic-supervisor startup failed: ${String(error.message).replace(/[\r\n]/g, ' ').slice(0, 200)}\n`); process.exit(1); }

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
let queue = Promise.resolve();
input.on('line', (line) => {
  queue = queue.then(async () => {
    try { await handleMessage(JSON.parse(line)); }
    catch (error) { respond(null, undefined, 'Invalid JSON-RPC request.'); }
  });
});
