# User Story Template

Use this template for all user stories. Save to `docs/stories/STORY-XXX-title.md`.

---

# STORY-XXX: [Title]

**Epic:** EPIC-XXX
**Priority:** P0/P1/P2/P3
**Status:** Draft | Ready | In Progress | In Review | Done
**Assignee:** DEVELOPER_NAME
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

---

## Description

[Short description of the feature from the user's perspective]

## User Story

**As a** [user role],
**I want to** [action/goal],
**So that** [benefit/value].

## Acceptance Criteria

### Scenario 1: [Scenario Title]

**Given** [precondition/context],
**When** [action/event],
**Then** [expected outcome].

### Scenario 2: [Scenario Title]

**Given** [precondition/context],
**When** [action/event],
**Then** [expected outcome].

### Scenario 3: [Edge Case]

**Given** [precondition/context],
**When** [action/event],
**Then** [expected outcome].

## Technical Notes

- **Affected Layers:** [ ] core/ [ ] platform/ [ ] domains/ [ ] shared/ [ ] app/
- **API Endpoints:** [list any API changes]
- **Database Changes:** [list any schema changes]
- **i18n Keys:** [list new keys to add]
- **Dependencies:** [list any new dependencies]

## UI/UX Requirements

- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Loading state
- [ ] Error state
- [ ] Empty state
- [ ] Accessibility (ARIA labels, keyboard navigation)

## Out of Scope

- [Items explicitly not included in this story]

## Definition of Done

- [ ] Code implemented following project conventions
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] i18n keys added for pt-PT, en-US, es-ES
- [ ] All acceptance criteria validated by QA
- [ ] Code reviewed
- [ ] Deployed to test environment

---

## Example

```markdown
# STORY-001: User Login

**Epic:** EPIC-001
**Priority:** P1
**Status:** Ready
**Assignee:** dev-joao
**Created:** 2026-01-15
**Updated:** 2026-01-15

---

## Description

Allow users to authenticate using email and password to access the workspace.

## User Story

**As a** registered user,
**I want to** log in with my email and password,
**So that** I can access the application and my workspace.

## Acceptance Criteria

### Scenario 1: Successful Login

**Given** I am on the login page,
**When** I enter valid email and password and click "Login",
**Then** I am redirected to the workspace dashboard.

### Scenario 2: Invalid Credentials

**Given** I am on the login page,
**When** I enter invalid email or password,
**Then** I see an error message "Credenciais inválidas".

### Scenario 3: Empty Fields

**Given** I am on the login page,
**When** I click "Login" without entering credentials,
**Then** I see validation errors for required fields.

## Technical Notes

- **Affected Layers:** [x] app/ [x] platform/ [x] shared/
- **API Endpoints:** POST /api/gerit/auth/login
- **Database Changes:** None
- **i18n Keys:** login.title, login.email, login.password, login.submit, login.error.invalid
- **Dependencies:** None

## UI/UX Requirements

- [x] Responsive design
- [x] Loading state (spinner on button)
- [x] Error state (alert below form)
- [x] Empty state (validation messages)
- [x] Accessibility

## Out of Scope

- Social login (Google, Microsoft)
- Two-factor authentication
- Remember me functionality

## Definition of Done

- [ ] Code implemented
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] i18n keys added
- [ ] All acceptance criteria validated
- [ ] Code reviewed
- [ ] Deployed
```
