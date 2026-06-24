# Matriz de Mapeamento: Menu × Banco de Dados × Aplicação

Este documento apresenta a relação de cada item de menu do **HubMenu** com sua respectiva tabela no banco de dados e a página/URL na aplicação.

> **Regras aplicadas:**
> - Recursos são sempre ligados a tabelas no banco de dados
> - Não existem links/itens de menu para informações que estão em enums ou constants do código
> - Todas as URLs seguem o padrão em inglês do código fonte

---

## 1. Seção: Operations

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Dashboard | `Visits`, `Clients`, `Teams`, `Equipments`, `Vehicles` (agregados) | WorkspacePage | `/workspace` |
| Visits | `Visits` | Operations (visits) | `/operations` |
| Calendar | `Visits` | — | `/operations/calendar` |
| Routes | `Visits`, `VisitTeam`, `VisitTeamEmployee` | — | `/operations/routes` |

---

## 2. Seção: Clients

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Clients (List) | `Clients`, `ClientIndividuals`, `ClientCompanies` | ClientsPage | `/clients` |
| New Client | `Clients`, `ClientIndividuals`, `ClientCompanies`, `ClientAddresses`, `ClientContacts`, `ClientFiscalData`, `ClientConsents`, `ClientHierarchy` | ClientsCreatePage | `/clients/new` |
| Client Details | `Clients`, `ClientIndividuals`, `ClientCompanies`, `ClientAddresses`, `ClientContacts`, `ClientFiscalData`, `ClientConsents`, `ClientHierarchy` | ClientsDetailsPage | `/clients-details/[clientId]` |

---

## 3. Seção: Teams & Resources

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Teams | `Teams` | OperationsTeamsPage | `/operations/teams` |
| Team Members | `Employees`, `EmployeeTeam`, `EmployeeContacts`, `EmployeeAddresses` | OperationsTeamMembersPage | `/operations/teamMembers` |
| Functions | `Functions` | — | `/operations/functions` |
| Equipments | `Equipments`, `EquipmentTypes` | OperationsEquipmentsPage | `/operations/equipments` |
| Equipment Types | `EquipmentTypes` | — | `/operations/equipment-types` |
| Vehicles | `Vehicles` | OperationsVehiclesPage | `/operations/vehicles` |

---

## 4. Seção: Settings (Parametrização)

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Address Types | `AddressTypes` | — | `/settings/address-types` |
| Status Types | `StatusTypes` | — | `/settings/status-types` |
| Visit Status | `Status`, `StatusTypes` | — | `/settings/visit-status` |
| Consent Types | `ConsentTypes` | — | `/settings/consent-types` |
| File Types | `FileTypes` | — | `/settings/file-types` |
| Attachment Categories | `AttachmentCategories` | — | `/settings/attachment-categories` |
| Preferences | `UserPreferences` | SettingsPreferencesPage | `/settings/preferences` |

---

## 5. Seção: Administration

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Users | `Users`, `UserRoles` | OperationsUsersPage | `/operations/users` |
| Roles | `Roles`, `RolePermissions` | OperationsRolesPage | `/operations/roles` |
| Permissions | `RolePermissions`, `Resources`, `Actions` | — | `/admin/permissions` |
| Resources | `Resources` | — | `/admin/resources` |
| Actions | `Actions` | — | `/admin/actions` |

---

## 6. Seção: SaaS & Billing

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Tenants | `Tenants`, `TenantContacts`, `TenantAddresses`, `TenantFiscalData` | — | `/admin/tenants` |
| Plans | `Plans`, `PlanFileRules` | — | `/admin/plans` |
| Subscriptions | `Subscriptions` | — | `/admin/subscriptions` |

---

## 7. Seção: Technical

| Item de Menu | Tabela(s) no BD | Página na Aplicação | URL |
|--------------|-----------------|---------------------|-----|
| Jobs | `JobDefinitions` | — | `/admin/jobs` |
| JWT Keys | `JwtKeys` | — | `/admin/jwt-keys` |
| Swagger | — | — | `/admin/swagger` |
| Hangfire | — | — | `/admin/hangfire` |

---

## Tabelas sem Item de Menu

As seguintes tabelas **não possuem** item de menu dedicado na aplicação:

| Tabela | Descrição | Onde Apresentar |
|--------|-----------|-----------------|
| `PlanFileRules` | Regras de arquivo por plano | **SaaS & Billing → Plans** (sub-grid na página de Planos) |
| `TenantContacts` | Contatos do tenant | **SaaS & Billing → Tenants** (aba na página de Tenant) |
| `TenantAddresses` | Endereços do tenant | **SaaS & Billing → Tenants** (aba na página de Tenant) |
| `TenantFiscalData` | Dados fiscais do tenant | **SaaS & Billing → Tenants** (aba na página de Tenant) |
| `UserRoles` | Relação usuário × role | **Administration → Users** (campo no formulário de edição) |
| `RolePermissions` | Permissões por role | **Administration → Roles** (aba na página de Roles) |
| `RefreshTokens` | Tokens de refresh | **Backend only** (sem UI) |
| `JwtKeys` | Chaves JWT | **Technical → JWT Keys** (já existe) |
| `ClientIndividuals` | Dados de clientes pessoa física | **Clients → Client Details** (aba no detalhe do cliente) |
| `ClientCompanies` | Dados de clientes pessoa jurídica | **Clients → Client Details** (aba no detalhe do cliente) |
| `ClientAddresses` | Endereços do cliente | **Clients → Client Details** (aba "Addresses") |
| `ClientContacts` | Contatos do cliente | **Clients → Client Details** (aba "Contacts") |
| `ClientFiscalData` | Dados fiscais do cliente | **Clients → Client Details** (aba "Fiscal Data") |
| `ClientHierarchy` | Hierarquia entre clientes | **Clients → Client Details** (aba "Hierarchy") |
| `ClientConsents` | Consentimentos do cliente | **Clients → Client Details** (aba "Consents") |
| `EmployeeContacts` | Contatos do colaborador | **Teams & Resources → Team Members** (sub-grid) |
| `EmployeeAddresses` | Endereços do colaborador | **Teams & Resources → Team Members** (sub-grid) |
| `EmployeeTeam` | Associação membro × time | **Teams & Resources → Team Members** (campo de seleção) |
| `VisitContacts` | Contatos da visita | **Operations → Visits** (aba no detalhe da visita) |
| `VisitAddresses` | Endereços da visita | **Operations → Visits** (aba no detalhe da visita) |
| `VisitTeam` | Equipe da visita | **Operations → Visits** (aba "Team") |
| `VisitTeamEmployee` | Membro da equipe de visita | **Operations → Visits** (sub-grid na aba "Team") |
| `VisitTeamVehicle` | Veículo da equipe de visita | **Operations → Visits** (sub-grid na aba "Team") |
| `VisitTeamEquipment` | Equipamento da equipe de visita | **Operations → Visits** (sub-grid na aba "Team") |
| `VisitAttachments` | Anexos da visita | **Operations → Visits** (aba "Attachments") |
| `AttachmentCategories` | Categorias de anexo | **Settings → Attachment Categories** (já existe) |

---

## Resumo Visual

```
MENU                                    TABELAS BD                              URL
─────────────────────────────────────   ─────────────────────────────────────   ──────────────────────────────

OPERATIONS
├── Dashboard                           Visits, Clients, Teams (agregados)      /workspace
├── Visits                              Visits                                  /operations
├── Calendar                            Visits                                  /operations/calendar
└── Routes                              Visits, VisitTeam, VisitTeamEmployee    /operations/routes

CLIENTS
├── Clients (List)                      Clients, ClientIndividuals, ClientCos   /clients
├── New Client                          Clients + sub-entidades                 /clients/new
└── Client Details                      Clients + sub-entidades                 /clients-details/[clientId]

TEAMS & RESOURCES
├── Teams                               Teams                                   /operations/teams
├── Team Members                        Employees, EmployeeTeam, ...            /operations/teamMembers
├── Functions                           Functions                               /operations/functions
├── Equipments                          Equipments, EquipmentTypes              /operations/equipments
├── Equipment Types                     EquipmentTypes                          /operations/equipment-types
└── Vehicles                            Vehicles                                /operations/vehicles

SETTINGS
├── Address Types                       AddressTypes                            /settings/address-types
├── Status Types                        StatusTypes                             /settings/status-types
├── Visit Status                        Status, StatusTypes                     /settings/visit-status
├── Consent Types                       ConsentTypes                            /settings/consent-types
├── File Types                          FileTypes                               /settings/file-types
├── Attachment Categories               AttachmentCategories                    /settings/attachment-categories
└── Preferences                         UserPreferences                         /settings/preferences

ADMINISTRATION
├── Users                               Users, UserRoles                        /operations/users
├── Roles                               Roles, RolePermissions                  /operations/roles
├── Permissions                         RolePermissions, Resources, Actions     /admin/permissions
├── Resources                           Resources                               /admin/resources
├── Actions                             Actions                                 /admin/actions

SAAS & BILLING
├── Tenants                             Tenants, TenantContacts, ...            /admin/tenants
├── Plans                               Plans, PlanFileRules                    /admin/plans
└── Subscriptions                       Subscriptions                           /admin/subscriptions

TECHNICAL
├── Jobs                                JobDefinitions                          /admin/jobs
├── JWT Keys                            JwtKeys                                 /admin/jwt-keys
├── Swagger                             —                                       /admin/swagger
└── Hangfire                            —                                       /admin/hangfire
```
