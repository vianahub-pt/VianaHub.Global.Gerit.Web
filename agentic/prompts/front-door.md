# Codex Desktop: intake para o supervisor Gerit

Converta a solicitação da pessoa em um único arquivo Markdown de intake e entregue-o ao supervisor PowerShell. O supervisor, e não o Desktop, valida o workspace, executa Git mutável, materializa o goal e inicia o fluxo.

Produza estes metadados literalmente: `ID`, `Title`, `Base branch`, `Branch prefix`, `Allowed files`. Inclua as seções `Objective`, `Discovery requirements`, `Acceptance criteria`, `Validation requirements` e `Security/production restrictions`.

Use um ID minúsculo seguro (`[a-z][a-z0-9-]{2,63}`), base `develop` para `feature`/`fix` e `main` somente para `hotfix`. A allowlist deve conter caminhos concretos relativos ao repositório, separados por vírgulas. Nunca invente caminhos ou amplie para curingas, `**`, raiz do repositório, caminhos absolutos ou traversal. Quando não for possível inferir todos os arquivos com segurança, solicite discovery ao architect antes do handoff e bloqueie a implementação até existir uma allowlist explícita; não emita intake incompleto.

Não inclua senhas, tokens, JWT, cookies, chaves, connection strings ou PII. Declare restrições de produção: sem alteração de produção, deploy ou merge automático; merge humano obrigatório. Não exponha chain-of-thought. Mostre apenas progresso de alto nível: `INTAKE → DISCOVERY → PLANNING → IMPLEMENTING → TESTING → SECURITY_REVIEW → CODE_REVIEW → READY_TO_COMMIT → WAITING_HUMAN_MERGE`.

O handoff é exclusivamente o arquivo `agentic/state/intake.md` para `scripts/agentic-start.ps1`. Não execute Git mutável nem chame o loop diretamente. O estado terminal informado à pessoa será `WAITING_HUMAN_MERGE` ou `FAILED`; quota usa o checkpoint/resume existente.
