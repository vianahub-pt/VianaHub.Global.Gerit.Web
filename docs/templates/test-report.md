# Test Report Template

Use this template for QA validation reports. Save to `docs/stories/` alongside the story file.

---

# TEST-REPORT-XXX: [Story/Bug Title]

**Story/Bug:** STORY-XXX / BUG-XXX
**Tester:** QA_NAME
**Date:** YYYY-MM-DD
**Status:** PASS | FAIL | BLOCKED
**Build Version:** [commit hash or version]

---

## Automated Verification

| Check | Result | Notes |
|-------|--------|-------|
| `npm run lint` | ✅ PASS / ❌ FAIL | [errors if any] |
| `npm run build` | ✅ PASS / ❌ FAIL | [errors if any] |
| TypeScript compilation | ✅ PASS / ❌ FAIL | [errors if any] |

## BDD Scenario Validation

### Scenario 1: [Scenario Title]

**Given** [precondition]
**When** [action]
**Then** [expected outcome]

**Result:** ✅ PASS / ❌ FAIL

**Evidence:**
```
[Screenshots, logs, or API responses]
```

### Scenario 2: [Scenario Title]

**Given** [precondition]
**When** [action]
**Then** [expected outcome]

**Result:** ✅ PASS / ❌ FAIL

**Evidence:**
```
[Screenshots, logs, or API responses]
```

### Scenario 3: [Edge Case]

**Given** [precondition]
**When** [action]
**Then** [expected outcome]

**Result:** ✅ PASS / ❌ FAIL

**Evidence:**
```
[Screenshots, logs, or API responses]
```

## Functional Testing

| Area | Result | Notes |
|------|--------|-------|
| UI Rendering | ✅ PASS / ❌ FAIL | |
| Responsive Design | ✅ PASS / ❌ FAIL | |
| i18n (pt-PT) | ✅ PASS / ❌ FAIL | |
| i18n (en-US) | ✅ PASS / ❌ FAIL | |
| i18n (es-ES) | ✅ PASS / ❌ FAIL | |
| Auth Flow | ✅ PASS / ❌ FAIL | |
| API Integration | ✅ PASS / ❌ FAIL | |
| Error Handling | ✅ PASS / ❌ FAIL | |
| Loading States | ✅ PASS / ❌ FAIL | |
| Empty States | ✅ PASS / ❌ FAIL | |

## Edge Cases Tested

| Edge Case | Result | Notes |
|-----------|--------|-------|
| Unauthenticated access | ✅ PASS / ❌ FAIL | |
| Invalid input | ✅ PASS / ❌ FAIL | |
| Network error | ✅ PASS / ❌ FAIL | |
| Permission denied | ✅ PASS / ❌ FAIL | |
| Empty data | ✅ PASS / ❌ FAIL | |

## Bugs Found

| Bug ID | Severity | Description | Status |
|--------|----------|-------------|--------|
| BUG-XXX | S1/S2/S3/S4 | [description] | Open/Fixed |

## Summary

**Total Scenarios:** X
**Passed:** X
**Failed:** X
**Blocked:** X

**Overall Result:** ✅ PASS / ❌ FAIL

**Recommendation:** [ ] Approved for production / [ ] Needs fixes / [ ] Blocked

**Sign-off:** [QA_NAME] - [DATE]

---

## Example

```markdown
# TEST-REPORT-001: User Login

**Story:** STORY-001
**Tester:** QA-maria
**Date:** 2026-01-21
**Status:** PASS
**Build Version:** a1b2c3d

---

## Automated Verification

| Check | Result | Notes |
|-------|--------|-------|
| `npm run lint` | ✅ PASS | 0 errors |
| `npm run build` | ✅ PASS | Build successful |
| TypeScript compilation | ✅ PASS | No type errors |

## BDD Scenario Validation

### Scenario 1: Successful Login

**Given** I am on the login page,
**When** I enter valid email and password and click "Login",
**Then** I am redirected to the workspace dashboard.

**Result:** ✅ PASS

**Evidence:**
```
Screenshot: login-success.png
Console: No errors
Network: POST /api/gerit/auth/login → 200 OK
         GET /workspace/ → 200 OK
```

### Scenario 2: Invalid Credentials

**Given** I am on the login page,
**When** I enter invalid email or password,
**Then** I see an error message "Credenciais inválidas".

**Result:** ✅ PASS

**Evidence:**
```
Screenshot: login-invalid.png
Toast: "Credenciais inválidas" displayed
```

### Scenario 3: Empty Fields

**Given** I am on the login page,
**When** I click "Login" without entering credentials,
**Then** I see validation errors for required fields.

**Result:** ✅ PASS

**Evidence:**
```
Screenshot: login-validation.png
Messages: "Email é obrigatório", "Password é obrigatório"
```

## Functional Testing

| Area | Result | Notes |
|------|--------|-------|
| UI Rendering | ✅ PASS | Form renders correctly |
| Responsive Design | ✅ PASS | Works on mobile, tablet, desktop |
| i18n (pt-PT) | ✅ PASS | All text in Portuguese |
| i18n (en-US) | ✅ PASS | English translation works |
| i18n (es-ES) | ✅ PASS | Spanish translation works |
| Auth Flow | ✅ PASS | Login → redirect → session active |
| API Integration | ✅ PASS | Correct headers, tenant ID |
| Error Handling | ✅ PASS | Toast notifications work |
| Loading States | ✅ PASS | Spinner on button during submit |
| Empty States | ✅ PASS | N/A for this feature |

## Edge Cases Tested

| Edge Case | Result | Notes |
|-----------|--------|-------|
| Unauthenticated access | ✅ PASS | Redirects to login |
| Invalid input | ✅ PASS | Validation messages shown |
| Network error | ✅ PASS | Error toast displayed |
| Permission denied | ✅ PASS | N/A for login |
| Empty data | ✅ PASS | N/A for login |

## Bugs Found

| Bug ID | Severity | Description | Status |
|--------|----------|-------------|--------|
| None | — | — | — |

## Summary

**Total Scenarios:** 3
**Passed:** 3
**Failed:** 0
**Blocked:** 0

**Overall Result:** ✅ PASS

**Recommendation:** [x] Approved for production / [ ] Needs fixes / [ ] Blocked

**Sign-off:** QA-maria - 2026-01-21
```
