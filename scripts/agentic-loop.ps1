[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Goal,
    [switch]$SmokeTest,
    [switch]$Resume,
    [switch]$PreparedBranch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

$preferredEngine = Resolve-AgenticPowerShellEngine
if ($preferredEngine.Edition -eq 'Core' -and $PSVersionTable.PSEdition -ne 'Core') {
    & $preferredEngine.Path -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @PSBoundParameters
    exit $LASTEXITCODE
}

function Invoke-Assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Invoke-SmokeTest {
    param([string]$GoalPath)

    $metadata = Get-AgenticGoalMetadata -Path $GoalPath
    $planPath = Join-Path $script:AgenticRepoRoot ("agentic/plans/{0}.md" -f $metadata["ID"])
    Invoke-Assert (Test-Path -LiteralPath $planPath -PathType Leaf) "O smoke test requer o plano local do goal."
    $fixtureResult = Invoke-AgenticSupervisorFixtures
    Invoke-Assert ($fixtureResult -like "PASS:*") "Fixtures do supervisor nao passaram."
    Write-Output "SMOKE_TEST: PASS"
    Write-Output "- fixtures determinísticos executados sem alterar state/journal do goal ativo"
}

function Invoke-Git {
    param([string[]]$GitArguments)
    return Invoke-AgenticGit -GitArguments $GitArguments
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
            $bootstrapPath = Get-AgenticAuthenticatedBootstrapPath -State $State
            if ($null -ne $bootstrapPath -and $normalized -ceq $bootstrapPath) { throw 'Implementer não pode alterar o bootstrap goal imutável.' }
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
        Set-AgenticGateResult -State $State -Name 'security_review' -Status ([string]$result.status) -Command 'codex exec role security' -ExitCode $Invocation.ExitCode -Reason 'Resultado da invocation de security validado pelo supervisor.' -Classification ([string]$State.change_classification) -StartedAt $Invocation.StartedAt -FinishedAt $Invocation.FinishedAt -DurationMs $Invocation.DurationMs -EvidenceSummary ("{0}; sha256={1}" -f $canonicalArtifactPath, $canonicalArtifactSha256) | Out-Null
    }
    elseif ($Invocation.Role -eq 'reviewer') {
        $State.code_review_status = [string]$result.status
        Set-AgenticGateResult -State $State -Name 'reviewer_review' -Status ([string]$result.status) -Command 'codex exec role reviewer' -ExitCode $Invocation.ExitCode -Reason 'Resultado da invocation de reviewer validado pelo supervisor.' -Classification ([string]$State.change_classification) -StartedAt $Invocation.StartedAt -FinishedAt $Invocation.FinishedAt -DurationMs $Invocation.DurationMs -EvidenceSummary ("{0}; sha256={1}" -f $canonicalArtifactPath, $canonicalArtifactSha256) | Out-Null
    }
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
    Write-AgenticBytesSafely -Path $fullPath -Bytes $artifactBytes
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

function Invoke-AgenticFinalization {
    param($State, [hashtable]$Metadata)

    $step = "validacao de prontidao"
    $script:AgenticLastNativeExitCode = $null
    try {
        $branchOutput = @(Invoke-Git -GitArguments @("branch", "--show-current"))
        $currentBranch = if ($branchOutput.Count -gt 0) { ([string]$branchOutput[0]).Trim() } else { "" }
        $allChangedPaths = @(Get-AgenticWorkingTreePaths)
        $goalPaths = @(Get-AgenticCommitPaths -ChangedPaths $allChangedPaths)
        if (-not [string]::IsNullOrWhiteSpace([string]$script:AgenticBootstrapGoalSha256)) { Assert-AgenticBootstrapAnchor -GoalId ([string]$State.goal_id) -ExpectedSha256 $script:AgenticBootstrapGoalSha256 | Out-Null }
        $currentClassification = Get-AgenticChangeClassification -Paths $goalPaths
        $currentSnapshot = @(Get-AgenticCommitSnapshot -Paths $goalPaths)
        $priorSnapshot = @($State.quality_gate_snapshot | Sort-Object path)
        $snapshotChanged = $priorSnapshot.Count -ne $currentSnapshot.Count
        if (-not $snapshotChanged) {
            for ($snapshotIndex = 0; $snapshotIndex -lt $currentSnapshot.Count; $snapshotIndex++) {
                if ([string]$priorSnapshot[$snapshotIndex].path -cne [string]$currentSnapshot[$snapshotIndex].path -or [string]$priorSnapshot[$snapshotIndex].sha256 -cne [string]$currentSnapshot[$snapshotIndex].sha256) { $snapshotChanged = $true; break }
            }
        }
        if ($currentClassification -cne [string]$State.change_classification -or $snapshotChanged) {
            $typecheck = Resolve-AgenticTypecheckCommand; $runtimeTests = Resolve-AgenticRuntimeTestsCommand
            $policy = Get-AgenticGatePolicy -Classification $currentClassification -TypecheckStatus $typecheck.Status -RuntimeTestsStatus $runtimeTests.Status -Paths $goalPaths
            $State.change_classification = $currentClassification; $State.required_gates = @($policy.Required); $State.skipped_gates = @($policy.Skipped)
            $State.gate_results = @(); $State.security_review_status = 'PENDING'; $State.code_review_status = 'PENDING'
            Set-AgenticSupervisorTransition -State $State -To 'TESTING' -PendingAction 'Commit paths or contents changed; rerun applicable gates and reviews' | Out-Null
            Write-AgenticState -State $State
            Add-AgenticJournalEvent -Goal $State.goal_id -State 'TESTING' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Invalidate readiness after precommit path/snapshot revalidation' -Result 'RETRY' -Gate $currentClassification
            return $false
        }
        Test-AgenticReadiness -State $State -Metadata $Metadata -CurrentBranch $currentBranch -ChangedPaths $allChangedPaths -BootstrapGoalSha256 $script:AgenticBootstrapGoalSha256 | Out-Null
        if (-not (Test-AgenticPushTarget -Branch $currentBranch)) { throw "Destino de push nao e uma branch de trabalho permitida." }

        $step = "validacao da base remota"
        $base = [string]$Metadata["Base branch"]
        if ($base -cnotin @("develop", "main")) { throw "Base de PR nao permitida." }
        $remoteOutput = @(Invoke-Git -GitArguments @("remote", "get-url", "origin"))
        $remoteUrl = if ($remoteOutput.Count -gt 0) { ([string]$remoteOutput[0]).Trim() } else { "" }
        $repoMatch = [regex]::Match($remoteUrl, '(?:github\.com[:/])(?<repo>[^/]+/[^/]+?)(?:\.git)?$')
        if (-not $repoMatch.Success) { throw "Remote origin nao identifica um repositorio GitHub verificavel." }
        $repository = $repoMatch.Groups["repo"].Value
        $baseCheck = Invoke-AgenticNativeProcess -FilePath "git" -Arguments @("-C", $script:AgenticRepoRoot, "merge-base", "--is-ancestor", "origin/$base", "HEAD")
        Assert-AgenticNativeProcessSucceeded -Result $baseCheck -CommandName "git merge-base"

        $step = "stage das alteracoes permitidas"
        if ($goalPaths.Count -eq 0) { throw "Nenhum arquivo do goal foi alterado; state/journal nao sao commitados." }
        Invoke-Git -GitArguments (@("add", "--") + $goalPaths) | Out-Null
        $stagedPaths = @(Invoke-Git -GitArguments @("diff", "--cached", "--name-only")) | ForEach-Object { ([string]$_).Replace('\', '/') }
        if (@($stagedPaths | Where-Object { $_ -notin $goalPaths }).Count -gt 0 -or @($goalPaths | Where-Object { $_ -notin $stagedPaths }).Count -gt 0) { throw "Stage contem path ausente ou fora do goal." }
        if (@($stagedPaths).Count -eq 0) { throw "Stage do goal ficou vazio." }

        $unstagedCheck = Invoke-AgenticNativeProcess -FilePath "git" -Arguments (@("-C", $script:AgenticRepoRoot, "diff", "--quiet", "--") + @($stagedPaths | ForEach-Object { ":(literal)$_" }))
        if ($unstagedCheck.ExitCode -ne 0) { throw "Working tree diverge do conteúdo staged; finalização bloqueada (exit code $($unstagedCheck.ExitCode))." }

        $stagedClassification = Get-AgenticChangeClassification -Paths $stagedPaths
        if ($stagedClassification -cne [string]$State.change_classification) {
            $State.change_classification = $stagedClassification
            $typecheck = Resolve-AgenticTypecheckCommand; $runtimeTests = Resolve-AgenticRuntimeTestsCommand
            $policy = Get-AgenticGatePolicy -Classification $stagedClassification -TypecheckStatus $typecheck.Status -RuntimeTestsStatus $runtimeTests.Status -Paths $stagedPaths
            $State.required_gates = @($policy.Required); $State.skipped_gates = @($policy.Skipped)
            $State.security_review_status = 'PENDING'
            $State.code_review_status = 'PENDING'
            $State.gate_results = @()
            Set-AgenticSupervisorTransition -State $State -To 'TESTING' -PendingAction 'Staged classification changed; rerun applicable gates and reviews' | Out-Null
            Write-AgenticState -State $State
            Add-AgenticJournalEvent -Goal $State.goal_id -State 'TESTING' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Invalidate readiness after staged classification change' -Result 'RETRY' -Gate $stagedClassification -Memory $State.memory_status
            return $false
        }

        $step = "git diff --cached --check"
        $stagedDiffCheck = Invoke-AgenticNativeProcess -FilePath "git" -Arguments @("-C", $script:AgenticRepoRoot, "diff", "--cached", "--check")
        Assert-AgenticNativeProcessSucceeded -Result $stagedDiffCheck -CommandName "git diff --cached --check"
        Set-AgenticGateResult -State $State -Name 'staged_diff_check' -Status 'PASS' -Command 'git diff --cached --check' -ExitCode 0 -Reason 'Diff staged validado imediatamente antes do commit.' | Out-Null
        Test-AgenticReadiness -State $State -Metadata $Metadata -CurrentBranch $currentBranch -ChangedPaths $stagedPaths -BootstrapGoalSha256 $script:AgenticBootstrapGoalSha256 | Out-Null

        $step = "git commit"
        $commitMessage = [string]$Metadata["Title"]
        $commitResult = Invoke-AgenticNativeProcess -FilePath "git" -Arguments @("-C", $script:AgenticRepoRoot, "commit", "-m", $commitMessage) -CaptureStandardError
        Assert-AgenticNativeProcessSucceeded -Result $commitResult -CommandName "git commit"
        $shaOutput = @(Invoke-Git -GitArguments @("rev-parse", "HEAD"))
        $State.commit_sha = if ($shaOutput.Count -gt 0) { ([string]$shaOutput[0]).Trim() } else { $null }
        if ([string]::IsNullOrWhiteSpace([string]$State.commit_sha)) { throw "Commit nao retornou SHA verificavel." }
        Write-AgenticState -State $State
        Add-AgenticJournalEvent -Goal ([string]$State.goal_id) -State "READY_TO_COMMIT" -Agent "supervisor" -Controller "supervisor" -Actor "supervisor" -Action "Commit criado pelo supervisor" -Result "PASS" -Gate "GATES, SECURITY_REVIEW, CODE_REVIEW: PASS" -Memory ([string]$State.memory_status)

        $step = "git push da branch de trabalho"
        $branchOutput = @(Invoke-Git -GitArguments @("branch", "--show-current"))
        $currentBranch = if ($branchOutput.Count -gt 0) { ([string]$branchOutput[0]).Trim() } else { "" }
        if ($currentBranch -cne [string]$State.branch -or -not (Test-AgenticPushTarget -Branch $currentBranch)) { throw "Push bloqueado: branch atual nao e a branch de trabalho validada." }
        $pushResult = Invoke-AgenticNativeProcess -FilePath "git" -Arguments @("-C", $script:AgenticRepoRoot, "push", "--set-upstream", "origin", $currentBranch) -CaptureStandardError
        Assert-AgenticNativeProcessSucceeded -Result $pushResult -CommandName "git push"

        Set-AgenticSupervisorTransition -State $State -To "READY_TO_PR" -PendingAction "Criar e verificar PR para a base declarada" | Out-Null
        Write-AgenticState -State $State
        Add-AgenticJournalEvent -Goal ([string]$State.goal_id) -State "READY_TO_PR" -Agent "supervisor" -Controller "supervisor" -Actor "supervisor" -Action "Commit e push da branch de trabalho concluidos" -Result "PASS" -Gate "GATES, SECURITY_REVIEW, CODE_REVIEW: PASS" -Memory ([string]$State.memory_status)

        $step = "criacao do pull request"
        $bodyPath = Join-Path ([IO.Path]::GetTempPath()) ("agentic-pr-{0}.md" -f [guid]::NewGuid().ToString("N"))
        $body = "Goal: $($Metadata['ID'])`n`nQuality gates, security review e code review foram validados pelo supervisor antes do commit.`n`nEste PR nao foi mergeado nem implantado."
        [IO.File]::WriteAllText($bodyPath, $body, [Text.UTF8Encoding]::new($false))
        try {
            $prCreate = Invoke-AgenticNativeProcess -FilePath "gh" -Arguments @("pr", "create", "--repo", $repository, "--base", $base, "--head", $currentBranch, "--title", [string]$Metadata["Title"], "--body-file", $bodyPath) -CaptureStandardError
        }
        finally {
            Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue
        }
        Assert-AgenticNativeProcessSucceeded -Result $prCreate -CommandName "gh pr create"
        $prUrl = @($prCreate.Output | ForEach-Object { [regex]::Match([string]$_, 'https://github\.com/[^/]+/[^/]+/pull/[0-9]+').Value } | Where-Object { $_ } | Select-Object -First 1)
        if ($prUrl.Count -eq 0) { throw "gh pr create nao retornou URL verificavel." }

        $step = "verificacao do pull request"
        $prView = Invoke-AgenticNativeProcess -FilePath "gh" -Arguments @("pr", "view", $prUrl[0], "--repo", $repository, "--json", "number,url,state,headRefName,baseRefName") -CaptureStandardError
        Assert-AgenticNativeProcessSucceeded -Result $prView -CommandName "gh pr view"
        $prJson = @($prView.Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        $pullRequest = $prJson | ConvertFrom-Json
        if (-not (Test-AgenticPullRequest -PullRequest $pullRequest -Branch $currentBranch -BaseBranch $base)) { throw "PR nao corresponde a branch/base ou nao esta aberto." }

        Set-AgenticVerifiedPullRequestState -State $State -PullRequest $pullRequest -Branch $currentBranch -BaseBranch $base | Out-Null
        $State.pending_action = $null
        $State.active_agent = $null
        $State.last_gate = "PR verificado; aguardando merge humano"
        $State.last_successful_step = "Supervisor criou e verificou commit, push e PR"
        Write-AgenticState -State $State
        Add-AgenticJournalEvent -Goal ([string]$State.goal_id) -State "WAITING_HUMAN_MERGE" -Agent "supervisor" -Controller "supervisor" -Actor "supervisor" -Action "Registrar PR verificavel e aguardar merge humano" -Result "PASS" -Gate ([string]$State.last_gate) -Memory ([string]$State.memory_status)
        Save-AgenticTerminalJournal -State $State | Out-Null
        Write-Output "Goal concluido. PR: $($State.pr_url). Estado: WAITING_HUMAN_MERGE."
        return $true
    }
    catch {
        $script:AgenticLastErrorRecord = $_
        $errorRecord = $_
        $exitSuffix = if ($null -ne $script:AgenticLastNativeExitCode) { " (exit code $($script:AgenticLastNativeExitCode))" } else { '' }
        $errorScript = $PSCommandPath; $errorFunction = 'Invoke-AgenticFinalization'; $errorLine = 0
        if ($null -ne $errorRecord.InvocationInfo) {
            if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptName'] -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.ScriptName)) { $errorScript = [string]$errorRecord.InvocationInfo.ScriptName }
            if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['MyCommand'] -and $null -ne $errorRecord.InvocationInfo.MyCommand -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.MyCommand.Name)) { $errorFunction = [string]$errorRecord.InvocationInfo.MyCommand.Name }
            if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptLineNumber']) { $errorLine = [int]$errorRecord.InvocationInfo.ScriptLineNumber }
        }
        $diagnostic = New-AgenticFailureDiagnostic -Category 'finalization' -Message ($errorRecord.Exception.Message + $exitSuffix) -Operation $step -ScriptPath $errorScript -FunctionName $errorFunction -Line $errorLine -StateBefore ([string]$State.state) -Phase ([string]$State.pending_phase) -Retryable $false
        Set-FailedState -State (Get-AgenticState) -Reason $diagnostic.message -Diagnostic $diagnostic
        throw "Finalizacao do supervisor falhou durante '$step'; state FAILED e diagnostico sanitizado foram persistidos."
    }
}

function Invoke-CodexAgentRole {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$GoalPath, [Parameter(Mandatory = $true)][string]$Role, [Parameter(Mandatory = $true)][string]$Phase, [Parameter(Mandatory = $true)][string]$InvocationId)
    $configPath = Join-Path $script:AgenticRepoRoot ('.codex/agents/{0}.toml' -f $Role)
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "Role config não encontrada: $Role." }
    $roleConfig = [IO.File]::ReadAllText($configPath, [Text.UTF8Encoding]::new($false))
    $nameMatch = [regex]::Match($roleConfig, '(?m)^name\s*=\s*"(?<value>[^"]+)"\s*$')
    $modelMatch = [regex]::Match($roleConfig, '(?m)^model\s*=\s*"(?<value>[^"]+)"\s*$')
    $instructionMatch = [regex]::Match($roleConfig, '(?s)developer_instructions\s*=\s*"""(?<value>.*?)"""')
    if (-not $nameMatch.Success -or $nameMatch.Groups['value'].Value -cne $Role -or -not $modelMatch.Success -or -not $instructionMatch.Success) { throw "Role config inválida: $Role." }
    $codexCommand = Get-Command codex -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -in @('Application', 'ExternalScript') } | Select-Object -First 1
    if ($null -eq $codexCommand) { throw 'Codex CLI não encontrado no PATH.' }
    $readOnly = $Role -in @('architect', 'tester', 'security', 'reviewer')
    $sandbox = if ($readOnly) { 'read-only' } else { 'workspace-write' }
    $sharedPromptPath = Join-Path $script:AgenticRepoRoot 'agentic/prompts/autonomous-loop.md'
    $sharedPrompt = [IO.File]::ReadAllText($sharedPromptPath, [Text.UTF8Encoding]::new($false))
    $roleContract = @"
Você é a role $Role, invocada diretamente pelo supervisor PowerShell em um processo Codex independente. Não é orchestrator. Não delegue nem declare resultados de outras roles. Não altere state/journal/gates oficiais nem execute Git mutável. Siga este contrato de role:
$($instructionMatch.Groups['value'].Value.Trim())

Retorne somente JSON válido com os campos obrigatórios: schema_version=1, goal_id, role, invocation_id, phase, snapshot_sha256, status (PASS|FAIL|BLOCKED), summary (string), findings (array), evidence (array), failure (null ou objeto com category/message/operation/retryable), files_changed (array). Não inclua markdown fences nem texto externo ao JSON. Use os valores exatos abaixo para goal_id, role, invocation_id, phase e snapshot_sha256. Para roles read-only, files_changed deve ser []. Para implementer, liste cada arquivo funcional permitido realmente alterado. O supervisor executará e registrará os quality gates oficiais; não marque gates como PASS.

Contexto do supervisor:
goal_file=$((Get-AgenticRelativePath -BasePath $script:AgenticRepoRoot -TargetPath $GoalPath))
goal_id=$($State.goal_id)
branch=$($State.branch)
base_branch=$($State.base_branch)
phase=$Phase
invocation_id=$InvocationId
snapshot_sha256=$($State.execution_snapshot_sha256)
change_classification=$($State.change_classification)
"@
    $prompt = $sharedPrompt + "`n`n" + $roleContract
    if ($Role -eq 'tester') {
        $gateJson = @($State.gate_results | ConvertTo-Json -Depth 8)
        $prompt += "`nHost quality gate evidence (read-only input):`n$($gateJson -join "`n")"
    }
    $responsePath = Join-Path ([IO.Path]::GetTempPath()) ('gerit-agentic-result-{0}.json' -f [guid]::NewGuid().ToString('N'))
    $fingerprintInput = @($Role, $Phase, [string]$State.goal_id, $InvocationId, [string]$State.execution_snapshot_sha256, [string]$modelMatch.Groups['value'].Value, (Get-AgenticTextSha256 -Text $prompt)) -join "`n"
    $fingerprint = Get-AgenticTextSha256 -Text $fingerprintInput
    $args = @('exec', '--json', '--sandbox', $sandbox, '--cd', $script:AgenticRepoRoot, '--model', $modelMatch.Groups['value'].Value, '--output-last-message', $responsePath, $prompt)
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

$metadata = $null
try {
    $script:AgenticBootstrapGoalSha256 = $null
    $preparedHandoff = $null
    $resolvedGoal = (Resolve-Path -LiteralPath $Goal).Path
    $repoPrefix = $script:AgenticRepoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    Invoke-Assert ($resolvedGoal.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) "Goal precisa estar dentro do repositorio."
    if ($PreparedBranch) { $metadata = Assert-AgenticIntake -Path $resolvedGoal }
    else { $metadata = Get-AgenticGoalMetadata -Path $resolvedGoal }
    if ($PreparedBranch -and $SmokeTest) { throw "PreparedBranch não pode ser combinado com SmokeTest." }

    if ($SmokeTest) {
        Invoke-SmokeTest -GoalPath $resolvedGoal
        exit 0
    }
    if ($PreparedBranch) {
        if ($Resume) { throw "PreparedBranch não pode ser combinado com Resume." }
        $preparedHandoff = Assert-AgenticPreparedHandoff -GoalPath $resolvedGoal -Metadata $metadata
        $script:AgenticBootstrapGoalSha256 = [string]$preparedHandoff.Sha256
        Assert-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID']) -ExpectedSha256 $script:AgenticBootstrapGoalSha256 | Out-Null
    }

    $state = Get-AgenticState
    if ($Resume) {
        if ($state.state -in @('IDLE', 'WAITING_HUMAN_MERGE', 'FAILED')) { throw "State '$($state.state)' is not resumable." }
        foreach ($field in @('goal_id', 'branch', 'base_branch', 'pending_action', 'pending_phase')) {
            $property = $state.PSObject.Properties[$field]
            if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) { throw "Resume checkpoint is missing required field '$field'." }
        }
        if ([string]$state.goal_id -cne [string]$metadata['ID']) { throw 'Resume goal_id mismatch.' }
        if ([string]$state.base_branch -cne [string]$metadata['Base branch']) { throw 'Resume base branch mismatch.' }
        Assert-AgenticJournalMatchesState -State $state | Out-Null
        $bootstrapHashProperty = $state.PSObject.Properties['bootstrap_goal_sha256']
        $hasBootstrapStateHash = $null -ne $bootstrapHashProperty -and -not [string]::IsNullOrWhiteSpace([string]$bootstrapHashProperty.Value)
        $hasBootstrapAnchor = Test-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID'])
        if ($hasBootstrapAnchor) {
            $script:AgenticBootstrapGoalSha256 = Get-AgenticBootstrapAnchorSha256 -GoalId ([string]$metadata['ID'])
            if (-not $hasBootstrapStateHash -or [string]$bootstrapHashProperty.Value -cne $script:AgenticBootstrapGoalSha256) { throw 'Resume bootstrap hash differs from immutable anchor.' }
            Assert-AgenticBootstrapAnchor -GoalId ([string]$metadata['ID']) -ExpectedSha256 $script:AgenticBootstrapGoalSha256 | Out-Null
            $bootstrapPath = Assert-AgenticBootstrapGoalIntegrity -State $state -Metadata $metadata -ExpectedSha256 $script:AgenticBootstrapGoalSha256
            $journalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath
            Test-AgenticBootstrapGoalProvenance -GoalId ([string]$metadata['ID']) -CanonicalPath $bootstrapPath -Sha256 $script:AgenticBootstrapGoalSha256 -JournalText $journalText | Out-Null
        }
        elseif ($hasBootstrapStateHash) { throw 'Resume checkpoint has bootstrap hash but immutable anchor is absent.' }
        $branch = ([string](@(Invoke-Git -GitArguments @('branch', '--show-current'))[0])).Trim()
        if ($branch -cne [string]$state.branch -or $branch -in @('develop', 'main')) { throw 'Resume branch differs from checkpoint or is a protected base.' }
        if ($state.state -eq 'WAITING_FOR_QUOTA') {
            if ([string]::IsNullOrWhiteSpace([string]$state.resume_after)) { throw 'Quota checkpoint has no resume_after timestamp.' }
            $resumeAt = [DateTime]::Parse([string]$state.resume_after).ToUniversalTime()
            $remaining = [int][Math]::Ceiling(($resumeAt - [DateTime]::UtcNow).TotalSeconds)
            if ($remaining -gt 0) { Start-Sleep -Seconds $remaining }
            $state.quota_state = 'PROBE_DUE'
            $state.resume_after = $null
            Set-AgenticSupervisorTransition -State $state -To 'RESUMING' -PendingAction 'Retomar pending_phase após quota' | Out-Null
        }
        elseif ($state.state -ne 'RESUMING') {
            $state.pending_phase = [string]$state.state
            Set-AgenticSupervisorTransition -State $state -To 'RESUMING' -PendingAction ([string]$state.pending_action) | Out-Null
        }
        $state.active_agent = 'orchestrator'
        Write-AgenticState -State $state
    }
    else {
        if ($PreparedBranch) {
            $branchName = ([string](@(Invoke-Git -GitArguments @('branch', '--show-current'))[0])).Trim()
            $expected = "$($metadata['Branch prefix'])/$($metadata['ID'])"
            if ($branchName -cne $expected -or $branchName -in @('develop', 'main')) { throw 'Prepared branch does not match validated intake.' }
            if ([string]$state.state -ne 'DISCOVERY' -or [string]$state.goal_id -cne [string]$metadata['ID'] -or [string]$state.branch -cne $branchName -or [string]$state.base_branch -cne [string]$metadata['Base branch'] -or [string]$state.bootstrap_goal_sha256 -cne [string]$preparedHandoff.Sha256) { throw 'Prepared branch checkpoint is missing or differs from authenticated handoff.' }
            if ([string]$state.goal_file -cne (Get-AgenticRelativePath -BasePath $script:AgenticRepoRoot -TargetPath $resolvedGoal)) { throw 'Prepared branch checkpoint goal path differs from authenticated handoff.' }
            Assert-AgenticJournalMatchesState -State $state | Out-Null
        }
        else {
            if ($state.state -ne 'IDLE') { throw "An active checkpoint exists in state '$($state.state)'; use resume." }
            $branchName = Start-GoalBranch -Metadata $metadata
            $engine = Resolve-AgenticPowerShellEngine
            $state = Get-AgenticStateTemplate
            $state.goal_id = [string]$metadata['ID']
            $state.goal_file = Get-AgenticRelativePath -BasePath $script:AgenticRepoRoot -TargetPath $resolvedGoal
            $state.bootstrap_goal_sha256 = $null
            $state.branch = $branchName
            $state.base_branch = [string]$metadata['Base branch']
            $state.started_at = [DateTime]::UtcNow.ToString('o')
            $state.state = 'DISCOVERY'
            $state.pending_phase = 'DISCOVERY'
            $state.pending_action = 'Execute architect discovery'
            $state.supervisor_runtime = [pscustomobject]@{ edition = $engine.Edition; version = $engine.Version; path = [IO.Path]::GetFileName($engine.Path) }
            Write-AgenticState -State $state
            Initialize-AgenticJournalForGoal -GoalId $state.goal_id -Branch $state.branch -BaseBranch $state.base_branch
        }
    }

    while ($true) {
        $state = Get-AgenticState
        if ($state.state -eq 'RESUMING') {
            $resumePhase = [string]$state.pending_phase
            if ($resumePhase -notin @('DISCOVERY', 'PLANNING', 'IMPLEMENTING', 'TESTING', 'SECURITY_REVIEW', 'CODE_REVIEW', 'CORRECTING', 'READY_TO_COMMIT')) { throw 'pending_phase is invalid.' }
            Set-AgenticSupervisorTransition -State $state -To $resumePhase -PendingAction ([string]$state.pending_action) | Out-Null
            Write-AgenticState -State $state
        }
        if ($state.state -eq 'READY_TO_COMMIT') {
            $branchNow = ([string](@(Invoke-Git -GitArguments @('branch', '--show-current'))[0])).Trim()
            $pathsNow = @(Get-AgenticWorkingTreePaths)
            Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch $branchNow -ChangedPaths $pathsNow -BootstrapGoalSha256 $script:AgenticBootstrapGoalSha256 | Out-Null
            if (Invoke-AgenticFinalization -State $state -Metadata $metadata) { exit 0 }
            continue
        }
        if ($state.agent_calls -ge $state.max_agent_calls -or $state.iteration -ge $state.max_iterations) {
            $diag = New-AgenticFailureDiagnostic -Category 'limit' -Message 'Agent-call or iteration limit reached.' -Operation 'supervisor lifecycle' -ScriptPath $PSCommandPath -FunctionName 'supervisor loop' -StateBefore $state.state -Phase $state.pending_phase
            Set-FailedState -State $state -Reason $diag.message -Diagnostic $diag
            exit 1
        }
        if ($state.state -eq 'TESTING') {
            try { Invoke-AgenticQualityGates -State $state -Metadata $metadata | Out-Null }
            catch {
                $diag = New-AgenticFailureDiagnostic -Category 'quality_gate' -Message $_.Exception.Message -Operation 'execute required quality gates' -ScriptPath $PSCommandPath -FunctionName 'Invoke-AgenticQualityGates' -Line $_.InvocationInfo.ScriptLineNumber -StateBefore $state.state -Phase $state.state -Retryable $true
                $state.failure_diagnostic = $diag; $state.last_failure = $diag.message; $state.last_gate = 'QUALITY_GATES: FAIL'; $state.consecutive_failures++
                if ($state.consecutive_failures -ge $state.max_consecutive_failures) { Set-FailedState -State $state -Reason $diag.message -Diagnostic $diag; exit 1 }
                $state.security_review_status = 'PENDING'; $state.code_review_status = 'PENDING'
                Set-AgenticSupervisorTransition -State $state -To 'CORRECTING' -PendingAction 'Correct gate failure and rerun testing' | Out-Null
                Write-AgenticState -State $state
                Add-AgenticJournalEvent -Goal $state.goal_id -State 'CORRECTING' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Gate failure checkpoint' -Result 'RETRY' -Failure $diag.message -Diagnostic $diag
                continue
            }
        }

        $phase = [string]$state.state
        $expectedRole = switch ($phase) {
            'DISCOVERY' { 'architect' } 'PLANNING' { 'architect' } 'IMPLEMENTING' { 'implementer' } 'TESTING' { 'tester' }
            'SECURITY_REVIEW' { 'security' } 'CODE_REVIEW' { 'reviewer' } 'CORRECTING' { 'implementer' }
            default { throw "No agent role is authorized for phase '$phase'." }
        }
        $state.agent_calls++
        $state.iteration++
        $state.active_agent = $expectedRole
        $state.pending_phase = $phase
        $state.pending_action = "Run phase $phase and validate structured result"
        $changedPaths = @(Get-AgenticCommitPaths -ChangedPaths @(Get-AgenticWorkingTreePaths))
        $classification = if ($changedPaths.Count -gt 0) { Get-AgenticChangeClassification -Paths $changedPaths } else { 'runtime-code' }
        $executionSnapshot = @(Get-AgenticCommitSnapshot -Paths $changedPaths)
        $state.change_classification = $classification
        $state.execution_id = [guid]::NewGuid().ToString('N')
        $state.execution_snapshot_sha256 = Get-AgenticStableSnapshotSha256 -Snapshot $executionSnapshot
        Write-AgenticState -State $state
        Add-AgenticJournalEvent -Goal $state.goal_id -State $phase -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -DelegatedAgent $expectedRole -Action ("Invoke isolated Codex role {0}" -f $expectedRole) -Gate ("invocation_id={0}; snapshot_sha256={1}" -f $state.execution_id, $state.execution_snapshot_sha256) -Result 'PENDING'

        $invocation = Invoke-CodexAgentRole -State $state -GoalPath $resolvedGoal -Role $expectedRole -Phase $phase -InvocationId ([string]$state.execution_id)
        Assert-AgenticJournalMatchesState -State $state | Out-Null
        if (-not [string]::IsNullOrWhiteSpace([string]$script:AgenticBootstrapGoalSha256)) { Assert-AgenticBootstrapGoalIntegrity -State $state -Metadata $metadata -ExpectedSha256 $script:AgenticBootstrapGoalSha256 | Out-Null }
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $invocation -Metadata $metadata
        Write-AgenticState -State $state
        if ($invocation.ExitCode -ne 0) {
            $quota = Get-AgenticQuotaClassification -Text $invocation.Output
            if ($quota.Kind -eq 'QUOTA') {
                $state.pending_phase = $phase
                Set-AgenticSupervisorTransition -State $state -To 'WAITING_FOR_QUOTA' -PendingAction "Resume phase $phase after quota backoff" | Out-Null
                $now = [DateTime]::UtcNow; $state.quota_state = 'WAITING'; $state.quota_type = $quota.Type; $state.quota_detected_at = $now.ToString('o'); $state.quota_reset_at = $quota.RetryAt
                $state.resume_after = if ($quota.RetryAt) { $quota.RetryAt } else { $now.AddMinutes($quota.WaitMinutes).ToString('o') }
                Write-AgenticState -State $state
                Add-AgenticJournalEvent -Goal $state.goal_id -State 'WAITING_FOR_QUOTA' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Pause phase after explicit quota signal' -Result 'PENDING' -Quota $quota.Type
                Write-Output ("Goal pausado em WAITING_FOR_QUOTA; resume_after={0}." -f $state.resume_after)
                exit 0
            }
            $diag = New-AgenticFailureDiagnostic -Category 'codex_process' -Message ("Codex role process exited with code {0}" -f $invocation.ExitCode) -Operation ("codex exec role {0}" -f $expectedRole) -ScriptPath $PSCommandPath -FunctionName 'Invoke-CodexAgentRole' -StateBefore $phase -Phase $phase -Retryable ($quota.Kind -eq 'TRANSIENT_ERROR') -InvocationId $invocation.InvocationId -Role $expectedRole -ExitCode $invocation.ExitCode
            Set-FailedState -State $state -Reason $diag.message -Diagnostic $diag
            exit 1
        }
        if ($null -eq $invocation.Result) {
            $diag = New-AgenticFailureDiagnostic -Category 'role_contract' -Message ([string]$invocation.ValidationError) -Operation ("validate role result {0}" -f $expectedRole) -ScriptPath $PSCommandPath -FunctionName 'Invoke-CodexAgentRole' -StateBefore $phase -Phase $phase -Retryable $false -InvocationId $invocation.InvocationId -Role $expectedRole -ExitCode $invocation.ExitCode
            $state.failure_diagnostic = $diag; $state.last_failure = $diag.message; $state.consecutive_failures++
            if ($state.consecutive_failures -ge $state.max_consecutive_failures) { Set-FailedState -State $state -Reason $diag.message -Diagnostic $diag; exit 1 }
            $retryPhase = if ($phase -eq 'CORRECTING') { 'IMPLEMENTING' } else { 'CORRECTING' }
            Set-AgenticSupervisorTransition -State $state -To $retryPhase -PendingAction ([string]$diag.operation) | Out-Null
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $state.goal_id -State 'CORRECTING' -Agent $expectedRole -Controller 'supervisor' -Actor 'supervisor' -Action 'Reject structured role result inválido' -Result 'RETRY' -Diagnostic $diag
            continue
        }
        $structured = $invocation.Result
        if ($structured.status -eq 'BLOCKED') {
            $state.failure_diagnostic = New-AgenticFailureDiagnostic -Category ([string]$structured.failure.category) -Message ([string]$structured.failure.message) -Operation ([string]$structured.failure.operation) -StateBefore $phase -Phase $phase -Retryable ([bool]$structured.failure.retryable) -InvocationId $invocation.InvocationId -Role $expectedRole -ExitCode $invocation.ExitCode
            $state.pending_action = [string]$state.failure_diagnostic.operation
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $state.goal_id -State $phase -Agent $expectedRole -Controller 'supervisor' -Actor $expectedRole -Action 'Role bloqueada; checkpoint preservado' -Result 'BLOCKED' -Diagnostic $state.failure_diagnostic
            exit 2
        }
        if ($structured.status -eq 'FAIL') {
            $diag = New-AgenticFailureDiagnostic -Category ([string]$structured.failure.category) -Message ([string]$structured.failure.message) -Operation ([string]$structured.failure.operation) -StateBefore $phase -Phase $phase -Retryable ([bool]$structured.failure.retryable) -InvocationId $invocation.InvocationId -Role $expectedRole -ExitCode $invocation.ExitCode
            $state.failure_diagnostic = $diag; $state.last_failure = $diag.message; $state.consecutive_failures++
            if ($state.consecutive_failures -ge $state.max_consecutive_failures) { Set-FailedState -State $state -Reason $diag.message -Diagnostic $diag; exit 1 }
            $retryPhase = if ($phase -eq 'CORRECTING') { 'IMPLEMENTING' } else { 'CORRECTING' }
            Set-AgenticSupervisorTransition -State $state -To $retryPhase -PendingAction ([string]$diag.operation) | Out-Null
            Write-AgenticState -State $state
            Add-AgenticJournalEvent -Goal $state.goal_id -State 'CORRECTING' -Agent $expectedRole -Controller 'supervisor' -Actor $expectedRole -Action 'Role reportou finding; solicitar correção' -Result 'RETRY' -Diagnostic $diag
            continue
        }
        if ($expectedRole -eq 'implementer') {
            Add-AgenticJournalEvent -Goal $state.goal_id -State $phase -Agent 'implementer' -Controller 'supervisor' -Actor 'implementer' -Action 'Invocation isolada do implementer validada pelo supervisor' -FilesChanged @($structured.files_changed) -Result 'PASS'
        }
        $nextPhase = switch ($phase) {
            'DISCOVERY' { 'PLANNING' } 'PLANNING' { 'IMPLEMENTING' } 'IMPLEMENTING' { 'TESTING' } 'TESTING' { 'SECURITY_REVIEW' }
            'SECURITY_REVIEW' { 'CODE_REVIEW' } 'CODE_REVIEW' { 'READY_TO_COMMIT' } 'CORRECTING' { 'TESTING' }
            default { throw "Supervisor não possui transição de sucesso para '$phase'." }
        }
        Set-AgenticSupervisorTransition -State $state -To $nextPhase -PendingAction "Supervisor validated $phase; continue with $nextPhase" | Out-Null
        $state.consecutive_failures = 0; $state.failure_diagnostic = $null; $state.active_agent = $expectedRole
        $state.last_successful_step = "$phase completed with validated structured output"
        Write-AgenticState -State $state
        Add-AgenticJournalEvent -Goal $state.goal_id -State $nextPhase -Agent $expectedRole -Controller 'supervisor' -Actor 'supervisor' -Action 'Persistar transição após invocation estruturada aprovada' -Gate ("from=$phase; invocation_id=$($state.execution_id); artifact=$($invocation.ArtifactPath)") -Result 'PASS'

        if ($nextPhase -eq 'READY_TO_COMMIT') {
            $branchNow = ([string](@(Invoke-Git -GitArguments @('branch', '--show-current'))[0])).Trim()
            $pathsNow = @(Get-AgenticWorkingTreePaths)
            Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch $branchNow -ChangedPaths $pathsNow -BootstrapGoalSha256 $script:AgenticBootstrapGoalSha256 | Out-Null
            if (Invoke-AgenticFinalization -State $state -Metadata $metadata) { exit 0 }
        }
    }
}
catch {
    $errorRecord = $_
    $safeErrorMessage = ConvertTo-AgenticSanitizedText -Text $errorRecord.Exception.Message
    try {
        $checkpoint = Get-AgenticState
        if ($null -ne $metadata -and [string]$checkpoint.goal_id -ceq [string]$metadata["ID"] -and $checkpoint.state -notin @("IDLE", "WAITING_HUMAN_MERGE", "FAILED")) {
            $script:AgenticLastErrorRecord = $errorRecord
            $errorScript = $PSCommandPath; $errorFunction = 'agentic supervisor'; $errorLine = 0
            if ($null -ne $errorRecord.InvocationInfo) {
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptName'] -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.ScriptName)) { $errorScript = [string]$errorRecord.InvocationInfo.ScriptName }
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['MyCommand'] -and $null -ne $errorRecord.InvocationInfo.MyCommand -and -not [string]::IsNullOrWhiteSpace([string]$errorRecord.InvocationInfo.MyCommand.Name)) { $errorFunction = [string]$errorRecord.InvocationInfo.MyCommand.Name }
                if ($null -ne $errorRecord.InvocationInfo.PSObject.Properties['ScriptLineNumber']) { $errorLine = [int]$errorRecord.InvocationInfo.ScriptLineNumber }
            }
            $diagnostic = New-AgenticFailureDiagnostic -Category 'supervisor_exception' -Message $errorRecord.Exception.Message -Operation ([string]$checkpoint.pending_action) -ScriptPath $errorScript -FunctionName $errorFunction -Line $errorLine -StateBefore ([string]$checkpoint.state) -Phase ([string]$checkpoint.pending_phase) -Retryable $false
            Set-FailedState -State $checkpoint -Reason $diagnostic.message -Diagnostic $diagnostic
        }
    }
    catch { Write-Warning ("Falha ao persistir checkpoint de erro: " + (ConvertTo-AgenticSanitizedText -Text $_.Exception.Message)) }
    Write-Error $safeErrorMessage
    exit 1
}
