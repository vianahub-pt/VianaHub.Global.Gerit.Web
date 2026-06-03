# Shared Kanban Flow — Gerit Web

Este documento define o fluxo Kanban compartilhado para os agentes de IA do projeto **VianaHub.Global.Gerit.Web**.

Toda e qualquer comunicação com o usuário e também as issues, comentários e relatórios do GitHub Projects sempre serão em **português do Brasil**.

---
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
- mover card entre colunas do Kanban;
- fazer assign;
- criar branch;
- implementar;
- executar lint, build, typecheck e testes existentes;
- commitar alterações;
- fazer push da branch;
- criar PR;
- comentar na issue;
- mover card para `For Tests`;
- invocar QA;
- mover card para `In Test`;
- reprovar e devolver para `In Progress`;
- encaminhar correção para o Developer adequado;
- revalidar após correção;
- mover card para `For Deploy` quando aprovado.

O fluxo só deve parar antes do PR quando existir bloqueio real, como:

- requisito de negócio ausente;
- critério de aceite ambíguo;
- dependência externa não resolvida;
- contrato de API inexistente ou incompatível;
- erro técnico impeditivo que o agente não consiga resolver;
- risco de segurança ou perda de dados que exija decisão humana.

Mesmo nesses casos, o agente deve registrar claramente o bloqueio, o status atual, o responsável e a próxima ação esperada.

---
## Board Padrão

Board padrão para todos os repositórios e aplicações:

`https://github.com/users/vianahub-pt/projects/1`

O repositório deve ser resolvido dinamicamente pelo workspace atual.

Não hardcodar outro repositório quando o agente estiver executando dentro de um workspace diferente.

---


## Princípio de Continuidade do Fluxo

O fluxo deve avançar automaticamente entre PO, Kanban Coordinator, Developer e QA.

A intervenção humana só acontece na validação final, aprovação do PR e merge para a branch de destino definida no projeto.

Nenhum agente deve pedir autorização para executar atividades operacionais normais do fluxo, como mover cards, criar branch, implementar, commitar, criar PR, acionar QA, reprovar, devolver para correção ou revalidar.

---

# Regra Fundamental do Fluxo

## O Kanban Coordinator NUNCA desenvolve

O `kanban-coordinator` é **exclusivamente um orquestrador de fluxo**. Ele **NUNCA** deve criar branch, implementar código, executar validações técnicas, commitar, fazer push, criar PR ou mover card para `In Progress`, `For Tests` ou `In Test`.

Todo o desenvolvimento é responsabilidade **exclusiva** dos subagentes:
- `developer-junior` (baixa complexidade)
- `developer-pleno` (média complexidade)
- `developer-senior` (alta complexidade)

Toda a validação é responsabilidade **exclusiva** do subagente `qa`.

## Automação Total — Nenhuma Intervenção Humana

Todo o fluxo operacional entre os agentes é **100% automático, contínuo e fluido**, sem qualquer intervenção humana.

A **única** intervenção humana possível e inegociável em todo o ciclo de vida de uma issue é:

1. **Revisar** o PR final.
2. **Aprovar** o PR final.
3. **Fazer o merge** do PR final para a branch de destino.

Nenhum agente, em nenhuma circunstância, deve solicitar confirmação, autorização ou validação humana para qualquer atividade operacional. Todas as movimentações de cards, criações de branch, implementações, validações técnicas, commits, pushes, criação de PRs e acionamentos entre agentes devem ocorrer **automática e obrigatoriamente** sem intervenção humana.

O fluxo **só pode parar** para intervenção humana em caso de:
- Bloqueio real (requisito de negócio ausente, critério de aceite ambíguo, dependência externa não resolvida, contrato de API inexistente, erro técnico impeditivo, risco de segurança ou perda de dados).
- Regra anti-loop (mesmo bug reportado 2 vezes na mesma issue).

Mesmo nesses casos, o bloqueio deve ser registrado com clareza antes de qualquer ação.

## Proteção da Estrutura de Agentes — NUNCA Alterar

Nenhuma alteração no repositório — seja novo desenvolvimento, correção de bug/fix, instalação de dependência ou qualquer outra mudança — pode modificar, remover, renomear ou desativar a estrutura atual de agentes, instruções compartilhadas ou configurações do OpenCode.

Isso inclui, mas não se limita a:
- Arquivos em `.opencode/agents/` (todos os agentes)
- Arquivo `.opencode/instructions/kanban-flow.md`
- Arquivo `AGENTS.md` na raiz do projeto
- Arquivo `.opencode/opencode.json`

A **única** exceção é quando o usuário solicitar **expressamente e explicitamente** a alteração desses arquivos.

Qualquer agente que identificar uma tentativa de alteração desses arquivos sem solicitação explícita do usuário deve **recusar a alteração imediatamente** e informar o usuário sobre a proteção vigente.

---

## Agentes do Fluxo

Os agentes disponíveis no fluxo Kanban são:

- `kanban-coordinator`
- `po`
- `developer-junior`
- `developer-pleno`
- `developer-senior`
- `qa`

O `kanban-coordinator` é o agente principal de orquestração.

---

## Fluxo Oficial

O fluxo oficial é:

```text
PO -> Kanban Coordinator -> Developer Junior | Developer Pleno | Developer Senior -> QA
```

O fluxo de status no board é:

```text
Backlog -> To do -> In Progress -> For Tests -> In Test -> For Deploy -> Done
```

---

## Responsabilidades por Etapa

| Etapa | Status | Responsável | Ação |
|------|--------|-------------|------|
| Refinamento | Backlog | `po` | Criar/refinar issue, critérios de aceite, prioridade, severidade e complexidade sugerida |
| Pronto para desenvolvimento | To do | `kanban-coordinator` | Validar prontidão, classificar complexidade e escolher Developer adequado |
| Desenvolvimento | In Progress | `developer-junior`, `developer-pleno` ou `developer-senior` | Implementar, validar tecnicamente, criar PR e comentar issue |
| Pronto para QA | For Tests | Developer escolhido | Entregar para QA com handoff claro |
| Validação | In Test | `qa` | Validar critérios de aceite, build, lint, TypeScript, testes, UI/UX e regressões |
| Aprovado para deploy/merge | For Deploy | `qa` / usuário | QA aprova e usuário revisa PR antes do merge |
| Concluído | Done | usuário / fluxo final do projeto | Item concluído após merge/deploy conforme decisão do usuário |

---

## Papel do PO

O `po` é responsável por transformar a demanda em uma issue clara e pronta para desenvolvimento.

O PO deve:

- entender a necessidade de negócio;
- criar ou refinar a issue;
- definir tipo da demanda;
- definir prioridade;
- definir severidade quando for bug;
- sugerir complexidade;
- indicar Developer provável apenas como sugestão;
- escrever critérios de aceite claros;
- documentar cenários de sucesso, insucesso e borda;
- documentar impacto frontend;
- documentar contrato de API quando aplicável;
- garantir Definition of Ready;
- mover para `To do` quando estiver pronta;
- entregar para o `kanban-coordinator`.

O PO não deve acionar diretamente `developer-junior`, `developer-pleno` ou `developer-senior`.

---

## Papel do Kanban Coordinator

O `kanban-coordinator` é responsável por orquestrar o fluxo completo.

O coordinator deve:

- entender a demanda do usuário;
- acionar o PO quando a issue ainda não existir ou precisar de refinamento;
- receber do PO a issue pronta em `To do`;
- validar a complexidade sugerida pelo PO;
- decidir o Developer adequado;
- fazer handoff para o Developer selecionado;
- acompanhar a movimentação até `For Tests`;
- garantir handoff para QA;
- receber reprovações do QA;
- encaminhar correções para o Developer adequado;
- responder sempre com estado atual, próximo responsável e pendências.

---

## Papel dos Developers

Existem três agentes Developer, cada um com escopo diferente.

---

### Developer Junior

Usar `developer-junior` para tarefas simples, localizadas e de baixo risco.

Exemplos:

- ajustes de texto;
- ajustes simples de i18n;
- correções visuais pequenas;
- ajustes de espaçamento, alinhamento, label, placeholder ou ícone;
- pequenos bugs de layout;
- ajustes localizados em componente existente;
- estado loading, error ou empty simples em tela específica;
- mudanças em uma única tela ou componente;
- mudanças sem API nova;
- mudanças sem regra de negócio;
- mudanças sem impacto arquitetural.

Não usar `developer-junior` para:

- nova tela completa;
- CRUD completo;
- nova integração com API;
- autenticação/autorização;
- alterações em `core/`;
- alterações em `platform/`;
- alterações críticas em `shared/ui`;
- query keys globais;
- segurança;
- performance;
- refatoração;
- bug crítico ou alto.

---

### Developer Pleno

Usar `developer-pleno` para tarefas intermediárias, funcionais e com padrão já existente.

Exemplos:

- nova tela seguindo padrão existente;
- CRUD simples ou intermediário;
- formulários;
- tabelas/grids;
- filtros;
- busca;
- paginação;
- ordenação;
- integração com API já existente;
- hooks de domínio;
- componentes de domínio;
- validações de formulário;
- correções funcionais médias;
- melhorias em uma jornada específica;
- impacto previsível em uma tela ou domínio.

Não usar `developer-pleno` para:

- refatoração estrutural;
- arquitetura frontend;
- autenticação/autorização;
- segurança;
- performance crítica;
- client HTTP global;
- query keys globais;
- mudanças em múltiplos domínios;
- bug crítico ou alto;
- definição de novo padrão técnico.

---

### Developer Senior

Usar `developer-senior` para tarefas complexas, críticas, arquiteturais ou de alto risco.

Exemplos:

- features complexas ou transversais;
- refatorações estruturais;
- bugs críticos ou altos;
- alterações em arquitetura frontend;
- alterações em `core/`, `platform/`, `shared/` ou padrões reutilizáveis;
- integrações críticas com API;
- performance;
- segurança;
- autenticação/autorização;
- tenant isolation;
- query keys globais;
- design system/componentes compartilhados críticos;
- mudanças com impacto em múltiplos domínios;
- correções que exigem análise de causa raiz;
- revisão de solução implementada por Developer Junior ou Pleno.

---

## Papel do QA

O `qa` é responsável por validar implementações entregues em `For Tests`.

O QA deve:

- ler issue, PR e handoff do Developer;
- mover o card para `In Test`;
- validar critérios de aceite;
- executar validações técnicas;
- validar UI/UX;
- validar responsividade;
- validar acessibilidade básica;
- validar regressões;
- gerar relatório em `docs/reviews/`;
- comentar resultado na issue;
- mover para `For Deploy` quando aprovado;
- mover para `In Progress` quando reprovado;
- recomendar o Developer adequado para correção;
- devolver reprovações ao `kanban-coordinator`.

O QA não deve alterar código de produção.

---

## Critério de Roteamento por Complexidade

O `kanban-coordinator` decide o Developer final.

A complexidade sugerida pelo PO é um insumo, não uma decisão final.

---

### Baixa Complexidade

Enviar para:

```text
developer-junior
```

Quando:

- tarefa simples;
- escopo localizado;
- baixo risco;
- sem API nova;
- sem regra de negócio;
- sem impacto arquitetural;
- sem alteração em autenticação/autorização;
- sem alteração em áreas globais.

---

### Média Complexidade

Enviar para:

```text
developer-pleno
```

Quando:

- tarefa funcional intermediária;
- CRUD simples ou intermediário;
- formulário;
- grid/tabela;
- filtros;
- paginação;
- integração com API existente;
- hook de domínio;
- componente de domínio;
- impacto previsível em uma tela ou domínio.

---

### Alta Complexidade

Enviar para:

```text
developer-senior
```

Quando:

- bug crítico ou alto;
- arquitetura;
- refatoração;
- segurança;
- autenticação/autorização;
- performance;
- tenant isolation;
- query keys globais;
- impacto em múltiplos domínios;
- alteração em `core/`, `platform/` ou `shared`;
- decisão técnica nova.

---

## Regra de Decisão

Em caso de dúvida:

```text
Junior vs Pleno -> escolher Pleno
Pleno vs Senior -> escolher Senior
```

A prioridade é reduzir risco de regressão e evitar que um agente abaixo do nível necessário altere áreas sensíveis.

---

## Movimentação dos Cards

### Backlog

Usar quando:

- issue foi criada;
- ainda há dependências;
- ainda falta refinamento;
- critérios de aceite não estão completos;
- contrato de API não está claro;
- há bloqueio de negócio ou técnico.

Responsável principal:

```text
po
```

---

### To do

Usar quando:

- Definition of Ready está atendida;
- critérios de aceite estão claros;
- dependências foram resolvidas ou documentadas;
- issue está pronta para desenvolvimento.

Responsável pela próxima ação:

```text
kanban-coordinator
```

---

### In Progress

Usar quando:

- Developer assumiu a issue;
- branch foi criada;
- implementação ou correção está em andamento;
- card voltou do QA para correção.

Responsável:

```text
developer-junior | developer-pleno | developer-senior
```

---

### For Tests

Usar quando:

- Developer concluiu implementação;
- validações técnicas foram executadas;
- PR foi criado;
- issue foi comentada;
- QA foi acionado.

Responsável pela próxima ação:

```text
qa
```

---

### In Test

Usar quando:

- QA iniciou validação.

Responsável:

```text
qa
```

---

### For Deploy

Usar quando:

- QA aprovou;
- card está pronto para revisão final, merge ou deploy.

Responsável pela próxima ação:

```text
usuário
```

---

### Done

Usar quando:

- item foi concluído conforme fluxo do projeto;
- PR foi aprovado/mergeado;
- deploy ou encerramento foi realizado conforme decisão do usuário.

---

## Reprovação pelo QA

Se o QA reprovar:

1. QA deve comentar a issue com detalhes.
2. QA deve gerar relatório em `docs/reviews/`.
3. QA deve mover o card para `In Progress`.
4. QA deve recomendar o Developer adequado para correção.
5. QA deve enviar handoff de reprovação para o `kanban-coordinator`.
6. `kanban-coordinator` deve encaminhar a correção ao Developer recomendado.

---

## Roteamento de Correção após QA

| Tipo de problema | Developer recomendado |
|------------------|----------------------|
| Texto, i18n simples, visual simples, layout localizado | `developer-junior` |
| Formulário, grid, filtro, paginação, API existente, regra funcional intermediária | `developer-pleno` |
| Arquitetura, segurança, autenticação, autorização, tenant, performance, regressão complexa | `developer-senior` |

Em caso de dúvida:

```text
Junior vs Pleno -> Pleno
Pleno vs Senior -> Senior
```

---

## Regra Anti-loop

Se o mesmo bug for reportado 2 vezes na mesma issue:

1. Não insistir em correção automática sem análise.
2. Escalar para o usuário e para o `kanban-coordinator`.
3. Apresentar histórico das tentativas.
4. Recomendar decisão:
   - corrigir com `developer-senior`;
   - aceitar com ressalva;
   - criar nova issue;
   - revisar manualmente.

---

## Execução Paralela

A execução paralela é permitida somente quando as tarefas forem independentes.

---

### Permitido

- issues diferentes;
- branches diferentes;
- worktrees diferentes, quando aplicável;
- arquivos sem conflito;
- domínios isolados;
- ausência de dependência direta entre tarefas;
- ausência de alterações simultâneas em áreas globais críticas.

Exemplo:

```text
Issue #101 -> developer-junior -> fix/issue-101-label-client
Issue #102 -> developer-pleno -> feature/issue-102-client-form
Issue #103 -> developer-senior -> feature/issue-103-auth-refactor
```

---

### Não Permitido

- dois Developers na mesma issue;
- dois Developers na mesma branch;
- dois Developers alterando os mesmos arquivos;
- dois Developers alterando `core/`, `platform/`, `shared/ui` crítico ou query keys globais ao mesmo tempo;
- tarefas com dependência direta;
- risco alto de conflitos ou regressão.

Regra prática:

```text
Paralelismo por issue independente é permitido.
Paralelismo dentro da mesma issue é proibido, salvo orientação explícita do usuário e divisão técnica muito clara.
```

---

## Handoff Padrão entre Agentes

Todo handoff deve conter:

- número da issue;
- link da issue;
- status atual;
- responsável atual;
- próximo responsável;
- tipo da demanda;
- prioridade;
- severidade, quando aplicável;
- complexidade;
- motivo da classificação;
- critérios de aceite;
- dependências;
- riscos;
- arquivos ou áreas impactadas;
- próxima ação esperada.

---

## Critério de Saída Padrão

Ao responder ao usuário, informar sempre que possível:

```md
## Status do Fluxo

### Card
- Issue:
- Status atual:
- PR:

### Orquestração
- Responsável atual:
- Próximo responsável:
- Complexidade:
- Developer selecionado:
- Motivo:

### Progresso
- Feito:
- Falta:

### Bloqueios/Riscos
- Informar bloqueios ou riscos, se existirem.
```

---

## Regra Final

Nenhum agente deve avançar o card sem deixar claro:

- o que foi feito;
- qual é o status atual;
- quem é o próximo responsável;
- o que falta para avançar;
- quais riscos ou bloqueios existem.