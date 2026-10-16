# Guardrails do repositório

- Faça alterações mínimas dentro do goal; preserve padrões e contratos existentes do Gerit.
- Não altere funcionalidade de negócio fora do critério de aceite.
- Proteja arquivos e alterações preexistentes; nunca descarte trabalho local para limpar o repositório.
- Para API, autenticação, autorização, tenant ou camadas globais, exija análise de arquitetura e security review.
- Registre comandos e evidências de gates. Não oculte falhas.
- Orchestrator coordena sem implementar mudanças funcionais; architect planeja; somente implementer pode editar arquivos funcionais permitidos pelo goal. Tester, security e reviewer são read-only.
- Registre eventos com `controller`, `actor`, `delegated_agent` quando aplicável, `action`, `files_changed` e `result`. Cada arquivo funcional alterado precisa de evento `actor: implementer`, ação preenchida e `result: PASS`; state/journal são artefatos de coordenação.
- Git mutável é exclusivo do supervisor PowerShell; `codex exec` não pode executar fetch, add, commit, push, checkout/switch, criar PR, merge ou alterar refs.
