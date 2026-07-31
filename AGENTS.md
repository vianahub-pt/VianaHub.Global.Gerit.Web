# VianaHub.Global.Gerit.Web — AGENTS.md

Este documento define a arquitetura, convenções técnicas e fluxo automatizado dos agentes de IA do projeto **VianaHub.Global.Gerit.Web**.

Toda e qualquer comunicação com o usuário, issues, comentários e relatórios no GitHub Projects deve ser feita em **português do Brasil**.

---

## Stack

- **Next.js 15** (App Router) + **React 18** + **TypeScript 5** (strict)
- **Tailwind CSS 3** + `tailwind-merge` + `tailwindcss-animate`
- **shadcn/ui** (Radix primitives: dialog, select, radio-group, toast, tooltip, label, slot)
- **i18n** via `next-i18next` — locales em `locales/{locale}/common.json` (default: pt-PT)
- **State/fetch**: local state + React Query (`@tanstack/react-query`)
- **HTTP**: `useHttpClient()` ou `fetchWithAuth()` conforme padrão existente
- **Logging**: `winston`
- **Testes**: no momento, não há framework de testes instalado, salvo alteração futura no `package.json`

---

## Architecture Layers

| Layer | Purpose |
|-------|---------|
| `core/` | Config, constants, env, errors, types, utils — sem React |
| `platform/` | Cross-cutting: auth, i18n, API, adapters, contracts, mappers, query, storage, access-control, tenant, subscription, entitlements, providers |
| `domains/` | Business domains: `operations/clients`, `operations/users`, `operations/vehicles`, `operations/teams`, `identity/`, `catalogs/`, `platform-admin/`, `workspace/` |
| `shared/` | Reusable UI: `hub-grid/`, `data-table/`, `ui/` (shadcn), `layout/`, `forms/`, `feedback/`, `upload/`, `guards/` |
| `app/` | Next.js App Router pages — thin wrappers importing from `domains/` |

---

## Essential Commands

```bash
npm run dev
npm run build
npm run lint
npm run clean
npx tsc --project tsconfig.typecheck.json --noEmit
```

Quando houver scripts adicionais no `package.json`, os agentes devem verificar antes de executar.
Não inventar comandos inexistentes.

---

## API Conventions

- Todas as chamadas ao backend devem passar pelo proxy: `/api/gerit/v1/{resource}/...`
- Usar `fetchWithAuth` de `useAuth()` quando esse for o padrão da tela/domínio
- Usar `useHttpClient()` de `platform/api` quando esse for o padrão existente do domínio
- Nunca chamar backend diretamente do browser
- Endpoints seguem REST:
  - `GET /paged`
  - `GET /{id}`
  - `POST`
  - `PUT`
  - `PATCH /activate|deactivate`
  - `DELETE`
- Respostas paginadas usam:
  - `items[]`
  - `totalItems`
  - `pageNumber`
  - `pageSize`
  - `totalPages`
- Query params comuns:
  - `Search`
  - `PageNumber`
  - `PageSize`
  - `SortBy`
  - `SortDirection`
  - `IsActive`

---

## HubGrid

O componente `HubGrid` (`shared/hub-grid/hub-grid.tsx`) é a tabela padrão das páginas operacionais.

Props principais:

- `columns: HubGridColumn<Item>[]`
- `renderRowCells: (item) => ReactNode[]`
- `renderStatus`
- `renderActions`
- `rowDensity`
- `densityOptions`
- `onDensityChange`
- `sortBy`
- `sortDirection`
- `onSort`
- `statusFilter`
- `statusFilterOptions`
- `onStatusFilterChange`
- `searchValue`
- `onSearchChange`
- `searchPlaceholder`
- `loading`
- `loadingText`
- `emptyText`
- `page`
- `totalPages`
- `pageButtons`
- `onPageChange`
- `pageSize`
- `pageSizeOptions`
- `onPageSizeChange`
- `getRowKey`
- `onRowClick`

Seguir padrões existentes em:

- `domains/operations/clients/clients-page.tsx`
- `domains/operations/users/users-page.tsx`

---

## Operations Page Pattern

Toda página operacional deve seguir, sempre que aplicável, a estrutura em `domains/operations/{resource}/`:

1. `{resource}-models.ts` — interfaces e tipos do domínio
2. `{resource}-utils.ts` — normalização, parsing, erros e helpers locais
3. `{resource}-page.tsx` — página principal com HubGrid, toolbar e fluxo CRUD
4. `{resource}-details.tsx` — detalhe/create/edit form, quando aplicável
5. `index.ts` — exports do módulo
6. `app/(workspace)/operations/{resource}/page.tsx` — server component fino apontando para o domínio

---

## Key Patterns to Follow

- **Path alias:** usar `@/*`
- **Component naming:** `PascalCase` para componentes
- **Hooks/functions:** `camelCase`
- **Client components:** adicionar `"use client"` somente quando houver hooks ou browser APIs
- **i18n keys:** adicionar em:
  - `locales/pt-PT/common.json`
  - `locales/en-US/common.json`
  - `locales/es-ES/common.json`
- **HubGrid density labels:** `{resource}.grid.density.slow|medium|expanded`
- **Page size options:** `[10, 20, 50, 100, 500, 1000]`
- **Status filter types:** `"active" | "inactive" | "all"`
- **Sort columns:** usar union type, exemplo: `type SortColumn = "Name" | "Email"`
- **Pagination:** `pageButtons` calculado na página, máximo 5 botões
- **Responses:** sempre verificar `response.ok`
- **JSON parsing:** usar `.json().catch(() => null)` quando aplicável
- **Errors:** usar `normalizeErrorMessage()` quando existir no domínio

---

## Http Client vs fetchWithAuth

- `fetchWithAuth` de `useAuth()` adiciona JWT e base URL; usar quando este for o padrão da tela/domínio.
- `useHttpClient()` de `platform/api` pode ser usado quando o domínio já usa esse padrão.
- Para upload/FormData, passar `body: formData` sem header manual `Content-Type`.

A decisão deve respeitar o padrão existente no domínio alterado.
Não criar novo client HTTP sem necessidade.

---

## Query Keys

- Query keys devem ser centralizadas em `platform/query/query-keys.ts`.
- Escopar por `tenantId` quando aplicável.
- Importar conforme padrão existente, por exemplo:

```ts
import { queryKeys } from '@/platform/query';
```

Não criar query keys globais novas sem avaliar impacto.
Alterações globais em query keys devem ser tratadas como tarefa de alta complexidade e roteadas para `developer-senior`.

---

## Important Config

- `trailingSlash: true` em `next.config.mjs` — links internos devem respeitar barra final
- `images: { unoptimized: true }` — compatível com Azure Static Web Apps static export
- Azure SWA config em `staticwebapp.config.json`
- TypeScript:
  - `strict: true`
  - `moduleResolution: "bundler"`
  - path mapping `@/*` → `./*`
- `tsconfig.typecheck.json` é usado para typecheck completo
- Node engine: `>=20.19.0 <23`
- npm: `>=10`

---

# OpenCode Agents

Os agentes ficam em:

```text
.opencode/agents/
```

Agentes atuais:

```text
kanban-coordinator.md
po.md
developer-junior.md
developer-pleno.md
developer-senior.md
ui-ux.md
qa.md
```

Instrução compartilhada:

```text
.opencode/instructions/kanban-flow.md
```

---

# Fluxo Kanban

## Convenções de Branch e PR

Toda e qualquer alteração no repositório deve seguir estas convenções:

| Tipo de demanda | Branch base | PR base | Prefixo branch | Exemplo |
|-----------------|-------------|---------|----------------|---------|
| Feature, Melhoria, Correção (padrão) | `develop` | `develop` | `feature/` ou `fix/` | `feature/issue-184-expand-addresses` |
| Hotfix de produção (bug crítico) | `main` | `main` | `hotfix/` | `hotfix/issue-200-fix-login-error` |

**Regra padrão:** toda demanda cria branch a partir de `develop` e PR para `develop`.
**Exceção:** apenas fix de bug em produção usa `main` como base.

Os agentes `developer-junior`, `developer-pleno`, `developer-senior` e `ui-ux` são responsáveis por criar branches e PRs seguindo estas convenções.

## Fluxo Oficial

```text
PO -> Kanban Coordinator -> Developer Junior | Developer Pleno | Developer Senior | UI/UX -> QA
```

Status no board:

```text
Backlog -> To do -> In Progress -> For Tests -> In Test -> For Deploy -> Done
```

## Regra de Movimentação de Cards

Somente o `kanban-coordinator` move cards no board. Nenhum outro agente (PO, Developers, UI/UX, QA) deve executar `gh project item-edit` ou movimentar cards diretamente.

Os demais agentes apenas **notificam** o coordinator ao finalizar sua etapa. O coordinator executa a transição de coluna.

## Regra de Comunicação entre Agentes

O `kanban-coordinator` passa aos agentes especializados **apenas**:

- O que fazer (ação objetiva e específica)
- Onde está (link da issue/PR)
- Modo de execução
- O que entregar de volta (resultado esperado)

Não incluir nos handoffs: contexto completo da issue, histórico do que outros fizeram, comandos já executados, validações já realizadas.

## Handoff Padrão

O handoff deve ter **no máximo** este formato:

```md
Issue: #NUMERO
Ação: [ação objetiva]
Agente: [developer-junior | developer-pleno | developer-senior | ui-ux]
Modo: [FAST_PATH | STANDARD_PATH | FULL_PATH]
QA esperado: [QA_FAST | QA_STANDARD | QA_FULL]
Entrega: branch, alteração mínima, commit, push, PR e notificação ao coordinator.
```

**Proibido incluir:** contexto completo da issue, histórico de outros agentes, comandos executados, validações realizadas, análises longas, logs, checklist completo.

## Deteção de Merge (pós For Deploy)

Após mover o card para **For Deploy**, o Coordinator deve verificar periodicamente se o PR foi mergeado:

```powershell
# Verificar estado do PR
gh pr view PR_NUMERO --repo vianahub-pt/VianaHub.Global.Gerit.Web --json state,mergedAt
```

- Se `state == "MERGED"`, mover card para **Done** e notificar o usuário.
- Se `state == "OPEN"`, aguardar e repetir a verificação a cada 5 minutos.
- Se `state == "CLOSED"` (sem merge), notificar o usuário para decisão.

## Procedimento de Conflito de Merge

Se durante o desenvolvimento ocorrer um **conflito de merge** ao fazer `git pull origin develop` ou ao criar o PR:

1. O Developer atual **não tenta resolver o conflito sozinho**.
2. O Developer informa o Kanban Coordinator sobre o conflito.
3. O Kanban Coordinator **invoca o Developer Senior** para analisar e resolver o conflito.
4. Após resolução, o fluxo normal retoma com o Developer original.

**Nota:** Todo Developer é obrigado a executar `npm run build` antes de fazer `git push`. Se o build falhar, o Developer deve corrigir antes de prosseguir.

---

# Modos de Execução

O `kanban-coordinator` classifica cada tarefa em um dos três modos antes de fazer handoff. Cada modo define as validações obrigatórias.

## FAST_PATH

Usar para tarefas triviais e localizadas. **Sempre** `developer-junior`.

Exemplos obrigatórios de classificação como FAST_PATH:
- Remover input visual de uma tela
- Remover botão visual
- Remover label
- Remover texto
- Alterar texto
- Alterar placeholder
- Alterar ícone
- Alterar valor default de dropdown/select
- Ajustar classe Tailwind localizada
- Ajustar espaçamento/alinhamento localizado
- Ajuste i18n simples (chave de tradução)
- Ocultar/exibir campo sem alterar regra de negócio
- Mudança em um único componente
- Mudança em uma única tela
- Sem alteração de API, schema, payload, validação funcional complexa, hook
- Sem alteração de `core/`, `platform/` ou `shared` crítico

**Validações:**

- `git diff --check` (sempre)
- `npm run lint` somente se a alteração tocar arquivos TS/TSX relevantes
- `npm run build` (sempre — obrigatório antes de push)

## STANDARD_PATH

Usar para tarefas funcionais intermediárias:

- Formulário com validação
- Grid/tabela com filtros, paginação, ordenação
- Tela existente com alteração funcional
- Hook local de dados
- Integração com API já existente
- Correção funcional de média complexidade
- CRUD seguindo padrão existente

**Validações:**

- `git diff --check` (sempre)
- `npm run lint`
- `npm run build`
- Typecheck quando aplicável

## FULL_PATH

Usar para tarefas complexas, críticas ou arquiteturais:

- Nova tela
- CRUD completo com múltiplos componentes
- Alteração em `shared/`, `core/`, `platform/`
- Autenticação/autorização
- Segurança e dados sensíveis
- Tenant isolation
- Query keys globais
- Refatoração estrutural
- Performance e otimização
- Bug crítico ou alto

**Validações:**

- `git diff --check`
- `npm run lint`
- `npm run build`
- `npx tsc --project tsconfig.typecheck.json --noEmit`
- Testes existentes, se houver

---

# Modos de QA

O handoff do coordinator para o QA também indica o modo de validação.

## QA_FAST

Para tarefas triviais onde o Developer já reportou validação suficiente:

- Revisar diff do PR
- Validar critérios de aceite
- Não reexecutar build/typecheck quando a mudança for trivial e o Developer já reportou sucesso
- Comentário curto na issue

## QA_STANDARD

Para tarefas de média complexidade:

- Revisar diff do PR
- Validar critérios de aceite
- Rodar lint/typecheck quando necessário

## QA_FULL

Para tarefas críticas, arquiteturais ou de segurança:

- `npm run lint`
- `npm run build`
- `npx tsc --project tsconfig.typecheck.json --noEmit`
- Testes existentes
- Validação funcional/manual quando aplicável

---

# Classificação de Bugs (QA)

| Severidade | Developer recomendado |
|-----------|----------------------|
| Crítica | `developer-senior` |
| Alta | `developer-senior` |
| Média | `developer-pleno` |
| Baixa | `developer-junior` |

---

# Etapas do Fluxo

| Etapa | Responsável | Ação |
|-------|-------------|------|
| 1. Demanda recebida | `kanban-coordinator` | Entende a demanda e aciona PO |
| 2. Task BDD | `po` | Analisa demanda, escreve Task em BDD, define classificação/complexidade/labels |
| 3. Issue criada | `kanban-coordinator` | Cria issue com base na Task BDD do PO, com labels |
| 4. Card no board | `kanban-coordinator` | Adiciona issue ao board e move para To do |
| 5. Roteamento | `kanban-coordinator` | Classifica modo, escolhe Developer/UI/UX, move para In Progress |
| 6. Desenvolvimento | Developer/UI/UX | Implementa conforme modo, executa build, commita, cria PR e notifica coordinator |
| 7. Para QA | `kanban-coordinator` | Move para For Tests e aciona QA |
| 8. Validação | `qa` | Valida conforme modo QA, recomenda Developer se reprovar, notifica coordinator |
| 9. Aprovado | `kanban-coordinator` | Move para For Deploy e inicia detecção de merge |
| 10. Reprovado | `kanban-coordinator` | Move para In Progress e encaminha correção |
| 11. Merge detectado | `kanban-coordinator` | Move para Done e notifica usuário |

---

# Roteamento por Complexidade

## Regra Determinística

Tarefas triviais (remover input, botão, label, texto, alterar placeholder, ícone, valor default, ajuste Tailwind localizado, i18n simples) **sempre** vão para `developer-junior` + `FAST_PATH` + `QA_FAST`. Exceto se exigir alteração de API, schema, payload, validação, hook, regra de negócio ou tipo compartilhado.

| Critério | Developer | Modo padrão |
|----------|-----------|-------------|
| Simples, localizado, baixo risco | `developer-junior` | `FAST_PATH` |
| Funcional, intermediário, padrão existente | `developer-pleno` | `STANDARD_PATH` |
| Complexo, crítico, arquitetural | `developer-senior` | `FULL_PATH` |
| UI/UX visual, layout, tema, responsividade | `ui-ux` | Conforme impacto |

Em caso de dúvida:

```text
Tarefa parece trivial? → developer-junior + FAST_PATH
Junior vs Pleno? → Verificar checklist de justificativa. Se nenhuma opção marcar, manter junior.
Pleno vs Senior? → Senior
```

## Justificativa Obrigatória para Escalonamento

Se o coordinator escolher `developer-pleno`, `developer-senior` ou `ui-ux` para tarefa aparentemente trivial, deve registrar na issue:

```md
## Justificativa de escalonamento

A tarefa parecia trivial, mas foi roteada para `[agente]` porque envolve:

- [ ] alteração de API
- [ ] alteração de payload
- [ ] alteração de schema/validação
- [ ] alteração de hook
- [ ] alteração de tipo compartilhado
- [ ] alteração em `core/`
- [ ] alteração em `platform/`
- [ ] alteração em `shared` crítico
- [ ] regra de negócio
- [ ] risco funcional médio/alto
- [ ] outro motivo: ...
```

Se nenhuma opção justificar → rotear para `developer-junior`.

---

# Regra de Recusa de Tarefas Triviais

Os agentes `developer-pleno`, `developer-senior` e `ui-ux` podem devolver tarefas triviais para o agente correto quando recebem roteamento inadequado.

## Developer Pleno

Se receber tarefa trivial que se enquadre em `developer-junior + FAST_PATH`, **não implemente**. Devolva ao `kanban-coordinator` com o formato:

```md
## Roteamento incorreto

Esta tarefa é de baixa complexidade e deve ser executada por `developer-junior` com `FAST_PATH`.

Motivo:
- alteração localizada;
- sem API;
- sem regra de negócio;
- sem schema/payload;
- sem hook;
- sem impacto arquitetural.

Próxima ação:
Kanban Coordinator deve reencaminhar para `developer-junior`.
```

## Developer Senior

Se receber tarefa trivial ou média sem justificativa de arquitetura, segurança ou performance, **não implemente**. Devolva ao `kanban-coordinator` com recomendação do agente correto.

## UI/UX Specialist

Se receber ajuste visual mínimo que não envolva redesign, tema, shell, dashboard, login, layout crítico ou responsividade ampla, **não implemente**. Devolva para `developer-junior`.

---

# Roteamento de Correção (após QA)

| Tipo de problema | Developer | Modo |
|------------------|-----------|------|
| Texto, i18n simples, visual simples | `developer-junior` | `FAST_PATH` |
| Formulário, grid, filtro, API existente | `developer-pleno` | `STANDARD_PATH` |
| Arquitetura, segurança, performance | `developer-senior` | `FULL_PATH` |

---

# Automação e Intervenção Humana

## Fluxo contínuo

O fluxo deve ser contínuo e sem intervenção humana entre as etapas operacionais. Os agentes não devem parar para pedir/solicitar informações ao usuário enquanto o processo de desenvolvimento estiver acontecendo — o processo deve obrigatoriamente ser contínuo. As únicas intervenções do usuário serão aprovar o PR e fazer o merge.

Os agentes não pedem confirmação para:

- criar/refinar issue
- criar branch
- implementar
- executar validações conforme modo
- commitar, push, criar PR
- comentar issue
- notificar coordinator

## Intervenção humana

A intervenção humana ocorre apenas para:

1. Revisar o PR final
2. Aprovar o PR final
3. Fazer o merge do PR

Ou em caso de bloqueio real:

- Requisito de negócio ausente
- Critério de aceite ambíguo
- Dependência externa não resolvida
- Contrato de API inexistente
- Erro técnico impeditivo
- Risco de segurança ou perda de dados

## Anti-loop

Se o mesmo bug for reportado 2 vezes na mesma issue, escalar para o usuário e `kanban-coordinator`.

## Build Obrigatório

Todo Developer é obrigado a executar `npm run build` antes de fazer `git push`. Se o build falhar, o Developer deve corrigir antes de prosseguir. Nunca fazer push com build quebrado.

---

# Execução Paralela

**Permitido:** issues diferentes, branches diferentes, domínios isolados, arquivos sem conflito.

**Proibido:** mesma issue, mesma branch, mesmos arquivos, áreas globais críticas ao mesmo tempo, tarefas com dependência direta.

---

# Estrutura de Agentes

Os arquivos em `.opencode/agents/`, `.opencode/instructions/kanban-flow.md`, `AGENTS.md` e `.opencode/opencode.json` não devem ser alterados por agentes durante execução de tarefas. Alterações nesses arquivos só ocorrem por solicitação explícita do usuário.

---

# O que este projeto NÃO tem

- Framework de testes instalado (a menos que `package.json` mude)
- Jest/Playwright/Cypress (a menos que seja adicionado)
- Pre-commit hooks / Husky (a menos que seja adicionado)
- CI workflow em `.github/` (a menos que seja adicionado)
- Codegen, migrations ou build artifacts esperados no source control
