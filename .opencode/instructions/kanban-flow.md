# Shared Kanban Flow

- Toda e qualquer comunicação com o usuário e também as issue do Github Projects sempre serão em português do Brasil.
- Board padrão para todos os repositórios e aplicações: `https://github.com/users/vianahub-pt/projects/1`
- O repositório deve ser resolvido dinamicamente pelo workspace atual, nunca hardcoded para outro projeto.
- O fluxo é sempre:
  - PO: Backlog -> To do
  - Developer: To do -> In Progress -> For Tests
  - QA: For Tests -> In Test -> For Deploy ou volta para In Progress
- Se o QA reprovar, ele deve comentar no card e devolver para In Progress.
- Se o QA aprovar, ele deve orientar a validação final do PR antes do merge.
