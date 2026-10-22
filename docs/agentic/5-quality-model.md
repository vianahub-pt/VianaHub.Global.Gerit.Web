# Agentic vNext — Quality Model
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define how Agentic vNext proves correctness, safety, completeness and readiness.

## 2. Core Rule

```text
technical success ≠ requirement completion
```

`READY_TO_COMMIT` requires objective evidence across all applicable quality dimensions.

## 3. Status Vocabulary

```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE
PENDING
```

N/A always requires objective reason.

## 4. Quality Dimensions

```text
functional correctness
unit correctness
integration correctness
UI/interface correctness
error-path correctness
regression safety
code quality
security
observability
native repository health
requirement completeness
scope integrity
snapshot integrity
```

## 5. Evidence Rule

PASS without evidence is invalid.

Valid evidence includes:

- executed test artifact;
- host command exit code;
- UI execution artifact;
- file/symbol/diff reference;
- API contract reference;
- structured review artifact;
- snapshot hash;
- sanitized output.

## 6. Tester vs Supervisor

Tester owns QA judgment.

Supervisor owns trusted host-native execution.

Canonical broker:

```text
Tester
→ requests bounded approved test action
→ Supervisor validates
→ Supervisor executes
→ Supervisor persists sanitized evidence
→ Tester evaluates
→ Tester returns QA verdict
```

This is mandatory when sandbox execution is not authoritative or unavailable.

## 7. Test Action Request

Minimum schema:

```text
action_id
request_id
snapshot_sha256
action_type
approved_identifier
purpose
expected_evidence
```

Allowed action types are policy-controlled.

Examples:

```text
RUN_PACKAGE_SCRIPT
RUN_TYPECHECK
RUN_TEST_COMMAND
RUN_BUILD
RUN_BROWSER_SCENARIO
```

No arbitrary shell string is accepted from Tester.

## 8. Unit Testing

Use for isolated executable logic when applicable.

Do not install a test framework just to satisfy architecture unless explicitly approved.

No harness + required testability gap must be represented honestly as N/A or BLOCKED according to DOD.

## 9. Integration Testing

Required for meaningful boundary interaction when specified.

If required but impossible:

```text
BLOCKED
```

not PASS.

## 10. UI / Interface Testing

Required for user-visible behavior when DOD says so.

May validate:

- route;
- controls;
- loading;
- empty state;
- errors;
- CRUD;
- confirmation;
- validation;
- feedback.

Code inspection does not equal executed UI behavior when execution is mandatory.

## 11. Acceptance Testing

Each AC has independent result.

Overall acceptance PASS requires every required AC PASS.

## 12. Regression Testing

Depth proportional to risk/complexity.

## 13. Complexity Depth

### MM

Focused validation + mandatory reviews/gates.

### ME

Unit as applicable, integration, UI when user-visible, acceptance, regression, reviews, observability, gates.

### CX

Expanded integration/regression/risk/security/observability.

### TR

Architecture/control-plane tests, failure paths, resume, provenance, branch isolation, orchestration semantics.

## 14. Tester Quality Responsibility

Tester validates:

- ACs;
- DOD test items;
- brokered host test evidence;
- integration/UI/error behavior;
- regressions.

Tester PASS does not replace Reviewer/Security/gates/final verification.

## 15. Reviewer Quality

Independent review of:

- architecture adherence;
- maintainability;
- type safety;
- duplication;
- state/error handling;
- API contracts;
- accessibility basics when relevant;
- regression risk;
- scope discipline.

## 16. Security Quality

Independent review of:

- auth;
- authorization;
- tenant isolation;
- tokens/secrets;
- PII;
- logging;
- XSS/injection;
- storage;
- error leakage;
- dependencies;
- privilege escalation.

## 17. Observability

Verify when applicable:

- failures diagnosable;
- API errors not swallowed;
- correlation preserved when existing;
- no secret/PII logging;
- no auth-header logging;
- no debug noise;
- correct user feedback.

## 18. Native Host Gates

Supervisor executes authoritative repository gates.

Typical Web runtime set:

```text
git diff --check
npm ci
npm run lint
npx tsc --project tsconfig.typecheck.json --noEmit
applicable tests
npm run build
```

Exact gates come from actual repository configuration and Specification.

Never invent commands.

## 19. Gate Evidence

Each gate records:

```text
name
command identifier
classification
started_at
finished_at
duration
exit_code
status
sanitized evidence reference
snapshot
```

## 20. Gate Failures

Implementation-caused failure:

```text
→ CORRECTING
```

Transient environment failure follows retry/quota policy and must not trigger fake code fixes.

## 21. NOT_APPLICABLE

Never equivalent to PASS.

Requires:

```text
check
status
reason
decision source
```

## 22. Requirement Verification

Independent semantic check against:

```text
Request Envelope
+ Acceptance Criteria
+ DOD
+ final implementation
```

Must detect:

- missing behavior;
- invented behavior;
- scope drift;
- false completion from technical gates.

## 23. Scope Verification

Checks:

- changed files/domains;
- unrelated refactor;
- production mutations;
- config drift;
- generated noise;
- unapproved artifacts.

## 24. Diff / Snapshot Verification

Confirms committed content equals reviewed/tested content.

Detects:

- late edits;
- staged/unstaged divergence;
- unexpected files;
- hash mismatch.

## 25. Snapshot-Bound Quality

These are snapshot-bound:

```text
Tester
Reviewer
Security
native gates
observability
requirement verification
scope verification
```

Semantic snapshot changes stale prior PASS results.

## 26. Readiness Formula

```text
READY_TO_COMMIT =
    implementation_complete
AND acceptance_pass
AND DOD_pass
AND tester_pass
AND reviewer_pass
AND security_pass
AND required_gates_pass
AND observability_valid
AND requirement_verification_pass
AND scope_verification_pass
AND snapshot_integrity_pass
```

No majority vote.

## 27. No Partial Completion Shortcuts

Invalid:

```text
build PASS → ready
Tester PASS → ready
Reviewer+Security PASS → ready
```

All required dimensions apply.

## 28. Severity

### Security

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

HIGH/CRITICAL block.

MEDIUM blocks unless explicitly human risk-accepted under policy.

### Reviewer

```text
INFO
LOW
MEDIUM
HIGH
BLOCKER
```

HIGH/BLOCKER block.

## 29. Residual Risk

Allowed only if:

- non-blocking;
- does not violate AC/DOD;
- not meaningful unaccepted security risk;
- explicitly documented.

## 30. Documentation-Only

Runtime gates may be justified N/A.

Still require:

- content review;
- scope review;
- diff check;
- relevant reference validation.

## 31. Agentic Runtime Infrastructure Quality

For Agentic vNext, mandatory categories include:

- parser/syntax validation;
- control-plane fixtures;
- lifecycle transitions;
- invalid transitions;
- role-contract validation;
- Request Envelope identity;
- Preflight Artifact validation;
- trusted bridge bootstrap;
- provenance;
- branch isolation;
- correction loops;
- parallel aggregation;
- Test Execution Broker;
- resume;
- already-satisfied;
- failure paths.

## 32. Ordering

```text
IMPLEMENTER
→ TESTER
→ REVIEWER + SECURITY
→ FINAL NATIVE GATES
→ OBSERVABILITY
→ REQUIREMENT VERIFICATION
→ SCOPE / DIFF VERIFICATION
→ READY_TO_COMMIT
```

Preparatory diagnostics may happen earlier; final authoritative results must bind to approved snapshot.

## 33. Quality Failure Routing

Any validated delivery failure routes to `CORRECTING`.

Mandatory capability unavailable routes to `BLOCKED`.

Process integrity failure may route to retry or `FAILED`.

## 34. Invariants

1. PASS requires evidence.
2. N/A requires reason.
3. Tester owns QA judgment.
4. Supervisor owns native command execution.
5. Broker accepts bounded approved actions only.
6. Reviewer and Security remain independent.
7. All approvals are snapshot-bound.
8. Semantic changes invalidate downstream approvals.
9. Required UI execution cannot be replaced by guesswork.
10. Requirement verification is independent.
11. Scope verification is mandatory.
12. Final diff matches approved snapshot.
13. One blocking required failure prevents readiness.

## 35. Status

**Quality Model v1.0 — IMPLEMENTATION READY**
