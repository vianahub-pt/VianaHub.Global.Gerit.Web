# Agentic vNext — Architecture
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define the canonical architecture of the Gerit Web Agentic delivery system.

This document owns:

- architectural components;
- authority boundaries;
- canonical high-level flow;
- KEEP / REPLACE / REMOVE decisions;
- source-of-truth separation;
- trusted bootstrap mechanism;
- architectural invariants.

Detailed lifecycle, role contracts, specification schema, quality policy, Git rules and acceptance tests are defined in the other canonical documents.

## 2. Architectural Goal

The system must receive a natural-language user requirement and autonomously carry it to one of the canonical terminal outcomes:

```text
ALREADY_SATISFIED
WAITING_HUMAN_MERGE
FAILED
```

For work that requires implementation:

```text
USER PROMPT
→ FRONT DOOR
→ REQUEST ENVELOPE
→ ORCHESTRATOR
→ TRUSTED HOST SUPERVISOR
→ ARCHITECT PREFLIGHT
→ FRESH BRANCH
→ ARCHITECT SPECIFICATION
→ IMPLEMENTER
→ TESTER
→ REVIEWER + SECURITY
→ QUALITY / VERIFICATION
→ COMMIT
→ PUSH
→ PR
→ WAITING_HUMAN_MERGE
```

Automatic merge and deploy are outside Agentic authority.

## 3. Core Principle — Decision vs Privileged Execution

### Orchestrator

The Orchestrator is the workflow decision-maker.

It:

- decides the next lifecycle action;
- decides which role to invoke;
- aggregates independent role results;
- routes correction loops;
- decides whether execution advances, blocks, fails or terminates.

It does not:

- edit functional code;
- mutate Git directly;
- execute host-native gates directly;
- fabricate another role's PASS;
- merge or deploy.

### Supervisor Host

The Supervisor Host is the trusted deterministic execution authority.

It:

- performs privileged Git operations;
- invokes role processes;
- persists state, journal and provenance;
- executes host-native commands;
- validates hashes/snapshots;
- physically writes canonical control artifacts from validated role results;
- stages, commits, pushes and creates/verifies PRs.

It does not:

- decide product meaning;
- invent architecture;
- implement functional code;
- self-approve requirement completion.

## 4. Trusted Host Bootstrap — Agentic Supervisor Bridge

Normal use must begin from the user prompt. The user must not manually run internal PowerShell scripts.

The canonical bridge between Codex Desktop and the trusted host is a **desktop-only local MCP server** named conceptually:

```text
agentic-supervisor
```

It is a narrow control-plane bridge, not a general shell.

The MCP server runs locally on the user's machine using a supported local `stdio` MCP configuration.

Its public tool surface is limited to:

```text
start_request
resume_request
get_status
```

Optional future tools require an architecture change.

### start_request

Input:

```text
Request Envelope
target repository
```

Behavior:

- validates schema;
- starts the trusted Supervisor Host outside specialized-role sandboxes;
- returns execution identity and initial persisted state;
- does not expose arbitrary command execution.

### resume_request

Resumes one existing execution after identity/integrity validation.

### get_status

Returns sanitized execution status and references to persisted evidence.

### Approval and trust

The MCP server/plugin is installed locally and explicitly trusted once by the user.

Only the narrow Agentic control tools may be configured for approval.

The design must never expose an unrestricted host shell as an MCP tool.

If the bridge cannot initialize or launch the Supervisor:

```text
BOOTSTRAP_FAILURE
→ FAILED or BLOCKED according to objective cause
```

This bridge is mandatory for Front Door autonomy.

## 5. Front Door

The Front Door:

- receives the user's natural-language requirement;
- preserves it losslessly in the Request Envelope;
- passes the Request Envelope to the Orchestrator;
- invokes the trusted `agentic-supervisor.start_request` bridge;
- does not solve or implement the requirement itself.

Normal operation must not require the user to:

- fetch;
- switch branches;
- create branches;
- prepare Agentic state files;
- execute Agentic PowerShell scripts;
- run native quality gates.

## 6. Request Envelope

Before any Execution Specification exists, every request is represented by one minimal immutable Request Envelope.

Canonical fields:

```text
schema_version
request_id
received_at
target_repository
request_type_hint
user_requirement_verbatim
source
content_sha256
```

Rules:

- immutable after acceptance;
- contains no planning;
- contains no lifecycle status;
- contains no role PASS/FAIL;
- contains no secrets or PII;
- hash is persisted for identity.

The Request Envelope replaces the old ambiguous intake/goal-as-everything model.

## 7. Semantic Preflight

`ALREADY_SATISFIED` is a semantic decision and therefore cannot be decided by the Supervisor alone.

Canonical ownership:

```text
Supervisor
→ fetch + trusted base + base SHA

Architect Preflight
→ read-only semantic assessment against trusted base

Orchestrator
→ transition decision

Supervisor
→ persistence
```

The preflight Architect uses the same Architect role contract in `preflight` mode.

If satisfied:

```text
Preflight Result Artifact
→ ALREADY_SATISFIED
→ NO_CHANGES
```

No functional branch is created.

If not satisfied:

```text
Supervisor creates fresh branch
→ full Architect specification
```

## 8. Preflight Result Artifact

Every semantic preflight creates a canonical immutable result artifact.

Minimum fields:

```text
schema_version
request_id
base_branch
base_sha
evaluator_role
invocation_id
status: SATISFIED | NOT_SATISFIED | BLOCKED
evidence
timestamp
artifact_sha256
```

For `ALREADY_SATISFIED`, this is the primary audit artifact.

## 9. Execution Specification

For work that proceeds to implementation, the Architect creates one canonical Execution Specification.

The specification contains:

- requirement interpretation;
- architecture;
- dependencies;
- scope / out-of-scope;
- acceptance criteria;
- DOR;
- DOD;
- complexity;
- implementation plan;
- test strategy;
- security requirements;
- observability requirements;
- role result projections;
- final verification projections.

Detailed schema: `4-execution-specification.md`.

## 10. Logical Ownership vs Physical Write Authority

Roles own sections semantically.

They do **not** directly edit the shared canonical specification in parallel.

Canonical rule:

```text
Role
→ returns structured result artifact
→ Supervisor validates identity/snapshot/schema
→ Supervisor projects validated data into the role-owned section
```

Thus:

```text
Reviewer owns Reviewer Result logically.
Supervisor writes it physically.
```

This eliminates shared-file contention and preserves provenance.

## 11. Test Execution Broker

Tester owns QA decisions but native host command execution remains Supervisor-owned.

Canonical pattern:

```text
Tester
→ defines requested executable test actions
→ Supervisor validates request against policy
→ Supervisor executes host-native commands
→ Supervisor returns sanitized evidence
→ Tester evaluates evidence + other supported validation
→ Tester returns PASS / FAIL / BLOCKED
```

This replaces the old Tester-as-gate-log-reader design without moving host-native execution into a restricted sandbox.

## 12. Reviewer and Security

After Tester PASS:

```text
          ┌→ Reviewer
Tester ───┤
          └→ Security
```

They execute independently against the same approved snapshot.

The Orchestrator aggregates only after both complete.

Any functional correction invalidates both prior review approvals.

## 13. Source-of-Truth Separation

Canonical layers:

```text
Request Envelope
      ↓
Preflight Result
      ↓
Execution Specification
      ↓
Execution State
      ↓
Role / Gate Evidence
```

Responsibilities:

- Request Envelope: immutable original request identity.
- Preflight Result: semantic base assessment.
- Execution Specification: engineering contract.
- State: runtime lifecycle position.
- Journal: append-only audit history.
- Role/gate artifacts: execution evidence.

No artifact substitutes for another.

## 14. Memory

`ai-memory` is classified as:

```text
OPTIONAL AUXILIARY
```

It:

- may assist retrieval of durable project context;
- is not authoritative;
- is not required for lifecycle progression;
- must not store secrets or PII;
- must not override Request Envelope, Specification, State, Journal or evidence;
- must not cause workflow failure when unavailable.

## 15. KEEP

Preserve from the current framework when implementation evidence confirms compatibility:

- separated role primitives;
- trusted Supervisor Host primitives;
- branch hygiene primitives;
- state-machine foundation;
- provenance;
- invocation IDs;
- snapshots and SHA validation;
- structured result artifacts;
- sandbox isolation;
- bounded retry/correction primitives;
- host-native gate execution;
- commit/push/PR primitives;
- quota/resume primitives;
- secret sanitization;
- destructive-Git protections.

## 16. REPLACE

Replace:

- current Front Door behavior;
- manual start requirement;
- current intake model;
- nominal/decorative Orchestrator behavior;
- current planning model;
- current Tester contract;
- sequential Reviewer/Security lifecycle;
- missing semantic preflight role;
- missing Request Envelope;
- missing Preflight Result Artifact;
- missing Test Execution Broker;
- missing requirement/observability/scope verification;
- missing DOR/DOD and MM/ME/CX/TR semantics.

## 17. REMOVE

After migration remove:

- legacy Front Door flow;
- obsolete manual-start normal path;
- duplicate lifecycle paths;
- obsolete Tester-as-gate-reader semantics;
- stale planning model;
- `agentic/plans/**` as a separate planning source of truth;
- documentation describing retired behavior;
- compatibility paths that bypass the canonical lifecycle.

One canonical lifecycle must remain.

## 18. High-Level Canonical Flow

```text
USER PROMPT
    ↓
FRONT DOOR
    ↓
REQUEST ENVELOPE
    ↓
ORCHESTRATOR
    ↓
TRUSTED MCP SUPERVISOR BRIDGE
    ↓
SUPERVISOR
    ├── fetch
    ├── trusted base
    └── base SHA
    ↓
ARCHITECT PREFLIGHT
    │
    ├── SATISFIED
    │      ↓
    │ PRE-FLIGHT RESULT
    │      ↓
    │ ALREADY_SATISFIED / NO_CHANGES
    │
    └── NOT SATISFIED
           ↓
      FRESH BRANCH
           ↓
       ARCHITECT
           ↓
 EXECUTION SPECIFICATION
           ↓
      DOR VALIDATION
           ↓
      IMPLEMENTER
           ↓
        TESTER
           ↕
 SUPERVISOR TEST BROKER
           ↓
 REVIEWER + SECURITY
      in parallel
           ↓
 NATIVE GATES / VERIFICATION
           ↓
    READY_TO_COMMIT
           ↓
 COMMIT → PUSH → PR
           ↓
 WAITING_HUMAN_MERGE
```

## 19. Human Boundaries

### User

- supplies requirement;
- supervises;
- homologates locally before merge;
- decides merge.

### Tech Lead

- plans delivery slices;
- reviews architecture and PRs;
- verifies declared DOD;
- recommends merge or rejection.

### Agentic

- autonomously performs delivery lifecycle up to PR;
- never merges;
- never deploys automatically.

## 20. Architectural Invariants

1. The user prompt starts normal execution.
2. A local trusted MCP bridge starts the Supervisor Host.
3. The bridge exposes no arbitrary shell.
4. Request identity exists before any specification.
5. Semantic preflight is Architect-owned, not Supervisor-owned.
6. Already-satisfied evidence is persisted.
7. Work branches are fresh and single-use.
8. Only Implementer changes functional code.
9. Tester owns QA judgment; Supervisor executes host-native test commands.
10. Reviewer and Security are independent.
11. Canonical Specification physical writes are Supervisor-owned.
12. PASS requires evidence.
13. Native gates are Supervisor-owned.
14. Merge and deploy are human-controlled.
15. Memory is auxiliary only.
16. One canonical lifecycle exists.
17. Identical completed requirements can terminate NO_CHANGES.
18. No hidden fallback may bypass the architecture.

## 21. Status

**Architecture Baseline v1.0 — IMPLEMENTATION READY**
