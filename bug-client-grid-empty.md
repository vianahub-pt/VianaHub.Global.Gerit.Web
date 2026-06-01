## Descrição
Como **Gestor de Clientes**, quero visualizar os registos no grid de clientes, para que possa consultar e gerir os clientes da empresa.

## Comportamento Atual (Bug)
O grid de clientes exibe a mensagem **"Nenhum cliente encontrado."** mesmo quando existem clientes na base de dados. O contador de total de itens mostra corretamente "Itens: 2", mas a tabela encontra-se vazia.

## Comportamento Esperado
O grid deve listar todos os clientes retornados pela API, com as colunas preenchidas corretamente.

## Causa Raiz
No ficheiro `domains/operations/clients/client-utils.ts`, a funcao `normalizeClient()`:

1. Acede a `candidate.phone` para obter o telefone (linha 21)
2. A API devolve o campo `phoneNumber` (camelCase do C# `PhoneNumber`), nao `phone`
3. Como `candidate.phone` e `undefined`, a validacao `typeof phone !== "string"` na linha 83 e `true`
4. A funcao retorna `null` para todos os itens (linha 86)
5. O `parsePagedClients` filtra os `null` no `.filter()` (linha 120), resultando numa lista vazia
6. O `totalItems` vem do campo `candidate.totalItems` (linha 122-128), que esta correto, por isso o contador mostra "Itens: 2" mas o grid esta vazio

## Passos para Reproduzir
1. Aceder a pagina de Clientes (`/operations/clients`)
2. Observar que o contador mostra "Itens: 2" (ou outro valor > 0)
3. Observar que o grid exibe "Nenhum cliente encontrado."
4. Verificar no DevTools (Network tab) que a chamada `GET /api/gerit/v1/clients/paged` retorna dados validos

## Impacto
**Critico** — Bloqueia completamente a visualizacao e gestao de clientes. Nenhum cliente e exibido na grid, impossibilitando qualquer operacao CRUD.

## Correcao Necessaria
No ficheiro `domains/operations/clients/client-utils.ts`, linha 21, alterar:

```typescript
// Atual (causa o bug):
const phone = candidate.phone;

// Corrigido (com fallback para phoneNumber):
const phone = candidate.phone ?? candidate.phoneNumber ?? "";
```

## Ficheiros Afetados
- **`domains/operations/clients/client-utils.ts`** — linha 21: extracao do campo `phone`
- **`domains/operations/clients/client-models.ts`** — indiretamente, se a interface `ClientItem` precisar de alinhamento com o campo real da API

## Contrato de API (Endpoint Real)
- **Endpoint:** `GET /v1/clients/paged`
- **Proxy:** `/api/gerit/v1/clients/paged`
- **Query Params:** `Search`, `IsActive`, `PageNumber`, `PageSize`, `SortBy`, `SortDirection`
- **Response (sucesso):**
  ```json
  {
    "items": [{ "id": 1, "name": "...", "phoneNumber": "...", "email": "...", ... }],
    "pageNumber": 1,
    "pageSize": 10,
    "totalItems": 2,
    "totalPages": 1
  }
  ```
- **Campo problematico:** A API devolve `phoneNumber` (camelCase de `PhoneNumber` do C#), mas o codigo espera `phone`

## Evidencia
Requisicao real via Postman:

GET http://82.29.172.68/v1/clients/paged?Search=&IsActive=true&PageNumber=1&PageSize=10&SortBy=Name&SortDirection=asc

Response: 2 itens com campos id, tenantId, clientType, clientTypeDescription, name, phoneNumber, email, contact, isActive

## Prioridade
**Critica**

## Labels sugeridas
`bug`, `frontend`, `api-integration`, `priority:critical`