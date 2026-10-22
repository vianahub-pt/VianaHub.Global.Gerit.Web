[CmdletBinding()]
param(
    [string]$RequestId,
    [string]$ResumeRequestId,
    [switch]$RoleWorker,
    [string]$InvocationId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

function Invoke-Assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Set-FailedState {
    param($State, [string]$Reason, $Diagnostic)
    if ($null -eq $Diagnostic) {
        $errorRecord = $script:AgenticLastErrorRecord
        if ($null -ne $errorRecord) {
            $invocation = $errorRecord.InvocationInfo
            $Diagnostic = New-AgenticFailureDiagnostic -Category 'supervisor' -Message $errorRecord.Exception.Message -Operation ([string]$State.pending_action) -ScriptPath $invocation.ScriptName -FunctionName $invocation.FunctionName -Line $invocation.ScriptLineNumber -StateBefore ([string]$State.state) -Phase ([string]$State.pending_phase) -Retryable $false
        }
        else { $Diagnostic = New-AgenticFailureDiagnostic -Category 'workflow' -Message $Reason -Operation ([string]$State.pending_action) -StateBefore ([string]$State.state) -Phase ([string]$State.pending_phase) -Retryable $false }
    }
    $State.failure_diagnostic = $Diagnostic
    $failed = New-AgenticFailedCheckpoint -State $State -Reason ([string]$Diagnostic.message) -Diagnostic $Diagnostic
    Write-AgenticState -State $failed
    Add-AgenticJournalEvent -Goal ([string]$failed.goal_id) -State "FAILED" -Agent "supervisor" -Controller "supervisor" -Actor "supervisor" -Action "Encerrar com diagnóstico estruturado" -Result "FAILED" -Gate ([string]$failed.last_gate) -Failure ([string]$Diagnostic.message) -Quota ([string]$failed.quota_state) -Memory ([string]$failed.memory_status) -Diagnostic $Diagnostic
    Save-AgenticTerminalJournal -State $failed | Out-Null
}

function Add-AgenticRoleInvocationEvidence {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)]$Invocation, [Parameter(Mandatory = $true)][hashtable]$Metadata)
    $result = $Invocation.Result
    if ($Invocation.ExitCode -ne 0 -or $null -eq $result) {
        $failureRecord = [pscustomobject]@{
            role = [string]$Invocation.Role; goal_id = [string]$State.goal_id; invocation_id = [string]$Invocation.InvocationId
            phase = [string]$Invocation.Phase; snapshot_sha256 = [string]$State.execution_snapshot_sha256
            command_fingerprint = [string]$Invocation.CommandFingerprint; result_artifact_path = $Invocation.ArtifactPath
            result_artifact_sha256 = $Invocation.ArtifactSha256; exit_code = [int]$Invocation.ExitCode
            failure_reason = if ([string]::IsNullOrWhiteSpace([string]$Invocation.ValidationError)) { 'n/a' } else { ConvertTo-AgenticSanitizedText -Text ([string]$Invocation.ValidationError) }
            status = if ($Invocation.ExitCode -ne 0) { 'PROCESS_FAIL' } else { 'INVALID_RESULT' }
            timestamp = [DateTimeOffset]::UtcNow.ToString('o')
        }
        $State.role_invocations = @(@($State.role_invocations) + $failureRecord)
        return
    }
    if ([string]$result.goal_id -cne [string]$State.goal_id -or [string]$result.invocation_id -cne [string]$Invocation.InvocationId -or [string]$result.snapshot_sha256 -cne [string]$State.execution_snapshot_sha256) { throw 'Resultado de role não corresponde ao goal/invocation/snapshot ativo.' }
    if ($Invocation.Role -eq 'implementer') {
        $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
        foreach ($path in @($result.files_changed)) {
            $normalized = ([string]$path).Replace('\', '/')
            if ($allowed -cnotcontains $normalized) { throw "Implementer declarou arquivo fora da allowlist: $normalized" }
        }
    }
    $canonicalArtifactPath = 'agentic/state/results/{0}/{1}.json' -f [string]$State.goal_id, [string]$Invocation.InvocationId
    $canonicalArtifactFullPath = Join-Path $script:AgenticRepoRoot $canonicalArtifactPath
    if (-not (Test-Path -LiteralPath $canonicalArtifactFullPath -PathType Leaf)) { throw ("Artifact da role não foi encontrado no caminho canônico do supervisor. {0}" -f [string]$Invocation.ValidationError) }
    $canonicalArtifactSha256 = Get-AgenticFileSha256 -Path $canonicalArtifactFullPath
    $provenance = [pscustomobject]@{
        role = [string]$Invocation.Role; goal_id = [string]$State.goal_id; invocation_id = [string]$Invocation.InvocationId
        phase = [string]$Invocation.Phase; snapshot_sha256 = [string]$State.execution_snapshot_sha256
        command_fingerprint = [string]$Invocation.CommandFingerprint; result_artifact_path = $canonicalArtifactPath
        result_artifact_sha256 = $canonicalArtifactSha256; exit_code = [int]$Invocation.ExitCode
        status = [string]$result.status; timestamp = [DateTimeOffset]::UtcNow.ToString('o')
    }
    $State.role_invocations = @(@($State.role_invocations) + $provenance)
    if ($Invocation.Role -eq 'security') {
        $State.security_review_status = [string]$result.status
        $State.security_invocation_id = [string]$Invocation.InvocationId
        Set-AgenticGateResult -State $State -Name 'security_review' -Status ([string]$result.status) -Command 'codex exec role security' -ExitCode $Invocation.ExitCode -Reason 'Resultado da invocation de security validado pelo supervisor.' -Classification ([string]$State.change_classification) -StartedAt $Invocation.StartedAt -FinishedAt $Invocation.FinishedAt -DurationMs $Invocation.DurationMs -EvidenceSummary ("{0}; sha256={1}" -f $canonicalArtifactPath, $canonicalArtifactSha256) | Out-Null
    }
    elseif ($Invocation.Role -eq 'reviewer') {
        $State.code_review_status = [string]$result.status
        $State.reviewer_invocation_id = [string]$Invocation.InvocationId
        Set-AgenticGateResult -State $State -Name 'reviewer_review' -Status ([string]$result.status) -Command 'codex exec role reviewer' -ExitCode $Invocation.ExitCode -Reason 'Resultado da invocation de reviewer validado pelo supervisor.' -Classification ([string]$State.change_classification) -StartedAt $Invocation.StartedAt -FinishedAt $Invocation.FinishedAt -DurationMs $Invocation.DurationMs -EvidenceSummary ("{0}; sha256={1}" -f $canonicalArtifactPath, $canonicalArtifactSha256) | Out-Null
    }
    elseif ($Invocation.Role -eq 'tester' -and $Invocation.Phase -eq 'TESTING_EVALUATE') { $State.tester_status = [string]$result.status }
}

function ConvertTo-AgenticSanitizedArtifactValue {
    param([AllowNull()]$Value)
    if ($null -eq $Value -or $Value -is [bool] -or $Value -is [ValueType]) { return $Value }
    if ($Value -is [string]) { return (ConvertTo-AgenticSanitizedText -Text $Value) }
    if ($Value -is [System.Collections.IDictionary]) {
        $map = [ordered]@{}
        foreach ($key in $Value.Keys) { $map[[string]$key] = ConvertTo-AgenticSanitizedArtifactValue -Value $Value[$key] }
        return $map
    }
    if ($Value -is [System.Collections.IEnumerable]) { return @($Value | ForEach-Object { ConvertTo-AgenticSanitizedArtifactValue -Value $_ }) }
    $properties = @($Value.PSObject.Properties)
    if ($null -ne $Value.PSObject -and $properties.Length -gt 0) {
        $map = [ordered]@{}
        foreach ($property in $properties) { $map[$property.Name] = ConvertTo-AgenticSanitizedArtifactValue -Value $property.Value }
        return $map
    }
    return (ConvertTo-AgenticSanitizedText -Text ([string]$Value))
}

function Write-AgenticRoleResultArtifact {
    param([Parameter(Mandatory = $true)]$Result, [Parameter(Mandatory = $true)][string]$InvocationId)
    $safeResult = ConvertTo-AgenticSanitizedArtifactValue -Value $Result
    if ([string]$safeResult.goal_id -notmatch '^[a-z][a-z0-9-]{2,63}$' -or $InvocationId -cnotmatch '^[0-9a-f]{32}$') { throw 'Role result artifact identity is not canonical.' }
    $relativePath = 'agentic/state/results/{0}/{1}.json' -f [string]$safeResult.goal_id, $InvocationId
    $fullPath = Join-Path $script:AgenticRepoRoot $relativePath
    [IO.Directory]::CreateDirectory((Split-Path -Parent $fullPath)) | Out-Null
    $json = $safeResult | ConvertTo-Json -Depth 10
    $artifactBytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $existingBytes = Read-AgenticBytesSafely -Path $fullPath
        if ((Get-AgenticBytesSha256 -Bytes $existingBytes) -cne (Get-AgenticBytesSha256 -Bytes $artifactBytes)) { throw 'Role result artifact already exists with different immutable content.' }
    }
    else { Write-AgenticBytesSafely -Path $fullPath -Bytes $artifactBytes }
    return [pscustomobject]@{ Path = $relativePath; Sha256 = Get-AgenticFileSha256 -Path $fullPath }
}

function Set-SupervisorBlockedState {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)]$Failure, [Parameter(Mandatory = $true)][string]$Phase)
    $State.failure_diagnostic = New-AgenticFailureDiagnostic -Category ([string]$Failure.category) -Message ([string]$Failure.message) -Operation ([string]$Failure.operation) -StateBefore ([string]$State.state) -Phase $Phase -Retryable ([bool]$Failure.retryable)
    $State.pending_action = [string]$State.failure_diagnostic.operation
    Write-AgenticState -State $State
    Add-AgenticJournalEvent -Goal $State.goal_id -State $State.state -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Persistir bloqueio estruturado sem terminalizar' -Failure ([string]$State.failure_diagnostic.message) -Diagnostic $State.failure_diagnostic -Result 'BLOCKED' -Memory $State.memory_status
}

function Get-AgenticWorkingTreePaths {
    $lines = @(Invoke-Git -GitArguments @("status", "--porcelain=v1", "--untracked-files=all"))
    $paths = @()
    foreach ($line in $lines) {
        $entry = [string]$line
        if ($entry.Length -lt 4) { throw "Git status retornou uma entrada invalida." }
        if ($entry.Substring(0, 2) -match "[RC]") { throw "Renames/copies nao sao aceitos no stage agentic automatico." }
        $path = $entry.Substring(3).Replace('\', '/')
        if ($path.StartsWith('"') -or $path.Contains(" -> ")) { throw "Git status retornou caminho que requer revisao manual." }
        $paths += $path
    }
    return $paths
}

function Invoke-CodexAgentRole {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$GoalPath, [Parameter(Mandatory = $true)][string]$Role, [Parameter(Mandatory = $true)][string]$Phase, [Parameter(Mandatory = $true)][string]$InvocationId, [string]$Mode = 'execution', [string]$ExecutionRoot = $script:AgenticRepoRoot, [string]$AdditionalContext = '')
    if([int]$State.agent_calls -gt [int]$State.max_agent_calls){throw 'Agent invocation hard limit reached before role launch.'}
    $configPath = Join-Path $script:AgenticRepoRoot ('.codex/agents/{0}.toml' -f $Role)
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "Role config não encontrada: $Role." }
    $roleConfig = [IO.File]::ReadAllText($configPath, [Text.UTF8Encoding]::new($false))
    $nameMatch = [regex]::Match($roleConfig, '(?m)^name\s*=\s*"(?<value>[^"]+)"\s*$')
    $modelMatch = [regex]::Match($roleConfig, '(?m)^model\s*=\s*"(?<value>[^"]+)"\s*$')
    $instructionMatch = [regex]::Match($roleConfig, '(?s)developer_instructions\s*=\s*"""(?<value>.*?)"""')
    if (-not $nameMatch.Success -or $nameMatch.Groups['value'].Value -cne $Role -or -not $modelMatch.Success -or -not $instructionMatch.Success) { throw "Role config inválida: $Role." }
    $codexCommand = Get-Command codex -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -in @('Application', 'ExternalScript') } | Select-Object -First 1
    if ($null -eq $codexCommand) { throw 'Codex CLI não encontrado no PATH.' }
    $readOnly = $Role -in @('orchestrator', 'architect', 'tester', 'security', 'reviewer')
    $sandbox = if ($readOnly) { 'read-only' } else { 'workspace-write' }
    $sharedPromptPath = Join-Path $script:AgenticRepoRoot 'agentic/prompts/autonomous-loop.md'
    $sharedPrompt = [IO.File]::ReadAllText($sharedPromptPath, [Text.UTF8Encoding]::new($false))
$roleContract = @"
Você é a role $Role no modo $Mode, invocada pelo Supervisor Host em um processo Codex independente. Não delegue nem declare resultados de outras roles. Não altere state/journal/specification canônicos nem execute Git mutável. Siga este contrato de role:
$($instructionMatch.Groups['value'].Value.Trim())

Retorne somente JSON válido com schema_version=1, goal_id, role, invocation_id, phase, snapshot_sha256, status, summary, findings, evidence, failure e files_changed. Modos Architect, Tester e Orchestrator podem incluir somente o campo extra definido no contrato da role. Use exatamente as identidades abaixo. Roles read-only retornam files_changed=[]. Orchestrator emite apenas decisão de workflow, nunca aprovação de outra role. O supervisor executa e registra os quality gates oficiais.

Supervisor context:
request_id=$($State.request_id)
request_envelope_path=$($State.request_envelope_path)
request_envelope_sha256=$($State.request_envelope_sha256)
execution_id=$($State.goal_id)
branch=$($State.branch)
base_branch=$($State.base_branch)
base_sha=$($State.base_sha)
phase=$Phase
mode=$Mode
invocation_id=$InvocationId
snapshot_sha256=$($State.execution_snapshot_sha256)
specification_path=$($State.specification_path)
specification_version=$($State.specification_version)
"@
    $prompt = $sharedPrompt + "`n`n" + $roleContract + "`n`n" + $AdditionalContext
    if ($Role -eq 'tester') {
        $gateJson = @($State.gate_results | ConvertTo-Json -Depth 8)
        $brokerJson = @($State.brokered_test_results | ConvertTo-Json -Depth 8)
        $prompt += "`nHost quality gate evidence (read-only input):`n$($gateJson -join "`n")`nBrokered test evidence:`n$($brokerJson -join "`n")"
    }
    $responsePath = Join-Path ([IO.Path]::GetTempPath()) ('gerit-agentic-result-{0}.json' -f [guid]::NewGuid().ToString('N'))
    $fingerprintInput = @($Role, $Phase, [string]$State.goal_id, $InvocationId, [string]$State.execution_snapshot_sha256, [string]$modelMatch.Groups['value'].Value, (Get-AgenticTextSha256 -Text $prompt)) -join "`n"
    $fingerprint = Get-AgenticTextSha256 -Text $fingerprintInput
    $args = @('exec', '--json', '--sandbox', $sandbox, '--cd', $ExecutionRoot, '--model', $modelMatch.Groups['value'].Value, '--output-last-message', $responsePath, $prompt)
    $controlSnapshot = Get-AgenticControlPlaneSnapshot
    $startedAt = [DateTimeOffset]::UtcNow
    try {
        $processResult = Invoke-AgenticNativeProcess -FilePath $codexCommand.Source -Arguments $args -CaptureStandardError
        $finishedAt = [DateTimeOffset]::UtcNow
        $combinedOutput = @($processResult.Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        Assert-AgenticControlPlaneUnchanged -Snapshot $controlSnapshot | Out-Null
        $lastMessage = if (Test-Path -LiteralPath $responsePath -PathType Leaf) { [IO.File]::ReadAllText($responsePath, [Text.UTF8Encoding]::new($false)) } else { '' }
        $result = $null
        $artifact = $null
        $validationError = $null
        if ($processResult.ExitCode -eq 0) {
            try {
                $result = ConvertFrom-AgenticRoleResult -Json $lastMessage -State $State -ExpectedRole $Role -InvocationId $InvocationId -ExpectedPhase $Phase -SnapshotSha256 ([string]$State.execution_snapshot_sha256)
                $artifact = Write-AgenticRoleResultArtifact -Result $result -InvocationId $InvocationId
            }
            catch {
                $failureContext = $_.Exception.Message
                if ($null -ne $_.InvocationInfo -and $null -ne $_.InvocationInfo.ScriptLineNumber) { $failureContext += (" at line {0}" -f [int]$_.InvocationInfo.ScriptLineNumber) }
                if (-not [string]::IsNullOrWhiteSpace([string]$_.ScriptStackTrace)) { $failureContext += ("; stack: " + [string]$_.ScriptStackTrace) }
                $validationError = ConvertTo-AgenticSanitizedText -Text $failureContext
                $result = $null; $artifact = $null
            }
        }
        $artifactPathValue = $null; $artifactShaValue = $null
        if ($null -ne $artifact) { $artifactPathValue = [string]$artifact.Path; $artifactShaValue = [string]$artifact.Sha256 }
        return [pscustomobject]@{
            Role = $Role; Phase = $Phase; InvocationId = $InvocationId; ExitCode = [int]$processResult.ExitCode
            Output = $combinedOutput; Result = $result; CommandFingerprint = $fingerprint
            StartedAt = $startedAt.ToString('o'); FinishedAt = $finishedAt.ToString('o')
            DurationMs = [Math]::Round(($finishedAt - $startedAt).TotalMilliseconds, 0)
            ArtifactPath = $artifactPathValue
            ArtifactSha256 = $artifactShaValue
            ValidationError = $validationError
            Model = [string]$modelMatch.Groups['value'].Value; Sandbox = $sandbox
        }
    }
    finally { if (Test-Path -LiteralPath $responsePath -PathType Leaf) { Remove-Item -LiteralPath $responsePath -Force -ErrorAction SilentlyContinue } }
}

. (Join-Path $PSScriptRoot 'agentic-vnext-lifecycle.ps1')
try {
    if ($RoleWorker) { throw 'Role worker mode is not enabled in the canonical Supervisor Host.' }
    $id = if ($RequestId) { $RequestId } else { $ResumeRequestId }
    if ([string]::IsNullOrWhiteSpace($id) -or ($RequestId -and $ResumeRequestId)) { throw 'Exactly one RequestId or ResumeRequestId is required.' }
    if ($ResumeRequestId) { Invoke-AgenticVNextLifecycle -RequestId $id -Resume | Out-Null }
    else { Invoke-AgenticVNextLifecycle -RequestId $id | Out-Null }
    exit 0
}
catch {
    try {
        $checkpoint = Get-AgenticState
        $safeError=ConvertTo-AgenticSanitizedText -Text $_.Exception.Message -MaximumLength 500
        $quota=Get-AgenticQuotaClassification -Text $safeError
        if ($quota.Kind -ceq 'QUOTA' -and (Test-AgenticTransition -From ([string]$checkpoint.state) -To 'WAITING_FOR_QUOTA')) {
            $checkpoint.quota_state='WAITING_FOR_QUOTA';$checkpoint.quota_type=[string]$quota.Type;$checkpoint.quota_detected_at=[DateTimeOffset]::UtcNow.ToString('o')
            $checkpoint.quota_reset_at=$quota.RetryAt;$checkpoint.resume_after=if($quota.RetryAt){$quota.RetryAt}else{[DateTimeOffset]::UtcNow.AddMinutes([int]$quota.WaitMinutes).ToString('o')}
            $checkpoint.last_failure=$safeError;$checkpoint.failure_diagnostic=New-AgenticFailureDiagnostic -Category 'quota' -Message 'Agent quota or rate limit reached.' -Operation ([string]$checkpoint.pending_action) -StateBefore ([string]$checkpoint.state) -Phase ([string]$checkpoint.pending_phase) -Retryable $true
            Set-AgenticSupervisorTransition -State $checkpoint -To 'WAITING_FOR_QUOTA' -PendingAction "Resume after $($checkpoint.resume_after)"|Out-Null
            $checkpoint.active_agent=$null;Write-AgenticState $checkpoint
            Add-AgenticJournalEvent -Goal $checkpoint.goal_id -State 'WAITING_FOR_QUOTA' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Preservar checkpoint após quota e aguardar janela de retomada' -Failure 'Agent quota or rate limit reached.' -Quota ([string]$checkpoint.quota_type) -Result 'WAITING_FOR_QUOTA'
        }
        elseif ($checkpoint.state -in @('TESTING','QUALITY_GATES','OBSERVABILITY_VERIFICATION','REQUIREMENT_VERIFICATION','SCOPE_DIFF_VERIFICATION')) {
            $checkpoint.last_failure=ConvertTo-AgenticSanitizedText -Text $_.Exception.Message
            Set-AgenticSupervisorTransition -State $checkpoint -To 'CORRECTING' -PendingAction 'A downstream quality/verification defect requires a full correction cycle'|Out-Null
            Reset-AgenticDownstreamApprovals -State $checkpoint|Out-Null
            Write-AgenticState $checkpoint
            Add-AgenticJournalEvent -Goal $checkpoint.goal_id -State 'CORRECTING' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Invalidate all downstream evidence and request implementer correction' -Failure $checkpoint.last_failure -Result 'RETRY'
        }
        elseif ($checkpoint.state -notin @('IDLE','ALREADY_SATISFIED','FAILED','WAITING_HUMAN_MERGE','BLOCKED','CORRECTING','WAITING_FOR_QUOTA')) {
            $diag = New-AgenticFailureDiagnostic -Category 'supervisor_lifecycle' -Message $_.Exception.Message -Operation ([string]$checkpoint.pending_action) -ScriptPath $PSCommandPath -FunctionName 'Invoke-AgenticVNextLifecycle' -Line $_.InvocationInfo.ScriptLineNumber -StateBefore ([string]$checkpoint.state) -Phase ([string]$checkpoint.pending_phase) -Retryable $false
            Set-FailedState -State $checkpoint -Reason $diag.message -Diagnostic $diag
        }
    } catch { Write-Warning 'Falha ao persistir diagnóstico sanitizado do ciclo.' }
    $failureLine=if($null -ne $_.InvocationInfo){[int]$_.InvocationInfo.ScriptLineNumber}else{0}
    Write-Error (ConvertTo-AgenticSanitizedText -Text ("$($_.Exception.Message) [line $failureLine]"))
    exit 1
}
