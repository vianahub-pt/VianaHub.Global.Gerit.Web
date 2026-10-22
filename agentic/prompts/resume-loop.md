# Agentic vNext Resume

Resume only the exact `request_id` through `agentic-supervisor.resume_request`. The Supervisor validates the immutable Request Envelope and hash, state/journal, branch and captured base SHA, Specification version/hash when present, snapshot and evidence references. Resume preserves the same execution identity and branch; it never creates a replacement branch.

`WAITING_FOR_QUOTA` resumes only at its persisted eligible time. `BLOCKED` resumes only after its documented external condition is resolved. Terminal states `ALREADY_SATISFIED`, `FAILED`, and `WAITING_HUMAN_MERGE` cannot resume. Do not rewrite state, journal, Specification, or evidence artifacts.
