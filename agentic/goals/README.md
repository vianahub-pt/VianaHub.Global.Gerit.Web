# Goals

Cada goal deve declarar `ID`, `Title`, `Base branch`, `Branch prefix` e `Allowed files`, seguido de objetivo, escopo, fora de escopo, critérios de aceite, validações, impacto de produção, consultas de memória e condição de parada. `Allowed files` é uma lista separada por vírgulas de caminhos relativos que podem ser staged pelo supervisor; use `none` para smoke tests. O supervisor também mantém state/journal localmente, mas nunca os inclui no commit do goal. O supervisor aceita metadados em linhas simples ou em lista Markdown:

```md
# Goal

- ID: 001-clients-parity
- Title: Paridade de clientes
- Base branch: develop
- Branch prefix: feature
- Allowed files: agentic/validation/001-clients-parity.md
```

Goals normais partem de `develop` e usam `feature/*` ou `fix/*`; somente hotfix real parte de `main` com `hotfix/*`.
