# Agentic vNext — Roles and Handoffs
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define authority, inputs, outputs, prohibitions and handoff contracts for:

```text
Front Door
Orchestrator
Supervisor Host
Architect
Implementer
Tester
Reviewer
Security
```

## 2. Separation Principle

```text
Front Door   → receives and preserves request
Orchestrator → decides workflow
Supervisor   → trusted privileged execution/persistence
Architect    → semantic analysis/specification
Implementer  → functional mutation
Tester       → QA judgment
Reviewer     → independent code/architecture review
Security     → independent security review
```

No role may impersonate another.

## 3. Front Door

### Responsibilities

- receive user prompt;
- create immutable Request Envelope;
- preserve `user_requirement_verbatim`;
- invoke trusted `agentic-supervisor.start_request`;
- show high-level progress.

### Must not

- implement;
- mutate Git;
- invent scope;
- decide PASS;
- tell the user to run internal Supervisor scripts during normal flow.

### Output

```text
Request Envelope
bridge invocation result
execution reference
```

## 4. Orchestrator

### Responsibilities

- consume Request Envelope;
- request deterministic actions from Supervisor;
- invoke semantic roles through Supervisor;
- decide transitions;
- aggregate Reviewer/Security;
- route corrections;
- decide terminal result.

### Must not

- edit functional code;
- perform privileged Git;
- execute native gates directly;
- fabricate role evidence;
- write arbitrary canonical artifacts directly;
- merge/deploy.

### Output

Structured decisions:

```text
NEXT_ROLE
NEXT_ROLES
TRANSITION
CORRECTION_TARGET
TERMINAL_RESULT
```

Supervisor validates/persists them.

## 5. Supervisor Host

### Responsibilities

- trusted Git operations;
- state/journal/provenance persistence;
- role process invocation;
- sandbox enforcement;
- role result validation;
- Request Envelope persistence;
- Preflight Result persistence;
- canonical Specification physical writes;
- Test Execution Broker;
- host-native gates;
- snapshots/hashes;
- commit/push/PR.

### Must not

- decide semantic requirement satisfaction;
- invent product architecture;
- edit functional product code;
- resolve findings itself;
- infer DOD from exit codes;
- merge/deploy.

## 6. Architect Modes

The same Architect role has two explicit modes.

### 6.1 `preflight`

Read-only semantic assessment against trusted base.

Input:

```text
Request Envelope
repository
trusted base branch
trusted base SHA
read-only repository evidence
```

Output:

```text
Preflight Result Artifact
status: SATISFIED | NOT_SATISFIED | BLOCKED
evidence
```

Architect does not create a full Execution Specification when result is `SATISFIED`.

### 6.2 `specification`

Runs only after branch preparation for work that is not already satisfied.

Responsibilities:

- discovery;
- architecture;
- dependencies;
- scope/out-of-scope;
- acceptance criteria;
- DOR/DOD;
- complexity;
- implementation plan;
- test strategy;
- security requirements;
- observability requirements.

Output:

```text
Architect Result Artifact
+ canonical Specification content payload
```

Supervisor validates and physically materializes the canonical Execution Specification.

## 7. Architect Prohibitions

Architect must not:

- edit functional code;
- mutate Git;
- self-approve Tester/Reviewer/Security;
- guess inspectable contracts;
- write canonical state/journal directly.

## 8. Implementer

### Responsibilities

- read full current Execution Specification;
- implement only approved scope;
- follow repository patterns;
- create/update tests;
- address active correction findings;
- report exact files changed.

### Must not

- redefine scope;
- edit Architect-owned specification semantics;
- declare QA/review/security PASS;
- perform privileged Git;
- merge/deploy.

### Output artifact

```text
status
summary
files_changed
tests_created_or_updated
findings_addressed
remaining_risks
evidence
snapshot reference
```

Supervisor projects the validated result into the canonical Specification.

## 9. Tester

### Primary Authority

Tester owns QA judgment.

### Responsibilities

- read full Execution Specification;
- derive executable test plan;
- validate acceptance criteria;
- validate DOD test obligations;
- validate unit/integration/UI/error behavior as applicable;
- request host-native test commands through Test Execution Broker;
- evaluate returned evidence;
- return PASS/FAIL/BLOCKED.

### Test Execution Broker Contract

Tester does **not** execute unrestricted host commands.

Tester may return a bounded `test_actions` request using approved action types.

Examples:

```text
RUN_PACKAGE_SCRIPT
RUN_TYPECHECK
RUN_TEST_COMMAND
RUN_BUILD
RUN_BROWSER_SCENARIO
```

Each requested action contains:

```text
action_id
type
approved command identifier or scenario identifier
purpose
expected evidence
```

Supervisor:

1. validates request against repository policy / allowlist;
2. executes on trusted host;
3. captures sanitized result;
4. binds evidence to current snapshot;
5. returns evidence reference to Tester.

Tester then issues its QA verdict.

If a mandatory test cannot be executed:

```text
BLOCKED
```

not speculative PASS.

### Tester must not

- edit functional code;
- fix findings;
- mutate Git;
- declare Reviewer/Security PASS.

## 10. Reviewer

Read-only independent review.

Validates:

- architecture adherence;
- maintainability;
- type safety;
- API contract use;
- error handling;
- regression risk;
- scope discipline;
- accessibility basics when relevant.

Returns independent structured artifact.

No functional edits.

## 11. Security

Read-only independent security review.

Validates, when relevant:

- auth;
- authorization;
- tenant isolation;
- tokens/secrets;
- PII;
- unsafe logging;
- XSS/injection;
- storage;
- error leakage;
- dependency/security implications.

Returns independent structured artifact.

No functional edits.

## 12. Canonical Handoff Context

Every specialized invocation receives at least:

```text
request_id
goal_id/execution_id
role
mode
invocation_id
phase
repository
branch
base_branch
base_sha
request_envelope_path/hash
execution_specification_path/hash when present
snapshot_sha256
short task context
relevant evidence artifact paths
```

No hidden dependence on prior chat history.

## 13. Front Door → Supervisor Bridge

```text
Front Door
→ local trusted MCP tool start_request(Request Envelope)
→ Supervisor process starts
→ persisted execution identity returned
```

Launch failure is explicit; no fallback to "please run this PowerShell manually" in normal flow.

## 14. Supervisor → Architect Preflight

Supervisor provides trusted base identity and read-only repository context.

Architect returns semantic evidence only.

Supervisor persists artifact; Orchestrator decides transition.

## 15. Architect Specification → Implementer

Implementer receives:

- short context;
- canonical Specification path/hash;
- current snapshot;
- active findings if correction.

Implementer must read full Specification itself.

## 16. Implementer → Tester

Tester receives:

- canonical Specification;
- implementation result artifact;
- changed files;
- snapshot;
- available evidence.

Tester may request brokered host test actions.

## 17. Tester → Reviewer + Security

Only after Tester PASS.

Both receive same approved snapshot and independent invocation IDs.

They do not consume each other's result.

## 18. Parallel Aggregation

```text
PASS + PASS → advance
any FAIL    → CORRECTING
any BLOCKED → BLOCKED
```

The Orchestrator aggregates after both complete.

## 19. FAIL → Implementer

Correction handoff includes:

```text
Specification path/hash
all active failure artifacts
exact correction objective
current snapshot
```

Implementer rereads complete Specification.

After correction:

```text
Tester → Reviewer + Security
```

again.

## 20. Logical Ownership vs Physical Writer

Logical ownership:

```text
Architect   → requirements/planning sections
Implementer → Implementation Result
Tester      → Tester Result
Reviewer    → Reviewer Result
Security    → Security Result
Control plane → gates/verifications/final status
```

Physical writer of the canonical shared Markdown file:

```text
Supervisor only
```

Roles return structured artifacts; they do not concurrently edit the shared Markdown.

## 21. Evidence Immutability

A new invocation creates a new immutable result artifact.

Old PASS/FAIL evidence is never overwritten.

Canonical Specification points to latest effective validated result.

## 22. Snapshot Binding

Every role artifact includes:

```text
request_id
invocation_id
role
mode
phase
snapshot_sha256
timestamp
status
```

Old snapshot PASS cannot approve new snapshot.

## 23. Role Fail vs Process Fail

### Role FAIL

Role ran successfully and found a delivery defect.

Route:

```text
→ CORRECTING
```

### Process Fail

Role execution infrastructure failed.

Route follows retry/integrity policy; no fake product defect.

## 24. BLOCKED Semantics

BLOCKED is valid only for objective external inability.

Examples:

- required repository/contract inaccessible;
- mandatory UI execution unavailable;
- human product decision required.

Ordinary defects use FAIL.

## 25. No Cross-Role Mutation

Forbidden:

```text
Architect implements
Tester patches code
Reviewer fixes code
Security patches code
Orchestrator patches code
Supervisor patches product code
```

## 26. No Cross-Role PASS

Forbidden:

```text
Implementer says tests pass → Tester PASS
Reviewer says secure → Security PASS
Supervisor sees build pass → DOD PASS
Orchestrator invents review PASS
```

## 27. Human Completion Handoff

At `WAITING_HUMAN_MERGE`, user receives:

- PR;
- branch;
- commit SHA;
- implementation summary;
- Tester/Reviewer/Security status;
- native gate status;
- requirement/scope verification;
- residual risks.

Human performs local homologation and merge decision.

## 28. Invariants

1. Handoffs are explicit.
2. Fresh processes can work from canonical artifacts.
3. Supervisor is sole physical writer of shared control artifacts.
4. Only Implementer changes functional code.
5. Tester owns QA judgment.
6. Host command execution for QA is brokered by Supervisor.
7. Reviewer/Security remain independent.
8. Result artifacts are immutable and snapshot-bound.
9. No role impersonation.
10. Front Door starts Supervisor through trusted bridge, not manual operator steps.

## 29. Status

**Roles and Handoffs v1.0 — IMPLEMENTATION READY**
