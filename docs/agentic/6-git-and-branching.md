# Agentic vNext — Git and Branching
Version: **1.0**
Status: **IMPLEMENTATION READY**

## 1. Purpose

Define trusted base, branch creation, staging, commit, push, PR and merge boundaries.

## 2. Git Authority

Only Supervisor Host performs mutable Git.

Specialized roles may use policy-permitted read-only Git inspection.

## 3. Protected Bases

```text
feature/fix → develop
hotfix      → main
```

Direct commit/push to `develop` or `main` is forbidden.

## 4. Trusted Base

Trusted source:

```text
git fetch origin
→ origin/develop or origin/main
→ exact SHA captured
```

Local base branch is not authoritative.

## 5. Semantic Preflight Before Branch

Canonical order:

```text
Request Envelope
→ Supervisor fetch
→ capture trusted base SHA
→ Architect preflight read-only against trusted base
```

If SATISFIED:

```text
ALREADY_SATISFIED
NO_CHANGES
no functional branch
```

If NOT_SATISFIED:

```text
fresh work branch
```

## 6. Working Tree Safety

Before mutable preparation detect:

- staged/unstaged functional changes;
- untracked functional files;
- merge/rebase/cherry-pick states;
- unexpected branch state.

Never silently discard user work.

Forbidden normal recovery:

```text
reset --hard
clean -fd
destructive checkout
```

## 7. Fresh Single-Use Branch

One implementation execution uses one fresh branch.

Allowed prefixes:

```text
feature/
fix/
hotfix/
```

Recommended:

```text
feature/<request-id>
fix/<request-id>
hotfix/<request-id>
```

Correction loops stay on same branch.

Different requirement = different branch.

Re-run after merge = never reuse old branch.

## 8. Existing Branch Rejection

Proposed branch must not already exist locally or remotely.

If it exists:

- reject it;
- derive a fresh unique branch identity;
- never silently continue on it.

## 9. Branch Creation

Must prove:

```text
branch created from exact captured origin/<base> SHA
current branch == expected branch
base provenance matches
```

Equivalent implementation is allowed if evidence proves these invariants.

## 10. Base Drift

If origin base moves later, do not silently rewrite history.

Any rebase/merge-base-update policy must be explicit.

Default: preserve original captured base identity and surface real integration issues.

## 11. Forbidden Git

Normal Agentic flow must not use:

```text
push --force
push --force-with-lease
reset --hard
clean -fd
clean -fdx
direct push develop/main
automatic merge
branch protection changes
```

## 12. Read-Only Sibling Repository Discovery

A target Web requirement may inspect API repository read-only.

This does not authorize sibling-repo mutation.

Multi-repo mutation requires explicit architecture/scope.

## 13. Staging

Supervisor stages only approved requirement paths.

Avoid broad staging when unrelated files could enter.

Canonical:

```text
resolve approved paths
→ scope validation
→ stage exact paths
→ recalculate staged paths
→ compare expected vs actual
```

## 14. Staged Integrity

Before commit verify:

- no unexpected staged files;
- all required files staged;
- staged content matches approved snapshot;
- no working-tree divergence for staged functional files;
- `git diff --cached --check` PASS.

Mismatch invalidates readiness.

## 15. Commit

Only after `READY_TO_COMMIT`.

Supervisor creates commit.

Commit message follows repo convention and real scope.

No fabricated ticket IDs.

## 16. Commit Scope

Commit contains only approved versioned content.

Transient state/log/result artifacts remain uncommitted unless architecture explicitly classifies them as versioned.

## 17. Push

Only Supervisor.

Target:

```text
validated current work branch
```

Never develop/main.

Push failure does not trigger force push.

## 18. PR

Created only after successful validated commit/push.

Target:

```text
feature/fix → develop
hotfix      → main
```

After creation verify:

```text
repository
open state
head branch
base branch
expected commit
```

Only then transition to `WAITING_HUMAN_MERGE`.

## 19. Human Merge Boundary

Agentic stops at PR.

No automatic:

- approve;
- merge;
- squash merge;
- rebase merge;
- deploy.

## 20. Git Provenance

Persist at least:

```text
request_id
repository
remote
base_branch
base_sha
preflight artifact reference
work_branch when created
branch_created_at
commit_sha
push_target
PR number
PR URL
PR base
PR head
```

## 21. Failure Categories

Recommended:

```text
REMOTE_SYNC_FAILURE
DIRTY_WORKTREE
BASE_RESOLUTION_FAILURE
PREFLIGHT_BASE_MISMATCH
STALE_OR_REUSED_BRANCH
BRANCH_CREATION_FAILURE
BASE_PROVENANCE_MISMATCH
STAGING_SCOPE_FAILURE
STAGED_DIFF_FAILURE
COMMIT_FAILURE
PUSH_FAILURE
PR_CREATION_FAILURE
PR_VERIFICATION_FAILURE
PROTECTED_BRANCH_VIOLATION
```

## 22. Disaster Recovery

Manual Git by user is outside normal flow and only for exceptional control-plane/repository recovery.

Routine preparation must not be delegated to user.

## 23. Invariants

1. Fetch before trusted-base decision.
2. Remote-tracking ref is authoritative.
3. Exact base SHA captured.
4. Semantic preflight occurs before functional branch.
5. Implementation branch is fresh/single-use.
6. Existing stale branch is never reused.
7. Only Supervisor mutates Git.
8. No protected-branch push.
9. No force push/destructive cleanup.
10. Staging is scope-limited.
11. Staged snapshot equals approved snapshot.
12. Commit only after readiness.
13. Push only expected branch.
14. PR head/base/commit verified.
15. Merge/deploy human-controlled.
16. Git provenance auditable.

## 24. Status

**Git and Branching v1.0 — IMPLEMENTATION READY**
