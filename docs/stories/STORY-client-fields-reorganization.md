## Descrição

**Como** operador/gestor que edita clientes,
**quero** que os campos da aba "Informações" na página de detalhes/edição de clientes estejam organizados num grid de 3 colunas com agrupamento lógico por linhas,
**para que** a interface seja mais intuitiva, organizada e eficiente para preenchimento e consulta.

## Contexto

Atualmente, a função `renderIndividualFields()` em `domains/operations/clients/clients-details.tsx` renderiza todos os campos num único grid auto-flow (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`) sem agrupamento explícito por linhas. Os campos `originType`, `isActive` e `note` estão fora da secção individual, no grid pai `renderInfoTab()`.

A nova especificação de layout reorganiza todos os campos da aba Informações (incluindo `originType`, `isActive` e `note`) num formato estruturado de 7 linhas com grid de 3 colunas, melhorando a usabilidade e consistência visual.

## Objetivo da Interface

O utilizador deve visualizar um formulário de edição onde os campos estão dispostos em linhas de 3 colunas (com alguns campos ocupando as 3 colunas inteiras), seguindo a ordem especificada abaixo. O footer deve conter os botões "Voltar" e "Guardar" alinhados à esquerda.

## Critérios de Aceite

- [ ] **Linha 1:** "Nome completo" (`displayName`) ocupa as 3 colunas do grid
- [ ] **Linha 2:** "Nome próprio" (`firstName`) na col 1 | "Apelido" (`lastName`) na col 2 | "Origem" (`originType`) na col 3
- [ ] **Linha 3:** "E-mail" (`email`) ocupa as 3 colunas do grid
- [ ] **Linha 4:** "Telefone" (`phoneNumber`) na col 1 | "Telemóvel" (`cellPhoneNumber`) na col 2 | "WhatsApp" (`isWhatsapp` toggle) na col 3
- [ ] **Linha 5:** "Data de nascimento" (`birthDate`) na col 1 | "Género" (`gender` select) na col 2 | "Nacionalidade" (`nationality`) na col 3
- [ ] **Linha 6:** "Tipo de documento" (`documentType` select) na col 1 | "Número de documento" (`documentNumber`) na col 2 | "Ativar/Desativar" (`isActive` toggle) na col 3
- [ ] **Linha 7:** "Observações" (`note` textarea) ocupa as 3 colunas do grid, abaixo de todos os outros campos
- [ ] **Footer:** Botões "Voltar" e "Guardar" alinhados no canto esquerdo, abaixo do formulário
- [ ] Responsividade mantida: grid colapsa para 1 coluna em mobile (`sm:grid-cols-2`, `lg:grid-cols-3`)
- [ ] Lint, build e `tsc --noEmit` passam sem erros
- [ ] `originType` e `isActive` movidos do grid pai (`renderInfoTab`) para dentro da secção individual
- [ ] `note` (Observações) movido do grid pai para a última linha da secção individual
- [ ] ToggleField `isActive` usa os labels de i18n `clients.switch.on` / `clients.switch.off`

## Cenário de Sucesso

**Dado que** o utilizador está na aba "Informações" da página de detalhes/edição de clientes
**Quando** visualiza o formulário de dados individuais
**Então** os campos estão organizados em 7 linhas, com "Nome completo" e "E-mail" ocupando 3 colunas cada, e os restantes campos dispostos em triplas nas linhas 2, 4, 5 e 6, com "Observações" no final

## Cenário de Insucesso

**Dado que** o formulário está visível mas o cliente é do tipo empresa (Pessoa Jurídica)
**Quando** a secção individual não é exibida (apenas a secção de empresa)
**Então** a reorganização dos campos individuais não se aplica, mantendo a lógica condicional existente (`showIndividualFields` / `showCompanyFields`)

## Cenários de Borda

- **Loading:** O formulário já carrega com os dados do cliente; não há loading state adicional. O header já possui loading state via `loadingClient`.
- **Empty state:** Quando não há cliente selecionado (modo criação), os campos iniciam vazios conforme `initialIndividualFormState`. O campo `isActive` inicia como `true`.
- **Erro de API:** A submissão do formulário já possui tratamento de erro com toast. Não há alteração neste comportamento.
- **Permissão negada:** A página já redireciona para login em caso de 401. Sem alterações.
- **Dados inválidos:** As validações existentes de `firstName` e `lastName` obrigatórios permanecem.
- **Responsivo:** Em mobile (<640px), todos os campos ocupam 1 coluna. Em tablet (640-1023px), 2 colunas. Em desktop (>=1024px), 3 colunas.

## Impacto Frontend

- **Rotas/Telas:** `domains/operations/clients/clients-details.tsx` (aba Informações)
- **Componentes:** `renderIndividualFields()` — reestruturação completa do layout grid para linhas explícitas com `lg:col-span-3` onde aplicável
- **Componentes (pai):** `renderInfoTab()` — remover `originType` e `note` do grid pai; adicionar botão "Voltar" no footer junto a "Guardar"
- **Hooks/Services:** Nenhum novo hook. `updateIndividual` e `updateClient` (indirect via setClientFormState) podem ser usados
- **Types/Schemas:** `IndividualFormState` — considera-se adicionar `originType` ao state ou acessar via `clientFormState.originType` diretamente
- **i18n/Textos:** Usar chaves existentes: `clients.form.individual.*`, `clients.form.origin`, `clients.form.observation`, `clients.switch.*`, `clients.actions.save`, `clients.actions.back`
- **Dependências:** Nenhuma nova dependência externa. Manter `clsx` para classes condicionais

## Contrato de API

- **Endpoint/proxy:** `/api/gerit/v1/clients/{id}` (existente, GET/PUT)
- **Método:** `GET` / `PUT` (sem alterações)
- **Request:** Mesmo payload atual, mas `originType` agora faz parte da resposta individual ou é enviado no root do payload? Atualmente `originType` está no root do payload. O Developer deve confirmar se `originType` continua no root ou deve ser movido para dentro de `individual` no payload da API.
- **Response:** Mesma estrutura existente. O campo `originType` atualmente vem no root do response.
- **Erros tratados:** 400, 401, 403, 404, 409, 500 (comportamento existente mantido)

## UI/UX Esperado

- **Layout:** Grid de 3 colunas com linhas explícitas. Cada linha usa `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">` com col-span para campos full-width
- **Componentes visuais:** `FormField` (input), `SelectField` (select), `ToggleField` (toggle switch), `textarea` para Observações
- **Validações:** `firstName` e `lastName` marcados como `required` (comportamento existente)
- **Feedback ao usuário:** Toast de sucesso/erro na submissão (comportamento existente)
- **Responsividade:** `grid-cols-1` (mobile) → `sm:grid-cols-2` (tablet) → `lg:grid-cols-3` (desktop)
- **Acessibilidade:** Labels nos FormField e SelectField já existem. O ToggleField precisa de label. O botão "Voltar" deve ter `title` ou `aria-label`.
- **Footer:** Botão "Voltar" (ícone/label) + botão "Guardar" (ícone loading + label), alinhados à esquerda com `flex justify-start`

## Definition of Ready

- [x] Requisitos de negócio claros — layout especificado linha a linha
- [x] Critérios de aceite objetivos — 11 critérios testáveis
- [x] Cenários de sucesso, insucesso e borda definidos
- [x] Contrato de API conhecido — sem alterações que impactem o contrato
- [x] Impacto em rotas/componentes identificado — apenas `clients-details.tsx`
- [x] Regras de UI/UX descritas — grid explícito, footer alinhado esquerda
- [x] Sem bloqueios para o Developer iniciar

## Prioridade

Média

## Labels sugeridas

`story`, `frontend`, `react`, `nextjs`, `ui`, `priority:medium`
