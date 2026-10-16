# Goals

Cada goal deve declarar `ID`, `Title`, `Base branch` e `Branch prefix`, seguido de objetivo, escopo, fora de escopo, critérios de aceite, validações, impacto de produção, consultas de memória e condição de parada. O supervisor aceita metadados em linhas simples ou em lista Markdown:

```md
# Goal

- ID: 001-clients-parity
- Title: Paridade de clientes
- Base branch: develop
- Branch prefix: feature
```

Goals normais partem de `develop` e usam `feature/*` ou `fix/*`; somente hotfix real parte de `main` com `hotfix/*`.
