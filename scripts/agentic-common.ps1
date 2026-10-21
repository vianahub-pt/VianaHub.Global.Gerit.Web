Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:AgenticRepoRoot = Split-Path -Parent $PSScriptRoot
$script:AgenticStatePath = Join-Path $script:AgenticRepoRoot "agentic/state/loop-state.json"
$script:AgenticJournalPath = Join-Path $script:AgenticRepoRoot "agentic/journal/current.md"
$script:AgenticFixturePlanRoot = $null
$script:AgenticLastNativeExitCode = $null
$script:AgenticBootstrapGoalSha256 = $null
$script:AgenticLastDiagnostic = $null
$script:AgenticLastErrorRecord = $null
$script:AgenticFixtureArtifactPaths = @()
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
        pending_phase = $null
        supervisor_runtime = $null
        bootstrap_goal_sha256 = $null
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
    if ([string]$state.state -notin @('IDLE', 'FAILED', 'WAITING_HUMAN_MERGE')) {
        foreach ($required in @('goal_id', 'goal_file', 'branch', 'base_branch', 'pending_action', 'pending_phase')) {
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
    if ([string]$State.state -in @('IDLE', 'FAILED', 'WAITING_HUMAN_MERGE')) { throw "Estado '$($State.state)' não está aguardando retomada." }
    foreach ($field in @('goal_id', 'goal_file', 'branch', 'base_branch', 'pending_action', 'pending_phase')) {
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
        IDLE = @("DISCOVERY")
        DISCOVERY = @("PLANNING", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        PLANNING = @("IMPLEMENTING", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        IMPLEMENTING = @("TESTING", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        TESTING = @("SECURITY_REVIEW", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        SECURITY_REVIEW = @("CODE_REVIEW", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        CODE_REVIEW = @("READY_TO_COMMIT", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        CORRECTING = @("PLANNING", "IMPLEMENTING", "TESTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_COMMIT = @("READY_TO_PR", "TESTING", "CORRECTING", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
        READY_TO_PR = @("WAITING_HUMAN_MERGE", "RESUMING", "WAITING_FOR_QUOTA", "FAILED")
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

function Test-AgenticSupervisorPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = $Path.Replace('\', '/')
    return ($normalized -match '^agentic/(state|journal|plans)(/|$)')
}

function Test-AgenticLocalResultArtifactPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return ($Path.Replace('\', '/') -cmatch '^agentic/state/results/[a-z][a-z0-9-]{2,63}/[0-9a-f]{32}\.json$')
}

function Get-AgenticPlanPath {
    param([Parameter(Mandatory = $true)][string]$GoalId)
    $fixtureRoot = Get-AgenticOptionalScriptValue -Name 'AgenticFixturePlanRoot'
    $root = if (-not [string]::IsNullOrWhiteSpace([string]$fixtureRoot)) { [string]$fixtureRoot } else { $script:AgenticRepoRoot }
    return Join-Path $root ('agentic/plans/{0}.md' -f $GoalId)
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

function Reset-AgenticStateForNewGoal {
    param(
        [Parameter(Mandatory = $true)]$PreviousState,
        [string]$StatePath = $script:AgenticStatePath,
        $NextState
    )
    if ([string]$PreviousState.state -notin @('IDLE', 'FAILED', 'WAITING_HUMAN_MERGE')) { throw 'Não é permitido substituir checkpoint de goal ativo.' }
    if (-not [string]::IsNullOrWhiteSpace([string]$PreviousState.goal_id)) {
        $archiveDirectory = Join-Path (Split-Path -Parent $StatePath) 'history'
        [IO.Directory]::CreateDirectory($archiveDirectory) | Out-Null
        $raw = Read-AgenticTextSafely -Path $StatePath
        $digest = Get-AgenticTextSha256 -Text $raw
        $archivePath = Join-Path $archiveDirectory ('{0}-{1}.json' -f $PreviousState.goal_id, $digest.Substring(0, 12))
        if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { Write-AgenticBytesSafely -Path $archivePath -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($raw)) }
    }
    $replacement = if ($null -eq $NextState) { Get-AgenticStateTemplate } else { $NextState }
    Write-AgenticState -State $replacement
    $persisted = Get-AgenticState
    if ($null -ne $NextState) {
        foreach ($field in @('goal_id', 'goal_file', 'branch', 'base_branch', 'state', 'pending_phase', 'bootstrap_goal_sha256')) {
            if ([string]$persisted.$field -cne [string]$NextState.$field) { throw "Checkpoint novo não persistiu o campo '$field'." }
        }
        foreach ($counter in @('iteration', 'agent_calls', 'consecutive_failures')) {
            if ([int]$persisted.$counter -ne 0) { throw "Checkpoint novo não reinicializou o contador '$counter'." }
        }
    }
    return $persisted
}

function Assert-AgenticPreparedCheckpoint {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$Sha256
    )

    $goalId = [string]$Metadata['ID']
    $canonicalGoalPath = 'agentic/goals/{0}.md' -f $goalId
    $expectedBranch = '{0}/{1}' -f [string]$Metadata['Branch prefix'], $goalId
    foreach ($pair in @(
        @('goal_id', $goalId),
        @('goal_file', $canonicalGoalPath),
        @('branch', $expectedBranch),
        @('base_branch', [string]$Metadata['Base branch']),
        @('state', 'DISCOVERY'),
        @('pending_phase', 'DISCOVERY'),
        @('bootstrap_goal_sha256', $Sha256)
    )) {
        $property = $State.PSObject.Properties[[string]$pair[0]]
        if ($null -eq $property -or [string]$property.Value -cne [string]$pair[1]) { throw "Checkpoint preparado diverge do handoff autenticado no campo '$($pair[0])'." }
    }
    if ($Branch -cne $expectedBranch -or $Branch -in @('develop', 'main')) { throw 'Branch preparada diverge da identidade autenticada.' }
    foreach ($counter in @('iteration', 'agent_calls', 'consecutive_failures')) {
        $property = $State.PSObject.Properties[$counter]
        if ($null -eq $property -or [int]$property.Value -ne 0) { throw "Checkpoint preparado herdou ou não inicializou o contador '$counter'." }
    }
    return $true
}

function Initialize-AgenticNewGoalCheckpoint {
    param(
        [Parameter(Mandatory = $true)]$PreviousState,
        [Parameter(Mandatory = $true)]$NextState,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$Sha256,
        [string]$JournalPath = $script:AgenticJournalPath,
        [string]$BasePath = $script:AgenticRepoRoot
    )

    Assert-AgenticPreparedCheckpoint -State $NextState -Metadata $Metadata -Branch $Branch -Sha256 $Sha256 | Out-Null
    $persisted = Reset-AgenticStateForNewGoal -PreviousState $PreviousState -NextState $NextState
    Assert-AgenticPreparedCheckpoint -State $persisted -Metadata $Metadata -Branch $Branch -Sha256 $Sha256 | Out-Null
    Initialize-AgenticJournalForGoal -GoalId ([string]$Metadata['ID']) -Branch $Branch -BaseBranch ([string]$Metadata['Base branch']) -JournalPath $JournalPath -BasePath $BasePath
    Assert-AgenticJournalMatchesState -State $persisted -JournalPath $JournalPath -BasePath $BasePath | Out-Null
    return $persisted
}

function Invoke-AgenticBootstrapStateIsolationFixture {
    $fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('agentic-bootstrap-state-{0}' -f [guid]::NewGuid().ToString('N'))
    $commonPath = Join-Path $script:AgenticRepoRoot 'scripts/agentic-common.ps1'
    $childPath = Join-Path ([IO.Path]::GetTempPath()) ('agentic-bootstrap-child-{0}.ps1' -f [guid]::NewGuid().ToString('N'))
    $savedRepoRoot = $script:AgenticRepoRoot
    $savedStatePath = $script:AgenticStatePath
    $savedJournalPath = $script:AgenticJournalPath
    $savedPipe = [string]$env:GERIT_AGENTIC_HANDOFF_PIPE
    $savedToken = [string]$env:GERIT_AGENTIC_HANDOFF_TOKEN
    $pipe = $null
    $child = $null
    try {
        foreach ($directory in @('agentic/state', 'agentic/journal', 'agentic/goals')) { [IO.Directory]::CreateDirectory((Join-Path $fixtureRoot $directory)) | Out-Null }
        $gitInit = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $fixtureRoot, 'init', '--quiet')
        Assert-AgenticNativeProcessSucceeded -Result $gitInit -CommandName 'bootstrap state fixture git init'
        $script:AgenticRepoRoot = $fixtureRoot
        $script:AgenticStatePath = Join-Path $fixtureRoot 'agentic/state/loop-state.json'
        $script:AgenticJournalPath = Join-Path $fixtureRoot 'agentic/journal/current.md'

        $goalId = 'bootstrap-state-fixture'
        $goalPath = Join-Path $fixtureRoot ('agentic/goals/{0}.md' -f $goalId)
        $goalText = @'
# Goal

- ID: bootstrap-state-fixture
- Title: Bootstrap state isolation fixture
- Base branch: develop
- Branch prefix: fix
- Allowed files: scripts/agentic-common.ps1

## Objective
Verify a new prepared goal receives an isolated checkpoint.
## Discovery requirements
Inspect the state bootstrap.
## Acceptance criteria
The child accepts only the matching authenticated checkpoint.
## Validation requirements
Run deterministic supervisor fixtures.
## Security/production restrictions
No production changes, merge, or deployment.
'@
        [IO.File]::WriteAllText($goalPath, $goalText, [Text.UTF8Encoding]::new($false))
        $metadata = Assert-AgenticIntake -Path $goalPath -BasePath $fixtureRoot

        $previous = Get-AgenticStateTemplate
        $previous.goal_id = 'previous-smoke-goal'; $previous.goal_file = 'agentic/goals/previous-smoke-goal.md'
        $previous.branch = 'feature/previous-smoke-goal'; $previous.base_branch = 'develop'; $previous.state = 'IDLE'
        $previous.iteration = 7; $previous.agent_calls = 11; $previous.consecutive_failures = 2
        Write-AgenticState -State $previous
        $oldJournal = New-AgenticJournalHeader -GoalId $previous.goal_id -Branch $previous.branch -BaseBranch $previous.base_branch
        [IO.File]::WriteAllText($script:AgenticJournalPath, ($oldJournal + "`n## old goal event`n"), [Text.UTF8Encoding]::new($false))

        # Simulate checkout replacing the tracked state after the pre-fetch snapshot:
        # archive the checkpoint from the selected base branch, then initialize the new goal.
        $checkoutState = Get-AgenticStateTemplate
        $checkoutState.goal_id = 'smoke-test'; $checkoutState.goal_file = 'agentic/goals/smoke-test.md'
        $checkoutState.branch = 'feature/smoke-test'; $checkoutState.base_branch = 'develop'; $checkoutState.state = 'IDLE'
        $checkoutState.iteration = 3; $checkoutState.agent_calls = 5; $checkoutState.consecutive_failures = 1
        Write-AgenticState -State $checkoutState

        $sha256 = Get-AgenticFileSha256 -Path $goalPath -BasePath $fixtureRoot
        Write-AgenticBootstrapAnchor -GoalId $goalId -Sha256 $sha256 -BasePath $fixtureRoot | Out-Null
        $next = Get-AgenticStateTemplate
        $next.goal_id = $goalId; $next.goal_file = "agentic/goals/$goalId.md"
        $next.branch = "fix/$goalId"; $next.base_branch = 'develop'; $next.bootstrap_goal_sha256 = $sha256
        $next.state = 'DISCOVERY'; $next.pending_phase = 'DISCOVERY'; $next.pending_action = 'Start prepared goal'
        $initialized = Initialize-AgenticNewGoalCheckpoint -PreviousState (Get-AgenticState) -NextState $next -Metadata $metadata -Branch $next.branch -Sha256 $sha256 -JournalPath $script:AgenticJournalPath -BasePath $fixtureRoot

        # A-G: replacing a stale IDLE checkpoint writes a complete new checkpoint, fresh counters, isolated journal, and matching immutable anchor.
        Assert-AgenticPreparedCheckpoint -State $initialized -Metadata $metadata -Branch $next.branch -Sha256 $sha256 | Out-Null
        if ([int]$initialized.iteration -ne 0 -or [int]$initialized.agent_calls -ne 0 -or [int]$initialized.consecutive_failures -ne 0) { throw 'Bootstrap fixture C: counters do not start at zero.' }
        $stateArchives = @(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'agentic/state/history') -File)
        if ($stateArchives.Count -ne 1 -or $stateArchives[0].Name -notlike 'smoke-test-*.json' -or [string](Get-AgenticState).goal_id -cne $goalId) { throw 'Bootstrap fixture A/B/G: post-checkout IDLE checkpoint was not archived and replaced.' }
        $journalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath -BasePath $fixtureRoot
        if ((Get-AgenticJournalHeader -JournalText $journalText).goal_id -cne $goalId -or $journalText -match 'old goal event') { throw 'Bootstrap fixture D: journal was not isolated to the new goal.' }
        if ((Get-AgenticBootstrapAnchorSha256 -GoalId $goalId -BasePath $fixtureRoot) -cne $sha256) { throw 'Bootstrap fixture E: anchor/hash diverged from the materialized goal.' }
        Add-AgenticJournalEvent -Goal $goalId -State 'DISCOVERY' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Materializar goal bootstrap autenticado' -FilesChanged @("agentic/goals/$goalId.md") -Gate ("bootstrap_goal_sha256={0}" -f $sha256) -Result 'PASS'

        # K: a stale checkpoint with a different goal ID remains rejected; the identity check is not weakened.
        $stale = $initialized | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        $stale.goal_id = 'previous-smoke-goal'
        $staleRejected = $false
        try { Assert-AgenticPreparedCheckpoint -State $stale -Metadata $metadata -Branch $next.branch -Sha256 $sha256 | Out-Null } catch { $staleRejected = $true }
        if (-not $staleRejected) { throw 'Bootstrap fixture K: checkpoint mismatch was accepted.' }

        # H-J: resume validation preserves the active goal and counters and never starts a new goal.
        $resumeState = $initialized | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        $resumeState.state = 'IMPLEMENTING'; $resumeState.pending_phase = 'IMPLEMENTING'; $resumeState.pending_action = 'Continue existing goal'
        $resumeState.iteration = 4; $resumeState.agent_calls = 9
        $resumeGoalId = [string]$resumeState.goal_id; $resumeIteration = [int]$resumeState.iteration; $resumeCalls = [int]$resumeState.agent_calls
        Assert-AgenticResumeCheckpoint -State $resumeState | Out-Null
        if ([string]$resumeState.goal_id -cne $resumeGoalId -or [int]$resumeState.iteration -ne $resumeIteration -or [int]$resumeState.agent_calls -ne $resumeCalls) { throw 'Bootstrap fixture H/I: resume changed goal identity or counters.' }
        $resumeSource = [IO.File]::ReadAllText((Join-Path $savedRepoRoot 'scripts/agentic-resume.ps1'), [Text.UTF8Encoding]::new($false))
        if ($resumeSource -match 'Reset-AgenticStateForNewGoal|Initialize-AgenticNewGoalCheckpoint' -or $resumeSource -notmatch 'agentic-loop.ps1.*-Resume') { throw 'Bootstrap fixture J: resume initializes a new goal or omits the resume path.' }

        # L: execute the real child handoff parser against the isolated checkpoint over the authenticated pipe protocol.
        $pipeName = 'gerit-agentic-{0}' -f [guid]::NewGuid().ToString('N')
        $token = 'a' * 64
        $childScript = @'
[CmdletBinding()]
param([string]$CommonPath, [string]$FixtureRoot, [string]$GoalPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. $CommonPath
$script:AgenticRepoRoot = $FixtureRoot
$script:AgenticStatePath = Join-Path $FixtureRoot 'agentic/state/loop-state.json'
$script:AgenticJournalPath = Join-Path $FixtureRoot 'agentic/journal/current.md'
$metadata = Assert-AgenticIntake -Path $GoalPath -BasePath $FixtureRoot
$handoff = Assert-AgenticPreparedHandoff -GoalPath $GoalPath -Metadata $metadata
$state = Get-AgenticState
Assert-AgenticPreparedCheckpoint -State $state -Metadata $metadata -Branch $state.branch -Sha256 $handoff.Sha256 | Out-Null
Assert-AgenticJournalMatchesState -State $state -JournalPath $script:AgenticJournalPath -BasePath $FixtureRoot | Out-Null
if ([string]$state.goal_id -cne 'bootstrap-state-fixture' -or [int]$state.agent_calls -ne 0) { throw 'Child received stale bootstrap checkpoint.' }
'child-bootstrap-pass'
'@
        [IO.File]::WriteAllText($childPath, $childScript, [Text.UTF8Encoding]::new($false))
        $pipe = [IO.Pipes.NamedPipeServerStream]::new($pipeName, [IO.Pipes.PipeDirection]::Out, 1, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous, 4096, 4096)
        $wait = $pipe.BeginWaitForConnection($null, $null)
        $engine = Resolve-AgenticPowerShellEngine
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $engine.Path; $startInfo.UseShellExecute = $false; $startInfo.WorkingDirectory = $fixtureRoot
        $startInfo.RedirectStandardOutput = $true; $startInfo.RedirectStandardError = $true
        $quote = { param([string]$value) '"' + $value.Replace('"', '\"') + '"' }
        $startInfo.Arguments = '-NoProfile -ExecutionPolicy Bypass -File {0} -CommonPath {1} -FixtureRoot {2} -GoalPath {3}' -f (& $quote $childPath), (& $quote $commonPath), (& $quote $fixtureRoot), (& $quote $goalPath)
        $startInfo.EnvironmentVariables['GERIT_AGENTIC_HANDOFF_PIPE'] = $pipeName
        $startInfo.EnvironmentVariables['GERIT_AGENTIC_HANDOFF_TOKEN'] = $token
        $child = [Diagnostics.Process]::Start($startInfo)
        if (-not $wait.AsyncWaitHandle.WaitOne(15000)) { throw 'Bootstrap fixture L: child did not connect to the supervisor pipe.' }
        $pipe.EndWaitForConnection($wait)
        $writer = [IO.StreamWriter]::new($pipe, [Text.UTF8Encoding]::new($false), 1024, $true)
        try { $writer.WriteLine("prepared|$goalId|$($next.branch)|agentic/goals/$goalId.md|$sha256|$token"); $writer.Flush() }
        finally { $writer.Dispose() }
        if (-not $child.WaitForExit(15000)) { $child.Kill(); throw 'Bootstrap fixture L: child did not finish validation.' }
        $childOutput = $child.StandardOutput.ReadToEnd() + $child.StandardError.ReadToEnd()
        if ($child.ExitCode -ne 0 -or $childOutput -notmatch 'child-bootstrap-pass') { throw ("Bootstrap fixture L: child rejected the matching checkpoint. {0}" -f (ConvertTo-AgenticSanitizedText -Text $childOutput)) }
        return $true
    }
    finally {
        if ($null -ne $child) { $child.Dispose() }
        if ($null -ne $pipe) { $pipe.Dispose() }
        if ($null -eq $savedPipe) { Remove-Item Env:GERIT_AGENTIC_HANDOFF_PIPE -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_HANDOFF_PIPE = $savedPipe }
        if ($null -eq $savedToken) { Remove-Item Env:GERIT_AGENTIC_HANDOFF_TOKEN -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_HANDOFF_TOKEN = $savedToken }
        $script:AgenticRepoRoot = $savedRepoRoot
        $script:AgenticStatePath = $savedStatePath
        $script:AgenticJournalPath = $savedJournalPath
        if (Test-Path -LiteralPath $childPath) { Remove-Item -LiteralPath $childPath -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
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

function Get-AgenticBootstrapAnchorPath {
    param([Parameter(Mandatory = $true)][string]$GoalId, [string]$BasePath = $script:AgenticRepoRoot)

    if ($GoalId -notmatch '^[a-z][a-z0-9-]{2,63}$' -or $GoalId -match '--|-$') { throw 'Bootstrap goal anchor rejeitado: ID não é canônico.' }
    $gitPath = Join-Path $BasePath '.git'
    if (-not (Test-Path -LiteralPath $gitPath)) { throw 'Bootstrap goal anchor indisponível: metadados Git ausentes.' }
    $gitDirResult = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $BasePath, 'rev-parse', '--git-path', 'agentic-bootstrap-goals')
    Assert-AgenticNativeProcessSucceeded -Result $gitDirResult -CommandName 'git rev-parse'
    $relativeGitPath = ([string]@($gitDirResult.Output)[0]).Trim()
    if ([string]::IsNullOrWhiteSpace($relativeGitPath)) { throw 'Bootstrap goal anchor indisponível: caminho Git vazio.' }
    $anchorDirectory = if ([IO.Path]::IsPathRooted($relativeGitPath)) { $relativeGitPath } else { Join-Path $BasePath $relativeGitPath }
    return Join-Path $anchorDirectory ("{0}.sha256" -f $GoalId)
}

function Write-AgenticBootstrapAnchor {
    param([Parameter(Mandatory = $true)][string]$GoalId, [Parameter(Mandatory = $true)][string]$Sha256, [string]$BasePath = $script:AgenticRepoRoot)

    if ($Sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Bootstrap goal anchor rejeitado: SHA-256 inválido.' }
    $anchorPath = Get-AgenticBootstrapAnchorPath -GoalId $GoalId -BasePath $BasePath
    [IO.Directory]::CreateDirectory((Split-Path -Parent $anchorPath)) | Out-Null
    try {
        $stream = [IO.File]::Open($anchorPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $bytes = [Text.Encoding]::ASCII.GetBytes($Sha256 + "`n")
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush($true)
        }
        finally { $stream.Dispose() }
    }
    catch [IO.IOException] {
        if (-not (Test-Path -LiteralPath $anchorPath -PathType Leaf) -or (Get-AgenticBootstrapAnchorSha256 -GoalId $GoalId -BasePath $BasePath) -cne $Sha256) { throw 'Bootstrap goal anchor já existe com conteúdo diferente.' }
    }
    return $anchorPath
}

function Get-AgenticBootstrapAnchorSha256 {
    param([Parameter(Mandatory = $true)][string]$GoalId, [string]$BasePath = $script:AgenticRepoRoot)

    $anchorPath = Get-AgenticBootstrapAnchorPath -GoalId $GoalId -BasePath $BasePath
    if (-not (Test-Path -LiteralPath $anchorPath -PathType Leaf)) { throw 'Bootstrap goal rejeitado: âncora autenticada do supervisor ausente.' }
    $sha256 = [IO.File]::ReadAllText($anchorPath, [Text.Encoding]::ASCII).TrimEnd("`r", "`n")
    if ($sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Bootstrap goal rejeitado: âncora autenticada inválida.' }
    return $sha256
}

function Test-AgenticBootstrapAnchor {
    param([Parameter(Mandatory = $true)][string]$GoalId, [string]$BasePath = $script:AgenticRepoRoot)

    $anchorPath = Get-AgenticBootstrapAnchorPath -GoalId $GoalId -BasePath $BasePath
    return (Test-Path -LiteralPath $anchorPath -PathType Leaf)
}

function Assert-AgenticBootstrapAnchor {
    param([Parameter(Mandatory = $true)][string]$GoalId, [Parameter(Mandatory = $true)][string]$ExpectedSha256, [string]$BasePath = $script:AgenticRepoRoot)

    $anchoredSha256 = Get-AgenticBootstrapAnchorSha256 -GoalId $GoalId -BasePath $BasePath
    if ($anchoredSha256 -cne $ExpectedSha256) { throw 'Bootstrap goal rejeitado: hash diverge da âncora imutável do supervisor.' }
    return $anchoredSha256
}

function Assert-AgenticBootstrapGoalIntegrity {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256,
        [string]$BasePath = $script:AgenticRepoRoot
    )

    $goalId = [string]$Metadata['ID']
    if ($goalId -notmatch '^[a-z][a-z0-9-]{2,63}$' -or $goalId -match '--|-$') { throw 'Bootstrap goal rejeitado: ID não é canônico.' }
    $stateGoalIdProperty = $State.PSObject.Properties['goal_id']
    if ($null -eq $stateGoalIdProperty -or [string]$stateGoalIdProperty.Value -cne $goalId) { throw 'Bootstrap goal rejeitado: goal_id não corresponde ao goal ativo.' }
    if ($ExpectedSha256 -notmatch '^[0-9a-f]{64}$') { throw 'Bootstrap goal rejeitado: SHA-256 autenticado ausente ou inválido.' }
    $stateHashProperty = $State.PSObject.Properties['bootstrap_goal_sha256']
    if ($null -eq $stateHashProperty -or [string]$stateHashProperty.Value -cne $ExpectedSha256) { throw 'Bootstrap goal rejeitado: hash do checkpoint difere do handoff do supervisor.' }

    $canonicalPath = 'agentic/goals/{0}.md' -f $goalId
    $stateGoalFileProperty = $State.PSObject.Properties['goal_file']
    if ($null -eq $stateGoalFileProperty -or [string]$stateGoalFileProperty.Value -cne $canonicalPath) { throw 'Bootstrap goal rejeitado: goal_file não é o caminho canônico.' }
    $fullPath = Join-Path $BasePath ($canonicalPath.Replace('/', [IO.Path]::DirectorySeparatorChar))
    Assert-AgenticNoReparsePoints -Path $fullPath -BasePath $BasePath -RequireLeaf | Out-Null
    if ((Get-AgenticFileSha256 -Path $fullPath -BasePath $BasePath) -cne $ExpectedSha256) { throw 'Bootstrap goal rejeitado: conteúdo mudou após a materialização.' }
    return $canonicalPath
}

function Get-AgenticAuthenticatedBootstrapPath {
    param([Parameter(Mandatory = $true)]$State)
    $hashProperty = $State.PSObject.Properties['bootstrap_goal_sha256']
    if ($null -eq $hashProperty -or [string]::IsNullOrWhiteSpace([string]$hashProperty.Value)) { return $null }
    $goalIdProperty = $State.PSObject.Properties['goal_id']
    if ($null -eq $goalIdProperty -or [string]::IsNullOrWhiteSpace([string]$goalIdProperty.Value)) { throw 'Bootstrap goal rejeitado: checkpoint sem goal_id.' }
    $goalId = [string]$goalIdProperty.Value
    $goalPath = Join-Path $script:AgenticRepoRoot ('agentic/goals/{0}.md' -f $goalId)
    if (-not (Test-Path -LiteralPath $goalPath -PathType Leaf)) { throw 'Bootstrap goal rejeitado: goal canônico ausente.' }
    $metadata = Get-AgenticGoalMetadata -Path $goalPath
    $canonicalPath = Assert-AgenticBootstrapGoalIntegrity -State $State -Metadata $metadata -ExpectedSha256 ([string]$hashProperty.Value)
    Assert-AgenticBootstrapAnchor -GoalId $goalId -ExpectedSha256 ([string]$hashProperty.Value) | Out-Null
    $journalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath
    Test-AgenticBootstrapGoalProvenance -GoalId $goalId -CanonicalPath $canonicalPath -Sha256 ([string]$hashProperty.Value) -JournalText $journalText | Out-Null
    return $canonicalPath
}

function Test-AgenticBootstrapGoalProvenance {
    param(
        [Parameter(Mandatory = $true)][string]$GoalId,
        [Parameter(Mandatory = $true)][string]$CanonicalPath,
        [Parameter(Mandatory = $true)][string]$Sha256,
        [Parameter(Mandatory = $true)][string]$JournalText
    )

    foreach ($event in @(Get-AgenticJournalEvents -JournalText $JournalText)) {
        $eventPaths = @(([string]$event.files_changed -split '\s*[,;]\s*') | ForEach-Object { $_.Replace('\', '/') })
        if ($event.goal -ceq $GoalId -and $event.state -ceq 'DISCOVERY' -and $event.controller -ceq 'supervisor' -and $event.actor -ceq 'supervisor' -and $event.action -ceq 'Materializar goal bootstrap autenticado' -and $event.result -ceq 'PASS' -and $event.gate -ceq "bootstrap_goal_sha256=$Sha256" -and $eventPaths -ccontains $CanonicalPath) { return $true }
    }
    throw 'Bootstrap goal rejeitado: provenance explícita do supervisor ausente.'
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
        $bootstrapPath = Get-AgenticAuthenticatedBootstrapPath -State $State
        if ($null -ne $bootstrapPath -and $path -ceq $bootstrapPath) { continue }
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
                'supervisor_fixtures' { $commandName = 'Invoke-AgenticSupervisorFixtures'; [void](Invoke-AgenticSupervisorFixtures) }
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
        [string]$JournalText,
        [string]$BootstrapGoalSha256
    )

    if ([string]$State.state -ne "READY_TO_COMMIT") { throw "Somente o supervisor pode validar state READY_TO_COMMIT." }
    $goalId = [string]$Metadata["ID"]
    if ([string]::IsNullOrWhiteSpace($goalId)) { throw "Goal precisa declarar ID antes do commit." }
    $stateGoalIdProperty = $State.PSObject.Properties["goal_id"]
    if ($null -eq $stateGoalIdProperty) { throw "State precisa declarar goal_id antes do commit." }
    $stateGoalId = [string]$stateGoalIdProperty.Value
    if ([string]::IsNullOrWhiteSpace($stateGoalId)) { throw "State.goal_id nao pode estar vazio antes do commit." }
    if ($stateGoalId -cne $goalId) { throw "ID do goal no state nao corresponde exatamente ao goal ativo." }
    $stateBootstrapHashProperty = $State.PSObject.Properties["bootstrap_goal_sha256"]
    $stateBootstrapHash = if ($null -eq $stateBootstrapHashProperty) { "" } else { [string]$stateBootstrapHashProperty.Value }
    $bootstrapGoalPath = $null
    if (-not [string]::IsNullOrWhiteSpace($BootstrapGoalSha256)) {
        $bootstrapGoalPath = Assert-AgenticBootstrapGoalIntegrity -State $State -Metadata $Metadata -ExpectedSha256 $BootstrapGoalSha256
        if ([string]::IsNullOrWhiteSpace($JournalText)) { $JournalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath }
        Test-AgenticBootstrapGoalProvenance -GoalId $goalId -CanonicalPath $bootstrapGoalPath -Sha256 $BootstrapGoalSha256 -JournalText $JournalText | Out-Null
    }
    elseif (-not [string]::IsNullOrWhiteSpace($stateBootstrapHash)) {
        throw "Bootstrap goal rejeitado: contexto autenticado do supervisor ausente."
    }
    if ([string]$State.branch -cne $CurrentBranch) { throw "Branch atual nao corresponde ao checkpoint." }
    if ([string]$State.base_branch -cne [string]$Metadata["Base branch"]) { throw "Base do state nao corresponde ao goal." }
    $prefix = [string]$Metadata["Branch prefix"]
    $slug = ([string]$Metadata["ID"]).ToLowerInvariant() -replace "[^a-z0-9-]+", "-"
    $slug = $slug.Trim("-")
    $expectedBranch = "$prefix/$slug"
    if ($CurrentBranch -cne $expectedBranch -or $CurrentBranch -cin @("develop", "main")) { throw "Branch nao corresponde ao prefixo e ID declarados no goal." }
    if ($State.base_branch -cnotin @("develop", "main") -or (($prefix -ceq "hotfix") -ne ($State.base_branch -ceq "main"))) { throw "Combinacao de branch/base nao permitida." }

    $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
    if ($allowed.Count -eq 0) { throw "Goal precisa declarar Allowed files antes do commit." }
    if ($ChangedPaths.Count -eq 0) { throw "Nenhuma alteracao de goal para stage." }
    foreach ($path in $ChangedPaths) {
        $normalized = ([string]$path).Replace('\', '/')
        if (Test-AgenticSupervisorPath -Path $normalized) { continue }
        if ($null -ne $bootstrapGoalPath -and $normalized -ceq $bootstrapGoalPath) { continue }
        if ($allowed -cnotcontains $normalized) { throw "Working tree contem arquivo fora do escopo permitido pelo goal." }
    }
    $functionalPaths = @(Get-AgenticCommitPaths -ChangedPaths $ChangedPaths)
    $classification = Get-AgenticChangeClassification -Paths $functionalPaths
    if ([string]$State.change_classification -cne $classification) { throw 'Change classification mudou depois dos gates; readiness invalidada.' }
    $typecheckResolver = Resolve-AgenticTypecheckCommand
    $runtimeTestResolver = Resolve-AgenticRuntimeTestsCommand
    $policy = Get-AgenticGatePolicy -Classification $classification -TypecheckStatus $typecheckResolver.Status -RuntimeTestsStatus $runtimeTestResolver.Status -Paths $functionalPaths
    if (@($State.required_gates | Where-Object { $_ -notin $policy.Required }).Count -gt 0 -or @($policy.Required | Where-Object { $_ -notin $State.required_gates }).Count -gt 0) { throw 'required_gates divergentes da política calculada pelo supervisor.' }
    foreach ($gate in $policy.Required | Where-Object { $_ -notin @('security_review', 'reviewer_review', 'staged_diff_check') }) {
        $gateRecord = @($State.gate_results | Where-Object { [string]$_.name -ceq $gate } | Select-Object -Last 1)
        if ($gateRecord.Count -eq 0 -or [string]$gateRecord[0].status -cne 'PASS') { throw "Gate obrigatório '$gate' não foi aprovado pelo supervisor." }
    }
    foreach ($skip in $policy.Skipped) {
        $gateRecord = @($State.gate_results | Where-Object { [string]$_.name -ceq $skip.name } | Select-Object -Last 1)
        if ($gateRecord.Count -eq 0 -or [string]$gateRecord[0].status -cne 'NOT_APPLICABLE' -or [string]::IsNullOrWhiteSpace([string]$gateRecord[0].reason)) { throw "Gate dispensado '$($skip.name)' precisa ser NOT_APPLICABLE com motivo." }
    }
    if ([string]$State.security_review_status -cne 'PASS') { throw 'Security review não foi aprovada pelo supervisor.' }
    if ([string]$State.code_review_status -cne 'PASS') { throw 'Reviewer review não foi aprovada pelo supervisor.' }
    $snapshot = @(Get-AgenticCommitSnapshot -Paths $functionalPaths)
    $snapshotHash = Get-AgenticStableSnapshotSha256 -Snapshot $snapshot
    foreach ($role in @('security', 'reviewer')) {
        $evidence = @($State.role_invocations | Where-Object { [string]$_.role -ceq $role -and [string]$_.goal_id -ceq $goalId } | Select-Object -Last 1)
        if ($evidence.Count -ne 1 -or [string]$evidence[0].status -cne 'PASS' -or [int]$evidence[0].exit_code -ne 0 -or [string]$evidence[0].snapshot_sha256 -cne $snapshotHash) { throw "Invocation independente '$role' não corresponde ao goal/snapshot funcional validado." }
        if ([string]$evidence[0].command_fingerprint -notmatch '^[a-f0-9]{64}$') { throw "Invocation '$role' não possui command fingerprint válido." }
        $expectedArtifact = 'agentic/state/results/{0}/{1}.json' -f $goalId, [string]$evidence[0].invocation_id
        if (-not (Test-AgenticLocalResultArtifactPath -Path $expectedArtifact) -or [string]$evidence[0].result_artifact_path -cne $expectedArtifact) { throw ("Artifact path da role '{0}' não é canônico (esperado '{1}', recebido '{2}')." -f $role, $expectedArtifact, [string]$evidence[0].result_artifact_path) }
        $artifactPath = Join-Path $script:AgenticRepoRoot $expectedArtifact
        if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf) -or (Get-AgenticFileSha256 -Path $artifactPath) -cne [string]$evidence[0].result_artifact_sha256) { throw "Artifact de resultado '$role' ausente ou modificado." }
    }
    $expectedSnapshot = @($State.quality_gate_snapshot | Sort-Object path)
    if ($expectedSnapshot.Count -ne $snapshot.Count) { throw 'Paths commitáveis mudaram depois dos gates; readiness invalidada.' }
    for ($index = 0; $index -lt $snapshot.Count; $index++) {
        if ([string]$expectedSnapshot[$index].path -cne [string]$snapshot[$index].path -or [string]$expectedSnapshot[$index].sha256 -cne [string]$snapshot[$index].sha256) { throw 'Paths ou conteúdo mudaram depois dos gates; readiness invalidada.' }
    }
    Assert-AgenticFunctionalDiffCheck -Paths $functionalPaths | Out-Null
    $provenancePaths = @($functionalPaths | Where-Object { $null -eq $bootstrapGoalPath -or ([string]$_ -cne $bootstrapGoalPath) })
    if ($provenancePaths.Count -gt 0) {
        if ([string]::IsNullOrWhiteSpace($JournalText)) { $JournalText = Read-AgenticTextSafely -Path $script:AgenticJournalPath }
        Test-AgenticImplementerProvenance -GoalId $goalId -FunctionalPaths $provenancePaths -JournalText $JournalText | Out-Null
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

function Set-AgenticFixtureReadinessEvidence {
    param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string[]]$Paths)
    foreach ($propertyName in @('change_classification', 'required_gates', 'skipped_gates', 'quality_gate_snapshot', 'gate_results', 'role_invocations')) {
        if ($null -eq $State.PSObject.Properties[$propertyName]) { $State | Add-Member -NotePropertyName $propertyName -NotePropertyValue $null }
    }
    $functional = @(Get-AgenticCommitPaths -ChangedPaths $Paths)
    if ($functional.Count -eq 0) { throw 'Fixture readiness requires at least one functional path.' }
    $classification = Get-AgenticChangeClassification -Paths $functional
    $typecheck = Resolve-AgenticTypecheckCommand
    $runtimeTests = Resolve-AgenticRuntimeTestsCommand
    $policy = Get-AgenticGatePolicy -Classification $classification -TypecheckStatus $typecheck.Status -RuntimeTestsStatus $runtimeTests.Status -Paths $functional
    $State.change_classification = $classification
    $State.required_gates = @($policy.Required)
    $State.skipped_gates = @($policy.Skipped)
    $State.quality_gate_snapshot = @(Get-AgenticCommitSnapshot -Paths $functional)
    $State.gate_results = @()
    foreach ($name in $policy.Required | Where-Object { $_ -notin @('security_review', 'reviewer_review', 'staged_diff_check') }) {
        Set-AgenticGateResult -State $State -Name $name -Status 'PASS' -Reason 'fixture evidence' | Out-Null
    }
    foreach ($skip in $policy.Skipped) { Set-AgenticGateResult -State $State -Name $skip.name -Status 'NOT_APPLICABLE' -Reason $skip.reason | Out-Null }
    $snapshotHash = Get-AgenticStableSnapshotSha256 -Snapshot $State.quality_gate_snapshot
    $State.role_invocations = @()
    foreach ($role in @('security', 'reviewer')) {
        $invocationId = [guid]::NewGuid().ToString('N')
        $relativeArtifact = 'agentic/state/results/{0}/{1}.json' -f [string]$State.goal_id, $invocationId
        $artifactPath = Join-Path $script:AgenticRepoRoot $relativeArtifact
        [IO.Directory]::CreateDirectory((Split-Path -Parent $artifactPath)) | Out-Null
        Write-AgenticBytesSafely -Path $artifactPath -Bytes ([Text.UTF8Encoding]::new($false).GetBytes(('{{"role":"{0}","fixture":true}}' -f $role)))
        $script:AgenticFixtureArtifactPaths += $artifactPath
        $State.role_invocations += [pscustomobject]@{
            role = $role; goal_id = [string]$State.goal_id; invocation_id = $invocationId; phase = if ($role -eq 'security') { 'SECURITY_REVIEW' } else { 'CODE_REVIEW' }
            snapshot_sha256 = $snapshotHash; command_fingerprint = ('a' * 64); result_artifact_path = $relativeArtifact
            result_artifact_sha256 = Get-AgenticFileSha256 -Path $artifactPath; exit_code = 0; status = 'PASS'; timestamp = [DateTimeOffset]::UtcNow.ToString('o')
        }
    }
    $State.security_review_status = 'PASS'
    $State.code_review_status = 'PASS'
}

function Invoke-AgenticResumeLifecycleIntegrationFixture {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('agentic-resume-e2e-{0}' -f [guid]::NewGuid().ToString('N'))
    $remoteRoot = $root + '-origin.git'
    $savedPath = $env:PATH; $savedStop = $env:GERIT_AGENTIC_FIXTURE_STOP_AT_READY; $savedGateStop = $env:GERIT_AGENTIC_FIXTURE_STOP_ON_GATE_FAILURE; $savedInterrupt = $env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY
    try {
        foreach ($relative in @('scripts', 'agentic/prompts', 'agentic/goals', 'agentic/state', 'agentic/journal', '.codex/agents', 'docs', 'fake-bin')) { [IO.Directory]::CreateDirectory((Join-Path $root $relative)) | Out-Null }
        foreach ($file in @('agentic-common.ps1', 'agentic-loop.ps1', 'agentic-resume.ps1', 'agentic-status.ps1')) { Copy-Item -LiteralPath (Join-Path $script:AgenticRepoRoot ('scripts/' + $file)) -Destination (Join-Path $root ('scripts/' + $file)) }
        $loopCopy = Join-Path $root 'scripts/agentic-loop.ps1'
        $loopText = [IO.File]::ReadAllText($loopCopy, [Text.UTF8Encoding]::new($false))
        $loopText = [regex]::Replace($loopText, '(?m)^(\s*)if \(Invoke-AgenticFinalization -State \$state -Metadata \$metadata\) \{ exit 0 \}', '$1if ($$env:GERIT_AGENTIC_FIXTURE_STOP_AT_READY -eq ''1'' -and (Test-Path -LiteralPath (Join-Path $$script:AgenticRepoRoot ''.agentic-fixture'') -PathType Leaf)) { exit 0 }' + "`n" + '$1if (Invoke-AgenticFinalization -State $$state -Metadata $$metadata) { exit 0 }')
        $loopText = [regex]::Replace($loopText, '(?m)^(\s*)\$diag = New-AgenticFailureDiagnostic -Category ''quality_gate''', '$1if ($$env:GERIT_AGENTIC_FIXTURE_STOP_ON_GATE_FAILURE -eq ''1'' -and (Test-Path -LiteralPath (Join-Path $$script:AgenticRepoRoot ''.agentic-fixture'') -PathType Leaf)) { throw $$_.Exception.Message }' + "`n" + '$1$$diag = New-AgenticFailureDiagnostic -Category ''quality_gate''', 1)
        $interruptAnchor = @'
        if ($nextPhase -eq 'READY_TO_COMMIT') {
'@
        $interruptReplacement = @'
        if ($env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY -eq '1' -and (Test-Path -LiteralPath (Join-Path $script:AgenticRepoRoot '.agentic-fixture') -PathType Leaf) -and $nextPhase -eq 'PLANNING') { exit 0 }
        if ($nextPhase -eq 'READY_TO_COMMIT') {
'@
        if (-not $loopText.Contains($interruptAnchor)) { throw 'Lifecycle X: ponto de interrupção determinístico não encontrado no loop copiado.' }
        $loopText = $loopText.Replace($interruptAnchor, $interruptReplacement)
        [IO.File]::WriteAllText($loopCopy, $loopText, [Text.UTF8Encoding]::new($false))
        Copy-Item -LiteralPath (Join-Path $script:AgenticRepoRoot 'agentic/prompts/autonomous-loop.md') -Destination (Join-Path $root 'agentic/prompts/autonomous-loop.md')
        foreach ($roleFile in @(Get-ChildItem -LiteralPath (Join-Path $script:AgenticRepoRoot '.codex/agents') -Filter '*.toml' -File)) { Copy-Item -LiteralPath $roleFile.FullName -Destination (Join-Path $root ('.codex/agents/' + $roleFile.Name)) }
        [IO.File]::WriteAllText((Join-Path $root '.agentic-fixture'), 'fixture', [Text.UTF8Encoding]::new($false))
        $goal = @'
# Goal
- ID: agentic-resume-e2e
- Title: Deterministic supervisor resume lifecycle fixture
- Base branch: develop
- Branch prefix: feature
- Allowed files: docs/result.md

## Objective
Exercise the supervisor lifecycle using deterministic role fixtures.
## Acceptance criteria
Reach READY_TO_COMMIT after resuming an interrupted checkpoint.
'@
        [IO.File]::WriteAllText((Join-Path $root 'agentic/goals/agentic-resume-e2e.md'), $goal + "`n", [Text.UTF8Encoding]::new($false))
        $fakeCodex = @'
$argv = @($args); $outIndex = [Array]::IndexOf($argv, '--output-last-message'); $cdIndex = [Array]::IndexOf($argv, '--cd')
if ($outIndex -lt 0 -or $cdIndex -lt 0) { $global:LASTEXITCODE = 2; exit 2 }
$repoRoot = [string]$argv[$cdIndex + 1]
$responsePath = [string]$argv[$outIndex + 1]; $prompt = [string]$argv[$argv.Count - 1]
function Read-ContractValue([string]$Name) { $m = [regex]::Match($prompt, '(?m)^' + [regex]::Escape($Name) + '=(.+)$'); if (-not $m.Success) { throw "missing $Name" }; return $m.Groups[1].Value.Trim() }
$goalId = Read-ContractValue 'goal_id'; $phase = Read-ContractValue 'phase'; $invocation = Read-ContractValue 'invocation_id'; $snapshot = Read-ContractValue 'snapshot_sha256'; $role = switch ($phase) { 'DISCOVERY' { 'architect' } 'PLANNING' { 'architect' } 'IMPLEMENTING' { 'implementer' } 'CORRECTING' { 'implementer' } 'TESTING' { 'tester' } 'SECURITY_REVIEW' { 'security' } 'CODE_REVIEW' { 'reviewer' } default { throw 'missing role' } }; $changed = @()
if ($role -eq 'implementer') { [IO.File]::WriteAllText((Join-Path $repoRoot 'docs/result.md'), "Supervisor resume integration fixture.`n", [Text.UTF8Encoding]::new($false)); $changed = @('docs/result.md') }
$result = [ordered]@{ schema_version = 1; goal_id = $goalId; role = $role; invocation_id = $invocation; phase = $phase; snapshot_sha256 = $snapshot; status = 'PASS'; summary = 'deterministic integration role'; findings = @(); evidence = @('fake Codex process completed'); failure = $null; files_changed = $changed }
[IO.File]::WriteAllText($responsePath, ($result | ConvertTo-Json -Depth 5 -Compress), [Text.UTF8Encoding]::new($false)); $global:LASTEXITCODE = 0
'@
        [IO.File]::WriteAllText((Join-Path $root 'fake-bin/codex.ps1'), $fakeCodex + "`n", [Text.UTF8Encoding]::new($false))
        $commands = @(@('init', '-b', 'develop'), @('config', 'user.email', 'fixture@example.invalid'), @('config', 'user.name', 'Agentic Fixture'))
        foreach ($commandArgs in $commands) { $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments (@('-C', $root) + $commandArgs); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture git init/config' }
        $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('init', '--bare', $remoteRoot); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture origin init'
        $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $root, 'add', '-A'); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture git add'
        $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $root, 'commit', '-m', 'fixture base'); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture git commit'
        $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $root, 'remote', 'add', 'origin', $remoteRoot); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture remote add'
        $r = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $root, 'push', '-u', 'origin', 'develop'); Assert-AgenticNativeProcessSucceeded -Result $r -CommandName 'fixture base push'
        $state = Get-AgenticStateTemplate
        $statePath = Join-Path $root 'agentic/state/loop-state.json'; [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
        $env:PATH = (Join-Path $root 'fake-bin') + [IO.Path]::PathSeparator + $savedPath; $env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY = '1'
        $engine = Resolve-AgenticPowerShellEngine
        $run = Invoke-AgenticNativeProcess -FilePath $engine.Path -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'scripts/agentic-loop.ps1'), '-Goal', (Join-Path $root 'agentic/goals/agentic-resume-e2e.md')) -CaptureStandardError
        if ($run.ExitCode -ne 0) { throw ("Lifecycle X: start do loop terminou com exit code {0}: {1}" -f $run.ExitCode, (ConvertTo-AgenticSanitizedText -Text (@($run.Output | ForEach-Object { [string]$_ }) -join ' '))) }
        $interruptedState = [IO.File]::ReadAllText($statePath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        if ([string]$interruptedState.state -cne 'PLANNING' -or [int]$interruptedState.agent_calls -ne 1 -or [int]$interruptedState.iteration -ne 1) { throw 'Lifecycle X: interrupção não preservou o checkpoint após discovery.' }
        if ($null -eq $savedInterrupt) { Remove-Item Env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY = $savedInterrupt }
        $env:GERIT_AGENTIC_FIXTURE_STOP_AT_READY = '1'; $env:GERIT_AGENTIC_FIXTURE_STOP_ON_GATE_FAILURE = '1'
        $run = Invoke-AgenticNativeProcess -FilePath $engine.Path -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'scripts/agentic-resume.ps1')) -CaptureStandardError
        $finalState = [IO.File]::ReadAllText($statePath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        if ($run.ExitCode -ne 0) { $failureText = if ($null -ne $finalState.failure_diagnostic) { [string]$finalState.failure_diagnostic.message } else { '' }; $gateText = @($finalState.gate_results | ForEach-Object { '{0}={1}:{2}' -f $_.name, $_.status, $_.reason }) -join '; '; $roleText = @($finalState.role_invocations | ForEach-Object { $failureProperty = $_.PSObject.Properties['failure_reason']; $failureReason = if ($null -ne $failureProperty) { [string]$failureProperty.Value } else { '' }; '{0}/{1}={2}:{3}:{4}' -f $_.role, $_.phase, $_.status, $_.result_artifact_path, $failureReason }) -join '; '; $artifactFiles = @(Get-ChildItem -LiteralPath (Join-Path $root 'agentic/state/results') -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { Get-AgenticRelativePath -BasePath $root -TargetPath $_.FullName }) -join ','; throw ("Lifecycle X: resume terminou com exit code {0}; checkpoint={1}; roles={2}; artifacts={3}; gates={4}; saída={5}" -f $run.ExitCode, $failureText, $roleText, $artifactFiles, $gateText, (ConvertTo-AgenticSanitizedText -Text (@($run.Output | ForEach-Object { [string]$_ }) -join ' '))) }
        if ([string]$finalState.state -cne 'READY_TO_COMMIT' -or [int]$finalState.agent_calls -le [int]$interruptedState.agent_calls -or [int]$finalState.iteration -le [int]$interruptedState.iteration) { throw 'Lifecycle X: counters não foram preservados ou READY_TO_COMMIT não foi alcançado.' }
        if (@($finalState.role_invocations).Count -ne 6) { throw 'Lifecycle X: esperadas seis invocações isoladas.' }
        foreach ($roleName in @('architect', 'implementer', 'tester', 'security', 'reviewer')) { if (@($finalState.role_invocations | Where-Object { [string]$_.role -ceq $roleName -and [string]$_.status -ceq 'PASS' }).Count -lt 1) { throw "Lifecycle X: provenance PASS ausente para $roleName." } }
        if (-not (Test-Path -LiteralPath (Join-Path $root 'docs/result.md') -PathType Leaf)) { throw 'Lifecycle X: implementer fixture não criou docs/result.md.' }
    }
    finally {
        $env:PATH = $savedPath
        if ($null -eq $savedStop) { Remove-Item Env:GERIT_AGENTIC_FIXTURE_STOP_AT_READY -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_FIXTURE_STOP_AT_READY = $savedStop }
        if ($null -eq $savedGateStop) { Remove-Item Env:GERIT_AGENTIC_FIXTURE_STOP_ON_GATE_FAILURE -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_FIXTURE_STOP_ON_GATE_FAILURE = $savedGateStop }
        if ($null -eq $savedInterrupt) { Remove-Item Env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY -ErrorAction SilentlyContinue } else { $env:GERIT_AGENTIC_FIXTURE_INTERRUPT_AFTER_DISCOVERY = $savedInterrupt }
        if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $remoteRoot) { Remove-Item -LiteralPath $remoteRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-AgenticSupervisorFixtures {
    $script:AgenticFixtureArtifactPaths = @()
    $promptPath = Join-Path $script:AgenticRepoRoot "agentic/prompts/autonomous-loop.md"
    $prompt = [System.IO.File]::ReadAllText($promptPath, [System.Text.UTF8Encoding]::new($false))
    $supervisorPath = Join-Path $script:AgenticRepoRoot "scripts/agentic-loop.ps1"
    $supervisorSource = [System.IO.File]::ReadAllText($supervisorPath, [System.Text.UTF8Encoding]::new($false))
    $commonSource = [System.IO.File]::ReadAllText((Join-Path $script:AgenticRepoRoot "scripts/agentic-common.ps1"), [System.Text.UTF8Encoding]::new($false))
    $startPath = Join-Path $script:AgenticRepoRoot "scripts/agentic-start.ps1"
    $startSource = [System.IO.File]::ReadAllText($startPath, [System.Text.UTF8Encoding]::new($false))
    $frontDoorSource = [System.IO.File]::ReadAllText((Join-Path $script:AgenticRepoRoot 'agentic/prompts/front-door.md'), [Text.UTF8Encoding]::new($false))
    $intakeFixturePath = Join-Path ([IO.Path]::GetTempPath()) ("agentic-intake-{0}.md" -f [guid]::NewGuid().ToString("N"))
    $validIntake = @'
- ID: clients-crud
- Title: Implementar CRUD de Clients
- Base branch: develop
- Branch prefix: feature
- Allowed files: domains/operations/clients/page.tsx, domains/operations/clients/api.ts

## Objective
Implementar o CRUD usando a API existente.
## Discovery requirements
Architect confirma contratos da API.
## Acceptance criteria
CRUD funcional com allowlist validada.
## Validation requirements
Executar gates padrão.
## Security/production restrictions
Sem produção, deploy ou merge automático.
'@
    try {
        [IO.File]::WriteAllText($intakeFixturePath, $validIntake, [Text.UTF8Encoding]::new($false))
        $fixtureMetadata = Assert-AgenticIntake -Path $intakeFixturePath -BasePath ([IO.Path]::GetTempPath())
        if ($fixtureMetadata["ID"] -ne "clients-crud") { throw "Fixture A: intake válido não foi normalizado." }
        $invalidIntakes = @(
            @{ Name = "B base"; Replace = "Base branch: develop"; With = "Base branch: production" },
            @{ Name = "C prefixo"; Replace = "Branch prefix: feature"; With = "Branch prefix: release" },
            @{ Name = "D ID traversal"; Replace = "ID: clients-crud"; With = "ID: ../clients-crud" },
            @{ Name = "E allowlist vazia"; Replace = "Allowed files: domains/operations/clients/page.tsx, domains/operations/clients/api.ts"; With = "Allowed files: " },
            @{ Name = "F wildcard"; Replace = "Allowed files: domains/operations/clients/page.tsx, domains/operations/clients/api.ts"; With = "Allowed files: **" },
            @{ Name = "F repo inteiro"; Replace = "Allowed files: domains/operations/clients/page.tsx, domains/operations/clients/api.ts"; With = "Allowed files: ." },
            @{ Name = "password"; Replace = "Sem produção, deploy ou merge automático."; With = "password: [REDACTED]" },
            @{ Name = "authorization bearer"; Replace = "Sem produção, deploy ou merge automático."; With = "Authorization: Bearer [REDACTED]" },
            @{ Name = "cookie"; Replace = "Sem produção, deploy ou merge automático."; With = "Cookie: session=[REDACTED]" },
            @{ Name = "set-cookie"; Replace = "Sem produção, deploy ou merge automático."; With = "Set-Cookie: session=[REDACTED]; HttpOnly" },
            @{ Name = "cookie frase"; Replace = "Sem produção, deploy ou merge automático."; With = "A resposta incluiu Cookie: session=[REDACTED]." },
            @{ Name = "set-cookie markdown"; Replace = "Sem produção, deploy ou merge automático."; With = "- Set-Cookie: session=[REDACTED]; HttpOnly" },
            @{ Name = "api key"; Replace = "Sem produção, deploy ou merge automático."; With = "api_key: [REDACTED]" },
            @{ Name = "api key com espaço"; Replace = "Sem produção, deploy ou merge automático."; With = "API KEY: [REDACTED]" },
            @{ Name = "access key com espaço"; Replace = "Sem produção, deploy ou merge automático."; With = "ACCESS KEY: [REDACTED]" },
            @{ Name = "client secret com espaço"; Replace = "Sem produção, deploy ou merge automático."; With = "CLIENT SECRET: [REDACTED]" },
            @{ Name = "jwt puro"; Replace = "Sem produção, deploy ou merge automático."; With = ("eyJ" + ("A" * 24) + "." + ("B" * 24) + "." + ("C" * 24)) },
            @{ Name = "PEM"; Replace = "Sem produção, deploy ou merge automático."; With = "-----BEGIN PRIVATE KEY-----" },
            @{ Name = "URL com credenciais"; Replace = "Sem produção, deploy ou merge automático."; With = ("https://user:[REDACTED]@example.invalid") }
        )
        foreach ($case in $invalidIntakes) {
            $candidate = $validIntake.Replace([string]$case.Replace, [string]$case.With)
            [IO.File]::WriteAllText($intakeFixturePath, $candidate, [Text.UTF8Encoding]::new($false))
            $rejected = $false; $rejectionMessage = ""
            try { Assert-AgenticIntake -Path $intakeFixturePath -BasePath ([IO.Path]::GetTempPath()) | Out-Null } catch { $rejected = $true; $rejectionMessage = $_.Exception.Message }
            if (-not $rejected) { throw ("Fixture {0}: entrada insegura aceita." -f $case.Name) }
            if ($case.Name -in @("password", "authorization bearer", "cookie", "set-cookie", "cookie frase", "set-cookie markdown", "api key", "api key com espaço", "access key com espaço", "client secret com espaço", "jwt puro", "PEM", "URL com credenciais") -and $rejectionMessage -ne "Intake rejeitado: conteúdo sensível detectado; valor omitido.") { throw ("Fixture {0}: alerta de dado sensível não foi sanitizado." -f $case.Name) }
        }
    }
    finally { Remove-Item -LiteralPath $intakeFixturePath -Force -ErrorAction SilentlyContinue }
    # Fixtures G-H: intake is the sole dirty path accepted by bootstrap.
    if (-not (Assert-AgenticBootstrapStatus -StatusLines @("?? agentic/state/intake.md"))) { throw "Fixture H: intake novo controlado não foi aceito." }
    if (-not (Assert-AgenticBootstrapStatus -StatusLines @('?? agentic/state/intake.md', '?? agentic/state/history/previous-goal-hash.json'))) { throw 'Lifecycle B: state history local bloqueou um novo bootstrap.' }
    if (-not (Assert-AgenticBootstrapStatus -StatusLines @('?? agentic/state/intake.md', '?? agentic/state/results/agentic-fixture/0123456789abcdef0123456789abcdef.json'))) { throw 'Lifecycle B: resultado local validado bloqueou um novo bootstrap.' }
    $unrelatedStatusCases = @(
        [pscustomobject]@{ Lines = @(" M agentic/state/loop-state.json") },
        [pscustomobject]@{ Lines = @("?? agentic/journal/current.md") },
        [pscustomobject]@{ Lines = @("?? src/unrelated.ts") },
        [pscustomobject]@{ Lines = [string[]]@() }
    )
    foreach ($statusCase in $unrelatedStatusCases) {
        $rejected = $false
        try { Assert-AgenticBootstrapStatus -StatusLines $statusCase.Lines | Out-Null } catch { $rejected = $true }
        if (-not $rejected) { throw "Fixture G: alteração preexistente foi aceita junto ao intake." }
    }
    if ($startSource -notmatch 'agentic/state/intake\.md' -or $startSource -notmatch 'Assert-AgenticBootstrapStatus') { throw "Fixture G-H: bootstrap não restringe alterações locais ao intake controlado." }
    $preflightIndex = $frontDoorSource.IndexOf('preflight architect estritamente read-only')
    $intakeIndex = $frontDoorSource.IndexOf('intake completo')
    if ($preflightIndex -lt 0 -or $intakeIndex -le $preflightIndex -or $frontDoorSource -notmatch 'allowlist curta e concreta') { throw 'Lifecycle G: preflight sem paths concretos não está documentado antes do intake.' }
    $preparedCheckpointIndex = $startSource.IndexOf('Initialize-AgenticNewGoalCheckpoint -PreviousState $checkpoint')
    $branchCheckpointRefreshIndex = $startSource.IndexOf('$checkpoint = Get-AgenticState', $startSource.IndexOf('$branch = Start-GoalBranch -Metadata $metadata'))
    $preparedJournalIndex = $startSource.IndexOf('Add-AgenticJournalEvent -Goal $preparedState.goal_id -State ''DISCOVERY''')
    $preparedProcessIndex = $startSource.IndexOf('[Diagnostics.Process]::Start($startInfo)')
    if ($branchCheckpointRefreshIndex -lt 0 -or $branchCheckpointRefreshIndex -ge $preparedCheckpointIndex) { throw 'Bootstrap fixture A/G: start precisa reler o checkpoint do checkout novo antes de arquivar/substituir.' }
    if ($preparedCheckpointIndex -lt 0 -or $preparedJournalIndex -le $preparedCheckpointIndex -or $preparedProcessIndex -le $preparedJournalIndex -or $startSource.IndexOf('Assert-AgenticPreparedCheckpoint -State $preparedState') -le $preparedJournalIndex) { throw 'Lifecycle U: start deve persistir e validar checkpoint/journal antes do subprocesso.' }
    $branchCreationIndex = $startSource.IndexOf('Start-GoalBranch -Metadata $metadata')
    $goalWriterIndex = $startSource.IndexOf('Write-AgenticPreparedGoal -Path $goalPath')
    if ($branchCreationIndex -lt 0 -or $goalWriterIndex -le $branchCreationIndex) { throw "Fixture J: start não chama materialização depois de criar a branch." }
    # Fixture J: materialization is behaviorally gated by the checked-out work branch.
    $bootstrapFixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("agentic-bootstrap-{0}" -f [guid]::NewGuid().ToString("N"))
    $bootstrapFixtureGoal = Join-Path $bootstrapFixtureRoot "agentic/goals/fixture-goal.md"
    $bootstrapFixtureMetadata = @{ ID = "fixture-goal"; "Branch prefix" = "feature" }
    $outsideGoal = $null
    [IO.Directory]::CreateDirectory($bootstrapFixtureRoot) | Out-Null
    try {
        $wrongBranchRejected = $false
        try { Write-AgenticPreparedGoal -Path $bootstrapFixtureGoal -Text "fixture goal" -Metadata $bootstrapFixtureMetadata -CurrentBranch "develop" -BasePath $bootstrapFixtureRoot | Out-Null } catch { $wrongBranchRejected = $true }
        if (-not $wrongBranchRejected -or (Test-Path -LiteralPath $bootstrapFixtureGoal)) { throw "Fixture J: goal foi materializado antes da branch de trabalho." }
        Write-AgenticPreparedGoal -Path $bootstrapFixtureGoal -Text "fixture goal" -Metadata $bootstrapFixtureMetadata -CurrentBranch "feature/fixture-goal" -BasePath $bootstrapFixtureRoot | Out-Null
        if (-not (Test-Path -LiteralPath $bootstrapFixtureGoal) -or [IO.File]::ReadAllText($bootstrapFixtureGoal) -cne "fixture goal") { throw "Fixture J: goal não foi materializado na branch validada." }
        $insideHandle = [IO.File]::OpenRead($bootstrapFixtureGoal)
        try { Assert-AgenticOpenedPathWithinRoot -Stream $insideHandle -Path $bootstrapFixtureGoal -BasePath $bootstrapFixtureRoot | Out-Null } finally { $insideHandle.Dispose() }
        $outsideGoal = Join-Path ([IO.Path]::GetTempPath()) ("agentic-outside-{0}.md" -f [guid]::NewGuid().ToString("N"))
        $outsideGoalRejected = $false
        try { Write-AgenticPreparedGoal -Path $outsideGoal -Text "fixture goal" -Metadata @{ ID = "fixture-goal"; "Branch prefix" = "feature" } -CurrentBranch "feature/fixture-goal" -BasePath $bootstrapFixtureRoot | Out-Null } catch { $outsideGoalRejected = $true }
        if (-not $outsideGoalRejected -or (Test-Path -LiteralPath $outsideGoal)) { throw "Fixture J: destino fora do repositório temporário foi aceito." }
    }
    finally {
        Remove-Item -LiteralPath $bootstrapFixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
        if ($outsideGoal -and (Test-Path -LiteralPath $outsideGoal)) { Remove-Item -LiteralPath $outsideGoal -Force -ErrorAction SilentlyContinue }
    }
    # Reparse point fixture uses NTFS junctions in temporary directories and exercises existing intake and destination checks.
    $reparseFixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("agentic-reparse-{0}" -f [guid]::NewGuid().ToString("N"))
    $reparseOutside = Join-Path ([IO.Path]::GetTempPath()) ("agentic-reparse-target-{0}" -f [guid]::NewGuid().ToString("N"))
    $stateJunction = Join-Path $reparseFixtureRoot "agentic/state"
    $goalsJunction = Join-Path $reparseFixtureRoot "agentic/goals"
    [IO.Directory]::CreateDirectory((Join-Path $reparseFixtureRoot "agentic")) | Out-Null
    [IO.Directory]::CreateDirectory($reparseOutside) | Out-Null
    try {
        $null = New-Item -ItemType Junction -Path $stateJunction -Target $reparseOutside -ErrorAction Stop
        [IO.File]::WriteAllText((Join-Path $reparseOutside "intake.md"), $validIntake, [Text.UTF8Encoding]::new($false))
        $directReparseCheckRejected = $false
        try { Assert-AgenticNoReparsePoints -Path (Join-Path $stateJunction "intake.md") -BasePath $reparseFixtureRoot -RequireLeaf | Out-Null } catch { $directReparseCheckRejected = $true }
        $reparseIntakeRejected = $false
        try { Assert-AgenticIntake -Path (Join-Path $stateJunction "intake.md") -BasePath $reparseFixtureRoot | Out-Null } catch { $reparseIntakeRejected = $true }
        if (-not $reparseIntakeRejected) {
            $junctionItem = Get-Item -LiteralPath $stateJunction -Force -ErrorAction SilentlyContinue
            $junctionType = if ($null -eq $junctionItem) { "missing" } else { $junctionItem.GetType().Name }
            $junctionAttributes = try { [IO.File]::GetAttributes($stateJunction).ToString() } catch { "unavailable" }
            $relativePath = Get-AgenticRelativePath -BasePath $reparseFixtureRoot -TargetPath (Join-Path $stateJunction "intake.md")
            $componentAttributes = @()
            $componentPath = $reparseFixtureRoot
            foreach ($component in ($relativePath -split '/')) { $componentPath = Join-Path $componentPath $component; $componentAttributes += try { [IO.File]::GetAttributes($componentPath).ToString() } catch { "missing" } }
            throw "Fixture Reparse intake: DirectCheck=$directReparseCheckRejected; PathType=$junctionType; FileAttributes=$junctionAttributes; Components=$($componentAttributes -join ',')."
        }

        $savedRepoRoot = $script:AgenticRepoRoot
        try {
            [IO.Directory]::Delete($stateJunction, $false)
            [IO.Directory]::CreateDirectory($stateJunction) | Out-Null
            [IO.File]::WriteAllText((Join-Path $stateJunction 'checkpoint.json'), '{"state":"IDLE"}', [Text.UTF8Encoding]::new($false))
            $script:AgenticRepoRoot = $reparseFixtureRoot
            $safeSnapshot = Get-AgenticControlPlaneSnapshot
            [IO.File]::WriteAllText((Join-Path $stateJunction 'checkpoint.json'), '{"state":"FAILED"}', [Text.UTF8Encoding]::new($false))
            $ordinaryTamperRejected = $false
            $ordinaryTamperFailure = ''
            try { Assert-AgenticControlPlaneUnchanged -Snapshot $safeSnapshot | Out-Null } catch { $ordinaryTamperFailure = [string]$_.Exception.Message; $ordinaryTamperRejected = $ordinaryTamperFailure -match 'restaurou o checkpoint' }
            $restoredCheckpoint = [IO.File]::ReadAllText((Join-Path $stateJunction 'checkpoint.json'), [Text.UTF8Encoding]::new($false))
            if (-not $ordinaryTamperRejected -or $restoredCheckpoint -cne '{"state":"IDLE"}') { throw ("Fixture Control Restore: alteração comum não foi restaurada pelo supervisor. Rejected={0}; Checkpoint={1}; Cause={2}" -f $ordinaryTamperRejected, $restoredCheckpoint, $ordinaryTamperFailure) }
            [IO.Directory]::Delete($stateJunction, $true)
            $null = New-Item -ItemType Junction -Path $stateJunction -Target $reparseOutside -ErrorAction Stop
            $outsideCheckpoint = Join-Path $reparseOutside 'intake.md'
            $outsideBefore = Get-AgenticFileSha256 -Path $outsideCheckpoint -BasePath $reparseOutside
            $unsafeControlRejected = $false
            try { Assert-AgenticControlPlaneUnchanged -Snapshot $safeSnapshot | Out-Null } catch { $unsafeControlRejected = $_.Exception.Message -match 'reparse point' }
            if (-not $unsafeControlRejected -or (Get-AgenticFileSha256 -Path $outsideCheckpoint -BasePath $reparseOutside) -cne $outsideBefore) { throw 'Fixture Control Reparse: snapshot/restauração seguiu reparse point ou tocou destino externo.' }
        }
        finally { $script:AgenticRepoRoot = $savedRepoRoot }

        $null = New-Item -ItemType Junction -Path $goalsJunction -Target $reparseOutside -ErrorAction Stop
        $outsideHandlePath = Join-Path $reparseOutside "outside-handle.txt"
        [IO.File]::WriteAllText($outsideHandlePath, "fixture", [Text.UTF8Encoding]::new($false))
        $outsideHandle = [IO.File]::OpenRead($outsideHandlePath)
        $outsideFinalPathRejected = $false
        try { Assert-AgenticOpenedPathWithinRoot -Stream $outsideHandle -Path (Join-Path $goalsJunction "outside-handle.txt") -BasePath $reparseFixtureRoot | Out-Null } catch { $outsideFinalPathRejected = $true } finally { $outsideHandle.Dispose() }
        if (-not $outsideFinalPathRejected) { throw "Fixture Reparse final path: handle fora da raiz foi aceito." }
        if (Test-Path -LiteralPath (Join-Path $reparseOutside "fixture-goal.md")) { throw "Fixture Reparse destino: arquivo-alvo preexistia antes do teste de escrita." }
        $reparseDestinationRejected = $false
        try { Write-AgenticPreparedGoal -Path (Join-Path $goalsJunction "fixture-goal.md") -Text "fixture" -Metadata $bootstrapFixtureMetadata -CurrentBranch "feature/fixture-goal" -BasePath $reparseFixtureRoot | Out-Null } catch { $reparseDestinationRejected = $true }
        if (-not $reparseDestinationRejected -or (Test-Path -LiteralPath (Join-Path $reparseOutside "fixture-goal.md"))) { throw "Fixture Reparse destino: junction não foi rejeitado antes da escrita." }
        $reparseArtifactRejected = $false
        try { Write-AgenticBytesSafely -Path (Join-Path $goalsJunction 'fixture-result.json') -Bytes ([Text.UTF8Encoding]::new($false).GetBytes('fixture')) -BasePath $reparseFixtureRoot } catch { $reparseArtifactRejected = $true }
        if (-not $reparseArtifactRejected -or (Test-Path -LiteralPath (Join-Path $reparseOutside 'fixture-result.json'))) { throw 'Fixture Reparse artifact: escrita de resultado não rejeitou junction antes de criar arquivo externo.' }
    }
    finally {
        foreach ($junction in @($stateJunction, $goalsJunction)) {
            if (Test-Path -LiteralPath $junction) { try { [IO.Directory]::Delete($junction, $false) } catch { } }
        }
        foreach ($directory in @((Join-Path $reparseFixtureRoot "agentic"), $reparseFixtureRoot)) {
            if (Test-Path -LiteralPath $directory) { try { [IO.Directory]::Delete($directory, $false) } catch { } }
        }
        if (Test-Path -LiteralPath $reparseOutside) { try { [IO.Directory]::Delete($reparseOutside, $true) } catch { } }
    }
    # Fixtures I/K/L/M/N: supervisor owns Git mutations; manual/resume stays compatible; no automatic merge/deploy; valid handoff enters the prepared loop.
    if ($startSource -notmatch 'Invoke-AgenticGit' -or $startSource -notmatch 'agentic-loop\.ps1') { throw "Fixture I/N: handoff válido não é executado pelo supervisor." }
    if ($startSource -notmatch 'NamedPipeServerStreamAcl\]::Create' -or $startSource -notmatch 'NamedPipeServerStream\]::new' -or $startSource -match 'CurrentUserOnly') { throw "Fixture N: criação do pipe não mantém ACL compatível com PS 5.1 e PS 7." }
    if ($supervisorSource -notmatch 'Start-(?:Agentic)?GoalBranch\s+-Metadata\s+\$metadata' -or $supervisorSource -notmatch '\$Resume' -or $supervisorSource -notmatch '\$PreparedBranch') { throw "Fixture K/L: loop manual ou retomada incompatível." }
    if ($supervisorSource -notmatch 'Assert-AgenticPreparedHandoff' -or $commonSource -notmatch 'agentic/goals/\{0\}\.md') { throw "Fixture N: prepared branch sem handoff autenticado ou goal canônico." }
    $wrongGoalRejected = $false
    try { Assert-AgenticPreparedHandoff -GoalPath (Join-Path $script:AgenticRepoRoot "agentic/goals/other.md") -Metadata @{ ID = "clients-crud"; "Branch prefix" = "feature" } | Out-Null } catch { $wrongGoalRejected = $true }
    if (-not $wrongGoalRejected) { throw "Fixture N: caminho não canônico aceito para branch preparada." }
    $savedPipe = [string]$env:GERIT_AGENTIC_HANDOFF_PIPE
    Remove-Item Env:GERIT_AGENTIC_HANDOFF_PIPE -ErrorAction SilentlyContinue
    $handoffWithoutSupervisorRejected = $false
    try { Assert-AgenticPreparedHandoff -GoalPath (Join-Path $script:AgenticRepoRoot "agentic/goals/clients-crud.md") -Metadata @{ ID = "clients-crud"; "Branch prefix" = "feature" } | Out-Null } catch { $handoffWithoutSupervisorRejected = $true }
    finally { if ($savedPipe) { $env:GERIT_AGENTIC_HANDOFF_PIPE = $savedPipe } }
    if (-not $handoffWithoutSupervisorRejected) { throw "Fixture N: PreparedBranch foi aceito sem o canal temporário do supervisor." }
    $mergeCommandPattern = '(?i)\bgit(?:\.exe)?\s+merge(?:\s|$)|deploy\s+production'
    if ("git merge-base develop main" -match $mergeCommandPattern -or "git merge --no-ff feature/topic" -notmatch $mergeCommandPattern) { throw "Fixture M: detector de merge automático tem falso positivo/negativo." }
    if ($supervisorSource -match $mergeCommandPattern -or $startSource -match $mergeCommandPattern) { throw "Fixture M: merge/deploy automático detectado." }
    foreach ($forbidden in @("git fetch", "git add", "git commit", "git push", "git checkout", "git switch", "gh pr create", "merge")) {
        if ($prompt -notmatch [regex]::Escape($forbidden)) { throw "Prompt nao proibe '$forbidden' dentro do Codex." }
    }
    if ($prompt -match 'FINAL_STATE\s*:') { throw "Prompt ainda concede autoridade de state por texto livre." }
    foreach ($requiredSchemaField in @('schema_version', 'goal_id', 'role', 'invocation_id', 'phase', 'snapshot_sha256', 'status', 'summary', 'findings', 'evidence', 'failure', 'files_changed')) {
        if ($prompt -notmatch [regex]::Escape(('"{0}"' -f $requiredSchemaField))) { throw "Prompt sem campo estruturado obrigatório: $requiredSchemaField." }
    }
    if ($supervisorSource -notmatch 'Set-AgenticSupervisorTransition' -or $supervisorSource -notmatch 'ConvertFrom-AgenticRoleResult' -or $supervisorSource -notmatch 'Invoke-CodexAgentRole') { throw "Supervisor não invoca roles isoladas nem valida resultado estruturado." }
    $readOnlyCommands = @("git status", "git diff", "git diff --check", "git branch --show-current", "git log")
    if (@($readOnlyCommands | Where-Object { $_ -match 'git (fetch|add|commit|push|checkout|switch)|gh pr create' }).Count -gt 0) { throw "Fixture A: lista de comandos read-only contem Git mutavel." }

    # Fixtures A-C: empty optional journal values are normalized without trailing whitespace.
    $originalJournalPath = $script:AgenticJournalPath
    $originalFixtureStatePath = $script:AgenticStatePath
    $originalRepoRootForJournalFixture = $script:AgenticRepoRoot
    $fixtureJournalPath = Join-Path ([IO.Path]::GetTempPath()) ("agentic-journal-whitespace-{0}.md" -f [guid]::NewGuid().ToString("N"))
    $fixtureStatePath = Join-Path ([IO.Path]::GetTempPath()) ("agentic-journal-state-{0}.json" -f [guid]::NewGuid().ToString("N"))
    try {
        $script:AgenticRepoRoot = [IO.Path]::GetTempPath()
        $script:AgenticJournalPath = $fixtureJournalPath
        $fixtureState = Get-AgenticStateTemplate
        $fixtureState.goal_id = 'journal-fixture'; $fixtureState.goal_file = 'agentic/goals/journal-fixture.md'; $fixtureState.branch = 'feature/journal-fixture'; $fixtureState.state = 'TESTING'; $fixtureState.pending_phase = 'TESTING'; $fixtureState.pending_action = 'fixture'
        [IO.File]::WriteAllText($fixtureStatePath, ($fixtureState | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
        $script:AgenticStatePath = $fixtureStatePath
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($fixtureJournalPath, (New-AgenticJournalHeader -GoalId 'journal-fixture' -Branch 'feature/journal-fixture' -BaseBranch 'develop'), $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty quota fixture" -Result "PASS" -Quota ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains "- quota: n/a" -or @(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture A: quota vazia gerou whitespace inválido." }

        [System.IO.File]::WriteAllText($fixtureJournalPath, (New-AgenticJournalHeader -GoalId 'journal-fixture' -Branch 'feature/journal-fixture' -BaseBranch 'develop'), $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty memory fixture" -Result "PASS" -Memory ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains "- memory: n/a" -or @(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture B: memory vazia gerou whitespace inválido." }

        [System.IO.File]::WriteAllText($fixtureJournalPath, (New-AgenticJournalHeader -GoalId 'journal-fixture' -Branch 'feature/journal-fixture' -BaseBranch 'develop'), $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty failure/retry fixture" -Result "PASS" -Failure "" -Retry "" -Gate "" -Quota "" -Memory "" -DelegatedAgent ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        foreach ($field in @("failure", "retry", "gate", "quota", "memory", "delegated_agent")) {
            if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains ("- {0}: n/a" -f $field)) { throw "Fixture C: campo '$field' vazio não virou n/a." }
        }
        if (@(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture C: campos opcionais vazios geraram trailing whitespace." }
    }
    finally {
        $script:AgenticJournalPath = $originalJournalPath
        $script:AgenticStatePath = $originalFixtureStatePath
        $script:AgenticRepoRoot = $originalRepoRootForJournalFixture
        Remove-Item -LiteralPath $fixtureJournalPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $fixtureStatePath -Force -ErrorAction SilentlyContinue
    }

    # Fixture D: whitespace in newly added functional file content blocks the functional quality gate.
    $functionalWhitespaceRejected = $false
    try { Assert-AgenticFileWhitespaceClean -Path "functional-fixture.ts" -Text "new functional line `t`n" | Out-Null }
    catch { $functionalWhitespaceRejected = $true }
    if (-not $functionalWhitespaceRejected) { throw "Fixture D: trailing whitespace em conteúdo funcional não bloqueou o gate." }

    # Fixture E: control paths are excluded from the functional whitespace gate.
    if (-not (Assert-AgenticFunctionalDiffCheck -Paths @("agentic/state/loop-state.json", "agentic/journal/current.md", "agentic/journal/history/old.md"))) { throw "Fixture E: whitespace de state/journal bloqueou o diff funcional." }

    # Fixture F: supervisor must run the cached diff check after staging and before commit.
    $stageIndex = $supervisorSource.IndexOf('Invoke-Git -GitArguments (@("add"')
    $stagedCheckIndex = $supervisorSource.IndexOf('$step = "git diff --cached --check"')
    $commitIndex = $supervisorSource.IndexOf('$step = "git commit"')
    if ($stageIndex -lt 0 -or $stagedCheckIndex -le $stageIndex -or $commitIndex -le $stagedCheckIndex) { throw "Fixture F: git diff --cached --check não está entre stage e commit." }

    $metadata = @{
        "ID" = "agentic-fixture"
        "Title" = "Fixture do supervisor"
        "Base branch" = "develop"
        "Branch prefix" = "feature"
        "Allowed files" = "scripts/agentic-common.ps1"
    }
    $provenanceJournal = @'
## 2026-10-16T10:00:00Z - agentic-fixture - iteracao 1
- state: PLANNING
- controller: supervisor
- actor: supervisor
- delegated_agent: implementer
- action: delegar implementacao do fixture
- files_changed: nenhum
- decision: checkpoint
- gate: n/a
- result: PASS
- failure: n/a
- retry: n/a
- quota: n/a
- memory: MEMORY_UNAVAILABLE

## 2026-10-16T10:01:00Z - agentic-fixture - iteracao 1
- state: IMPLEMENTING
- controller: supervisor
- actor: implementer
- delegated_agent: n/a
- action: atualizar fixture
- files_changed: scripts/agentic-common.ps1
- decision: checkpoint
- gate: n/a
- result: PASS
- failure: n/a
- retry: n/a
- quota: n/a
- memory: MEMORY_UNAVAILABLE
'@
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
    Set-AgenticFixtureReadinessEvidence -State $state -Paths @('scripts/agentic-common.ps1')

    # goal_id must be explicitly present and match the active goal ID case-sensitively.
    $goalIdReadinessCases = @(
        [pscustomobject]@{ Name = "ausente"; IncludeProperty = $false; Value = $null; ExpectedPass = $false },
        [pscustomobject]@{ Name = "vazio"; IncludeProperty = $true; Value = ""; ExpectedPass = $false },
        [pscustomobject]@{ Name = "diferente"; IncludeProperty = $true; Value = "another-goal"; ExpectedPass = $false },
        [pscustomobject]@{ Name = "casing diferente"; IncludeProperty = $true; Value = "Agentic-fixture"; ExpectedPass = $false },
        [pscustomobject]@{ Name = "exatamente igual"; IncludeProperty = $true; Value = "agentic-fixture"; ExpectedPass = $true }
    )
    foreach ($goalIdCase in $goalIdReadinessCases) {
        $goalIdState = $state | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        if ($goalIdCase.IncludeProperty) { $goalIdState.goal_id = $goalIdCase.Value }
        else { $null = $goalIdState.PSObject.Properties.Remove("goal_id") }
        if ($goalIdCase.ExpectedPass) { Set-AgenticFixtureReadinessEvidence -State $goalIdState -Paths @('scripts/agentic-common.ps1') }
        $accepted = $false
        try {
            Test-AgenticReadiness -State $goalIdState -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null
            $accepted = $true
        }
        catch { $accepted = $false }
        if ($accepted -ne $goalIdCase.ExpectedPass) { throw "Fixture goal_id '$($goalIdCase.Name)' retornou resultado incorreto." }
    }

    # Control paths never enter commit paths or functional classification.
    $coordinationOnlyPaths = @(Get-AgenticCommitPaths -ChangedPaths @('agentic/state/loop-state.json', 'agentic/journal/current.md', 'agentic/plans/local.md'))
    if ($coordinationOnlyPaths.Count -ne 0) { throw 'Control paths foram incluídos nos commit paths.' }

    if (-not (Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1", "agentic/state/loop-state.json") -JournalText $provenanceJournal)) { throw "Fixture B: READY_TO_COMMIT nao foi reconhecido." }

    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/wrong-branch" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture C: branch incorreta foi aceita." }

    $rejected = $false
    $state.security_review_status = "PENDING"
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem reviews PASS foi aceito." }
    $state.security_review_status = "PASS"
    $state.code_review_status = "PENDING"
    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem code review PASS foi aceito." }
    $state.code_review_status = "PASS"
    $state.quality_gates.lint = "FAIL"
    Set-AgenticGateResult -State $state -Name 'lint' -Status 'FAIL' -Reason 'fixture failure' | Out-Null
    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture D: state sem quality gates PASS foi aceito." }
    $state.quality_gates.lint = "PASS"
    Set-AgenticGateResult -State $state -Name 'lint' -Status 'PASS' -Reason 'fixture restored' | Out-Null

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

    # Fixture A: orchestrator pode alterar somente state/journal de coordenacao.
    $coordinationJournal = "## coordination`n- actor: supervisor`n- action: checkpoint`n- files_changed: agentic/state/loop-state.json`n- result: PASS"
    if (-not (Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @() -JournalText $coordinationJournal)) { throw "Fixture A: state/journal coordination foi rejeitada." }

    # Fixture B: orchestrator nao pode executar alteracao funcional.
    $roleJournal = "## role`n- actor: orchestrator`n- action: alteracao`n- files_changed: scripts/agentic-common.ps1`n- result: PASS"
    $rejected = $false
    try { Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @("scripts/agentic-common.ps1") -JournalText $roleJournal | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture B: orchestrator foi aceito como executor funcional." }

    # Fixture C: implementer com arquivo permitido e evento verificavel e aceito.
    if (-not (Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal)) { throw "Fixture C: implementer valido foi rejeitado." }

    # Fixtures D-G: demais roles nao podem executar alteracoes funcionais.
    foreach ($role in @("architect", "tester", "security", "reviewer")) {
        $roleJournal = "## role`n- actor: $role`n- action: alteracao`n- files_changed: scripts/agentic-common.ps1`n- result: PASS"
        $rejected = $false
        try { Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @("scripts/agentic-common.ps1") -JournalText $roleJournal | Out-Null } catch { $rejected = $true }
        if (-not $rejected) { throw "Fixture de role: '$role' foi aceito como executor funcional." }
    }

    # Fixture H: journal estruturado de outro goal e bloco sem schema nao comprovam provenance.
    $otherGoalJournal = @'
## 2026-10-16T10:00:00Z - another-goal - iteracao 1
- state: PLANNING
- controller: orchestrator
- actor: orchestrator
- delegated_agent: implementer
- action: delegar implementacao
- files_changed: nenhum
- result: PASS

## 2026-10-16T10:01:00Z - another-goal - iteracao 1
- state: IMPLEMENTING
- controller: orchestrator
- actor: implementer
- delegated_agent: n/a
- action: atualizar mesmo arquivo
- files_changed: scripts/agentic-common.ps1
- result: PASS
'@
    $rejected = $false
    try { Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @("scripts/agentic-common.ps1") -JournalText $otherGoalJournal | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture H: provenance estruturada de outro goal foi aceita." }
    $rejected = $false
    try { Test-AgenticImplementerProvenance -GoalId "agentic-fixture" -FunctionalPaths @("scripts/agentic-common.ps1") -JournalText "- actor: implementer`n- action: alteracao`n- files_changed: scripts/agentic-common.ps1`n- result: PASS" | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Fixture H: bloco sem heading/schema foi aceito." }

    # Fixture I: prompt proibe mutacoes Git em codex exec e reserva-as ao supervisor.
    foreach ($operation in @("git fetch", "git add", "git commit", "git push", "git checkout", "git switch", "gh pr create", "merge")) {
        if ($prompt -notmatch [regex]::Escape($operation)) { throw "Fixture Git supervisor: prompt nao documenta bloqueio de '$operation'." }
    }
    if ($prompt -notmatch 'exclusivos do supervisor') { throw "Fixture I: Git mutável não está reservado ao supervisor." }

    # Fixture J: state valido continua elegivel a READY_TO_COMMIT.
    $state.state = "READY_TO_COMMIT"
    $state.pr_number = $null
    $state.pr_url = $null
    Set-AgenticFixtureReadinessEvidence -State $state -Paths @('scripts/agentic-common.ps1')
    if (-not (Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal)) { throw "Fixture fluxo valido: READY_TO_COMMIT foi bloqueado." }

    # Bootstrap fixtures use the checked-in front-door goal as an immutable fixture input.
    $bootstrapGoalFile = Join-Path $script:AgenticRepoRoot "agentic/goals/codex-desktop-front-door.md"
    $bootstrapMetadata = Get-AgenticGoalMetadata -Path $bootstrapGoalFile
    $bootstrapGoalId = [string]$bootstrapMetadata["ID"]
    $bootstrapCanonicalPath = "agentic/goals/{0}.md" -f $bootstrapGoalId
    $bootstrapHash = Get-AgenticFileSha256 -Path $bootstrapGoalFile
    if ((Get-AgenticAllowedGoalFiles -Metadata $bootstrapMetadata) -contains $bootstrapCanonicalPath) { throw "Fixture 1: goal bootstrap foi listado como arquivo funcional permitido." }
    $bootstrapJournal = @"
## 2026-10-19T10:00:00Z - $bootstrapGoalId - iteracao 1
- state: DISCOVERY
- controller: supervisor
- actor: supervisor
- delegated_agent: n/a
- action: Materializar goal bootstrap autenticado
- files_changed: $bootstrapCanonicalPath
- decision: materialização após validar branch de trabalho
- gate: bootstrap_goal_sha256=$bootstrapHash
- result: PASS
- failure: n/a
- retry: n/a
- quota: n/a
- memory: AVAILABLE
"@
    $bootstrapState = [pscustomobject]@{
        state = "READY_TO_COMMIT"
        goal_id = $bootstrapGoalId
        goal_file = $bootstrapCanonicalPath
        bootstrap_goal_sha256 = $bootstrapHash
        branch = "feature/$bootstrapGoalId"
        base_branch = "develop"
        quality_gates = [pscustomobject]@{ diff_check = "PASS"; lint = "PASS"; build = "PASS"; typecheck = "PASS" }
        security_review_status = "PASS"
        code_review_status = "PASS"
    }
    Set-AgenticFixtureReadinessEvidence -State $bootstrapState -Paths @($bootstrapCanonicalPath)
    $wrongCaseBootstrapState = $bootstrapState | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $wrongCaseBootstrapState.bootstrap_goal_sha256 = $bootstrapHash.ToUpperInvariant()
    $wrongCaseHashRejected = $false
    try { Assert-AgenticBootstrapGoalIntegrity -State $wrongCaseBootstrapState -Metadata $bootstrapMetadata -ExpectedSha256 $bootstrapHash | Out-Null } catch { $wrongCaseHashRejected = $true }
    if (-not $wrongCaseHashRejected) { throw "Fixture 4: SHA-256 com casing diferente foi aceito." }
    $bootstrapChangedPaths = @($bootstrapCanonicalPath, "scripts/agentic-common.ps1")
    Set-AgenticFixtureReadinessEvidence -State $bootstrapState -Paths @($bootstrapCanonicalPath)
    if (-not (Test-AgenticReadiness -State $bootstrapState -Metadata $bootstrapMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths @($bootstrapCanonicalPath) -JournalText $bootstrapJournal -BootstrapGoalSha256 $bootstrapHash)) { throw "Fixture 2: goal bootstrap canônico exigiu provenance funcional." }
    $bootstrapCommitPaths = @(Get-AgenticCommitPaths -ChangedPaths @($bootstrapCanonicalPath, "agentic/state/loop-state.json", "agentic/journal/current.md", "scripts/agentic-common.ps1"))
    if ($bootstrapCommitPaths -notcontains $bootstrapCanonicalPath) { throw "Fixture 3: goal bootstrap canônico não entrou no conjunto a stagear." }
    if ($bootstrapCommitPaths -contains "agentic/state/loop-state.json" -or $bootstrapCommitPaths -contains "agentic/journal/current.md") { throw "Fixture 9: state/journal entraram no conjunto a stagear." }

    $tamperRoot = Join-Path ([IO.Path]::GetTempPath()) ("agentic-bootstrap-integrity-{0}" -f [guid]::NewGuid().ToString("N"))
    $tamperGoalPath = Join-Path $tamperRoot "agentic/goals/bootstrap-fixture.md"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $tamperGoalPath)) | Out-Null
    try {
        $initResult = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C', $tamperRoot, 'init', '--quiet')
        Assert-AgenticNativeProcessSucceeded -Result $initResult -CommandName 'git init fixture'
        [IO.File]::WriteAllText($tamperGoalPath, "original materialized bytes", [Text.UTF8Encoding]::new($false))
        $originalHash = Get-AgenticFileSha256 -Path $tamperGoalPath -BasePath $tamperRoot
        Write-AgenticBootstrapAnchor -GoalId 'bootstrap-fixture' -Sha256 $originalHash -BasePath $tamperRoot | Out-Null
        Assert-AgenticBootstrapAnchor -GoalId 'bootstrap-fixture' -ExpectedSha256 $originalHash -BasePath $tamperRoot | Out-Null
        $tamperState = [pscustomobject]@{ goal_id = "bootstrap-fixture"; goal_file = "agentic/goals/bootstrap-fixture.md"; bootstrap_goal_sha256 = $originalHash }
        [IO.File]::WriteAllText($tamperGoalPath, "changed after materialization", [Text.UTF8Encoding]::new($false))
        $tamperRejected = $false
        try { Assert-AgenticBootstrapGoalIntegrity -State $tamperState -Metadata @{ ID = "bootstrap-fixture" } -ExpectedSha256 $originalHash -BasePath $tamperRoot | Out-Null } catch { $tamperRejected = $true }
        if (-not $tamperRejected) { throw "Fixture 4: alteração do goal bootstrap após materialização foi aceita." }
        $tamperState.bootstrap_goal_sha256 = Get-AgenticFileSha256 -Path $tamperGoalPath -BasePath $tamperRoot
        $stateHashReplacementRejected = $false
        try { Assert-AgenticBootstrapAnchor -GoalId 'bootstrap-fixture' -ExpectedSha256 $tamperState.bootstrap_goal_sha256 -BasePath $tamperRoot | Out-Null } catch { $stateHashReplacementRejected = $true }
        if (-not $stateHashReplacementRejected) { throw "Fixture 4: hash do checkpoint foi silenciosamente substituído após alteração do goal." }
    }
    finally { Remove-Item -LiteralPath $tamperRoot -Recurse -Force -ErrorAction SilentlyContinue }

    $bootstrapSupervisorOnlyJournal = $bootstrapJournal
    $bootstrapWithImplementerJournal = @"
$bootstrapJournal

## 2026-10-19T10:01:00Z - $bootstrapGoalId - iteracao 1
- state: PLANNING
- controller: supervisor
- actor: supervisor
- delegated_agent: implementer
- action: Delegar atualização do supervisor
- files_changed: nenhum
- decision: iniciar implementação permitida
- gate: n/a
- result: PASS
- failure: n/a
- retry: n/a
- quota: AVAILABLE
- memory: AVAILABLE

## 2026-10-19T10:02:00Z - $bootstrapGoalId - iteracao 1
- state: IMPLEMENTING
- controller: supervisor
- actor: implementer
- delegated_agent: n/a
- action: Atualizar validação de bootstrap
- files_changed: scripts/agentic-common.ps1
- decision: implementação no escopo
- gate: n/a
- result: PASS
- failure: n/a
- retry: n/a
- quota: AVAILABLE
- memory: AVAILABLE
"@
    foreach ($untrustedGoalPath in @("agentic/goals/another-id.md", "agentic/goals/arbitrary.md")) {
        $rejectedGoalPath = $false
        try { Test-AgenticReadiness -State $bootstrapState -Metadata $bootstrapMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths @($bootstrapCanonicalPath, $untrustedGoalPath) -JournalText $bootstrapWithImplementerJournal -BootstrapGoalSha256 $bootstrapHash | Out-Null } catch { $rejectedGoalPath = $true }
        if (-not $rejectedGoalPath) { throw "Fixture 5/6: arquivo goal não canônico '$untrustedGoalPath' foi aceito." }
    }
    $explicitArbitraryGoalMetadata = @{
        "ID" = $bootstrapGoalId
        "Title" = $bootstrapMetadata["Title"]
        "Base branch" = $bootstrapMetadata["Base branch"]
        "Branch prefix" = $bootstrapMetadata["Branch prefix"]
        "Allowed files" = "agentic/goals/arbitrary.md"
    }
    $arbitraryGoalFile = Join-Path $script:AgenticRepoRoot "agentic/goals/arbitrary.md"
    if (Test-Path -LiteralPath $arbitraryGoalFile) { throw "Fixture 6: arquivo temporário arbitrário já existe; teste não irá sobrescrevê-lo." }
    try {
        [IO.File]::WriteAllText($arbitraryGoalFile, "fixture goal file`n", [Text.UTF8Encoding]::new($false))
        $arbitraryGoalWithoutImplementerRejected = $false
        try { Test-AgenticReadiness -State $bootstrapState -Metadata $explicitArbitraryGoalMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths @("agentic/goals/arbitrary.md") -JournalText $bootstrapSupervisorOnlyJournal -BootstrapGoalSha256 $bootstrapHash | Out-Null } catch { $arbitraryGoalWithoutImplementerRejected = $true }
        if (-not $arbitraryGoalWithoutImplementerRejected) { throw "Fixture 6: arquivo agentic/goals arbitrário recebeu confiança bootstrap sem provenance funcional." }
    }
    finally { Remove-Item -LiteralPath $arbitraryGoalFile -Force -ErrorAction SilentlyContinue }
    $outsideAllowedRejected = $false
    try { Test-AgenticReadiness -State $bootstrapState -Metadata $bootstrapMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths @($bootstrapCanonicalPath, "functional/not-allowed.ts") -JournalText $bootstrapWithImplementerJournal -BootstrapGoalSha256 $bootstrapHash | Out-Null } catch { $outsideAllowedRejected = $true }
    if (-not $outsideAllowedRejected) { throw "Fixture 7: arquivo funcional fora de Allowed files foi aceito." }
    $missingFunctionalProvenanceRejected = $false
    try { Test-AgenticReadiness -State $bootstrapState -Metadata $bootstrapMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths @($bootstrapCanonicalPath, "scripts/agentic-common.ps1") -JournalText $bootstrapSupervisorOnlyJournal -BootstrapGoalSha256 $bootstrapHash | Out-Null } catch { $missingFunctionalProvenanceRejected = $true }
    if (-not $missingFunctionalProvenanceRejected) { throw "Fixture 8: arquivo funcional sem provenance do implementer foi aceito." }
    if ($supervisorSource -notmatch 'Test-AgenticReadiness[^\r\n]+BootstrapGoalSha256' -or $supervisorSource -notmatch 'Get-AgenticCommitPaths') { throw "Fixture 3/12: finalização não integra autenticação bootstrap ao readiness/stage." }

    # Fixture 10: manual loop remains functional and receives no bootstrap classification.
    $manualState = $state | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $manualState.goal_id = "agentic-fixture"
    if ($null -eq $manualState.PSObject.Properties["goal_file"]) { $manualState | Add-Member -NotePropertyName goal_file -NotePropertyValue "agentic/goals/agentic-fixture.md" }
    else { $manualState.goal_file = "agentic/goals/agentic-fixture.md" }
    if ($null -eq $manualState.PSObject.Properties["bootstrap_goal_sha256"]) { $manualState | Add-Member -NotePropertyName bootstrap_goal_sha256 -NotePropertyValue $null }
    else { $manualState.bootstrap_goal_sha256 = $null }
    Set-AgenticFixtureReadinessEvidence -State $manualState -Paths @('scripts/agentic-common.ps1')
    if (-not (Test-AgenticReadiness -State $manualState -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal)) { throw "Fixture 10: fluxo manual sem bootstrap autenticado deixou de ser compatível." }

    # Fixture 12: front-door handoff can reach READY_TO_COMMIT with bootstrap + functional provenance.
    Set-AgenticFixtureReadinessEvidence -State $bootstrapState -Paths $bootstrapChangedPaths
    if (-not (Test-AgenticReadiness -State $bootstrapState -Metadata $bootstrapMetadata -CurrentBranch "feature/$bootstrapGoalId" -ChangedPaths $bootstrapChangedPaths -JournalText $bootstrapWithImplementerJournal -BootstrapGoalSha256 $bootstrapHash)) { throw "Fixture 12: bootstrap válido bloqueou READY_TO_COMMIT." }

    # Lifecycle fixtures A-X exercise isolated journals, resume, policies and the supervisor handoff.
    $lifecycleRoot = Join-Path ([IO.Path]::GetTempPath()) ('agentic-lifecycle-{0}' -f [guid]::NewGuid().ToString('N'))
    $lifecycleJournal = Join-Path $lifecycleRoot 'journal/current.md'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $lifecycleJournal)) | Out-Null
    try {
        $goalAHeader = New-AgenticJournalHeader -GoalId 'goal-a' -Branch 'feature/goal-a' -BaseBranch 'develop'
        [IO.File]::WriteAllText($lifecycleJournal, ($goalAHeader + "`n## historical event for goal-a`n"), [Text.UTF8Encoding]::new($false))
        Initialize-AgenticJournalForGoal -GoalId 'goal-b' -Branch 'feature/goal-b' -BaseBranch 'develop' -JournalPath $lifecycleJournal -BasePath $lifecycleRoot
        $goalBText = [IO.File]::ReadAllText($lifecycleJournal, [Text.UTF8Encoding]::new($false))
        if ($goalBText -match 'historical event for goal-a' -or (Get-AgenticJournalHeader -JournalText $goalBText).goal_id -cne 'goal-b') { throw 'Lifecycle A/B: novo goal herdou journal anterior.' }
        $archives = @(Get-ChildItem -LiteralPath (Join-Path (Split-Path -Parent $lifecycleJournal) 'history') -File)
        if ($archives.Count -ne 1 -or [IO.File]::ReadAllText($archives[0].FullName) -notmatch 'goal-a') { throw 'Lifecycle B: journal anterior não foi arquivado.' }
        $goalBState = [pscustomobject]@{ goal_id = 'goal-b'; branch = 'feature/goal-b'; base_branch = 'develop' }
        if (-not (Assert-AgenticJournalMatchesState -State $goalBState -JournalPath $lifecycleJournal -BasePath $lifecycleRoot)) { throw 'Lifecycle C: journal ativo não corresponde ao state.' }
        $goalAState = [pscustomobject]@{ goal_id = 'goal-a'; branch = 'feature/goal-a'; base_branch = 'develop' }
        $mismatchRejected = $false
        try { Assert-AgenticJournalMatchesState -State $goalAState -JournalPath $lifecycleJournal -BasePath $lifecycleRoot | Out-Null } catch { $mismatchRejected = $true }
        if (-not $mismatchRejected) { throw 'Lifecycle C: resume aceitou journal de outro goal.' }
    }
    finally { Remove-Item -LiteralPath $lifecycleRoot -Recurse -Force -ErrorAction SilentlyContinue }

    $stateArchiveRoot = Join-Path ([IO.Path]::GetTempPath()) ('agentic-state-archive-{0}' -f [guid]::NewGuid().ToString('N'))
    $stateArchivePath = Join-Path $stateArchiveRoot 'state/loop-state.json'
    $originalStatePath = $script:AgenticStatePath
    $originalRepoRootForStateFixture = $script:AgenticRepoRoot
    [IO.Directory]::CreateDirectory((Split-Path -Parent $stateArchivePath)) | Out-Null
    try {
        $previousState = [pscustomobject]@{ state = 'FAILED'; goal_id = 'previous-goal'; branch = 'fix/previous-goal'; base_branch = 'develop' }
        [IO.File]::WriteAllText($stateArchivePath, ($previousState | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
        $script:AgenticStatePath = $stateArchivePath
        $script:AgenticRepoRoot = $stateArchiveRoot
        $freshState = Reset-AgenticStateForNewGoal -PreviousState $previousState -StatePath $stateArchivePath
        $stateArchives = @(Get-ChildItem -LiteralPath (Join-Path (Split-Path -Parent $stateArchivePath) 'history') -File)
        if ($freshState.state -ne 'IDLE' -or $null -ne $freshState.goal_id -or $stateArchives.Count -ne 1) { throw 'Lifecycle B: state anterior não foi arquivado nem isolado do novo goal.' }
        if (@(Get-AgenticCommitPaths -ChangedPaths @('agentic/state/history/previous.json')).Count -ne 0) { throw 'Lifecycle K: histórico de state entrou nos commit paths.' }
    }
    finally { $script:AgenticStatePath = $originalStatePath; $script:AgenticRepoRoot = $originalRepoRootForStateFixture; Remove-Item -LiteralPath $stateArchiveRoot -Recurse -Force -ErrorAction SilentlyContinue }

    # Bootstrap A-L: replace stale terminal state atomically, preserve resume identity, and validate the authenticated child handoff.
    Invoke-AgenticBootstrapStateIsolationFixture | Out-Null
    $startSourceForIsolation = [IO.File]::ReadAllText((Join-Path $script:AgenticRepoRoot 'scripts/agentic-start.ps1'), [Text.UTF8Encoding]::new($false))
    $preparedStateIndex = $startSourceForIsolation.IndexOf('Initialize-AgenticNewGoalCheckpoint -PreviousState $checkpoint')
    $handoffLaunchIndex = $startSourceForIsolation.IndexOf('$process = [Diagnostics.Process]::Start($startInfo)')
    if ($preparedStateIndex -lt 0 -or $handoffLaunchIndex -le $preparedStateIndex -or $startSourceForIsolation.IndexOf('Assert-AgenticPreparedCheckpoint -State $preparedState') -lt $preparedStateIndex) { throw 'Bootstrap fixture L: start does not persist and revalidate the new checkpoint before launching the child.' }
    if ($supervisorSource -notmatch 'Assert-AgenticPreparedCheckpoint -State \$state' -or $supervisorSource -notmatch 'Assert-AgenticJournalMatchesState -State \$state') { throw 'Bootstrap fixture F/K: child does not validate checkpoint identity and journal after authenticated handoff.' }

    $availablePwsh = Get-Command 'pwsh.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $availablePwsh) { $availablePwsh = Get-Command 'pwsh' -CommandType Application -ErrorAction SilentlyContinue }
    if ($null -ne $availablePwsh) {
        $selectedEngine = Resolve-AgenticPowerShellEngine
        if ($selectedEngine.Edition -ne 'Core') { throw 'Lifecycle D: PowerShell 7 está disponível, mas não foi preferido.' }
    }
    $commonSourceForEngine = [IO.File]::ReadAllText((Join-Path $script:AgenticRepoRoot 'scripts/agentic-common.ps1'), [Text.UTF8Encoding]::new($false))
    if ($commonSourceForEngine.IndexOf("Get-Command -Name 'pwsh.exe'") -gt $commonSourceForEngine.IndexOf("Get-Command -Name 'powershell.exe'")) { throw 'Lifecycle E: fallback PowerShell 5.1 é avaliado antes de pwsh.' }
    $hadFixturePlanRoot = $null -ne (Get-Variable -Name AgenticFixturePlanRoot -Scope Script -ErrorAction SilentlyContinue)
    $savedFixturePlanRoot = Get-AgenticOptionalScriptValue -Name 'AgenticFixturePlanRoot'
    Remove-Variable -Name AgenticFixturePlanRoot -Scope Script -ErrorAction SilentlyContinue
    try { if ([string]::IsNullOrWhiteSpace((Get-AgenticPlanPath -GoalId 'strictmode-fixture'))) { throw 'Lifecycle F: optional plan root falhou sob StrictMode.' } }
    finally { if ($hadFixturePlanRoot) { $script:AgenticFixturePlanRoot = $savedFixturePlanRoot } }

    if ((Get-AgenticChangeClassification -Paths @('docs/foo.md')) -ne 'documentation-only') { throw 'Lifecycle G: docs isolado não classificou documentation-only.' }
    $docsPolicy = Get-AgenticGatePolicy -Classification 'documentation-only'
    foreach ($skippedName in @('npm_ci', 'lint', 'typecheck', 'build', 'runtime_tests')) {
        $skipRecord = @($docsPolicy.Skipped | Where-Object { $_.name -ceq $skippedName })
        if ($skipRecord.Count -ne 1 -or $skipRecord[0].status -cne 'NOT_APPLICABLE' -or [string]::IsNullOrWhiteSpace([string]$skipRecord[0].reason)) { throw "Lifecycle G: gate '$skippedName' não tem NOT_APPLICABLE com motivo." }
    }
    if ((Get-AgenticChangeClassification -Paths @('docs/foo.md', 'src/foo.ts')) -ne 'runtime-code') { throw 'Lifecycle H: docs + runtime não reclassificou para runtime-code.' }
    if ((Get-AgenticChangeClassification -Paths @('docs/foo.md', 'package.json')) -ne 'runtime-infra') { throw 'Lifecycle I: package.json não foi classificado como runtime-infra.' }
    if ((Get-AgenticChangeClassification -Paths @('docs/foo.md', '.github/workflows/ci.yml')) -ne 'runtime-infra') { throw 'Lifecycle J: workflow não foi classificado como runtime-infra.' }
    foreach ($configurationPath in @('.codex/agents/security.toml', 'agentic/prompts/front-door.md', 'next.config.mjs', 'tsconfig.typecheck.json', '.env.production')) {
        if ((Get-AgenticChangeClassification -Paths @($configurationPath)) -ne 'runtime-infra') { throw "Lifecycle J: configuração '$configurationPath' não foi classificada como infraestrutura." }
    }
    if (@(Get-AgenticCommitPaths -ChangedPaths @('agentic/plans/local.md', 'agentic/state/loop-state.json')).Count -ne 0) { throw 'Lifecycle K: plano/control artifact entrou nos commit paths.' }
    $runtimePolicy = Get-AgenticGatePolicy -Classification 'runtime-code' -Paths @('src/foo.ts')
    if ($runtimePolicy.Required -notcontains 'lint' -or $runtimePolicy.Required -notcontains 'build' -or $runtimePolicy.Skipped.Count -ne 0) { throw 'Lifecycle L: NOT_APPLICABLE dispensaria gate obrigatório de runtime.' }
    if ((Resolve-AgenticTypecheckCommand).Command -cne 'npx tsc --project tsconfig.typecheck.json --noEmit') { throw 'Lifecycle M: typecheck não usa o comando canônico.' }
    $unstagedSnapshotHash = Get-AgenticStableSnapshotSha256 -Snapshot @([pscustomobject]@{ path = 'docs/a.md'; sha256 = 'same-content'; status = ' M' })
    $stagedSnapshotHash = Get-AgenticStableSnapshotSha256 -Snapshot @([pscustomobject]@{ path = 'docs/a.md'; sha256 = 'same-content'; status = 'M ' })
    if ($unstagedSnapshotHash -cne $stagedSnapshotHash) { throw 'Lifecycle S: snapshot de conteúdo mudou somente por stage.' }

    $structuredState = [pscustomobject]@{ state = 'IMPLEMENTING'; goal_id = 'agentic-fixture'; pending_phase = 'IMPLEMENTING' }
    $executionId = 'execution-fixture'
    $snapshotFixture = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    $validRoleJson = [pscustomobject]@{ schema_version = 1; goal_id = 'agentic-fixture'; role = 'implementer'; invocation_id = $executionId; phase = 'IMPLEMENTING'; snapshot_sha256 = $snapshotFixture; status = 'PASS'; summary = 'fixture'; findings = @(); evidence = @('fixture execution'); failure = $null; files_changed = @('scripts/agentic-common.ps1') } | ConvertTo-Json -Depth 5 -Compress
    if ((ConvertFrom-AgenticRoleResult -Json $validRoleJson -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture).role -cne 'implementer') { throw 'Lifecycle N: resultado estruturado de role válido foi rejeitado.' }
    $wrongRoleRejected = $false
    try { ConvertFrom-AgenticRoleResult -Json $validRoleJson.Replace('implementer','security') -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture | Out-Null } catch { $wrongRoleRejected = $true }
    if (-not $wrongRoleRejected) { throw 'Lifecycle J: resultado de role errada foi aceito.' }
    $staleInvocationRejected = $false
    try { ConvertFrom-AgenticRoleResult -Json $validRoleJson -State $structuredState -ExpectedRole 'implementer' -InvocationId 'stale-invocation' -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture | Out-Null } catch { $staleInvocationRejected = $true }
    if (-not $staleInvocationRejected) { throw 'Lifecycle I: resultado de invocation anterior foi aceito.' }
    $staleSnapshotRejected = $false
    try { ConvertFrom-AgenticRoleResult -Json $validRoleJson.Replace($snapshotFixture, ('b' * 64)) -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture | Out-Null } catch { $staleSnapshotRejected = $true }
    if (-not $staleSnapshotRejected) { throw 'Lifecycle I: resultado de snapshot anterior foi aceito.' }
    $fabricatedRoleRejected = $false
    try { ConvertFrom-AgenticRoleResult -Json ($validRoleJson.TrimEnd('}') + ',"role_results":[{"role":"security","result":"PASS"}]}') -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture | Out-Null } catch { $fabricatedRoleRejected = $true }
    if (-not $fabricatedRoleRejected) { throw 'Lifecycle T: role result aceitou agregação fabricada de outras roles.' }
    $stateBeforeFreeText = [string]$structuredState.state
    $freeTextRejected = $false
    try { ConvertFrom-AgenticRoleResult -Json 'The word FAILED is just prose.' -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture | Out-Null } catch { $freeTextRejected = $true }
    if (-not $freeTextRejected -or [string]$structuredState.state -cne $stateBeforeFreeText) { throw 'Lifecycle O: prosa livre influenciou o state.' }
    $blockedRoleJson = [pscustomobject]@{ schema_version = 1; goal_id = 'agentic-fixture'; role = 'implementer'; invocation_id = $executionId; phase = 'IMPLEMENTING'; snapshot_sha256 = $snapshotFixture; status = 'BLOCKED'; summary = 'blocked'; findings = @(); evidence = @(); failure = [pscustomobject]@{ category = 'input'; message = 'needs human choice'; operation = 'resolve scope'; retryable = $false }; files_changed = @() } | ConvertTo-Json -Depth 5 -Compress
    $blocked = ConvertFrom-AgenticRoleResult -Json $blockedRoleJson -State $structuredState -ExpectedRole 'implementer' -InvocationId $executionId -ExpectedPhase 'IMPLEMENTING' -SnapshotSha256 $snapshotFixture
    if ($blocked.status -cne 'BLOCKED' -or [string]$structuredState.state -cne $stateBeforeFreeText) { throw 'Lifecycle P: blocked não alterou state sem decisão do supervisor.' }

    $diagnostic = New-AgenticFailureDiagnostic -Category 'fixture' -Message 'token=fixture-sensitive-value' -Operation 'fixture operation; password=operation-sensitive-value' -ScriptPath 'scripts/agentic-loop.ps1' -FunctionName 'Invoke fixture' -Line 42 -StateBefore 'TESTING' -Phase 'TESTING'
    if ($diagnostic.message -match 'fixture-sensitive-value' -or $diagnostic.operation -match 'operation-sensitive-value' -or $diagnostic.line -ne 42 -or $diagnostic.state_before -ne 'TESTING') { throw 'Lifecycle Q: diagnóstico não foi sanitizado ou perdeu contexto.' }
    $secretSamples = @(
        @{ name = 'authorization'; text = ('Bearer ' + ('A' * 40)) },
        @{ name = 'cookie header'; text = ('Set-Cookie: session=' + ('A' * 40) + '; HttpOnly') },
        @{ name = 'json access token'; text = ('{"access_token":"' + ('A' * 40) + '"}') },
        @{ name = 'github token'; text = ('ghp_' + ('A' * 32)) },
        @{ name = 'github fine-grained token'; text = ('github_pat_' + ('A' * 32)) },
        @{ name = 'openai project key'; text = ('sk-proj-' + ('A' * 32)) }
    )
    foreach ($sample in $secretSamples) {
        $sanitized = ConvertTo-AgenticSanitizedText -Text ([string]$sample.text)
        if ($sanitized.Contains([string]$sample.text)) { throw ("Lifecycle Q: valor sensível não foi removido pelo sanitizador ({0})." -f $sample.name) }
    }
    if ((Get-AgenticChangeClassification -Paths @('docs/foo.md', 'src/unexpected.ts')) -ne 'runtime-code') { throw 'Lifecycle R: arquivo inesperado não elevou classification.' }
    if ($stagedCheckIndex -le $stageIndex -or $commitIndex -le $stagedCheckIndex) { throw 'Lifecycle S: diff staged não é obrigatório antes do commit.' }
    $withoutReviews = $state | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $withoutReviews.role_invocations = @()
    $reviewEvidenceRejected = $false
    try { Test-AgenticReadiness -State $withoutReviews -Metadata $metadata -CurrentBranch 'feature/agentic-fixture' -ChangedPaths @('scripts/agentic-common.ps1') -JournalText $provenanceJournal | Out-Null } catch { $reviewEvidenceRejected = $true }
    if (-not $reviewEvidenceRejected) { throw 'Lifecycle T: READY_TO_COMMIT aceitou security/reviewer sem evidência.' }
    $terminalResumeMessage = ''
    try { Assert-AgenticResumeCheckpoint -State ([pscustomobject]@{ state = 'FAILED' }) | Out-Null } catch { $terminalResumeMessage = $_.Exception.Message }
    if ($terminalResumeMessage -notmatch "Estado 'FAILED'.*retomada") { throw 'Lifecycle U: resume não identifica estado terminal antes de validar campos do checkpoint.' }
    $incompleteResumeMessage = ''
    try { Assert-AgenticResumeCheckpoint -State ([pscustomobject]@{ state = 'TESTING' }) | Out-Null } catch { $incompleteResumeMessage = $_.Exception.Message }
    if ($incompleteResumeMessage -notmatch "campo obrigatório 'goal_id'") { throw 'Lifecycle U: resume não rejeita checkpoint ativo incompleto.' }
    if ($supervisorSource -notmatch 'Assert-AgenticJournalMatchesState' -or $supervisorSource -notmatch 'pending_phase') { throw 'Lifecycle U: resume não valida identidade nem fase pendente.' }
    if ($supervisorSource -notmatch 'Assert-AgenticPreparedCheckpoint -State \$state' -or $supervisorSource -notmatch 'Assert-AgenticJournalMatchesState -State \$state') { throw 'Lifecycle U: loop não retoma checkpoint autenticado preparado.' }
    if ($supervisorSource -notmatch 'if \(\$state\.state -eq ''READY_TO_COMMIT''\)[\s\S]*?Invoke-AgenticFinalization') { throw 'Lifecycle U: resume de READY_TO_COMMIT não retoma finalização pelo supervisor.' }
    if ($supervisorSource -notmatch 'Working tree diverge do .*staged') { throw 'Lifecycle S: finalização não rejeita divergência entre working tree e stage.' }
    $phasePath = @(@('DISCOVERY', 'PLANNING'), @('PLANNING', 'IMPLEMENTING'), @('IMPLEMENTING', 'TESTING'), @('TESTING', 'SECURITY_REVIEW'), @('SECURITY_REVIEW', 'CODE_REVIEW'), @('CODE_REVIEW', 'READY_TO_COMMIT'))
    foreach ($edge in $phasePath) { if (-not (Test-AgenticTransition -From $edge[0] -To $edge[1])) { throw ("Lifecycle V: transição {0}->{1} ausente." -f $edge[0], $edge[1]) } }
    $revalidationIndex = $supervisorSource.IndexOf('$currentClassification = Get-AgenticChangeClassification')
    $readyCheckIndex = $supervisorSource.IndexOf('Test-AgenticReadiness -State $State')
    if ($revalidationIndex -lt 0 -or $readyCheckIndex -lt $revalidationIndex) { throw 'Lifecycle R: paths/classification não são revalidados antes de readiness.' }
    if ($prompt -match '(?i)git\s+(fetch|add|commit|push|checkout|switch)' -and $supervisorSource -notmatch 'Invoke-AgenticFinalization') { throw 'Lifecycle W: responsabilidade Git do supervisor não foi encontrada.' }
    $invalidPrState = [pscustomobject]@{ number = 1; url = 'https://github.com/example/repo/pull/1'; state = 'CLOSED'; headRefName = 'feature/agentic-fixture'; baseRefName = 'develop' }
    if (Test-AgenticPullRequest -PullRequest $invalidPrState -Branch 'feature/agentic-fixture' -BaseBranch 'develop') { throw 'Lifecycle X: PR fechado permitiu handoff humano.' }

    Invoke-AgenticResumeLifecycleIntegrationFixture
    foreach ($fixtureArtifact in @($script:AgenticFixtureArtifactPaths)) { if (Test-Path -LiteralPath $fixtureArtifact -PathType Leaf) { Remove-Item -LiteralPath $fixtureArtifact -Force } }
    return "PASS: policy, isolated role-result, readiness, bootstrap, classification, resume integration and lifecycle fixtures"
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
    $State.pending_phase = if ($To -in @('RESUMING', 'WAITING_FOR_QUOTA', 'FAILED', 'WAITING_HUMAN_MERGE')) { [string]$State.pending_phase } else { $To }
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
    $unknownProperties = @($result.PSObject.Properties.Name | Where-Object { $_ -cnotin $required })
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
    return $result
}

function Get-AgenticControlPlaneSnapshot {
    $entries = @(Get-AgenticControlPlaneFiles)
    $hashInput = @($entries | ForEach-Object { '{0}:{1}' -f $_.path, $_.sha256 } | Sort-Object) -join "`n"
    return [pscustomobject]@{ entries = @($entries); hash = Get-AgenticTextSha256 -Text $hashInput }
}

function Get-AgenticControlPlaneFiles {
    $roots = @('agentic/state', 'agentic/journal', 'agentic/plans')
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
            [IO.File]::Replace($temporaryPath, $Path, $backupPath)
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

function Get-AgenticGoalMetadata {
    param([string]$Path, [string]$BasePath = $script:AgenticRepoRoot, [AllowEmptyString()][string]$Content)

    if ($PSBoundParameters.ContainsKey('Content')) { $content = $Content }
    else {
        if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Goal path or content is required.' }
        $content = Read-AgenticTextSafely -Path $Path -BasePath $BasePath
    }
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

function Assert-AgenticIntake {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$BasePath = $script:AgenticRepoRoot,
        [AllowEmptyString()][string]$Content
    )
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    if (-not $PSBoundParameters.ContainsKey('Content')) { $Content = Read-AgenticTextSafely -Path $Path -BasePath $BasePath }
    $metadata = Get-AgenticGoalMetadata -Content $Content
    $content = $Content
    if ($metadata["Base branch"] -cnotin @("develop", "main")) { throw "Intake rejeitado: base inválida." }
    if ($metadata["Branch prefix"] -cnotin @("feature", "fix", "hotfix")) { throw "Intake rejeitado: prefixo inválido." }
    if (($metadata["Branch prefix"] -ceq "hotfix") -ne ($metadata["Base branch"] -ceq "main")) { throw "Intake rejeitado: combinação base/prefixo inválida." }
    if ($metadata["ID"] -notmatch '^[a-z][a-z0-9-]{2,63}$' -or $metadata["ID"] -match '--|-$') { throw "Intake rejeitado: ID inválido." }
    if ($metadata["Title"].Length -gt 120 -or [string]::IsNullOrWhiteSpace($metadata["Title"])) { throw "Intake rejeitado: título inválido." }
    if (-not $metadata.ContainsKey("Allowed files") -or [string]::IsNullOrWhiteSpace($metadata["Allowed files"])) { throw "Intake rejeitado: Allowed files obrigatório." }
    $sensitivePatterns = @(
        '(?i)(password|passwd|secret|token|jwt|private[_ -]?key|connection[_ -]?string|api[_ -]?key|access[_ -]?key|client[_ -]?secret)\s*[:=]',
        '(?i)\bauthorization\s*:\s*(?:bearer|basic)\s+\S+',
        '(?i)\b(?:set-cookie|cookie)\s*:\s*[^\r\n]+',
        '(?i)\bbearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}',
        '(?i)\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
        '(?i)-----BEGIN\s+(?:[A-Z0-9 ]+\s+)?(?:PRIVATE KEY|CERTIFICATE)-----',
        '(?i)\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^@\s/]+@'
    )
    foreach ($pattern in $sensitivePatterns) {
        if ($content -match $pattern) { throw "Intake rejeitado: conteúdo sensível detectado; valor omitido." }
    }
    $allowed = @(Get-AgenticAllowedGoalFiles -Metadata $metadata)
    if ($allowed.Count -eq 0) { throw "Intake rejeitado: allowlist concreta obrigatória." }
    foreach ($entry in $allowed) {
        if ($entry -match '[*?\[\]]|(^|/)\.\.?(/|$)|^/|^[a-zA-Z]:|\\\\|(^|/)\.git(/|$)' -or $entry -in @(".", "**")) { throw "Intake rejeitado: caminho permitido inválido." }
        if ($entry -notmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$') { throw "Intake rejeitado: caminho permitido inválido." }
    }
    foreach ($required in @("Objective", "Discovery requirements", "Acceptance criteria", "Validation requirements", "Security/production restrictions")) {
        if ($content -notmatch ("(?im)^##?\s*" + [regex]::Escape($required) + "\s*$")) { throw "Intake rejeitado: seção obrigatória ausente." }
    }
    return $metadata
}

function Start-GoalBranch {
    param([Parameter(Mandatory = $true)][hashtable]$Metadata)
    $base = $Metadata["Base branch"]; $prefix = $Metadata["Branch prefix"]
    if ($base -cnotin @("develop", "main") -or $prefix -cnotin @("feature", "fix", "hotfix") -or (($prefix -ceq "hotfix") -ne ($base -ceq "main"))) { throw "Base/prefix de branch não permitidos." }
    $current = [string](@(Invoke-AgenticGit -GitArguments @("branch", "--show-current"))[0]).Trim()
    if ($current -cne $base) { throw "Goal novo requer checkout limpo da base '$base'." }
    $checkpoint = Get-AgenticState
    if ($checkpoint.state -notin @('IDLE', 'FAILED', 'WAITING_HUMAN_MERGE')) { throw 'Um goal ainda está ativo; não será criada outra branch.' }
    $status = @(Invoke-AgenticGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all'))
    $unexpected = @($status | Where-Object {
        $line = [string]$_
        if ($line.Length -lt 4) { return $true }
        $path = $line.Substring(3).Replace('\', '/')
        if ($path -eq 'agentic/state/loop-state.json' -or $path -eq 'agentic/journal/current.md' -or $path -match '^agentic/(state/history|journal/history|plans)/') {
            return ($line.Substring(0, 2) -notin @(' M', ' A', ' D', '??'))
        }
        if (Test-AgenticLocalResultArtifactPath -Path $path) { return ($line.Substring(0, 2) -ne '??') }
        return $true
    })
    if ($unexpected.Count -gt 0) { throw "Working tree contém alterações fora dos control artifacts permitidos; nada será descartado." }
    Invoke-AgenticGit -GitArguments @("fetch", "origin") | Out-Null
    $slug = ([string]$Metadata["ID"]).ToLowerInvariant() -replace "[^a-z0-9-]+", "-"
    $slug = $slug.Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) { throw "ID do goal não pode gerar slug de branch." }
    $branch = "$prefix/$slug"
    if (@(Invoke-AgenticGit -GitArguments @("branch", "--list", $branch)).Count -gt 0 -or @(Invoke-AgenticGit -GitArguments @("branch", "--remotes", "--list", "origin/$branch")).Count -gt 0) { throw "Branch já existe; não será sobrescrita." }
    Invoke-AgenticGit -GitArguments @("switch", "--create", $branch, "origin/$base") | Out-Null
    return $branch
}

function Assert-AgenticPreparedHandoff {
    param(
        [Parameter(Mandatory = $true)][string]$GoalPath,
        [Parameter(Mandatory = $true)][hashtable]$Metadata
    )
    $expectedGoal = [IO.Path]::GetFullPath((Join-Path $script:AgenticRepoRoot ("agentic/goals/{0}.md" -f $Metadata["ID"])))
    $actualGoal = [IO.Path]::GetFullPath($GoalPath)
    $comparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not [string]::Equals($actualGoal, $expectedGoal, $comparison)) { throw "Handoff preparado bloqueado: caminho canônico do goal inválido." }
    $pipeName = [string]$env:GERIT_AGENTIC_HANDOFF_PIPE
    if ($pipeName -notmatch '^gerit-agentic-[0-9a-fA-F]{32}$') { throw "Handoff preparado bloqueado: origem do supervisor não comprovada." }
    $client = $null
    try {
        $client = [IO.Pipes.NamedPipeClientStream]::new('.', $pipeName, [IO.Pipes.PipeDirection]::In, [IO.Pipes.PipeOptions]::None)
        $client.Connect(5000)
        $reader = [IO.StreamReader]::new($client, [Text.Encoding]::UTF8, $false, 1024, $true)
        $token = [string]$env:GERIT_AGENTIC_HANDOFF_TOKEN
        if ($token -notmatch '^[0-9a-f]{64}$') { throw "Handoff preparado bloqueado: token temporário inválido." }
        $received = $reader.ReadLine()
        $reader.Dispose()
        $parts = @(([string]$received) -split '\|', 6)
        if ($parts.Count -ne 6 -or $parts[0] -cne 'prepared' -or $parts[1] -cne [string]$Metadata['ID'] -or $parts[2] -cne ("{0}/{1}" -f $Metadata['Branch prefix'], $Metadata['ID']) -or $parts[3] -cne ("agentic/goals/{0}.md" -f $Metadata['ID']) -or $parts[4] -notmatch '^[0-9a-f]{64}$' -or $parts[5] -cne $token) { throw "Handoff preparado bloqueado: autorização do supervisor inválida." }
        Assert-AgenticNoReparsePoints -Path $expectedGoal -BasePath $script:AgenticRepoRoot -RequireLeaf | Out-Null
        if ((Get-AgenticFileSha256 -Path $expectedGoal) -cne $parts[4]) { throw "Handoff preparado bloqueado: SHA-256 do goal difere do conteúdo materializado." }
        Remove-Item Env:GERIT_AGENTIC_HANDOFF_PIPE -ErrorAction SilentlyContinue
        Remove-Item Env:GERIT_AGENTIC_HANDOFF_TOKEN -ErrorAction SilentlyContinue
        return [pscustomobject]@{ GoalPath = "agentic/goals/{0}.md" -f $Metadata['ID']; Sha256 = $parts[4] }
    }
    catch { throw "Handoff preparado bloqueado: conexão temporária do supervisor indisponível." }
    finally { if ($null -ne $client) { $client.Dispose() } }
}

function Assert-AgenticBootstrapStatus {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$StatusLines, [switch]$AllowMissingIntake)
    $foundIntake = $false
    foreach ($line in $StatusLines) {
        if ([string]$line -notmatch '^..\s+(.+)$') { throw "Bootstrap bloqueado: formato de status não reconhecido." }
        $path = $Matches[1].Replace('\', '/')
        $status = ([string]$line).Substring(0, 2)
        if ($path -eq 'agentic/state/intake.md' -and $status -eq '??') { $foundIntake = $true; continue }
        $isLocalControl = ($path -eq 'agentic/state/loop-state.json' -or $path -eq 'agentic/journal/current.md' -or $path -match '^agentic/(state/history|journal/history|plans)/')
        if ($isLocalControl -and $status -in @(' M', ' A', ' D', '??')) { continue }
        if ((Test-AgenticLocalResultArtifactPath -Path $path) -and $status -eq '??') { continue }
        throw "Bootstrap bloqueado: a árvore contém path funcional ou control path staged inesperado."
    }
    if (-not $foundIntake -and -not $AllowMissingIntake) { throw "Bootstrap bloqueado: intake novo não aparece como arquivo não rastreado." }
    return $true
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

function Write-AgenticPreparedGoal {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$CurrentBranch,
        [string]$BasePath = $script:AgenticRepoRoot
    )
    $goalId = [string]$Metadata['ID']
    if ($goalId -notmatch '^[a-z][a-z0-9-]{2,63}$' -or $goalId -match '--|-$') { throw "Goal não pode ser materializado: ID não é canônico." }
    $expectedBranch = "$($Metadata['Branch prefix'])/$goalId"
    if ($CurrentBranch -cne $expectedBranch -or $CurrentBranch -in @("develop", "main")) { throw "Goal não pode ser materializado fora da branch de trabalho validada." }
    $expectedPath = [IO.Path]::GetFullPath((Join-Path $BasePath ("agentic/goals/{0}.md" -f $goalId)))
    $actualPath = Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath
    $comparison = if ([IO.Path]::DirectorySeparatorChar -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not [string]::Equals($actualPath, $expectedPath, $comparison)) { throw "Goal não pode ser materializado fora do caminho canônico." }
    if (Test-Path -LiteralPath $actualPath) { throw "Goal de destino já existe; não será sobrescrito." }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $actualPath)) | Out-Null
    Assert-AgenticNoReparsePoints -Path $actualPath -BasePath $BasePath | Out-Null
    $stream = [IO.File]::Open($actualPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $revalidatedPath = Assert-AgenticNoReparsePoints -Path $actualPath -BasePath $BasePath
        if (-not [string]::Equals($revalidatedPath, $expectedPath, $comparison)) { throw "Goal não pode ser materializado fora do caminho canônico." }
        Assert-AgenticOpenedPathWithinRoot -Stream $stream -Path $actualPath -BasePath $BasePath | Out-Null
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
        $stream.Write($bytes, 0, $bytes.Length)
    }
    finally { $stream.Dispose() }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try { $digest = ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha256.Dispose() }
    return [pscustomobject]@{ Path = $actualPath; Sha256 = $digest }
}
