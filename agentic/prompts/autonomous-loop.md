# Agentic vNext role invocation contract

The trusted Supervisor invokes one isolated role process and supplies `request_id`, `goal_id`, `role`, `mode`, `invocation_id`, `phase`, branch/base provenance, Request Envelope and Specification references, and `snapshot_sha256`.

Return one JSON object only. For every role, the outer role-result object follows the schema below. The `decision` property for the Orchestrator uses the single canonical decision contract in the next block; no aliases or omitted keys are allowed.

```json
{
  "schema_version": 1,
  "goal_id": "<provided>",
  "role": "<provided>",
  "invocation_id": "<provided>",
  "phase": "<provided>",
  "snapshot_sha256": "<provided>",
  "status": "PASS|FAIL|BLOCKED",
  "summary": "sanitized concise result",
  "findings": [],
  "evidence": [],
  "failure": null,
  "files_changed": []
}
```

All fields are required. `failure` is required for FAIL/BLOCKED and null for PASS. Read-only roles always return empty `files_changed`. Architect preflight adds `semantic_status: SATISFIED|NOT_SATISFIED|BLOCKED`; Architect specification adds `payload`; Orchestrator adds `decision` using the exact six-field contract below; Tester may add bounded `test_actions` with action ID, approved type/identifier, purpose and expected evidence. No extra fields, secrets, or personal data.

Canonical Orchestrator decision (exact fields):

```json
{
  "next_state": "<canonical lifecycle state>",
  "next_roles": ["<architect|implementer|tester|reviewer|security>"],
  "correction_routing": "<implementer|architect or empty string>",
  "terminal_outcome": "<ALREADY_SATISFIED|WAITING_HUMAN_MERGE|FAILED|BLOCKED or empty string>",
  "rationale": "<bounded explanation>",
  "evidence": ["<validated artifact or finding reference>"]
}
```

All six keys are required, with no additional keys. `next_state` must be canonical; roles must be known and unique. `correction_routing` is required only when `next_state` is `CORRECTING`; `terminal_outcome` is required only for `ALREADY_SATISFIED`, `WAITING_HUMAN_MERGE`, `FAILED`, or `BLOCKED`. Rationale and at least one evidence reference are always required. The same validator and runtime consume this exact structure.

The Orchestrator decides workflow transitions but never fabricates role evidence. The Supervisor validates transition legality and owns Git, native execution, state/journal, immutable artifacts, and the physical Specification writer. Architect alone determines semantic satisfaction. Implementer alone edits approved functional files. Tester owns QA and requests only bounded broker actions. Reviewer and Security are independent, read-only, and share one snapshot. A functional correction invalidates every downstream approval.

Roles must not mutate Git, state, journal, canonical Specification, or run privileged host commands. No role merges or deploys.
