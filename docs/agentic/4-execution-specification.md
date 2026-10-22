# Agentic vNext — Execution Specification
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define the canonical engineering contract for one implementation requirement.

The Specification is created only after semantic preflight concludes `NOT_SATISFIED` and a fresh branch is prepared.

## 2. Pre-Specification Artifacts

Before Specification creation, these artifacts already exist:

```text
Request Envelope
Preflight Result Artifact
trusted base provenance
work branch provenance
```

The Request Envelope is the immutable original request identity.

The Preflight Result proves why implementation is required.

## 3. Canonical Path

Recommended:

```text
agentic/specifications/<request-id>.md
```

Exactly one canonical active Specification per implementation execution.

`agentic/plans/**` is not a parallel planning source and must be removed from the vNext canonical model.

## 4. Physical Write Authority

Roles own sections logically.

Only Supervisor physically writes/updates the canonical Specification.

Flow:

```text
role result artifact
→ Supervisor schema/identity/snapshot validation
→ Supervisor projection into role-owned section
```

This is mandatory for parallel Reviewer/Security safety.

## 5. Header

Required:

```text
Schema Version
Request ID
Title
Created At
Updated At
Base Branch
Base SHA
Work Branch
Complexity
Specification Version
Lifecycle State
Specification SHA256
```

`Lifecycle State` must use the exact canonical lifecycle vocabulary from `2-execution-lifecycle.md`.

There is no second quasi-state vocabulary.

## 6. Required Sections

```text
1. Requirement
2. Context
3. Architecture
4. Dependencies
5. Scope
6. Out of Scope
7. Acceptance Criteria
8. Definition of Ready
9. Definition of Done
10. Complexity
11. Implementation Plan
12. Test Strategy
13. Security Requirements
14. Observability Requirements
15. Implementation Result
16. Tester Result
17. Reviewer Result
18. Security Result
19. Quality Gates
20. Observability Verification
21. Requirement Verification
22. Scope Verification
23. Final Status
24. Residual Risks
25. Evidence Index
```

Sections cannot silently disappear.

N/A requires:

```text
NOT_APPLICABLE
Reason: <objective reason>
```

## 7. Ownership

### Architect logical ownership

Sections 1–14.

### Implementer logical ownership

Section 15.

### Tester logical ownership

Section 16.

### Reviewer logical ownership

Section 17.

### Security logical ownership

Section 18.

### Control-plane logical ownership

Sections 19–23 and 25.

### Aggregated

Section 24.

Physical writer remains Supervisor for all sections.

## 8. Requirement

Must preserve user meaning faithfully.

The immutable verbatim requirement remains in Request Envelope and is referenced by hash/path.

Specification may normalize structure, not meaning.

## 9. Context

Evidence-based relevant context only.

Examples:

- existing architecture;
- related screens/API;
- shared patterns;
- legacy constraints.

## 10. Architecture

Defines intended fit with existing system:

- layers;
- patterns;
- integration points;
- data flow;
- routing;
- i18n;
- auth/tenant implications.

Prefer existing application patterns.

## 11. Dependencies

Each dependency is classified:

```text
AVAILABLE
REQUIRED
OPTIONAL
BLOCKING
```

May include sibling repo contract, test capability, external service, auth context.

## 12. Scope

Concrete bounded delivery scope.

Must support final scope verification.

## 13. Out of Scope

Mandatory.

Prevents opportunistic refactors and infrastructure drift.

## 14. Acceptance Criteria

Each criterion has stable ID:

```text
AC-01
AC-02
...
```

Criteria must be observable/testable.

Avoid vague wording.

## 15. Definition of Ready

Minimum:

```text
DOR-01 Requirement understood
DOR-02 Scope defined
DOR-03 Out of Scope defined
DOR-04 Contracts identified
DOR-05 Dependencies identified
DOR-06 Acceptance Criteria testable
DOR-07 Architecture path known
DOR-08 Required repository access available
DOR-09 Blocking product decisions resolved
DOR-10 Major risks recorded
```

Item statuses:

```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE
```

Overall:

```text
DOR = PASS
iff every required item = PASS
and every non-required item = justified NOT_APPLICABLE
```

Implementation requires overall DOR PASS.

## 16. Definition of Done

Minimum:

```text
DOD-01 Functional implementation complete
DOD-02 Acceptance Criteria satisfied
DOD-03 Unit tests updated/created when applicable
DOD-04 Required unit tests PASS
DOD-05 Integration validation PASS when applicable
DOD-06 UI/interface validation PASS when applicable
DOD-07 Error behavior validated
DOD-08 Tester PASS
DOD-09 Reviewer PASS
DOD-10 Security PASS
DOD-11 Observability valid
DOD-12 Required native gates PASS
DOD-13 Requirement Verification PASS
DOD-14 Scope Verification PASS
DOD-15 Final snapshot/diff integrity PASS
```

## 17. Complexity

Exactly one:

```text
MM
ME
CX
TR
```

with short evidence-based justification.

### MM

Localized low-risk.

### ME

Multi-file/layer, known architecture.

### CX

Complex integration/migration/significant risk.

### TR

Cross-cutting/platform/infrastructure architecture.

Agentic vNext = TR.

## 18. Implementation Plan

Actionable but not speculative.

Includes:

- ordered steps;
- expected areas;
- patterns/contracts to reuse;
- tests;
- integration points.

## 19. Test Strategy

For each category:

```text
unit
integration
UI/interface
error paths
validation
regression
acceptance
DOD
```

mark:

```text
REQUIRED
NOT_APPLICABLE with reason
```

Also define which checks require Supervisor Test Execution Broker.

## 20. Security Requirements

Specific to change.

If baseline only, state so explicitly.

## 21. Observability Requirements

Define operational requirements or justified N/A.

Baseline safety still applies even when no new telemetry is required.

## 22. Implementation Result

Projected by Supervisor from validated Implementer artifact.

Contains:

```text
Status
Summary
Files Changed
Tests Created/Updated
Findings Addressed
Known Limitations
Evidence references
Snapshot
```

## 23. Tester Result

Projected from validated Tester artifact.

Contains:

```text
Status
Test plan executed
Brokered host actions/evidence
Acceptance results
DOD items
Failures
Blocked checks
Snapshot
```

## 24. Reviewer Result

Independent result with findings/evidence/severity/snapshot.

## 25. Security Result

Independent result with findings/evidence/severity/snapshot.

## 26. Quality Gates

Supervisor-owned authoritative host results.

Reference artifacts, not huge raw logs.

## 27. Observability Verification

Allowed:

```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE with reason
```

## 28. Requirement Verification

Answers:

```text
Does current implementation satisfy exactly the Request Envelope + Acceptance Criteria?
```

Must compare against immutable request identity.

## 29. Scope Verification

Validates final actual changes against approved scope.

## 30. Final Status

Must equal canonical lifecycle state exactly.

No separate status vocabulary.

## 31. Residual Risks

Each risk:

```text
ID
Description
Impact
Likelihood
Mitigation
Owner
Blocking YES|NO
```

Blocking risk prevents completion.

## 32. Evidence Index

References:

- Request Envelope;
- Preflight Result;
- Architect artifact;
- Implementer artifacts;
- Tester artifacts;
- Reviewer artifacts;
- Security artifacts;
- brokered test evidence;
- gate artifacts;
- snapshot hashes;
- commit SHA;
- PR reference.

## 33. Versioning

Architect-semantic change after implementation begins:

```text
Specification version++
DOR reevaluated
affected downstream approvals invalidated
```

Role result append/projection does not change Architect semantic version.

## 34. Historical Immutability

Old role artifacts remain immutable.

Canonical Specification may update effective projections but must retain references to prior evidence.

## 35. Fresh-Agent Readability

A fresh role must understand its work from:

```text
Request Envelope
Execution Specification
current invocation metadata
relevant evidence
```

No chat-history dependency.

## 36. ALREADY_SATISFIED

A full Specification is not created when preflight concludes SATISFIED.

Audit source is:

```text
Request Envelope
+ Preflight Result Artifact
+ trusted base provenance
```

## 37. Validation Before Implementation

Supervisor validates:

- mandatory sections present;
- ownership metadata valid;
- complexity valid;
- DOR PASS;
- acceptance criteria non-empty;
- DOD non-empty;
- Scope and Out of Scope non-empty;
- Test Strategy present;
- Security Requirements present;
- Observability Requirements present.

Invalid Specification blocks Implementer invocation.

## 38. Template

```text
# Execution Specification

Schema Version:
Request ID:
Title:
Created At:
Updated At:
Base Branch:
Base SHA:
Work Branch:
Complexity:
Specification Version:
Lifecycle State:
Specification SHA256:

## 1. Requirement
## 2. Context
## 3. Architecture
## 4. Dependencies
## 5. Scope
## 6. Out of Scope
## 7. Acceptance Criteria
## 8. Definition of Ready
## 9. Definition of Done
## 10. Complexity
## 11. Implementation Plan
## 12. Test Strategy
## 13. Security Requirements
## 14. Observability Requirements
## 15. Implementation Result
## 16. Tester Result
## 17. Reviewer Result
## 18. Security Result
## 19. Quality Gates
## 20. Observability Verification
## 21. Requirement Verification
## 22. Scope Verification
## 23. Final Status
## 24. Residual Risks
## 25. Evidence Index
```

## 39. Invariants

1. Request identity precedes Specification.
2. One canonical Specification per implementation execution.
3. Supervisor is sole physical writer.
4. Logical ownership remains role-specific.
5. DOR PASS required before implementation.
6. DOD objectively verifiable.
7. Acceptance Criteria individually identifiable.
8. Complexity exactly MM/ME/CX/TR.
9. Scope and Out of Scope mandatory.
10. PASS requires evidence.
11. Semantic Specification changes invalidate affected approvals.
12. `agentic/plans/**` is not a competing source of truth.

## 40. Status

**Execution Specification v1.0 — IMPLEMENTATION READY**
