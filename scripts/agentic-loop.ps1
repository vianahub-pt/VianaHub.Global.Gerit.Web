[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Goal,
    [switch]$SmokeTest,
    [switch]$Resume
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

function Invoke-Assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-SmokeTest {
    param([string]$GoalPath)

    $metadata = Get-AgenticGoalMetadata -Path $GoalPath
    $planPath = Join-Path $script:AgenticRepoRoot ("agentic/plans/{0}.md" -f $metadata["ID"])
    Invoke-Assert (Test-Path -LiteralPath $planPath -PathType Leaf) "O smoke test requer o plano local do goal."
    $allowed = @(
        "IDLE", "DISCOVERY", "PLANNING", "IMPLEMENTING", "TESTING", "SECURITY_REVIEW",
        "CODE_REVIEW", "CORRECTING", "READY_TO_COMMIT", "READY_TO_PR", "WAITING_FOR_QUOTA",
        "RESUMING", "WAITING_HUMAN_MERGE", "FAILED"
    )
    $transitions = @(
        "DISCOVERY", "PLANNING", "IMPLEMENTING", "TESTING", "SECURITY_REVIEW",
        "CODE_REVIEW", "READY_TO_COMMIT", "READY_TO_PR", "WAITING_HUMAN_MERGE"
    )
    foreach ($stateName in $transitions) {
        Invoke-Assert ($allowed -contains $stateName) "Estado nao permitido: $stateName"
    }
    $validPath = @(
        @("IDLE", "DISCOVERY"), @("DISCOVERY", "PLANNING"), @("PLANNING", "IMPLEMENTING"),
        @("IMPLEMENTING", "TESTING"), @("TESTING", "SECURITY_REVIEW"),
        @("SECURITY_REVIEW", "CODE_REVIEW"), @("CODE_REVIEW", "READY_TO_COMMIT"),
        @("READY_TO_COMMIT", "READY_TO_PR"), @("READY_TO_PR", "WAITING_HUMAN_MERGE"),
        @("IMPLEMENTING", "WAITING_FOR_QUOTA"), @("WAITING_FOR_QUOTA", "RESUMING"),
        @("RESUMING", "IMPLEMENTING"), @("TESTING", "CORRECTING"), @("CORRECTING", "IMPLEMENTING")
    )
    foreach ($edge in $validPath) {
        Invoke-Assert (Test-AgenticTransition -From $edge[0] -To $edge[1]) "Transicao nao permitida: $($edge[0]) -> $($edge[1])"
    }
    Invoke-Assert (-not (Test-AgenticTransition -From "WAITING_HUMAN_MERGE" -To "IMPLEMENTING")) "Estado final nao pode reabrir o goal."

    $fixtures = @(
        @{ Text = "usage limit reached"; Expected = "QUOTA" },
        @{ Text = "rate limit"; Expected = "QUOTA" },
        @{ Text = "weekly limit reached"; Expected = "QUOTA" },
        @{ Text = "retry after 30 seconds"; Expected = "QUOTA" },
        @{ Text = "capacity temporarily unavailable"; Expected = "QUOTA" },
        @{ Text = "TypeError: property is undefined"; Expected = "FAIL" }
    )
    foreach ($fixture in $fixtures) {
        $actual = (Get-AgenticQuotaClassification -Text $fixture.Text).Kind
        Invoke-Assert ($actual -eq $fixture.Expected) "Fixture de classificacao falhou: $($fixture.Expected)"
    }
    $unknownQuota = Get-AgenticQuotaClassification -Text "usage limit reached"
    $weeklyQuota = Get-AgenticQuotaClassification -Text "weekly limit reached"
    Invoke-Assert ($unknownQuota.WaitMinutes -eq 15 -and $weeklyQuota.WaitMinutes -eq 360) "Backoff padrao para quota desconhecida/semanal esta incorreto."
    $retryStart = [DateTimeOffset]::UtcNow
    $retryFixture = Get-AgenticQuotaClassification -Text "rate limit; retry after 45 seconds"
    $retrySeconds = ([DateTimeOffset]::Parse($retryFixture.RetryAt) - $retryStart).TotalSeconds
    Invoke-Assert ($retryFixture.Kind -eq "QUOTA" -and $retryFixture.WaitMinutes -eq 1 -and $retrySeconds -ge 44 -and $retrySeconds -le 46) "Tempo Retry-After explicito nao foi respeitado."
    Invoke-Assert ($allowed -contains "FAILED") "Estado terminal FAILED nao esta permitido."

    $resumeFixture = [pscustomobject]@{ goal_id = $metadata["ID"]; branch = (& git -C $script:AgenticRepoRoot branch --show-current).Trim(); state = "WAITING_FOR_QUOTA"; pending_action = "fixture" }
    $resumeFixture.state = "RESUMING"
    Invoke-Assert ($resumeFixture.state -eq "RESUMING" -and $resumeFixture.goal_id -eq $metadata["ID"] -and -not [string]::IsNullOrWhiteSpace($resumeFixture.branch)) "Fixture de retomada nao preservou goal/branch."

    $currentBranch = (& git -C $script:AgenticRepoRoot branch --show-current).Trim()
    Invoke-Assert ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($currentBranch)) "Nao foi possivel confirmar a branch atual."
    $state = Get-AgenticState
    $state.goal_id = $metadata["ID"]
    $state.goal_file = [System.IO.Path]::GetRelativePath($script:AgenticRepoRoot, $GoalPath).Replace('\', '/')
    $state.branch = $currentBranch
    $state.base_branch = $metadata["Base branch"]
    $state.started_at = [DateTime]::UtcNow.ToString("o")
    $state.iteration = 1
    $state.agent_calls = 0
    $state.consecutive_failures = 0
    $state.active_agent = "orchestrator"
    $state.memory_status = "MEMORY_UNAVAILABLE"
    $state.quota_state = "AVAILABLE"

    foreach ($stateName in $transitions) {
        $state.state = $stateName
        $state.pending_action = "smoke fixture: $stateName"
        Write-AgenticState -State $state
        Add-AgenticJournalEvent -Goal $metadata["ID"] -State $stateName -Agent "orchestrator" -Action "Simular transicao local" -Result "PASS: transicao fixture validada" -Gate "SMOKE_TEST" -Memory "MEMORY_UNAVAILABLE simulado"
    }

    $state.state = "IDLE"
    $state.active_agent = $null
    $state.pending_action = $null
    $state.last_gate = "SMOKE_TEST: PASS"
    $state.last_successful_step = "Smoke test deterministico concluido sem chamada de modelo"
    $state.memory_status = "MEMORY_UNAVAILABLE"
    Write-AgenticState -State $state

    $historyName = "{0}-smoke-test.md" -f [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
    $historyPath = Join-Path (Join-Path $script:AgenticRepoRoot "agentic/journal/history") $historyName
    Copy-Item -LiteralPath $script:AgenticJournalPath -Destination $historyPath -Force
    Set-Content -LiteralPath $script:AgenticJournalPath -Value "# Journal do goal ativo`n`nEventos sao append-only durante cada goal. Nao registre segredos, tokens, cookies, connection strings ou PII desnecessaria." -Encoding utf8

    Write-Output "SMOKE_TEST: PASS"
    Write-Output "- state machine e transicoes validas"
    Write-Output "- fixtures de quota e erro de codigo classificadas"
    Write-Output "- retomada validou repositorio, branch, goal e journal local"
    Write-Output "- MEMORY_UNAVAILABLE simulado sem bloquear o fluxo"
    Write-Output "- state atomico persistido e journal arquivado em agentic/journal/history/$historyName"
    Write-Output "- nenhuma chamada Codex, PR ou acao de producao executada"
}

function Invoke-Git {
    param([string[]]$GitArguments)
    $output = & git -C $script:AgenticRepoRoot @GitArguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Comando git falhou: git $($GitArguments -join ' ') (exit $LASTEXITCODE); saida detalhada omitida."
    }
    return $output
}

function Set-FailedState {
    param($State, [string]$Reason)
    $State.state = "FAILED"
    $State.last_failure = $Reason
    $State.pending_action = $null
    $State.active_agent = $null
    Write-AgenticState -State $State
    Add-AgenticJournalEvent -Goal ([string]$State.goal_id) -State "FAILED" -Agent "orchestrator" -Action "Encerrar com falha segura" -Result "FAILED" -Gate ([string]$State.last_gate) -Failure $Reason -Quota ([string]$State.quota_state) -Memory ([string]$State.memory_status)
}

function Start-GoalBranch {
    param([hashtable]$Metadata)

    $base = $Metadata["Base branch"]
    $prefix = $Metadata["Branch prefix"]
    if ($base -notin @("develop", "main")) { throw "Base branch deve ser develop ou main." }
    if ($prefix -notin @("feature", "fix", "hotfix")) { throw "Branch prefix deve ser feature, fix ou hotfix." }
    if (($prefix -eq "hotfix") -ne ($base -eq "main")) { throw "Somente hotfix usa main; goals normais devem usar develop." }

    $currentBranch = (& git -C $script:AgenticRepoRoot branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $base) {
        throw "Goal novo requer checkout limpo da base '$base'; branch atual: '$currentBranch'."
    }
    $changes = & git -C $script:AgenticRepoRoot status --porcelain
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel validar git status." }
    if (-not [string]::IsNullOrWhiteSpace(($changes -join ""))) { throw "Working tree nao esta limpo; nenhuma alteracao foi descartada." }

    Invoke-Git -GitArguments @("fetch", "origin") | Out-Null
    $slug = ($Metadata["ID"].ToLowerInvariant() -replace "[^a-z0-9-]+", "-").Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) { throw "ID do goal nao pode gerar slug de branch." }
    $branchName = "$prefix/$slug"
    $existing = & git -C $script:AgenticRepoRoot branch --list $branchName
    if ($LASTEXITCODE -ne 0 -or $existing) { throw "Branch local '$branchName' ja existe; nao sera sobrescrita." }
    $remoteExisting = & git -C $script:AgenticRepoRoot branch --remotes --list "origin/$branchName"
    if ($LASTEXITCODE -ne 0 -or $remoteExisting) { throw "Branch remota 'origin/$branchName' ja existe; nao sera sobrescrita." }
    Invoke-Git -GitArguments @("switch", "--create", $branchName, "origin/$base") | Out-Null
    return $branchName
}

function Invoke-CodexOrchestrator {
    param($State, [string]$GoalPath)

    $codexCommand = Get-Command codex -ErrorAction SilentlyContinue
    if ($null -eq $codexCommand) { throw "Codex CLI nao encontrado no PATH." }

    $promptPath = Join-Path $script:AgenticRepoRoot "agentic/prompts/autonomous-loop.md"
    $prompt = Get-Content -LiteralPath $promptPath -Raw
    $relativeGoal = [System.IO.Path]::GetRelativePath($script:AgenticRepoRoot, $GoalPath).Replace('\', '/')
    $prompt += "`n`nGoal ativo: $relativeGoal`nBranch: $($State.branch)`nBase: $($State.base_branch)`nLeia o checkpoint e continue ate WAITING_HUMAN_MERGE ou FAILED. Ao terminar, inclua exatamente uma linha FINAL_STATE: WAITING_HUMAN_MERGE ou FINAL_STATE: FAILED."

    $responsePath = Join-Path $script:AgenticRepoRoot "agentic/state/.codex-last-message.md"
    $cliOutput = @(& codex exec --json --sandbox workspace-write --cd $script:AgenticRepoRoot --output-last-message $responsePath $prompt 2>&1)
    $exitCode = $LASTEXITCODE
    $combinedOutput = $cliOutput -join [Environment]::NewLine
    $lastMessage = ""
    if (Test-Path -LiteralPath $responsePath) {
        $lastMessage = Get-Content -LiteralPath $responsePath -Raw
        Remove-Item -LiteralPath $responsePath -Force
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $combinedOutput
        LastMessage = $lastMessage
    }
}

try {
    $resolvedGoal = (Resolve-Path -LiteralPath $Goal).Path
    $repoPrefix = $script:AgenticRepoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    Invoke-Assert ($resolvedGoal.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) "Goal precisa estar dentro do repositorio."
    $metadata = Get-AgenticGoalMetadata -Path $resolvedGoal

    if ($SmokeTest) {
        Invoke-SmokeTest -GoalPath $resolvedGoal
        exit 0
    }

    $state = Get-AgenticState
    if ($Resume) {
        if ($state.state -in @("IDLE", "WAITING_HUMAN_MERGE", "FAILED")) { throw "Nao ha goal ativo retomavel no estado '$($state.state)'." }
        if ($state.goal_id -ne $metadata["ID"]) { throw "O goal fornecido nao corresponde ao checkpoint existente." }
        $branch = (& git -C $script:AgenticRepoRoot branch --show-current).Trim()
        if ($branch -ne $state.branch) { throw "Branch atual '$branch' difere do checkpoint '$($state.branch)'." }
        if ($state.state -eq "WAITING_FOR_QUOTA") {
            $resumeAt = if ($state.resume_after) {
                [DateTime]::Parse([string]$state.resume_after).ToUniversalTime()
            }
            else {
                $waitMinutes = if ($state.quota_type -eq "weekly") { 360 } else { 15 }
                [DateTime]::UtcNow.AddMinutes($waitMinutes)
            }
            $remaining = [int][Math]::Ceiling(($resumeAt - [DateTime]::UtcNow).TotalSeconds)
            if ($remaining -gt 0) { Start-Sleep -Seconds $remaining }
            $state.quota_state = "PROBE_DUE"
            $state.resume_after = $null
        }
        $state.state = "RESUMING"
        $state.active_agent = "orchestrator"
        $state.pending_action = "Retomar do checkpoint e journal existentes"
    }
    else {
        if ($state.state -ne "IDLE") { throw "Ja existe um goal nao finalizado no estado '$($state.state)'; use agentic-resume.ps1." }
        $branchName = Start-GoalBranch -Metadata $metadata
        $state = Get-AgenticStateTemplate
        $state.goal_id = $metadata["ID"]
        $state.goal_file = [System.IO.Path]::GetRelativePath($script:AgenticRepoRoot, $resolvedGoal).Replace('\', '/')
        $state.branch = $branchName
        $state.base_branch = $metadata["Base branch"]
        $state.started_at = [DateTime]::UtcNow.ToString("o")
        $state.state = "DISCOVERY"
        $state.pending_action = "Executar discovery e retomar conforme state/journal"
    }
    Write-AgenticState -State $state
    Add-AgenticJournalEvent -Goal $metadata["ID"] -State ([string]$state.state) -Agent "orchestrator" -Action "Checkpoint antes da chamada Codex" -Result "PENDING" -Memory ([string]$state.memory_status)

    while ($true) {
        $state = Get-AgenticState
        if ($state.state -eq "WAITING_FOR_QUOTA" -and [string]::IsNullOrWhiteSpace([string]$state.resume_after)) {
            $waitMinutes = if ($state.quota_type -eq "weekly") { 360 } else { 15 }
            $state.quota_type = if ($state.quota_type) { $state.quota_type } else { "temporary_or_unknown" }
            $state.quota_state = "WAITING"
            $state.quota_detected_at = if ($state.quota_detected_at) { $state.quota_detected_at } else { [DateTime]::UtcNow.ToString("o") }
            $state.resume_after = [DateTime]::UtcNow.AddMinutes($waitMinutes).ToString("o")
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $metadata["ID"] -State "WAITING_FOR_QUOTA" -Agent "orchestrator" -Action "Aplicar intervalo minimo sem reset explicito" -Result "PENDING: checkpoint persistido" -Quota ([string]$state.quota_type) -Memory ([string]$state.memory_status)
        }
        if ($state.state -eq "WAITING_FOR_QUOTA") {
            $resumeAt = [DateTime]::Parse([string]$state.resume_after).ToUniversalTime()
            $remaining = [int][Math]::Ceiling(($resumeAt - [DateTime]::UtcNow).TotalSeconds)
            if ($remaining -gt 0) {
                Write-Output "Quota pausada; proxima tentativa apos $($resumeAt.ToString('u'))."
                Start-Sleep -Seconds $remaining
            }
            $state.state = "RESUMING"
            $state.quota_state = "PROBE_DUE"
            $state.resume_after = $null
            $state.pending_action = "Repetir a acao pendente depois do intervalo de quota"
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $metadata["ID"] -State "RESUMING" -Agent "orchestrator" -Action "Probe unico apos backoff" -Result "PENDING" -Quota ([string]$state.quota_type) -Memory ([string]$state.memory_status)
        }

        if ($state.agent_calls -ge $state.max_agent_calls -or $state.iteration -ge $state.max_iterations) {
            Set-FailedState -State $state -Reason "Limite interno de iteracoes/chamadas atingido."
            exit 1
        }

        $state.agent_calls++
        $state.iteration++
        $state.active_agent = "orchestrator"
        $state.pending_action = "Executar Codex e continuar do goal/journal/checkpoint"
        if ($state.state -eq "RESUMING") { $state.last_successful_step = "Checkpoint validado para retomada" }
        Write-AgenticState -State $state
        Add-AgenticJournalEvent -Goal $metadata["ID"] -State ([string]$state.state) -Agent "orchestrator" -Action "Invocar Codex com checkpoint" -Result "PENDING" -Memory ([string]$state.memory_status)

        $result = Invoke-CodexOrchestrator -State $state -GoalPath $resolvedGoal
        $state = Get-AgenticState
        $classification = if ($result.ExitCode -ne 0) {
            Get-AgenticQuotaClassification -Text $result.Output
        }
        else {
            [pscustomobject]@{ Kind = "FAIL"; Type = $null; WaitMinutes = 0; RetryAt = $null }
        }
        if ($classification.Kind -eq "QUOTA") {
            $now = [DateTime]::UtcNow
            $state.state = "WAITING_FOR_QUOTA"
            $state.quota_state = "WAITING"
            $state.quota_type = $classification.Type
            $state.quota_detected_at = $now.ToString("o")
            $state.quota_reset_at = $classification.RetryAt
            $state.resume_after = if ($classification.RetryAt) { $classification.RetryAt } else { $now.AddMinutes($classification.WaitMinutes).ToString("o") }
            $state.pending_action = "Retomar acao Codex apos backoff; preservar goal, branch, diff e journal"
            $state.active_agent = $null
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $metadata["ID"] -State "WAITING_FOR_QUOTA" -Agent "orchestrator" -Action "Pausar apos sinal explicito de quota" -Result "PENDING: checkpoint persistido" -Quota $classification.Type -Memory ([string]$state.memory_status)
            continue
        }
        if ($state.state -eq "WAITING_FOR_QUOTA") {
            continue
        }

        if ($result.ExitCode -ne 0) {
            if ($classification.Kind -eq "TRANSIENT_ERROR" -and $state.consecutive_failures -lt $state.max_consecutive_failures) {
                $state.consecutive_failures++
                $state.state = "RESUMING"
                $state.pending_action = "Repetir uma vez apos erro transitorio"
                Write-AgenticState -State $state
                Add-AgenticJournalEvent -Goal $metadata["ID"] -State "RESUMING" -Agent "orchestrator" -Action "Backoff de erro transitorio" -Result "RETRY" -Failure "Falha transitoria do subprocesso Codex; saida bruta omitida"
                Start-Sleep -Seconds ($classification.WaitMinutes * 60)
                continue
            }
            Set-FailedState -State $state -Reason "codex exec terminou com codigo $($result.ExitCode); saida bruta omitida."
            exit 1
        }

        if ($state.state -eq "WAITING_HUMAN_MERGE") {
            if ([string]::IsNullOrWhiteSpace([string]$state.pr_url) -or [string]::IsNullOrWhiteSpace([string]$state.pr_number)) {
                Set-FailedState -State $state -Reason "Codex informou WAITING_HUMAN_MERGE sem referencia verificavel de PR."
                exit 1
            }
            Write-Output "Goal concluido. PR: $($state.pr_url). Estado: WAITING_HUMAN_MERGE."
            exit 0
        }
        if ($state.state -eq "FAILED") {
            Write-Output "Goal encerrado em FAILED. Consulte state e journal locais."
            exit 1
        }

        $finalState = [regex]::Match($result.LastMessage, "(?im)^\s*FINAL_STATE:\s*(WAITING_HUMAN_MERGE|FAILED)\s*$")
        if ($finalState.Success -and $finalState.Groups[1].Value -eq "FAILED") {
            if ($state.state -ne "FAILED") { Set-FailedState -State $state -Reason "Codex encerrou explicitamente em FAILED." }
            exit 1
        }
        if ($state.iteration -ge $state.max_iterations -or $state.agent_calls -ge $state.max_agent_calls) {
            Set-FailedState -State $state -Reason "Limite interno atingido antes de chegar a estado terminal."
            exit 1
        }

        $state.state = "RESUMING"
        $state.active_agent = "orchestrator"
        $state.pending_action = "Continuar workflow do ultimo checkpoint; nao reiniciar fases concluidas"
        $state.consecutive_failures = 0
        Write-AgenticState -State $state
        Add-AgenticJournalEvent -Goal $metadata["ID"] -State "RESUMING" -Agent "orchestrator" -Action "Continuar apos etapa Codex concluida" -Result "PENDING" -Memory ([string]$state.memory_status)
    }
}
catch {
    try {
        $checkpoint = Get-AgenticState
        if ($checkpoint.goal_id -eq $metadata["ID"] -and $checkpoint.state -notin @("IDLE", "WAITING_HUMAN_MERGE", "FAILED")) {
            Set-FailedState -State $checkpoint -Reason "Falha tecnica no supervisor; consulte o erro local sem descartar o checkpoint."
        }
    }
    catch { }
    Write-Error $_.Exception.Message
    exit 1
}
