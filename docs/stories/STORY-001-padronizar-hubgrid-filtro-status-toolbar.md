## 1. Identificação da História

- **Título:** Padronizar filtro de status, toolbar e densidade do HubGrid em todas as páginas de listagem
- **Tipo:** improvement
- **Prioridade:** Média
- **Complexidade sugerida pelo PO:** Média
- **Developer provável:** developer-pleno
- **Motivo da complexidade:** Envolve alterações no componente HubGrid compartilhado e em 7 páginas de listagem (clientes, equipamentos, funções, membros da equipa, equipas, utilizadores, veículos), além de ajustes nos arquivos de i18n (pt-PT, en-US, es-ES, pt-BR). Embora não haja mudança arquitetural, o impacto é transversal e exige cuidado com regressão em múltiplos domínios.

## 2. Descrição

**Como** utilizador do sistema Gerit,
**Quero** que o filtro de status, a toolbar de pesquisa e os botões de densidade do HubGrid sigam o mesmo padrão visual e funcional em todas as páginas de listagem,
**Para que** a experiência seja consistente, previsível e profissional independentemente do recurso que estou a visualizar.

## 3. Contexto

Atualmente, cada página de listagem que utiliza o componente HubGrid define os seus próprios rótulos de filtro de status, resultando em inconsistências:

- **clientes.filters.all** = "Mostrar todos"
- **equipments.filters.all** = "Todos"
- **vehicles.filters.all** = "Todos"
- **teams.filters.all** = "Todas"
- **teamMembers.filters.all** = "Mostrar todos"
- **users.filters.all** = "Mostrar todos"
- **roles.filters.all** = chave inexistente no ficheiro de tradução (em falta)

Além disso, o layout da toolbar (select de estado + input de pesquisa + botões de densidade) precisa ser padronizado para garantir que:
1. O select de estado e o input de pesquisa estejam sempre na mesma linha horizontal.
2. Os 3 botões de densidade (Compacto, Padrão, Expandido) estejam sempre na mesma linha horizontal.
3. O layout seja responsivo em todas as resoluções.

## 4. Imagens de Referência

As seguintes imagens no diretório public/layouts/ ilustram o comportamento esperado:

- component-hubgrid-b.jpg - Componente HubGrid
- component-grid-b.jpg - Componente Grid
- listar-clientes-w.jpg - Página listar clientes (versão light)
- listar-clientes-b.jpg - Página listar clientes (versão dark)
- listar-times-w.jpg - Página listar times

## 5. Definição do Problema

### 5.1. Inconsistência nos rótulos do filtro de status

| Página       | Rótulo "all" atual     | Rótulo esperado |
|-------------|------------------------|-----------------|
| Clientes    | "Mostrar todos"        | "Mostrar todos" |
| Equipamentos | "Todos"                | "Mostrar todos" |
| Veículos    | "Todos"                | "Mostrar todos" |
| Equipas     | "Todas"                | "Mostrar todos" |
| Membros     | "Mostrar todos"        | "Mostrar todos" |
| Utilizadores| "Mostrar todos"        | "Mostrar todos" |
| Funções     | (chave ausente)        | "Mostrar todos" |

### 5.2. Valor padrão do filtro

Todas as páginas já inicializam corretamente com "all" como valor padrão. Este comportamento deve ser mantido e garantido.

### 5.3. Layout da toolbar

No componente HubGrid (shared/hub-grid/hub-grid.tsx), a toolbar já posiciona o select de estado e o input de pesquisa lado a lado (linhas 136-159). No entanto, é necessário garantir que:
- O select e o input estejam sempre na mesma linha com wrapping responsivo.
- Os botões de densidade estejam sempre na mesma linha horizontal.
- O pageCaption (linha 183) fique abaixo da toolbar, separado visualmente.

### 5.4. Rótulos de densidade

Algumas páginas usam grid.density.label e outras não. Os rótulos dos botões de densidade devem ser padronizados para "Compacto", "Padrão" e "Expandido" em todas as páginas.

### 5.5. Chaves i18n em falta

A página oles (domains/operations/roles/roles-page.tsx) referencia as seguintes chaves que não existem no ficheiro de tradução:
- oles.filters.all, oles.filters.active, oles.filters.inactive, oles.filters.statusLabel, oles.filters.search
- oles.grid.density.slow, oles.grid.density.medium, oles.grid.density.expanded
- oles.loading, oles.empty
- oles.table.status, oles.table.actions
- (entre outras)

Estas chaves devem ser adicionadas em todos os 4 locales (pt-PT, pt-BR, en-US, es-ES).

## 6. Critérios de Aceite

- [ ] O select de filtro de status exibe sempre 3 opções: "Ativo", "Inativo" e "Mostrar todos"
- [ ] A opção "Mostrar todos" é a opção padrão selecionada ao carregar qualquer página
- [ ] O input de pesquisa e o select de status estão sempre na mesma linha horizontal
- [ ] Os 3 botões de densidade (Compacto, Padrão, Expandido) estão sempre na mesma linha horizontal
- [ ] O layout da toolbar é responsivo e funciona em mobile, tablet e desktop
- [ ] Todas as 7 páginas que usam HubGrid seguem o mesmo padrão
- [ ] As chaves i18n em falta para a página oles são adicionadas em todos os 4 locales
- [ ] Os testes de build, lint e typecheck passam sem erros

## 7. Cenários BDD

### Cenário de Sucesso
**Dado que** o utilizador acede a qualquer página de listagem (ex.: Clientes, Equipamentos, Funções)
**Quando** a página carrega
**Então** o filtro de estado exibe "Mostrar todos" como opção selecionada
**E** o input de pesquisa e o select de estado estão na mesma linha
**E** os 3 botões de densidade estão na mesma linha
**E** ao clicar em "Ativo" ou "Inativo" no filtro, a grelha é filtrada corretamente

### Cenário de Insucesso
**Dado que** o utilizador está numa página de listagem que não possui suporte a filtro de estado (se aplicável)
**Quando** a página carrega
**Então** o comportamento deve ser tratado sem quebra de layout (fallback)

### Cenários de Borda

- **Loading:** A toolbar mantém o layout mesmo durante o carregamento dos dados
- **Responsividade:** Em ecrãs pequenos (< 640px), o select e o input fazem wrap para linhas separadas mantendo a usabilidade
- **i18n:** Alterar o idioma não quebra o layout dos botões de densidade ou do select
- **Regressão:** Alterar os rótulos de filtro não quebra o funcionamento do filtro (valores "active", "inactive", "all" mantêm-se inalterados)

## 8. Impacto Frontend

### Rotas/Telas
- domains/operations/clients/clients-page.tsx
- domains/operations/equipments/equipments-page.tsx
- domains/operations/roles/roles-page.tsx
- domains/operations/team-members/team-members-page.tsx
- domains/operations/teams/teams-page.tsx
- domains/operations/users/users-page.tsx
- domains/operations/vehicles/vehicles-page.tsx

### Componentes
- shared/hub-grid/hub-grid.tsx - Ajustes de layout da toolbar (select + input + densidade)

### i18n/Textos
- locales/pt-PT/common.json - Padronizar chaves existentes e adicionar chaves em falta
- locales/pt-BR/common.json - Padronizar chaves existentes e adicionar chaves em falta
- locales/en-US/common.json - Padronizar chaves existentes e adicionar chaves em falta
- locales/es-ES/common.json - Padronizar chaves existentes e adicionar chaves em falta

### Dependências
- API: Nenhuma dependência de API
- Design/UI: Seguir o layout das imagens de referência em public/layouts/
- Negócio: Nenhuma mudança de regra de negócio

### Riscos de Regressão
- Alterar os rótulos i18n pode afetar a exibição em todos os 4 idiomas
- Alterar o layout da toolbar pode afetar a responsividade em ecrãs pequenos
- Adicionar chaves i18n em falta para oles pode expor outros problemas de tradução no mesmo domínio

## 9. Contrato de API

- **Endpoint/proxy:** Não aplicável (não envolve alteração de API)
- **Dependência pendente:** Não

## 10. UI/UX Esperado

### Layout
- Select de estado + input de pesquisa na mesma linha (linha horizontal única com wrapping)
- Botões de densidade na mesma linha (logo à direita do select/pesquisa)
- PageCaption abaixo da toolbar, separado visualmente

### Componentes visuais
- Select (shadcn/ui) para filtro de estado
- Input com ícone de pesquisa (shadcn/ui) para pesquisa textual
- Botões de densidade (3 botões: Compacto, Padrão, Expandido)

### Responsividade
- Desktop (> 1024px): select + input + densidade na mesma linha sem wrapping
- Tablet (640px - 1024px): select + input na mesma linha, densidade na mesma linha
- Mobile (< 640px): select e input fazem wrap vertical, densidade faz wrap vertical

### Acessibilidade
- Select de estado com ria-label definido
- Input de pesquisa com label associada
- Botões de densidade com ria-pressed e 	itle

## 11. Definition of Ready

- [x] Requisitos de negócio claros
- [x] Critérios de aceite objetivos
- [x] Cenários de sucesso, insucesso e borda definidos
- [x] Contrato de API conhecido (não aplicável)
- [x] Impacto em rotas/componentes identificado
- [x] Regras de UI/UX descritas
- [x] Prioridade definida
- [x] Severidade definida (não aplicável - é improvement)
- [x] Complexidade sugerida pelo PO definida
- [x] Sem bloqueios para o Developer iniciar

## 12. Labels sugeridas

improvement, frontend, react, nextjs, ui, i18n, priority:medium, complexity:medium, hubgrid
