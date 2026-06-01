# Docs - Stories

This directory contains all user stories, bug reports, and test reports for the Gerit project.

## Directory Structure

```
docs/
├── stories/
│   ├── epics/                    # Epic definitions
│   │   └── EPIC-XXX-title.md
│   ├── bugs/                     # Bug reports
│   │   └── BUG-XXX-title.md
│   ├── STORY-XXX-title.md        # User stories
│   └── TEST-REPORT-XXX.md        # Test reports (alongside stories)
├── templates/
│   ├── user-story.md             # User story template
│   ├── bug-report.md             # Bug report template
│   └── test-report.md            # Test report template
└── README.md                     # This file
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Epic | `EPIC-XXX-title.md` | `EPIC-001-user-authentication.md` |
| Story | `STORY-XXX-title.md` | `STORY-001-user-login.md` |
| Bug | `BUG-XXX-title.md` | `BUG-001-login-redirect.md` |
| Test Report | `TEST-REPORT-XXX.md` | `TEST-REPORT-001.md` |

## Workflow

1. **PO** creates stories in `docs/stories/` using `templates/user-story.md`
2. **DEVELOPER** implements features following acceptance criteria
3. **QA** validates and creates test reports using `templates/test-report.md`
4. **QA** reports bugs using `templates/bug-report.md`

## Statuses

| Story Status | Description |
|--------------|-------------|
| Draft | Initial creation, not ready for development |
| Ready | Refined and ready for sprint |
| In Progress | DEVELOPER is implementing |
| In Review | Implementation complete, awaiting QA |
| Done | QA approved, deployed |

| Bug Status | Description |
|------------|-------------|
| Open | Bug reported, awaiting triage |
| In Progress | DEVELOPER is fixing |
| Fixed | Fix implemented, awaiting verification |
| Verified | QA confirmed fix |
| Closed | Bug resolved |
| Reopened | Fix did not resolve the issue |

## Priority Levels

| Priority | Label | SLA |
|----------|-------|-----|
| P0 | Critical | Same day |
| P1 | High | 1-2 days |
| P2 | Medium | 3-5 days |
| P3 | Low | Next sprint |

## Severity Levels (Bugs)

| Severity | Label | Description |
|----------|-------|-------------|
| S1 | Critical | App crashes, data loss, security |
| S2 | High | Feature broken, no workaround |
| S3 | Medium | Partially working, workaround exists |
| S4 | Low | Cosmetic, minor issue |
