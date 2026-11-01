# Retomar um goal

O supervisor PowerShell, executado pelo operador no host, carrega o checkpoint existente e valida goal metadata, state, branch, base, pending phase/action, journal, bootstrap hash, role artifacts e snapshots. State terminal não é retomável. Divergência bloqueia sem reiniciar discovery nem zerar counters.

Ao retomar, o supervisor cria nova invocation ID para uma role individual e continua a fase pendente. Resultados de invocation anterior ou outro snapshot são rejeitados. Quality gates só são reutilizados quando classificação, paths e hashes continuam idênticos; caso contrário, o supervisor os invalida e executa novamente os gates requeridos no host. Gates são registrados com status PASS/FAIL/NOT_APPLICABLE, comando, timestamps, duração, exit code e resumo sanitizado.

Roles nunca alteram state/journal/gates oficiais ou transições. Tester não executa nem aprova quality gates; security e reviewer são invocados separadamente e read-only. State, journal e planos são artifacts locais. Git mutável, commit, push, PR, merge e deploy permanecem proibidos para agentes; merge humano é obrigatório e produção continua read-only.
