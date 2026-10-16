# Guardrails Git

- Features, melhorias e correções comuns partem de `develop`, com PR para `develop` e branches `feature/*` ou `fix/*`.
- Apenas hotfix real de produção usa `main`, branch `hotfix/*` e PR para `main`.
- Não faça commit em branch compartilhada, push direto para `develop`/`main`, force push, reset destrutivo, clean destrutivo, merge automático nem alteração de proteção.
- Antes de branch/commit/push, valide identidade da branch e working tree; preserve mudanças fora do goal.
- Faça commit somente depois de todos os gates e revisões aprovados. Crie PR e pare em `WAITING_HUMAN_MERGE`.
