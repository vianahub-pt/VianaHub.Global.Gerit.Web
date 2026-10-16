# Goal

- ID: agent-role-accountability
- Title: Enforce agent role accountability and orchestrator boundaries
- Base branch: develop
- Branch prefix: fix
- Allowed files: AGENTS.md, .codex/agents/orchestrator.toml, .codex/agents/architect.toml, .codex/agents/implementer.toml, .codex/agents/tester.toml, .codex/agents/security.toml, .codex/agents/reviewer.toml, agentic/README.md, agentic/prompts/autonomous-loop.md, agentic/prompts/resume-loop.md, agentic/guardrails/repository.md, scripts/agentic-common.ps1, scripts/agentic-loop.ps1, scripts/agentic-supervisor-tests.ps1

## Objetivo

Tornar explícita, auditável e verificável a separação de responsabilidades entre o orchestrator, os agentes executores e o supervisor PowerShell no framework Codex do Gerit Web. Não alterar funcionalidades do Gerit Web nem produção.

## Arquitetura obrigatória

- **orchestrator:** control plane; coordena estados, delegações e checkpoints, sem implementar alterações funcionais.
- **architect:** executa discovery e planning; não edita arquivos funcionais.
- **implementer:** única role autorizada a alterar arquivos funcionais permitidos pelo goal ativo.
- **tester:** executa validações e quality gates; não edita arquivos funcionais.
- **security:** revisão de segurança read-only; não edita arquivos funcionais.
- **reviewer:** revisão final independente read-only; não edita arquivos funcionais.
- **supervisor PowerShell:** único responsável por operações Git mutáveis, commit, push e criação/verificação de PR.

O orchestrator pode atualizar somente artefatos de coordenação, incluindo `agentic/state/**`, `agentic/journal/**` e artefatos de planejamento/coordenação quando explicitamente permitidos pelo goal. Alterações em arquivos funcionais devem ser feitas pelo implementer e permanecer dentro dos `Allowed files` do goal.

## Requisitos de comportamento

1. O orchestrator não deve implementar alterações funcionais. Uma alteração funcional feita sob coordenação do orchestrator deve ser atribuída ao implementer somente quando houver evidência verificável da execução/delegação correspondente; o campo `controller` por si só não prova autoria.
2. Architect, tester, security e reviewer não podem editar arquivos funcionais. Suas atribuições são, respectivamente, discovery/planning, validação, revisão de segurança e revisão independente.
3. Git mutável permanece exclusivo do supervisor PowerShell. Dentro de `codex exec`, agentes não podem executar fetch, add, commit, push, checkout/switch, criar PR, merge ou alterar refs Git. Operações Git somente de leitura continuam sujeitas aos guardrails existentes.
4. Preserve `max_iterations`, `max_agent_calls`, quota handling, ai-memory, `WAITING_FOR_QUOTA`, resume, segurança atual do sandbox e o supervisor como responsável por commit/push/PR.
5. Não permitir merge automático, deploy ou alteração em produção.

## Journal e auditabilidade

O journal deve distinguir quem controla o fluxo de quem executa cada ação. Prefira eventos com campos explícitos:

- `controller`: normalmente `orchestrator`;
- `actor`: `architect`, `implementer`, `tester`, `security`, `reviewer` ou `supervisor`;
- `delegated_agent`: role delegada, quando aplicável;
- `action`: ação executada;
- `files_changed`: arquivos efetivamente alterados;
- `result`: resultado da ação.

Não registre apenas `agent: orchestrator` quando a execução real pertenceu a outro agente. Para uma delegação, registre um evento da delegação pelo orchestrator e um evento separado com o resultado do agente executor. Por exemplo:

```text
state: IMPLEMENTING
controller: orchestrator
actor: implementer
action: atualizar runtime Node
files_changed: package.json, Dockerfile
result: PASS
```

Os arquivos locais `agentic/state/**` e `agentic/journal/**` não exigem atribuição ao implementer. O supervisor deve continuar excluindo state/journal do commit funcional quando aplicável.

## Provenance antes de READY_TO_COMMIT

Antes de aceitar `READY_TO_COMMIT`, o framework deve comparar arquivos funcionais alterados dentro dos `Allowed files` com evidência de execução atribuída a `actor: implementer` para cada alteração. State/journal e outros artefatos exclusivamente de coordenação não precisam dessa atribuição.

Se qualquer arquivo funcional alterado não tiver provenance verificável do implementer, o supervisor/framework deve:

- bloquear `READY_TO_COMMIT`;
- registrar uma falha explícita e sanitizada no state/journal;
- transicionar para `FAILED` ou `CORRECTING`, conforme as transições válidas e a possibilidade de correção.

Não inferir provenance apenas porque o orchestrator descreveu, planejou ou aprovou uma mudança. A evidência deve estar ligada ao arquivo alterado e ao resultado de uma execução do implementer.

## Fixtures e testes determinísticos obrigatórios

Adicionar fixtures/testes ao escopo permitido e demonstrar cada caso:

A. Orchestrator pode atualizar state/journal.
B. Orchestrator não é executor válido de alteração funcional.
C. Implementer com alteração em arquivo permitido é aceito.
D. Architect alterando arquivo funcional é rejeitado.
E. Tester alterando arquivo funcional é rejeitado.
F. Security alterando arquivo funcional é rejeitado.
G. Reviewer alterando arquivo funcional é rejeitado.
H. Arquivo funcional alterado sem evidência de `actor: implementer` bloqueia `READY_TO_COMMIT`.
I. Git mutável continua exclusivo do supervisor.
J. Fluxo válido continua chegando a `READY_TO_COMMIT`.

Os testes devem ser determinísticos e não executar operações mutáveis remotas. Reutilize o harness existente quando aplicável e não introduza dependências desnecessárias.

## Validações obrigatórias

Execute e registre comandos, códigos de saída e resultados:

- testes/fixtures determinísticos do supervisor, cobrindo A–J;
- validação de sintaxe e execução aplicável em PowerShell 7;
- validação de sintaxe e execução aplicável em Windows PowerShell 5.1;
- `git diff --check`;
- `npm run lint`;
- `npm run build`;
- `npx tsc --project tsconfig.typecheck.json --noEmit`.

Não reporte `PASS` para comandos que falhem. Se um runtime PowerShell não estiver disponível, informe a limitação com evidência, sem alegar que passou.

## Critérios de aceite

- Journal diferencia controller e actor, e não atribui ao orchestrator execução funcional realizada por outro agente.
- Implementer é a única role aceita como executor de alterações funcionais permitidas.
- Provenance ausente ou inválida bloqueia `READY_TO_COMMIT` e registra falha explícita.
- Todos os casos determinísticos A–J passam.
- PowerShell 7 e Windows PowerShell 5.1 passam nas validações aplicáveis.
- `git diff --check`, lint, build e typecheck passam.
- Não há alteração funcional do Gerit Web nem alteração de produção.
- Os fluxos de quota/resume, sandbox, ai-memory e limites existentes permanecem preservados.
- O PR está aberto somente para `develop`; nenhuma operação de merge ou deploy foi feita.
- O supervisor verifica PR aberto, URL, número, head e base antes de finalizar em `WAITING_HUMAN_MERGE`.

## Segurança e produção

Produção permanece read-only. Não alterar produção, secrets, Docker de produção, Cloudflare, Traefik, banco ou GitHub Environments. Não fazer deploy, merge automático, push para `develop`/`main`, force push, `reset --hard`, `clean -fd` ou mudanças de proteção de branch. O trabalho termina em `WAITING_HUMAN_MERGE` ou `FAILED`.
