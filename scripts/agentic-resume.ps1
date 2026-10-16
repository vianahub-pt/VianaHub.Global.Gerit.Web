[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

try {
    $state = Get-AgenticState
    if ([string]::IsNullOrWhiteSpace([string]$state.goal_file)) { throw "State nao contem goal para retomada." }
    $goalPath = Join-Path $script:AgenticRepoRoot ([string]$state.goal_file)
    if (-not (Test-Path -LiteralPath $goalPath -PathType Leaf)) { throw "Arquivo do goal do checkpoint nao existe." }
    if (-not (Test-Path -LiteralPath $script:AgenticJournalPath -PathType Leaf)) { throw "Journal do checkpoint nao existe." }
    $currentBranch = (& git -C $script:AgenticRepoRoot branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $state.branch) { throw "Branch atual nao corresponde ao checkpoint; nenhum arquivo foi alterado." }
    $localChanges = @(& git -C $script:AgenticRepoRoot status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel validar git status do checkpoint." }
    if ($state.state -in @("IDLE", "WAITING_HUMAN_MERGE", "FAILED")) { throw "Estado '$($state.state)' nao esta aguardando retomada." }
    if ($state.state -eq "WAITING_FOR_QUOTA") {
        $resumeAt = if ($state.resume_after) {
            [DateTime]::Parse([string]$state.resume_after).ToUniversalTime()
        }
        else {
            $waitMinutes = if ($state.quota_type -eq "weekly") { 360 } else { 15 }
            [DateTime]::UtcNow.AddMinutes($waitMinutes)
        }
        $remaining = [int][Math]::Ceiling(($resumeAt - [DateTime]::UtcNow).TotalSeconds)
        if ($remaining -gt 0) {
            Write-Output "Aguardando ate $($resumeAt.ToString('u')) antes de uma unica tentativa."
            Start-Sleep -Seconds $remaining
        }
    }

    $state.state = "RESUMING"
    $state.pending_action = "Validar checkpoint e continuar do goal/journal atuais"
    $state.active_agent = "orchestrator"
    $state.last_successful_step = "Checkpoint, branch e git status validados; alteracoes locais preservadas: $($localChanges.Count)"
    Write-AgenticState -State $state
    Add-AgenticJournalEvent -Goal ([string]$state.goal_id) -State "RESUMING" -Agent "orchestrator" -Action "Retomada manual/local do checkpoint" -Result "PENDING" -Quota ([string]$state.quota_type) -Memory ([string]$state.memory_status)
    & (Join-Path $PSScriptRoot "agentic-loop.ps1") -Goal $goalPath -Resume
    exit $LASTEXITCODE
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
