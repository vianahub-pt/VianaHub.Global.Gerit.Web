## Descricao
Como utilizador do sistema, quero que a pagina de edicao de clientes seja dinamica conforme o tipo de cliente (clientType), para que os campos exibidos e enviados a API sejam adequados ao tipo de registo (Pessoa Singular ou Pessoa Juridica).

## Contexto
A API retorna uma estrutura de dados diferente dependendo do clientType do cliente:
- **clientType: 1** - Pessoa Singular: dados no objeto individual (nome proprio, apelido, data de nascimento, genero, documento, nacionalidade)
- **clientType: 4** - Pessoa Juridica: dados no objeto company (razao social, nome comercial, NIF, CAE, n. funcionarios, representante legal)

A pagina atual (clients-details.tsx) utiliza um modelo generico ClientItem e um ClientFormState que nao contempla os campos especificos de cada tipo. O normalizeClient() extrai apenas campos genericos (name, phone, email) ignorando os sub-objetos individual e company.

Esta story exige reestruturar o modelo, o normalizador, o estado do formulario e o layout da pagina para suportar formularios condicionais.

## Objetivo da Interface
- Ao abrir a pagina de edicao/criacao, o utilizador seleciona o **Tipo de Cliente**
- Conforme o tipo selecionado, os campos do formulario mudam dinamicamente
- Para **Pessoa Singular**: exibir campos de nome proprio, apelido, telefone, telemovel, WhatsApp, email, data de nascimento, genero, tipo de documento, numero de documento, nacionalidade
- Para **Pessoa Juridica**: exibir campos de razao social, nome comercial, telefone, telemovel, WhatsApp, email, site, NIF (companyRegistration), CAE, n. funcionarios, representante legal
- Campos comuns a ambos os tipos (telefone, telemovel, WhatsApp, email) permanecem sempre visiveis
- O payload enviado a API deve refletir a estrutura correta (individual ou company)

## Criterios de Aceite

### Modelo de dados
- [ ] Atualizar ClientItem em client-models.ts para incluir objetos opcionais individual e company com todos os campos da API
- [ ] Criar interfaces ClientIndividual e ClientCompany com todos os campos da resposta da API
- [ ] Atualizar normalizeClient() em client-utils.ts para extrair e mapear os sub-objetos individual e company

### Formulario dinamico
- [ ] O campo Tipo de Cliente deve ser um select obrigatorio com as opcoes existentes (Pessoa Singular = 1, Pessoa Juridica = 4, etc.)
- [ ] Ao selecionar Pessoa Singular (clientType: 1), exibir secao de campos: firstName, lastName, phoneNumber, cellPhoneNumber, isWhatsapp, email, birthDate, gender, documentType, documentNumber, nationality
- [ ] Ao selecionar Pessoa Juridica (clientType: 4), exibir secao de campos: legalName, tradeName, phoneNumber, cellPhoneNumber, isWhatsapp, email, site, companyRegistration, cae, numberOfEmployee, legalRepresentative
- [ ] Para outros tipos de cliente (Recibos Verdes, Freelancer, etc.), manter o formulario generico atual (nome, telefone, email, etc.)
- [ ] A transicao entre tipos deve limpar os campos do tipo anterior e popular os campos do novo tipo quando editando

### Validacao
- [ ] Para Pessoa Singular: firstName e lastName sao obrigatorios (ou displayName)
- [ ] Para Pessoa Juridica: legalName e obrigatorio
- [ ] PhoneNumber e obrigatorio para todos os tipos
- [ ] Validacao de formato de email (quando preenchido)
- [ ] Validacao de formato de data de nascimento (Pessoa Singular)
- [ ] Validacao numerica para numberOfEmployee (Pessoa Juridica)

### Payload de envio
- [ ] O payload PUT/POST deve enviar os campos dentro do sub-objeto correto (individual ou company) conforme o clientType
- [ ] Para Pessoa Singular: { ..., clientType: 1, individual: { firstName, lastName, phoneNumber, ... } }
- [ ] Para Pessoa Juridica: { ..., clientType: 4, company: { legalName, tradeName, phoneNumber, ... } }
- [ ] Os campos comuns (note, originType, isActive, urlImage) permanecem no nivel raiz do payload

### Loading, Empty e Error states
- [ ] Exibir skeleton/loading spinner durante carregamento dos dados do cliente
- [ ] Exibir mensagem de erro amigavel quando a API retornar erro
- [ ] Empty state mantido quando nao ha cliente selecionado

### Responsividade
- [ ] Layout do formulario adapta-se a mobile (1 coluna), tablet (2 colunas) e desktop (layout horizontal existente)
- [ ] Campos do formulario utilizam largura total em mobile

### Acessibilidade
- [ ] Todos os campos de formulario devem ter label associado
- [ ] Campos obrigatorios devem indicar visualmente (asterisco ou indicador)
- [ ] Navegacao por teclado funciona corretamente entre campos
- [ ] Focus ring visivel nos campos e botoes

### i18n
- [ ] Todas as novas labels devem ter chaves de traducao em locales/pt-PT/common.json
- [ ] Estrutura de chaves: clients.form.individual.* e clients.form.company.*
- [ ] Mensagens de erro de validacao tambem devem ser internacionalizadas

## Cenarios de Sucesso

### Pessoa Singular
**Dado que** o utilizador esta na pagina de edicao de um cliente com clientType: 1
**Quando** a pagina carrega os dados do cliente
**Entao** o formulario exibe os campos de Pessoa Singular: nome proprio, apelido, telefone, telemovel, WhatsApp, email, data de nascimento, genero, tipo de documento, numero de documento, nacionalidade
**E** os campos estao preenchidos com os dados retornados pela API (individual)

### Pessoa Juridica
**Dado que** o utilizador esta na pagina de edicao de um cliente com clientType: 4
**Quando** a pagina carrega os dados do cliente
**Entao** o formulario exibe os campos de Pessoa Juridica: razao social, nome comercial, telefone, telemovel, WhatsApp, email, site, NIF, CAE, n. funcionarios, representante legal
**E** os campos estao preenchidos com os dados retornados pela API (company)

### Alteracao de Tipo
**Dado que** o utilizador esta a criar um novo cliente
**Quando** seleciona Pessoa Singular no campo Tipo de Cliente
**Entao** os campos de Pessoa Singular sao exibidos
**Quando** altera para Pessoa Juridica
**Entao** os campos de Pessoa Singular sao ocultados e os de Pessoa Juridica sao exibidos
**E** os campos anteriores sao limpos

## Cenarios de Insucesso

### Erro de API no Carregamento
**Dado que** o utilizador abre a pagina de edicao de um cliente
**Quando** a chamada GET /api/gerit/v1/clients/{id} retorna erro (4xx ou 5xx)
**Entao** exibe um toast de erro com mensagem amigavel
**E** o formulario permanece vazio ou com estado anterior

### Erro de API no Guardar
**Dado que** o utilizador preencheu todos os campos obrigatorios
**Quando** submete o formulario e a chamada PUT/POST retorna erro
**Entao** exibe um toast de erro com a mensagem retornada pela API
**E** os dados nao sao perdidos no formulario

## Cenarios de Borda

- **Loading:** Exibir skeleton/spinner enquanto loadingClient e true
- **Empty state:** Quando clientId nao e fornecido, mostrar formulario vazio para novo registo
- **Erro de API:** Toast com variante destructiva e mensagem normalizada via normalizeErrorMessage
- **clientType desconhecido:** Para tipos nao mapeados (2, 3, 5), exibir formulario generico atual
- **Campos opcionais vazios:** Campos nao obrigatorios devem aceitar valor vazio e enviar null a API
- **Dados invalidos:** Validacao inline com mensagens de erro abaixo de cada campo obrigatorio
- **Mudanca de tipo com dados preenchidos:** Ao alterar clientType, confirmar com o utilizador se deseja descartar dados do tipo anterior (quando editando)

## Impacto Frontend

- **Rotas/Telas:**
  - app/(workspace)/operations/clients-details/page.tsx (sem alteracao, e wrapper)
  - domains/operations/clients/clients-details.tsx (refactor principal)

- **Componentes:**
  - clients-details.tsx - refactor do formulario para suportar secoes condicionais
  - Componentes de formulario inline existentes no mesmo arquivo
  - Possivel extracao de IndividualFields e CompanyFields como componentes internos

- **Hooks:**
  - useAuth (existente)
  - useTranslation (existente)
  - useToast (existente)
  - Novo useEffect para popular formulario ao carregar dados da API (atualizar existente)

- **Services/API:**
  - GET /api/gerit/v1/clients/{id} (existente) - resposta agora com sub-objetos individual/company
  - PUT /api/gerit/v1/clients/{id} (existente) - payload atualizado com sub-objetos
  - POST /api/gerit/v1/clients (existente) - payload atualizado com sub-objetos

- **Types/Schemas:**
  - client-models.ts - adicionar interfaces ClientIndividual, ClientCompany, atualizar ClientItem
  - client-utils.ts - atualizar normalizeClient() para extrair sub-objetos

- **i18n/Textos:**
  - locales/pt-PT/common.json - adicionar chaves clients.form.individual.* e clients.form.company.*
  - locales/en-US/common.json - traducao inglesa correspondente
  - locales/es-ES/common.json - traducao espanhola correspondente

- **Dependencias:**
  - shadcn/ui Label (para acessibilidade de campos)
  - shadcn/ui Select (ja utilizado para Tipo de Cliente)

## Contrato de API

### GET - Carregar cliente
- **Endpoint/proxy:** /api/gerit/v1/clients/{id}
- **Metodo:** GET
- **Request:** path param id (number)
- **Response (Pessoa Singular):**
  id, tenantId, clientType: 1, clientTypeDescription, originType, originTypeDescription, note, isActive, individual: { id, tenantId, clientId, displayName, firstName, lastName, phoneNumber, cellPhoneNumber, isWhatsapp, email, birthDate, gender, documentType, documentNumber, nationality, isActive }
- **Response (Pessoa Juridica):**
  id, tenantId, clientType: 4, clientTypeDescription, originType, originTypeDescription, urlImage, note, isActive, company: { id, tenantId, clientId, legalName, tradeName, phoneNumber, cellPhoneNumber, isWhatsapp, email, site, companyRegistration, cae, numberOfEmployee, legalRepresentative, isActive }
- **Erros tratados:** 400, 401, 403, 404, 500

### PUT - Atualizar cliente
- **Endpoint/proxy:** /api/gerit/v1/clients/{id}
- **Metodo:** PUT
- **Request (Pessoa Singular):** note, originType, isActive, individual: { firstName, lastName, displayName, phoneNumber, cellPhoneNumber, isWhatsapp, email, birthDate, gender, documentType, documentNumber, nationality }
- **Request (Pessoa Juridica):** note, originType, isActive, urlImage, company: { legalName, tradeName, phoneNumber, cellPhoneNumber, isWhatsapp, email, site, companyRegistration, cae, numberOfEmployee, legalRepresentative }
- **Response:** Mesma estrutura do GET (com sub-objeto completo)
- **Erros tratados:** 400, 401, 403, 404, 409, 500

### POST - Criar cliente
- **Endpoint/proxy:** /api/gerit/v1/clients
- **Metodo:** POST
- **Request:** Mesma estrutura do PUT (sem id)
- **Response:** Mesma estrutura do GET
- **Erros tratados:** 400, 401, 403, 409, 500

## UI/UX Esperado

- **Layout:** Mantem o layout existente com cabecalho (titulo + botoes Voltar/Estado), formulario e tabs (Informacoes, Contactos, Localizacoes)
- **Formulario:** Secao Dados do cliente com:
  - Campo clientType (select) no topo - ao alterar, troca os campos abaixo
  - Para Pessoa Singular: grid de 2 colunas com campos nome proprio/apelido, telemovel/telefone, email/WhatsApp, data de nascimento/genero, tipo de documento/numero de documento, nacionalidade
  - Para Pessoa Juridica: grid de 2 colunas com campos razao social/nome comercial, telemovel/telefone, email/WhatsApp, site/NIF, CAE/n. funcionarios, representante legal
  - Secao de observacoes e consentimento permanece igual
- **Validacoes:** Mensagens inline abaixo dos campos obrigatorios
- **Feedback ao utilizador:** Toast para sucesso/erro (padrao existente)
- **Responsividade:** Grid 1 coluna (mobile) - 2 colunas (tablet) - layout existente (desktop)
- **Acessibilidade:** Labels em todos os campos, asterisco em obrigatorios, focus ring

## Definition of Ready
- [x] Requisitos de negocio claros
- [x] Criterios de aceite objetivos
- [x] Cenarios de sucesso, insucesso e borda definidos
- [x] Contrato de API conhecido
- [x] Impacto em rotas/componentes identificado
- [x] Regras de UI/UX descritas
- [x] Sem bloqueios para o Developer iniciar

## Prioridade
Alta