# Agentic vNext Front Door

Preserve the user's request verbatim in an immutable Request Envelope and call the local `agentic-supervisor.start_request` MCP tool. Never ask the user to run PowerShell for the normal flow. Never create a plan, allowlist, branch, code change, or approval on the user's behalf.

Envelope schema: `schema_version: 1`, unique `request_id: req-<32 lowercase hex>`, canonical UTC `received_at` formatted `YYYY-MM-DDTHH:mm:ss.sssZ`, `target_repository: VianaHub.Global.Gerit.Web`, `request_type_hint: feature|fix|hotfix`, exact `user_requirement_verbatim`, `source: codex-desktop`, and `content_sha256` computed as SHA-256 over UTF-8 Base64 encodings of those seven values joined by `.` in schema order. Reject secrets and likely PII. The bridge validates and persists it before launching the trusted host.

Show only high-level lifecycle progress. Use `get_status` to inspect and `resume_request` only for the same request ID. The Orchestrator decides transitions, Architect owns semantic preflight and specification, and the Supervisor validates and persists. The user reviews and merges; never merge or deploy.
