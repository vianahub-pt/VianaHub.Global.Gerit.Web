Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:AgenticRepoRoot = Split-Path -Parent $PSScriptRoot
$script:AgenticStatePath = Join-Path $script:AgenticRepoRoot "agentic/state/loop-state.json"
$script:AgenticJournalPath = Join-Path $script:AgenticRepoRoot "agentic/journal/current.md"
$script:AgenticFixturePlanRoot = $null
$script:AgenticLastNativeExitCode = $null
$script:AgenticLastDiagnostic = $null
$script:AgenticLastErrorRecord = $null
$script:AgenticFixtureArtifactPaths = @()
$script:AgenticStates = @(
    "IDLE", "REQUEST_ACCEPTED", "PREFLIGHT_PREPARING", "PREFLIGHT_ANALYZING",
    "ALREADY_SATISFIED", "BRANCH_PREPARED", "ARCHITECTURE", "DOR_VALIDATION",
    "IMPLEMENTING", "TESTING", "REVIEWING", "CORRECTING", "QUALITY_GATES",
    "OBSERVABILITY_VERIFICATION", "REQUIREMENT_VERIFICATION", "SCOPE_DIFF_VERIFICATION",
    "READY_TO_COMMIT", "READY_TO_PR", "WAITING_FOR_QUOTA", "BLOCKED", "RESUMING",
    "WAITING_HUMAN_MERGE", "FAILED"
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
        $lastExitCodeVariable = Get-Variable -Name 'LASTEXITCODE' -ErrorAction SilentlyContinue
        $exitCode = if ($null -eq $lastExitCodeVariable) { 0 } else { [int]$lastExitCodeVariable.Value }
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
        schema_version = 2
        request_id = $null
        request_envelope_path = $null
        request_envelope_sha256 = $null
        request_envelope_file_sha256 = $null
        request_type_hint = $null
        preflight_result_path = $null
        preflight_result_sha256 = $null
        base_sha = $null
        preflight_status = $null
        work_branch = $null
        origin_branch = $null
        specification_path = $null
        specification_sha256 = $null
        specification_payload_path = $null
        specification_payload_sha256 = $null
        allowed_functional_files = @()
        specification_version = 0
        approved_snapshot_sha256 = $null
        pending_phase = $null
        goal_id = $null
        supervisor_runtime = $null
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
            npm_ci = "PENDING"
            runtime_tests = "PENDING"
            markdown = "PENDING"
            whitespace = "PENDING"
            staged_diff_check = "PENDING"
        }
        change_classification = $null
        required_gates = @()
        gate_results = @()
        skipped_gates = @()
        execution_id = $null
        execution_snapshot_sha256 = $null
        role_invocations = @()
        reviewer_invocation_id = $null
        security_invocation_id = $null
        tester_invocation_id = $null
        brokered_test_results = @()
        tester_status = "PENDING"
        observability_status = "PENDING"
        requirement_status = "PENDING"
        scope_status = "PENDING"
        observability_verification_path = $null
        requirement_verification_path = $null
        scope_verification_path = $null
        no_changes = $false
        quality_gate_snapshot = @()
        failure_diagnostic = $null
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
    Assert-AgenticNoReparsePoints -Path $script:AgenticStatePath -BasePath $script:AgenticRepoRoot | Out-Null
    if (-not (Test-Path -LiteralPath $script:AgenticStatePath)) {
        return Get-AgenticStateTemplate
    }

    $raw = Read-AgenticTextSafely -Path $script:AgenticStatePath
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "O arquivo de estado agentic esta vazio."
    }

    $state = $raw | ConvertFrom-Json
    if ($null -eq $state.state -or $null -eq $state.base_branch) {
        throw "O arquivo de estado agentic nao contem campos obrigatorios."
    }
    if ($script:AgenticStates -cnotcontains [string]$state.state) {
        throw "O arquivo de estado contem um estado nao permitido."
    }
    if ([string]$state.state -notin @('IDLE', 'ALREADY_SATISFIED', 'FAILED', 'WAITING_HUMAN_MERGE')) {
        $requiredCheckpointFields = @('request_id', 'request_envelope_path', 'request_envelope_sha256', 'goal_id', 'base_branch', 'pending_action', 'pending_phase')
        if ([string]$state.state -notin @('REQUEST_ACCEPTED', 'PREFLIGHT_PREPARING', 'PREFLIGHT_ANALYZING', 'RESUMING', 'BLOCKED', 'WAITING_FOR_QUOTA')) { $requiredCheckpointFields += 'branch' }
        foreach ($required in $requiredCheckpointFields) {
            $property = $state.PSObject.Properties[$required]
            if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) { throw "Checkpoint inválido: campo obrigatório '$required' ausente." }
        }
    }
    $template = Get-AgenticStateTemplate
    foreach ($templateProperty in $template.PSObject.Properties) {
        if ($null -eq $state.PSObject.Properties[$templateProperty.Name]) {
            $defaultValue = $templateProperty.Value
            if ($defaultValue -is [System.Collections.IEnumerable] -and $defaultValue -isnot [string]) { $defaultValue = @($defaultValue) }
            $state | Add-Member -NotePropertyName $templateProperty.Name -NotePropertyValue $defaultValue
        }
    }
    return $state
}

function Assert-AgenticResumeCheckpoint {
    param([Parameter(Mandatory = $true)]$State)
    if ([string]$State.state -in @('IDLE', 'ALREADY_SATISFIED', 'FAILED', 'WAITING_HUMAN_MERGE')) { throw "Estado '$($State.state)' não está aguardando retomada." }
    $requiredFields = @('request_id', 'request_envelope_path', 'request_envelope_sha256', 'goal_id', 'base_branch', 'pending_action', 'pending_phase')
    if ([string]$State.state -notin @('REQUEST_ACCEPTED', 'PREFLIGHT_PREPARING', 'PREFLIGHT_ANALYZING', 'RESUMING', 'BLOCKED', 'WAITING_FOR_QUOTA')) { $requiredFields += 'branch' }
    foreach ($field in $requiredFields) {
        $property = $State.PSObject.Properties[$field]
        if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) { throw "State não contém campo obrigatório '$field' para retomada." }
    }
    return $true
}

function Get-AgenticOptionalScriptValue {
    param([Parameter(Mandatory = $true)][string]$Name)
    $variable = Get-Variable -Name $Name -Scope Script -ErrorAction SilentlyContinue
    if ($null -eq $variable) { return $null }
    return $variable.Value
}

function Resolve-AgenticPowerShellEngine {
    $pwsh = Get-Command -Name 'pwsh.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $pwsh) { $pwsh = Get-Command -Name 'pwsh' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($null -ne $pwsh) {
        $versionResult = Invoke-AgenticNativeProcess -FilePath $pwsh.Source -Arguments @('-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()')
        Assert-AgenticNativeProcessSucceeded -Result $versionResult -CommandName 'pwsh version'
        return [pscustomobject]@{ Path = $pwsh.Source; Edition = 'Core'; Version = ([string]@($versionResult.Output)[0]).Trim() }
    }
    $powershell = Get-Command -Name 'powershell.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $powershell) { throw 'Nenhum runtime PowerShell compatível foi encontrado.' }
    $versionResult = Invoke-AgenticNativeProcess -FilePath $powershell.Source -Arguments @('-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()')
    Assert-AgenticNativeProcessSucceeded -Result $versionResult -CommandName 'Windows PowerShell version'
    return [pscustomobject]@{ Path = $powershell.Source; Edition = 'Desktop'; Version = ([string]@($versionResult.Output)[0]).Trim() }
}

function Test-AgenticTransition {
    param(
        [Parameter(Mandatory = $true)][string]$From,
        [Parameter(Mandatory = $true)][string]$To
    )

    if ($script:AgenticStates -cnotcontains $From -or $script:AgenticStates -cnotcontains $To) { return $false }
    $valid = @{
        IDLE = @("REQUEST_ACCEPTED")
        REQUEST_ACCEPTED = @("PREFLIGHT_PREPARING", "BLOCKED", "FAILED")
        PREFLIGHT_PREPARING = @("PREFLIGHT_ANALYZING", "BLOCKED", "FAILED")
        PREFLIGHT_ANALYZING = @("ALREADY_SATISFIED", "BRANCH_PREPARED", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        ALREADY_SATISFIED = @()
        BRANCH_PREPARED = @("ARCHITECTURE", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        ARCHITECTURE = @("DOR_VALIDATION", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        DOR_VALIDATION = @("IMPLEMENTING", "ARCHITECTURE", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        IMPLEMENTING = @("TESTING", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        TESTING = @("REVIEWING", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        REVIEWING = @("QUALITY_GATES", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        CORRECTING = @("IMPLEMENTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        QUALITY_GATES = @("OBSERVABILITY_VERIFICATION", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        OBSERVABILITY_VERIFICATION = @("REQUIREMENT_VERIFICATION", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        REQUIREMENT_VERIFICATION = @("SCOPE_DIFF_VERIFICATION", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        SCOPE_DIFF_VERIFICATION = @("READY_TO_COMMIT", "CORRECTING", "BLOCKED", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_COMMIT = @("READY_TO_PR", "TESTING", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_PR = @("WAITING_HUMAN_MERGE", "WAITING_FOR_QUOTA", "FAILED")
        WAITING_FOR_QUOTA = @("RESUMING", "FAILED")
        BLOCKED = @("RESUMING", "FAILED")
        RESUMING = @("PREFLIGHT_PREPARING", "PREFLIGHT_ANALYZING", "BRANCH_PREPARED", "ARCHITECTURE", "DOR_VALIDATION", "IMPLEMENTING", "TESTING", "REVIEWING", "CORRECTING", "QUALITY_GATES", "OBSERVABILITY_VERIFICATION", "REQUIREMENT_VERIFICATION", "SCOPE_DIFF_VERIFICATION", "READY_TO_COMMIT", "READY_TO_PR", "WAITING_FOR_QUOTA", "BLOCKED", "FAILED")
        WAITING_HUMAN_MERGE = @()
        FAILED = @()
    }
    return $valid[$From] -contains $To
}

function Get-AgenticSupervisorPaths {
    return @("agentic/state/loop-state.json", "agentic/journal/current.md")
}

function Test-AgenticSupervisorPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = $Path.Replace('\', '/')
    return ($normalized -match '^agentic/(state|journal|specifications)(/|$)')
}

function Test-AgenticLocalResultArtifactPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return ($Path.Replace('\', '/') -cmatch '^agentic/state/results/[a-z][a-z0-9-]{2,63}/[0-9a-f]{32}\.json$')
}

function Get-AgenticChangeClassification {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Paths)
    $commitPaths = @(Get-AgenticCommitPaths -ChangedPaths $Paths)
    if ($commitPaths.Count -eq 0) { throw 'Nenhum caminho commitável para classificar.' }
    $documentationOnly = $true
    $infrastructure = $false
    foreach ($path in $commitPaths) {
        $normalized = ([string]$path).Replace('\', '/')
        if ($normalized -notmatch '^docs/.+\.md$') { $documentationOnly = $false }
        if ($normalized -match '^(scripts/|\.github/|\.codex/|agentic/|config(?:uration)?s?/|infra(?:structure)?/|traefik/|docker/|Dockerfile(?:\..*)?$|docker-compose(?:\..*)?\.ya?ml$|[^/]*\.dockerfile$|next\.config\.|(?:ts|js)config[^/]*$|package(?:-lock)?\.json$|npm-shrinkwrap\.json$|yarn\.lock$|pnpm-lock(?:\.yaml)?$|(?:^|/)\.env(?:\.[^/]+)?$|(?:^|/)config\.(?:json|ya?ml|toml|js|mjs|cjs|ts)$)') { $infrastructure = $true }
    }
    if ($documentationOnly) { return 'documentation-only' }
    if ($infrastructure) { return 'runtime-infra' }
    return 'runtime-code'
}

function Resolve-AgenticTypecheckCommand {
    param([string]$RepositoryRoot = $script:AgenticRepoRoot)
    $packagePath = Join-Path $RepositoryRoot 'package.json'
    $package = $null
    if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
        try { $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'package.json inválido durante resolução do typecheck.' }
    }
    $scriptsProperty = if ($null -ne $package) { $package.PSObject.Properties['scripts'] } else { $null }
    $typecheckProperty = if ($null -ne $scriptsProperty -and $null -ne $scriptsProperty.Value) { $scriptsProperty.Value.PSObject.Properties['typecheck'] } else { $null }
    if ($null -ne $typecheckProperty -and -not [string]::IsNullOrWhiteSpace([string]$typecheckProperty.Value)) {
        return [pscustomobject]@{ Status = 'REQUIRED'; Command = 'npm run typecheck'; Reason = 'package.json declara scripts.typecheck' }
    }
    $tsconfigs = @(Get-ChildItem -LiteralPath $RepositoryRoot -Filter 'tsconfig*.json' -File -ErrorAction SilentlyContinue)
    $dependencies = @()
    if ($null -ne $package) {
        foreach ($dependencyName in @('dependencies', 'devDependencies')) {
            $dependencyProperty = $package.PSObject.Properties[$dependencyName]
            if ($null -ne $dependencyProperty) { $dependencies += $dependencyProperty.Value }
        }
    }
    $hasTypeScript = $false
    foreach ($dependencySet in $dependencies) {
        if ($null -ne $dependencySet -and $null -ne $dependencySet.PSObject.Properties['typescript']) { $hasTypeScript = $true }
    }
    if ($tsconfigs.Count -gt 0 -and $hasTypeScript) {
        $canonical = Join-Path $RepositoryRoot 'tsconfig.typecheck.json'
        if (Test-Path -LiteralPath $canonical -PathType Leaf) { return [pscustomobject]@{ Status = 'REQUIRED'; Command = 'npx tsc --project tsconfig.typecheck.json --noEmit'; Reason = 'comando canônico de typecheck do repositório' } }
        return [pscustomobject]@{ Status = 'REQUIRED'; Command = 'npx tsc --noEmit'; Reason = 'TypeScript e tsconfig aplicáveis; sem configuração canônica específica' }
    }
    return [pscustomobject]@{ Status = 'NOT_APPLICABLE'; Command = $null; Reason = 'TypeScript ou tsconfig não aplicável ao conjunto de arquivos' }
}

function Get-AgenticJournalHeader {
    param([Parameter(Mandatory = $true)][string]$JournalText)
    $fields = @{}
    foreach ($name in @('goal_id', 'branch', 'base_branch', 'started_at')) {
        $match = [regex]::Match($JournalText, '(?m)^- ' + [regex]::Escape($name) + ': (?<value>[^\r\n]*)$')
        if (-not $match.Success) { throw "Journal não possui cabeçalho válido: $name." }
        $fields[$name] = $match.Groups['value'].Value.Trim()
        if ([string]::IsNullOrWhiteSpace([string]$fields[$name])) { throw "Journal possui campo vazio no cabeçalho: $name." }
    }
    return [pscustomobject]$fields
}

function New-AgenticJournalHeader {
    param([Parameter(Mandatory = $true)][string]$GoalId, [Parameter(Mandatory = $true)][string]$Branch, [Parameter(Mandatory = $true)][string]$BaseBranch, [string]$StartedAt = [DateTime]::UtcNow.ToString('o'))
    return "# Agentic journal`n`n- goal_id: $GoalId`n- branch: $Branch`n- base_branch: $BaseBranch`n- started_at: $StartedAt`n"
}

function Initialize-AgenticJournalForGoal {
    param([Parameter(Mandatory = $true)][string]$GoalId, [Parameter(Mandatory = $true)][string]$Branch, [Parameter(Mandatory = $true)][string]$BaseBranch, [string]$JournalPath = $script:AgenticJournalPath, [string]$BasePath = $script:AgenticRepoRoot)
    Assert-AgenticNoReparsePoints -Path $JournalPath -BasePath $BasePath | Out-Null
    $directory = Split-Path -Parent $JournalPath
    $historyDirectory = Join-Path $directory 'history'
    if (Test-Path -LiteralPath $JournalPath -PathType Leaf) {
        $oldText = Read-AgenticTextSafely -Path $JournalPath -BasePath $BasePath
        if (-not [string]::IsNullOrWhiteSpace($oldText)) {
            $digest = Get-AgenticTextSha256 -Text $oldText
            $oldHeader = $null
            try { $oldHeader = Get-AgenticJournalHeader -JournalText $oldText } catch { }
            $oldGoal = if ($null -ne $oldHeader) { [string]$oldHeader.goal_id } else { 'unassigned' }
            $historyPath = Join-Path $historyDirectory ('{0}-{1}.md' -f $oldGoal, $digest.Substring(0, 12))
            [IO.Directory]::CreateDirectory($historyDirectory) | Out-Null
            if (-not (Test-Path -LiteralPath $historyPath -PathType Leaf)) { Write-AgenticBytesSafely -Path $historyPath -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($oldText)) -BasePath $BasePath }
            elseif ((Get-AgenticTextSha256 -Text (Read-AgenticTextSafely -Path $historyPath -BasePath $BasePath)) -cne $digest) { throw 'Arquivo de journal history determinístico já existe com conteúdo diferente.' }
        }
    }
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $headerBytes = [Text.UTF8Encoding]::new($false).GetBytes((New-AgenticJournalHeader -GoalId $GoalId -Branch $Branch -BaseBranch $BaseBranch))
    Write-AgenticBytesSafely -Path $JournalPath -Bytes $headerBytes -BasePath $BasePath
}

function Set-AgenticJournalBranch {
    param([Parameter(Mandatory=$true)][string]$GoalId,[Parameter(Mandatory=$true)][string]$Branch)
    if($Branch -notmatch '^(feature|fix|hotfix)/[a-z0-9][a-z0-9-]*$'){throw 'Journal branch identity is invalid.'}
    $text=Read-AgenticTextSafely -Path $script:AgenticJournalPath
    $header=Get-AgenticJournalHeader -JournalText $text
    if([string]$header.goal_id -cne $GoalId){throw 'Journal goal identity mismatch while preparing branch.'}
    $updated=[regex]::Replace($text,'(?m)^- branch: [^\r\n]*$',('- branch: '+$Branch),1)
    if($updated -ceq $text){throw 'Journal branch header was not updated.'}
    Write-AgenticBytesSafely -Path $script:AgenticJournalPath -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($updated))
}

function Assert-AgenticJournalMatchesState {
    param([Parameter(Mandatory = $true)]$State, [string]$JournalPath = $script:AgenticJournalPath, [string]$BasePath = $script:AgenticRepoRoot)
    Assert-AgenticNoReparsePoints -Path $JournalPath -BasePath $BasePath -RequireLeaf | Out-Null
    if (-not (Test-Path -LiteralPath $JournalPath -PathType Leaf)) { throw 'Journal obrigatório ausente no resume.' }
    $text = Read-AgenticTextSafely -Path $JournalPath -BasePath $BasePath
    $header = Get-AgenticJournalHeader -JournalText $text
    foreach ($pair in @(@('goal_id', 'goal_id'), @('branch', 'branch'), @('base_branch', 'base_branch'))) {
        if ([string]$header.($pair[0]) -cne [string]$State.($pair[1])) { throw "Journal não corresponde ao checkpoint ($($pair[0]))." }
    }
    foreach ($event in @(Get-AgenticJournalEvents -JournalText $text)) {
        if ([string]$event.goal -cne [string]$State.goal_id) { throw 'Journal contém evento de outro goal.' }
    }
    return $true
}

function Get-AgenticTextSha256 {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-AgenticBytesSafely {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$BasePath = $script:AgenticRepoRoot)
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $Path -BasePath $BasePath | Out-Null
        $buffer = New-Object IO.MemoryStream
        try { $stream.CopyTo($buffer); return ,([byte[]]$buffer.ToArray()) }
        finally { $buffer.Dispose() }
    }
    finally { $stream.Dispose() }
}

function Save-AgenticTerminalJournal {
    param([Parameter(Mandatory = $true)]$State, [string]$JournalPath = $script:AgenticJournalPath)
    if (-not (Test-Path -LiteralPath $JournalPath -PathType Leaf)) { return $null }
    $text = Read-AgenticTextSafely -Path $JournalPath
    $header = Get-AgenticJournalHeader -JournalText $text
    if ([string]$header.goal_id -cne [string]$State.goal_id) { throw 'Não é possível arquivar journal terminal de outro goal.' }
    $historyDirectory = Join-Path (Split-Path -Parent $JournalPath) 'history'
    [IO.Directory]::CreateDirectory($historyDirectory) | Out-Null
    $digest = Get-AgenticTextSha256 -Text $text
    $target = Join-Path $historyDirectory ('{0}-{1}.md' -f $State.goal_id, $digest.Substring(0, 12))
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { Write-AgenticBytesSafely -Path $target -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($text)) }
    return $target
}

function Get-AgenticCommitPaths {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ChangedPaths)

    return @($ChangedPaths | ForEach-Object { ([string]$_).Replace('\', '/') } | Where-Object { $_ -and -not (Test-AgenticSupervisorPath -Path $_) } | Sort-Object -Unique)
}

function Get-AgenticFileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$BasePath = $script:AgenticRepoRoot)

    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $Path -BasePath $BasePath | Out-Null
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally { $stream.Dispose(); $sha256.Dispose() }
}

function Get-AgenticJournalEvents {
    param([Parameter(Mandatory = $true)][string]$JournalText)

    foreach ($block in [regex]::Split($JournalText, '(?m)(?=^## )')) {
        $heading = [regex]::Match($block, '(?m)^## (?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) - (?<goal>.+?) - iteracao (?<iteration>\d+)\s*$')
        if (-not $heading.Success) { continue }
        $fields = @{}
        foreach ($match in [regex]::Matches($block, '(?m)^- (?<key>[a-z_]+): (?<value>.*)$')) {
            $fields[$match.Groups['key'].Value] = $match.Groups['value'].Value.Trim()
        }
        $requiredFields = @('state', 'controller', 'actor', 'delegated_agent', 'action', 'files_changed', 'result')
        if (@($requiredFields | Where-Object { -not $fields.ContainsKey($_) }).Count -gt 0) { continue }
        if (@($requiredFields | Where-Object { [string]::IsNullOrWhiteSpace([string]$fields[$_]) }).Count -gt 0) { continue }
        $fields['timestamp'] = $heading.Groups['timestamp'].Value
        $fields['goal'] = $heading.Groups['goal'].Value
        $fields['iteration'] = $heading.Groups['iteration'].Value
        [pscustomobject]$fields
    }
}

function Test-AgenticImplementerProvenance {
    param(
        [Parameter(Mandatory = $true)][string]$GoalId,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$FunctionalPaths,
        [Parameter(Mandatory = $true)][string]$JournalText
    )

    $events = @(Get-AgenticJournalEvents -JournalText $JournalText)
    foreach ($path in $FunctionalPaths) {
        $normalized = ([string]$path).Replace('\', '/').ToLowerInvariant()
        $valid = $false
        for ($eventIndex = 0; $eventIndex -lt $events.Count; $eventIndex++) {
            $event = $events[$eventIndex]
            $eventPaths = @(([string]$event.files_changed -split '\s*[,;]\s*') | Where-Object { $_ -and $_ -notmatch '[*?\[\]]' } | ForEach-Object { $_.Replace('\', '/').ToLowerInvariant() })
            if ($event.goal -cne $GoalId -or $event.state -ne 'IMPLEMENTING' -or $event.controller -ne 'supervisor' -or $event.actor -ne 'implementer' -or [string]::IsNullOrWhiteSpace([string]$event.action) -or $event.result -cne 'PASS' -or $eventPaths -notcontains $normalized) { continue }
            for ($priorIndex = 0; $priorIndex -lt $eventIndex; $priorIndex++) {
                $prior = $events[$priorIndex]
                if ($prior.goal -ceq $GoalId -and $prior.goal -ceq $event.goal -and $prior.controller -eq 'supervisor' -and $prior.actor -eq 'supervisor' -and $prior.delegated_agent -eq 'implementer' -and -not [string]::IsNullOrWhiteSpace([string]$prior.action)) {
                    $valid = $true
                    break
                }
            }
            if ($valid) { break }
        }
        if (-not $valid) { throw "Provenance bloqueada: arquivo funcional sem evento PASS do implementer e delegacao verificavel: $path" }
    }
    return $true
}

function Get-AgenticAllowedGoalFiles {
    param([Parameter(Mandatory = $true)][hashtable]$Metadata)

    $raw = [string]$Metadata["Allowed files"]
    if ([string]::IsNullOrWhiteSpace($raw) -or $raw -eq "none") { return @() }
    return @($raw -split "," | ForEach-Object { $_.Trim().Replace('\', '/') } | Where-Object { $_ })
}

function Get-AgenticRequestEnvelopeHash {
    param([Parameter(Mandatory = $true)]$Envelope)
    $receivedAt = [string]$Envelope.received_at
    if ($Envelope.received_at -is [DateTime]) { $receivedAt = $Envelope.received_at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [Globalization.CultureInfo]::InvariantCulture) }
    elseif ($Envelope.received_at -is [DateTimeOffset]) { $receivedAt = $Envelope.received_at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [Globalization.CultureInfo]::InvariantCulture) }
    $values = @(
        [string]$Envelope.schema_version,
        [string]$Envelope.request_id,
        $receivedAt,
        [string]$Envelope.target_repository,
        [string]$Envelope.request_type_hint,
        [string]$Envelope.user_requirement_verbatim,
        [string]$Envelope.source
    )
    $canonical = @($values | ForEach-Object { [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($_)) }) -join "."
    return Get-AgenticTextSha256 -Text $canonical
}

function Assert-AgenticRequestEnvelope {
    param([Parameter(Mandatory = $true)]$Envelope, [string]$RepositoryName = (Split-Path -Leaf $script:AgenticRepoRoot))
    $required = @('schema_version', 'request_id', 'received_at', 'target_repository', 'request_type_hint', 'user_requirement_verbatim', 'source', 'content_sha256')
    foreach ($field in $required) { if ($null -eq $Envelope.PSObject.Properties[$field]) { throw "Request Envelope inválido: campo '$field' ausente." } }
    $unknown = @($Envelope.PSObject.Properties.Name | Where-Object { $_ -cnotin $required })
    if ($unknown.Count -gt 0) { throw 'Request Envelope contém campos não permitidos.' }
    if ([int]$Envelope.schema_version -ne 1) { throw 'Request Envelope schema_version não suportada.' }
    if ([string]$Envelope.request_id -cnotmatch '^req-[0-9a-f]{32}$') { throw 'Request Envelope request_id não é canônico.' }
    if ([string]$Envelope.target_repository -cne $RepositoryName) { throw 'Request Envelope direcionado a outro repositório.' }
    if ([string]$Envelope.request_type_hint -cnotin @('feature', 'fix', 'hotfix')) { throw 'Request Envelope request_type_hint inválido.' }
    if ([string]$Envelope.source -cne 'codex-desktop') { throw 'Request Envelope source não confiável.' }
    if ([string]::IsNullOrWhiteSpace([string]$Envelope.user_requirement_verbatim) -or ([string]$Envelope.user_requirement_verbatim).Length -gt 100000) { throw 'Request Envelope requirement ausente ou excede o limite.' }
    $receivedAt = [DateTimeOffset]::MinValue
    $timestampText = if ($Envelope.received_at -is [DateTime]) { $Envelope.received_at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [Globalization.CultureInfo]::InvariantCulture) } else { [string]$Envelope.received_at }
    if ($timestampText -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' -or -not [DateTimeOffset]::TryParse($timestampText, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$receivedAt)) { throw 'Request Envelope received_at inválido.' }
    if ([string]$Envelope.content_sha256 -cnotmatch '^[0-9a-f]{64}$' -or (Get-AgenticRequestEnvelopeHash -Envelope $Envelope) -cne [string]$Envelope.content_sha256) { throw 'Request Envelope hash inválido.' }
    $sensitivePatterns = @(
        '(?i)\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/-]{8,}={0,2}',
        '(?i)\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
        '(?i)\b(?:password|passwd|secret|token|jwt|api[_ -]?key|private[_ -]?key|connection[_ -]?string)\s*[:=]\s*\S+',
        '(?i)-----BEGIN\s+(?:[A-Z0-9 ]+\s+)?PRIVATE KEY-----',
        '(?i)\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^@\s/]+@'
    )
    foreach ($pattern in $sensitivePatterns) { if ([string]$Envelope.user_requirement_verbatim -match $pattern) { throw 'Request Envelope rejeitado: conteúdo sensível detectado; valor omitido.' } }
    return $Envelope
}

function Write-AgenticImmutableJsonArtifact {
    param([Parameter(Mandatory = $true)][string]$RelativePath, [Parameter(Mandatory = $true)]$Value)
    if ($RelativePath -match '[*?]|(^|/)\.\.?(/|$)|^/|^[A-Za-z]:|\\|(^|/)\.git(/|$)') { throw 'Artifact path inválido.' }
    $fullPath = Join-Path $script:AgenticRepoRoot ($RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 30) + [Environment]::NewLine)
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $existing = Read-AgenticBytesSafely -Path $fullPath
        if ((Get-AgenticBytesSha256 -Bytes $existing) -cne (Get-AgenticBytesSha256 -Bytes $bytes)) { throw 'Artifact imutável já existe com conteúdo diferente.' }
    }
    else { Write-AgenticBytesSafely -Path $fullPath -Bytes $bytes }
    return [pscustomobject]@{ Path = $RelativePath; Sha256 = Get-AgenticFileSha256 -Path $fullPath }
}

function Get-AgenticVerificationDigest {
    param([Parameter(Mandatory=$true)]$Artifact)
    $body=[ordered]@{}
    foreach($property in $Artifact.PSObject.Properties){if($property.Name -cne 'artifact_sha256'){$body[$property.Name]=$property.Value}}
    return Get-AgenticTextSha256 -Text ($body|ConvertTo-Json -Depth 20 -Compress)
}

function New-AgenticVerificationArtifact {
    param([Parameter(Mandatory=$true)][string]$VerificationType,[Parameter(Mandatory=$true)][string]$RequestId,[Parameter(Mandatory=$true)][string]$InvocationId,[Parameter(Mandatory=$true)][string]$SnapshotSha256,[Parameter(Mandatory=$true)][ValidateSet('PASS','FAIL','BLOCKED')][string]$Status,[Parameter(Mandatory=$true)][AllowEmptyCollection()][string[]]$Evidence,[Parameter(Mandatory=$true)][AllowEmptyCollection()][string[]]$Findings,[string]$Failure)
    if($VerificationType -cnotin @('OBSERVABILITY_VERIFICATION','REQUIREMENT_VERIFICATION','SCOPE_DIFF_VERIFICATION')){throw 'Unknown verification type.'}
    if($RequestId -cnotmatch '^req-[0-9a-f]{32}$' -or $InvocationId -cnotmatch '^[0-9a-f]{32}$' -or $SnapshotSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'Verification identity or snapshot is invalid.'}
    if($Status -eq 'PASS' -and $Evidence.Count -eq 0){throw 'Verification PASS requires evidence.'}
    if($Status -eq 'FAIL' -and $Findings.Count -eq 0){throw 'Verification FAIL requires findings.'}
    if($Status -eq 'BLOCKED' -and [string]::IsNullOrWhiteSpace($Failure)){throw 'Verification BLOCKED requires an objective external condition.'}
    $body=[ordered]@{schema_version=1;verification_type=$VerificationType;request_id=$RequestId;invocation_id=$InvocationId;snapshot_sha256=$SnapshotSha256;status=$Status;evidence=@($Evidence|ForEach-Object{ConvertTo-AgenticSanitizedText -Text $_ -MaximumLength 1000});findings=@($Findings|ForEach-Object{ConvertTo-AgenticSanitizedText -Text $_ -MaximumLength 1000});failure=$(if($Failure){ConvertTo-AgenticSanitizedText -Text $Failure -MaximumLength 500}else{$null});timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
    $artifact=[pscustomobject]$body
    $artifact|Add-Member -NotePropertyName artifact_sha256 -NotePropertyValue (Get-AgenticVerificationDigest $artifact)
    return $artifact
}

function Assert-AgenticVerificationArtifact {
    param([Parameter(Mandatory=$true)]$Artifact,[Parameter(Mandatory=$true)][string]$RequestId,[Parameter(Mandatory=$true)][string]$SnapshotSha256,[string]$VerificationType)
    $required=@('schema_version','verification_type','request_id','invocation_id','snapshot_sha256','status','evidence','findings','failure','timestamp','artifact_sha256')
    $names=@($Artifact.PSObject.Properties.Name)
    if(@($names|Where-Object{$_ -cnotin $required}).Count -gt 0 -or @($required|Where-Object{$_ -cnotin $names}).Count -gt 0){throw 'Verification artifact fields are invalid.'}
    if([int]$Artifact.schema_version -ne 1 -or [string]$Artifact.request_id -cne $RequestId -or [string]$Artifact.snapshot_sha256 -cne $SnapshotSha256 -or [string]$Artifact.verification_type -notin @('OBSERVABILITY_VERIFICATION','REQUIREMENT_VERIFICATION','SCOPE_DIFF_VERIFICATION')){throw 'Verification artifact identity or snapshot mismatch.'}
    if($VerificationType -and [string]$Artifact.verification_type -cne $VerificationType){throw 'Verification type mismatch.'}
    if([string]$Artifact.status -cnotin @('PASS','FAIL','BLOCKED') -or [string]$Artifact.invocation_id -cnotmatch '^[0-9a-f]{32}$' -or [string]$Artifact.artifact_sha256 -cne (Get-AgenticVerificationDigest $Artifact)){throw 'Verification artifact integrity/status is invalid.'}
    if($Artifact.status -eq 'PASS' -and @($Artifact.evidence).Count -eq 0){throw 'Verification PASS has no evidence.'}
    if($Artifact.status -eq 'FAIL' -and @($Artifact.findings).Count -eq 0){throw 'Verification FAIL has no findings.'}
    if($Artifact.status -eq 'BLOCKED' -and [string]::IsNullOrWhiteSpace([string]$Artifact.failure)){throw 'Verification BLOCKED has no external cause.'}
    return $true
}

function Assert-AgenticStateVerification {
    param($State,[string]$Type,[string]$ExpectedStatus='PASS')
    $field=switch($Type){'OBSERVABILITY_VERIFICATION'{'observability_verification_path'}'REQUIREMENT_VERIFICATION'{'requirement_verification_path'}'SCOPE_DIFF_VERIFICATION'{'scope_verification_path'}default{throw 'Unknown verification type.'}}
    $relative=[string]$State.$field
    if([string]::IsNullOrWhiteSpace($relative)){throw "Missing persisted $Type evidence."}
    $path=Join-Path $script:AgenticRepoRoot $relative
    $artifact=Read-AgenticTextSafely -Path $path|ConvertFrom-Json
    Assert-AgenticVerificationArtifact -Artifact $artifact -RequestId ([string]$State.request_id) -SnapshotSha256 ([string]$State.approved_snapshot_sha256) -VerificationType $Type|Out-Null
    if([string]$artifact.status -cne $ExpectedStatus -or [string]$State.($Type -replace '_VERIFICATION','_status') -cne $ExpectedStatus){throw "$Type status is not validated $ExpectedStatus evidence."}
    return $artifact
}

function Invoke-AgenticVerificationEngine {
    param([Parameter(Mandatory=$true)][string]$VerificationType,[Parameter(Mandatory=$true)]$State,[Parameter(Mandatory=$true)][string]$InvocationId,[Parameter(Mandatory=$true)][AllowEmptyCollection()][string[]]$Evidence,[Parameter(Mandatory=$true)][AllowEmptyCollection()][string[]]$Findings,[string]$Failure)
    $status=if($Failure){'BLOCKED'}elseif($Findings.Count -gt 0){'FAIL'}else{'PASS'}
    $artifact=New-AgenticVerificationArtifact -VerificationType $VerificationType -RequestId ([string]$State.request_id) -InvocationId $InvocationId -SnapshotSha256 ([string]$State.approved_snapshot_sha256) -Status $status -Evidence $Evidence -Findings $Findings -Failure $Failure
    Assert-AgenticVerificationArtifact -Artifact $artifact -RequestId ([string]$State.request_id) -SnapshotSha256 ([string]$State.approved_snapshot_sha256) -VerificationType $VerificationType|Out-Null
    $relative="agentic/state/verifications/$($State.request_id)/$InvocationId-$VerificationType.json"
    $persisted=Write-AgenticImmutableJsonArtifact -RelativePath $relative -Value $artifact
    if($persisted.Sha256 -ne (Get-AgenticFileSha256 -Path (Join-Path $script:AgenticRepoRoot $relative))){throw 'Persisted verification artifact hash mismatch.'}
    return [pscustomobject]@{artifact=$artifact;path=$relative;file_sha256=$persisted.Sha256}
}

function Invoke-AgenticRequirementVerification {
    param($State,[string]$InvocationId,[string[]]$AcceptanceCriteria,[string[]]$DodCriteria,$TesterEvidence,$Envelope)
    $findings=[Collections.Generic.List[string]]::new();$evidence=[Collections.Generic.List[string]]::new()
    if($null -eq $Envelope){$findings.Add('Immutable Request Envelope is unavailable for independent verification.')}else{Assert-AgenticRequestEnvelope -Envelope $Envelope|Out-Null;if([string]$Envelope.request_id -cne [string]$State.request_id){$findings.Add('Request Envelope identity differs from active request.')}else{$evidence.Add("request_sha256=$($Envelope.content_sha256)");$evidence.Add("requirement_present=$(-not [string]::IsNullOrWhiteSpace([string]$Envelope.user_requirement_verbatim))")}}
    foreach($criterion in @($AcceptanceCriteria)+@($DodCriteria)){
        $id=([string]$criterion -split ':',2)[0].Trim()
        $proof=@($TesterEvidence|Where-Object{[string]$_.criterion_id -ceq $id -and [string]$_.status -ceq 'PASS' -and -not [string]::IsNullOrWhiteSpace([string]$_.evidence)}|Select-Object -First 1)
        if($proof.Count -eq 0){$findings.Add("Missing passing implementation evidence for $id.")}else{$evidence.Add("$id => $($proof[0].evidence)")}
    }
    if(@($AcceptanceCriteria).Count+@($DodCriteria).Count -eq 0){$findings.Add('Specification contains no acceptance or DOD criteria.')}
    return Invoke-AgenticVerificationEngine -VerificationType 'REQUIREMENT_VERIFICATION' -State $State -InvocationId $InvocationId -Evidence @($evidence) -Findings @($findings)
}

function Invoke-AgenticScopeVerification {
    param($State,[string]$InvocationId,[string[]]$ActualPaths,[string[]]$ApprovedPaths,[string]$ActualSnapshotSha256)
    $findings=[Collections.Generic.List[string]]::new();$normalizedActual=@($ActualPaths|ForEach-Object{([string]$_).Replace('\','/')}|Sort-Object -Unique);$normalizedApproved=@($ApprovedPaths|ForEach-Object{([string]$_).Replace('\','/')}|Sort-Object -Unique)
    foreach($path in $normalizedActual){if($path -notin $normalizedApproved){$findings.Add("Unapproved changed path: $path")}}
    foreach($path in $normalizedApproved){if($path -notin $normalizedActual){$findings.Add("Approved path missing from actual diff: $path")}}
    if($normalizedActual.Count -eq 0){$findings.Add('No changed paths were provided for scope verification.')}
    if($ActualSnapshotSha256 -cne [string]$State.approved_snapshot_sha256){$findings.Add('Actual diff snapshot differs from approved snapshot.')}
    $evidence=@("actual_paths=$($normalizedActual -join ',')","approved_paths=$($normalizedApproved -join ',')","actual_snapshot=$ActualSnapshotSha256","approved_snapshot=$($State.approved_snapshot_sha256)")
    return Invoke-AgenticVerificationEngine -VerificationType 'SCOPE_DIFF_VERIFICATION' -State $State -InvocationId $InvocationId -Evidence $evidence -Findings @($findings)
}

function Invoke-AgenticObservabilityVerification {
    param($State,[string]$InvocationId,[string[]]$Paths,[string[]]$RequiredDiagnostics=@())
    $evidence=[Collections.Generic.List[string]]::new();$findings=[Collections.Generic.List[string]]::new()
    foreach($relative in $Paths){
        $full=Join-Path $script:AgenticRepoRoot $relative
        if(-not(Test-Path -LiteralPath $full -PathType Leaf)){$findings.Add("Changed file unavailable for observability inspection: $relative");continue}
        $content=Read-AgenticTextSafely -Path $full;$evidence.Add("inspected=$relative;sha256=$(Get-AgenticFileSha256 $full)")
        if($content -match '(?im)\b(?:console\.(?:log|debug)|Write-Host)\s*\([^\r\n]*(?:token|password|secret|authorization|email)'){ $findings.Add("Potential sensitive/debug logging in $relative") }
        if($content -match '(?is)catch\s*(?:\([^)]*\))?\s*\{\s*\}'){$findings.Add("Swallowed empty catch block in $relative")}
        foreach($required in $RequiredDiagnostics){if($content -notmatch [regex]::Escape($required)){$findings.Add("Required diagnosability marker absent from ${relative}: $required")}}
    }
    if($Paths.Count -eq 0){$findings.Add('No changed files were inspected.')}
    return Invoke-AgenticVerificationEngine -VerificationType 'OBSERVABILITY_VERIFICATION' -State $State -InvocationId $InvocationId -Evidence @($evidence) -Findings @($findings)
}

function New-AgenticPreflightResultArtifact {
    param([Parameter(Mandatory = $true)]$Envelope, [Parameter(Mandatory = $true)][string]$BaseBranch, [Parameter(Mandatory = $true)][string]$BaseSha, [Parameter(Mandatory = $true)][string]$InvocationId, [Parameter(Mandatory = $true)][string]$Status, [Parameter(Mandatory = $true)][string[]]$Evidence)
    if ($Status -cnotin @('SATISFIED', 'NOT_SATISFIED', 'BLOCKED')) { throw 'Preflight status inválido.' }
    if ($BaseSha -cnotmatch '^[0-9a-f]{40,64}$' -or $InvocationId -cnotmatch '^[0-9a-f]{32}$') { throw 'Preflight provenance inválida.' }
    if ($Evidence.Count -eq 0 -or @($Evidence | Where-Object { [string]::IsNullOrWhiteSpace([string]$_) }).Count -gt 0) { throw 'Preflight evidence é obrigatória.' }
    $artifact = [ordered]@{
        schema_version = 1; request_id = [string]$Envelope.request_id; base_branch = $BaseBranch; base_sha = $BaseSha
        evaluator_role = 'architect'; invocation_id = $InvocationId; status = $Status
        evidence = @($Evidence | ForEach-Object { ConvertTo-AgenticSanitizedText -Text ([string]$_) -MaximumLength 500 })
        timestamp = [DateTimeOffset]::UtcNow.ToString('o')
    }
    $digestInput = $artifact | ConvertTo-Json -Depth 10 -Compress
    $artifact.artifact_sha256 = Get-AgenticTextSha256 -Text $digestInput
    return [pscustomobject]$artifact
}

function Assert-AgenticPreflightResultArtifact {
    param([Parameter(Mandatory = $true)]$Artifact, [Parameter(Mandatory = $true)]$Envelope, [Parameter(Mandatory = $true)][string]$BaseBranch, [Parameter(Mandatory = $true)][string]$BaseSha)
    foreach ($pair in @(@('request_id', [string]$Envelope.request_id), @('base_branch', $BaseBranch), @('base_sha', $BaseSha), @('evaluator_role', 'architect'))) {
        if ([string]$Artifact.($pair[0]) -cne [string]$pair[1]) { throw "Preflight artifact identity mismatch: $($pair[0])." }
    }
    if ([string]$Artifact.status -cnotin @('SATISFIED', 'NOT_SATISFIED', 'BLOCKED') -or @($Artifact.evidence).Count -eq 0 -or [string]$Artifact.invocation_id -cnotmatch '^[0-9a-f]{32}$') { throw 'Preflight artifact incompleto ou inválido.' }
    $copy = [ordered]@{}
    foreach ($property in $Artifact.PSObject.Properties) { if ($property.Name -cne 'artifact_sha256') { $copy[$property.Name] = $property.Value } }
    $expectedHash = Get-AgenticTextSha256 -Text ($copy | ConvertTo-Json -Depth 10 -Compress)
    if ([string]$Artifact.artifact_sha256 -cne $expectedHash) { throw 'Preflight artifact SHA-256 inválido.' }
    return $true
}

function Assert-AgenticDor {
    param([Parameter(Mandatory = $true)]$Specification)
    $requiredIds = @('DOR-01','DOR-02','DOR-03','DOR-04','DOR-05','DOR-06','DOR-07','DOR-08','DOR-09','DOR-10')
    $items = @($Specification.dor)
    if($items.Count -ne $requiredIds.Count){throw 'DOR must contain each of the ten canonical items exactly once.'}
    foreach ($id in $requiredIds) {
        $matches = @($items | Where-Object { [string]$_.id -ceq $id })
        if ($matches.Count -ne 1) { throw "DOR validation failed at ${id}: item ausente ou duplicado." }
        $item = $matches[0]
        if([string]$item.status -cnotin @('PASS','FAIL','BLOCKED','NOT_APPLICABLE')){throw "DOR status invalid at ${id}."}
        if ([string]$item.status -ceq 'PASS') { continue }
        if ([string]$item.status -cne 'NOT_APPLICABLE' -or [bool]$item.required -or [string]::IsNullOrWhiteSpace([string]$item.rationale)) { throw "DOR validation failed at $id." }
    }
    if ([string]$Specification.complexity -cnotin @('MM','ME','CX','TR')) { throw 'Specification complexity inválida.' }
    foreach ($field in @('requirement','context','architecture','dependencies','scope','out_of_scope','acceptance_criteria','dod','implementation_plan','test_strategy','security_requirements','observability_requirements')) {
        $property = $Specification.PSObject.Properties[$field]
        if ($null -eq $property -or ($property.Value -is [string] -and [string]::IsNullOrWhiteSpace([string]$property.Value)) -or ($property.Value -is [System.Collections.IEnumerable] -and $property.Value -isnot [string] -and @($property.Value).Count -eq 0)) { throw "Specification missing required section/data: $field." }
    }
    return $true
}

function New-AgenticSpecificationMarkdown {
    param([Parameter(Mandatory = $true)]$Payload, [Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Title)
    Assert-AgenticDor -Specification $Payload | Out-Null
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('# Execution Specification'); $lines.Add(''); $lines.Add('Schema Version: 1'); $lines.Add("Request ID: $($State.request_id)")
    $lines.Add("Title: $Title"); $lines.Add("Created At: $([DateTimeOffset]::UtcNow.ToString('o'))"); $lines.Add("Updated At: $([DateTimeOffset]::UtcNow.ToString('o'))")
    $lines.Add("Base Branch: $($State.base_branch)"); $lines.Add("Base SHA: $($State.base_sha)"); $lines.Add("Work Branch: $($State.branch)")
    $lines.Add("Complexity: $($Payload.complexity)"); $lines.Add('Specification Version: 1'); $lines.Add("Lifecycle State: $($State.state)"); $lines.Add('Specification SHA256: pending'); $lines.Add('')
    $sections = @(
        @('1. Requirement', $Payload.requirement), @('2. Context', $Payload.context), @('3. Architecture', $Payload.architecture),
        @('4. Dependencies', $Payload.dependencies), @('5. Scope', $Payload.scope), @('6. Out of Scope', $Payload.out_of_scope),
        @('7. Acceptance Criteria', $Payload.acceptance_criteria), @('8. Definition of Ready', $Payload.dor),
        @('9. Definition of Done', $Payload.dod), @('10. Complexity', $Payload.complexity), @('11. Implementation Plan', $Payload.implementation_plan),
        @('12. Test Strategy', $Payload.test_strategy), @('13. Security Requirements', $Payload.security_requirements), @('14. Observability Requirements', $Payload.observability_requirements),
        @('15. Implementation Result', 'PENDING'), @('16. Tester Result', 'PENDING'), @('17. Reviewer Result', 'PENDING'), @('18. Security Result', 'PENDING'),
        @('19. Quality Gates', 'PENDING'), @('20. Observability Verification', 'PENDING'), @('21. Requirement Verification', 'PENDING'), @('22. Scope Verification', 'PENDING'),
        @('23. Final Status', [string]$State.state), @('24. Residual Risks', @()), @('25. Evidence Index', @("Request Envelope: $($State.request_envelope_path)", "Preflight Result: $($State.preflight_result_path)"))
    )
    foreach ($section in $sections) {
        $lines.Add("## $($section[0])"); $value = $section[1]
        if ($value -is [string]) { $lines.Add($value) }
        else { $lines.Add('```json'); $lines.Add(($value | ConvertTo-Json -Depth 20)); $lines.Add('```') }
        $lines.Add('')
    }
    return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
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

function Set-AgenticSpecificationProjection {
    param([Parameter(Mandatory=$true)]$State,[Parameter(Mandatory=$true)][ValidateSet('Implementation Result','Tester Result','Reviewer Result','Security Result','Quality Gates','Observability Verification','Requirement Verification','Scope Verification','Final Status')][string]$Section,[Parameter(Mandatory=$true)]$Value)
    if([string]::IsNullOrWhiteSpace([string]$State.specification_path)){throw 'Canonical Specification path is absent.'}
    $path=Join-Path $script:AgenticRepoRoot ([string]$State.specification_path)
    Assert-AgenticNoReparsePoints -Path $path -BasePath $script:AgenticRepoRoot -RequireLeaf|Out-Null
    $text=Read-AgenticTextSafely -Path $path
    $number=switch($Section){'Implementation Result'{15}'Tester Result'{16}'Reviewer Result'{17}'Security Result'{18}'Quality Gates'{19}'Observability Verification'{20}'Requirement Verification'{21}'Scope Verification'{22}'Final Status'{23}}
    $heading="## $number. $Section"
    $next=[regex]::Escape($heading)+'(?s).*?(?=\r?\n## |\z)'
    if($text -notmatch $next){throw "Canonical Specification section missing: $Section."}
    $json=ConvertTo-Json -InputObject (ConvertTo-AgenticSanitizedArtifactValue -Value $Value) -Depth 12
    $replacement=$heading+"`n"+'```json'+"`n$json`n"+'```'
    $updated=[regex]::Replace($text,$next,[System.Text.RegularExpressions.MatchEvaluator]{param($m)$replacement},1)
    Write-AgenticBytesSafely -Path $path -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($updated))
    $State.specification_sha256=Get-AgenticFileSha256 -Path $path
    return $State.specification_sha256
}

function Get-AgenticTextWhitespaceErrors {
    param([AllowNull()][AllowEmptyString()][string]$Text)

    $errors = [System.Collections.Generic.List[string]]::new()
    if ($null -eq $Text) { return @() }
    $lines = [regex]::Split($Text, "\r\n|\n|\r")
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '[\t ]+$') { $errors.Add("trailing whitespace at line $($index + 1)") }
    }
    $endingNewlines = [regex]::Match($Text, '(?:\r\n|\n|\r)+\z').Value
    if ([regex]::Matches($endingNewlines, '\r\n|\n|\r').Count -gt 1) { $errors.Add("blank line at end of file") }
    return @($errors.ToArray())
}

function Assert-AgenticFileWhitespaceClean {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    $whitespaceErrors = @(Get-AgenticTextWhitespaceErrors -Text $Text)
    if ($whitespaceErrors.Count -gt 0) { throw "Whitespace inválido em arquivo funcional commitável: $Path ($($whitespaceErrors[0]))." }
    return $true
}

function Assert-AgenticFunctionalDiffCheck {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Paths)

    $functionalPaths = @($Paths | ForEach-Object { ([string]$_).Replace('\', '/') } | Where-Object { $_ -and -not (Test-AgenticSupervisorPath -Path $_) } | Sort-Object -Unique)
    if ($functionalPaths.Count -eq 0) { return $true }

    $pathspecs = @($functionalPaths | ForEach-Object { ":(literal)$_" })
    $trackedResult = Invoke-AgenticNativeProcess -FilePath "git" -Arguments (@("-C", $script:AgenticRepoRoot, "ls-files", "--") + $pathspecs)
    Assert-AgenticNativeProcessSucceeded -Result $trackedResult -CommandName "git ls-files"
    $trackedPaths = @($trackedResult.Output | ForEach-Object { ([string]$_).Replace('\', '/') } | Where-Object { $_ })
    $trackedSet = @{}
    foreach ($trackedPath in $trackedPaths) { $trackedSet[$trackedPath] = $true }

    if ($trackedPaths.Count -gt 0) {
        $trackedPathspecs = @($trackedPaths | ForEach-Object { ":(literal)$_" })
        foreach ($diffMode in @(@("diff", "--check"), @("diff", "--cached", "--check"))) {
            $diffResult = Invoke-AgenticNativeProcess -FilePath "git" -Arguments (@("-C", $script:AgenticRepoRoot) + $diffMode + @("--") + $trackedPathspecs)
            if ($diffResult.ExitCode -ne 0) { throw "Whitespace inválido no diff funcional (exit code $($diffResult.ExitCode))." }
        }
    }

    foreach ($path in $functionalPaths) {
        if ($trackedSet.ContainsKey($path)) { continue }
        $fullPath = Join-Path $script:AgenticRepoRoot ($path.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "Arquivo funcional não encontrado para validação de whitespace: $path" }
        $content = Read-AgenticTextSafely -Path $fullPath
        Assert-AgenticFileWhitespaceClean -Path $path -Text $content | Out-Null
    }
    return $true
}

function Get-AgenticGatePolicy {
    param([Parameter(Mandatory = $true)][string]$Classification, [string]$TypecheckStatus = 'REQUIRED', [string]$RuntimeTestsStatus = 'REQUIRED', [string[]]$Paths = @())
    $required = @('allowlist', 'diff_check', 'security_review', 'reviewer_review', 'staged_diff_check')
    $skipped = @()
    if ($Classification -eq 'documentation-only') {
        $required += @('markdown', 'whitespace')
        foreach ($name in @('npm_ci', 'lint', 'typecheck', 'build', 'runtime_tests')) { $skipped += [pscustomobject]@{ name = $name; status = 'NOT_APPLICABLE'; reason = 'Classificação documentation-only dispensa execução runtime.' } }
    }
    elseif ($Classification -eq 'runtime-code') {
        $required += @('npm_ci', 'lint', 'build', 'whitespace')
        if ($TypecheckStatus -eq 'REQUIRED') { $required += 'typecheck' }
        else { $skipped += [pscustomobject]@{ name = 'typecheck'; status = 'NOT_APPLICABLE'; reason = 'TypeScript/tsconfig não aplicável.' } }
        if ($RuntimeTestsStatus -eq 'REQUIRED') { $required += 'runtime_tests' }
        else { $skipped += [pscustomobject]@{ name = 'runtime_tests'; status = 'NOT_APPLICABLE'; reason = 'Nenhum script de runtime tests aplicável foi declarado.' } }
    }
    elseif ($Classification -eq 'runtime-infra') {
        $required += @('whitespace', 'supervisor_ast', 'supervisor_fixtures')
        $webRuntimePath = @($Paths | Where-Object { [string]$_ -match '^(app/|src/|core/|platform/|domains/|shared/|package(?:-lock)?\.json$|npm-shrinkwrap\.json$|Dockerfile(?:\..*)?$|docker-compose\.|next\.config\.|(?:ts|js)config|\.github/workflows/)' }).Count -gt 0
        if ($webRuntimePath) {
            $required += @('npm_ci', 'lint', 'build')
            if ($TypecheckStatus -eq 'REQUIRED') { $required += 'typecheck' }
            else { $skipped += [pscustomobject]@{ name = 'typecheck'; status = 'NOT_APPLICABLE'; reason = 'TypeScript/tsconfig não aplicável.' } }
            if ($RuntimeTestsStatus -eq 'REQUIRED') { $required += 'runtime_tests' }
            else { $skipped += [pscustomobject]@{ name = 'runtime_tests'; status = 'NOT_APPLICABLE'; reason = 'Nenhum script de runtime tests aplicável foi declarado.' } }
        }
        else {
            foreach ($name in @('npm_ci', 'lint', 'typecheck', 'build', 'runtime_tests')) { $skipped += [pscustomobject]@{ name = $name; status = 'NOT_APPLICABLE'; reason = 'Mudança de infraestrutura exclusiva do framework/supervisor; gates de aplicação não exercitam os arquivos alterados.' } }
        }
    }
    else { throw 'Classificação inválida ao resolver quality gates.' }
    return [pscustomobject]@{ Required = @($required | Select-Object -Unique); Skipped = @($skipped) }
}

function Resolve-AgenticRuntimeTestsCommand {
    param([string]$RepositoryRoot = $script:AgenticRepoRoot)
    $packagePath = Join-Path $RepositoryRoot 'package.json'
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { return [pscustomobject]@{ Status = 'NOT_APPLICABLE'; Command = $null; Reason = 'package.json ausente.' } }
    try { $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'package.json inválido durante resolução dos runtime tests.' }
    $scriptsProperty = $package.PSObject.Properties['scripts']
    $testProperty = if ($null -ne $scriptsProperty -and $null -ne $scriptsProperty.Value) { $scriptsProperty.Value.PSObject.Properties['test'] } else { $null }
    if ($null -ne $testProperty -and -not [string]::IsNullOrWhiteSpace([string]$testProperty.Value)) { return [pscustomobject]@{ Status = 'REQUIRED'; Command = 'npm test'; Reason = 'package.json declara scripts.test.' } }
    return [pscustomobject]@{ Status = 'NOT_APPLICABLE'; Command = $null; Reason = 'package.json não declara scripts.test.' }
}

function Set-AgenticGateResult {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string]$Status, [string]$Command, [Nullable[int]]$ExitCode, [string]$Reason, [string]$Classification, [string]$StartedAt, [string]$FinishedAt, [Nullable[double]]$DurationMs, [string]$EvidenceSummary)
    if ($Status -notin @('PASS', 'FAIL', 'NOT_APPLICABLE', 'PENDING')) { throw 'Status de gate inválido.' }
    $finished = if ([string]::IsNullOrWhiteSpace($FinishedAt)) { [DateTimeOffset]::UtcNow.ToString('o') } else { $FinishedAt }
    $started = if ([string]::IsNullOrWhiteSpace($StartedAt)) { $finished } else { $StartedAt }
    $duration = if ($null -eq $DurationMs) { 0.0 } else { [double]$DurationMs }
    $record = [pscustomobject]@{ name = $Name; status = $Status; command = $Command; classification = $(if ($Classification) { $Classification } else { [string]$State.change_classification }); started_at = $started; finished_at = $finished; duration_ms = $duration; exit_code = $ExitCode; reason = $Reason; evidence_summary = $EvidenceSummary; timestamp = $finished }
    $existing = @($State.gate_results | Where-Object { [string]$_.name -cne $Name })
    $State.gate_results = @($existing + $record)
    if ($null -ne $State.quality_gates.PSObject.Properties[$Name]) { $State.quality_gates.$Name = $Status }
    return $record
}

function Invoke-AgenticQualityGates {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][hashtable]$Metadata)
    $changed = @(Get-AgenticWorkingTreePaths)
    $commitPaths = @(Get-AgenticCommitPaths -ChangedPaths $changed)
    if ($commitPaths.Count -eq 0) { throw 'Nenhum arquivo funcional commitável para executar gates.' }
    $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
    foreach ($path in $commitPaths) {
        if ($allowed -cnotcontains $path) { throw "Arquivo fora da allowlist bloqueia quality gates: $path" }
    }
    Set-AgenticGateResult -State $State -Name 'allowlist' -Status 'PASS' -Command 'Validate goal Allowed files' -ExitCode 0 -Reason 'Todos os functional paths pertencem à allowlist explícita.' -EvidenceSummary ("{0} paths validados." -f $commitPaths.Count) | Out-Null
    $classification = Get-AgenticChangeClassification -Paths $commitPaths
    $typecheck = Resolve-AgenticTypecheckCommand
    $runtimeTests = Resolve-AgenticRuntimeTestsCommand
    $policy = Get-AgenticGatePolicy -Classification $classification -TypecheckStatus $typecheck.Status -RuntimeTestsStatus $runtimeTests.Status -Paths $commitPaths
    $State.change_classification = $classification
    $State.required_gates = @($policy.Required)
    $State.skipped_gates = @($policy.Skipped)
    $State.quality_gate_snapshot = Get-AgenticCommitSnapshot -Paths $commitPaths
    foreach ($skip in $policy.Skipped) { Set-AgenticGateResult -State $State -Name $skip.name -Status 'NOT_APPLICABLE' -Command $null -ExitCode $null -Reason $skip.reason -Classification $classification | Out-Null }
    $commands = @{
        npm_ci = @{ File = 'npm'; Args = @('ci'); Command = 'npm ci' }
        lint = @{ File = 'npm'; Args = @('run', 'lint'); Command = 'npm run lint' }
        build = @{ File = 'npm'; Args = @('run', 'build'); Command = 'npm run build' }
        typecheck = @{ File = ($typecheck.Command -split ' ')[0]; Args = @($typecheck.Command -split ' ' | Select-Object -Skip 1); Command = $typecheck.Command }
        runtime_tests = @{ File = 'npm'; Args = @('test'); Command = 'npm test' }
    }
    foreach ($gateName in $policy.Required) {
        if ($gateName -in @('allowlist', 'security_review', 'reviewer_review', 'staged_diff_check')) { continue }
        $startedAt = [DateTimeOffset]::UtcNow
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $exitCode = 0
        $reason = 'Gate concluído pelo supervisor no host.'
        $commandName = $null
        try {
            switch ($gateName) {
                'markdown' { $commandName = 'Markdown/text UTF-8 validation'; Assert-AgenticMarkdownText -Paths $commitPaths | Out-Null }
                'whitespace' { $commandName = 'trailing whitespace validation'; Assert-AgenticFileSetWhitespaceClean -Paths $commitPaths | Out-Null }
                'diff_check' { $commandName = 'git diff --check'; Assert-AgenticFunctionalDiffCheck -Paths $commitPaths | Out-Null }
                'supervisor_ast' {
                    $commandName = 'PowerShell AST parse'
                    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $script:AgenticRepoRoot 'scripts') -Filter '*.ps1' -File)) {
                        $tokens = $null; $errors = $null
                        [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
                        if ($errors.Count -gt 0) { throw ("AST parse falhou em {0}: {1}" -f $file.Name, $errors[0].Message) }
                    }
                }
                'supervisor_fixtures' {
                    $commandName = 'Agentic vNext L1/L2 deterministic fixtures'
                    $engine = Resolve-AgenticPowerShellEngine
                    $fixtureScript = Join-Path $script:AgenticRepoRoot 'scripts/agentic-supervisor-tests.ps1'
                    $native = Invoke-AgenticNativeProcess -FilePath $engine.Path -Arguments @('-NoProfile','-File',$fixtureScript) -CaptureStandardError
                    $exitCode = [int]$native.ExitCode
                    if ($exitCode -ne 0) { throw "Agentic vNext deterministic fixtures failed (exit code $exitCode)." }
                }
                default {
                    if (-not $commands.ContainsKey($gateName)) { throw "Gate requerido '$gateName' não possui executor do supervisor." }
                    $entry = $commands[$gateName]; $commandName = $entry.Command
                    Push-Location $script:AgenticRepoRoot
                    try { $native = Invoke-AgenticNativeProcess -FilePath $entry.File -Arguments $entry.Args -CaptureStandardError }
                    finally { Pop-Location }
                    $exitCode = [int]$native.ExitCode
                    if ($exitCode -ne 0) { throw "Gate '$gateName' falhou (exit code $exitCode)." }
                }
            }
            $watch.Stop(); $finishedAt = [DateTimeOffset]::UtcNow
            Set-AgenticGateResult -State $State -Name $gateName -Status 'PASS' -Command $commandName -ExitCode $exitCode -Reason $reason -Classification $classification -StartedAt $startedAt.ToString('o') -FinishedAt $finishedAt.ToString('o') -DurationMs $watch.Elapsed.TotalMilliseconds -EvidenceSummary 'Executado pelo supervisor PowerShell; saída sensível não persistida.' | Out-Null
        }
        catch {
            $watch.Stop(); $finishedAt = [DateTimeOffset]::UtcNow
            $reason = ConvertTo-AgenticSanitizedText -Text $_.Exception.Message
            if ($null -ne $script:AgenticLastNativeExitCode -and $gateName -in $commands.Keys) { $exitCode = [int]$script:AgenticLastNativeExitCode }
            Set-AgenticGateResult -State $State -Name $gateName -Status 'FAIL' -Command $commandName -ExitCode $exitCode -Reason $reason -Classification $classification -StartedAt $startedAt.ToString('o') -FinishedAt $finishedAt.ToString('o') -DurationMs $watch.Elapsed.TotalMilliseconds -EvidenceSummary 'Falha registrada; saída bruta não persistida.' | Out-Null
            throw
        }
    }
    Write-AgenticState -State $State
    return $State
}

function Assert-AgenticMarkdownText {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Paths)
    foreach ($path in $Paths) {
        if ($path -notmatch '^docs/.+\.md$') { throw "Arquivo fora das áreas documentais seguras: $path" }
        $fullPath = Join-Path $script:AgenticRepoRoot ($path.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
        $bytes = Read-AgenticBytesSafely -Path $fullPath
        if (@($bytes | Where-Object { $_ -eq 0 }).Count -gt 0) { throw "Markdown contém byte NUL: $path" }
        try { $text = [Text.UTF8Encoding]::new($false, $true).GetString($bytes) }
        catch { throw "Markdown não é UTF-8 válido: $path" }
        if ([string]::IsNullOrWhiteSpace($text)) { throw "Markdown vazio não passa validação textual: $path" }
        if ($text -match '(?m)^(<<<<<<<|=======|>>>>>>>)') { throw "Markdown contém marcador de conflito: $path" }
        if (([regex]::Matches($text, '(?m)^\s*```')).Count % 2 -ne 0) { throw "Markdown contém bloco de código não fechado: $path" }
    }
    return $true
}

function Assert-AgenticFileSetWhitespaceClean {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Paths)
    foreach ($path in $Paths) {
        $fullPath = Join-Path $script:AgenticRepoRoot ($path.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
        $text = Read-AgenticTextSafely -Path $fullPath
        Assert-AgenticFileWhitespaceClean -Path $path -Text $text | Out-Null
    }
    return $true
}

function Get-AgenticCommitSnapshot {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Paths)
    $entries = @()
    foreach ($path in @(Get-AgenticCommitPaths -ChangedPaths $Paths)) {
        $normalized = ([string]$path).Replace('\', '/')
        $fullPath = Join-Path $script:AgenticRepoRoot ($normalized.Replace('/', [IO.Path]::DirectorySeparatorChar))
        $statusLines = @(Invoke-AgenticGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all', '--', $normalized))
        $status = if ($statusLines.Count -gt 0) { ([string]$statusLines[0]).Substring(0, 2) } else { '  ' }
        $digest = if (Test-Path -LiteralPath $fullPath -PathType Leaf) { Get-AgenticFileSha256 -Path $fullPath } else { 'DELETED' }
        $entries += [pscustomobject]@{ path = $normalized; status = $status; sha256 = $digest }
    }
    return @($entries | Sort-Object path)
}

function Get-AgenticStableSnapshotSha256 {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Snapshot)
    $stableEntries = @($Snapshot | ForEach-Object { [pscustomobject]@{ path = [string]$_.path; sha256 = [string]$_.sha256 } } | Sort-Object path)
    return Get-AgenticTextSha256 -Text ($stableEntries | ConvertTo-Json -Depth 5 -Compress)
}

function Test-AgenticReadiness {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$CurrentBranch,
        [Parameter(Mandatory = $true)][string[]]$ChangedPaths,
        [string]$JournalText
    )

    if ([string]$State.state -ne 'READY_TO_COMMIT') { throw 'Readiness só pode ser validada em READY_TO_COMMIT.' }
    $requestId = [string]$Metadata['ID']
    if ($requestId -cne [string]$State.request_id -or $requestId -cne [string]$State.goal_id) { throw 'Request identity não corresponde ao checkpoint.' }
    if ([string]$State.branch -cne $CurrentBranch -or [string]$State.base_branch -cne [string]$Metadata['Base branch']) { throw 'Branch/base diverge do checkpoint.' }
    $expectedBranch = '{0}/{1}' -f [string]$Metadata['Branch prefix'], $requestId
    if ($CurrentBranch -cne $expectedBranch -or $CurrentBranch -in @('develop','main')) { throw 'Branch de trabalho não é fresh/canônica.' }
    if ([string]$State.base_sha -cnotmatch '^[0-9a-f]{40,64}$') { throw 'Trusted base SHA ausente ou inválido.' }
    $baseAncestor = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $script:AgenticRepoRoot, 'merge-base', '--is-ancestor', [string]$State.base_sha, 'HEAD')
    Assert-AgenticNativeProcessSucceeded -Result $baseAncestor -CommandName 'git merge-base captured base'

    $requestPath = Join-Path $script:AgenticRepoRoot ([string]$State.request_envelope_path)
    $request = Read-AgenticTextSafely -Path $requestPath | ConvertFrom-Json
    Assert-AgenticRequestEnvelope -Envelope $request | Out-Null
    if ([string]$request.request_id -cne $requestId -or [string]$request.content_sha256 -cne [string]$State.request_envelope_sha256) { throw 'Request Envelope identity/hash diverge.' }
    if ([string]::IsNullOrWhiteSpace([string]$State.preflight_result_path) -or [string]::IsNullOrWhiteSpace([string]$State.preflight_result_sha256)) { throw 'Preflight Result Artifact ausente.' }
    $preflightPath = Join-Path $script:AgenticRepoRoot ([string]$State.preflight_result_path)
    $preflight = Read-AgenticTextSafely -Path $preflightPath | ConvertFrom-Json
    Assert-AgenticPreflightResultArtifact -Artifact $preflight -Envelope $request -BaseBranch ([string]$State.base_branch) -BaseSha ([string]$State.base_sha) | Out-Null
    if ([string]$preflight.status -cne 'NOT_SATISFIED' -or (Get-AgenticFileSha256 -Path $preflightPath) -cne [string]$State.preflight_result_sha256) { throw 'Preflight artifact não aprova esta execução ou foi alterado.' }
    if ([string]::IsNullOrWhiteSpace([string]$State.specification_path) -or [string]::IsNullOrWhiteSpace([string]$State.specification_sha256)) { throw 'Execution Specification ausente.' }
    $specPath = Join-Path $script:AgenticRepoRoot ([string]$State.specification_path)
    if ((Get-AgenticFileSha256 -Path $specPath) -cne [string]$State.specification_sha256) { throw 'Execution Specification mudou depois da validação.' }

    $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
    if ($allowed.Count -eq 0 -or $ChangedPaths.Count -eq 0) { throw 'Scope aprovado ou change set vazio.' }
    foreach ($path in $ChangedPaths) {
        $normalized = ([string]$path).Replace('\','/')
        if (Test-AgenticSupervisorPath -Path $normalized) { continue }
        if ($allowed -cnotcontains $normalized) { throw "Arquivo fora do scope aprovado: $normalized" }
    }
    $functionalPaths = @(Get-AgenticCommitPaths -ChangedPaths $ChangedPaths)
    $classification = Get-AgenticChangeClassification -Paths $functionalPaths
    if ([string]$State.change_classification -cne $classification) { throw 'Change classification mudou; approvals stale.' }
    $typecheck = Resolve-AgenticTypecheckCommand; $runtimeTests = Resolve-AgenticRuntimeTestsCommand
    $policy = Get-AgenticGatePolicy -Classification $classification -TypecheckStatus $typecheck.Status -RuntimeTestsStatus $runtimeTests.Status -Paths $functionalPaths
    if (@($policy.Required | Where-Object { $_ -notin $State.required_gates }).Count -gt 0 -or @($State.required_gates | Where-Object { $_ -notin $policy.Required }).Count -gt 0) { throw 'Required gate set diverge da policy calculada.' }
    foreach ($gate in $policy.Required | Where-Object { $_ -notin @('security_review','reviewer_review','staged_diff_check') }) {
        $record = @($State.gate_results | Where-Object { [string]$_.name -ceq $gate } | Select-Object -Last 1)
        if ($record.Count -eq 0 -or [string]$record[0].status -cne 'PASS') { throw "Gate obrigatório '$gate' sem PASS." }
    }
    foreach ($skip in $policy.Skipped) {
        $record = @($State.gate_results | Where-Object { [string]$_.name -ceq $skip.name } | Select-Object -Last 1)
        if ($record.Count -eq 0 -or [string]$record[0].status -cne 'NOT_APPLICABLE' -or [string]::IsNullOrWhiteSpace([string]$record[0].reason)) { throw "NOT_APPLICABLE sem motivo para '$($skip.name)'." }
    }
    if ([string]$State.tester_status -cne 'PASS' -or [string]$State.security_review_status -cne 'PASS' -or [string]$State.code_review_status -cne 'PASS') { throw 'Tester, Security e Reviewer precisam de PASS independente.' }
    Assert-AgenticStateVerification -State $State -Type 'OBSERVABILITY_VERIFICATION'|Out-Null
    Assert-AgenticStateVerification -State $State -Type 'REQUIREMENT_VERIFICATION'|Out-Null
    Assert-AgenticStateVerification -State $State -Type 'SCOPE_DIFF_VERIFICATION'|Out-Null
    $snapshot = @(Get-AgenticCommitSnapshot -Paths $functionalPaths)
    $snapshotHash = Get-AgenticStableSnapshotSha256 -Snapshot $snapshot
    if ([string]$State.approved_snapshot_sha256 -cne $snapshotHash) { throw 'Snapshot atual não é o snapshot aprovado.' }
    foreach ($role in @('tester','reviewer','security')) {
        $roleEvidence = @($State.role_invocations | Where-Object { [string]$_.role -ceq $role -and [string]$_.status -ceq 'PASS' } | Select-Object -Last 1)
        if ($roleEvidence.Count -ne 1 -or [int]$roleEvidence[0].exit_code -ne 0 -or [string]$roleEvidence[0].snapshot_sha256 -cne $snapshotHash) { throw "Approval '$role' não está vinculada ao snapshot atual." }
        $currentInvocationId = switch ($role) { 'tester' { [string]$State.tester_invocation_id } 'reviewer' { [string]$State.reviewer_invocation_id } 'security' { [string]$State.security_invocation_id } }
        if ([string]$roleEvidence[0].invocation_id -cne $currentInvocationId) { throw "Approval '$role' não pertence à invocation aprovada corrente." }
        if ([string]$roleEvidence[0].command_fingerprint -notmatch '^[a-f0-9]{64}$') { throw "Invocation '$role' sem command fingerprint." }
        $artifactRel = [string]$roleEvidence[0].result_artifact_path
        $artifactFull = Join-Path $script:AgenticRepoRoot $artifactRel
        if (-not (Test-AgenticLocalResultArtifactPath -Path $artifactRel) -or -not (Test-Path -LiteralPath $artifactFull -PathType Leaf) -or (Get-AgenticFileSha256 -Path $artifactFull) -cne [string]$roleEvidence[0].result_artifact_sha256) { throw "Artifact '$role' ausente ou adulterado." }
    }
    $expectedSnapshot = @($State.quality_gate_snapshot | Sort-Object path)
    if ($expectedSnapshot.Count -ne $snapshot.Count) { throw 'Paths mudaram depois da aprovação.' }
    for ($index=0; $index -lt $snapshot.Count; $index++) { if ([string]$expectedSnapshot[$index].path -cne [string]$snapshot[$index].path -or [string]$expectedSnapshot[$index].sha256 -cne [string]$snapshot[$index].sha256) { throw 'Conteúdo mudou depois das aprovações downstream.' } }
    Assert-AgenticFunctionalDiffCheck -Paths $functionalPaths | Out-Null
    if ([string]::IsNullOrWhiteSpace($JournalText)) { $JournalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath }
    Test-AgenticImplementerProvenance -GoalId $requestId -FunctionalPaths $functionalPaths -JournalText $JournalText | Out-Null
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
        [string]$PullRequest.state -ceq "OPEN" -and
        [string]$PullRequest.headRefName -ceq $Branch -and
        [string]$PullRequest.baseRefName -ceq $BaseBranch -and
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
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Reason, $Diagnostic)

    $failed = $State | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $failed.state = "FAILED"
    $failed.last_failure = $Reason
    if ($null -ne $Diagnostic) { $failed.failure_diagnostic = $Diagnostic }
    $failed.pending_action = $null
    $failed.active_agent = $null
    if ($null -ne $failed.PSObject.Properties["updated_at"]) { $failed.updated_at = [DateTime]::UtcNow.ToString("o") }
    else { $failed | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) }
    return $failed
}

function Write-AgenticState {
    param([Parameter(Mandatory = $true)]$State)

    $State.updated_at = [DateTime]::UtcNow.ToString("o")
    $json = $State | ConvertTo-Json -Depth 20
    $encoding = [System.Text.UTF8Encoding]::new($false)
    $stateBytes = $encoding.GetBytes($json + [Environment]::NewLine)
    Write-AgenticBytesSafely -Path $script:AgenticStatePath -Bytes $stateBytes
}

function Add-AgenticJournalEvent {
    param(
        [Parameter(Mandatory = $true)][string]$Goal,
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][string]$Agent,
        [string]$Controller = "orchestrator",
        [string]$Actor,
        [string]$DelegatedAgent,
        [string[]]$FilesChanged,
        [Parameter(Mandatory = $true)][string]$Action,
        [Parameter(Mandatory = $true)][string]$Result,
        [string]$Gate = "n/a",
        [string]$Failure = "n/a",
        [string]$Retry = "registrado no estado estruturado",
        [string]$Quota = "n/a",
        [string]$Memory = "n/a",
        $Diagnostic
    )

    foreach ($fieldName in @("Goal", "State", "Agent", "Controller", "Action", "Result", "Gate", "Failure", "Retry", "Quota", "Memory")) {
        $fieldValue = [string](Get-Variable -Name $fieldName -ValueOnly)
        if ([string]::IsNullOrWhiteSpace($fieldValue)) { Set-Variable -Name $fieldName -Value "n/a" }
        else { Set-Variable -Name $fieldName -Value $fieldValue.Trim() }
    }
    if ([string]::IsNullOrWhiteSpace($Actor)) { $Actor = $Agent }
    else { $Actor = $Actor.Trim() }
    if ([string]::IsNullOrWhiteSpace($DelegatedAgent)) { $DelegatedAgent = "n/a" }
    else { $DelegatedAgent = $DelegatedAgent.Trim() }
    Assert-AgenticNoReparsePoints -Path $script:AgenticJournalPath -BasePath $script:AgenticRepoRoot -RequireLeaf | Out-Null
    $activeState = Get-AgenticState
    if ([string]$activeState.goal_id -cne $Goal) { throw 'Journal event goal_id differs from the active supervisor checkpoint.' }
    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $iteration = $activeState.iteration
    if ($null -eq $FilesChanged) { $FilesChanged = @(Get-AgenticSupervisorPaths) }
    $FilesChanged = @($FilesChanged | ForEach-Object { if ([string]::IsNullOrWhiteSpace([string]$_)) { "n/a" } else { ([string]$_).Trim() } })
    if ($FilesChanged.Count -eq 0) { $FilesChanged = @("n/a") }
    $event = @(
        "",
        "## $timestamp - $Goal - iteracao $iteration",
        "- state: $State",
        "- controller: $Controller",
        "- actor: $Actor",
        "- delegated_agent: $DelegatedAgent",
        "- action: $Action",
        "- files_changed: $($FilesChanged -join ', ')",
        "- decision: checkpoint persistido antes da acao; conteudo sensivel omitido",
        "- gate: $Gate",
        "- result: $Result",
        "- failure: $Failure",
        "- retry: $Retry",
        "- quota: $Quota",
        "- memory: $Memory"
    ) -join [Environment]::NewLine

    if ($null -ne $Diagnostic) {
        $diagnosticJson = $Diagnostic | ConvertTo-Json -Depth 5 -Compress
        $event += [Environment]::NewLine + "- diagnostic: $diagnosticJson"
    }

    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    if (-not (Test-Path -LiteralPath $script:AgenticJournalPath -PathType Leaf)) { throw 'Journal do goal ativo ausente; evento não será anexado.' }
    $journalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath
    $journalHeader = Get-AgenticJournalHeader -JournalText $journalText
    if ([string]$journalHeader.goal_id -cne $Goal) { throw 'Journal atual pertence a outro goal; evento recusado.' }
    $journalStream = [IO.File]::Open($script:AgenticJournalPath, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        Assert-AgenticOpenedPathWithinRoot -Stream $journalStream -Path $script:AgenticJournalPath -BasePath $script:AgenticRepoRoot | Out-Null
        $journalStream.Seek(0, [IO.SeekOrigin]::End) | Out-Null
        $eventBytes = $utf8NoBom.GetBytes($event + [Environment]::NewLine)
        $journalStream.Write($eventBytes, 0, $eventBytes.Length)
        $journalStream.Flush($true)
    }
    finally { $journalStream.Dispose() }
}

function New-AgenticFailureDiagnostic {
    param(
        [Parameter(Mandatory = $true)][string]$Category,
        [Parameter(Mandatory = $true)][string]$Message,
        [Parameter(Mandatory = $true)][string]$Operation,
        [string]$ScriptPath,
        [string]$FunctionName,
        [Nullable[int]]$Line,
        [string]$StateBefore,
        [string]$Phase,
        [bool]$Retryable = $false,
        [string]$InvocationId,
        [string]$Role,
        [Nullable[int]]$ExitCode
    )
    $safeMessage = ConvertTo-AgenticSanitizedText -Text ([string]$Message) -MaximumLength 500
    return [pscustomobject]@{
        category = ConvertTo-AgenticSanitizedText -Text $Category -MaximumLength 100
        message = $safeMessage
        operation = ConvertTo-AgenticSanitizedText -Text $Operation -MaximumLength 200
        script = if ([string]::IsNullOrWhiteSpace($ScriptPath)) { 'n/a' } else { [IO.Path]::GetFileName($ScriptPath) }
        function = if ([string]::IsNullOrWhiteSpace($FunctionName)) { 'n/a' } else { ConvertTo-AgenticSanitizedText -Text $FunctionName -MaximumLength 100 }
        line = if ($null -eq $Line) { $null } else { [int]$Line }
        state_before = if ([string]::IsNullOrWhiteSpace($StateBefore)) { 'n/a' } else { ConvertTo-AgenticSanitizedText -Text $StateBefore -MaximumLength 80 }
        phase = if ([string]::IsNullOrWhiteSpace($Phase)) { 'n/a' } else { ConvertTo-AgenticSanitizedText -Text $Phase -MaximumLength 80 }
        retryable = $Retryable
        invocation_id = if ([string]::IsNullOrWhiteSpace($InvocationId)) { $null } else { ConvertTo-AgenticSanitizedText -Text $InvocationId -MaximumLength 100 }
        role = if ([string]::IsNullOrWhiteSpace($Role)) { $null } else { ConvertTo-AgenticSanitizedText -Text $Role -MaximumLength 80 }
        exit_code = if ($null -eq $ExitCode) { $null } else { [int]$ExitCode }
        timestamp = [DateTime]::UtcNow.ToString('o')
    }
}

function ConvertTo-AgenticSanitizedText {
    param([AllowNull()][AllowEmptyString()][string]$Text, [int]$MaximumLength = 500)
    $safe = [string]$Text
    $safe = $safe -replace '(?i)((?:authorization\s*:\s*)?(?:bearer|basic)\s+)\S+', '$1[REDACTED]'
    $safe = $safe -replace '(?im)(set-cookie\s*:\s*)[^;\r\n]+', '$1[REDACTED]'
    $safe = $safe -replace '(?im)((?:cookie|x-auth-token|x-api-key|session(?:id)?|csrf(?:token)?)\s*:\s*)[^\r\n]+', '$1[REDACTED]'
    $safe = $safe -replace '(?i)\b(https?://)[^/\s:@]+:[^@\s/]+@', '$1[REDACTED]@'
    $safe = $safe -replace '(?i)("?(?:password|passwd|token|secret|api[_ -]?key|private[_ -]?key|connection[_ -]?string|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|cookie|session(?:id)?|csrf(?:token)?)"?\s*[:=]\s*"?)[^\s",;]+', '$1[REDACTED]'
    $safe = $safe -replace '(?i)\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|A(?:KIA|SIA)[A-Z0-9]{16})\b', '[REDACTED]'
    $safe = $safe -replace '(?i)\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b', '[REDACTED]'
    $safe = $safe -replace '(?s)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----', '[REDACTED PRIVATE KEY]'
    if ($safe.Length -gt $MaximumLength) { $safe = $safe.Substring(0, $MaximumLength) }
    return $safe
}

function Set-AgenticSupervisorTransition {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$To, [string]$PendingAction)
    $from = [string]$State.state
    if (-not (Test-AgenticTransition -From $from -To $To)) { throw "Transição de supervisor não permitida: $from -> $To." }
    $State.state = $To
    $State.pending_phase = if ($To -in @('RESUMING', 'WAITING_FOR_QUOTA', 'BLOCKED', 'FAILED', 'WAITING_HUMAN_MERGE', 'ALREADY_SATISFIED')) { [string]$State.pending_phase } else { $To }
    $State.pending_action = $PendingAction
    $State.updated_at = [DateTime]::UtcNow.ToString('o')
    return $State
}

function ConvertFrom-AgenticRoleResult {
    param([Parameter(Mandatory = $true)][string]$Json, [Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$ExpectedRole, [Parameter(Mandatory = $true)][string]$InvocationId, [Parameter(Mandatory = $true)][string]$ExpectedPhase, [Parameter(Mandatory = $true)][string]$SnapshotSha256)
    try { $result = $Json | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Resultado da role não é JSON válido conforme o schema estruturado.' }
    $required = @('schema_version', 'goal_id', 'role', 'invocation_id', 'phase', 'snapshot_sha256', 'status', 'summary', 'findings', 'evidence', 'failure', 'files_changed')
    foreach ($name in $required) {
        if ($null -eq $result.PSObject.Properties[$name]) { throw "Resultado estruturado da role ausente: $name." }
    }
    $optional = @('decision', 'semantic_status', 'payload', 'test_actions', 'mode', 'request_id')
    $unknownProperties = @($result.PSObject.Properties.Name | Where-Object { $_ -cnotin $required -and $_ -cnotin $optional })
    if ($unknownProperties.Count -gt 0) { throw 'Resultado da role contém campos não permitidos; agregação de outras roles é rejeitada.' }
    if ([int]$result.schema_version -ne 1) { throw 'Versão do schema de resultado da role não suportada.' }
    if ([string]$result.goal_id -cne [string]$State.goal_id) { throw 'Resultado da role pertence a outro goal.' }
    if ([string]$result.role -cne $ExpectedRole) { throw 'Resultado estruturado veio da role incorreta.' }
    if ([string]$result.invocation_id -cne $InvocationId) { throw 'Resultado estruturado pertence a outra invocation.' }
    if ([string]$result.phase -cne $ExpectedPhase) { throw 'Resultado estruturado pertence a outra fase.' }
    if ([string]$result.snapshot_sha256 -cne $SnapshotSha256 -or [string]$result.snapshot_sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Resultado estruturado pertence a outro snapshot.' }
    if ([string]$result.status -cnotin @('PASS', 'FAIL', 'BLOCKED')) { throw 'Status estruturado de role inválido.' }
    if ([string]::IsNullOrWhiteSpace([string]$result.summary)) { throw 'Resumo estruturado da role é obrigatório.' }
    foreach ($field in @('findings', 'evidence', 'files_changed')) {
        if ($result.$field -isnot [System.Collections.IEnumerable] -or $result.$field -is [string]) { throw "Campo estruturado da role '$field' precisa ser uma lista." }
    }
    if ($ExpectedRole -eq 'implementer' -and $result.PSObject.Properties['files_changed'] -eq $null) { throw 'Implementer precisa declarar files_changed.' }
    if ($ExpectedRole -ne 'implementer' -and @($result.files_changed).Count -gt 0) { throw 'Roles read-only não podem declarar arquivos alterados.' }
    if ($null -ne $result.failure) {
        foreach ($name in @('category', 'message', 'operation', 'retryable')) {
            if ($null -eq $result.failure.PSObject.Properties[$name]) { throw "failure estruturado inválido: $name." }
        }
        if ($result.failure.retryable -isnot [bool]) { throw 'failure.retryable precisa ser boolean.' }
    }
    if ($result.status -ne 'PASS' -and $null -eq $result.failure) { throw 'Resultado FAIL/BLOCKED exige diagnóstico estruturado.' }
    if ($result.status -eq 'PASS' -and $null -ne $result.failure) { throw 'Resultado PASS não pode conter failure.' }
    if ($ExpectedRole -eq 'orchestrator') {
        $decision = $result.PSObject.Properties['decision']
        if ($result.status -cne 'PASS' -or $null -eq $decision -or $null -eq $decision.Value) { throw 'Orchestrator precisa retornar somente sua decisão estruturada.' }
        Assert-AgenticOrchestratorDecision -Decision $decision.Value -CurrentState ([string]$State.state) | Out-Null
    }
    if ($ExpectedRole -eq 'architect' -and $ExpectedPhase -eq 'PREFLIGHT_ANALYZING') {
        if ($null -eq $result.PSObject.Properties['semantic_status'] -or [string]$result.semantic_status -cnotin @('SATISFIED','NOT_SATISFIED','BLOCKED')) { throw 'Architect preflight precisa de semantic_status válido.' }
    }
    if ($ExpectedRole -eq 'architect' -and $ExpectedPhase -eq 'ARCHITECTURE') {
        if ($null -eq $result.PSObject.Properties['payload'] -or $null -eq $result.payload) { throw 'Architect precisa retornar o payload completo da Specification.' }
    }
    if ($ExpectedRole -eq 'tester' -and $ExpectedPhase -in @('TESTING','TESTING_EVALUATE')) {
        if ($null -eq $result.PSObject.Properties['test_actions'] -or $result.test_actions -is [string] -or $result.test_actions -isnot [System.Collections.IEnumerable]) { throw 'Tester precisa solicitar ações de teste limitadas.' }
    }
    return $result
}

function Assert-AgenticOrchestratorDecision {
    param([Parameter(Mandatory=$true)]$Decision,[Parameter(Mandatory=$true)][string]$CurrentState)
    $fields=@('next_state','next_roles','correction_routing','terminal_outcome','rationale','evidence')
    if($Decision -is [string] -or $null -eq $Decision.PSObject){throw 'Orchestrator decision must be an object.'}
    $actual=@($Decision.PSObject.Properties.Name)
    if(@($actual|Where-Object{$_ -cnotin $fields}).Count -gt 0 -or @($fields|Where-Object{$_ -cnotin $actual}).Count -gt 0){throw 'Orchestrator decision fields must exactly match the canonical contract.'}
    $next=[string]$Decision.next_state
    if($script:AgenticStates -cnotcontains $next){throw 'Orchestrator decision contains an unknown lifecycle state.'}
    if($Decision.next_roles -is [string] -or $Decision.next_roles -isnot [System.Collections.IEnumerable]){throw 'Orchestrator next_roles must be a list.'}
    $roles=@($Decision.next_roles);$allowed=@('architect','implementer','tester','reviewer','security')
    if(@($roles|Where-Object{$_ -isnot [string] -or [string]$_ -cnotin $allowed}).Count -gt 0 -or @($roles|Sort-Object -Unique).Count -ne $roles.Count){throw 'Orchestrator next_roles contains an invalid or duplicate role.'}
    if([string]::IsNullOrWhiteSpace([string]$Decision.rationale) -or ([string]$Decision.rationale).Length -gt 2000){throw 'Orchestrator rationale is required and bounded.'}
    if($Decision.evidence -is [string] -or $Decision.evidence -isnot [System.Collections.IEnumerable] -or @($Decision.evidence).Count -eq 0 -or @($Decision.evidence|Where-Object{$_ -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$_)}).Count -gt 0){throw 'Orchestrator evidence must be a nonempty list of concrete references.'}
    $correction=[string]$Decision.correction_routing;$terminal=[string]$Decision.terminal_outcome
    if($next -eq 'CORRECTING') { if($correction -cnotin @('implementer','architect')){throw 'CORRECTING requires an allowed correction_routing.'} }
    elseif(-not [string]::IsNullOrEmpty($correction)){throw 'correction_routing is allowed only for CORRECTING.'}
    if($next -in @('ALREADY_SATISFIED','WAITING_HUMAN_MERGE','FAILED','BLOCKED')) { if($terminal -cne $next){throw 'Terminal outcome must match the selected terminal or blocked state.'};if($roles.Count -ne 0){throw 'Terminal decisions cannot dispatch additional roles.'} }
    elseif(-not [string]::IsNullOrEmpty($terminal)){throw 'terminal_outcome is allowed only for terminal or blocked decisions.'}
    return $Decision
}

function Get-AgenticControlPlaneSnapshot {
    $entries = @(Get-AgenticControlPlaneFiles)
    $hashInput = @($entries | ForEach-Object { '{0}:{1}' -f $_.path, $_.sha256 } | Sort-Object) -join "`n"
    return [pscustomobject]@{ entries = @($entries); hash = Get-AgenticTextSha256 -Text $hashInput }
}

function Get-AgenticControlPlaneFiles {
    $roots = @('agentic/state', 'agentic/journal', 'agentic/specifications')
    $entries = @()
    $totalBytes = [long]0
    foreach ($relativeRoot in $roots) {
        $root = Join-Path $script:AgenticRepoRoot $relativeRoot
        Assert-AgenticNoReparsePoints -Path $root -BasePath $script:AgenticRepoRoot | Out-Null
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $directories = New-Object 'System.Collections.Generic.Stack[string]'
        $directories.Push($root)
        while ($directories.Count -gt 0) {
            $directory = $directories.Pop()
            Assert-AgenticNoReparsePoints -Path $directory -BasePath $script:AgenticRepoRoot | Out-Null
            foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
                $attributes = [IO.File]::GetAttributes($item.FullName)
                if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Control path agentic contém reparse point; operação bloqueada sem leitura ou restauração.' }
                if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
                    Assert-AgenticNoReparsePoints -Path $item.FullName -BasePath $script:AgenticRepoRoot | Out-Null
                    $directories.Push($item.FullName)
                    continue
                }
                Assert-AgenticNoReparsePoints -Path $item.FullName -BasePath $script:AgenticRepoRoot -RequireLeaf | Out-Null
                $stream = [IO.File]::Open($item.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                try {
                    Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $item.FullName -BasePath $script:AgenticRepoRoot | Out-Null
                    if ($stream.Length -gt 16777216 -or ($totalBytes + $stream.Length) -gt 67108864) { throw 'Control artifacts excedem o limite de snapshot seguro.' }
                    $buffer = New-Object IO.MemoryStream
                    try { $stream.CopyTo($buffer); $bytes = $buffer.ToArray() }
                    finally { $buffer.Dispose() }
                }
                finally { $stream.Dispose() }
                $totalBytes += $bytes.LongLength
                $relativePath = Get-AgenticRelativePath -BasePath $script:AgenticRepoRoot -TargetPath $item.FullName
                $entries += [pscustomobject]@{ path = $relativePath; bytes = $bytes; sha256 = Get-AgenticBytesSha256 -Bytes $bytes }
            }
        }
    }
    return @($entries | Sort-Object path)
}

function Get-AgenticBytesSha256 {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-AgenticTextSafely {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$BasePath = $script:AgenticRepoRoot)
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $Path -BasePath $BasePath | Out-Null
        $reader = New-Object IO.StreamReader($stream, [Text.UTF8Encoding]::new($false), $true, 4096, $true)
        try { return $reader.ReadToEnd() }
        finally { $reader.Dispose() }
    }
    finally { $stream.Dispose() }
}

function Write-AgenticBytesSafely {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes, [string]$BasePath = $script:AgenticRepoRoot)
    $parentPath = Split-Path -Parent $Path
    Assert-AgenticNoReparsePoints -Path $parentPath -BasePath $BasePath | Out-Null
    [IO.Directory]::CreateDirectory($parentPath) | Out-Null
    Assert-AgenticNoReparsePoints -Path $parentPath -BasePath $BasePath | Out-Null
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath | Out-Null
    $temporaryPath = $Path + '.write-' + [guid]::NewGuid().ToString('N') + '.tmp'
    $backupPath = $Path + '.backup-' + [guid]::NewGuid().ToString('N') + '.tmp'
    $stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $temporaryPath -BasePath $BasePath | Out-Null
        $stream.Write($Bytes, 0, $Bytes.Length)
        $stream.Flush($true)
    }
    finally { $stream.Dispose() }
    try {
        Assert-AgenticNoReparsePoints -Path $parentPath -BasePath $BasePath | Out-Null
        Assert-AgenticNoReparsePoints -Path $temporaryPath -BasePath $BasePath -RequireLeaf | Out-Null
        $temporaryCheck = [IO.File]::Open($temporaryPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        try { Assert-AgenticOpenedPathWithinRoot -Stream $temporaryCheck -Path $temporaryPath -BasePath $BasePath | Out-Null }
        finally { $temporaryCheck.Dispose() }
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
            $targetCheck = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            try { Assert-AgenticOpenedPathWithinRoot -Stream $targetCheck -Path $Path -BasePath $BasePath | Out-Null }
            finally { $targetCheck.Dispose() }
            try { [IO.File]::Replace($temporaryPath, $Path, $backupPath) }
            catch {
                [IO.File]::Copy($Path, $backupPath, $false)
                try {
                    [IO.File]::Delete($Path)
                    [IO.File]::Move($temporaryPath, $Path)
                }
                catch {
                    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) { [IO.File]::Copy($backupPath, $Path, $false) }
                    throw
                }
            }
            Remove-AgenticFileSafely -Path $backupPath -BasePath $BasePath
        }
        else { [IO.File]::Move($temporaryPath, $Path) }
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-AgenticFileSafely -Path $temporaryPath -BasePath $BasePath }
        if (Test-Path -LiteralPath $backupPath -PathType Leaf) { Remove-AgenticFileSafely -Path $backupPath -BasePath $BasePath }
    }
}

function Remove-AgenticFileSafely {
    param([Parameter(Mandatory = $true)][string]$Path, [string]$BasePath = $script:AgenticRepoRoot)
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $Path -BasePath $BasePath | Out-Null }
    finally { $stream.Dispose() }
    [IO.File]::Delete($Path)
}

function Restore-AgenticControlPlaneSnapshot {
    param([Parameter(Mandatory = $true)]$Snapshot)
    $currentEntries = @(Get-AgenticControlPlaneFiles)
    $snapshotted = @{}
    foreach ($entry in @($Snapshot.entries)) { $snapshotted[[string]$entry.path] = $entry }
    foreach ($entry in $currentEntries) {
        if (-not $snapshotted.ContainsKey([string]$entry.path)) {
            $fullPath = Join-Path $script:AgenticRepoRoot ([string]$entry.path)
            Assert-AgenticNoReparsePoints -Path $fullPath -BasePath $script:AgenticRepoRoot -RequireLeaf | Out-Null
            $deleteStream = [IO.File]::Open($fullPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            try { Assert-AgenticOpenedPathWithinRoot -Stream $deleteStream -Path $fullPath -BasePath $script:AgenticRepoRoot | Out-Null }
            finally { $deleteStream.Dispose() }
            [IO.File]::Delete($fullPath)
        }
    }
    foreach ($entry in @($Snapshot.entries)) {
        $fullPath = Join-Path $script:AgenticRepoRoot ([string]$entry.path)
        Write-AgenticBytesSafely -Path $fullPath -Bytes ([byte[]]$entry.bytes)
    }
}

function Assert-AgenticControlPlaneUnchanged {
    param([Parameter(Mandatory = $true)]$Snapshot)
    $current = Get-AgenticControlPlaneSnapshot
    if ($current.hash -cne [string]$Snapshot.hash) {
        Restore-AgenticControlPlaneSnapshot -Snapshot $Snapshot
        throw 'Codex tentou alterar artefatos locais oficiais de controle; supervisor restaurou o checkpoint e rejeitou o resultado.'
    }
    return $true
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

function Start-GoalBranch {
    param([Parameter(Mandatory = $true)][hashtable]$Metadata, [Parameter(Mandatory = $true)][string]$BaseSha)
    $base = $Metadata["Base branch"]; $prefix = $Metadata["Branch prefix"]
    if ($base -cnotin @("develop", "main") -or $prefix -cnotin @("feature", "fix", "hotfix") -or (($prefix -ceq "hotfix") -ne ($base -ceq "main"))) { throw "Base/prefix de branch não permitidos." }
    if ($BaseSha -cnotmatch '^[0-9a-f]{40,64}$') { throw 'Base SHA não é um commit id válido.' }
    $checkpoint = Get-AgenticState
    if ($checkpoint.state -notin @('IDLE', 'ALREADY_SATISFIED', 'FAILED', 'WAITING_HUMAN_MERGE', 'PREFLIGHT_ANALYZING')) { throw 'Um goal ainda está ativo; não será criada outra branch.' }
    $status = @(Invoke-AgenticGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all'))
    $unexpected = @($status | Where-Object {
        $line = [string]$_
        if ($line.Length -lt 4) { return $true }
        $path = $line.Substring(3).Replace('\', '/')
        if ($path -match '^agentic/(state|journal|specifications)(/|$)') {
            return ($line.Substring(0, 2) -notin @(' M', ' A', ' D', '??'))
        }
        if (Test-AgenticLocalResultArtifactPath -Path $path) { return ($line.Substring(0, 2) -ne '??') }
        return $true
    })
    if ($unexpected.Count -gt 0) { throw "Working tree contém alterações fora dos control artifacts permitidos; nada será descartado." }
    $remoteBaseLines=@(Invoke-AgenticGit -GitArguments @('rev-parse', "refs/remotes/origin/$base"));$remoteBase=([string]$remoteBaseLines[0]).Trim()
    if ($remoteBase -cne $BaseSha) { throw 'Trusted remote base SHA mudou depois do preflight; branch não será criada.' }
    $slug = ([string]$Metadata["ID"]).ToLowerInvariant() -replace "[^a-z0-9-]+", "-"
    $slug = $slug.Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) { throw "ID do goal não pode gerar slug de branch." }
    $branch = "$prefix/$slug"
    if (@(Invoke-AgenticGit -GitArguments @("branch", "--list", $branch)).Count -gt 0 -or @(Invoke-AgenticGit -GitArguments @("branch", "--remotes", "--list", "origin/$branch")).Count -gt 0) { throw "Branch já existe; não será sobrescrita." }
    Invoke-AgenticGit -GitArguments @("switch", "--create", $branch, $BaseSha) | Out-Null
    $headLines=@(Invoke-AgenticGit -GitArguments @('rev-parse', 'HEAD'));$head=([string]$headLines[0]).Trim()
    if ($head -cne $BaseSha) { throw 'Branch nova não aponta para o SHA capturado pelo preflight.' }
    return $branch
}

function Assert-AgenticNoReparsePoints {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$BasePath = $script:AgenticRepoRoot,
        [switch]$RequireLeaf
    )
    $baseFull = [IO.Path]::GetFullPath($BasePath)
    $targetFull = [IO.Path]::GetFullPath($Path)
    $relative = Get-AgenticRelativePath -BasePath $baseFull -TargetPath $targetFull
    $pathRoot = [IO.Path]::GetPathRoot($baseFull)
    $cursor = $pathRoot
    try {
        $rootAttributes = [IO.File]::GetAttributes($cursor)
    }
    catch { throw "Path agentic rejeitado: raiz não pôde ser validada." }
    if (($rootAttributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Path agentic rejeitado: raiz contém reparse point." }
    $trimSeparators = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $baseSegments = $baseFull.Substring($pathRoot.Length).Trim($trimSeparators) -split '[\\/]'
    foreach ($segment in $baseSegments) {
        if ([string]::IsNullOrEmpty($segment)) { continue }
        $cursor = Join-Path $cursor $segment
        $ancestorAttributes = $null
        try { $ancestorAttributes = [IO.File]::GetAttributes($cursor) }
        catch [IO.FileNotFoundException] { }
        catch [IO.DirectoryNotFoundException] { }
        catch { throw "Path agentic rejeitado: componente da raiz não pôde ser validado." }
        if ($null -ne $ancestorAttributes -and ($ancestorAttributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Path agentic rejeitado: raiz contém reparse point." }
    }
    $cursor = $baseFull
    foreach ($segment in ($relative -split '/')) {
        $cursor = Join-Path $cursor $segment
        $attributes = $null
        try { $attributes = [IO.File]::GetAttributes($cursor) }
        catch [IO.FileNotFoundException] { }
        catch [IO.DirectoryNotFoundException] { }
        catch { throw "Path agentic rejeitado: componente do caminho não pôde ser validado." }
        if ($null -ne $attributes -and ($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Path agentic rejeitado: reparse point detectado." }
    }
    if ($RequireLeaf -and -not (Test-Path -LiteralPath $targetFull -PathType Leaf)) { throw "Path agentic rejeitado: arquivo obrigatório ausente." }
    return $targetFull
}

function Assert-AgenticOpenedPathWithinRoot {
    param(
        [Parameter(Mandatory = $true)][IO.FileStream]$Stream,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$BasePath
    )
    if (-not ("GeritAgenticFinalPathNative" -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Text;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
public static class GeritAgenticFinalPathNative {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
    public static string FinalPath(SafeFileHandle handle) {
        uint size = 512;
        while (size <= 32768) {
            StringBuilder path = new StringBuilder((int)size);
            uint written = GetFinalPathNameByHandle(handle, path, size, 0);
            if (written == 0) throw new IOException("Final handle path unavailable.");
            if (written < size) return path.ToString();
            size = written + 1;
        }
        throw new IOException("Final handle path too long.");
    }
}
"@
    }
    $baseFull = [IO.Path]::GetFullPath($BasePath)
    $pathFull = [IO.Path]::GetFullPath($Path)
    $relative = Get-AgenticRelativePath -BasePath $baseFull -TargetPath $pathFull
    $rootHandle = $null
    try {
        $rootHandle = [GeritAgenticFinalPathNative]::CreateFile($baseFull, 0, 7, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
        if ($null -eq $rootHandle -or $rootHandle.IsInvalid) { throw "Final path unavailable." }
        $rootFinal = [GeritAgenticFinalPathNative]::FinalPath($rootHandle)
        $fileFinal = [GeritAgenticFinalPathNative]::FinalPath($Stream.SafeFileHandle)
        $separator = [IO.Path]::DirectorySeparatorChar
        $rootPrefix = $rootFinal.TrimEnd([char[]]@('\', '/')) + $separator
        $expectedFinal = $rootPrefix + $relative.Replace('/', '\')
        if (-not [string]::Equals($fileFinal, $expectedFinal, [StringComparison]::OrdinalIgnoreCase)) { throw "Opened path escaped expected repository location." }
        return $true
    }
    catch { throw "Goal bloqueado: caminho final do handle não pôde ser validado." }
    finally { if ($null -ne $rootHandle) { $rootHandle.Dispose() } }
}
