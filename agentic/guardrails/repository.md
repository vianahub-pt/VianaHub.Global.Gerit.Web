# Agentic vNext — repositório

- `docs/agentic/1-architecture.md` a `7-acceptance-tests.md` são o contrato congelado v1.0.
- O Request Envelope é a solicitação imutável; o Architect avalia preflight no base remoto confiável e produz a Execution Specification. `agentic/plans/**` não é fonte canônica.
- Orchestrator decide transições e agregações permitidas. Supervisor valida, persiste state/journal/artifacts, executa Git e ações nativas limitadas. Roles retornam evidências; nenhuma role escreve control paths.
- Somente Implementer altera arquivos funcionais aprovados na Specification. Tester solicita ações limitadas ao Broker e julga sua evidência. Reviewer e Security são independentes, read-only e compartilham o mesmo snapshot.
- Mudança funcional invalida Tester, Reviewer, Security, gates e verificações downstream. Recomece pelo Tester após a correção.
- Nunca exponha secrets ou PII em envelopes, state, journal, artifacts ou logs. Não aceite shell arbitrário do Tester.
- Resume usa o mesmo request, branch, base, Specification e checkpoint. `ALREADY_SATISFIED`, `FAILED` e `WAITING_HUMAN_MERGE` são terminais.
- O fluxo termina em `WAITING_HUMAN_MERGE` ou `FAILED`; não faça merge nem deploy automaticamente.
- O Desktop inicia e retoma pelo MCP local `agentic-supervisor` (`start_request`, `resume_request`, `get_status`).
