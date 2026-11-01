[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

$preferredEngine = Resolve-AgenticPowerShellEngine
if ($preferredEngine.Edition -eq 'Core' -and $PSVersionTable.PSEdition -ne 'Core') {
    & $preferredEngine.Path -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    exit $LASTEXITCODE
}

try {
    $state = Get-AgenticState
    Assert-AgenticResumeCheckpoint -State $state | Out-Null
    $goalPath = Join-Path $script:AgenticRepoRoot ([string]$state.goal_file)
    if (-not (Test-Path -LiteralPath $goalPath -PathType Leaf)) { throw "Arquivo do goal do checkpoint nao existe." }
    $metadata = Get-AgenticGoalMetadata -Path $goalPath
    if ([string]$metadata['ID'] -cne [string]$state.goal_id -or [string]$metadata['Base branch'] -cne [string]$state.base_branch) { throw 'Goal metadata diverge do checkpoint.' }
    Assert-AgenticJournalMatchesState -State $state | Out-Null
    $currentBranchOutput = @(Invoke-AgenticGit -GitArguments @("branch", "--show-current"))
    $currentBranch = if ($currentBranchOutput.Count -gt 0) { ([string]$currentBranchOutput[0]).Trim() } else { "" }
    if ($currentBranch -cne $state.branch) { throw "Branch atual nao corresponde ao checkpoint; nenhum arquivo foi alterado." }
    & (Join-Path $PSScriptRoot "agentic-loop.ps1") -Goal $goalPath -Resume
    exit $LASTEXITCODE
}
catch {
    $errorRecord = $_
    $scriptName = $PSCommandPath
    $functionName = 'agentic resume'
    $line = 0
    if ($null -ne $errorRecord.InvocationInfo) {
        if (-not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.ScriptName)) { $scriptName = [string]$errorRecord.InvocationInfo.ScriptName }
        if ($null -ne $errorRecord.InvocationInfo.MyCommand -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.MyCommand.Name)) { $functionName = [string]$errorRecord.InvocationInfo.MyCommand.Name }
        if ($null -ne $errorRecord.InvocationInfo.ScriptLineNumber) { $line = [int]$errorRecord.InvocationInfo.ScriptLineNumber }
    }
    try {
        $checkpoint = Get-AgenticState
        if ($checkpoint.state -notin @('IDLE', 'FAILED', 'WAITING_HUMAN_MERGE')) {
            $diagnostic = New-AgenticFailureDiagnostic -Category 'resume' -Message $errorRecord.Exception.Message -Operation 'resume existing checkpoint' -ScriptPath $scriptName -FunctionName $functionName -Line $line -StateBefore ([string]$checkpoint.state) -Phase ([string]$checkpoint.pending_phase) -Retryable $false
            $failedCheckpoint = New-AgenticFailedCheckpoint -State $checkpoint -Reason $diagnostic.message -Diagnostic $diagnostic
            Write-AgenticState -State $failedCheckpoint
        }
    }
    catch { Write-Warning ("Falha ao persistir checkpoint de erro: " + (ConvertTo-AgenticSanitizedText -Text $_.Exception.Message)) }
    Write-Error (ConvertTo-AgenticSanitizedText -Text $errorRecord.Exception.Message)
    exit 1
}
