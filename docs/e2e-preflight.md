# Gerit Web E2E preflight

## Classificação dos ambientes

O responsável pelo projeto classifica os ambientes Gerit atuais como testes, QA e homologação:

| Origem | Classificação e uso |
| --- | --- |
| https://gerit-api.vianahub.pt | API QA/Homologação |
| https://gerit.vianahub.pt | Web QA/Homologação |
| http://127.0.0.1:3100 | Web local de desenvolvimento e E2E |
| GitHub Environment production-vianahub | Nome técnico legado; não classifica o ambiente |

Domínio público, HTTPS, Cloudflare, publicação de containers, workflows, deploy remoto e nomes de Environments não alteram essa classificação.

## Modos e autorização

- read-only informa que a execução se limita a leitura e autenticação.
- Jornadas mutativas exigem autorização explícita do responsável em cada execução e uma opção explícita no comando. Credenciais configuradas não são prova de autorização.
- A autorização concedida nesta tarefa cobre exclusivamente a jornada EquipmentTypes no ambiente QA/Homologação e somente os registos temporários criados pela execução.
- Não existe autorização genérica permanente de mutação, nem autorização para alterar dados preexistentes de outros utilizadores.
- Para solicitar outra capability ou outro ambiente, obtenha autorização delimitada antes da execução.

O script não persiste credenciais nem tokens. O relatório de preflight informa somente se cada credencial está configurada.

## Pré-condições, dados e cleanup

O preflight valida Windows, workspace, branch, worktree, configuração local, credenciais, capability e spec canônica, porta, build E2E correspondente às fontes e presença do cleanup. Working tree suja é permitida e preservada.

EquipmentTypes cria nomes com prefixo único por execução, descobre apenas esses nomes, remove apenas os recursos criados pela jornada e confirma GET 410. Uma falha de cleanup torna a jornada falha e deve ser tratada antes de nova execução.

## Comandos

Validar configuração sem iniciar build, browser ou requests de escrita:

    node scripts/e2e/preflight.mjs equipment-types --mode read-only

Validar a autorização delimitada para a jornada mutativa EquipmentTypes:

    node scripts/e2e/preflight.mjs equipment-types --mode mutating --mutating-approved

Executar o runner oficial, que repete o preflight, prepara um build E2E fresco, executa somente a spec canônica em Chromium headed com janela maximizada e slowMo=300, e encerra os recursos geridos por Playwright:

    $env:E2E_VISUAL = "true"
    npm run test:e2e:capability -- --scope equipment-types --mutating-approved equipment-types

Executar autotestes sem rede ou mutações:

    node scripts/e2e/preflight.mjs --self-test
    node scripts/e2e/select-capabilities.mjs --self-test
    node scripts/e2e/run-capability.mjs --self-test
