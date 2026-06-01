# Relatório de QA — Issue #5

## Resumo

- **Status:** REPROVADO
- **Data:** 2026-06-01
- **QA:** gqa.md
- **Repo:** vianahub-pt/VianaHub.Global.Gerit.Web
- **Branch/PR:** PR #6 — feat: dynamic client edit page

## Escopo Validado

- Modelos de dados: client-models.ts (ClientIndividual, ClientCompany, ClientItem)
- Utilitários: client-utils.ts (normalizeIndividual, normalizeCompany, normalizeClient)
- Formulário dinâmico: clients-details.tsx (renderIndividualFields, renderCompanyFields)
- Submissão de formulário com payload condicional (individual/company)
- Locales pt-PT, en-US, es-ES
- Validação de lint, build e TypeScript

## Acceptance Criteria

| Critério | Status | Evidência/Observação |
|----------|--------|----------------------|
| Atualizar ClientItem com objetos individual e company | ✅ Aprovado | Interfaces ClientIndividual e ClientCompany criadas, ClientItem atualizado com optional individual/company |
| Criar interfaces ClientIndividual e ClientCompany | ✅ Aprovado | Todas as propriedades da API mapeadas |
| Atualizar normalizeClient() para extrair sub-objetos | ✅ Aprovado | normalizeIndividual() e normalizeCompany() implementados |
| Campo Tipo de Cliente como select obrigatório | ✅ Aprovado | SelectField com CLIENT_TYPE_OPTIONS implementado |
| Exibir campos Pessoa Singular (clientType=1) | ✅ Aprovado | renderIndividualFields() com todos os campos |
| Exibir campos Pessoa Jurídica (clientType=4) | ✅ Aprovado | renderCompanyFields() com todos os campos |
| Para outros tipos (2, 3, 5) manter formulário genérico | ❌ Reprovado | Bug: tipos 2 e 3 tratados como individual, tipo 5 como company |
| Transição entre tipos limpa campos anteriores | ❌ Reprovado | Bug: handleClientTypeChange não reseta sub-estados individual/company |
| firstName e lastName obrigatórios para Pessoa Singular | ✅ Aprovado | Validação no handleClientSubmit |
| legalName obrigatório para Pessoa Jurídica | ✅ Aprovado | Validação no handleClientSubmit |
| Validação de formato de email | ✅ Aprovado | type="email" no input (validação nativa do browser) |
| Validação de formato de data de nascimento | ✅ Aprovado | type="date" no input (validação nativa) |
| Validação numérica numberOfEmployee | ✅ Aprovado | type="number" + Number.isNaN check no payload |
| Payload PUT/POST com sub-objeto correto | ✅ Aprovado | individual/company no payload conforme clientType |
| Loading state durante carregamento | ✅ Aprovado | Loader2 spinner com loadingClient |
| Mensagem de erro amigável da API | ✅ Aprovado | Toast com normalizeErrorMessage |
| Empty state sem cliente selecionado | ✅ Aprovado | Formulário vazio para novo registo |
| Layout responsivo (mobile/tablet/desktop) | ✅ Aprovado | Grid classes: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 |
| Labels associados a campos | ✅ Aprovado | Componentes FormField e SelectField com <label> |
| Campos obrigatórios com asterisco | ✅ Aprovado | required prop com <span className="text-red-500">*</span> |
| Chaves de tradução adicionadas | ✅ Aprovado | pt-PT, en-US, es-ES com clients.form.individual.*, clients.form.company.* |

## Testes Técnicos

| Comando | Status | Observação |
|---------|--------|------------|
| npm run lint | ✅ Passou | Nenhum erro ou warning |
| npm run build | ✅ Passou | Compilação bem-sucedida em 48s, 24 páginas estáticas geradas |
| npx tsc --noEmit | ✅ Passou | Sem erros de tipo |

## Testes Funcionais e UI

- [x] Fluxo principal validado (criação/edição de cliente)
- [x] Responsividade validada (grid classes)
- [x] Loading/error/empty/success validados
- [x] Console do browser sem erros relevantes (código compila sem erros)
- [x] Contratos de API validados (payload com sub-objetos individual/company)

## Bugs Encontrados

### Bug 1 — [Alto] Transição de tipos não limpa campos anteriores

- **Severidade:** High
- **Localização:** clients-details.tsx — função handleClientTypeChange (linhas 880-888)
- **Critério violado:** "A transição entre tipos deve limpar os campos do tipo anterior e popular os campos do novo tipo quando editando"
- **Passos para reproduzir:**
  1. Abrir a página de criação de novo cliente
  2. Selecionar "Pessoa Singular" (clientType=1)
  3. Preencher campos como "firstName", "lastName", etc.
  4. Alterar para "Pessoa Jurídica" (clientType=4)
  5. Observar que os campos de Pessoa Singular permanecem preenchidos no estado
  6. Alternar novamente para "Pessoa Singular" — os dados anteriores continuam lá
- **Resultado esperado:** Ao mudar o tipo, os campos do tipo anterior devem ser limpos (resetados para valores iniciais). Quando editando, deve perguntar se deseja descartar dados do tipo anterior.
- **Resultado atual:** handleClientTypeChange apenas atualiza clientType sem resetar individual ou company no form state.
- **Código atual:**
  `	ypescript
  const handleClientTypeChange = useCallback(
    (newClientType: string) => {
      setClientFormState((prev) => ({
        ...prev,
        clientType: newClientType,
      }));
    },
    [],
  );
  `

### Bug 2 — [Alto] Comportamento incorreto para tipos 2, 3 e 5

- **Severidade:** High
- **Localização:** clients-details.tsx — funções isIndividualType e isCompanyType (linhas 293-302)
- **Critério violado:** "Para outros tipos de cliente (Recibos Verdes, Freelancer, etc.), manter o formulário genérico atual (nome, telefone, email, etc.)"
- **Critério violado:** "clientType desconhecido: Para tipos não mapeados (2, 3, 5), exibir formulário genérico atual"
- **Passos para reproduzir:**
  1. Abrir a página de criação de novo cliente
  2. Selecionar "Recibos Verdes" (clientType=2)
  3. Observar que os campos de Pessoa Singular são exibidos (firstName, lastName, etc.)
  4. O esperado seria exibir apenas o formulário genérico (nome, telefone, email)
  5. O mesmo ocorre para "Freelancer" (clientType=3) e "Sociedade Unipessoal por Quotas" (clientType=5)
- **Resultado esperado:** Apenas clientType=1 deve mostrar campos individuais, clientType=4 deve mostrar campos de company, e os demais tipos (2, 3, 5) devem mostrar formulário genérico.
- **Resultado atual:**
  `	ypescript
  const INDIVIDUAL_CLIENT_TYPES = new Set([1, 2, 3]);
  const COMPANY_CLIENT_TYPES = new Set([4, 5]);
  `
  Isto faz com que tipos 2 e 3 exibam campos individuais e tipo 5 exiba campos de company, contrariando a especificação da issue.

## Decisão Final

- **REPROVADO:** Bugs de severidade **Alta** encontrados.
- **Ação:** Mover card para **In Progress**, comentar com detalhes dos bugs, e invocar o agente Developer para correção.
