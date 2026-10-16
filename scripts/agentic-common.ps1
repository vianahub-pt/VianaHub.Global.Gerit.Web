Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:AgenticRepoRoot = Split-Path -Parent $PSScriptRoot
$script:AgenticStatePath = Join-Path $script:AgenticRepoRoot "agentic/state/loop-state.json"
$script:AgenticJournalPath = Join-Path $script:AgenticRepoRoot "agentic/journal/current.md"
$script:AgenticStates = @(
    "IDLE", "DISCOVERY", "PLANNING", "IMPLEMENTING", "TESTING", "SECURITY_REVIEW",
    "CODE_REVIEW", "CORRECTING", "READY_TO_COMMIT", "READY_TO_PR", "WAITING_FOR_QUOTA",
    "RESUMING", "WAITING_HUMAN_MERGE", "FAILED"
)

function Invoke-AgenticNativeProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$CaptureStandardError
    )

    $command = Get-Command -Name $FilePath -ErrorAction Stop
    if ($command.CommandType -notin @("Application", "ExternalScript")) {
        throw "Command '$FilePath' is not an executable process."
    }
    $commandPath = $command.Source

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        if ($CaptureStandardError) {
            $output = @(& $commandPath @Arguments 2>&1)
        }
        else {
            $output = @(& $commandPath @Arguments 2>$null)
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $script:AgenticLastNativeExitCode = $exitCode

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($output)
    }
}

function Assert-AgenticNativeProcessSucceeded {
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$CommandName
    )

    if ($Result.ExitCode -ne 0) {
        throw "$CommandName failed (exit code $($Result.ExitCode))."
    }
}

function Invoke-AgenticGit {
    param([Parameter(Mandatory = $true)][string[]]$GitArguments)

    $arguments = @("-C", $script:AgenticRepoRoot) + $GitArguments
    $result = Invoke-AgenticNativeProcess -FilePath "git" -Arguments $arguments
    Assert-AgenticNativeProcessSucceeded -Result $result -CommandName "Git command"
    return $result.Output
}

function Get-AgenticRelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $baseFullPath = [IO.Path]::GetFullPath($BasePath)
    $targetFullPath = [IO.Path]::GetFullPath($TargetPath)
    $separators = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $basePrefix = $baseFullPath.TrimEnd($separators) + [IO.Path]::DirectorySeparatorChar
    $comparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }

    if (-not $targetFullPath.StartsWith($basePrefix, $comparison)) {
        throw "Target path is outside the repository root."
    }

    return $targetFullPath.Substring($basePrefix.Length).Replace('\', '/')
}

function Get-AgenticStateTemplate {
    [pscustomobject]@{
        goal_id = $null
        goal_file = $null
        branch = $null
        base_branch = "develop"
        iteration = 0
        max_iterations = 8
        agent_calls = 0
        max_agent_calls = 40
        consecutive_failures = 0
        max_consecutive_failures = 3
        state = "IDLE"
        active_agent = $null
        last_gate = $null
        last_failure = $null
        last_successful_step = $null
        quality_gates = [pscustomobject]@{
            diff_check = "PENDING"
            lint = "PENDING"
            build = "PENDING"
            typecheck = "PENDING"
        }
        security_review_status = "PENDING"
        code_review_status = "PENDING"
        pending_action = $null
        commit_sha = $null
        pr_number = $null
        pr_url = $null
        memory_status = "UNKNOWN"
        quota_state = "AVAILABLE"
        quota_type = $null
        quota_detected_at = $null
        quota_reset_at = $null
        resume_after = $null
        started_at = $null
        updated_at = $null
    }
}

function Get-AgenticState {
    if (-not (Test-Path -LiteralPath $script:AgenticStatePath)) {
        return Get-AgenticStateTemplate
    }

    $raw = [System.IO.File]::ReadAllText($script:AgenticStatePath, [System.Text.UTF8Encoding]::new($false))
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "O arquivo de estado agentic esta vazio."
    }

    $state = $raw | ConvertFrom-Json
    if ($null -eq $state.state -or $null -eq $state.base_branch) {
        throw "O arquivo de estado agentic nao contem campos obrigatorios."
    }
    if ($script:AgenticStates -notcontains [string]$state.state) {
        throw "O arquivo de estado contem um estado nao permitido."
    }
    return $state
}

function Test-AgenticTransition {
    param(
        [Parameter(Mandatory = $true)][string]$From,
        [Parameter(Mandatory = $true)][string]$To
    )

    if ($script:AgenticStates -notcontains $From -or $script:AgenticStates -notcontains $To) { return $false }
    $valid = @{
        IDLE = @("DISCOVERY")
        DISCOVERY = @("PLANNING", "WAITING_FOR_QUOTA", "FAILED")
        PLANNING = @("IMPLEMENTING", "WAITING_FOR_QUOTA", "FAILED")
        IMPLEMENTING = @("TESTING", "WAITING_FOR_QUOTA", "FAILED")
        TESTING = @("SECURITY_REVIEW", "CORRECTING", "WAITING_FOR_QUOTA", "FAILED")
        SECURITY_REVIEW = @("CODE_REVIEW", "CORRECTING", "WAITING_FOR_QUOTA", "FAILED")
        CODE_REVIEW = @("READY_TO_COMMIT", "CORRECTING", "WAITING_FOR_QUOTA", "FAILED")
        CORRECTING = @("PLANNING", "IMPLEMENTING", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_COMMIT = @("READY_TO_PR", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_PR = @("WAITING_HUMAN_MERGE", "WAITING_FOR_QUOTA", "FAILED")
        WAITING_FOR_QUOTA = @("RESUMING", "FAILED")
        RESUMING = @("DISCOVERY", "PLANNING", "IMPLEMENTING", "TESTING", "SECURITY_REVIEW", "CODE_REVIEW", "CORRECTING", "READY_TO_COMMIT", "READY_TO_PR", "WAITING_FOR_QUOTA", "WAITING_HUMAN_MERGE", "FAILED")
        WAITING_HUMAN_MERGE = @()
        FAILED = @()
    }
    return $valid[$From] -contains $To
}

function Get-AgenticSupervisorPaths {
    return @("agentic/state/loop-state.json", "agentic/journal/current.md")
}

function Get-AgenticAllowedGoalFiles {
    param([Parameter(Mandatory = $true)][hashtable]$Metadata)

    $raw = [string]$Metadata["Allowed files"]
    if ([string]::IsNullOrWhiteSpace($raw) -or $raw -eq "none") { return @() }
    return @($raw -split "," | ForEach-Object { $_.Trim().Replace('\', '/') } | Where-Object { $_ })
}

function Test-AgenticReadiness {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$CurrentBranch,
        [Parameter(Mandatory = $true)][string[]]$ChangedPaths
    )

    if ([string]$State.state -ne "READY_TO_COMMIT") { throw "Codex precisa entregar state READY_TO_COMMIT." }
    if ([string]$State.branch -ne $CurrentBranch) { throw "Branch atual nao corresponde ao checkpoint." }
    if ([string]$State.base_branch -ne [string]$Metadata["Base branch"]) { throw "Base do state nao corresponde ao goal." }
    $prefix = [string]$Metadata["Branch prefix"]
    $slug = ([string]$Metadata["ID"]).ToLowerInvariant() -replace "[^a-z0-9-]+", "-"
    $slug = $slug.Trim("-")
    $expectedBranch = "$prefix/$slug"
    if ($CurrentBranch -ne $expectedBranch -or $CurrentBranch -in @("develop", "main")) { throw "Branch nao corresponde ao prefixo e ID declarados no goal." }
    if ($State.base_branch -notin @("develop", "main") -or (($prefix -eq "hotfix") -ne ($State.base_branch -eq "main"))) { throw "Combinacao de branch/base nao permitida." }

    $qualityGates = @("diff_check", "lint", "build", "typecheck")
    foreach ($gate in $qualityGates) {
        if ([string]$State.quality_gates.$gate -ne "PASS") { throw "Quality gate '$gate' nao consta como PASS." }
    }
    if ([string]$State.security_review_status -ne "PASS") { throw "Security review nao consta como PASS." }
    if ([string]$State.code_review_status -ne "PASS") { throw "Code review nao consta como PASS." }

    $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
    if ($allowed.Count -eq 0) { throw "Goal precisa declarar Allowed files antes do commit." }
    if ($ChangedPaths.Count -eq 0) { throw "Nenhuma alteracao de goal para stage." }
    $allowedSet = @{}
    foreach ($path in $allowed) { $allowedSet[$path.ToLowerInvariant()] = $true }
    foreach ($path in $ChangedPaths) {
        $normalized = ([string]$path).Replace('\', '/')
        if ($normalized -in (Get-AgenticSupervisorPaths)) { continue }
        if (-not $allowedSet.ContainsKey($normalized.ToLowerInvariant())) { throw "Working tree contem arquivo fora do escopo permitido pelo goal." }
    }
    return $true
}

function Test-AgenticPushTarget {
    param([Parameter(Mandatory = $true)][string]$Branch)

    return ($Branch -match '^(feature|fix|hotfix)/[a-z0-9][a-z0-9-]*$' -and $Branch -notin @("develop", "main"))
}

function Test-AgenticPullRequest {
    param(
        [Parameter(Mandatory = $true)]$PullRequest,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$BaseBranch
    )

    if ($null -eq $PullRequest) { return $false }
    $number = 0
    $validNumber = [int]::TryParse([string]$PullRequest.number, [ref]$number)
    return ($validNumber -and $number -gt 0 -and
        [string]$PullRequest.state -eq "OPEN" -and
        [string]$PullRequest.headRefName -eq $Branch -and
        [string]$PullRequest.baseRefName -eq $BaseBranch -and
        [string]$PullRequest.url -match '^https://github\.com/[^/]+/[^/]+/pull/[0-9]+$')
}

function Set-AgenticVerifiedPullRequestState {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)]$PullRequest,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$BaseBranch
    )

    if (-not (Test-AgenticPullRequest -PullRequest $PullRequest -Branch $Branch -BaseBranch $BaseBranch)) {
        throw "Pull request nao e verificavel para a branch/base declaradas."
    }
    $State.pr_number = [string]$PullRequest.number
    $State.pr_url = [string]$PullRequest.url
    $State.state = "WAITING_HUMAN_MERGE"
    return $State
}

function New-AgenticFailedCheckpoint {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Reason)

    $failed = $State | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $failed.state = "FAILED"
    $failed.last_failure = $Reason
    $failed.pending_action = $null
    $failed.active_agent = $null
    if ($null -ne $failed.PSObject.Properties["updated_at"]) { $failed.updated_at = [DateTime]::UtcNow.ToString("o") }
    else { $failed | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) }
    return $failed
}

function Invoke-AgenticSupervisorFixtures {
    $promptPath = Join-Path $script:AgenticRepoRoot "agentic/prompts/autonomous-loop.md"
    $prompt = [System.IO.File]::ReadAllText($promptPath, [System.Text.UTF8Encoding]::new($false))
    foreach ($forbidden in @("git fetch", "git add", "git commit", "git push", "git checkout", "git switch", "gh pr create", "merge")) {
        if ($prompt -notmatch [regex]::Escape($forbidden)) { throw "Prompt nao proibe '$forbidden' dentro do Codex." }
    }
    if ($prompt -notmatch "FINAL_STATE: READY_TO_COMMIT") { throw "Prompt nao define READY_TO_COMMIT como handoff do Codex." }
    $codexState = [pscustomobject]@{ state = "READY_TO_COMMIT" }
    if ($codexState.state -ne "READY_TO_COMMIT") { throw "Fixture A: Codex nao pode concluir em READY_TO_COMMIT." }
    $readOnlyCommands = @("git status", "git diff", "git diff --check", "git branch --show-current", "git log")
    if (@($readOnlyCommands | Where-Object { $_ -match 'git (fetch|add|commit|push|checkout|switch)|gh pr create' }).Count -gt 0) { throw "Fixture A: lista de comandos read-only contem Git mutavel." }

    $metadata = @{
        "ID" = "agentic-fixture"
        "Title" = "Fixture do supervisor"
        "Base branch" = "develop"
        "Branch prefix" = "feature"
        "Allowed files" = "agentic/validation/agentic-fixture.md"
    }
    $state = [pscustomobject]@{
        state = "READY_TO_COMMIT"
        branch = "feature/agentic-fixture"
        base_branch = "develop"
        quality_gates = [pscustomobject]@{ diff_check = "PASS"; lint = "PASS"; build = "PASS"; typecheck = "PASS" }
        security_review_status = "PASS"
        code_review_status = "PASS"
        goal_id = "agentic-fixture"
        commit_sha = $null
        pr_number = $null
        pr_url = $null
        last_gate = "CODE_REVIEW: PASS"
        last_failure = $null
        pending_action = "supervisor"
        active_agent = "supervisor"
        memory_status = "MEMORY_UNAVAILABLE"
        quota_state = "AVAILABLE"
        updated_at = $null
    }
    if (-not (Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("agentic/validation/agentic-fixture.md", "agentic/state/loop-state.json"))) { throw "Fixture B: READY_TO_COMMIT nao foi reconhecido." }

    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/wrong-branch" -ChangedPaths @("agentic/validation/agentic-fixture.md") | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture C: branch incorreta foi aceita." }

    $rejected = $false
    $state.security_review_status = "PENDING"
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("agentic/validation/agentic-fixture.md") | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem reviews PASS foi aceito." }
    $state.security_review_status = "PASS"
    $state.code_review_status = "PENDING"
    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("agentic/validation/agentic-fixture.md") | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem code review PASS foi aceito." }
    $state.code_review_status = "PASS"
    $state.quality_gates.lint = "FAIL"
    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("agentic/validation/agentic-fixture.md") | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem quality gates PASS foi aceito." }
    $state.quality_gates.lint = "PASS"

    if (-not (Test-AgenticPushTarget -Branch "feature/agentic-fixture")) { throw "Fixture E: branch de trabalho valida foi rejeitada." }
    foreach ($protectedBranch in @("develop", "main")) {
        if (Test-AgenticPushTarget -Branch $protectedBranch) { throw "Fixture E: push para '$protectedBranch' foi permitido." }
    }

    foreach ($operation in @("git commit", "git push", "gh pr create")) {
        $state.commit_sha = if ($operation -eq "git commit") { $null } else { "fixture-commit-sha" }
        $failed = New-AgenticFailedCheckpoint -State $state -Reason "$operation falhou (exit code 9); saida omitida."
        $expectedCommit = if ($operation -eq "git commit") { $null } else { "fixture-commit-sha" }
        if ($failed.state -ne "FAILED" -or $failed.commit_sha -ne $expectedCommit -or $failed.branch -ne $state.branch -or $failed.goal_id -ne $state.goal_id) { throw "Fixture F: falha de $operation nao preservou o checkpoint." }
    }

    $pr = [pscustomobject]@{ number = 316; url = "https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web/pull/316"; state = "OPEN"; headRefName = "feature/agentic-fixture"; baseRefName = "develop" }
    if (-not (Test-AgenticPullRequest -PullRequest $pr -Branch "feature/agentic-fixture" -BaseBranch "develop")) { throw "Fixture G: PR verificavel foi rejeitado." }
    $pr.state = "MERGED"
    if (Test-AgenticPullRequest -PullRequest $pr -Branch "feature/agentic-fixture" -BaseBranch "develop") { throw "Fixture G: estado final aceitou PR que nao esta aberto." }
    $state.state = "READY_TO_PR"
    $rejected = $false
    try { Set-AgenticVerifiedPullRequestState -State $state -PullRequest $pr -Branch "feature/agentic-fixture" -BaseBranch "develop" | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected -or $state.state -ne "READY_TO_PR") { throw "Fixture G: WAITING_HUMAN_MERGE foi definido sem PR verificavel." }
    $pr.state = "OPEN"
    Set-AgenticVerifiedPullRequestState -State $state -PullRequest $pr -Branch "feature/agentic-fixture" -BaseBranch "develop" | Out-Null
    if ($state.state -ne "WAITING_HUMAN_MERGE" -or $state.pr_number -ne "316" -or -not $state.pr_url) { throw "Fixture G: PR verificavel nao produziu checkpoint WAITING_HUMAN_MERGE." }

    return "PASS: fixtures A-G"
}

function Write-AgenticState {
    param([Parameter(Mandatory = $true)]$State)

    $State.updated_at = [DateTime]::UtcNow.ToString("o")
    $json = $State | ConvertTo-Json -Depth 20
    $temporaryPath = "$($script:AgenticStatePath).tmp"
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($temporaryPath, $json + [Environment]::NewLine, $encoding)

    if (Test-Path -LiteralPath $script:AgenticStatePath) {
        try {
            [System.IO.File]::Replace($temporaryPath, $script:AgenticStatePath, $null)
        }
        catch {
            Move-Item -LiteralPath $temporaryPath -Destination $script:AgenticStatePath -Force
        }
    }
    else {
        Move-Item -LiteralPath $temporaryPath -Destination $script:AgenticStatePath
    }
}

function Add-AgenticJournalEvent {
    param(
        [Parameter(Mandatory = $true)][string]$Goal,
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][string]$Agent,
        [Parameter(Mandatory = $true)][string]$Action,
        [Parameter(Mandatory = $true)][string]$Result,
        [string]$Gate = "n/a",
        [string]$Failure = "n/a",
        [string]$Quota = "n/a",
        [string]$Memory = "n/a"
    )

    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $iteration = (Get-AgenticState).iteration
    $event = @(
        "",
        "## $timestamp - $Goal - iteracao $iteration",
        "- state: $State",
        "- agent: $Agent",
        "- action: $Action",
        "- files: agentic/state/loop-state.json; agentic/journal/current.md",
        "- decision: checkpoint persistido antes da acao; conteudo sensivel omitido",
        "- gate: $Gate",
        "- result: $Result",
        "- failure: $Failure",
        "- retry: registrado no estado estruturado",
        "- quota: $Quota",
        "- memory: $Memory"
    ) -join [Environment]::NewLine

    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::AppendAllText($script:AgenticJournalPath, $event + [Environment]::NewLine, $utf8NoBom)
}

function Get-AgenticQuotaClassification {
    param([AllowNull()][string]$Text)

    $message = [string]$Text
    $isWeekly = $message -match "(?i)weekly\s+(usage\s+)?limit|weekly\s+limit|limite\s+semanal"
    $isQuota = $isWeekly -or $message -match "(?i)usage\s+limit\s+reached|rate\s+limit|capacity\s+(is\s+)?temporarily\s+unavailable|retry\s+after|retry-after|limite\s+de\s+uso|limite\s+de\s+requisi"
    if ($isQuota) {
        $waitMinutes = if ($isWeekly) { 360 } else { 15 }
        $retryAt = $null
        $dateMatch = [regex]::Match($message, "(?i)(?:retry\s+after|reset(?:s)?\s+at|available\s+again\s+at)\s*:?\s*(?<date>20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)")
        if ($dateMatch.Success) {
            $parsed = [DateTimeOffset]::MinValue
            if ([DateTimeOffset]::TryParse($dateMatch.Groups["date"].Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsed)) {
                $retryAt = $parsed.ToUniversalTime().ToString("o")
                $waitMinutes = [Math]::Max(1, [int][Math]::Ceiling(($parsed.ToUniversalTime() - [DateTimeOffset]::UtcNow).TotalMinutes))
            }
        }
        else {
            $durationMatch = [regex]::Match($message, "(?i)(?:retry\s+after|retry-after|try\s+again\s+in)\s*:?\s*(?<amount>\d+)\s*(?<unit>seconds?|secs?|minutes?|mins?|hours?|hrs?)")
            if ($durationMatch.Success) {
                $amount = [int]$durationMatch.Groups["amount"].Value
                $unit = $durationMatch.Groups["unit"].Value.ToLowerInvariant()
                $durationSeconds = if ($unit.StartsWith("h")) { $amount * 3600 } elseif ($unit.StartsWith("s")) { $amount } else { $amount * 60 }
                $waitMinutes = [Math]::Max(1, [int][Math]::Ceiling($durationSeconds / 60))
                $retryAt = [DateTimeOffset]::UtcNow.AddSeconds($durationSeconds).ToString("o")
            }
            else {
                $headerMatch = [regex]::Match($message, "(?im)^\s*Retry-After\s*:\s*(?<seconds>\d+)\s*$")
                if ($headerMatch.Success) {
                    $seconds = [int]$headerMatch.Groups["seconds"].Value
                    $waitMinutes = [Math]::Max(1, [int][Math]::Ceiling($seconds / 60))
                    $retryAt = [DateTimeOffset]::UtcNow.AddSeconds($seconds).ToString("o")
                }
            }
        }
        return [pscustomobject]@{ Kind = "QUOTA"; Type = $(if ($isWeekly) { "weekly" } else { "temporary_or_unknown" }); WaitMinutes = $waitMinutes; RetryAt = $retryAt }
    }
    if ($message -match "(?i)temporarily\s+unavailable|connection\s+reset|\btimeout\b|\bHTTP\s+50[234]\b|try\s+again") {
        return [pscustomobject]@{ Kind = "TRANSIENT_ERROR"; Type = "transient"; WaitMinutes = 1; RetryAt = $null }
    }
    return [pscustomobject]@{ Kind = "FAIL"; Type = $null; WaitMinutes = 0; RetryAt = $null }
}

function Get-AgenticGoalMetadata {
    param([Parameter(Mandatory = $true)][string]$Path)

    $content = [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
    $metadata = @{}
    foreach ($key in @("ID", "Title", "Base branch", "Branch prefix", "Allowed files")) {
        $pattern = "(?im)^\s*(?:-\s*)?(?:\*\*)?" + [regex]::Escape($key) + "(?:\*\*)?\s*:\s*(.+?)\s*$"
        $match = [regex]::Match($content, $pattern)
        if ($match.Success) {
            $metadata[$key] = $match.Groups[1].Value.Trim()
        }
    }
    foreach ($key in @("ID", "Title", "Base branch", "Branch prefix")) {
        if (-not $metadata.ContainsKey($key)) {
            throw "O goal nao declara o campo obrigatorio '$key'."
        }
    }
    return $metadata
}
