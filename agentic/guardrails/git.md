# Guardrails Git

- Features, melhorias e correções comuns partem de `develop`, com PR para `develop` e branches `feature/*` ou `fix/*`.
- Apenas hotfix real de produção usa `main`, branch `hotfix/*` e PR para `main`.
- Git mutável pertence somente ao supervisor PowerShell: fetch, criação de branch, stage, commit, push da branch de trabalho e criação/verificação do PR. Codex e agentes terminam em `READY_TO_COMMIT`; nunca executam essas operações dentro de `codex exec`.
- Cada goal declara `Allowed files`. O supervisor só stageia caminhos dessa lista; `agentic/state/loop-state.json` e `agentic/journal/current.md` são checkpoints locais e não entram no commit do goal.
- Push é permitido somente para a branch de trabalho validada, nunca para `develop` ou `main`. Sem force push, `reset --hard`, `clean -fd`, merge automático ou alteração de refs fora do fluxo do supervisor.
- Não faça commit em branch compartilhada, push direto para `develop`/`main`, force push, reset destrutivo, clean destrutivo, merge automático nem alteração de proteção.
- Antes de branch/commit/push, valide identidade da branch e working tree; preserve mudanças fora do goal.
- Faça commit somente depois de todos os gates e revisões aprovados. Crie PR e pare em `WAITING_HUMAN_MERGE`.
