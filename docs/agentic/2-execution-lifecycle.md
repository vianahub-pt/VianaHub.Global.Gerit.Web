# Agentic vNext — Execution Lifecycle
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define canonical states, transitions, correction loops, retry semantics, semantic preflight, resume/quota behavior and terminal outcomes.

## 2. Terminal Outcomes

Exactly these are terminal:

```text
ALREADY_SATISFIED
WAITING_HUMAN_MERGE
FAILED
```

`BLOCKED` is non-terminal and requires an objective external condition before resume.

## 3. Canonical States

```text
IDLE
REQUEST_ACCEPTED
PREFLIGHT_PREPARING
PREFLIGHT_ANALYZING
ALREADY_SATISFIED
BRANCH_PREPARED
ARCHITECTURE
DOR_VALIDATION
IMPLEMENTING
TESTING
REVIEWING
CORRECTING
QUALITY_GATES
OBSERVABILITY_VERIFICATION
REQUIREMENT_VERIFICATION
SCOPE_DIFF_VERIFICATION
READY_TO_COMMIT
READY_TO_PR
WAITING_FOR_QUOTA
BLOCKED
RESUMING
WAITING_HUMAN_MERGE
FAILED
```

## 4. Canonical Success Path

```text
IDLE
↓
REQUEST_ACCEPTED
↓
PREFLIGHT_PREPARING
↓
PREFLIGHT_ANALYZING
├── SATISFIED → ALREADY_SATISFIED
└── NOT_SATISFIED
        ↓
   BRANCH_PREPARED
        ↓
   ARCHITECTURE
        ↓
   DOR_VALIDATION
        ↓
   IMPLEMENTING
        ↓
     TESTING
        ↓
    REVIEWING
        ↓
  QUALITY_GATES
        ↓
OBSERVABILITY_VERIFICATION
        ↓
REQUIREMENT_VERIFICATION
        ↓
SCOPE_DIFF_VERIFICATION
        ↓
READY_TO_COMMIT
        ↓
READY_TO_PR
        ↓
WAITING_HUMAN_MERGE
```

## 5. REQUEST_ACCEPTED

Created when the Front Door has produced a valid immutable Request Envelope and the trusted Supervisor Bridge has accepted it.

Required:

- valid `request_id`;
- valid Request Envelope hash;
- target repository known.

Transition:

```text
REQUEST_ACCEPTED → PREFLIGHT_PREPARING
```

## 6. PREFLIGHT_PREPARING

Supervisor performs deterministic preparation only:

- repository integrity check;
- `git fetch origin`;
- trusted base selection;
- exact base SHA capture;
- preflight invocation setup.

Supervisor does not decide satisfaction.

Transitions:

```text
PREFLIGHT_PREPARING → PREFLIGHT_ANALYZING
PREFLIGHT_PREPARING → BLOCKED
PREFLIGHT_PREPARING → FAILED
```

## 7. PREFLIGHT_ANALYZING

Architect executes in read-only preflight mode against the trusted base.

It produces one Preflight Result Artifact:

```text
SATISFIED
NOT_SATISFIED
BLOCKED
```

Orchestrator consumes the result.

Transitions:

```text
SATISFIED     → ALREADY_SATISFIED
NOT_SATISFIED → BRANCH_PREPARED
BLOCKED       → BLOCKED
invalid/unrecoverable result → FAILED
```

No functional work branch exists before `NOT_SATISFIED`.

## 8. ALREADY_SATISFIED

Terminal.

Required:

```text
result = ALREADY_SATISFIED
change_status = NO_CHANGES
```

Must have:

- Request Envelope;
- trusted base SHA;
- validated Preflight Result Artifact;
- evidence.

Must not have:

- functional branch;
- functional edits;
- commit;
- push;
- PR.

## 9. BRANCH_PREPARED

Supervisor creates a fresh single-use branch from the captured trusted base SHA.

Transition:

```text
BRANCH_PREPARED → ARCHITECTURE
```

## 10. ARCHITECTURE

Architect performs full discovery + architecture + planning and produces the Execution Specification.

For MM/ME, normally one invocation.

For CX/TR, extra Architect iterations are allowed only for an objective unresolved architecture issue.

Transitions:

```text
ARCHITECTURE → DOR_VALIDATION
ARCHITECTURE → BLOCKED
ARCHITECTURE → FAILED
```

## 11. DOR_VALIDATION

Overall DOR rule:

```text
DOR = PASS
iff every required DOR item = PASS
and every non-required item = justified NOT_APPLICABLE
```

Transitions:

```text
PASS → IMPLEMENTING
correctable specification defect → ARCHITECTURE
external blocker → BLOCKED
unrecoverable integrity failure → FAILED
```

No implementation before DOR PASS.

## 12. IMPLEMENTING

Implementer changes only approved functional scope.

Transitions:

```text
IMPLEMENTING → TESTING
IMPLEMENTING → BLOCKED
IMPLEMENTING → FAILED
```

## 13. TESTING

Tester owns QA judgment.

Where host-native commands are needed, Tester requests them through the Supervisor Test Execution Broker.

Transitions:

```text
PASS → REVIEWING
FAIL → CORRECTING
BLOCKED → BLOCKED
process/integrity failure → FAILED
```

## 14. REVIEWING

Reviewer and Security execute independently against the same snapshot.

Canonical aggregation:

```text
Reviewer PASS + Security PASS → QUALITY_GATES
Any FAIL                      → CORRECTING
Any BLOCKED                   → BLOCKED
```

The Orchestrator aggregates only after both complete.

## 15. CORRECTING

A validated delivery defect requires correction.

Transition:

```text
CORRECTING → IMPLEMENTING
```

After any functional correction:

```text
IMPLEMENTING
→ TESTING
→ REVIEWING
```

Previous Tester/Reviewer/Security PASS results for the old snapshot are stale.

## 16. QUALITY_GATES

Supervisor executes final authoritative native gates against the approved snapshot.

Transitions:

```text
all required PASS → OBSERVABILITY_VERIFICATION
implementation-caused FAIL → CORRECTING
transient quota → WAITING_FOR_QUOTA
external required capability unavailable → BLOCKED
unrecoverable process/integrity failure → FAILED
```

## 17. OBSERVABILITY_VERIFICATION

Transitions:

```text
PASS or justified NOT_APPLICABLE → REQUIREMENT_VERIFICATION
FAIL → CORRECTING
BLOCKED → BLOCKED
```

## 18. REQUIREMENT_VERIFICATION

Verifies:

```text
requested requirement == delivered implementation
```

Transitions:

```text
PASS → SCOPE_DIFF_VERIFICATION
FAIL → CORRECTING
BLOCKED → BLOCKED
```

## 19. SCOPE_DIFF_VERIFICATION

Verifies final actual change set and snapshot integrity.

Transitions:

```text
PASS → READY_TO_COMMIT
FAIL → CORRECTING
BLOCKED → BLOCKED
```

## 20. READY_TO_COMMIT

Valid only while the current snapshot equals the fully approved snapshot.

Transitions:

```text
commit/push preparation successful → READY_TO_PR
snapshot changed → TESTING
failure → FAILED
```

Any semantic code/config/dependency change invalidates readiness.

## 21. READY_TO_PR

Commit exists and branch push succeeded.

Transitions:

```text
verified PR → WAITING_HUMAN_MERGE
failure → FAILED
```

## 22. WAITING_HUMAN_MERGE

Terminal for Agentic execution.

The human performs homologation and merge decision.

No automatic merge or deploy occurs.

## 23. BLOCKED

Use only when an objective external condition prevents continuation.

Required diagnostic:

```text
blocking_phase
category
description
evidence
required_resume_condition
```

Ordinary code/test/review defects use `CORRECTING`, not `BLOCKED`.

Resume:

```text
BLOCKED → RESUMING
```

after external condition is resolved.

## 24. WAITING_FOR_QUOTA

Preserves:

- request identity;
- branch;
- state;
- specification;
- counters;
- evidence;
- pending phase.

Transition:

```text
WAITING_FOR_QUOTA → RESUMING
```

No continuous probing.

## 25. RESUMING

Resume validates:

- Request Envelope identity/hash;
- branch identity;
- base provenance;
- specification version/hash when present;
- state/journal consistency;
- evidence references.

Then:

```text
RESUMING → persisted pending phase
```

Resume never creates a new branch for the same execution.

## 26. FAILED

Terminal.

Reserved for unrecoverable control-plane or integrity failures, including:

- state corruption;
- provenance mismatch;
- branch integrity violation;
- invalid role contract beyond retry budget;
- invalid transition;
- exhausted hard limits;
- unsafe repository state;
- Supervisor failure that cannot be safely resumed.

## 27. Correction Loop

Canonical:

```text
FAIL
↓
CORRECTING
↓
IMPLEMENTING
↓
TESTING
↓
REVIEWING
```

No shortcut back only to the role that originally failed.

## 28. Snapshot Invalidation

A new semantic snapshot invalidates:

```text
Tester PASS
Reviewer PASS
Security PASS
quality gates
observability verdict
requirement verification
scope verification
```

Default re-entry:

```text
semantic snapshot change → TESTING
```

If architecture/scope/acceptance semantics changed:

```text
→ ARCHITECTURE
```

## 29. Retry Classes

### Delivery Correction

Real product defect:

```text
→ CORRECTING
```

### Transient Process Failure

Retry only when classified retryable and within budget.

### Invalid Role Result

Reject result; do not record PASS. Retry within contract-failure budget.

### Quota

Use `WAITING_FOR_QUOTA`.

## 30. Bounded Execution

Must configure:

- maximum correction iterations;
- maximum total role invocations;
- maximum consecutive process/contract failures.

Hard limit exhaustion:

```text
→ FAILED
```

No unbounded autonomous loop.

## 31. Forbidden Phase Skips

Examples:

```text
IMPLEMENTING → READY_TO_COMMIT
TESTING → READY_TO_COMMIT
REVIEWING → COMMIT
CORRECTING → REVIEWING
PREFLIGHT_PREPARING → BRANCH_PREPARED without semantic preflight
```

## 32. State Authority

```text
Orchestrator → decides desired transition
Supervisor   → validates and persists transition
Roles        → return evidence only
```

No specialized role writes canonical state.

## 33. Lifecycle Invariants

1. Request Envelope exists before lifecycle work.
2. Semantic preflight occurs before branch creation.
3. No implementation before DOR PASS.
4. No review before Tester PASS.
5. Reviewer/Security remain independent.
6. Any semantic correction invalidates prior approvals.
7. No commit before all required verification passes.
8. ALREADY_SATISFIED creates no functional work.
9. Resume preserves execution identity.
10. Quota is not a product failure.
11. BLOCKED is external, not an ordinary defect.
12. FAILED is unrecoverable.
13. All transitions are explicit and persisted.
14. Execution is bounded.

## 34. Status

**Lifecycle v1.0 — IMPLEMENTATION READY**
