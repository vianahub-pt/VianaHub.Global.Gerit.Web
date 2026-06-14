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
qa.md
```

Instrução compartilhada:

```text
.opencode/instructions/kanban-flow.md
```

Não usar mais o fluxo antigo baseado em `developer.md` genérico.

Se ainda existir um `developer.md` antigo, ele deve ser removido, arquivado ou deixado explicitamente fora do fluxo para evitar conflito com os Developers por senioridade.

---

# Workflow Automation

## Regra Geral

O fluxo deve ser **contínuo, automatizado e sem intervenção humana** entre os agentes.

A intervenção humana acontece apenas no final, para:

1. Validar o resultado final.
2. Revisar o PR.
3. Aprovar o PR.
4. Fazer merge do PR para a branch de destino definida no fluxo do projeto.

Os agentes não devem pedir confirmação para atividades operacionais normais do fluxo.

---

# Regra Fundamental do Fluxo

## ⛔ VIOLAÇÃO DE DIRETIVAS É PROIBIDA

**TODAS as diretivas deste arquivo e dos agentes são OBRIGATÓRIAS e INEGOCIÁVEIS.**

**NUNCA, EM NENHUMA CIRCUNSTÂNCIA, VIOLAR QUALQUER DIRETIVA.**

### Regra de Comunicação entre Agentes

O `kanban-coordinator` deve passar aos agentes especializados (PO, Developers, QA) **APENAS**:

- **O que fazer** (ação objetiva e específica)
- **Onde está** (link da issue/PR)
- **O que entregar de volta** (resultado esperado)

**NUNCA incluir nos handoffs:**

- Contexto completo da issue
- O que outros agentes já fizeram
- Comandos que já foram executados
- Validações técnicas já realizadas
- Análises de complexidade ou riscos
- Histórico de movimentação

### Exemplo de handoff CORRETO

```
Implemente [descrição] na issue #125. Crie branch, implemente, valide, crie PR e notifique.
```

### Exemplo de handoff INCORRETO (NUNCA FAZER)

```
O Developer-pleno implementou X, executou lint, build...
Agora valide os seguintes critérios...
```

**SEMPRE que uma diretiva for violada, o fluxo está QUEBRADO e o resultado é INVÁLIDO.**

---

## O Kanban Coordinator NUNCA desenvolve

O `kanban-coordinator` é **exclusivamente um orquestrador de fluxo**. Ele **NUNCA** deve criar branch, implementar código, executar validações técnicas, commitar, fazer push ou criar PR.

### O Kanban Coordinator é o Único Gestor de Cards

Toda movimentação de cards no board é feita **exclusivamente pelo `kanban-coordinator`**. Nenhum outro agente (PO, Developers ou QA) deve mover cards. O coordinator gerencia: assign, `To do`, `In Progress`, `For Tests`, `In Test`, `For Deploy` e retorno para `In Progress`.

Todo o desenvolvimento é responsabilidade **exclusiva** dos subagentes:
- `developer-junior` (baixa complexidade)
- `developer-pleno` (média complexidade)
- `developer-senior` (alta complexidade)

Toda a validação é responsabilidade **exclusiva** do subagente `qa`.

## Automação Total — Nenhuma Intervenção Humana

Todo o fluxo operacional entre os agentes é **100% automático, contínuo e fluido**, sem qualquer intervenção humana.

A **única** intervenção humana possível e inegociável em todo o ciclo de vida de uma issue é:

1. **Revisar** o PR final.
2. **Aprovar** o PR final.
3. **Fazer o merge** do PR final para a branch de destino.

Nenhum agente, em nenhuma circunstância, deve solicitar confirmação, autorização ou validação humana para qualquer atividade operacional. Todas as movimentações de cards, criações de branch, implementações, validações técnicas, commits, pushes, criação de PRs e acionamentos entre agentes devem ocorrer **automática e obrigatoriamente** sem intervenção humana.

O fluxo **só pode parar** para intervenção humana em caso de:
- Bloqueio real (requisito de negócio ausente, critério de aceite ambíguo, dependência externa não resolvida, contrato de API inexistente, erro técnico impeditivo, risco de segurança ou perda de dados).
- Regra anti-loop (mesmo bug reportado 2 vezes na mesma issue).

Mesmo nesses casos, o bloqueio deve ser registrado com clareza antes de qualquer ação.

## Proteção da Estrutura de Agentes — NUNCA Alterar

Nenhuma alteração no repositório — seja novo desenvolvimento, correção de bug/fix, instalação de dependência ou qualquer outra mudança — pode modificar, remover, renomear ou desativar a estrutura atual de agentes, instruções compartilhadas ou configurações do OpenCode.

Isso inclui, mas não se limita a:
- Arquivos em `.opencode/agents/` (todos os agentes)
- Arquivo `.opencode/instructions/kanban-flow.md`
- Arquivo `AGENTS.md` na raiz do projeto
- Arquivo `.opencode/opencode.json`

A **única** exceção é quando o usuário solicitar **expressamente e explicitamente** a alteração desses arquivos.

Qualquer agente que identificar uma tentativa de alteração desses arquivos sem solicitação explícita do usuário deve **recusar a alteração imediatamente** e informar o usuário sobre a proteção vigente.

---

## Fluxo Automatizado Oficial

```text
PO -> Kanban Coordinator -> Developer Junior | Developer Pleno | Developer Senior -> QA
```

Fluxo de status:

```text
Backlog -> To do -> In Progress -> For Tests -> In Test -> For Deploy -> Done
```

---

## Etapas Automatizadas

| Etapa | Agente | Ação automática |
|-------|--------|-----------------|
| 1. Demanda recebida | `kanban-coordinator` | Entende a demanda e aciona PO quando necessário |
| 2. Issue criada/refinada | `po` | Cria/refina issue, adiciona ao board e move para `To do` quando pronta |
| 3. Roteamento | `kanban-coordinator` | Classifica complexidade e escolhe Developer |
| 4. Desenvolvimento | `developer-junior`, `developer-pleno` ou `developer-senior` | Move para `In Progress`, cria branch, implementa, valida, commita, faz push e cria PR |
| 5. Entrega para QA | Developer escolhido | Move para `For Tests` e aciona QA |
| 6. Validação | `qa` | Move para `In Test`, valida e gera relatório |
| 7. QA aprovado | `qa` | Move para `For Deploy` e orienta o usuário a revisar/aprovar/mergear PR |
| 8. QA reprovado | `qa` | Move para `In Progress`, recomenda Developer adequado e devolve ao `kanban-coordinator` |
| 9. Correção | `kanban-coordinator` + Developer adequado | Encaminha correção sem pedir confirmação ao usuário |
| 10. Revalidação | `qa` | Revalida até aprovação ou escalação anti-loop |

> **Nota:** A movimentação de cards (In Progress, For Tests, In Test, For Deploy, In Progress) é feita **exclusivamente pelo `kanban-coordinator`**. Os agentes PO, Developers e QA notificam o coordinator, que executa as transições de coluna.

---

## Atividades que NÃO exigem confirmação humana

Os agentes não devem pedir confirmação para:

- criar issue;
- refinar issue;
- adicionar issue ao GitHub Projects;
- classificar complexidade;
- escolher Developer;
- criar branch;
- implementar;
- executar lint;
- executar build;
- executar typecheck;
- executar testes existentes;
- commitar alterações;
- fazer push da branch;
- criar PR;
- comentar issue;
- acionar QA;
- aprovar QA e notificar coordinator para mover para `For Deploy`;
- reprovar QA e notificar coordinator para mover para `In Progress`;
- encaminhar correção para Developer adequado;
- revalidar após correção.

---

## Intervenção Humana Permitida

A intervenção humana só deve ocorrer nos seguintes casos:

### 1. Aprovação final do PR

O usuário deve revisar, aprovar e fazer merge do PR no GitHub.

### 2. Bloqueio real

O fluxo pode parar quando houver:

- requisito de negócio ausente;
- critério de aceite ambíguo;
- dependência externa não resolvida;
- contrato de API inexistente ou incompatível;
- erro técnico impeditivo que o agente não consiga resolver;
- risco de segurança, perda de dados ou exposição de dados que exija decisão humana.

### 3. Regra anti-loop

Se o mesmo bug for reportado duas vezes na mesma issue, escalar para o usuário e `kanban-coordinator`.

O usuário decide:

- corrigir com `developer-senior`;
- aceitar com ressalva;
- criar nova issue;
- revisar manualmente.

---

# Roteamento por Complexidade

O `kanban-coordinator` é responsável pela decisão final de roteamento.

A complexidade sugerida pelo PO é apenas um insumo.

---

## Baixa Complexidade -> developer-junior

Usar `developer-junior` para:

- ajustes de texto;
- ajustes simples de i18n;
- correções visuais pequenas;
- espaçamento, alinhamento, label, placeholder ou ícone;
- pequenos bugs de layout;
- ajustes localizados em componente existente;
- estado loading/error/empty simples;
- mudança em uma única tela ou componente;
- mudança sem API nova;
- mudança sem regra de negócio;
- mudança sem impacto arquitetural.

---

## Média Complexidade -> developer-pleno

Usar `developer-pleno` para:

- nova tela seguindo padrão existente;
- CRUD simples ou intermediário;
- formulários;
- tabelas/grids;
- filtros;
- busca;
- paginação;
- ordenação;
- integração com API existente;
- hooks de domínio;
- componentes de domínio;
- validações de formulário;
- correções funcionais médias;
- melhorias em uma jornada específica.

---

## Alta Complexidade -> developer-senior

Usar `developer-senior` para:

- features complexas ou transversais;
- refatorações estruturais;
- bugs críticos ou altos;
- alterações em arquitetura frontend;
- alterações em `core/`, `platform/`, `shared/` ou padrões reutilizáveis;
- integrações críticas com API;
- performance;
- segurança;
- autenticação/autorização;
- tenant isolation;
- query keys globais;
- design system/componentes compartilhados críticos;
- mudanças com impacto em múltiplos domínios;
- correções que exigem análise de causa raiz.

---

## Regra de Decisão

Em caso de dúvida:

```text
Junior vs Pleno -> escolher Pleno
Pleno vs Senior -> escolher Senior
```

A prioridade é reduzir risco de regressão e evitar que um agente abaixo do nível necessário altere áreas sensíveis.

---

# QA Reprovado

Quando o QA reprovar:

1. QA comenta a issue com detalhes.
2. QA gera relatório em `docs/reviews/`.
3. QA recomenda o Developer adequado.
4. QA envia handoff ao `kanban-coordinator`.
5. `kanban-coordinator` move card para `In Progress` e encaminha automaticamente para correção.

---

## Roteamento de Correção

| Tipo de problema | Developer recomendado |
|------------------|----------------------|
| Texto, i18n simples, visual simples, layout localizado | `developer-junior` |
| Formulário, grid, filtro, paginação, API existente, regra funcional intermediária | `developer-pleno` |
| Arquitetura, segurança, autenticação, autorização, tenant, performance, regressão complexa | `developer-senior` |

---

# Execução Paralela

A execução paralela é permitida apenas para issues independentes.

Permitido:

- issues diferentes;
- branches diferentes;
- worktrees diferentes, quando aplicável;
- arquivos sem conflito;
- domínios isolados;
- ausência de dependência direta entre tarefas;
- ausência de alterações simultâneas em áreas globais críticas.

Não permitido:

- dois Developers na mesma issue;
- dois Developers na mesma branch;
- dois Developers alterando os mesmos arquivos;
- dois Developers alterando `core/`, `platform/`, `shared/ui` crítico ou query keys globais ao mesmo tempo;
- tarefas com dependência direta;
- risco alto de conflito ou regressão.

Regra prática:

```text
Paralelismo por issue independente é permitido.
Paralelismo dentro da mesma issue é proibido, salvo orientação explícita do usuário e divisão técnica muito clara.
```

---

# Docs Structure

```text
docs/
├── stories/          # User stories (STORY-XXX-title.md)
│   ├── epics/        # Epic definitions (EPIC-XXX-title.md)
│   └── bugs/         # Bug reports (BUG-XXX-title.md)
├── templates/        # Story, bug, test report templates
├── reviews/          # Relatórios de QA
└── README.md
```

---

# What This Project Does NOT Have

- No test framework installed by default, unless `package.json` changes
- No Jest/Playwright/Cypress unless added later
- No pre-commit hooks / Husky, unless added later
- No CI workflow files in `.github/`, unless added later
- No codegen, migrations or build artifacts expected in source control

---

# Regras Finais

- Não usar mais `developer.md` genérico no fluxo.
- O fluxo deve passar sempre pelo `kanban-coordinator`.
- O PO cria/refina e entrega para o `kanban-coordinator`.
- O `kanban-coordinator` escolhe Developer por complexidade e **gerencia toda movimentação de cards**.
- O Developer implementa, commita, cria PR e notifica o coordinator automaticamente.
- O QA aprova ou reprova e notifica o coordinator, que move os cards.
- A intervenção humana fica apenas para revisão/aprovação/merge do PR ou bloqueios reais.
- Sempre responder com estado atual do card, próximo responsável e pendências.
