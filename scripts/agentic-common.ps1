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

function Test-AgenticSupervisorPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = $Path.Replace('\', '/')
    return ($normalized -match '^agentic/(state|journal)(/|$)')
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
            if ($event.goal -cne $GoalId -or $event.state -ne 'IMPLEMENTING' -or $event.controller -ne 'orchestrator' -or $event.actor -ne 'implementer' -or [string]::IsNullOrWhiteSpace([string]$event.action) -or $event.result -cne 'PASS' -or $eventPaths -notcontains $normalized) { continue }
            for ($priorIndex = 0; $priorIndex -lt $eventIndex; $priorIndex++) {
                $prior = $events[$priorIndex]
                if ($prior.goal -ceq $GoalId -and $prior.goal -ceq $event.goal -and $prior.controller -eq 'orchestrator' -and $prior.actor -eq 'orchestrator' -and $prior.delegated_agent -eq 'implementer' -and -not [string]::IsNullOrWhiteSpace([string]$prior.action)) {
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
        $content = [System.IO.File]::ReadAllText($fullPath, [System.Text.UTF8Encoding]::new($false))
        Assert-AgenticFileWhitespaceClean -Path $path -Text $content | Out-Null
    }
    return $true
}

function Test-AgenticReadiness {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $true)][string]$CurrentBranch,
        [Parameter(Mandatory = $true)][string[]]$ChangedPaths,
        [string]$JournalText
    )

    if ([string]$State.state -ne "READY_TO_COMMIT") { throw "Codex precisa entregar state READY_TO_COMMIT." }
    $goalId = [string]$Metadata["ID"]
    if ([string]::IsNullOrWhiteSpace($goalId)) { throw "Goal precisa declarar ID antes do commit." }
    $stateGoalIdProperty = $State.PSObject.Properties["goal_id"]
    if ($null -eq $stateGoalIdProperty) { throw "State precisa declarar goal_id antes do commit." }
    $stateGoalId = [string]$stateGoalIdProperty.Value
    if ([string]::IsNullOrWhiteSpace($stateGoalId)) { throw "State.goal_id nao pode estar vazio antes do commit." }
    if ($stateGoalId -cne $goalId) { throw "ID do goal no state nao corresponde exatamente ao goal ativo." }
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
        if (Test-AgenticSupervisorPath -Path $normalized) { continue }
        if (-not $allowedSet.ContainsKey($normalized.ToLowerInvariant())) { throw "Working tree contem arquivo fora do escopo permitido pelo goal." }
    }
    $functionalPaths = @($ChangedPaths | ForEach-Object { ([string]$_).Replace('\', '/') } | Where-Object { $_ -and -not (Test-AgenticSupervisorPath -Path $_) })
    Assert-AgenticFunctionalDiffCheck -Paths $functionalPaths | Out-Null
    if ($functionalPaths.Count -gt 0) {
        if ([string]::IsNullOrWhiteSpace($JournalText)) { $JournalText = [System.IO.File]::ReadAllText($script:AgenticJournalPath, [System.Text.UTF8Encoding]::new($false)) }
        Test-AgenticImplementerProvenance -GoalId $goalId -FunctionalPaths $functionalPaths -JournalText $JournalText | Out-Null
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
    $supervisorPath = Join-Path $script:AgenticRepoRoot "scripts/agentic-loop.ps1"
    $supervisorSource = [System.IO.File]::ReadAllText($supervisorPath, [System.Text.UTF8Encoding]::new($false))
    $commonSource = [System.IO.File]::ReadAllText((Join-Path $script:AgenticRepoRoot "scripts/agentic-common.ps1"), [System.Text.UTF8Encoding]::new($false))
    $startPath = Join-Path $script:AgenticRepoRoot "scripts/agentic-start.ps1"
    $startSource = [System.IO.File]::ReadAllText($startPath, [System.Text.UTF8Encoding]::new($false))
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
    if ($startSource -notmatch 'agentic/state/intake\.md' -or $startSource -notmatch 'Bootstrap bloqueado') { throw "Fixture G-H: bootstrap não restringe alterações locais ao intake controlado." }
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
    if ($prompt -notmatch "FINAL_STATE: READY_TO_COMMIT") { throw "Prompt nao define READY_TO_COMMIT como handoff do Codex." }
    $codexState = [pscustomobject]@{ state = "READY_TO_COMMIT" }
    if ($codexState.state -ne "READY_TO_COMMIT") { throw "Fixture A: Codex nao pode concluir em READY_TO_COMMIT." }
    $readOnlyCommands = @("git status", "git diff", "git diff --check", "git branch --show-current", "git log")
    if (@($readOnlyCommands | Where-Object { $_ -match 'git (fetch|add|commit|push|checkout|switch)|gh pr create' }).Count -gt 0) { throw "Fixture A: lista de comandos read-only contem Git mutavel." }

    # Fixtures A-C: empty optional journal values are normalized without trailing whitespace.
    $originalJournalPath = $script:AgenticJournalPath
    $fixtureJournalPath = Join-Path ([IO.Path]::GetTempPath()) ("agentic-journal-whitespace-{0}.md" -f [guid]::NewGuid().ToString("N"))
    try {
        $script:AgenticJournalPath = $fixtureJournalPath
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($fixtureJournalPath, "", $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty quota fixture" -Result "PASS" -Quota ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains "- quota: n/a" -or @(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture A: quota vazia gerou whitespace inválido." }

        [System.IO.File]::WriteAllText($fixtureJournalPath, "", $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty memory fixture" -Result "PASS" -Memory ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains "- memory: n/a" -or @(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture B: memory vazia gerou whitespace inválido." }

        [System.IO.File]::WriteAllText($fixtureJournalPath, "", $utf8NoBom)
        Add-AgenticJournalEvent -Goal "journal-fixture" -State "TESTING" -Agent "tester" -Action "empty failure/retry fixture" -Result "PASS" -Failure "" -Retry "" -Gate "" -Quota "" -Memory "" -DelegatedAgent ""
        $journalFixture = [System.IO.File]::ReadAllText($fixtureJournalPath, $utf8NoBom)
        foreach ($field in @("failure", "retry", "gate", "quota", "memory", "delegated_agent")) {
            if (@([regex]::Split($journalFixture, "\r\n|\n|\r")) -notcontains ("- {0}: n/a" -f $field)) { throw "Fixture C: campo '$field' vazio não virou n/a." }
        }
        if (@(Get-AgenticTextWhitespaceErrors -Text $journalFixture).Count -gt 0) { throw "Fixture C: campos opcionais vazios geraram trailing whitespace." }
    }
    finally {
        $script:AgenticJournalPath = $originalJournalPath
        Remove-Item -LiteralPath $fixtureJournalPath -Force -ErrorAction SilentlyContinue
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
- controller: orchestrator
- actor: orchestrator
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
- controller: orchestrator
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
        $accepted = $false
        try {
            Test-AgenticReadiness -State $goalIdState -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null
            $accepted = $true
        }
        catch { $accepted = $false }
        if ($accepted -ne $goalIdCase.ExpectedPass) { throw "Fixture goal_id '$($goalIdCase.Name)' retornou resultado incorreto." }
    }

    # Fixture A: alteracoes somente de coordenacao nao exigem provenance funcional.
    $coordinationJournal = "## coordination`n- actor: orchestrator`n- action: checkpoint`n- files_changed: agentic/state/loop-state.json, agentic/journal/current.md`n- result: PASS"
    if (-not (Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("agentic/state/loop-state.json", "agentic/journal/current.md") -JournalText $coordinationJournal)) { throw "Fixture A: readiness de alteracoes somente de coordenacao foi rejeitada." }

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
    $rejected = $false
    try { Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal | Out-Null }
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

    # Fixture A: orchestrator pode alterar somente state/journal de coordenacao.
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
    if ($prompt -notmatch "exclusivamente ao supervisor PowerShell") { throw "Fixture I: Git mutavel nao esta reservado ao supervisor." }

    # Fixture J: state valido continua elegivel a READY_TO_COMMIT.
    $state.state = "READY_TO_COMMIT"
    $state.pr_number = $null
    $state.pr_url = $null
    if (-not (Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch "feature/agentic-fixture" -ChangedPaths @("scripts/agentic-common.ps1") -JournalText $provenanceJournal)) { throw "Fixture fluxo valido: READY_TO_COMMIT foi bloqueado." }

    return "PASS: fixtures A-J + whitespace A-H + goal_id"
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
        [string]$Memory = "n/a"
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
    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $iteration = (Get-AgenticState).iteration
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

function Assert-AgenticIntake {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$BasePath = $script:AgenticRepoRoot
    )
    Assert-AgenticNoReparsePoints -Path $Path -BasePath $BasePath -RequireLeaf | Out-Null
    $metadata = Get-AgenticGoalMetadata -Path $Path
    $content = [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
    if ($metadata["Base branch"] -notin @("develop", "main")) { throw "Intake rejeitado: base inválida." }
    if ($metadata["Branch prefix"] -notin @("feature", "fix", "hotfix")) { throw "Intake rejeitado: prefixo inválido." }
    if (($metadata["Branch prefix"] -eq "hotfix") -ne ($metadata["Base branch"] -eq "main")) { throw "Intake rejeitado: combinação base/prefixo inválida." }
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
    if ($base -notin @("develop", "main") -or $prefix -notin @("feature", "fix", "hotfix") -or (($prefix -eq "hotfix") -ne ($base -eq "main"))) { throw "Base/prefix de branch não permitidos." }
    $current = [string](@(Invoke-AgenticGit -GitArguments @("branch", "--show-current"))[0]).Trim()
    if ($current -ne $base) { throw "Goal novo requer checkout limpo da base '$base'." }
    if (-not [string]::IsNullOrWhiteSpace((@(Invoke-AgenticGit -GitArguments @("status", "--porcelain")) -join ""))) { throw "Working tree não está limpa; nenhuma alteração foi descartada." }
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
        $expectedMessage = "prepared|$($Metadata['ID'])|$($Metadata['Branch prefix'])/$($Metadata['ID'])|agentic/goals/$($Metadata['ID']).md|$token"
        $received = $reader.ReadLine()
        $reader.Dispose()
        if ($received -cne $expectedMessage) { throw "Handoff preparado bloqueado: autorização do supervisor inválida." }
        Remove-Item Env:GERIT_AGENTIC_HANDOFF_PIPE -ErrorAction SilentlyContinue
        Remove-Item Env:GERIT_AGENTIC_HANDOFF_TOKEN -ErrorAction SilentlyContinue
        return $true
    }
    catch { throw "Handoff preparado bloqueado: conexão temporária do supervisor indisponível." }
    finally { if ($null -ne $client) { $client.Dispose() } }
}

function Assert-AgenticBootstrapStatus {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$StatusLines)
    $foundIntake = $false
    foreach ($line in $StatusLines) {
        if ([string]$line -notmatch '^..\s+(.+)$') { throw "Bootstrap bloqueado: formato de status não reconhecido." }
        $path = $Matches[1].Replace('\', '/')
        if ($path -ne "agentic/state/intake.md" -or -not ([string]$line).StartsWith("??")) { throw "Bootstrap bloqueado: a árvore deve estar limpa exceto pelo intake novo." }
        $foundIntake = $true
    }
    if (-not $foundIntake) { throw "Bootstrap bloqueado: intake novo não aparece como arquivo não rastreado." }
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
    $expectedBranch = "$($Metadata['Branch prefix'])/$($Metadata['ID'])"
    if ($CurrentBranch -cne $expectedBranch -or $CurrentBranch -in @("develop", "main")) { throw "Goal não pode ser materializado fora da branch de trabalho validada." }
    $expectedPath = [IO.Path]::GetFullPath((Join-Path $BasePath ("agentic/goals/{0}.md" -f $Metadata["ID"])))
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
    return $actualPath
}
