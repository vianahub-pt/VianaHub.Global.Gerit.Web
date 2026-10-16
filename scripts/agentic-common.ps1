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

    $raw = Get-Content -LiteralPath $script:AgenticStatePath -Raw
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

    Add-Content -LiteralPath $script:AgenticJournalPath -Value $event -Encoding utf8
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

    $content = Get-Content -LiteralPath $Path -Raw
    $metadata = @{}
    foreach ($key in @("ID", "Title", "Base branch", "Branch prefix")) {
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
