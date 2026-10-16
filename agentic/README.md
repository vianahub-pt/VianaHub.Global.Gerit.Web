# Framework agentic do Gerit Web

Este diretório guarda goals, planos, checkpoints e journal para trabalho local conduzido pelo Codex CLI. Leia `AGENTS.md` e os guardrails antes de executar `scripts/agentic-loop.ps1`.

## Uso

```powershell
.\scripts\agentic-loop.ps1 -Goal "agentic/goals/001-clients-parity.md"
.\scripts\agentic-status.ps1
.\scripts\agentic-resume.ps1
```

O loop valida o repositório, busca `origin`, cria branch a partir da base declarada no goal, registra state/journal e chama `codex exec` com as instruções de `prompts/autonomous-loop.md`. A execução delega para os agentes customizados em `.codex/agents/` quando os recursos de subagente estiverem disponíveis. O Codex CLI deve estar instalado e autenticado.

O Codex só carrega `.codex/config.toml` em um projeto confiável. A configuração mantém `workspace-write` como sandbox obrigatório e usa `approval_policy = "on-request"` com `approvals_reviewer = "auto_review"`; o runner passa `--approve-for-me` para rotear pedidos de acesso ao auto-review. Ações que cruzam o sandbox continuam sob revisão automática e podem ser negadas. O MCP ai-memory local usa `default_tools_approval_mode = "approve"` para operar sem prompt humano. Isso não amplia o sandbox nem autoriza ações destrutivas; não use `danger-full-access`, não permita merge automático e mantenha produção read-only. Merge humano continua obrigatório. `AI_MEMORY_AUTH_TOKEN` é opcional e deve existir somente no ambiente do usuário se a instância exigir autenticação; não grave seu valor no repositório.

Os modelos dos agentes foram conferidos com `codex debug models` no Codex CLI 0.163.0. Orchestrator, implementer e tester usam `gpt-6-luna`; architect, security e reviewer usam `gpt-5.6-terra`. O modelo padrão project-local para `codex exec` sem override também é `gpt-6-luna`, evitando depender de um modelo global que pode não ser suportado pela conta. Revalide os slugs com `codex debug models` ao atualizar o CLI. O CLI instalado rejeitou o override global de concorrência em `[agents]`; por isso não fixamos uma chave incompatível e deixamos a concorrência no padrão do Codex.

## Continuidade e quota

`loop-state.json`, o goal, o plano e `journal/current.md` formam o checkpoint local. Codex CLI não oferece neste fluxo uma API documentada para consultar quota/reset; o supervisor classifica apenas mensagens explícitas capturadas de `codex exec`. Limite desconhecido/temporário usa espera de 15 minutos; mensagem semanal usa 6 horas. Se o processo ou Windows reiniciar, rode `agentic-resume.ps1`; ele respeita `resume_after` e continua com state e journal existentes. Isso não instala tarefa agendada no Windows.

O supervisor mantém limites de 8 iterações, 40 chamadas e 3 falhas consecutivas no state. A memória é best-effort; se ai-memory estiver parado, journal e plano locais continuam sendo a fonte de verdade.

## Encerramento

Depois de gates, security review e code review aprovados, o fluxo pode criar commit, push e PR para `develop`, e termina em `WAITING_HUMAN_MERGE`. Nunca faz merge, promove para `main` ou executa deploy. O PR ainda exige revisão e merge humano.
