[CmdletBinding()]
param([string]$Intake = "agentic/state/intake.md")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")
$goalText = $null
$goalPath = $null
$intakePath = Join-Path $script:AgenticRepoRoot "agentic/state/intake.md"

try {
    $intakePath = [IO.Path]::GetFullPath((Join-Path $script:AgenticRepoRoot $Intake))
    $expectedIntake = [IO.Path]::GetFullPath((Join-Path $script:AgenticRepoRoot "agentic/state/intake.md"))
    if (-not [string]::Equals($intakePath, $expectedIntake, [StringComparison]::OrdinalIgnoreCase)) { throw "Somente o intake controlado agentic/state/intake.md é aceito." }
    Assert-AgenticNoReparsePoints -Path $intakePath -RequireLeaf | Out-Null
    $metadata = Assert-AgenticIntake -Path $intakePath
    $goalText = [IO.File]::ReadAllText($intakePath, [Text.UTF8Encoding]::new($false))
    $checkpoint = Get-AgenticState
    if ($checkpoint.state -ne "IDLE") { throw "Já existe um goal ativo; intake novo não será iniciado." }
    $goalPath = Join-Path $script:AgenticRepoRoot ("agentic/goals/{0}.md" -f $metadata["ID"])
    Assert-AgenticNoReparsePoints -Path $goalPath | Out-Null
    if (Test-Path -LiteralPath $goalPath) { throw "Goal de destino já existe; intake não será materializado." }

    $status = @(Invoke-AgenticGit -GitArguments @("status", "--porcelain", "--untracked-files=all"))
    Assert-AgenticBootstrapStatus -StatusLines $status | Out-Null
    Remove-Item -LiteralPath $intakePath -Force
    $changes = @(Invoke-AgenticGit -GitArguments @("status", "--porcelain", "--untracked-files=all"))
    if (-not [string]::IsNullOrWhiteSpace(($changes -join ""))) { throw "Bootstrap bloqueado: a árvore deve estar limpa depois de remover o intake." }
    $branch = Start-GoalBranch -Metadata $metadata
    $checkedOutBranch = ([string](@(Invoke-AgenticGit -GitArguments @("branch", "--show-current"))[0])).Trim()
    $materializedGoal = Write-AgenticPreparedGoal -Path $goalPath -Text $goalText -Metadata $metadata -CurrentBranch $checkedOutBranch
    $bootstrapGoalSha256 = [string]$materializedGoal.Sha256
    Write-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID']) -Sha256 $bootstrapGoalSha256 | Out-Null
    $engine = if (Test-Path -LiteralPath (Join-Path $PSHOME "pwsh.exe")) { Join-Path $PSHOME "pwsh.exe" } else { Join-Path $PSHOME "powershell.exe" }
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
        $startInfo.FileName = $engine
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
    if ($null -ne $goalText -and -not (Test-Path -LiteralPath $intakePath) -and -not (Test-Path -LiteralPath $goalPath)) {
        [IO.File]::WriteAllText($intakePath, $goalText, [Text.UTF8Encoding]::new($false))
    }
    Write-Error $_.Exception.Message
    exit 1
}
