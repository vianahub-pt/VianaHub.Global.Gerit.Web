# Agentic vNext — Acceptance Tests
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define how to prove the Agentic vNext infrastructure conforms to the frozen architecture.

## 2. Test Levels

```text
L1 — Static / Contract
L2 — Deterministic Control Plane
L3 — Synthetic End-to-End
L4 — Real Product Acceptance
```

## 3. Mandatory Architecture Files

Verify the seven canonical docs exist and identify themselves as v1.0 IMPLEMENTATION READY.

## 4. Static Contract Tests

### AT-001 Single canonical lifecycle

No active legacy bypass path.

### AT-002 Role inventory

Required:

```text
orchestrator
architect
implementer
tester
reviewer
security
```

### AT-003 Role boundaries

Only Implementer writes functional code.

### AT-004 Request Envelope schema

Validate mandatory identity fields and immutable hash.

### AT-005 Preflight Result schema

Validate base SHA, Architect evaluator, status and evidence.

### AT-006 Execution Specification schema

All mandatory sections present.

### AT-007 Canonical status vocabulary

Specification status values must equal lifecycle vocabulary.

### AT-008 ai-memory classification

Must be OPTIONAL AUXILIARY, never source of truth.

### AT-009 legacy plan source removed

No canonical dependency on `agentic/plans/**`.

## 5. Trusted Bridge Tests

### AT-010 Local Supervisor MCP bridge loads

Codex Desktop can initialize the local desktop-only MCP server.

### AT-011 Narrow tool surface

Only approved tools exposed:

```text
start_request
resume_request
get_status
```

No arbitrary shell tool.

### AT-012 start_request autonomy

From user prompt, Front Door can invoke `start_request` without requiring user to run PowerShell manually.

### AT-013 bridge launch failure

Failure returns structured bootstrap error; no manual-start fallback is treated as normal success.

### AT-014 one-time trust/approval policy

Configured tools can operate under the intended user-reviewed trust policy without repeated low-level approvals in normal execution.

## 6. Git / Base Tests

### AT-020 trusted remote base

Stale local develop must not become base.

### AT-021 semantic preflight before branch

Architect preflight runs before functional branch creation.

### AT-022 fresh branch

Created from exact captured trusted base SHA.

### AT-023 branch reuse rejection

Existing local/remote work branch is not reused.

### AT-024 protected branch safety

No direct commit/push develop/main.

### AT-025 destructive Git rejection

No reset-hard/clean/force push normal path.

### AT-026 scope-limited staging

Unrelated local changes stay out.

### AT-027 staged diff integrity

Late modification invalidates readiness.

## 7. Preflight / Idempotence Tests

### AT-030 satisfied result owner

Architect preflight produces SATISFIED evidence; Supervisor does not decide semantic satisfaction.

### AT-031 already-satisfied artifact

Request Envelope + Preflight Result + base provenance are persisted.

### AT-032 already-satisfied negative assertions

SATISFIED produces:

```text
no functional branch
no functional edit
no commit
no push
no PR
```

### AT-033 false satisfaction rejection

Partial implementation must produce NOT_SATISFIED.

## 8. Control-Plane Tests

### AT-040 valid state transitions

Canonical transitions accepted.

### AT-041 invalid transition rejection

Examples:

```text
IMPLEMENTING → READY_TO_COMMIT
CORRECTING → REVIEWING
PREFLIGHT_PREPARING → BRANCH_PREPARED without Architect preflight
```

### AT-042 terminal enforcement

No mutation after terminal state.

### AT-043 invocation identity

Validate request/role/invocation/phase/snapshot.

### AT-044 snapshot-bound PASS

Old snapshot approval cannot approve new snapshot.

### AT-045 provenance persistence

All invocation evidence persisted.

### AT-046 secret sanitization

Synthetic secret fixtures never persist raw.

## 9. Specification Write Tests

### AT-050 Supervisor sole physical writer

Roles cannot directly edit canonical Specification.

### AT-051 logical ownership projection

Supervisor projects each role artifact only into the correct section.

### AT-052 parallel write safety

Reviewer and Security results cannot overwrite each other.

### AT-053 historical evidence preservation

New result does not destroy old evidence artifact.

## 10. Test Execution Broker Tests

### AT-060 bounded test action schema

Tester requests only approved action types.

### AT-061 arbitrary shell rejection

Free-form host shell request from Tester is rejected.

### AT-062 host execution evidence

Supervisor executes approved test action and binds evidence to snapshot.

### AT-063 Tester judgment

Tester, not Supervisor, decides QA PASS/FAIL from evidence.

### AT-064 unavailable mandatory test

Results in BLOCKED, not fake PASS.

## 11. Synthetic Lifecycle Tests

### AT-070 successful MM

Full success path.

### AT-071 successful ME

Multi-file known architecture path.

### AT-072 DOR failure

Implementer must not run.

### AT-073 Tester correction

```text
Tester FAIL → Correcting → Implementer → Tester
```

### AT-074 Reviewer correction

Functional correction causes full re-test/re-review.

### AT-075 Security correction

Same full revalidation rule.

### AT-076 Reviewer/Security parallel invocation

Distinct invocations, same snapshot, independent artifacts.

### AT-077 parallel aggregation

PASS/PASS advances; any FAIL corrects; BLOCKED blocks.

### AT-078 native gate failure

No commit.

### AT-079 malformed role output

No PASS; bounded retry then FAILED if exhausted.

### AT-080 role process crash

Classified as process failure, not fake product defect.

### AT-081 BLOCKED behavior

Objective external capability issue blocks honestly.

### AT-082 quota pause/resume

State preserved.

### AT-083 process restart resume

Same request/branch/spec/counters/pending phase.

### AT-084 resume integrity mismatch

Tamper → FAILED.

### AT-085 requirement verification failure

Technical PASS + missing AC → correction.

### AT-086 scope drift

Unrelated refactor blocks commit.

### AT-087 observability/security failure

Sensitive logging or swallowed errors blocks.

### AT-088 N/A without reason

Rejected.

### AT-089 no self-approval

Cross-role PASS substitution rejected.

### AT-090 real Orchestrator use

Explicit Orchestrator decision evidence exists.

### AT-091 Supervisor does not implement

No product edit by control plane.

### AT-092 Architect creates valid Specification

All required engineering contract sections exist before Implementer.

### AT-093 fresh-agent independence

Fresh role process can execute from canonical artifacts only.

### AT-094 bounded loop

Hard limit terminates as FAILED.

## 12. Three-Iteration Infrastructure Delivery Budget

The infrastructure reconstruction itself is limited to a maximum of **three Codex delivery iterations**.

### Delivery Iteration 1 — vNext Implementation

Goal:

- implement frozen architecture;
- preserve KEEP primitives;
- replace/remove vNext-defined components;
- no product feature work.

Expected output:

```text
one implementation PR
```

### Delivery Iteration 2 — Acceptance + Objective Corrections

Goal:

- execute L1–L3 suite;
- perform root-cause analysis for failures;
- correct only objective acceptance failures.

Expected output:

```text
either same execution/PR correction cycle or one focused acceptance-correction PR, according to repository state
```

The iteration is about one bounded delivery cycle, not each internal subagent correction loop.

### Delivery Iteration 3 — Optional Blocking Hardening

Allowed only if Iteration 2 leaves a documented blocking acceptance failure.

Must reference failed AT IDs.

After Iteration 3:

```text
ACCEPT Agentic vNext
or
STOP and reassess architecture/tooling
```

There is no default Iteration 4.

### What does not count as a delivery iteration

Internal bounded role retries/correction loops inside one Agentic execution do not count as a separate infrastructure delivery iteration.

They remain governed by lifecycle limits.

## 13. Root-Cause-First Failure Policy

For every failed acceptance test, record:

```text
AT ID
expected
actual
evidence
violated invariant
classification:
  implementation defect
  architecture defect
  test defect
  environment limitation
  tool limitation
recommended correction area
```

Do not patch symptoms before root cause is established.

## 14. L4 — Real Product Acceptance: Actions CRUD

The first real system acceptance feature remains Gerit Web Actions CRUD.

Reason:

- menu route already exists;
- Web behavior is incomplete;
- API resource exists;
- scope is contained;
- known app patterns exist;
- expected complexity ME.

## 15. Actions Run 1

Use fresh Codex chat/session.

Expected:

```text
USER PROMPT
→ Request Envelope
→ Orchestrator
→ trusted bridge
→ Supervisor fetch/base
→ Architect preflight NOT_SATISFIED
→ fresh branch
→ Architect Specification / DOR PASS
→ Implementer
→ Tester + brokered execution
→ Reviewer + Security
→ final gates
→ observability
→ requirement verification
→ scope/diff
→ commit
→ push
→ PR
→ WAITING_HUMAN_MERGE
```

Required evidence includes every role and control-plane boundary.

## 16. Human Gate Between Runs

After Run 1:

```text
user local homologation
Tech Lead independent PR review
human merge
```

Agentic does not merge.

## 17. Actions Run 2

Use another fresh Codex chat/session.

Submit exact same prompt byte-for-byte when practical.

Expected:

```text
Request Envelope
→ bridge
→ Supervisor fetch updated origin/develop
→ Architect preflight
→ SATISFIED
→ Preflight Result
→ ALREADY_SATISFIED
→ NO_CHANGES
```

Mandatory negative assertions:

```text
no functional branch
no functional edits
no commit
no push
no PR
```

## 18. Run 2 Interpretation

If Run 2 changes code, at least one of:

- Run 1 incomplete;
- Run 1 verification incomplete;
- base state wrong;
- semantic preflight wrong;
- idempotence broken.

This is a blocking acceptance failure.

## 19. Acceptance Evidence Package

Each run references:

```text
Request Envelope
base SHA
Preflight Result
branch when applicable
Execution Specification
role invocations/results
brokered test evidence
state transitions
journal
native gates
snapshots
commit
PR
terminal state
```

## 20. Mandatory Acceptance Set

Never optional:

```text
AT-010 through AT-014 bridge
AT-020 through AT-027 Git/base
AT-030 through AT-033 preflight/idempotence
AT-040 through AT-046 control-plane integrity
AT-050 through AT-053 specification-write safety
AT-060 through AT-064 Test Execution Broker
AT-073 through AT-077 correction/parallel review
AT-083 resume
AT-085 requirement verification
AT-086 scope verification
AT-089 no self-approval
AT-090 real Orchestrator
AT-092 Architect Specification
AT-093 fresh-agent independence
AT-094 bounded loop
Actions Run 1
Actions Run 2
```

## 21. Exit Criteria

Infrastructure is accepted when:

```text
frozen v1.0 docs exist
implementation conforms
mandatory L1 PASS
mandatory L2 PASS
mandatory L3 PASS
Actions Run 1 PASS
human homologation PASS
Tech Lead review PASS
human merge
Actions Run 2 PASS
ALREADY_SATISFIED / NO_CHANGES confirmed
```

Then infrastructure work stops and product delivery resumes.

## 22. No Endless Infrastructure Rule

After acceptance, changes require:

- real blocking defect;
- security issue;
- architecture requirement change;
- platform/tool incompatibility;
- measurable delivery failure.

No permanent polishing loop.

## 23. Status

**Acceptance Tests v1.0 — IMPLEMENTATION READY**
