# Shared Kanban Flow — Gerit Web

Este documento define o fluxo Kanban compartilhado para os agentes de IA do projeto **VianaHub.Global.Gerit.Web**.

Toda e qualquer comunicação com o usuário e também as issues, comentários e relatórios do GitHub Projects sempre serão em **português do Brasil**.

---

# Regra de Automação Contínua

O fluxo deve ser **contínuo e fluido**, sem intervenção humana entre as etapas operacionais dos agentes.

A intervenção humana deve acontecer apenas nos seguintes momentos:

1. Validar o resultado final quando o QA aprovar.
2. Revisar o PR.
3. Aprovar o PR.
4. Fazer o merge do PR para a branch de destino definida no fluxo do projeto.

Os agentes não devem pedir confirmação para:

- criar ou refinar issue;
- criar branch;
- implementar;
- executar validações conforme modo;
- commitar alterações;
- fazer push da branch;
- criar PR;
- comentar na issue;
- notificar o kanban-coordinator ao finalizar cada etapa.

O fluxo só deve parar antes do PR quando existir bloqueio real.

---

## Board Padrão

Board padrão para todos os repositórios e aplicações:

`https://github.com/users/vianahub-pt/projects/1`

O repositório deve ser resolvido dinamicamente pelo workspace atual.

---

# Convenções de Branch e PR

Toda e qualquer alteração no repositório deve seguir estas convenções:

| Tipo de demanda | Branch base | PR base | Prefixo branch | Exemplo |
|-----------------|-------------|---------|----------------|---------|
| Feature, Melhoria, Correção (padrão) | `develop` | `develop` | `feature/` ou `fix/` | `feature/issue-184-expand-addresses` |
| Hotfix de produção (bug crítico) | `main` | `main` | `hotfix/` | `hotfix/issue-200-fix-login-error` |

**Regra padrão:** toda demanda cria branch a partir de `develop` e PR para `develop`.
**Exceção:** apenas fix de bug em produção usa `main` como base.

---

# Regras Fundamentais

## ⛔ VIOLAÇÃO DE DIRETIVAS É PROIBIDA

**TODAS as diretivas deste arquivo são OBRIGATÓRIAS e INEGOCIÁVEIS.**

### Regra de Comunicação entre Agentes

O `kanban-coordinator` deve passar aos agentes especializados **APENAS**:

- **O que fazer** (ação objetiva e específica)
- **Onde está** (link da issue/PR)
- **Modo de execução** (FAST_PATH, STANDARD_PATH, FULL_PATH ou variantes QA/UI)
- **O que entregar de volta** (resultado esperado)

**NUNCA incluir nos handoffs:**
- Contexto completo da issue
- O que outros agentes já fizeram
- Comandos que já foram executados
- Validações técnicas já realizadas
- Histórico de movimentação

### O Kanban Coordinator NUNCA desenvolve

O `kanban-coordinator` é **exclusivamente um orquestrador de fluxo**. Ele **NUNCA** deve criar branch, implementar código, executar validações técnicas, commitar, fazer push ou criar PR.

### O Kanban Coordinator é o Único Gestor de Cards

Toda movimentação de cards no board é feita **exclusivamente pelo `kanban-coordinator`**. Nenhum outro agente move cards.

---

## Automação Total — Nenhuma Intervenção Humana

O fluxo deve ser **contínuo e fluido**, sem parar para pedir/solicitar informações ao usuário enquanto o processo de desenvolvimento estiver acontecendo. O processo deve obrigatoriamente ser contínuo.

A **única** intervenção humana possível e inegociável:

1. **Revisar** o PR final.
2. **Aprovar** o PR final.
3. **Fazer o merge** do PR final para a branch de destino.

---

## Proteção da Estrutura de Agentes — NUNCA Alterar

Nenhuma alteração no repositório pode modificar, remover, renomear ou desativar a estrutura atual de agentes, instruções compartilhadas ou configurações do OpenCode.

A **única** exceção é quando o usuário solicitar **expressamente e explicitamente** a alteração desses arquivos.

---

# Agentes do Fluxo

- `kanban-coordinator`
- `po`
- `developer-junior`
- `developer-pleno`
- `developer-senior`
- `ui-ux`
- `qa`

---

# Fluxo Oficial

```text
PO -> Kanban Coordinator -> Developer Junior | Developer Pleno | Developer Senior | UI/UX -> QA
```

Fluxo de status:

```text
Backlog -> To do -> In Progress -> For Tests -> In Test -> For Deploy -> Done
```

---

# Modos de Execução

O `kanban-coordinator` classifica cada tarefa em um dos três modos antes de fazer handoff:

## Para Developers (FAST_PATH / STANDARD_PATH / FULL_PATH)

| Modo | Critérios | Validações |
|------|-----------|------------|
| `FAST_PATH` | Tarefa trivial, alteração mínima, baixo risco. **Sempre** `developer-junior`. | `git diff --check` + lint (se aplicável). **NÃO** build/typecheck por padrão. |
| `STANDARD_PATH` | Tarefa funcional intermediária, padrão existente | `git diff --check` + lint + typecheck |
| `FULL_PATH` | Tarefa complexa, crítica, arquitetural | `git diff --check` + lint + build + typecheck |

## Para QA (QA_FAST / QA_STANDARD / QA_FULL)

| Modo | Critérios | Validações |
|------|-----------|------------|
| `QA_FAST` | Tarefa trivial, Developer já reportou validação suficiente | Revisão de código + critérios de aceite. Sem reexecução de build/lint. |
| `QA_STANDARD` | Tarefa de média complexidade | Lint + build/typecheck + validação funcional |
| `QA_FULL` | Tarefa crítica, arquitetural, segurança | Todas do STANDARD + UI manual + contratos + acessibilidade + segurança |

## Para UI/UX (UI_FAST / UI_STANDARD / UI_FULL)

| Modo | Critérios | Validações |
|------|-----------|------------|
| `UI_FAST` | Ajuste visual simples, localizado | `git diff --check` + lint (se aplicável). Sem build. |
| `UI_STANDARD` | Melhoria de layout, responsividade, componente visual | `git diff --check` + lint + typecheck |
| `UI_FULL` | Template, tema, design system, alteração global | `git diff --check` + lint + build + typecheck |

---

# Responsabilidades por Etapa

| Etapa | Status | Responsável | Ação |
|------|--------|-------------|------|
| Refinamento | Backlog | `po` + `kanban-coordinator` | PO cria/refina issue; coordinator move para Backlog |
| Pronto para dev | To do | `kanban-coordinator` | Classifica modo, escolhe Developer/UI/UX, move para To do |
| Desenvolvimento | In Progress | `kanban-coordinator` + Developer/UI/UX | Coordinator move; implementa conforme modo, cria PR e comenta |
| Pronto para QA | For Tests | `kanban-coordinator` | Move para For Tests e aciona QA |
| Validação | In Test | `kanban-coordinator` + `qa` | Coordinator move; QA valida conforme modo QA |
| Aprovado | For Deploy | `kanban-coordinator` | Move para For Deploy; usuário revisa PR |
| Concluído | Done | Usuário | Merge do PR |

---

# Papel do PO

O PO cria/refina issues e notifica o `kanban-coordinator`. O PO não move cards e não aciona Developers diretamente.

---

# Papel do Kanban Coordinator

O coordinator orquestra todo o fluxo: recebe demanda, aciona PO, classifica modo, escolhe Developer/UI/UX, move cards, aciona QA, recebe resultado e encaminha correções.

---

# Papel dos Developers

Três agentes Developer com escopo diferente:

- `developer-junior`: tarefas simples, `FAST_PATH` padrão
- `developer-pleno`: tarefas intermediárias, `STANDARD_PATH` padrão
- `developer-senior`: tarefas complexas, `FULL_PATH` padrão

Cada Developer executa validações conforme o modo indicado no handoff.

---

# Papel do UI/UX

Especialista em interface visual, layout, temas, responsividade e design system. Trabalha com modos `UI_FAST`, `UI_STANDARD`, `UI_FULL`. Atua como subagent no fluxo coordenado.

---

# Papel do QA

Valida implementações conforme modo `QA_FAST`, `QA_STANDARD` ou `QA_FULL`. Não altera código. Não move cards. Notifica resultado ao coordinator.

---

# Roteamento por Complexidade

## Regra Determinística

Tarefas triviais (remover input, botão, label, texto, alterar placeholder, ícone, valor default, ajuste Tailwind localizado, i18n simples) **sempre** vão para `developer-junior` + `FAST_PATH` + `QA_FAST`. Exceto se exigir alteração de API, schema, payload, validação, hook, regra de negócio ou tipo compartilhado.

| Critério | Developer | Modo padrão |
|----------|-----------|-------------|
| Simples, localizado, baixo risco | `developer-junior` | `FAST_PATH` |
| Funcional, intermediário, padrão existente | `developer-pleno` | `STANDARD_PATH` |
| Complexo, crítico, arquitetural | `developer-senior` | `FULL_PATH` |
| UI/UX visual, layout, tema | `ui-ux` | Conforme impacto |

Em caso de dúvida:

```text
Tarefa parece trivial? → developer-junior + FAST_PATH
Junior vs Pleno? → Verificar checklist de justificativa. Se nenhuma opção marcar, manter junior.
Pleno vs Senior? → Senior
```

## Justificativa Obrigatória para Escalonamento

Se o coordinator escolher `developer-pleno`, `developer-senior` ou `ui-ux` para tarefa aparentemente trivial, deve registrar na issue:

```md
## Justificativa de escalonamento

A tarefa parecia trivial, mas foi roteada para `[agente]` porque envolve:

- [ ] alteração de API
- [ ] alteração de payload
- [ ] alteração de schema/validação
- [ ] alteração de hook
- [ ] alteração de tipo compartilhado
- [ ] alteração em `core/`
- [ ] alteração em `platform/`
- [ ] alteração em `shared` crítico
- [ ] regra de negócio
- [ ] risco funcional médio/alto
- [ ] outro motivo: ...
```

Se nenhuma opção justificar → rotear para `developer-junior`.

---

# Roteamento de Correção após QA

| Tipo de problema | Developer | Modo |
|------------------|-----------|------|
| Texto, i18n simples, visual simples | `developer-junior` | `FAST_PATH` |
| Formulário, grid, filtro, API existente | `developer-pleno` | `STANDARD_PATH` |
| Arquitetura, segurança, performance | `developer-senior` | `FULL_PATH` |

---

# Reprovação pelo QA

Se o QA reprovar:

1. QA comenta a issue com detalhes
2. QA recomenda Developer adequado
3. QA notifica `kanban-coordinator`
4. Coordinator move card para `In Progress` e encaminha correção

---

# Deteção de Merge (pós For Deploy)

Após mover o card para **For Deploy**, o Coordinator deve verificar periodicamente se o PR foi mergeado:

```powershell
# Verificar estado do PR
gh pr view PR_NUMERO --repo vianahub-pt/VianaHub.Global.Gerit.Web --json state,mergedAt
```

- Se `state == "MERGED"`, mover card para **Done** e notificar o usuário.
- Se `state == "OPEN"`, aguardar e repetir a verificação a cada 5 minutos.
- Se `state == "CLOSED"` (sem merge), notificar o usuário para decisão.

---

# Procedimento de Conflito de Merge

Se durante o desenvolvimento ocorrer um **conflito de merge** ao fazer `git pull origin develop` ou ao criar o PR:

1. O Developer atual **não tenta resolver o conflito sozinho**.
2. O Developer informa o Kanban Coordinator sobre o conflito.
3. O Kanban Coordinator **invoca o Developer Senior** para analisar e resolver o conflito.
4. Após resolução, o fluxo normal retoma com o Developer original.

**Nota:** Todo Developer é obrigado a executar `npm run build` antes de fazer `git push`. Se o build falhar, o Developer deve corrigir antes de prosseguir.

---

# Regra Anti-loop

Se o mesmo bug for reportado 2 vezes na mesma issue → escalar para `kanban-coordinator`.

---

# Execução Paralela

**Permitido:** Issues diferentes, branches diferentes, domínios isolados
**Proibido:** Mesma issue, mesma branch, mesmos arquivos, áreas globais críticas

---

# Critério de Saída

Ao responder ao usuário:

```md
## Status do Fluxo

### Card
- Issue:
- Status atual:
- Modo:
- PR:

### Orquestração
- Responsável atual:
- Próximo responsável:

### Progresso
- Feito:
- Falta:

### Bloqueios
- [Se houver]
```
