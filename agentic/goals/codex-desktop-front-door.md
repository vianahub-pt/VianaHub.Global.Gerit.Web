# Goal

- ID: codex-desktop-front-door
- Title: Add Codex Desktop natural-language front door
- Base branch: develop
- Branch prefix: feature
- Allowed files: AGENTS.md, agentic/README.md, agentic/prompts/front-door.md, agentic/prompts/autonomous-loop.md, agentic/guardrails/repository.md, scripts/agentic-common.ps1, scripts/agentic-start.ps1, scripts/agentic-loop.ps1, scripts/agentic-supervisor-tests.ps1

## Objetivo

Permitir que uma pessoa inicie um goal agentic no Codex Desktop com uma solicitação em linguagem natural, sem criar manualmente um goal Markdown nem executar manualmente `agentic-loop.ps1`. O Desktop interpreta o pedido e entrega um intake estruturado ao supervisor PowerShell; o supervisor continua controlando o ciclo até `WAITING_HUMAN_MERGE` ou `FAILED`.

Exemplo de experiência: “Implemente o CRUD de Clients no Gerit Web com base na API existente.” O Desktop deve apresentar progresso de alto nível sem expor chain-of-thought. `agentic/state/**` e `agentic/journal/**` continuam sendo a fonte de verdade, e o mecanismo atual de quota e `agentic-resume.ps1` deve continuar compatível.

## Arquitetura e responsabilidades

- **Codex Desktop/front door:** interpreta o pedido, produz um intake/goal estruturado, inicia o handoff para o supervisor e apresenta progresso e estado ao usuário. Não substitui o supervisor.
- **Supervisor PowerShell:** valida a working tree e a base, executa `git fetch`, cria a branch, valida e materializa o goal definitivo na branch de trabalho, inicia o loop, realiza Git mutável, stageia apenas os paths permitidos, executa `git diff --cached --check`, faz commit e push da branch e cria/verifica o PR.
- **Orchestrator:** control plane do fluxo agentic.
- **Architect:** discovery e planning.
- **Implementer:** única role autorizada a alterar arquivos funcionais permitidos pelo goal.
- **Tester:** executa quality gates e não edita a implementação.
- **Security:** revisão de segurança read-only.
- **Reviewer:** code review independente read-only.

O Codex Desktop não pode executar `git fetch`, `git checkout`/`switch`, `git add`, `git commit`, `git push`, merge ou `gh pr create` como substituto do supervisor. Codex e agentes não recebem Git mutável. O supervisor PowerShell continua sendo o único executor de operações Git mutáveis.

## Intake e bootstrap seguros

Resolver o bootstrap atual: `agentic-loop.ps1` requer um goal existente e working tree limpa antes de criar branch. Criar `scripts/agentic-start.ps1` como entrada do supervisor, ou mecanismo equivalente, para aceitar somente o artefato temporário/controlado de intake necessário ao bootstrap. O fluxo deve:

1. validar a working tree e rejeitar qualquer alteração local alheia ao intake controlado;
2. validar e normalizar o intake antes de qualquer criação de branch;
3. aceitar apenas base `develop` ou `main`, observando as regras de branch existentes e sem enfraquecer `Start-GoalBranch`;
4. validar metadata obrigatória, `Allowed files` não vazio, prefixo de branch válido e ID seguro;
5. rejeitar path traversal, paths absolutos, referências fora do repositório, segredos no intake, wildcard irrestrito, `**` ou repo inteiro como fallback;
6. exigir allowlist concreta. Quando escopo ou arquivos não puderem ser inferidos com segurança, permitir discovery pelo architect, mas bloquear implementação até haver uma allowlist explícita;
7. criar branch somente após validação e materializar o goal definitivo na branch de trabalho, para que permaneça auditável na branch/PR quando apropriado;
8. iniciar `agentic-loop.ps1` em modo compatível com branch já preparada, ou mecanismo equivalente, sem duplicar nem enfraquecer suas validações.

O intake não pode ser usado para contornar o estado limpo da working tree. Nenhum arquivo arbitrário pode ser aceito junto com o intake. Nenhum segredo pode ser escrito em goals, state, journal ou memória compartilhada.

## Contrato do front door

Adicionar `agentic/prompts/front-door.md` descrevendo como converter uma solicitação natural em intake estruturado. O contrato exige, no mínimo:

- ID;
- Title;
- Base branch;
- Branch prefix;
- Allowed files;
- Objective;
- Discovery requirements;
- Acceptance criteria;
- Validation requirements;
- Security/production restrictions.

O prompt deve impedir escopo irrestrito ou allowlist inventada. Se não houver informação suficiente para determinar arquivos permitidos, deve encaminhar a descoberta ao architect e bloquear implementação até o escopo ser concreto. Não expor chain-of-thought ao usuário.

## UX e continuidade

O usuário não precisa conhecer `agentic/goals`, `agentic-loop.ps1`, `agentic-resume.ps1` ou a state machine interna. Para novo trabalho agentic, apresentar somente progresso de alto nível, por exemplo:

`INTAKE → DISCOVERY → PLANNING → IMPLEMENTING → TESTING → SECURITY_REVIEW → CODE_REVIEW → READY_TO_COMMIT → WAITING_HUMAN_MERGE`

O estado terminal deve ser `WAITING_HUMAN_MERGE` ou `FAILED`. Em caso de quota, persistir `WAITING_FOR_QUOTA`, preservar checkpoint e retomar pelo mecanismo existente. Após reboot/interrupção, manter compatibilidade com `agentic-resume.ps1`.

## Compatibilidade

- Preservar o uso técnico/manual de `scripts/agentic-loop.ps1 -Goal ...`.
- O front door é uma camada adicional, não uma substituição destrutiva do loop.
- Preservar provenance obrigatória, state/journal, sandbox, approvals, quota/retry/resume e demais guardrails atuais.
- Não alterar funcionalidades Gerit.

## Restrições de segurança e produção

- Não usar `danger-full-access` nem remover o sandbox.
- Não permitir merge automático, deploy ou alteração de produção.
- Produção permanece read-only.
- Não usar force push, `reset --hard`, `clean -fd`, push para `develop`/`main` nem alterar proteção de branch.
- Push permitido somente para a branch de trabalho; PR direcionado à base declarada no goal.
- Merge humano continua obrigatório.

## Fixtures obrigatórios

Adicionar fixtures determinísticos que comprovem:

A. pedido válido gera intake/goal válido;
B. base inválida é rejeitada;
C. branch prefix inválido é rejeitado;
D. ID inseguro ou com path traversal é rejeitado;
E. `Allowed files` vazio é rejeitado;
F. wildcard irrestrito ou repo inteiro é rejeitado;
G. working tree com arquivo alheio é rejeitada;
H. somente intake controlado pode existir antes do bootstrap;
I. supervisor continua sendo o único executor de Git mutável;
J. goal definitivo só é materializado na branch de trabalho;
K. fluxo manual `agentic-loop.ps1 -Goal ...` continua compatível;
L. quota e resume continuam compatíveis;
M. nenhum merge ou deploy automático é permitido;
N. fluxo válido alcança o handoff para o orchestrator.

## Validações obrigatórias

- fixtures em PowerShell 7;
- fixtures em Windows PowerShell 5.1;
- AST/syntax checks nos PowerShells suportados;
- `git diff --check` funcional;
- `npm run lint`;
- `npm run build`;
- `npx tsc --project tsconfig.typecheck.json --noEmit`;
- security review read-only;
- code review independente read-only.

Não executar deploy nem merge. O supervisor pode criar PR apenas para `develop`; ao terminar o fluxo agentic, persistir `WAITING_HUMAN_MERGE` somente após verificar PR aberto com URL, número, head e base corretos.

## Critérios de aceite

- Usuário inicia novo trabalho agentic no Codex Desktop com linguagem natural, sem goal manual e sem invocar `agentic-loop.ps1` manualmente.
- O intake seguro entrega goal validado ao supervisor sem aceitar alterações locais arbitrárias.
- Supervisor permanece responsável por Git mutável e inicia o loop após materializar o goal na branch de trabalho.
- Nenhum guardrail existente é enfraquecido; provenance continua obrigatória.
- `agentic/state/**` e `agentic/journal/**` continuam sendo fonte de verdade.
- Fluxo manual atual continua funcionando.
- Fixtures, PowerShell 7, Windows PowerShell 5.1, lint, build e typecheck passam.
- Nenhuma funcionalidade Gerit, produção, merge automático ou deploy é alterado.
- PR aberto somente para `develop`; o fluxo para em `WAITING_HUMAN_MERGE` ou `FAILED`.
