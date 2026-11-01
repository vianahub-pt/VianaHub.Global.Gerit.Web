# Goal

- ID: framework-e2e-validation
- Title: Validate the Codex agentic framework end to end
- Base branch: develop
- Branch prefix: feature
- Allowed files: agentic/validation/framework-e2e-validation.md, agentic/plans/framework-e2e-validation.md

## Objective

Executar uma validação real end-to-end do framework agentic Codex depois da migração para develop.

O objetivo é provar que o loop autônomo consegue:

- carregar AGENTS.md;
- consultar ai-memory;
- fazer discovery;
- planejar;
- delegar aos agentes;
- fazer uma alteração mínima;
- executar quality gates;
- executar security review;
- executar code review;
- registrar journal e state;
- entregar `READY_TO_COMMIT` ao supervisor;
- supervisor cria commit e faz push somente da branch de trabalho;
- supervisor cria e verifica Pull Request para develop;
- parar em WAITING_HUMAN_MERGE.

## Scope

Criar somente um arquivo documental:

agentic/validation/framework-e2e-validation.md

O arquivo deve registrar:

- data UTC da validação;
- goal ID;
- confirmação de que ai-memory foi consultado;
- agentes executados;
- quality gates executados;
- resultado final do loop.

Nenhum código funcional do Gerit pode ser alterado.

Nenhuma dependência pode ser alterada.

Nenhum arquivo de produção pode ser alterado.

## Out of scope

- funcionalidades do Gerit;
- Clientes;
- API;
- autenticação;
- banco de dados;
- infraestrutura;
- Docker de produção;
- Cloudflare;
- Traefik;
- GitHub secrets;
- main;
- deploy.

## Acceptance criteria

- branch criada automaticamente a partir de develop;
- ai-memory acessível;
- discovery concluído;
- plan criado em agentic/plans/framework-e2e-validation.md;
- implementer cria somente agentic/validation/framework-e2e-validation.md;
- tester executa gates aplicáveis;
- security review retorna PASS;
- reviewer retorna PASS;
- journal atualizado;
- loop-state atualizado;
- Codex não executa Git mutável nem cria PR;
- supervisor cria commit, push da branch de trabalho e PR aberto para develop;
- state final = WAITING_HUMAN_MERGE;
- nenhum merge automático;
- nenhuma alteração em main;
- nenhuma alteração em produção.

## Required validations

- git diff --check
- npm run lint
- npm run build
- npx tsc --project tsconfig.typecheck.json --noEmit

## Production impact

Nenhum.

Produção é estritamente read-only durante este goal.

## Memory queries

Consultar ai-memory por:

- repository: VianaHub.Global.Gerit.Web
- topic: Codex agentic framework
- topic: agentic architecture
- topic: framework migration
- known failures
- quota handling

Persistir ao final somente:

- resultado da validação;
- decisões técnicas;
- falhas, se houver;
- PR criado.

Não armazenar secrets.

## Stop condition

Parar somente em:

WAITING_HUMAN_MERGE

ou

FAILED
