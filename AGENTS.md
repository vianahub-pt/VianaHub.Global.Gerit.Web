# VianaHub.Global.Front.Gerit — AGENTS.md

## Stack

- **Next.js 15** (App Router) + **React 18** + **TypeScript 5** (strict)
- **Tailwind CSS 3** + `tailwind-merge` + `tailwindcss-animate`
- **shadcn/ui** (Radix primitives: dialog, select, radio-group, toast, tooltip, label, slot)
- **i18n** via `next-i18next` — locales in `locales/{locale}/common.json` (default: pt-PT)
- **State/fetch**: local state + React Query (`@tanstack/react-query`); HTTP via `useHttpClient()` or `fetchWithAuth()` from `platform/auth`
- **Logging**: `winston`
- **No test framework installed**

## Architecture layers

| Layer | Purpose |
|-------|---------|
| `core/` | Config, constants, env, errors, types, utils — no React |
| `platform/` | Cross-cutting: auth, i18n, API (http, adapters, contracts, mappers), query, storage, access-control, tenant, subscription, entitlements, providers |
| `domains/` | Business domains: `operations/clients`, `operations/users`, `operations/vehicles`, `operations/teams`, etc.; `identity/`, `catalogs/`, `platform-admin/`, `workspace/` |
| `shared/` | Reusable UI: `hub-grid/`, `data-table/`, `ui/` (shadcn), `layout/`, `forms/`, `feedback/`, `upload/`, `guards/` |
| `app/` | Next.js App Router pages — thin wrappers importing from `domains/` |

## Essential commands

```bash
npm run dev          # next dev (dev server)
npm run build        # next build (static export compatible)
npm run lint         # next lint (eslint next/core-web-vitals + next/typescript)
npm run clean        # removes .next/ out/ tsconfig.tsbuildinfo
npx tsc --project tsconfig.typecheck.json --noEmit   # full typecheck
```

## API conventions

- All backend calls go through proxy: `/api/gerit/v1/{resource}/...`
- Use `fetchWithAuth` from `useAuth()` (handles JWT, auto-redirect on 401)
- Never call the backend directly from the browser
- Endpoints follow REST: `GET /paged`, `GET /{id}`, `POST`, `PUT`, `PATCH /activate|deactivate`, `DELETE`
- Paged responses use: `items[]`, `totalItems`, `pageNumber`, `pageSize`, `totalPages`
- Query params: `Search`, `PageNumber`, `PageSize`, `SortBy`, `SortDirection`, `IsActive`

## HubGrid (shared component)

The `HubGrid` component (`shared/hub-grid/hub-grid.tsx`) is the standard data table across all operations pages. Props:

- `columns: HubGridColumn<Item>[]` — each with `key`, `label`, optional `sortable`, `cellClassName`
- `renderRowCells: (item) => ReactNode[]` — must return nodes in same order as columns
- `renderStatus`, `renderActions` — optional status/action columns
- `rowDensity`, `densityOptions`, `onDensityChange`
- `sortBy`, `sortDirection`, `onSort`
- `statusFilter`, `statusFilterOptions`, `onStatusFilterChange`
- `searchValue`, `onSearchChange`, `searchPlaceholder`
- `loading`, `loadingText`, `emptyText`
- `page`, `totalPages`, `pageButtons`, `onPageChange`
- `pageSize`, `pageSizeOptions`, `onPageSizeChange`
- `getRowKey`, `onRowClick` — optional row selection/click

See existing pages for copy-paste patterns: `domains/operations/clients/clients-page.tsx`, `domains/operations/users/users-page.tsx`.

## Operations page pattern

Every operations page follows the same structure in `domains/operations/{resource}/`:
1. `{resource}-models.ts` — `interface ResourceItem { id; name; phone; email; isActive; ... }`
2. `{resource}-utils.ts` — `normalizeResource()`, `parsePagedResources()`, `normalizeErrorMessage()`
3. `{resource}-page.tsx` — `export function ResourcePage()` with full HubGrid + toolbar + CRUD
4. `{resource}-details.tsx` (optional) — detail/create/edit form
5. `index.ts` — exports module config + pages
6. `app/(workspace)/operations/{resource}/page.tsx` — thin server component wrapping the domain page

## Key patterns to follow

- **Path alias**: `@/*` always (e.g., `@/platform/auth`, `@/shared/hub-grid`)
- **Component naming**: `PascalCase` for components, `camelCase` for hooks/functions
- **Client components**: add `"use client"` at top of any file using hooks or browser APIs
- **i18n keys**: add to `locales/pt-PT/common.json`, `locales/en-US/common.json`, `locales/es-ES/common.json` in the same structure
- **HubGrid density labels**: key `{resource}.grid.density.slow|medium|expanded`
- **Page size options**: `[10, 20, 50, 100, 500, 1000]` — defined as `const PAGE_SIZE_OPTIONS`
- **Status filter types**: `"active" | "inactive" | "all"`
- **Sort columns**: defined as a union type `type SortColumn = "Name" | "Email" | ...`
- **Pagination**: `pageButtons` computed in-page (5 buttons max), `pageCaption` using `t("hubgrid.itemsLabel", { count })`
- **Responses**: always check `response.ok`, parse with `.json().catch(() => null)`, use `normalizeErrorMessage()` for fallback

## Http client vs fetchWithAuth

- `fetchWithAuth` (from `useAuth()`) adds JWT and base URL — use for all backend calls
- `useHttpClient()` (from `platform/api`) — alternative but less common; `useAuth`'s `fetchWithAuth` is the pattern in all current pages
- For files/FormData, pass `body: formData` without `Content-Type` header (browser sets multipart)

## Query keys

Centralized in `platform/query/query-keys.ts` — scope by `tenantId` when applicable.
Import as `import { queryKeys } from '@/platform/query'`.

## Important config

- `trailingSlash: true` in `next.config.mjs` — append `/` to all internal links
- `images: { unoptimized: true }` — compatible with Azure Static Web Apps static export
- Azure SWA config in `staticwebapp.config.json` (CSP, X-Frame-Options, etc.)
- TypeScript `strict: true`, `moduleResolution: "bundler"`, path mapping `@/*` → `./*`
- `tsconfig.typecheck.json` extends base, used for `npx tsc` commands
- Node engine: `>=20.19.0 <23`, npm `>=10`

## OpenCode agents

Located in `.opencode/agents/`:
- `developer.md` — Kanban flow, `gh` commands, implementation checklist
- `po.md` — issue creation format, Definition of Ready checklist
- `qa.md` — validation workflow, test report template

## Workflow Automation

### Regra Geral
Os agentes devem ser invocados **automaticamente** sem pedir confirmação ao utilizador.
A **única intervenção humana** é aprovar o PR no GitHub.

### Fluxo Automatizado

| Etapa | Agente | Ação Automática |
|-------|--------|-----------------|
| 1. Issue criada | PO | Invoca Developer automaticamente |
| 2. Implementação concluída | Developer | Invoca QA automaticamente |
| 3. QA valida (APROVADO) | QA | Move para For Deploy automaticamente |
| 4. QA encontra bug Crítico/Alto | QA | Invoca Developer automaticamente |
| 5. QA encontra bug Médio/Baixo | QA | Escala para utilizador (única exceção) |
| 6. Mesmo bug 2x | QA | Escala para utilizador |
| 7. PR pronto | — | Utilizador aprova manualmente |

### Exceções (intervenção humana necessária)
1. **Aprovação do PR** — utilizador deve revisar e aprovar no GitHub
2. **Bug Médio/Baixo** — utilizador decide se corrige agora ou aceita com ressalva
3. **Mesmo bug reportado 2 vezes** — utilizador decide próximo passo

### Regras de Invocação
- **NÃO** pedir confirmação antes de invocar o próximo agente
- **SEMPRE** invocar o próximo agente automaticamente após completar a tarefa
- **EXCETO** quando o utilizador precisa decidir (bugs médios/baixos ou escalação)

## Docs structure

```
docs/
├── stories/          # User stories (STORY-XXX-title.md)
│   ├── epics/        # Epic definitions (EPIC-XXX-title.md)
│   └── bugs/         # Bug reports (BUG-XXX-title.md)
├── templates/        # Story, bug, test report templates
└── README.md
```

## What this project does NOT have

- No test framework (no Jest, no Playwright, no Cypress in `package.json`)
- No pre-commit hooks / Husky
- No CI workflow files in `.github/`
- No codegen, migrations, or build artifacts
