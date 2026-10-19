# Guardrails do repositório

- Faça alterações mínimas dentro do goal; preserve padrões e contratos existentes do Gerit.
- Não altere funcionalidade de negócio fora do critério de aceite.
- Proteja arquivos e alterações preexistentes; nunca descarte trabalho local para limpar o repositório.
- Para API, autenticação, autorização, tenant ou camadas globais, exija análise de arquitetura e security review.
- Registre comandos e evidências de gates. Não oculte falhas.
- Orchestrator coordena sem implementar mudanças funcionais; architect planeja; somente implementer pode editar arquivos funcionais permitidos pelo goal. Tester, security e reviewer são read-only.
- Registre eventos com `controller`, `actor`, `delegated_agent` quando aplicável, `action`, `files_changed` e `result`. Cada arquivo funcional alterado precisa de evento `actor: implementer`, ação preenchida e `result: PASS`; state/journal são artefatos de coordenação.
- Git mutável é exclusivo do supervisor PowerShell; `codex exec` não pode executar fetch, add, commit, push, checkout/switch, criar PR, merge ou alterar refs.
- Para novo trabalho no Codex Desktop, use `agentic/prompts/front-door.md` e entregue apenas `agentic/state/intake.md` ao `scripts/agentic-start.ps1`. O supervisor valida a árvore, intake e allowlist antes de Git mutável; somente o goal materializado após criar a branch fica auditável. Rejeite secrets e paths absolutos, traversal, curingas ou repo inteiro.
- O goal criado pelo bootstrap é somente `agentic/goals/<State.goal_id>.md` após `PreparedBranch` autenticado. O supervisor registra o SHA-256 ao materializar, fixa-o no checkpoint, journal e âncora local sob metadados Git (fora do sandbox do Codex), compara todos antes de resume/readiness e stageia esse arquivo para auditoria. O hash não pode ser regenerado a partir do state/journal. O arquivo é imutável para agentes, não precisa de allowlist funcional nem provenance do implementer. Nenhum outro arquivo `agentic/goals/**` é confiável; goals manuais mantêm comportamento normal.
- Desktop e agentes mostram apenas progresso de alto nível, sem chain-of-thought. Quota e retomada continuam pelo checkpoint e `agentic-resume.ps1`; o fluxo termina em `WAITING_HUMAN_MERGE` ou `FAILED`, sem merge/deploy automático.
