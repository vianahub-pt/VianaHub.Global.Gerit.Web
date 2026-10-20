# Goal

- ID: front-door-e2e-smoke-2-20261020
- Title: Front door agentic E2E smoke test 2
- Base branch: develop
- Branch prefix: feature
- Allowed files: agentic/validation/front-door-e2e-smoke-2.md

## Objective

Criar somente `agentic/validation/front-door-e2e-smoke-2.md` como artefato documental do smoke test do front door agentic. O conteúdo deve apenas identificar o arquivo como artefato de smoke test, sem afirmar que o fluxo completo foi bem-sucedido. Não alterar funcionalidades do Gerit.

## Discovery requirements

- Confirmar o contrato do intake e do bootstrap autenticado do front door.
- Confirmar que a única alteração funcional permitida é o arquivo declarado em Allowed files.
- Confirmar que a redação do artefato não declara sucesso de etapas ou do workflow.

## Acceptance criteria

- O fluxo iniciado pelo front door percorre intake, bootstrap seguro, branch, goal materializado, architect, implementer, tester, security, reviewer e supervisor.
- O único arquivo funcional alterado é `agentic/validation/front-door-e2e-smoke-2.md`.
- O arquivo contém somente uma breve identificação como artefato de smoke test e não afirma sucesso do workflow.
- O supervisor cria commit, faz push somente da branch de trabalho e abre/verifica PR para `develop`.
- O resultado só é considerado sucesso quando o state final é `WAITING_HUMAN_MERGE`, todos os quality gates passam, security review e code review passam, e o supervisor verifica o PR aberto.

## Validation requirements

- Executar os quality gates definidos pelo repositório, sem contorná-los em caso de falha de rede ou dependência.
- Validar `git diff --check` para os arquivos funcionais e a verificação staged obrigatória do supervisor.
- Confirmar que não há arquivo funcional fora da allowlist.

## Security/production restrictions

- Não alterar funcionalidades do Gerit.
- Não fazer merge nem deploy; produção permanece read-only.
- Não usar `danger-full-access`.
- Git mutável, incluindo branch, stage, commit, push e PR, pertence exclusivamente ao supervisor.
- Se qualquer gate, revisão ou verificação do supervisor falhar, registrar a falha e terminar `FAILED`; não declarar sucesso nem contornar o gate.