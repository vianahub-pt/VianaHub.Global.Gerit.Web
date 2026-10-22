# VianaHub.Global.Gerit.Web — Instruções do repositório

Este documento define a arquitetura, as convenções técnicas e os guardrails de trabalho do Gerit Web. A comunicação deste projeto é em português do Brasil.

## Stack e comandos

- Next.js 15 App Router, React 18, TypeScript 5 em modo strict.
- Tailwind CSS 3, shadcn/ui, `next-i18next`, React Query e Winston.
- Node.js `>=24.0.0 <25`; npm `>=10`.
- `npm run dev`, `npm run build`, `npm run lint`, `npm run clean`.
- Typecheck completo: `npx tsc --project tsconfig.typecheck.json --noEmit`.
- Não presuma que exista framework de testes. Confira os scripts em `package.json` antes de executar comandos adicionais.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `core/` | Configuração, constantes, ambiente, erros, tipos e utilitários sem React. |
| `platform/` | Autenticação, i18n, API, adapters, contratos, mappers, query, storage, acesso, tenant e providers. |
| `domains/` | Domínios de negócio como operations, identity, catalogs, platform-admin e workspace. |
| `shared/` | UI reutilizável, HubGrid, tabelas, layout, formulários e feedback. |
| `app/` | App Router; páginas finas que apontam para os domínios. |

Use o alias `@/*`. Componentes em PascalCase; hooks e funções em camelCase. Adicione `"use client"` apenas para hooks ou APIs do browser. Mantenha `trailingSlash: true`, imagens unoptimized e o mapeamento `@/*` existente.

## API e domínios

- Chamadas de API do browser usam o proxy same-origin `/api/gerit/v1/{resource}/...`; não chame o backend diretamente do browser.
- Respeite o padrão do domínio: `fetchWithAuth()` de `useAuth()` ou `useHttpClient()` de `platform/api`. Não crie outro client sem necessidade.
- Verifique `response.ok`; ao tratar JSON opcional use `.json().catch(() => null)`.
- Preserve contratos REST e paginação existentes (`items`, `totalItems`, `pageNumber`, `pageSize`, `totalPages`).
- Centralize query keys em `platform/query/query-keys.ts`, escopando por tenant quando aplicável.
- Siga os padrões de HubGrid e páginas operacionais já existentes. Preserve as traduções em `locales/pt-PT`, `locales/en-US` e `locales/es-ES` quando tocar conteúdo localizado.

## Segurança e produção

- Nunca exponha, copie ou registre passwords, tokens, JWT, cookies, chaves privadas, connection strings ou dados pessoais desnecessários.
- Não armazene segredos em arquivos versionados, journal, goals ou memória compartilhada.
- Valide autorização no servidor e mantenha isolamento por tenant. Não confie em permissões de UI como controle de acesso.
- Produção é somente leitura durante goals de desenvolvimento. Não altere VPS, Cloudflare, Traefik, Docker de produção, banco, GitHub Environments ou secrets; não dispare deploy.
- O deploy da aplicação é controlado por `.github/workflows/deploy.yml`. Mudanças funcionais não devem promover `develop` para `main` nem realizar merge automaticamente.

## Branches e PRs

- Features, melhorias e correções comuns partem de `develop` e abrem PR para `develop`, usando `feature/*` ou `fix/*`.
- Somente hotfix real de produção parte de `main`, usa `hotfix/*` e abre PR para `main`.
- Nunca faça commit direto ou push para `develop`/`main`; nunca use force push, `reset --hard`, `clean -fd`, merge automático ou altere proteção de branch.
- Antes de criar branch, confira `git status`, busque referências remotas e preserve qualquer trabalho local. Não descarte nem sobrescreva alterações alheias ao goal.
- Todo trabalho autônomo termina em `WAITING_HUMAN_MERGE`. Uma pessoa revisa e faz o merge.

## Quality gates

Gates padrão: `git diff --check`, `npm ci`, `npm run lint`, `npm run build` e `npx tsc --project tsconfig.typecheck.json --noEmit`. Registre comando, código de saída, resultado e falhas reais. Não reporte PASS quando um comando falhar. Execute testes adicionais somente se existirem e forem aplicáveis.

## Agentic vNext

A arquitetura congelada em `docs/agentic/` rege `.codex/`, `agentic/` e `scripts/`. O fluxo de usuário começa no Front Door via MCP local `agentic-supervisor` (`start_request`, `resume_request`, `get_status`); não exija execução manual de PowerShell e não exponha shell arbitrário.

- O Request Envelope é imutável e precede preflight/specification. Orchestrator decide workflow; Supervisor valida/persiste e executa ações privilegiadas. Architect é dono de preflight semântico e Execution Specification; Supervisor é seu único escritor físico. Implementer é a única role que altera arquivos funcionais aprovados. Tester julga QA e solicita ações ao Test Execution Broker bounded. Reviewer e Security são independentes, read-only e vinculados ao mesmo snapshot.
- Estados oficiais: `IDLE`, `REQUEST_ACCEPTED`, `PREFLIGHT_PREPARING`, `PREFLIGHT_ANALYZING`, `ALREADY_SATISFIED`, `BRANCH_PREPARED`, `ARCHITECTURE`, `DOR_VALIDATION`, `IMPLEMENTING`, `TESTING`, `REVIEWING`, `CORRECTING`, `QUALITY_GATES`, `OBSERVABILITY_VERIFICATION`, `REQUIREMENT_VERIFICATION`, `SCOPE_DIFF_VERIFICATION`, `READY_TO_COMMIT`, `READY_TO_PR`, `WAITING_FOR_QUOTA`, `BLOCKED`, `RESUMING`, `WAITING_HUMAN_MERGE`, `FAILED`.
- SATISFIED termina em `ALREADY_SATISFIED / NO_CHANGES`, sem branch funcional, implementação, commit, push ou PR. NOT_SATISFIED permite somente branch nova a partir do SHA remoto capturado. Reuso de branch é proibido.
- Implementação só ocorre após DOR PASS. Correção funcional invalida Tester, Reviewer, Security e verificações downstream, refazendo Implementer → Tester → Reviewer + Security.
- READY exige Tester, Reviewer, Security, gates nativos aplicáveis, Observability, Requirement, Scope/Diff e snapshot integrity PASS. Sucesso técnico isolado não prova conclusão do requisito.
- Apenas Supervisor executa Git mutável, gates nativos, state/journal/Specification writes e eventual commit/push/PR. Roles não fazem Git mutável, merge ou deploy. Nunca use force push, `reset --hard`, `clean -fd`, push direto para `develop`/`main`, merge automático ou deploy. O merge é humano.
- Limites por execução: 8 iterações, 40 invocações e 3 falhas consecutivas. Quota e BLOCKED preservam checkpoint. `ai-memory` é OPTIONAL AUXILIARY; artifacts locais são a fonte de continuidade.

## Memória e journal

Use ai-memory somente por MCP se disponível; é OPTIONAL AUXILIARY e nunca fonte de verdade. State, Request Envelope, Preflight Result, Execution Specification, journal e evidence artifacts locais sustentam continuidade. Nunca grave segredos ou PII.

`agentic/journal/current.md` é append-only durante a execução; ao concluir, salve snapshot em `agentic/journal/history/`. `agentic/plans/**` não é fonte de planejamento; Execution Specification é canônica.