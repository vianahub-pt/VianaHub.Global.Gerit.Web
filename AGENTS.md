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

## Execução agentic com Codex

O framework do repositório está em `.codex/`, `agentic/` e `scripts/`. Consulte `agentic/README.md` antes de executar o loop. Papéis disponíveis: `orchestrator`, `architect`, `implementer`, `tester`, `security` e `reviewer`.

- O supervisor PowerShell executado pelo operador no host é a única autoridade para state oficial, quality gates finais, reviews e transições. Invoca cada role Codex em processo independente e valida JSON com goal, role, invocation ID e snapshot exatos. Orchestrator não pode agregar nem declarar execução/PASS de outras roles; nenhuma role escreve state/journal, gates/reviews finais ou `FINAL_STATE`. Architect faz discovery/planning; implementer é a única role que edita arquivos funcionais permitidos pelo goal; tester apenas analisa evidência de gates já executados pelo supervisor; security e reviewer são read-only. O supervisor registra command fingerprint, artifact sanitizado, exit code, timestamp e provenance, além de `controller`, `actor`, `action`, `files_changed` e `result`.
- Use subagentes somente para tarefas independentes. Não permita que dois agentes editem os mesmos arquivos simultaneamente.
- Cada goal tem objetivo, escopo, critérios de aceite e plano em Markdown. State e journal são gravados exclusivamente pelo supervisor; o journal corrente pertence a um único goal e resume valida seu cabeçalho contra state, branch e base. Planos em `agentic/plans/**` são artefatos locais de controle e ficam fora de commit/classificação.
- O supervisor PowerShell é o único responsável por Git mutável: validar a working tree, fetch, criar branch, stage, commit, push, criar PR e persistir seu número/URL. Roles Codex fazem discovery, planejamento, implementação, análise dos gates e revisões; somente o supervisor executa gates nativos e persiste `READY_TO_COMMIT` após validar evidências. Dentro de `codex exec`, proíba `git fetch`, `git add`, `git commit`, `git push`, `git checkout`/`switch`, criação de PR, merge e alterações em refs. Git read-only (`status`, `diff`, `diff --check`, `branch --show-current`, `log`) pode ser usado. Nunca use force push, `reset --hard`, `clean -fd`, push para `develop`/`main`, merge automático ou deploy.
- Antes de aceitar `READY_TO_COMMIT`, o supervisor exige evento de journal com `actor: implementer`, `action`, `result: PASS` e `files_changed` contendo cada arquivo funcional alterado; state/journal são coordenação e ficam isentos.
- O único goal bootstrap isento de allowlist/provenance funcional é `agentic/goals/<State.goal_id>.md`, materializado por `agentic-start.ps1` após handoff `PreparedBranch` autenticado. O supervisor fixa SHA-256 no state, journal e âncora local imutável sob metadados Git (fora do sandbox do Codex), compara os três com o conteúdo antes de retomar/finalizar e inclui esse arquivo no commit para auditoria; nenhum agente pode alterá-lo. O hash nunca é regenerado a partir do state/journal. `agentic/goals/**` não é control path nem recebe confiança genérica. Goals iniciados manualmente mantêm a validação normal.
- Estados válidos: `IDLE`, `DISCOVERY`, `PLANNING`, `IMPLEMENTING`, `TESTING`, `SECURITY_REVIEW`, `CODE_REVIEW`, `CORRECTING`, `READY_TO_COMMIT`, `READY_TO_PR`, `WAITING_FOR_QUOTA`, `RESUMING`, `WAITING_HUMAN_MERGE` e `FAILED`.
- Caminho de sucesso: `IDLE → DISCOVERY → PLANNING → IMPLEMENTING → TESTING → SECURITY_REVIEW → CODE_REVIEW → READY_TO_COMMIT → READY_TO_PR → WAITING_HUMAN_MERGE`. O Codex retorna somente recomendação JSON; o supervisor valida roles, hashes/snapshots, gates e reviews e persiste toda transição. `READY_TO_COMMIT` é aceito somente após essa validação; apenas o supervisor avança para PR após commit/push. Checkpoints ativos podem transicionar para `RESUMING` após interrupção do processo; quota passa por `WAITING_FOR_QUOTA → RESUMING` preservando a fase pendente. Falhas recuperáveis seguem por `CORRECTING`; `FAILED` e `WAITING_HUMAN_MERGE` são terminais.
- Limites por goal: 8 iterações, 40 chamadas de agente e 3 falhas consecutivas. Se esgotados, grave `FAILED` com causa objetiva.
- Quota não é falha do goal. Registre o checkpoint, preserve branch/diff/journal e use `WAITING_FOR_QUOTA`. Não invente API de quota nem reset. Se Codex não informar reset, espere no mínimo 15 minutos para limites desconhecidos/temporários e 6 horas para limite semanal antes de nova tentativa. Nunca faça sondagem contínua.
- A retomada lê state, goal, plano e journal antes de agir. Se ai-memory estiver indisponível, registre isso e continue usando o journal local.
- Só o supervisor cria commit, push e PR depois de validar branch/base, escopo de arquivos, quality gates, security PASS e reviewer PASS. Push é limitado à branch de trabalho e PR usa a base declarada no goal. `WAITING_HUMAN_MERGE` só é válido depois de o supervisor verificar PR aberto com URL, número, head e base correspondentes. Não faça merge nem deploy.
- Para iniciar trabalho pelo Codex Desktop, use `agentic/prompts/front-door.md` para preparar intake em `agentic/state/intake.md`. O operador deve executar `scripts/agentic-start.ps1` em PowerShell normal no host, fora do sandbox Codex, para que gates npm/nativos sejam executados pelo supervisor host. O Desktop não deve iniciar o supervisor dentro do sandbox. O supervisor valida árvore/allowlist, cria branch, materializa goal e invoca roles confinadas. Nunca inclua segredo, path absoluto, traversal, curingas ou repo inteiro. O fluxo mantém quota/resume e termina em `WAITING_HUMAN_MERGE` ou `FAILED`.

## Memória e journal

Use ai-memory somente por MCP quando o servidor estiver disponível e as ferramentas reais forem anunciadas. Prefira consulta e escrita de conhecimento durável do projeto. A memória é auxiliar: journal, state e plano locais são a fonte de continuidade. Nunca adivinhe endpoints nem grave segredos ou PII.

`agentic/journal/current.md` é append-only durante um goal. Ao concluir, salve snapshot em `agentic/journal/history/`. Planos ficam em `agentic/plans/`; goals ficam em `agentic/goals/`.
