# Bug Report Template

Use this template for all bug reports. Save to `docs/stories/bugs/BUG-XXX-title.md`.

---

# BUG-XXX: [Title]

**Severity:** S1/S2/S3/S4
**Priority:** P0/P1/P2/P3
**Status:** Open | In Progress | Fixed | Verified | Closed | Reopened
**Reported by:** QA_NAME
**Assigned to:** DEVELOPER_NAME
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD
**Related Story:** STORY-XXX (if applicable)

---

## Description

[Clear, concise description of the bug]

## Environment

- **Browser:** Chrome/Firefox/Safari/Edge + version
- **OS:** Windows/macOS/Linux
- **URL:** [affected URL]
- **User Role:** [admin/user/guest]
- **Tenant:** [tenant name/ID if applicable]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Step 3]
4. ...

## Expected Result

[What should happen according to acceptance criteria]

## Actual Result

[What actually happens]

## Screenshots/Logs

```
[Paste relevant logs, error messages, or screenshots]
```

## Impact

- **Users Affected:** [all users / specific role / specific tenant]
- **Frequency:** [always / sometimes / rarely]
- **Workaround:** [available workaround or "None"]

## Technical Notes

- **Affected Layers:** [ ] core/ [ ] platform/ [ ] domains/ [ ] shared/ [ ] app/
- **API Endpoint:** [if API related]
- **Console Errors:** [browser console output]
- **Network Errors:** [failed requests]

## Acceptance Criteria Reference

[Reference to the acceptance criteria that failed, if from a user story]

---

## Example

```markdown
# BUG-001: Login Redirect Loop

**Severity:** S2
**Priority:** P1
**Status:** Open
**Reported by:** QA-maria
**Assigned to:** dev-joao
**Created:** 2026-01-20
**Updated:** 2026-01-20
**Related Story:** STORY-001

---

## Description

After successful login, user is redirected back to login page instead of workspace dashboard.

## Environment

- **Browser:** Chrome 120.0
- **OS:** Windows 11
- **URL:** https://app.gerit.com/login/
- **User Role:** admin
- **Tenant:** demo-tenant

## Steps to Reproduce

1. Navigate to https://app.gerit.com/login/
2. Enter valid email: admin@example.com
3. Enter valid password: ********
4. Click "Login" button
5. Observe redirect

## Expected Result

User is redirected to /workspace/ dashboard after successful login.

## Actual Result

User is redirected to /login/ again, creating an infinite loop.

## Screenshots/Logs

```
Console Error: Uncaught (in promise) Error: NEXT_REDIRECT
Network: POST /api/gerit/auth/login → 200 OK
Network: GET /workspace/ → 302 → /login/
```

## Impact

- **Users Affected:** All users
- **Frequency:** Always
- **Workaround:** None

## Technical Notes

- **Affected Layers:** [x] platform/ [x] app/
- **API Endpoint:** POST /api/gerit/auth/login
- **Console Errors:** NEXT_REDIRECT error
- **Network Errors:** 302 redirect loop

## Acceptance Criteria Reference

Scenario 1 of STORY-001: "Given I am on the login page, When I enter valid email and password and click 'Login', Then I am redirected to the workspace dashboard."
```
