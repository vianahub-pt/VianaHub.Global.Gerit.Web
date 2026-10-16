# Plano — smoke-test

## Objetivo

Validar localmente as peças de continuidade e guardrails do framework sem chamar um modelo, alterar código do Gerit ou tocar na instância ai-memory.

## Contexto e discovery

- Codex CLI 0.133.0; config do projeto é TOML e MCP streamable HTTP é suportado.
- ai-memory 2.1.1 está parado; usar fixture de indisponibilidade.
- PowerShell é o runner. loop-state.json e journal são persistência local.

## Arquivos

- scripts/agentic-common.ps1: state, transições, journal e classificação de quota.
- scripts/agentic-loop.ps1: supervisor e modo smoke.
- scripts/agentic-resume.ps1 e scripts/agentic-status.ps1.
- agentic/state/loop-state.json, agentic/journal/current.md e snapshot em agentic/journal/history/.

## Riscos

- Formatos de erro de quota podem variar; sem sinal explícito não classificar erro como quota.
- O health real do MCP não é testado enquanto o servidor estiver parado.
- Backoff com estado local não sobrevive como processo ao reboot; deve ser retomado chamando agentic-resume.ps1.

## Critérios de aceite

- Estados e transições válidos são aceitos; transições terminais inválidas são rejeitadas.
- Fixtures temporárias, semanais e Retry-After respeitam os intervalos definidos; erro de código não é quota.
- State é gravado e reaberto, branch/goal são preservados e memory unavailable não bloqueia.
- Journal atualiza e recebe snapshot histórico.

## Passos

1. Parse de todos os scripts PowerShell.
2. Validar state machine e fixtures sem iniciar Codex.
3. Simular retomada mantendo goal e branch.
4. Simular ai-memory indisponível e garantir fallback local.
5. Validar state JSON e arquivar journal.

## Testes e validações

- scripts/agentic-loop.ps1 -Goal agentic/goals/smoke-test.md -SmokeTest.
- PowerShell AST parser, JSON parser e TOML parser.
- Quality gates do repositório executados separadamente no encerramento da migração.

## Rollback lógico

O smoke test não altera arquivos funcionais. Para remover somente seu estado de execução, restaure loop-state.json e journal/current.md pelo Git após confirmar que não há outro goal ativo; mantenha os snapshots de histórico.

## Fora de escopo

Chamadas a modelos, PR, produção, Docker ai-memory, funcionalidades do Gerit e alterações de dependências.
