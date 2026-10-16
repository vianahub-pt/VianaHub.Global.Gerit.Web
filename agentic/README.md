# Framework agentic do Gerit Web

Este diretório guarda goals, planos, checkpoints e journal para trabalho local conduzido pelo Codex CLI. Leia `AGENTS.md` e os guardrails antes de executar `scripts/agentic-loop.ps1`.

## Uso

```powershell
.\scripts\agentic-loop.ps1 -Goal "agentic/goals/001-clients-parity.md"
.\scripts\agentic-status.ps1
.\scripts\agentic-resume.ps1
```

O supervisor PowerShell valida a working tree, busca `origin`, cria branch a partir da base declarada, registra state/journal e chama `codex exec`. Codex e seus agentes fazem discovery, plano, implementação, testes e revisões e concluem em `READY_TO_COMMIT`. O supervisor verifica o checkpoint, branch/base, arquivos permitidos e gates; só então executa `git add`, `git commit`, `git push` da branch e cria/verifica o PR. O Codex CLI deve estar instalado e autenticado.

O Codex só carrega `.codex/config.toml` em um projeto confiável. A configuração mantém `workspace-write` como sandbox obrigatório e usa `approval_policy = "on-request"` com `approvals_reviewer = "auto_review"`; o runner passa `--approve-for-me` para rotear pedidos de acesso ao auto-review. Ações que cruzam o sandbox continuam sob revisão automática e podem ser negadas. O MCP ai-memory local usa `default_tools_approval_mode = "approve"` para operar sem prompt humano. Isso não amplia o sandbox nem autoriza ações destrutivas; não use `danger-full-access`, não permita merge automático e mantenha produção read-only. Merge humano continua obrigatório. `AI_MEMORY_AUTH_TOKEN` é opcional e deve existir somente no ambiente do usuário se a instância exigir autenticação; não grave seu valor no repositório.

Os modelos dos agentes foram conferidos com `codex debug models` no Codex CLI 0.163.0. Orchestrator, implementer e tester usam `gpt-6-luna`; architect, security e reviewer usam `gpt-5.6-terra`. O modelo padrão project-local para `codex exec` sem override também é `gpt-6-luna`, evitando depender de um modelo global que pode não ser suportado pela conta. Revalide os slugs com `codex debug models` ao atualizar o CLI. O CLI instalado rejeitou o override global de concorrência em `[agents]`; por isso não fixamos uma chave incompatível e deixamos a concorrência no padrão do Codex.

## Continuidade e quota

`loop-state.json`, o goal, o plano e `journal/current.md` formam o checkpoint local. Codex CLI não oferece neste fluxo uma API documentada para consultar quota/reset; o supervisor classifica apenas mensagens explícitas capturadas de `codex exec`. Limite desconhecido/temporário usa espera de 15 minutos; mensagem semanal usa 6 horas. Se o processo ou Windows reiniciar, rode `agentic-resume.ps1`; ele respeita `resume_after` e continua com state e journal existentes. Isso não instala tarefa agendada no Windows.

O supervisor mantém limites de 8 iterações, 40 chamadas e 3 falhas consecutivas no state. A memória é best-effort; se ai-memory estiver parado, journal e plano locais continuam sendo a fonte de verdade.

## Responsabilidades Git e encerramento

Dentro de `codex exec`, são proibidos `git fetch`, `git add`, `git commit`, `git push`, `git checkout`/`switch`, criação de PR, merge e alterações em refs Git. Git read-only (`status`, `diff`, `diff --check`, `branch --show-current`, `log`) pode ser usado. Nunca use force push, `reset --hard`, `clean -fd`, push para `develop`/`main`, merge automático ou deploy. Produção permanece read-only e o merge humano continua obrigatório.

O supervisor aceita `WAITING_HUMAN_MERGE` somente depois de validar a existência de um PR aberto cujo número, URL, branch de origem e base correspondam ao goal. Ele grava PR e commit no checkpoint/journal. Falhas de commit, push ou PR registram uma causa sanitizada e encerram em `FAILED`, preservando state e alterações locais.
