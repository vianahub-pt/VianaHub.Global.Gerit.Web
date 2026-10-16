# Upgrade Gerit Web runtime to Node.js 24 LTS

## Metadata

- **ID:** `upgrade-runtime-node-24`
- **Title:** Upgrade Gerit Web runtime to Node.js 24 LTS
- **Base branch:** `develop`
- **Branch prefix:** `feature`
- **PR target:** `develop`
- **Stop condition:** `WAITING_HUMAN_MERGE` ou `FAILED`

## Objetivo

Migrar o runtime do Gerit Web de Node.js 20.19.x para Node.js 24 LTS, mantendo inicialmente a stack funcional existente:

- Next.js 15.5.14
- React 18
- TypeScript 5
- Tailwind CSS 3

A mudança deve ficar limitada ao runtime e às adaptações de compatibilidade estritamente necessárias e justificadas por evidência objetiva.

## Arquivos permitidos

Somente estes arquivos podem ser alterados durante a implementação:

- `package.json`
- `package-lock.json`
- `Dockerfile`
- `.github/workflows/ci.yml`
- `AGENTS.md`
- `agentic/README.md`

Este arquivo de goal é a instrução de trabalho e deve permanecer como está. Não altere arquivos fora da lista permitida.

## Discovery obrigatório

Antes de planejar alterações, inspecione e registre evidências sobre:

1. `package.json` e `package-lock.json`, incluindo versões, scripts, engines e dependências transitivas relevantes.
2. Compatibilidade das dependências atuais com Node.js 24, distinguindo requisitos documentados de suposições.
3. Next.js 15.5.14 em Node.js 24.
4. `sharp` e dependências nativas ou opcionais, incluindo disponibilidade de binários/prebuilds para a plataforma usada no CI e na imagem Docker.
5. Versão do npm fornecida/compatível com Node.js 24 e efeitos sobre lockfile e `npm ci`.
6. `Dockerfile`, incluindo estágio de build e runtime, imagem base e dependências de sistema.
7. `.github/workflows/ci.yml`, incluindo versão de Node, cache e comandos executados.
8. Impacto da mudança no caminho de produção e no mecanismo atual de rollback do deploy.
9. Se alguma dependência exige mudança para executar ou validar Node.js 24. Para cada mudança proposta, registre a incompatibilidade objetiva e a menor correção possível.

Não deduza compatibilidade apenas pela faixa `engines`; use documentação primária e/ou validação reproduzível quando necessário. Não faça mudanças durante a fase de discovery.

## Escopo esperado

Se o discovery confirmar a necessidade, a implementação pode:

- atualizar `engines.node` para a faixa adequada de Node.js 24;
- atualizar `@types/node` somente se necessário para alinhar tipos ao runtime/toolchain;
- atualizar as imagens/etapas do `Dockerfile` para Node.js 24 LTS;
- configurar o CI para executar com Node.js 24;
- regenerar `package-lock.json` somente se a alteração de engines, npm ou dependências exigir isso;
- corrigir incompatibilidades comprovadas, com alterações mínimas dentro dos arquivos permitidos.

Não fazer upgrade geral de Next.js, React, Tailwind, TypeScript, arquitetura ou funcionalidades. Não ampliar a migração além do necessário para compatibilidade Node.js 24.

## Validações obrigatórias

Execute as validações no ambiente Node.js 24 e registre comando, código de saída e resultado, sem reportar `PASS` para comandos que falhem:

1. `node --version` confirma Node.js 24.
2. `npm ci` em instalação limpa.
3. `git diff --check`.
4. `npm run lint`.
5. `npm run build`.
6. `npx tsc --project tsconfig.typecheck.json --noEmit`.
7. `docker build` local usando o `Dockerfile` do repositório.
8. Smoke do container, se for viável sem tocar produção; registre limitações se o ambiente local não permitir.

Se alguma validação falhar, investigue a causa. Corrija somente falhas relacionadas à compatibilidade de Node.js 24 e dentro dos arquivos permitidos. Falhas preexistentes ou externas devem ser registradas com evidência, sem mascará-las.

## Segurança e produção

- Não alterar diretamente produção, VPS, Cloudflare, Traefik, Docker de produção, banco, secrets ou GitHub Environments.
- Não fazer deploy nem merge automático.
- Produção permanece em Node.js 20 até aprovação humana do PR e promoção posterior para `main`.
- Preservar o mecanismo atual de rollback do deploy.
- Nunca fazer push para `develop` ou `main`, force push, `reset --hard`, `clean -fd`, merge automático ou mudança de proteção de branch.
- O PR desta tarefa deve ter base `develop`; o fluxo termina em `WAITING_HUMAN_MERGE` após verificar o PR aberto.

## Critérios de aceite

- O repositório declara suporte a Node.js 24 de forma coerente em engines, CI e Docker runtime.
- `npm ci` limpo, lint, build e typecheck passam com Node.js 24.
- O build do Dockerfile passa com Node.js 24; smoke local é executado quando viável.
- A stack permanece em Next.js 15.5.14, React 18, TypeScript 5 e Tailwind CSS 3, exceto mudança estritamente necessária e documentada por incompatibilidade objetiva.
- Nenhum upgrade de stack não necessário foi incluído.
- Impacto em produção e preservação do rollback foram avaliados; nenhuma alteração de produção ou deploy ocorreu.
- O PR está aberto para `develop`, com head na branch de trabalho, e o supervisor registrou número/URL verificáveis antes de finalizar em `WAITING_HUMAN_MERGE`.

## Consultas de memória

Consulte ai-memory, se disponível, usando exatamente o contexto relevante:

- **repository:** `VianaHub.Global.Gerit.Web`
- **topic:** `Node runtime`
- **topic:** `Node 24 migration`
- **topic:** `production runtime`
- **topic:** `known build failures`

Memória é auxiliar; state, journal e evidências do repositório são a fonte de continuidade. Se ai-memory estiver indisponível, registre isso no journal e continue com as fontes locais.
