# Guardrails de quota e retomada

- Classifique como quota somente sinais explícitos de limite, rate limit, capacidade temporária ou `retry after`; erros de compilação/código são falhas normais.
- Não invente API de uso/reset. Use apenas a mensagem real do Codex CLI quando trouxer tempo de reset.
- Sem reset explícito: aguarde pelo menos 15 minutos para limite temporário/desconhecido e 6 horas quando a mensagem indicar limite semanal. Faça no máximo uma nova tentativa por intervalo.
- Antes de aguardar, persista state, journal, goal, branch e ação pendente. Não apague diff, plano ou journal.
- Após reinício, `agentic-resume.ps1` valida o checkpoint e respeita o próximo horário de tentativa.
- A memória externa é best-effort. A continuidade local permanece disponível se o MCP cair.
