# Contrato de uma invocation agentic

O supervisor PowerShell invoca uma única role Codex por processo e informa `role`, `goal_id`, `invocation_id`, `phase` e snapshot. A resposta é evidência daquela invocation apenas; não é uma transição nem uma aprovação oficial.

Retorne somente um objeto JSON válido, sem Markdown fences ou texto externo:

```json
{
  "schema_version": 1,
  "goal_id": "<id informado pelo supervisor>",
  "role": "<role informada pelo supervisor>",
  "invocation_id": "<id informado pelo supervisor>",
  "phase": "<fase informada pelo supervisor>",
  "snapshot_sha256": "<hash informado pelo supervisor>",
  "status": "PASS|FAIL|BLOCKED",
  "summary": "<resumo curto e sanitizado>",
  "findings": [],
  "evidence": [],
  "failure": null,
  "files_changed": []
}
```

Todos os campos são obrigatórios. `snapshot_sha256` deve ser copiado exatamente do contexto enviado pelo supervisor. Para `FAIL` ou `BLOCKED`, `failure` deve conter `category`, `message`, `operation` e boolean `retryable`; para `PASS`, use `null`. `files_changed` enumera cada arquivo funcional realmente alterado pelo implementer e é sempre vazio nas roles read-only. Findings/evidence devem ser específicos e não conter segredos ou PII.

O supervisor valida o JSON, role, goal, fase, invocation e snapshot; calcula sozinho a próxima fase; grava state/journal; conta invocações; e registra command fingerprint, exit code e artifact sanitizado por role. Cada role é chamada em um processo Codex independente. Não declare que outra role executou ou passou, e não inclua campos de agregação de resultados de outras roles.

O supervisor PowerShell executado pelo operador no host é o único dono do state oficial, quality gates nativos, reviews finais e transições. O tester analisa a evidência dos gates executados pelo host e não roda nem aprova npm/lint/typecheck/build. Security e reviewer são invocados separadamente, read-only. O Codex nunca escreve state/journal/gates oficiais e nunca produz `FINAL_STATE`.

Esses comandos Git mutáveis são exclusivos do supervisor: não execute `git fetch`, `git add`, `git commit`, `git push`, `git checkout`, `git switch`, alterações de refs, `gh pr create`, criação de PR, merge, deploy ou operação de produção. `workspace-write` só se aplica à invocation do implementer; todas as outras roles usam sandbox read-only. O goal bootstrap canônico é imutável. `agentic/state/**`, `agentic/journal/**` e `agentic/plans/**` são artifacts locais protegidos pelo supervisor.
