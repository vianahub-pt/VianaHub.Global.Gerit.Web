# Goal

- ID: smoke-test
- Title: Validação determinística do framework agentic
- Base branch: develop
- Branch prefix: feature

## Objective

Validar o state machine, journal, persistência local, retomada, modo de falha de memória e classificação de quota sem alterar código funcional nem consumir quota real.

## Scope

- Executar fixtures e transições locais pelo modo `-SmokeTest` do supervisor.
- Simular resultado de health do MCP com fixture MEMORY_UNAVAILABLE, sem iniciar o servidor nem fazer chamada de modelo.
- Validar que o state e o journal podem ser lidos depois da simulação.

## Out of scope

- Alterar código funcional do Gerit.
- Chamar Codex para uma tarefa real, criar commit/push/PR, alterar produção ou iniciar ai-memory.

## Acceptance criteria

- Estados e transições permitidos são validados.
- Falha de memória resulta em `MEMORY_UNAVAILABLE`, sem bloquear o fluxo local.
- Fixtures de quota mapeiam para `WAITING_FOR_QUOTA`; erro de código não é classificado como quota.
- Retomada reconhece goal, branch, plano, journal e ação pendente sem reiniciar o goal.
- Journal registra evidência e snapshot do smoke test é salvo em `agentic/journal/history/`.

## Required validations

- Smoke test local sem chamada de modelo.
- `git diff --check`, `npm ci`, lint, build e typecheck no encerramento da migração.
- Parse TOML, JSON e sintaxe PowerShell.

## Production impact

Nenhum. Sem chamadas a infraestrutura ou deploy.

## Memory queries

Fixture local de health indisponível; o loop real consulta somente ferramentas que o MCP anunciar.

## Stop condition

Registrar o resultado local e terminar sem branch adicional, commit ou PR do próprio smoke test.
