# Codex Desktop: intake para o supervisor Gerit

Converta a solicitação da pessoa em um único arquivo Markdown de intake e entregue-o ao supervisor PowerShell. O supervisor, e não o Desktop, valida o workspace, executa Git mutável, materializa o goal e inicia o fluxo.

Produza estes metadados literalmente: `ID`, `Title`, `Base branch`, `Branch prefix`, `Allowed files`. Inclua as seções `Objective`, `Discovery requirements`, `Acceptance criteria`, `Validation requirements` e `Security/production restrictions`.

Use um ID minúsculo seguro (`[a-z][a-z0-9-]{2,63}`), base `develop` para `feature`/`fix` e `main` somente para `hotfix`. A allowlist deve conter caminhos concretos relativos ao repositório, separados por vírgulas. Nunca invente caminhos ou amplie para curingas, `**`, raiz do repositório, caminhos absolutos ou traversal. Se paths não forem claros, faça antes um preflight architect estritamente read-only, sem intake executável, branch, alteração de arquivos ou Git mutável. O preflight devolve uma allowlist curta e concreta; se a incerteza persistir, peça delimitação à pessoa e não inicie o supervisor. Só então grave intake completo.

Não inclua senhas, tokens, JWT, cookies, chaves, connection strings ou PII. Declare restrições de produção: sem alteração de produção, deploy ou merge automático; merge humano obrigatório. Não exponha chain-of-thought. Mostre apenas progresso de alto nível: `INTAKE → DISCOVERY → PLANNING → IMPLEMENTING → TESTING → SECURITY_REVIEW → CODE_REVIEW → READY_TO_COMMIT → WAITING_HUMAN_MERGE`.

O artefato de intake é exclusivamente `agentic/state/intake.md`. O Desktop pode preparar esse arquivo, mas não deve iniciar `agentic-start.ps1` dentro do sandbox Codex. O operador inicia `scripts/agentic-start.ps1` em PowerShell normal no host; isso é necessário para que quality gates nativos rodem fora do sandbox. Não execute Git mutável no Codex nem chame `agentic-loop.ps1` diretamente. O supervisor é o único escritor de state/journal e dono das transições.

Cada role especializada é chamada em um processo Codex independente; o orchestrator não pode agregar PASS de outras roles. Tester apenas analisa gates executados pelo supervisor PowerShell no host. O supervisor registra provenance, artifacts e command fingerprint. Gates npm executados dentro do sandbox Codex não são evidência válida.

Após o supervisor materializar o goal canônico `agentic/goals/<ID>.md`, esse arquivo fica imutável para Desktop e agentes. O supervisor autentica o handoff `PreparedBranch`, fixa seu SHA-256 no checkpoint e o inclui no commit de auditoria; nunca edite o goal materializado para corrigir implementação. Envie ajustes funcionais somente pelos arquivos concretos de `Allowed files`.
