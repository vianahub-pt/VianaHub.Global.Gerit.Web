# Plano de Migração — Gerit Web

> **Data:** 2026-07-31
> **Repositório Backend:** https://github.com/vianahub-pt/VianaHub.Global.Gerit
> **Repositório Frontend:** https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web
> **Branch Backend:** `develop`

---

## 1. Resumo Executivo

O Backend (VianaHub.Global.Gerit) passou por uma evolução drástica com **56 tabelas** e **~377 endpoints**. O Frontend (Gerit Web) possui several domínios implementados mas com gaps significativos em relação à nova API. Este documento mapeia cada gap e define um plano de migração faseado.

**Números-chave:**
- Backend: 56 tabelas, ~377 endpoints, 43 domínios de API
- Frontend: ~10 domínios implementados, ~15 módulos placeholder
- Endpoints consumidos pelo Frontend: ~60 (de ~377 disponíveis)
- Novos domínios a implementar: ~33

---

## 2. Análise da Nova Base de Dados

### 2.1 Visão Geral das Tabelas (56 total)

#### Catálogos Globais (sem TenantId) — 14 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 1 | `PartyTypes` | Tipos de entidade jurídica (Individual, Organization) |
| 2 | `PartyTypeTranslations` | Traduções dos tipos de entidade |
| 3 | `AcquisitionSourceTypes` | Fontes de aquisição de clientes |
| 4 | `AcquisitionSourceTypeTranslations` | Traduções das fontes |
| 5 | `AddressTypes` | Tipos de endereço (residencial, comercial, etc.) |
| 6 | `AddressTypeTranslations` | Traduções dos tipos de endereço |
| 7 | `DocumentTypes` | Tipos de documento (CC, NIF, Passaporte) |
| 8 | `DocumentTypeTranslations` | Traduções dos tipos de documento |
| 9 | `FileTypes` | Tipos de arquivo (MimeType + Extension) |
| 10 | `FileTypeTranslations` | Traduções dos tipos de arquivo |
| 11 | `StatusDomains` | Domínios de status (ClientStatus, VisitStatus, etc.) |
| 12 | `StatusDomainTranslations` | Traduções dos domínios |
| 13 | `SubscriptionPlans` | Planos de assinatura (preços, limites) |
| 14 | `SubscriptionPlanTranslations` | Traduções dos planos |
| 15 | `SubscriptionPlanFileRules` | Regras de arquivo por plano |
| 16 | `Resources` | Recursos do sistema (globais) |
| 17 | `Actions` | Ações disponíveis (globais) |
| 18 | `JobDefinitions` | Definições de jobs agendados (Hangfire) |

#### Tenant / Empresa — 5 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 19 | `Tenants` | Empresa/organização principal (raiz do multi-tenant) |
| 20 | `TenantContactPersons` | Contatos do tenant |
| 21 | `TenantAddresses` | Endereços do tenant |
| 22 | `TenantFiscalData` | Dados fiscais do tenant |
| 23 | `TenantDocuments` | Documentos do tenant |

#### Clientes — 5 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 24 | `Clients` | Entidade principal do cliente |
| 25 | `ClientAddresses` | Endereços do cliente |
| 26 | `ClientContactPersons` | Contatos do cliente |
| 27 | `ClientDocuments` | Documentos do cliente |
| 28 | `ClientFiscalData` | Dados fiscais do cliente |

#### Funcionários — 4 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 29 | `Employees` | Funcionários |
| 30 | `EmployeeContactPersons` | Contatos do funcionário |
| 31 | `EmployeeAddresses` | Endereços do funcionário |
| 32 | `EmployeeFiscalData` | Dados fiscais do funcionário |

#### Equipes — 2 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 33 | `Teams` | Equipes |
| 34 | `EmployeeTeam` | Alocação de funcionários em equipes (com período) |

#### Veículos / Equipamentos — 3 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 35 | `Vehicles` | Veículos |
| 36 | `EquipmentTypes` | Tipos de equipamento |
| 37 | `Equipments` | Equipamentos |

#### Visitas (Operacional) — 9 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 38 | `Visits` | Visitas/agendamentos |
| 39 | `VisitContactPersons` | Contatos da visita |
| 40 | `VisitAddresses` | Endereços da visita |
| 41 | `VisitTeam` | Equipes alocadas na visita |
| 42 | `VisitTeamFunctions` | Funções dos membros na visita |
| 43 | `VisitTeamEmployee` | Funcionários na equipe da visita |
| 44 | `VisitTeamVehicle` | Veículos da equipe na visita |
| 45 | `VisitTeamEquipment` | Equipamentos da equipe na visita |
| 46 | `VisitAttachments` | Anexos/fotos da visita |

#### User / Auth — 9 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 47 | `Users` | Usuários do sistema |
| 48 | `UserPreferences` | Preferências do usuário |
| 49 | `Roles` | Papéis/funções por tenant |
| 50 | `RolePermissions` | Permissões: Role × Resource × Action |
| 51 | `UserRoles` | Atribuição de Roles a Users |
| 52 | `RefreshTokens` | Tokens de refresh para JWT |
| 53 | `JwtKeys` | Chaves RSA para assinatura JWT |

#### Status Definitions — 2 tabelas

| # | Tabela | Descrição |
|---|--------|-----------|
| 54 | `StatusDefinitions` | Definições de status por Tenant + StatusDomain |
| 55 | `StatusDefinitionTranslations` | Traduções das definições de status |

#### Assinaturas — 1 tabela

| # | Tabela | Descrição |
|---|--------|-----------|
| 56 | `Subscriptions` | Assinaturas ativas dos tenants (Stripe) |

---

### 2.2 Padrões Identificados

#### Padrão 1: Multi-Tenancy (TenantId)

Todas as tabelas de negócio possuem `TenantId INT NOT NULL` com FK para `Tenants(Id)`.

**Row-Level Security (RLS):** Implementado via `TenantSecurityPolicy` com FILTER + BLOCK predicates em **36 tabelas**. A função `fn_TenantAccessPredicate` verifica `SESSION_CONTEXT(N'TenantId')` e `SESSION_CONTEXT(N'IsSuperAdmin')`.

**Exceções (tabelas globais sem TenantId):**
- PartyTypes, AcquisitionSourceTypes, AddressTypes, DocumentTypes, FileTypes, StatusDomains (+ suas traduções)
- SubscriptionPlans (+ traduções)
- Resources, Actions, JobDefinitions

#### Padrão 2: Audit Completo

Todas as tabelas possuem:
```
IsActive      BIT           NOT NULL DEFAULT 1
IsDeleted     BIT           NOT NULL DEFAULT 0
CreatedBy     INT           NOT NULL
CreatedAt     DATETIME2(7)  NOT NULL DEFAULT SYSUTCDATETIME()
ModifiedBy    INT           NULL
ModifiedAt    DATETIME2(7)  NULL
```

**CHECK constraint:** `(ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)` — garante preenchimento conjunto.

#### Padrão 3: Soft Delete + Active/Deleted Mútuos

```
IsActive  BIT DEFAULT 1
IsDeleted BIT DEFAULT 0
CHECK: NOT (IsActive = 1 AND IsDeleted = 1)
```

#### Padrão 4: Catalog + Translation

6 domínios de catálogo usam padrão idêntico:
```
CatalogTable (Id, Code, audit) + CatalogTableTranslations (Id, FK, LanguageCode, Name, Description)
```
- UQ: (CatalogId, LanguageCode) — 1 tradução por idioma
- UQ: (LanguageCode, Name) — nome único por idioma

#### Padrão 5: Status Domain / Status Definition

```
StatusDomains (GLOBAL) → categorias (ClientStatus, VisitStatus, etc.)
  └── StatusDomainTranslations (GLOBAL)
  └── StatusDefinitions (POR TENANT) → valores concretos
        └── StatusDefinitionTranslations (POR TENANT)
```

**Entidades que usam StatusDefinitions (6):** Clients, Employees, Equipments, Vehicles, Visits, Subscriptions

**FK composta:** `(StatusDefinitionId, TenantId, StatusDomainId) → StatusDefinitions(Id, TenantId, StatusDomainId)`

#### Padrão 6: Unique Constraint (Id, TenantId)

A maioria das tabelas de negócio tem `UQ UNIQUE (Id, TenantId)` — suporta FKs compostas que propagam o TenantId para tabelas filhas.

#### Padrão 7: IsPrimary Pattern

Sub-entidades (endereços, contatos, documentos) possuem `IsPrimary BIT DEFAULT 0` com UQ parcial filtrada — garante no máximo 1 registro principal por entidade pai.

#### Padrão 8: Template de Endereço

TenantAddresses, ClientAddresses, EmployeeAddresses, VisitAddresses compartilham:
```
AddressTypeId, CountryCode (DEFAULT 'PT'), Street, Neighborhood, City, District,
PostalCode, StreetNumber, Complement, Latitude, Longitude, Note, IsPrimary
```

#### Padrão 9: Template de Contato

TenantContactPersons, ClientContactPersons, EmployeeContactPersons, VisitContactPersons:
```
JobTitle, Department, Name, PhoneNumber, CellPhoneNumber, IsCellPhoneWhatsapp, Email, IsPrimary
```

#### Padrão 10: Template de Dados Fiscais

TenantFiscalData, ClientFiscalData, EmployeeFiscalData:
```
TaxNumber, VatNumber, FiscalCountry (DEFAULT 'PT'), IsVatRegistered, IBAN, FiscalEmail
```

---

### 2.3 Mapeamento de Entidades e Sub-entidades

```
Tenants (entidade raiz)
  ├── TenantContactPersons (N:1)
  ├── TenantAddresses (N:1)
  ├── TenantFiscalData (1:1 ativo)
  ├── TenantDocuments (N:1)
  ├── StatusDefinitions (N:1)
  ├── Subscriptions (1:1 ativo)
  ├── Users (N:1)
  │     └── UserPreferences (1:1)
  ├── Roles (N:1)
  │     └── RolePermissions (N:N)
  ├── UserRoles (N:N)
  ├── RefreshTokens (N:1)
  └── JwtKeys (1:1 ativo)

Clients
  ├── ClientAddresses (N:1)
  ├── ClientContactPersons (N:1)
  ├── ClientDocuments (N:1)
  ├── ClientFiscalData (1:1 ativo)
  └── Visits (N:1)

Employees
  ├── EmployeeAddresses (N:1)
  ├── EmployeeContactPersons (N:1)
  ├── EmployeeFiscalData (1:1 ativo)
  ├── EmployeeTeam (N:N)
  └── VisitTeamEmployee (N:N)

Teams
  ├── EmployeeTeam (N:N)
  └── VisitTeam (N:N)

Visits (entidade mais complexa)
  ├── VisitContactPersons (N:1)
  ├── VisitAddresses (N:1)
  ├── VisitTeam (N:N)
  │     ├── VisitTeamEmployee (N:N)
  │     ├── VisitTeamVehicle (N:N)
  │     └── VisitTeamEquipment (N:N)
  └── VisitAttachments (N:1)

EquipmentTypes
  └── Equipments (N:1)

SubscriptionPlans
  ├── SubscriptionPlanTranslations (N:1)
  └── SubscriptionPlanFileRules (N:1)
```

---

## 3. Análise dos Endpoints da API

### 3.1 Resumo dos Endpoints

| Métrica | Quantidade |
|---------|-----------|
| **Total de endpoints** | **~377** |
| Domínios | 43 |
| GET | ~130 |
| POST | ~110 |
| PUT | ~40 |
| PATCH | ~60 |
| DELETE | ~40 |
| Bulk Upload | ~30 |

### 3.2 Padrão CRUD Padrão

A maioria dos recursos segue este padrão:

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET /` | `/{resource}` | Obter todos |
| `GET /{id}` | `/{resource}/{id}` | Obter por ID |
| `GET /paged` | `/{resource}/paged` | Obter paginados com filtros |
| `POST /` | `/{resource}` | Criar novo |
| `PUT /{id}` | `/{resource}/{id}` | Atualizar |
| `PATCH /{id}/activate` | `/{resource}/{id}/activate` | Ativar |
| `PATCH /{id}/deactivate` | `/{resource}/{id}/deactivate` | Desativar |
| `DELETE /{id}` | `/{resource}/{id}` | Eliminar |
| `POST /bulk-upload` | `/{resource}/bulk-upload` | Upload em massa (CSV) |

### 3.3 Padrão de Paginação

**Query params:**
- `Search` (string) — termo de busca
- `PageNumber` (int) — número da página
- `PageSize` (int) — tamanho da página
- `SortBy` (string) — campo de ordenação
- `SortDirection` (string) — `asc` ou `desc`
- `IsActive` (bool) — filtro por status

**Resposta:**
```json
{
  "items": [...],
  "totalItems": 100,
  "pageNumber": 1,
  "pageSize": 10,
  "totalPages": 10
}
```

### 3.4 Catálogo Completo de Endpoints por Domínio

#### 3.4.1 Autenticação (`/v1/auth`)

| # | Método | Caminho | Descrição | Auth |
|---|--------|---------|-----------|------|
| 1 | `POST` | `/auth/register` | Registar novo utilizador | Não |
| 2 | `POST` | `/auth/login` | Realizar início de sessão | Não |
| 3 | `POST` | `/auth/refresh` | Atualizar token de acesso | Não |
| 4 | `GET` | `/auth/tenants` | Obter tenants do utilizador | Sim |

**Request Login/Register:**
```json
{ "email": "string", "password": "string" }
```

**Response Login/Register:**
```json
{ "accessToken": "string", "refreshToken": "string", "accessTokenExpiresAt": "datetime" }
```

**Request Refresh:**
```json
{ "tenantId": "int", "refreshToken": "string" }
```

#### 3.4.2 Ações (`/v1/actions`) — 9 endpoints

CRUD completo + bulk-upload. Body: `{ Name, Description }`.

#### 3.4.3 Recursos (`/v1/resources`) — 9 endpoints

CRUD completo + bulk-upload. Body: `{ Name, Description }`.

#### 3.4.4 Funções (`/v1/functions`) — 9 endpoints

CRUD completo + bulk-upload. Body: `{ Name, Description }`.

#### 3.4.5 Roles (`/v1/roles`) — 9 endpoints

CRUD completo + bulk-upload. Body: `{ Name, Description }`.

#### 3.4.6 Permissões de Role (`/v1/role-permissions`) — 7 endpoints

Endpoints especiais com chaves compostas (roleId, resourceId, actionId).

| # | Método | Caminho | Descrição |
|---|--------|---------|-----------|
| 41 | `GET` | `/role-permissions` | Todas as permissões |
| 42 | `GET` | `/role-permissions/roles/{roleId}/resources/{resourceId}/actions/{actionId}` | Por composite key |
| 43 | `GET` | `/role-permissions/role/{roleId}` | Por role |
| 44 | `GET` | `/role-permissions/resource/{resourceId}` | Por recurso |
| 45 | `POST` | `/role-permissions` | Criar |
| 46 | `DELETE` | `/role-permissions/roles/{roleId}/resources/{resourceId}/actions/{actionId}` | Eliminar |
| 47 | `POST` | `/role-permissions/bulk-upload` | Upload em massa |

#### 3.4.7 Utilizadores (`/v1/users`) — 10 endpoints

CRUD + password + bulk-upload.

| # | Método | Caminho | Descrição |
|---|--------|---------|-----------|
| 48 | `GET` | `/users` | Todos |
| 49 | `GET` | `/users/{id}` | Por ID |
| 50 | `GET` | `/users/paged` | Paginados |
| 51 | `POST` | `/users` | Criar |
| 52 | `PUT` | `/users/{id}` | Atualizar |
| 53 | `PATCH` | `/users/{id}/password` | Alterar password |
| 54-55 | `PATCH` | `/users/{id}/activate|deactivate` | Ativar/Desativar |
| 56 | `DELETE` | `/users/{id}` | Eliminar |
| 57 | `POST` | `/users/bulk-upload` | Upload em massa |

#### 3.4.8 Preferências do Utilizador (`/v1/user-preferences`) — 9 endpoints

CRUD completo. Inclui `GET /user/{userId}` para buscar por utilizador.

#### 3.4.9 Associações Utilizador-Função (`/v1/user-roles`) — 7 endpoints

Endpoints com chaves compostas (userId, roleId).

#### 3.4.10 Chaves JWT (`/v1/admin/jwtkeys`) — 4 endpoints

| # | Método | Caminho | Descrição |
|---|--------|---------|-----------|
| 74 | `GET` | `/admin/jwtkeys/{tenantId}` | Por tenant |
| 75 | `GET` | `/admin/jwtkeys/{tenantId}/active` | Chave ativa |
| 76 | `POST` | `/admin/jwtkeys/{tenantId}/create-initial` | Criar inicial |
| 77 | `PATCH` | `/admin/jwtkeys/{id}/revoke` | Revogar |

#### 3.4.11 Inquilinos (`/v1/tenants`) — 9 endpoints + sub-recursos

CRUD completo + bulk-upload. Body: `{ CreateTenantRequest }`.

**Sub-recursos:**
- `/tenants/{tenantId}/addresses` — 8 endpoints (CRUD + activate/deactivate)
- `/tenants/{tenantId}/contacts` — 10 endpoints (CRUD + set-primary + activate/deactivate)
- `/tenants/{tenantId}/fiscal-data` — 8 endpoints (CRUD + activate/deactivate)

#### 3.4.12 Planos (`/v1/plans`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.13 Subscrições (`/v1/subscriptions`) — 14 endpoints

| # | Método | Caminho | Descrição |
|---|--------|---------|-----------|
| 122-127 | GET | `/subscriptions*` | Listar, por ID, por tenant, ativas, expirando, paginadas |
| 128-129 | POST/PUT | `/subscriptions` | Criar/Atualizar |
| 130-131 | PATCH | `/subscriptions/{id}/activate|deactivate` | Ativar/Desativar |
| 132 | `PATCH` | `/subscriptions/{id}/cancel` | Cancelar |
| 133 | `PATCH` | `/subscriptions/{id}/renew` | Renovar |
| 134 | `DELETE` | `/subscriptions/{id}` | Eliminar |
| 135 | `POST` | `/subscriptions/bulk-upload` | Upload em massa |

#### 3.4.14 Clientes (`/v1/clients`) — 9 endpoints + sub-recursos

CRUD completo + bulk-upload.

**Sub-recursos:**
- `/clients/{clientId}/addresses` — 9 endpoints
- `/clients/{clientId}/contacts` — 9 endpoints
- `/clients/{clientId}/fiscal-data` — 9 endpoints

**Autorização:** `Admin,BackOffice,Manager`

#### 3.4.15 Colaboradores (`/v1/employees`) — 9 endpoints + sub-recursos

CRUD completo + bulk-upload.

**Sub-recursos:**
- `/employees/{employeeId}/addresses` — 9 endpoints
- `/employees/{employeeId}/contacts` — 9 endpoints
- `/employees/{employeeId}/fiscal-data` — 9 endpoints
- `/employees/{employeeId}/teams` — 9 endpoints

#### 3.4.16 Equipas (`/v1/teams`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.17 Veículos (`/v1/vehicles`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.18 Equipamentos (`/v1/equipments`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.19 Tipos de Equipamento (`/v1/equipment-types`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.20 Visitas (`/v1/visits`) — 9 endpoints + sub-recursos

CRUD completo + bulk-upload.

**Sub-recursos:**
- `/visits/{visitId}/addresses` — 9 endpoints
- `/visits/{visitId}/contacts` — 9 endpoints
- `/visits/{visitId}/teams` — 9 endpoints
  - `/visits/{visitId}/teams/{teamId}/employees` — 9 endpoints
  - `/visits/{visitId}/teams/{teamId}/equipments` — 9 endpoints
  - `/visits/{visitId}/teams/{teamId}/vehicles` — 9 endpoints
  - `/visits/{visitId}/teams/{teamId}/functions` — 9 endpoints
- `/visits/{visitId}/attachments` — 9 endpoints

**Autorização:** `Admin,BackOffice,Manager,Technician`

#### 3.4.21 Definições de Trabalho (`/v1/admin/job-definition`) — 8 endpoints

CRUD + execute. **Sem** GetAll nem BulkUpload.

#### 3.4.22 Tipos de Endereço (`/v1/address-types`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.23 Tipos de Cliente (`/v1/client-types`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.24 Tipos de Consentimento (`/v1/consent-types`) — 9 endpoints

CRUD completo + bulk-upload.

#### 3.4.25 Tipos de Estado (`/v1/status-types`) — 9 endpoints

CRUD completo + bulk-upload.

### 3.5 Endpoints que NÃO Seguem o Padrão CRUD

| # | Método | Caminho | Descrição |
|---|--------|---------|-----------|
| 1 | `POST` | `/auth/register` | Registro |
| 2 | `POST` | `/auth/login` | Login |
| 3 | `POST` | `/auth/refresh` | Refresh token |
| 4 | `GET` | `/auth/tenants` | Listar tenants do user |
| 5 | `PATCH` | `/users/{id}/password` | Alteração de senha |
| 6 | `PATCH` | `/subscriptions/{id}/cancel` | Cancelamento |
| 7 | `PATCH` | `/subscriptions/{id}/renew` | Renovação |
| 8 | `GET` | `/subscriptions/active` | Listar ativas |
| 9 | `GET` | `/subscriptions/expiring/{days}` | Listar expirando |
| 10 | `GET` | `/subscriptions/tenant/{tenantId}` | Buscar por tenant |
| 11 | `POST` | `/admin/jwtkeys/{tenantId}/create-initial` | Criar chave inicial |
| 12 | `PATCH` | `/admin/jwtkeys/{id}/revoke` | Revogar chave |
| 13 | `POST` | `/admin/job-definition/{id}/execute` | Executar trabalho |
| 14 | `PATCH` | `/tenants/{tenantId}/contacts/{id}/set-primary` | Definir contacto principal |
| 15 | `GET` | `/tenants/{tenantId}/contacts/primary` | Obter contacto principal |

### 3.6 Headers Importantes

| Header | Valor | Uso |
|--------|-------|-----|
| `Accept-Language` | `pt-BR`, `en-US`, `es-ES` | Idioma da resposta |
| `Authorization` | `Bearer {token}` | Autenticação JWT |
| `x-tenant-id` | `{id}` | Tenant (opcional em alguns endpoints) |
| `x-super-admin` | `1` | Acesso admin |
| `DisableAntiforgery` | `1` | Uploads CSV |

---

## 4. Gap Analysis — Frontend vs Backend

> ⚠️ **NOTA IMPORTANTE:** NENHUMA entidade existente no Frontend está 100% alinhada com o novo Backend. O Backend passou por mudanças estruturais drásticas que tornaram os models, endpoints e payloads do Frontend **desatualizados**. Abaixo segue a análise campo a campo de cada entidade.

### 4.1 Entidades Suportadas no Frontend (com Status Real de Alinhamento)

| Entidade | Status | Sub-recursos | Observação |
|----------|--------|-------------|------------|
| **Clients** | ❌ Desatualizado | Contacts, Addresses, FiscalData, Consents | Modelo Individual/Company separado; Backend unifica com PartyTypeId. Campos faltando. |
| **Users** | ⚠️ Parcial | — | Faltam: PasswordHash, EmailConfirmed, PhoneNumberConfirmed, UrlImage, NormalizedEmail, LastAccessAt. Falta endpoint PATCH /password. |
| **Vehicles** | ❌ Desatualizado | — | Faltam: Year, Color, FuelType, StatusDefinitionId, StatusDomainId. |
| **Teams** | ⚠️ Parcial | — | Campos ok (name, description), mas falta verificar padronização. |
| **Team Members** | ❌ Desatualizado | — | Endpoint NÃO EXISTE no Backend. Conceito substituído por EmployeeTeam (Employee × Team com período). |
| **Equipments** | ❌ Desatualizado | — | Faltam: EquipmentTypeId (ID numérico), StatusDefinitionId, StatusDomainId, UrlImage. |
| **Roles** | ⚠️ Parcial | — | Falta campo Code. |
| **User Preferences** | ⚠️ Parcial | — | Backend tem mais campos de email (6 flags). Frontend tem campos extras não existentes no Backend. |
| **Dashboard** | ✅ Funcional | — | Calendário month/week/day. |
| **Auth** | ⚠️ Parcial | — | Falta endpoint /auth/tenants. Falta tratamento de refresh token no frontend. |

### 4.2 Entidades Novas/Expandidas no Backend (NÃO implementadas no Frontend)

| Entidade | Status Frontend | Status Backend | Ação Necessária |
|----------|----------------|---------------|----------------|
| **Tenants** | ❌ Placeholder (route const apenas) | ✅ CRUD + sub-recursos | Implementar do zero |
| **Tenant Contacts** | ❌ Placeholder | ✅ CRUD + set-primary | Implementar do zero |
| **Tenant Addresses** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Tenant Fiscal Data** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Tenant Documents** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Employees** | ❌ Não existe (TeamMembers é diferente) | ✅ CRUD + sub-recursos | Implementar do zero |
| **Employee Contacts** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Employee Addresses** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Employee Fiscal Data** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Employee Teams** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visits** | ❌ Placeholder (route const apenas) | ✅ CRUD + 7 sub-recursos | Implementar do zero |
| **Visit Contacts** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Addresses** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Teams** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Team Employees** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Team Vehicles** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Team Equipment** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Team Functions** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Visit Attachments** | ❌ Placeholder | ✅ CRUD + upload S3 | Implementar do zero |
| **Equipment Types** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Subscriptions** | ❌ Placeholder | ✅ CRUD + cancel/renew | Implementar do zero |
| **Subscription Plans** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Subscription Plan File Rules** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Status Definitions** | ❌ Placeholder | ✅ CRUD + traduções | Implementar do zero |
| **Status Types** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Address Types** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Client Types** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Consent Types** | ⚠️ Read-only (1 endpoint GET) | ✅ CRUD completo | Expandir para CRUD |
| **Functions** | ❌ Placeholder | ✅ CRUD completo | Implementar do zero |
| **Actions** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Resources** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **User Roles** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **Role Permissions** | ❌ Não existe | ✅ CRUD completo | Implementar do zero |
| **JWT Keys** | ❌ Não existe | ✅ Read + create/revoke | Implementar do zero |
| **Job Definitions** | ❌ Placeholder | ✅ CRUD + execute | Implementar do zero |

### 4.3 Análise Campo a Campo — Entidades Existentes no Frontend

#### 4.3.1 Clients — ❌ DESATUALIZADO (Refatoração Estrutural Necessária)

** Modelo atual no Frontend:**
O Frontend usa um modelo **estilo herança** com `ClientItem` contendo `individual?` ou `company?` como objetos aninhados. O Backend usa um modelo **unificado** com `PartyTypeId` para discriminar.

**Tabela comparativa — ClientItem (entidade principal):**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ Alinhado |
| `TenantId` INT | `tenantId?: number` | ✅ Alinhado |
| `PartyTypeId` TINYINT (1=Individual, 2=Organization) | `clientType?: number` (1-5: PessoaSingular, RecibosVerdes, Freelancer, PessoaJuridica, SociedadeUnipessoal) | ❌ **DESATUALIZADO** —Backend tem 2 opções, Frontend tem 5 |
| — | `clientTypeDescription?: string` | ❌ **NÃO EXISTE NO BACKEND** — removido |
| `AcquisitionSourceTypeId` INT (FK catálogo) | `originType?: number` (1-13 hardcoded) | ❌ **DESATUALIZADO** — Backend usa FK para catálogo, Frontend usa enum hardcoded |
| — | `originTypeDescription?: string` | ❌ **NÃO EXISTE NO BACKEND** — removido |
| `Name` NVARCHAR(500) | `name: string` | ✅ Alinhado |
| `PhoneNumber` NVARCHAR(50) | `phone: string` | ⚠️ **RENOMEADO** — Frontend usa `phone`, Backend usa `PhoneNumber` |
| `CellPhoneNumber` NVARCHAR(50) | — (está em individual/company) | ❌ **CAMPO FALTANDO** na entidade principal |
| `IsCellPhoneWhatsapp` BIT | — (está em individual/company) | ❌ **CAMPO FALTANDO** na entidade principal |
| `Email` NVARCHAR(320) | `email?: string` | ✅ Alinhado |
| `ImageUrl` NVARCHAR(500) | `urlImage?: string` | ⚠️ **RENOMEADO** — Frontend usa `urlImage`, Backend usa `ImageUrl` |
| `WebsiteUrl` NVARCHAR(500) | — | ❌ **CAMPO FALTANDO** |
| `StatusDefinitionId` INT | — | ❌ **CAMPO FALTANDO** — novo sistema de status |
| `StatusDomainId` INT | — | ❌ **CAMPO FALTANDO** |
| `Note` NVARCHAR(1000) | `note?: string` | ✅ Alinhado |
| `IsActive` BIT | `isActive: boolean` | ✅ Alinhado |
| `BirthDate` DATE | — (em individual) | ❌ **CAMPO DESLOCADO** — Backend é campo direto da tabela Clients |
| `Gender` NVARCHAR(30) | — (em individual) | ❌ **CAMPO DESLOCADO** |
| `Nationality` NVARCHAR(100) | — (em individual) | ❌ **CAMPO DESLOCADO** |
| `CompanyRegistrationNumber` NVARCHAR(100) | — (em company) | ❌ **CAMPO DESLOCADO** |
| `EconomicActivityCode` NVARCHAR(20) | — (em company) | ❌ **CAMPO DESLOCADO** |
| `NumberOfEmployees` INT | — (em company) | ❌ **CAMPO DESLOCADO** |

**Tabela comparativa — ClientIndividual (sub-objeto):**

| Campo Backend (Clients direto) | Campo Frontend (ClientIndividual) | Status |
|-------------------------------|----------------------------------|--------|
| `Name` (principal) | `fullName?` | ❌ **REMOVIDO** — Backend unifica Name na tabela principal |
| — | `firstName?` | ❌ **NÃO EXISTE NO BACKEND** |
| — | `lastName?` | ❌ **NÃO EXISTE NO BACKEND** |
| `PhoneNumber` (principal) | `phoneNumber?` | ⚠️ **DESLOCADO** — Backend é campo da tabela principal |
| `CellPhoneNumber` (principal) | `cellPhoneNumber?` | ⚠️ **DESLOCADO** |
| `IsCellPhoneWhatsapp` (principal) | `isWhatsapp?` | ⚠️ **DESLOCADO** + renomeado |
| `Email` (principal) | `email?` | ⚠️ **DESLOCADO** |
| `BirthDate` (direto em Clients) | `birthDate?` | ⚠️ **DESLOCADO** |
| `Gender` (direto em Clients) | `gender?` | ⚠️ **DESLOCADO** |
| — | `documentType?` | ❌ **NÃO EXISTE** — Backend usa ClientDocuments (sub-recurso) |
| — | `documentNumber?` | ❌ **NÃO EXISTE** — Backend usa ClientDocuments |
| `Nationality` (direto em Clients) | `nationality?` | ⚠️ **DESLOCADO** |

**Tabela comparativa — ClientCompany (sub-objeto):**

| Campo Backend (Clients direto) | Campo Frontend (ClientCompany) | Status |
|-------------------------------|-------------------------------|--------|
| `Name` (principal) | `legalName?` | ❌ **REMOVIDO** — Backend unifica Name |
| — | `tradeName?` | ❌ **NÃO EXISTE NO BACKEND** |
| `PhoneNumber` (principal) | `phoneNumber?` | ⚠️ **DESLOCADO** |
| `CellPhoneNumber` (principal) | `cellPhoneNumber?` | ⚠️ **DESLOCADO** |
| `IsCellPhoneWhatsapp` (principal) | `isWhatsapp?` | ⚠️ **DESLOCADO** + renomeado |
| `Email` (principal) | `email?` | ⚠️ **DESLOCADO** |
| — | `site?` | ⚠️ **RENOMEADO** — Backend usa `WebsiteUrl` |
| `CompanyRegistrationNumber` (direto em Clients) | `companyRegistration?` | ⚠️ **DESLOCADO** + renomeado |
| `EconomicActivityCode` (direto em Clients) | `cae?` | ⚠️ **DESLOCADO** + renomeado |
| `NumberOfEmployees` (direto em Clients) | `numberOfEmployee?` | ⚠️ **DESLOCADO** + renomeado (singular/plural) |
| — | `legalRepresentative?` | ❌ **NÃO EXISTE NO BACKEND** |

**Sub-recursos — ClientContactPersons:**

| Campo Backend | Campo Frontend (ContactItem) | Status |
|--------------|----------------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `Name` NVARCHAR(150) | `name: string` | ✅ |
| `Email` NVARCHAR(255) | `email: string` | ✅ |
| `PhoneNumber` NVARCHAR(50) | `phoneNumber: string` | ✅ |
| `CellPhoneNumber` NVARCHAR(50) | — | ❌ **CAMPO FALTANDO** |
| `IsCellPhoneWhatsapp` BIT | — | ❌ **CAMPO FALTANDO** |
| `JobTitle` NVARCHAR(150) | — | ❌ **CAMPO FALTANDO** |
| `Department` NVARCHAR(150) | — | ❌ **CAMPO FALTANDO** |
| `IsPrimary` BIT | `isActive: boolean` | ⚠️ **CONFUSO** — Frontend usa isActive onde Backend tem IsPrimary |
| `IsActive` BIT | `isActive: boolean` | ✅ |
| `IsDeleted` BIT | — | ✅ (implícito via DELETE) |

**Sub-recursos — ClientAddresses:**

| Campo Backend | Campo Frontend (AddressItem) | Status |
|--------------|------------------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `AddressTypeId` INT (FK catálogo) | `addressTypeId: number` | ✅ |
| `CountryCode` CHAR(2) DEFAULT 'PT' | `country: string` | ⚠️ **RENOMEADO** |
| `Street` NVARCHAR(200) | `street: string` | ✅ |
| `Neighborhood` NVARCHAR(100) | `neighborhood: string` | ✅ |
| `City` NVARCHAR(100) | `city: string` | ✅ |
| `District` NVARCHAR(100) | `state: string` | ⚠️ **RENOMEADO** — Backend usa `District`, Frontend usa `state` |
| `PostalCode` NVARCHAR(20) | `postalCode: string` | ✅ |
| `StreetNumber` NVARCHAR(20) | `number: string` | ⚠️ **RENOMEADO** |
| `Complement` NVARCHAR(100) | `complement: string` | ✅ |
| `Latitude` DECIMAL(9,6) | `latitude: string` | ⚠️ **TIPO DIFERENTE** — Backend é DECIMAL, Frontend é string |
| `Longitude` DECIMAL(9,6) | `longitude: string` | ⚠️ **TIPO DIFERENTE** |
| `Note` NVARCHAR(500) | `note: string` | ✅ |
| `IsPrimary` BIT | `isPrimary: boolean` | ✅ |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Sub-recursos — ClientFiscalData:**

| Campo Backend | Campo Frontend (ClientFiscalDataItem) | Status |
|--------------|--------------------------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `ClientId` INT | `clientId: number` | ✅ |
| `TaxNumber` NVARCHAR(20) | `taxNumber: string` | ✅ |
| `VatNumber` NVARCHAR(20) | `vatNumber: string` | ✅ |
| `FiscalCountry` CHAR(2) DEFAULT 'PT' | `fiscalCountry: string` | ✅ |
| `IsVatRegistered` BIT | `isVatRegistered: boolean` | ✅ |
| `IBAN` NVARCHAR(34) | `iban: string` | ✅ |
| `FiscalEmail` NVARCHAR(255) | `fiscalEmail: string` | ✅ |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Sub-recursos — ClientDocuments:**
| ❌ **NÃO EXISTE NO FRONTEND** — Implementar do zero |

**Mudanças estruturais críticas:**
1. O modelo antigo (ClientIndividual/ClientCompany como sub-objetos) é **incompatível** com o novo Backend (modelo unificado com PartyTypeId)
2. O campo `clientType` (5 opções hardcoded) é substituído por `PartyTypeId` (2 opções)
3. O campo `originType` (13 opções hardcoded) é substituído por `AcquisitionSourceTypeId` (FK para catálogo via API)
4. Campos como BirthDate, Gender, CompanyRegistrationNumber etc. agora são **campos diretos da tabela Clients** (não mais em sub-objetos)
5. Documentos agora são um **sub-recurso separado** (ClientDocuments), não mais embedded no ClientIndividual/Company

---

#### 4.3.2 Users — ⚠️ PARCIALMENTE DESATUALIZADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | — (implícito) | ✅ |
| `Name` NVARCHAR(150) | `name: string` | ✅ |
| `Email` NVARCHAR(256) | `email: string` | ✅ |
| `NormalizedEmail` NVARCHAR(256) | — | ❌ **CAMPO FALTANDO** (usado para login) |
| `EmailConfirmed` BIT | — | ❌ **CAMPO FALTANDO** |
| `PhoneNumber` NVARCHAR(50) | `phoneNumber: string` | ✅ |
| `PhoneNumberConfirmed` BIT | — | ❌ **CAMPO FALTANDO** |
| `LastAccessAt` DATETIME2(7) | `lastAccessAt: string` | ✅ |
| `PasswordHash` NVARCHAR(500) | — | ❌ **NÃO EXPÕE NO FRONTEND** (correto) |
| `UrlImage` NVARCHAR(500) | — | ❌ **CAMPO FALTANDO** |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Endpoints faltando:**
| Endpoint Backend | Existe no Frontend? |
|-----------------|-------------------|
| `PATCH /users/{id}/password` | ❌ Não |
| `GET /users/{id}` (por ID) | ❌ Não (só paged) |

**Create/Update Payload:**

| Campo Backend (Request) | Campo Frontend (Payload) | Status |
|------------------------|-------------------------|--------|
| `Name` | `name` | ✅ |
| `Email` | `email` | ✅ |
| `PhoneNumber` | `phoneNumber` | ✅ |
| `Password` (create only) | — | ❌ **CAMPO FALTANDO** no create |
| `UrlImage` | — | ❌ **CAMPO FALTANDO** |

---

#### 4.3.3 Vehicles — ❌ DESATUALIZADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | — (implícito) | ✅ |
| `Plate` NVARCHAR(20) | `licensePlate: string` | ⚠️ **RENOMEADO** — Backend usa `Plate`, Frontend usa `licensePlate` |
| `Brand` NVARCHAR(100) | `brand: string` | ✅ |
| `Model` NVARCHAR(100) | `model: string` | ✅ |
| `Year` INT | — | ❌ **CAMPO FALTANDO** |
| `Color` NVARCHAR(50) | — | ❌ **CAMPO FALTANDO** |
| `FuelType` NVARCHAR(50) | — | ❌ **CAMPO FALTANDO** |
| `StatusDefinitionId` INT | — | ❌ **CAMPO FALTANDO** |
| `StatusDomainId` INT | — | ❌ **CAMPO FALTANDO** |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Create/Update Payload:**

| Campo Backend | Campo Frontend | Status |
|--------------|---------------|--------|
| `Plate` | `licensePlate` | ⚠️ Renomeado |
| `Brand` | `brand` | ✅ |
| `Model` | `model` | ✅ |
| `Year` | — | ❌ Faltando |
| `Color` | — | ❌ Faltando |
| `FuelType` | — | ❌ Faltando |
| `StatusDefinitionId` | — | ❌ Faltando |

---

#### 4.3.4 Teams — ⚠️ PARCIALMENTE ALINHADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | — (implícito) | ✅ |
| `Name` NVARCHAR(150) | `name: string` | ✅ |
| `Description` NVARCHAR(500) | `description: string` | ✅ |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Create/Update Payload:** ✅ Alinhado

---

#### 4.3.5 Team Members — ❌ DESATUALIZADO (Entidade Não Existe no Backend)

> ⚠️ **ATENÇÃO:** A entidade `TeamMembers` como modelada no Frontend **NÃO EXISTE** no Backend.

**O que o Frontend tem:**

| Campo Frontend | Tipo |
|---------------|------|
| `id: number` | — |
| `name: string` | — |
| `functionName: string` | — |
| `taxNumber: string` | — |
| `isActive: boolean` | — |

**Endpoint usado:** `GET /team-members/paged` — **NÃO EXISTE NO BACKEND**

**O que o Backend tem (EmployeeTeam):**

| Campo Backend (Tipo) | Descrição |
|----------------------|-----------|
| `Id` INT | PK |
| `TenantId` INT | FK → Tenants |
| `TeamId` INT | FK → Teams |
| `EmployeeId` INT | FK → Employees |
| `IsLeader` BIT | Se é líder da equipe |
| `StartDateTime` DATETIME2 | Início da alocação |
| `EndDateTime` DATETIME2 | Fim da alocação (NULL = atual) |
| `IsActive` BIT | — |

**Endpoint correto:** `GET /employees/{employeeId}/teams`

**Conclusão:** A entidade TeamMembers precisa ser **reescrita do zero** como EmployeeTeam, com modelo completamente diferente (relação N:N entre Employees e Teams com período temporal).

---

#### 4.3.6 Equipments — ❌ DESATUALIZADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | — (implícito) | ✅ |
| `EquipmentTypeId` INT (FK → EquipmentTypes) | `equipmentType: string` | ❌ **TIPO ERRADO** — Backend é INT (FK), Frontend é string |
| `StatusDefinitionId` INT | — | ❌ **CAMPO FALTANDO** |
| `StatusDomainId` INT | — | ❌ **CAMPO FALTANDO** |
| `Name` NVARCHAR(150) | `name: string` | ✅ |
| `SerialNumber` NVARCHAR(100) | `serialNumber: string` | ✅ |
| `UrlImage` NVARCHAR(500) | — | ❌ **CAMPO FALTANDO** |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Create/Update Payload:**

| Campo Backend | Campo Frontend | Status |
|--------------|---------------|--------|
| `EquipmentTypeId` (INT) | `equipmentType` (string) | ❌ Tipo errado |
| `Name` | `name` | ✅ |
| `SerialNumber` | `serialNumber` | ✅ |
| `StatusDefinitionId` | — | ❌ Faltando |
| `UrlImage` | — | ❌ Faltando |

---

#### 4.3.7 Roles — ⚠️ PARCIALMENTE ALINHADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | — (implícito) | ✅ |
| `Code` NVARCHAR(50) | — | ❌ **CAMPO FALTANDO** |
| `Name` NVARCHAR(100) | `name: string` | ✅ |
| `Description` NVARCHAR(500) | `description: string` | ✅ |
| `IsActive` BIT | `isActive: boolean` | ✅ |

**Create/Update Payload:**

| Campo Backend | Campo Frontend | Status |
|--------------|---------------|--------|
| `Name` | `name` | ✅ |
| `Description` | `description` | ✅ |
| `Code` | — | ❌ Faltando |

---

#### 4.3.8 User Preferences — ⚠️ PARCIALMENTE ALINHADO

**Tabela comparativa:**

| Campo Backend (Tipo) | Campo Frontend (Tipo) | Status |
|----------------------|----------------------|--------|
| `Id` INT | `id: number` | ✅ |
| `TenantId` INT | `tenantId: number` | ✅ |
| `UserId` INT | `userId: number` | ✅ |
| `Appearance` NVARCHAR(10) DEFAULT 'light' | `appearance: AppearancePreference` | ✅ |
| `CurrencyCode` NVARCHAR(3) DEFAULT 'EUR' | `currencyCode: CurrencyCodePreference` | ✅ |
| `Locale` NVARCHAR(10) DEFAULT 'pt-PT' | `locale: PreferenceLocale` | ✅ |
| `Timezone` NVARCHAR(100) DEFAULT 'Europe/Lisbon' | `timezone: string` | ✅ |
| `DateFormat` NVARCHAR(20) DEFAULT 'DD-MM-YYYY' | `dateFormat: DateFormatPreference` | ✅ |
| `TimeFormat` NVARCHAR(10) DEFAULT '24h' | `timeFormat: TimeFormatPreference` | ✅ |
| `DayStart` TIME(0) DEFAULT '09:00' | `dayStart: string` | ✅ |
| `DayEnd` TIME(0) DEFAULT '18:00' | `dayEnd: string` | ✅ |
| `EmailNewsletter` BIT DEFAULT 0 | `emailNewsletter: boolean` | ✅ |
| `EmailWeeklyReport` BIT DEFAULT 0 | `emailWeeklyReport: boolean` | ✅ |
| `EmailApproval` BIT DEFAULT 0 | `emailApproval: boolean` | ✅ |
| `EmailAlerts` BIT DEFAULT 1 | `emailAlerts: boolean` | ✅ |
| `EmailReminders` BIT DEFAULT 1 | `emailReminders: boolean` | ✅ |
| `EmailPlanner` BIT DEFAULT 1 | `emailPlanner: boolean` | ✅ |
| `IsActive` BIT | `isActive?: boolean` | ✅ |

**Campos extras no Frontend (não existem no Backend):**
- `integration` (emailNotifications)
- `longRunningTimer` (emailNotifications)
- `scheduledReports` (emailNotifications)
- `timeOff` (emailNotifications)
- `invoices` (emailNotifications)

**Observação:** O Frontend tem 11 chaves de notificação, o Backend tem apenas 6. Os 5 campos extras do Frontend precisam ser removidos ou o Backend precisa adicioná-los.

---

#### 4.3.9 Auth — ⚠️ PARCIALMENTE ALINHADO

**Endpoints:**

| Endpoint Backend | Existe no Frontend? | Observação |
|-----------------|-------------------|-----------|
| `POST /auth/register` | ✅ | — |
| `POST /auth/login` | ✅ | — |
| `POST /auth/refresh` | ⚠️ | Backend retorna `{ accessToken, refreshToken, accessTokenExpiresAt }` — verificar se Frontend usa refresh |
| `GET /auth/tenants` | ❌ | **NÃO IMPLEMENTADO** — necessário para multi-tenant |

**Headers:**
| Header Backend | Usado no Frontend? |
|---------------|-------------------|
| `Accept-Language: pt-BR` | ✅ |
| `Authorization: Bearer {token}` | ✅ |

---

### 4.4 Endpoints Consumidos vs Disponíveis (Revisão)

| Domínio | Frontend Consome | Backend Oferece | Gap | Observação |
|---------|-----------------|----------------|-----|------------|
| Auth | 3 | 4 | 1 | Falta `/auth/tenants` |
| Clients | ~30 | ~36 | 6 | Falta ClientDocuments. Endpoints de contacts/addresses usam paths antigos |
| Users | ~7 | 10 | 3 | Falta PATCH /password, GET /{id} |
| Vehicles | ~7 | 9 | 2 | Campos faltando no payload |
| Teams | ~7 | 9 | 2 | OK |
| Team Members | ~7 | 0 | **-7** | **Endpoint NÃO EXISTE** — substituído por employee-teams |
| Equipments | ~7 | 9 | 2 | Campo equipmentType é string em vez de INT |
| Roles | ~7 | 9 | 2 | Falta campo Code |
| User Preferences | ~3 | 9 | 6 | Falta GET /{id}, GET /paged, activate, deactivate, delete |
| Tenants | 0 | 9 + 26 sub | 35 | Não implementado |
| Employees | 0 | 9 + 27 sub | 36 | Não implementado (TeamMembers é diferente) |
| Visits | 0 | 9 + 72 sub | 81 | Não implementado |
| Subscriptions | 0 | 14 | 14 | Não implementado |
| Plans | 0 | 9 | 9 | Não implementado |
| Equipment Types | 0 | 9 | 9 | Não implementado |
| Status Definitions | 0 | 9 | 9 | Não implementado |
| Status Types | 0 | 9 | 9 | Não implementado |
| Address Types | 0 | 9 | 9 | Não implementado |
| Client Types | 0 | 9 | 9 | Não implementado |
| Consent Types | 1 (read) | 9 | 8 | Apenas GET /consent-types |
| Functions | 0 | 9 | 9 | Não implementado |
| Actions | 0 | 9 | 9 | Não implementado |
| Resources | 0 | 9 | 9 | Não implementado |
| User Roles | 0 | 7 | 7 | Não implementado |
| Role Permissions | 0 | 7 | 7 | Não implementado |
| JWT Keys | 0 | 4 | 4 | Não implementado |
| Job Definitions | 0 | 8 | 8 | Não implementado |
| **TOTAL** | **~60** | **~377** | **~317** | — |

### 4.5 Resumo do Impacto por Entidade

| Entidade | Tipo de Mudança | Esforço Estimado |
|----------|----------------|-----------------|
| **Clients** | 🔴 Refatoração estrutural (modelo unificado) | Alto (5-7 dias) |
| **Users** | 🟡 Expansão de campos + endpoints | Médio (1-2 dias) |
| **Vehicles** | 🟡 Expansão de campos | Médio (1 dia) |
| **Teams** | 🟢 OK | Baixo (0.5 dia) |
| **Team Members** | 🔴 Reescrita completa (→ EmployeeTeam) | Alto (2-3 dias) |
| **Equipments** | 🟡 Correção de tipo + campos novos | Médio (1 dia) |
| **Roles** | 🟢 Expansão mínima | Baixo (0.5 dia) |
| **User Preferences** | 🟡 Sincronizar campos de email | Baixo (0.5 dia) |
| **Auth** | 🟢 Adicionar /auth/tenants | Baixo (0.5 dia) |
| **Employees** | 🔴 Novo do zero | Alto (3-4 dias) |
| **Visits** | 🔴 Novo do zero (entidade mais complexa) | Muito Alto (5-7 dias) |
| **Tenants** | 🔴 Novo do zero | Alto (3-4 dias) |
| **Subscriptions** | 🔴 Novo do zero | Alto (2-3 dias) |
| **Catálogos (7)** | 🔴 Novos do zero | Médio (3-4 dias total) |
| **Identity/Access (5)** | 🔴 Novos do zero | Médio (3-4 dias total) |
| **Platform Admin (3)** | 🔴 Novos do zero | Médio (2-3 dias total) |

---

## 5. Plano de Migração

### 5.1 Fase 1 — Tipos e Models (Foundation)

**Objetivo:** Criar/atualizar todas as interfaces TypeScript para refletir o novo Backend.

**Duração estimada:** 2-3 dias

**Tarefas:**

1. **Revisar e atualizar `ClientItem` em `client-models.ts`:**
   - Substituir `clientType` por `partyTypeId` (1=Individual, 2=Organization)
   - Substituir `originType` por `acquisitionSourceTypeId`
   - Adicionar campos: `statusDefinitionId`, `statusDomainId`, `phoneNumber`, `cellPhoneNumber`, `isCellPhoneWhatsapp`, `imageUrl`, `websiteUrl`
   - Remover modelo separado ClientIndividual/ClientCompany
   - Adicionar constraint: Individual = sem dados empresa, Organization = sem dados pessoais

2. **Criar models para entidades novas:**
   - `tenant-models.ts` — TenantItem, TenantContactItem, TenantAddressItem, TenantFiscalDataItem, TenantDocumentItem
   - `employee-models.ts` — EmployeeItem, EmployeeContactItem, EmployeeAddressItem, EmployeeFiscalDataItem
   - `visit-models.ts` — VisitItem, VisitContactItem, VisitAddressItem, VisitTeamItem, VisitTeamEmployeeItem, VisitTeamVehicleItem, VisitTeamEquipmentItem, VisitTeamFunctionItem, VisitAttachmentItem
   - `subscription-models.ts` — SubscriptionItem, SubscriptionPlanItem, SubscriptionPlanFileRuleItem
   - `equipment-type-models.ts` — EquipmentTypeItem
   - `catalog-models.ts` — StatusDefinitionItem, StatusTypeItem, AddressTypeItem, ClientTypeItem, ConsentTypeItem, FunctionItem, ActionItem, ResourceItem
   - `auth-models.ts` — RolePermissionItem, UserRoleItem, JwtKeyItem
   - `job-models.ts` — JobDefinitionItem

3. **Atualizar models existentes:**
   - `VehicleItem` — adicionar: statusDefinitionId, statusDomainId, year, color, fuelType
   - `TeamItem` — já está correto
   - `EquipmentItem` — adicionar: equipmentTypeId, statusDefinitionId, statusDomainId, urlImage
   - `RoleItem` — adicionar: code

4. **Criar tipos de Request/Response:**
   - `CreateClientRequest`, `UpdateClientRequest`
   - `CreateEmployeeRequest`, `UpdateEmployeeRequest`
   - `CreateVisitRequest`, `UpdateVisitRequest`
   - `CreateTenantRequest`, `UpdateTenantRequest`
   - `CreateSubscriptionRequest`, `UpdateSubscriptionRequest`
   - `CreateVehicleRequest`, `UpdateVehicleRequest`
   - `CreateEquipmentRequest`, `UpdateEquipmentRequest`
   - `CreateEquipmentTypeRequest`, `UpdateEquipmentTypeRequest`
   - `LoginRequest`, `LoginResponse`, `RefreshRequest`
   - `PaginatedResponse<T>` — tipo genérico para respostas paginadas

**Arquivos afetados:**
- `src/domains/operations/clients/client-models.ts`
- Novos: `src/domains/operations/employees/employee-models.ts`
- Novos: `src/domains/operations/visits/visit-models.ts`
- Novos: `src/domains/workspace/tenant-profile/tenant-models.ts`
- Novos: `src/domains/workspace/subscription/subscription-models.ts`
- Novos: `src/domains/operations/vehicles/vehicle-models.ts`
- Novos: `src/domains/operations/equipments/equipment-models.ts`
- Novos: `src/domains/catalogs/catalog-models.ts`
- Novos: `src/domains/identity/auth/auth-models.ts`

---

### 5.2 Fase 2 — Platform Layer (API + Query Keys + Hooks)

**Objetivo:** Atualizar o layer de平台 para suportar todos os novos endpoints.

**Duração estimada:** 3-4 dias

**Tarefas:**

1. **Atualizar `platform/query/query-keys.ts`:**
   ```typescript
   export const queryKeys = {
     // Existentes (manter)
     users: (tenantId, filters?) => ["users", tenantId, filters ?? {}],
     roles: (tenantId) => ["roles", tenantId],
     clients: (tenantId, filters?) => ["clients", tenantId, filters ?? {}],
     // Novos
     tenants: (tenantId) => ["tenants", tenantId],
     tenantContacts: (tenantId, tenantId2) => ["tenant-contacts", tenantId, tenantId2],
     tenantAddresses: (tenantId, tenantId2) => ["tenant-addresses", tenantId, tenantId2],
     tenantFiscalData: (tenantId, tenantId2) => ["tenant-fiscal-data", tenantId, tenantId2],
     employees: (tenantId, filters?) => ["employees", tenantId, filters ?? {}],
     employeeContacts: (tenantId, empId) => ["employee-contacts", tenantId, empId],
     employeeAddresses: (tenantId, empId) => ["employee-addresses", tenantId, empId],
     employeeFiscalData: (tenantId, empId) => ["employee-fiscal-data", tenantId, empId],
     visits: (tenantId, filters?) => ["visits", tenantId, filters ?? {}],
     visitContacts: (tenantId, visitId) => ["visit-contacts", tenantId, visitId],
     visitAddresses: (tenantId, visitId) => ["visit-addresses", tenantId, visitId],
     visitTeams: (tenantId, visitId) => ["visit-teams", tenantId, visitId],
     visitAttachments: (tenantId, visitId) => ["visit-attachments", tenantId, visitId],
     subscriptions: (tenantId, filters?) => ["subscriptions", tenantId, filters ?? {}],
     subscriptionPlans: (tenantId) => ["subscription-plans", tenantId],
     vehicles: (tenantId, filters?) => ["vehicles", tenantId, filters ?? {}],
     equipments: (tenantId, filters?) => ["equipments", tenantId, filters ?? {}],
     equipmentTypes: (tenantId) => ["equipment-types", tenantId],
     statusDefinitions: (tenantId) => ["status-definitions", tenantId],
     statusTypes: (tenantId) => ["status-types", tenantId],
     addressTypes: (tenantId) => ["address-types", tenantId],
     clientTypes: (tenantId) => ["client-types", tenantId],
     consentTypes: (tenantId) => ["consent-types", tenantId],
     functions: (tenantId) => ["functions", tenantId],
     actions: (tenantId) => ["actions", tenantId],
     resources: (tenantId) => ["resources", tenantId],
     userRoles: (tenantId) => ["user-roles", tenantId],
     rolePermissions: (tenantId) => ["role-permissions", tenantId],
     jwtKeys: (tenantId) => ["jwt-keys", tenantId],
     jobDefinitions: (tenantId) => ["job-definitions", tenantId],
   };
   ```

2. **Criar hooks de dados para novos domínios:**
   - `useTenants()` — CRUD de tenants
   - `useTenantContacts()` — Sub-recursos de tenant
   - `useTenantAddresses()` — Sub-recursos de tenant
   - `useTenantFiscalData()` — Sub-recursos de tenant
   - `useEmployees()` — CRUD de employees
   - `useEmployeeContacts()` — Sub-recursos
   - `useEmployeeAddresses()` — Sub-recursos
   - `useEmployeeFiscalData()` — Sub-recursos
   - `useEmployeeTeams()` — Associação employee-team
   - `useVisits()` — CRUD de visits
   - `useVisitContacts()` — Sub-recursos
   - `useVisitAddresses()` — Sub-recursos
   - `useVisitTeams()` — Sub-recursos
   - `useVisitTeamEmployees()` — Sub-recursos
   - `useVisitTeamVehicles()` — Sub-recursos
   - `useVisitTeamEquipments()` — Sub-recursos
   - `useVisitTeamFunctions()` — Sub-recursos
   - `useVisitAttachments()` — Upload + CRUD
   - `useSubscriptions()` — CRUD + cancel/renew
   - `useSubscriptionPlans()` — CRUD de planos
   - `useEquipmentTypes()` — CRUD de tipos
   - `useStatusDefinitions()` — CRUD de status
   - `useAddressTypes()` — CRUD de tipos
   - `useClientTypes()` — CRUD de tipos
   - `useConsentTypes()` — CRUD de tipos
   - `useFunctions()` — CRUD de funções
   - `useActions()` — CRUD de ações
   - `useResources()` — CRUD de recursos
   - `useUserRoles()` — CRUD de associações
   - `useRolePermissions()` — CRUD de permissões
   - `useJwtKeys()` — Read + create/revoke
   - `useJobDefinitions()` — CRUD + execute

3. **Padronizar HTTP client:**
   - Decidir se usa `fetchWithAuth()` ou `useHttpClient()` para todos os domínios
   - Atualmente: operacionais usam `fetchWithAuth()`, manter padrão

**Arquivos afetados:**
- `src/platform/query/query-keys.ts`
- Novos: hooks em cada subdomínio

---

### 5.3 Fase 3 — Domínios Críticos (Core Business)

**Objetivo:** Implementar os domínios de maior impacto para o negócio.

**Duração estimada:** 8-12 dias

#### 3A. Clients (Atualização) — 3-4 dias

1. Atualizar `clients-page.tsx`:
   - Substituir filtro `clientType` por `partyTypeId` (Individual/Organization)
   - Substituir filtro `originType` por `acquisitionSourceTypeId`
   - Adicionar filtro de `statusDefinitionId`
   - Atualizar HubGrid columns

2. Atualizar `clients-details.tsx`:
   - Remover tabs Individual/Company separadas
   - Criar formulário unificado com campos condicionais por PartyTypeId
   - Adicionar tab de Documentos (novo sub-recurso)

3. Atualizar `clients-create.tsx`:
   - Formulário unificado com seleção de PartyTypeId primeiro
   - Campos condicionais baseados na seleção

4. Atualizar sub-recursos:
   - Addresses: adicionar `addressTypeId` como select de catálogo
   - Contacts: schema atualizado
   - FiscalData: schema atualizado
   - **Novo:** Documents tab com CRUD completo

#### 3B. Employees (Novo) — 3-4 dias

1. Criar `employees-page.tsx` — HubGrid com CRUD
2. Criar `employees-details.tsx` — Detalhe com tabs (Contacts, Addresses, FiscalData, Teams)
3. Criar `employees-create.tsx` — Formulário de criação
4. Implementar sub-recursos: Contacts, Addresses, FiscalData, Teams

#### 3C. Visits (Novo) — 4-6 dias

1. Criar `visits-page.tsx` — HubGrid com CRUD
2. Criar `visits-details.tsx` — Detalhe com tabs (Contacts, Addresses, Teams, Attachments)
3. Criar `visits-create.tsx` — Formulário de criação
4. Implementar sub-recursos:
   - Contacts (CRUD)
   - Addresses (CRUD)
   - Teams (CRUD com nested employees, vehicles, equipments, functions)
   - Attachments (Upload + CRUD)

---

### 5.4 Fase 4 — Domínios Secundários

**Objetivo:** Implementar domínios de suporte e administração.

**Duração estimada:** 6-8 dias

#### 4A. Tenants (Novo) — 2-3 dias

1. `tenants-page.tsx` — HubGrid com CRUD
2. `tenants-details.tsx` — Detalhe com tabs (Contacts, Addresses, FiscalData, Documents)
3. Sub-recursos completos

#### 4B. Subscriptions (Novo) — 2-3 dias

1. `subscriptions-page.tsx` — HubGrid com CRUD + cancel/renew
2. `subscription-plans-page.tsx` — CRUD de planos
3. `subscription-details.tsx` — Detalhe com dados Stripe

#### 4C. Vehicles (Atualização) — 1 dia

1. Atualizar `vehicles-page.tsx`:
   - Adicionar campos: year, color, fuelType, statusDefinitionId

#### 4D. Equipments (Atualização) — 1 dia

1. Atualizar `equipments-page.tsx`:
   - Adicionar campos: equipmentTypeId, statusDefinitionId, urlImage

---

### 5.5 Fase 5 — Catálogos e Configuração

**Objetivo:** Implementar gestão de catálogos e configurações do sistema.

**Duração estimada:** 4-5 dias

#### 5A. Catalogs (Novos)

1. `address-types-page.tsx` — CRUD
2. `client-types-page.tsx` — CRUD
3. `consent-types-page.tsx` — CRUD (expandir de read-only)
4. `equipment-types-page.tsx` — CRUD
5. `functions-page.tsx` — CRUD
6. `status-types-page.tsx` — CRUD
7. `status-definitions-page.tsx` — CRUD por tenant

#### 5B. Identity & Access (Novos)

1. `user-roles-page.tsx` — CRUD de associações User↔Role
2. `role-permissions-page.tsx` — CRUD de permissões Role↔Resource↔Action
3. `jwt-keys-page.tsx` — Read + create/revoke
4. `actions-page.tsx` — CRUD
5. `resources-page.tsx` — CRUD

#### 5C. Platform Admin (Novos)

1. `job-definitions-page.tsx` — CRUD + execute
2. `file-types-page.tsx` — CRUD
3. `plan-file-rules-page.tsx` — CRUD

---

### 5.6 Fase 6 — UI/UX e Validação

**Objetivo:** Refinar interfaces, validar com QA e preparar para produção.

**Duração estimada:** 3-4 dias

**Tarefas:**

1. **UI/UX:**
   - Revisar responsividade de todas as novas páginas
   - ValidarHubGrid em todos os domínios
   - Validar formulários com validação
   - Testar fluxos de criação/edição/detalhe

2. **i18n:**
   - Adicionar chaves de tradução para todos os novos domínios em:
     - `locales/pt-PT/common.json`
     - `locales/en-US/common.json`
     - `locales/es-ES/common.json`
   - Labels de HubGrid density
   - Placeholders de formulários
   - Textos de erro

3. **QA:**
   - Testar CRUD completo de cada domínio
   - Testar sub-recursos (nested CRUD)
   - Testar paginação, busca, ordenação
   - Testar activate/deactivate
   - Testar bulk-upload
   - Testar autenticação e tenant isolation

4. **Build & Deploy:**
   - `npm run build` sem erros
   - `npm run lint` sem warnings
   - Typecheck completo
   - Deploy para staging
   - Validação em produção

---

## 6. Priorização e Sequenciamento

```
Fase 1 (Foundation)      ████████░░░░░░░░░░░░  Semana 1
Fase 2 (Platform)        ░░░░████████░░░░░░░░  Semana 1-2
Fase 3A (Clients)        ░░░░░░░░████████░░░░  Semana 2
Fase 3B (Employees)      ░░░░░░░░░░████████░░  Semana 2-3
Fase 3C (Visits)         ░░░░░░░░░░░░░░████░░  Semana 3
Fase 4 (Secundários)     ░░░░░░░░░░░░████████  Semana 3-4
Fase 5 (Catálogos)       ░░░░░░░░░░░░░░░░████  Semana 4
Fase 6 (QA/Deploy)       ░░░░░░░░░░░░░░░░░░██  Semana 4-5
```

**Duração total estimada:** 4-5 semanas

**Ordem de execução:**
1. Types/Models (base para tudo)
2. Platform Layer (API + hooks)
3. Clients (atualização — domínio mais maduro)
4. Employees (novo — segue padrão dos Clients)
5. Visits (novo — mais complexo, depende de Employees/Teams)
6. Tenants (admin)
7. Subscriptions (billing)
8. Vehicles/Equipments (atualização)
9. Catálogos (configuração)
10. Identity/Access (admin)
11. QA + Deploy

---

## 7. Riscos e Dependências

### 7.1 Riscos Identificados

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Mudança no modelo de Client** (Individual/Company → PartyTypeId) | Alto | Refatorar forms e models antes de qualquer outra coisa |
| **Endpoints de Visits são deeply nested** (7 níveis) | Alto | Criar componentes reutilizáveis para CRUD nested |
| **317 endpoints novos a consumir** | Alto | Priorizar por fase; não implementar tudo de uma vez |
| **RLS no Backend** — TenantId obrigatório | Médio | Garantir que todos os requests incluem tenant context |
| **Traduções (i18n)** — muitas chaves novas | Médio | Criar chaves em batch; usar ferramentas de i18n |
| **Bulk Upload** — 30+ endpoints de CSV | Baixo | Implementar após CRUD básico funcionar |
| **JWT Keys / Job Definitions** — admin only | Baixo | Implementar apenas se necessário para produção |

### 7.2 Dependências

| Dependência | Impacto |
|-------------|---------|
| Backend deploy da nova API | Pré-requisito para qualquer teste |
| Definição dos StatusDefinitions iniciais | Necessário para forms de Status |
| Definição dos PartyTypes seed data | Necessário para forms de Client |
| Definição dos AcquisitionSourceTypes | Necessário para forms de Client |
| Definição dos AddressTypes | Necessário para todos os sub-recursos de endereço |
| Definição dos DocumentTypes | Necessário para TenantDocuments e ClientDocuments |
| Configuração do Stripe | Necessário para Subscriptions |
| Configuração do S3 | Necessário para VisitAttachments |

### 7.3 Recomendações

1. **Manter backward compatibility** durante a migração — não quebrar funcionalidades existentes
2. **Migrar Client primeiro** — é o domínio mais maduro e mais usado
3. **Criar shared components** para padrões recorrentes (AddressForm, ContactForm, FiscalDataForm)
4. **Usar React Query** a partir desta migração — abandonar useState+useEffect para dados
5. **Documentardecisões** de arquitetura no repositório

---

## 8. Checklist de Validação

- [ ] Todos os types/interfaces atualizados
- [ ] Todos os query keys definidos
- [ ] Todos os hooks implementados
- [ ] Todos os HubGrid funcionando com paginação
- [ ] Todos os formulários com validação
- [ ] Todos os sub-recursos CRUD funcionando
- [ ] i18n completo (pt-PT, en-US, es-ES)
- [ ] Auth + tenant isolation funcionando
- [ ] Build sem erros
- [ ] Lint sem warnings
- [ ] Typecheck completo
- [ ] QA aprovado
- [ ] Deploy para staging
- [ ] Validação em produção
