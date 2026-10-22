# Agentic vNext control plane

The frozen implementation contract is `docs/agentic/1-architecture.md` through `7-acceptance-tests.md`. This directory contains local execution state, immutable request/result evidence, the current audit journal, and one canonical Execution Specification per request. The Request Envelope → Preflight Result → Execution Specification → state/journal/evidence chain is authoritative. `ai-memory` is OPTIONAL AUXILIARY and never a source of truth. `agentic/plans/**` is not a planning authority.

## User flow

The Desktop Front Door creates an immutable Request Envelope and calls the local `agentic-supervisor` MCP tools `start_request`, `resume_request`, or `get_status`. The bridge exposes no general shell or arbitrary filesystem operation. It starts the trusted Supervisor Host locally; normal use does not require manual PowerShell commands.

## Authority and lifecycle

The Orchestrator decides workflow transitions. The Supervisor validates and persists them and alone performs privileged host work, Git operations, state/journal writes, immutable artifact persistence, Specification projections, bounded test actions, native gates, and final verification. Architect owns semantic preflight and planning. Implementer alone edits functional files in approved scope. Tester owns QA judgment and can request only allowlisted broker actions. Reviewer and Security run independently, read-only, against the same snapshot. A functional correction invalidates Tester, Reviewer, Security and downstream evidence.

Canonical lifecycle: `IDLE → REQUEST_ACCEPTED → PREFLIGHT_PREPARING → PREFLIGHT_ANALYZING → ALREADY_SATISFIED | BRANCH_PREPARED → ARCHITECTURE → DOR_VALIDATION → IMPLEMENTING → TESTING → REVIEWING → QUALITY_GATES → OBSERVABILITY_VERIFICATION → REQUIREMENT_VERIFICATION → SCOPE_DIFF_VERIFICATION → READY_TO_COMMIT → READY_TO_PR → WAITING_HUMAN_MERGE`. Corrections use `CORRECTING → IMPLEMENTING → TESTING → REVIEWING`. Quota and external blockers preserve checkpoint identity through `WAITING_FOR_QUOTA` / `BLOCKED` and `RESUMING`. No automatic merge or deploy occurs.

## Local artifacts

`state/requests/<request-id>.json` is immutable and must retain the exact user requirement. `state/preflight/<request-id>.json` records Architect evidence against the exact fetched remote base. `specifications/<request-id>.md` is the sole planning artifact and is physically written only by Supervisor from validated role artifacts. `state/results/**` stores immutable invocation evidence. `journal/current.md` is supervisor-owned append-only audit data. Never place secrets or unnecessary personal data in these files.

## Validation

Run the deterministic fixtures in `scripts/agentic-supervisor-tests.ps1` for local state and contract coverage. Final repository-native gates are selected from real package configuration and executed by the trusted Supervisor Host against the approved snapshot. A technical gate PASS does not establish requirement completion; explicit observability, requirement, scope/diff and snapshot checks remain mandatory.
