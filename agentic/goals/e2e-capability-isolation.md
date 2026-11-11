ID: e2e-capability-isolation
Title: Isolate canonical E2E capability journeys
Base branch: develop
Branch prefix: fix
Allowed files: .github/workflows/ci.yml, package.json, playwright.config.ts, scripts/e2e/run-capability.mjs

## Objective

Remove cross-capability coupling from canonical Playwright E2E execution.

Actions, UserPreferences and future capabilities must execute through an exact capability-specific canonical journey selection rather than sharing a capability-enumerating Playwright regex or misleading Actions-only CI command.

This is an infrastructure-only correction. Do not modify product code or existing canonical journey specs.

## Discovery requirements

Inspect the current versions of:

- .github/workflows/ci.yml
- package.json
- playwright.config.ts
- tests/e2e/actions-journey.spec.ts
- tests/e2e/user-preferences-journey.spec.ts
- scripts/e2e/prepare-build.mjs
- scripts/e2e/start-server.mjs

Confirm the existing coupling before implementation.

Keep the implementation limited to the four Allowed files.

## Acceptance criteria

1. Add a generic command:

   npm run test:e2e:capability -- <slug>

2. The capability runner must:
   - validate slugs using ^[a-z0-9]+(?:-[a-z0-9]+)*$
   - derive exactly tests/e2e/<slug>-journey.spec.ts
   - verify the canonical file exists before Playwright starts
   - reject malformed and unknown capabilities before Playwright
   - never fall back to running all journeys
   - use argument arrays and shell:false
   - work on Windows and Linux
   - pass Playwright a forward-slash spec path while using native filesystem paths for validation
   - resolve the Playwright CLI from installed package metadata rather than hard-coding an internal path

3. playwright.config.ts must:
   - use generic canonical *-journey.spec.ts matching
   - not enumerate Actions, UserPreferences or future capability names
   - use zero functional retries for the canonical stateful journey project
   - preserve unrelated Playwright retry behavior
   - preserve current E2E_VISUAL headed/maximized/viewport-null/slowMo behavior

4. CI must:
   - execute Actions and UserPreferences independently through the generic capability runner
   - identify the actual capability in job and artifact names
   - use an explicit matrix containing actions and user-preferences
   - use max-parallel: 1 for shared backend mutation
   - use concurrency group gerit-shared-e2e
   - queue rather than cancel pending shared E2E work
   - pin the E2E runner to ubuntu-24.04
   - use at most 3 bounded retries for Playwright Chromium installation
   - keep browser-install retry separate from functional Playwright retry

5. Remove test:e2e:actions-ci if repository search proves it has no remaining consumer after CI migration.

6. Do not add dependencies.

7. Do not modify:
   - tests/e2e/actions-journey.spec.ts
   - tests/e2e/user-preferences-journey.spec.ts
   - domains/**
   - platform/**
   - core/**
   - locales/**
   - .github/workflows/deploy.yml
   - any production feature code

8. Adding a future teams-journey.spec.ts must not require editing playwright.config.ts.

## Validation requirements

Supervisor-host validation must include all applicable canonical gates plus:

- npm test
- npm run lint
- npx tsc --project tsconfig.typecheck.json --noEmit
- npm run build
- git diff --check

Negative cases:

- npm run test:e2e:capability -- does-not-exist
  must fail before Playwright starts

- npm run test:e2e:capability -- ../actions
  must fail before Playwright starts

Canonical acceptance:

- npm run test:e2e:capability -- actions
  must execute exactly one Actions canonical journey and PASS

- npm run test:e2e:capability -- user-preferences
  must execute exactly one UserPreferences canonical journey and PASS

Final scope audit must prove only the four Allowed files are functionally changed.

## Security/production restrictions

- No production changes.
- No deployment.
- No changes to GitHub branch protection or rulesets.
- No secrets or credentials in repository artifacts.
- No automatic merge.
- Human merge is mandatory.
- Delivery must finish at WAITING_HUMAN_MERGE.
