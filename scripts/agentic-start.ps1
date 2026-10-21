[CmdletBinding()]
param([string]$Intake = "agentic/state/intake.md")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")
$preferredEngine = Resolve-AgenticPowerShellEngine
if ($preferredEngine.Edition -eq 'Core' -and $PSVersionTable.PSEdition -ne 'Core') {
    & $preferredEngine.Path -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Intake $Intake
    exit $LASTEXITCODE
}
$goalText = $null
$goalPath = $null
$metadata = $null
$checkpoint = $null
$intakePath = Join-Path $script:AgenticRepoRoot "agentic/state/intake.md"

try {
    $intakePath = [IO.Path]::GetFullPath((Join-Path $script:AgenticRepoRoot $Intake))
    $expectedIntake = [IO.Path]::GetFullPath((Join-Path $script:AgenticRepoRoot "agentic/state/intake.md"))
    if (-not [string]::Equals($intakePath, $expectedIntake, [StringComparison]::OrdinalIgnoreCase)) { throw "Somente o intake controlado agentic/state/intake.md é aceito." }
    Assert-AgenticNoReparsePoints -Path $intakePath -RequireLeaf | Out-Null
    $goalText = Read-AgenticTextSafely -Path $intakePath -BasePath $script:AgenticRepoRoot
    $metadata = Assert-AgenticIntake -Path $intakePath -Content $goalText
    $checkpoint = Get-AgenticState
    if ($checkpoint.state -notin @("IDLE", "FAILED", "WAITING_HUMAN_MERGE")) { throw "Já existe um goal ativo; intake novo não será iniciado." }
    $goalPath = Join-Path $script:AgenticRepoRoot ("agentic/goals/{0}.md" -f $metadata["ID"])
    Assert-AgenticNoReparsePoints -Path $goalPath | Out-Null
    if (Test-Path -LiteralPath $goalPath) { throw "Goal de destino já existe; intake não será materializado." }

    $status = @(Invoke-AgenticGit -GitArguments @("status", "--porcelain", "--untracked-files=all"))
    Assert-AgenticBootstrapStatus -StatusLines $status | Out-Null
    Remove-Item -LiteralPath $intakePath -Force
    $changes = @(Invoke-AgenticGit -GitArguments @("status", "--porcelain", "--untracked-files=all"))
    Assert-AgenticBootstrapStatus -StatusLines $changes -AllowMissingIntake | Out-Null
    $branch = Start-GoalBranch -Metadata $metadata
    # Switching to origin/<base> may replace tracked control-plane files. Re-read
    # the checkpoint from the checked-out tree so archive eligibility and identity
    # correspond to the state that will be replaced, not the pre-fetch checkout.
    $checkpoint = Get-AgenticState
    if ($checkpoint.state -notin @("IDLE", "FAILED", "WAITING_HUMAN_MERGE")) { throw "A branch checkout exposed an active goal checkpoint; bootstrap will not replace it." }
    $checkedOutBranch = ([string](@(Invoke-AgenticGit -GitArguments @("branch", "--show-current"))[0])).Trim()
    $materializedGoal = Write-AgenticPreparedGoal -Path $goalPath -Text $goalText -Metadata $metadata -CurrentBranch $checkedOutBranch
    $bootstrapGoalSha256 = [string]$materializedGoal.Sha256
    Write-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID']) -Sha256 $bootstrapGoalSha256 | Out-Null
    $engine = Resolve-AgenticPowerShellEngine
    $preparedState = Get-AgenticStateTemplate
    $preparedState.goal_id = [string]$metadata['ID']
    $preparedState.goal_file = Get-AgenticRelativePath -BasePath $script:AgenticRepoRoot -TargetPath $goalPath
    $preparedState.bootstrap_goal_sha256 = $bootstrapGoalSha256
    $preparedState.branch = $branch
    $preparedState.base_branch = [string]$metadata['Base branch']
    $preparedState.started_at = [DateTime]::UtcNow.ToString('o')
    $preparedState.state = 'DISCOVERY'
    $preparedState.pending_phase = 'DISCOVERY'
    $preparedState.pending_action = 'Start prepared goal with architect discovery'
    $preparedState.supervisor_runtime = [pscustomobject]@{ edition = $engine.Edition; version = $engine.Version; path = [IO.Path]::GetFileName($engine.Path) }
    $preparedState = Initialize-AgenticNewGoalCheckpoint -PreviousState $checkpoint -NextState $preparedState -Metadata $metadata -Branch $branch -Sha256 $bootstrapGoalSha256
    Add-AgenticJournalEvent -Goal $preparedState.goal_id -State 'DISCOVERY' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Materializar goal bootstrap autenticado' -FilesChanged @([string]$preparedState.goal_file) -Gate ("bootstrap_goal_sha256={0}" -f $bootstrapGoalSha256) -Result 'PASS'
    $preparedState = Get-AgenticState
    Assert-AgenticPreparedCheckpoint -State $preparedState -Metadata $metadata -Branch $branch -Sha256 $bootstrapGoalSha256 | Out-Null
    Assert-AgenticJournalMatchesState -State $preparedState | Out-Null
    Assert-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID']) -ExpectedSha256 $bootstrapGoalSha256 | Out-Null
    $pipeName = "gerit-agentic-{0}" -f [guid]::NewGuid().ToString("N")
    $tokenBytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($tokenBytes) } finally { $random.Dispose() }
    $handoffToken = [BitConverter]::ToString($tokenBytes).Replace("-", "").ToLowerInvariant()
    $pipeSecurity = New-Object System.IO.Pipes.PipeSecurity
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $pipeRule = New-Object System.IO.Pipes.PipeAccessRule($currentSid, [System.IO.Pipes.PipeAccessRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
    $pipeSecurity.AddAccessRule($pipeRule)
    $pipeOptions = [IO.Pipes.PipeOptions]::Asynchronous
    if ($PSVersionTable.PSEdition -eq "Core") {
        $pipe = [IO.Pipes.NamedPipeServerStreamAcl]::Create($pipeName, [IO.Pipes.PipeDirection]::Out, 1, [IO.Pipes.PipeTransmissionMode]::Byte, $pipeOptions, 4096, 4096, $pipeSecurity)
    }
    else {
        $pipe = [IO.Pipes.NamedPipeServerStream]::new($pipeName, [IO.Pipes.PipeDirection]::Out, 1, [IO.Pipes.PipeTransmissionMode]::Byte, $pipeOptions, 4096, 4096, $pipeSecurity)
    }
    try {
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $engine.Path
        $quotedLoop = '"{0}"' -f ((Join-Path $PSScriptRoot "agentic-loop.ps1").Replace('"', '\"'))
        $quotedGoal = '"{0}"' -f ($goalPath.Replace('"', '\"'))
        $startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File $quotedLoop -Goal $quotedGoal -PreparedBranch"
        $startInfo.UseShellExecute = $false
        $startInfo.EnvironmentVariables["GERIT_AGENTIC_HANDOFF_PIPE"] = $pipeName
        $startInfo.EnvironmentVariables["GERIT_AGENTIC_HANDOFF_TOKEN"] = $handoffToken
        $process = [Diagnostics.Process]::Start($startInfo)
        $connectionWait = $pipe.BeginWaitForConnection($null, $null)
        if (-not $connectionWait.AsyncWaitHandle.WaitOne(15000)) { throw "Handoff preparado expirou antes de iniciar o loop." }
        $pipe.EndWaitForConnection($connectionWait)
        if (-not ("GeritAgenticPipeNative" -as [type])) {
            Add-Type -TypeDefinition @"
using System;
using System.IO.Pipes;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
public static class GeritAgenticPipeNative {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint clientProcessId);
}
"@
        }
        [uint32]$clientPid = 0
        if (-not [GeritAgenticPipeNative]::GetNamedPipeClientProcessId($pipe.SafePipeHandle, [ref]$clientPid) -or $clientPid -ne [uint32]$process.Id) { throw "Handoff bloqueado: cliente do pipe não corresponde ao processo do loop iniciado." }
        $writer = [IO.StreamWriter]::new($pipe, [Text.UTF8Encoding]::new($false), 1024, $true)
        $writer.WriteLine("prepared|$($metadata['ID'])|$branch|agentic/goals/$($metadata['ID']).md|$bootstrapGoalSha256|$handoffToken")
        $writer.Flush()
        $writer.Dispose()
        $process.WaitForExit()
        exit $process.ExitCode
    }
    finally { $pipe.Dispose() }
}
catch {
    $errorRecord = $_
    if ($null -ne $goalText -and -not (Test-Path -LiteralPath $intakePath) -and ($null -eq $goalPath -or -not (Test-Path -LiteralPath $goalPath))) {
        $intakeBytes = [Text.UTF8Encoding]::new($false).GetBytes($goalText)
        Write-AgenticBytesSafely -Path $intakePath -Bytes $intakeBytes -BasePath $script:AgenticRepoRoot
    }
    try {
        $active = Get-AgenticState
        if ($null -ne $metadata -and [string]$active.goal_id -ceq [string]$metadata['ID'] -and [string]$active.state -notin @('FAILED', 'WAITING_HUMAN_MERGE', 'IDLE')) {
            $errorScript = $PSCommandPath; $errorFunction = 'agentic bootstrap'; $errorLine = 0
            if ($null -ne $errorRecord.InvocationInfo) {
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptName'] -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.ScriptName)) { $errorScript = [string]$errorRecord.InvocationInfo.ScriptName }
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['MyCommand'] -and $null -ne $errorRecord.InvocationInfo.MyCommand -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.MyCommand.Name)) { $errorFunction = [string]$errorRecord.InvocationInfo.MyCommand.Name }
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptLineNumber']) { $errorLine = [int]$errorRecord.InvocationInfo.ScriptLineNumber }
            }
            $diagnostic = New-AgenticFailureDiagnostic -Category 'bootstrap' -Message $errorRecord.Exception.Message -Operation ([string]$active.pending_action) -ScriptPath $errorScript -FunctionName $errorFunction -Line $errorLine -StateBefore ([string]$active.state) -Phase ([string]$active.pending_phase) -Retryable $false
            $failed = New-AgenticFailedCheckpoint -State $active -Reason $diagnostic.message -Diagnostic $diagnostic
            Write-AgenticState -State $failed
            Assert-AgenticJournalMatchesState -State $failed | Out-Null
            Add-AgenticJournalEvent -Goal $failed.goal_id -State 'FAILED' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Persist bootstrap failure diagnostic' -Result 'FAILED' -Failure $diagnostic.message -Diagnostic $diagnostic
            Save-AgenticTerminalJournal -State $failed | Out-Null
        }
    }
    catch { Write-Warning ("Falha ao persistir diagnóstico de bootstrap: " + (ConvertTo-AgenticSanitizedText -Text $_.Exception.Message)) }
    Write-Error (ConvertTo-AgenticSanitizedText -Text $errorRecord.Exception.Message)
    exit 1
}
