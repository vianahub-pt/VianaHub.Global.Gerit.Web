function Invoke-AgenticWorkflowDecision {
    param($State,[hashtable]$Metadata,[string]$Phase,[string]$Context)
    if([int]$State.agent_calls -ge [int]$State.max_agent_calls){
        $State.failure_diagnostic=[pscustomobject]@{category='INVOCATION_LIMIT';message='Agent invocation hard limit reached before Orchestrator decision.';operation='workflow-decision';retryable=$false;evidence=@($Phase)}
        if(Test-AgenticTransition -From ([string]$State.state) -To 'FAILED'){Set-AgenticSupervisorTransition -State $State -To 'FAILED' -PendingAction 'Agent invocation hard limit reached'|Out-Null;Write-AgenticState $State}
        throw 'Agent invocation hard limit reached; execution terminated FAILED.'
    }
    $State.active_agent='orchestrator';$State.execution_id=[guid]::NewGuid().ToString('N');$State.agent_calls++
    Write-AgenticState $State
    $decisionContext = @"
Canonical decision input (Supervisor does not prescribe an outcome):
current_state=$($State.state)
phase=$Phase
validated_context=$Context
Select next_state, next_roles, correction_routing, terminal_outcome, rationale and evidence from this evidence. The Supervisor will reject illegal transitions and unauthorized role assignments.
"@
    $call=Invoke-CodexAgentRole -State $State -GoalPath (Join-Path $script:AgenticRepoRoot ([string]$State.request_envelope_path)) -Role 'orchestrator' -Phase $Phase -InvocationId $State.execution_id -Mode 'workflow-decision' -ExecutionRoot $script:AgenticRepoRoot -AdditionalContext $decisionContext
    Add-AgenticRoleInvocationEvidence -State $State -Invocation $call -Metadata $Metadata
    if($call.ExitCode -ne 0 -or $null -eq $call.Result -or $call.Result.status -ne 'PASS'){throw ('Orchestrator returned no valid workflow decision. '+(ConvertTo-AgenticSanitizedText -Text ([string]$call.Output) -MaximumLength 500))}
    $next=[string]$call.Result.decision.next_state
    Assert-AgenticOrchestratorDecision -Decision $call.Result.decision -CurrentState ([string]$State.state) | Out-Null
    if(-not (Test-AgenticTransition -From ([string]$State.state) -To $next)){throw "Orchestrator proposed an illegal transition for $Phase."}
    return $call.Result.decision
}

function Reset-AgenticDownstreamApprovals {
    param($State)
    foreach($field in @('observability_verification_path','requirement_verification_path','scope_verification_path')){if($null -eq $State.PSObject.Properties[$field]){$State|Add-Member -NotePropertyName $field -NotePropertyValue $null}}
    $State.tester_status='PENDING';$State.tester_invocation_id=$null
    $State.code_review_status='PENDING';$State.reviewer_invocation_id=$null
    $State.security_review_status='PENDING';$State.security_invocation_id=$null
    $State.observability_status='PENDING';$State.requirement_status='PENDING';$State.scope_status='PENDING'
    $State.observability_verification_path=$null;$State.requirement_verification_path=$null;$State.scope_verification_path=$null
    $State.approved_snapshot_sha256=$null;$State.gate_results=@();$State.quality_gate_snapshot=@();$State.brokered_test_results=@()
    return $State
}

function Invoke-AgenticVNextFinalization {
    param($State,[hashtable]$Metadata)
    if([string]$State.state -cne 'READY_TO_COMMIT'){throw 'Finalization requires READY_TO_COMMIT.'}
    $branchLines=@(Invoke-AgenticGit -GitArguments @('branch','--show-current'));$branch=([string]$branchLines[0]).Trim()
    if($branch -cne [string]$State.branch -or -not(Test-AgenticPushTarget -Branch $branch)){throw 'Protected or unexpected branch cannot be finalized.'}
    $allPaths=@(Get-AgenticWorkingTreePaths)
    $functional=@(Get-AgenticCommitPaths -ChangedPaths $allPaths)
    $allowed=@(Get-AgenticAllowedGoalFiles -Metadata $Metadata)
    if($functional.Count -eq 0 -or @($functional|Where-Object{$_ -notin $allowed}).Count -gt 0){throw 'Final stage contains no approved functional changes or contains out-of-scope paths.'}
    $preStage=@(Get-AgenticCommitSnapshot -Paths $functional)
    if((Get-AgenticStableSnapshotSha256 -Snapshot $preStage) -cne [string]$State.approved_snapshot_sha256){throw 'Pre-stage snapshot differs from the fully approved snapshot.'}
    Invoke-AgenticGit -GitArguments (@('add','--')+$functional)|Out-Null
    $staged=@(Invoke-AgenticGit -GitArguments @('diff','--cached','--name-only')|ForEach-Object{([string]$_).Replace('\','/')})
    if($staged.Count -ne $functional.Count -or @($staged|Where-Object{$_ -notin $functional}).Count -gt 0){throw 'Staged paths do not exactly match the approved functional change set.'}
    $unstaged=Invoke-AgenticNativeProcess -FilePath 'git' -Arguments (@('-C',$script:AgenticRepoRoot,'diff','--quiet','--')+@($staged|ForEach-Object{":(literal)$_"}))
    if([int]$unstaged.ExitCode -ne 0){throw 'Unstaged content differs from the staged snapshot.'}
    $cached=Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'diff','--cached','--check')
    Assert-AgenticNativeProcessSucceeded -Result $cached -CommandName 'git diff --cached --check'
    Test-AgenticReadiness -State $State -Metadata $Metadata -CurrentBranch $branch -ChangedPaths $staged|Out-Null
    $base=[string]$State.base_branch
    if($base -cnotin @('develop','main')){throw 'Pull request base is not permitted.'}
    $remote=@(Invoke-AgenticGit -GitArguments @('remote','get-url','origin'))
    $repoMatch=[regex]::Match(([string]$remote[0]).Trim(),'(?:github\.com[:/])(?<repo>[^/]+/[^/]+?)(?:\.git)?$')
    if(-not$repoMatch.Success){throw 'Origin does not identify a verifiable GitHub repository.'}
    $commit=Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'commit','-m',[string]$Metadata.Title) -CaptureStandardError
    Assert-AgenticNativeProcessSucceeded -Result $commit -CommandName 'git commit'
    $shaLines=@(Invoke-AgenticGit -GitArguments @('rev-parse','HEAD'));$sha=([string]$shaLines[0]).Trim()
    if($sha -cnotmatch '^[0-9a-f]{40,64}$'){throw 'Commit SHA is unavailable after commit.'}
    $State.commit_sha=$sha;Write-AgenticState $State
    $push=Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'push','--set-upstream','origin',$branch) -CaptureStandardError
    Assert-AgenticNativeProcessSucceeded -Result $push -CommandName 'git push work branch'
    $toPr=Invoke-AgenticWorkflowDecision -State $State -Metadata $Metadata -Phase 'READY_TO_COMMIT' -Context "Validated commit $sha was pushed to the exact work branch $branch; create and verify a PR to $base."
    Set-AgenticSupervisorTransition -State $State -To ([string]$toPr.next_state) -PendingAction 'Create and verify pull request for declared base'|Out-Null
    Write-AgenticState $State
    $bodyPath=Join-Path ([IO.Path]::GetTempPath()) ('agentic-pr-'+[guid]::NewGuid().ToString('N')+'.md')
    try {
        [IO.File]::WriteAllText($bodyPath,"Request: $($State.request_id)`n`nAgentic vNext requirements, QA, independent reviews, gates and final verification passed before commit. No automatic merge or deploy.",[Text.UTF8Encoding]::new($false))
        $created=Invoke-AgenticNativeProcess -FilePath 'gh' -Arguments @('pr','create','--repo',$repoMatch.Groups['repo'].Value,'--base',$base,'--head',$branch,'--title',[string]$Metadata.Title,'--body-file',$bodyPath) -CaptureStandardError
    } finally {Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue}
    Assert-AgenticNativeProcessSucceeded -Result $created -CommandName 'gh pr create'
    $url=@($created.Output|ForEach-Object{[regex]::Match([string]$_,'https://github\.com/[^/]+/[^/]+/pull/[0-9]+').Value}|Where-Object{$_}|Select-Object -First 1)
    if($url.Count -eq 0){throw 'PR creation returned no verifiable URL.'}
    $view=Invoke-AgenticNativeProcess -FilePath 'gh' -Arguments @('pr','view',$url[0],'--repo',$repoMatch.Groups['repo'].Value,'--json','number,url,state,headRefName,baseRefName') -CaptureStandardError
    Assert-AgenticNativeProcessSucceeded -Result $view -CommandName 'gh pr view'
    $pr=(@($view.Output|ForEach-Object{[string]$_}) -join [Environment]::NewLine)|ConvertFrom-Json
    if(-not(Test-AgenticPullRequest -PullRequest $pr -Branch $branch -BaseBranch $base)){throw 'Created PR does not match expected branch, base, or open state.'}
    $wait=Invoke-AgenticWorkflowDecision -State $State -Metadata $Metadata -Phase 'READY_TO_PR' -Context "Verified open PR number $($pr.number), head $branch and base $base. Human review and merge are pending."
    Set-AgenticSupervisorTransition -State $State -To ([string]$wait.next_state) -PendingAction $null|Out-Null
    Set-AgenticVerifiedPullRequestState -State $State -PullRequest $pr -Branch $branch -BaseBranch $base|Out-Null
    $State.pending_phase=$null;$State.active_agent=$null;$State.last_successful_step='Verified pull request is waiting for human merge'
    Write-AgenticState $State
    Add-AgenticJournalEvent -Goal $State.goal_id -State 'WAITING_HUMAN_MERGE' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Persist verified PR and hand off for human review' -Gate ([string]$State.pr_url) -Result 'PASS'
    Save-AgenticTerminalJournal -State $State|Out-Null
    return $State
}

function Assert-AgenticBrokerAction {
    param($Action)
    if($null -eq $Action -or $Action -is [string] -or @($Action.PSObject.Properties.Name|Where-Object{$_ -notin @('action_id','type','approved_identifier','purpose','expected_evidence')}).Count -gt 0){throw 'Broker action schema contains invalid or extra fields.'}
    foreach($required in @('action_id','type','approved_identifier','purpose','expected_evidence')){if($null -eq $Action.PSObject.Properties[$required] -or [string]::IsNullOrWhiteSpace([string]$Action.$required)){throw "Tester broker action missing '$required'."}}
    if([string]$Action.action_id -notmatch '^[a-z][a-z0-9-]{2,63}$' -or ([string]$Action.purpose).Length -gt 500 -or ([string]$Action.expected_evidence).Length -gt 500){throw 'Invalid or oversized broker action fields.'}
    $approved = switch([string]$Action.type) {
        'RUN_PACKAGE_SCRIPT' { @('lint','build','test') }
        'RUN_TYPECHECK' { @('typecheck') }
        'RUN_BUILD' { @('build') }
        'RUN_TEST_COMMAND' { @('npm-test') }
        default { throw 'Unsupported broker action type; arbitrary host execution is prohibited.' }
    }
    if([string]$Action.approved_identifier -cnotin $approved){throw 'Broker action identifier is not on the allowlist.'}
    return $true
}

function Invoke-AgenticBrokerAction {
    param($Action,$State)
    Assert-AgenticBrokerAction -Action $Action | Out-Null
    $file='';$arguments=@();$command='';$cwd=$script:AgenticRepoRoot
    switch([string]$Action.type){
      'RUN_PACKAGE_SCRIPT' {
        $scriptName=[string]$Action.approved_identifier
        if($scriptName -notin @('lint','build','test')){throw 'Package script is not on the broker allowlist.'}
        $package=Get-Content (Join-Path $script:AgenticRepoRoot 'package.json') -Raw|ConvertFrom-Json
        if($null -eq $package.scripts.PSObject.Properties[$scriptName]){return [pscustomobject]@{action_id=$Action.action_id;status='BLOCKED';exit_code=$null;reason='Required package script is unavailable.';snapshot_sha256=$State.approved_snapshot_sha256}}
        $file='npm';$arguments=@('run',$scriptName);$command="npm run $scriptName"
      }
      'RUN_TYPECHECK' {
        if([string]$Action.approved_identifier -cne 'typecheck'){throw 'Typecheck identifier is not allowlisted.'}
        $file='npx';$arguments=@('tsc','--project','tsconfig.typecheck.json','--noEmit');$command='npx tsc --project tsconfig.typecheck.json --noEmit'
      }
      'RUN_BUILD' {
        if([string]$Action.approved_identifier -cne 'build'){throw 'Build identifier is not allowlisted.'}
        $file='npm';$arguments=@('run','build');$command='npm run build'
      }
      'RUN_TEST_COMMAND' {
        if([string]$Action.approved_identifier -cne 'npm-test'){throw 'Test command identifier is not allowlisted.'}
        $package=Get-Content (Join-Path $script:AgenticRepoRoot 'package.json') -Raw|ConvertFrom-Json
        if($null -eq $package.scripts.PSObject.Properties['test']){return [pscustomobject]@{action_id=$Action.action_id;status='BLOCKED';exit_code=$null;reason='No repository test script is configured.';snapshot_sha256=$State.approved_snapshot_sha256}}
        $file='npm';$arguments=@('test');$command='npm test'
      }
      default { throw 'Unsupported broker action type; arbitrary host execution is prohibited.' }
    }
    $start=[DateTimeOffset]::UtcNow;$watch=[Diagnostics.Stopwatch]::StartNew();Push-Location $cwd
    try{$execution=Invoke-AgenticNativeProcess -FilePath $file -Arguments $arguments -CaptureStandardError;$exit=[int]$execution.ExitCode;$status=if($exit -eq 0){'PASS'}else{'FAIL'};$safeOutput=ConvertTo-AgenticSanitizedText -Text (@($execution.Output|ForEach-Object{[string]$_}) -join "`n") -MaximumLength 1000}
    finally{Pop-Location;$watch.Stop()}
    $result=[pscustomobject]@{schema_version=1;action_id=[string]$Action.action_id;type=[string]$Action.type;approved_identifier=[string]$Action.approved_identifier;command=$command;exit_code=$exit;status=$status;started_at=$start.ToString('o');duration_ms=[Math]::Round($watch.Elapsed.TotalMilliseconds,0);sanitized_evidence=$safeOutput;snapshot_sha256=[string]$State.approved_snapshot_sha256}
    $rel="agentic/state/brokered-tests/$($State.request_id)/$($State.execution_id)-$($Action.action_id).json"
    $artifact=Write-AgenticImmutableJsonArtifact -RelativePath $rel -Value $result
    $result|Add-Member -NotePropertyName artifact_path -NotePropertyValue $artifact.Path
    return $result
}

function Invoke-AgenticParallelReviews {
    param($State,[string]$RequestPath,[string]$SnapshotSha)
    if(-not(Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)){throw 'Parallel reviewer execution requires PowerShell ThreadJob support.'}
    $functionSource=(Get-Command Invoke-CodexAgentRole -CommandType Function).Definition
    $jobs=@()
    foreach($role in @('reviewer','security')){
        $id=[guid]::NewGuid().ToString('N');$State.agent_calls++
        if($State.agent_calls -gt $State.max_agent_calls -or $State.iteration -gt $State.max_iterations){throw 'Agentic hard invocation/iteration limit reached.'}
        $State.execution_id=$id
        $scriptText=@"
param(`$stateValue,`$goalPath,`$roleName,`$phaseName,`$invocation,`$modeValue,`$rootPath,`$contextValue)
. (Join-Path `$rootPath 'scripts/agentic-common.ps1')
function Invoke-CodexAgentRole { $functionSource }
Invoke-CodexAgentRole -State `$stateValue -GoalPath `$goalPath -Role `$roleName -Phase `$phaseName -InvocationId `$invocation -Mode `$modeValue -ExecutionRoot `$rootPath -AdditionalContext `$contextValue
"@
        $job=Start-ThreadJob -ArgumentList @($State,$RequestPath,$role,'REVIEWING',$id,'independent-review',$script:AgenticRepoRoot,"Review the approved snapshot $SnapshotSha and the full Specification $($State.specification_path). Return only your independent findings; do not consume another review's output.") -ScriptBlock ([scriptblock]::Create($scriptText))
        $jobs+= [pscustomobject]@{ role=$role; id=$id; job=$job }
    }
    try {
        $null=Wait-Job -Job @($jobs.job)
        $results=@()
        foreach($entry in $jobs){
            $value=Receive-Job -Job $entry.job -ErrorAction Stop | Select-Object -Last 1
            if($null -eq $value){throw "Parallel $($entry.role) invocation returned no result."}
            $results+= $value
        }
        return @($results)
    }
    finally { foreach($entry in $jobs){Remove-Job -Job $entry.job -Force -ErrorAction SilentlyContinue} }
}

function Invoke-AgenticWorkflowDispatcher {
    param([Parameter(Mandatory=$true)]$State,[Parameter(Mandatory=$true)]$Decision,[Parameter(Mandatory=$true)][scriptblock]$RoleInvoker,[Parameter(Mandatory=$true)][scriptblock]$ParallelInvoker,[scriptblock]$VerificationInvoker,[string]$Phase)
    Assert-AgenticOrchestratorDecision -Decision $Decision -CurrentState ([string]$State.state)|Out-Null
    if([string]$State.state -cne [string]$Decision.next_state -and -not(Test-AgenticTransition -From ([string]$State.state) -To ([string]$Decision.next_state))){throw "Dispatcher rejected illegal transition $($State.state) -> $($Decision.next_state)."}
    if([string]$Decision.next_state -in @('ALREADY_SATISFIED','WAITING_HUMAN_MERGE','FAILED','BLOCKED')){return @()}
    if($null -ne $State.PSObject.Properties['agent_calls'] -and [int]$State.agent_calls -gt [int]$State.max_agent_calls){
        $State.failure_diagnostic=[pscustomobject]@{category='INVOCATION_LIMIT';message='Agent invocation hard limit reached before role dispatch.';operation='workflow-dispatch';retryable=$false;evidence=@($Decision.evidence)}
        if(Test-AgenticTransition -From ([string]$State.state) -To 'FAILED'){Set-AgenticSupervisorTransition -State $State -To 'FAILED' -PendingAction 'Agent invocation hard limit reached'|Out-Null;Write-AgenticState $State}
        throw 'Agent invocation hard limit reached; execution terminated FAILED.'
    }
    if([string]$Decision.next_state -eq 'CORRECTING'){
        $route=[string]$Decision.correction_routing
        if(@($Decision.next_roles).Count -ne 1 -or [string]$Decision.next_roles[0] -cne $route){throw 'Correction routing must select the sole dispatched correction role.'}
        return @(& $RoleInvoker $route $Phase)
    }
    $roles=@($Decision.next_roles)
    if($roles.Count -eq 2 -and @($roles|Where-Object{$_ -in @('reviewer','security')}).Count -eq 2){return @(& $ParallelInvoker $roles)}
    if($roles.Count -gt 1){throw 'Dispatcher supports only the independent reviewer/security pair as parallel roles.'}
    if($roles.Count -eq 1){return @(& $RoleInvoker ([string]$roles[0]) $Phase)}
    if([string]$Decision.next_state -in @('OBSERVABILITY_VERIFICATION','REQUIREMENT_VERIFICATION','SCOPE_DIFF_VERIFICATION')){
        if($null -eq $VerificationInvoker){throw 'Verification decision has no verification executor.'}
        return @(& $VerificationInvoker ([string]$Decision.next_state))
    }
    throw 'Nonterminal Orchestrator decision did not authorize a role or verification action.'
}

function Complete-AgenticAutonomousCorrection {
    param($State,[hashtable]$Metadata,$Decision,[string]$Failure)
    if([string]$Decision.next_state -cne 'CORRECTING' -or [string]$Decision.correction_routing -cne 'implementer' -or @($Decision.next_roles).Count -ne 1 -or [string]$Decision.next_roles[0] -cne 'implementer'){throw 'Correction decision must route the bounded functional correction to Implementer.'}
    Set-AgenticSupervisorTransition -State $State -To 'CORRECTING' -PendingAction $Failure|Out-Null
    Reset-AgenticDownstreamApprovals -State $State|Out-Null
    $State.iteration++
    if([int]$State.iteration -gt [int]$State.max_iterations){
        $State.failure_diagnostic=[pscustomobject]@{category='CORRECTION_LIMIT';message='Correction iteration hard limit reached.';operation='autonomous-correction';retryable=$false;evidence=@($Failure)}
        Set-AgenticSupervisorTransition -State $State -To 'FAILED' -PendingAction 'Bounded correction limit reached'|Out-Null;Write-AgenticState $State;return $null
    }
    if([int]$State.agent_calls -ge [int]$State.max_agent_calls){
        $State.failure_diagnostic=[pscustomobject]@{category='INVOCATION_LIMIT';message='Agent invocation hard limit reached during autonomous correction.';operation='autonomous-correction';retryable=$false;evidence=@($Failure)}
        Set-AgenticSupervisorTransition -State $State -To 'FAILED' -PendingAction 'Bounded invocation limit reached'|Out-Null;Write-AgenticState $State;return $null
    }
    Write-AgenticState $State
    $next=Invoke-AgenticWorkflowDecision -State $State -Metadata $Metadata -Phase 'CORRECTING' -Context "Dispatch implementer correction from validated finding: $Failure. Prior downstream snapshot evidence was invalidated."
    if([string]$next.next_state -cne 'IMPLEMENTING' -or @($next.next_roles).Count -ne 1 -or [string]$next.next_roles[0] -cne 'implementer'){throw 'Orchestrator did not authorize the bounded Implementer correction action.'}
    Set-AgenticSupervisorTransition -State $State -To 'IMPLEMENTING' -PendingAction 'Autonomous correction continues within the current execution'|Out-Null
    Write-AgenticState $State
    return $next
}

function Invoke-AgenticVNextLifecycle {
    param([Parameter(Mandatory=$true)][string]$RequestId, [switch]$Resume)
    if ($RequestId -cnotmatch '^req-[0-9a-f]{32}$') { throw 'Request ID inválido.' }
    $requestRelative = "agentic/state/requests/$RequestId.json"
    $requestPath = Join-Path $script:AgenticRepoRoot $requestRelative
    $envelope = Read-AgenticTextSafely -Path $requestPath | ConvertFrom-Json
    Assert-AgenticRequestEnvelope -Envelope $envelope | Out-Null
    if ([string]$envelope.request_id -cne $RequestId) { throw 'Request Envelope diverge do request solicitado.' }

    $state = Get-AgenticState
    $metadata=$null;$scopePaths=@();$base=$null;$baseSha=$null;$preflightRelative=$null;$specRelative=$null;$resumePreflight=$false
    if ($Resume) {
        Assert-AgenticResumeCheckpoint -State $state | Out-Null
        if ([string]$state.request_id -cne $RequestId) { throw 'Resume request identity diverge do checkpoint.' }
        if ((Get-AgenticFileSha256 -Path $requestPath) -cne [string]$state.request_envelope_file_sha256) { throw 'Request Envelope foi alterado desde o checkpoint.' }
        Assert-AgenticJournalMatchesState -State $state | Out-Null
        if ([string]::IsNullOrWhiteSpace([string]$state.branch) -or [string]$state.branch -ceq 'pending-preflight') {
            if ([string]$state.state -notin @('BLOCKED','WAITING_FOR_QUOTA')) { throw 'Branchless checkpoint cannot be resumed from this state.' }
            $currentBranchLines=@(Invoke-AgenticGit -GitArguments @('branch','--show-current'));$currentBranch=if($currentBranchLines.Count -gt 0){([string]$currentBranchLines[0]).Trim()}else{''}
            if($currentBranch -cne [string]$state.origin_branch){throw 'Branchless preflight resume must remain on the original branch.'}
            $base=[string]$state.base_branch
            $metadata=@{ID=$RequestId;Title=([string]$envelope.user_requirement_verbatim.Substring(0,[Math]::Min(80,$envelope.user_requirement_verbatim.Length)));'Base branch'=$base;'Branch prefix'=[string]$envelope.request_type_hint;'Allowed files'='none'}
            $resumeFrom=[string]$state.state
            Set-AgenticSupervisorTransition -State $state -To 'RESUMING' -PendingAction "Resume branchless preflight after $resumeFrom"|Out-Null;Write-AgenticState $state
            $preflightResumeDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'RESUMING' -Context "Resume the same request before branch creation; preserve role counters and re-fetch the trusted base. External condition cleared by caller. previous_phase=$($state.pending_phase)."
            Set-AgenticSupervisorTransition -State $state -To ([string]$preflightResumeDecision.next_state) -PendingAction 'Re-fetch trusted base and resume Architect semantic preflight'|Out-Null;Write-AgenticState $state
            $resumePreflight=$true
        }
        else {
        if ([string]$state.state -notin @('CORRECTING','BLOCKED','WAITING_FOR_QUOTA')) { throw "Resume phase '$($state.state)' is not resumable from this checkpoint." }
        $branchLines=@(Invoke-AgenticGit -GitArguments @('branch','--show-current'));$branch=([string]$branchLines[0]).Trim()
        if($branch -cne [string]$state.branch -or $branch -in @('develop','main')){throw 'Resume branch identity mismatch.'}
        $baseCheck=Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'merge-base','--is-ancestor',[string]$state.base_sha,'HEAD')
        Assert-AgenticNativeProcessSucceeded -Result $baseCheck -CommandName 'Resume captured-base provenance'
        if([string]::IsNullOrWhiteSpace([string]$state.specification_path) -or (Get-AgenticFileSha256 -Path (Join-Path $script:AgenticRepoRoot $state.specification_path)) -cne [string]$state.specification_sha256){throw 'Resume Specification hash mismatch.'}
        if([string]::IsNullOrWhiteSpace([string]$state.specification_payload_path) -or (Get-AgenticFileSha256 -Path (Join-Path $script:AgenticRepoRoot $state.specification_payload_path)) -cne [string]$state.specification_payload_sha256){throw 'Resume Architect payload hash mismatch.'}
        $payload=Read-AgenticTextSafely -Path (Join-Path $script:AgenticRepoRoot $state.specification_payload_path)|ConvertFrom-Json
        Assert-AgenticDor $payload|Out-Null
        $scopePaths=@($payload.scope|ForEach-Object{if($_ -is [string]){[string]$_}elseif($_.PSObject.Properties['path']){[string]$_.path}else{''}}|Where-Object{$_}|ForEach-Object{$_.Replace('\','/')}|Sort-Object -Unique)
        if($scopePaths.Count -eq 0){throw 'Resume Specification scope is empty.'}
        $base=[string]$state.base_branch;$baseSha=[string]$state.base_sha;$preflightRelative=[string]$state.preflight_result_path;$specRelative=[string]$state.specification_path
        $metadata=@{ID=$RequestId;Title=([string]$envelope.user_requirement_verbatim.Substring(0,[Math]::Min(80,$envelope.user_requirement_verbatim.Length)));'Base branch'=$base;'Branch prefix'=[string]$envelope.request_type_hint;'Allowed files'=$scopePaths -join ', '}
        if ([string]$state.state -in @('BLOCKED','WAITING_FOR_QUOTA')) {
            $resumeFrom = [string]$state.state
            Set-AgenticSupervisorTransition -State $state -To 'RESUMING' -PendingAction "Resume validated checkpoint after $resumeFrom" | Out-Null
            Write-AgenticState $state
            $resumeDecision = Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'RESUMING' -Context "The external blocker/quota condition has been cleared by the caller. Preserve branch and base and restart the complete downstream validation cycle. pending_phase=$($state.pending_phase); prior_phase=$resumeFrom."
            Set-AgenticSupervisorTransition -State $state -To ([string]$resumeDecision.next_state) -PendingAction 'Resume through full implementer, tester, reviewer and security cycle' | Out-Null
        }
        $state.iteration++
        if([int]$state.iteration -gt [int]$state.max_iterations){throw 'Correction iteration hard limit reached.'}
        $decision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'CORRECTING' -Context "Resume correction with same request, branch, Specification and base. Findings: $($state.last_failure)."
        Set-AgenticSupervisorTransition -State $state -To ([string]$decision.next_state) -PendingAction 'Resume implementer correction; downstream approvals invalidated'|Out-Null
        Reset-AgenticDownstreamApprovals -State $state|Out-Null
        Write-AgenticState $state
        }
    }
    else {
    if ($state.state -notin @('IDLE','ALREADY_SATISFIED','FAILED','WAITING_HUMAN_MERGE')) { throw 'Já existe uma execução ativa; use resume_request.' }
    $state = Get-AgenticStateTemplate
    $state.request_id = $RequestId; $state.goal_id = $RequestId
    $state.request_envelope_path = $requestRelative
    $state.request_envelope_sha256 = [string]$envelope.content_sha256
    $state.request_envelope_file_sha256 = Get-AgenticFileSha256 -Path $requestPath
    $state.request_type_hint = [string]$envelope.request_type_hint
    $state.base_branch = if ([string]$envelope.request_type_hint -ceq 'hotfix') { 'main' } else { 'develop' }
    $originBranchLines=@(Invoke-AgenticGit -GitArguments @('branch','--show-current'));$state.origin_branch=if($originBranchLines.Count -gt 0){([string]$originBranchLines[0]).Trim()}else{''}
    $state.branch = 'pending-preflight'
    $state.started_at = [DateTimeOffset]::UtcNow.ToString('o')
    $state.state = 'IDLE'
    Set-AgenticSupervisorTransition -State $state -To 'REQUEST_ACCEPTED' -PendingAction 'Validate immutable Request Envelope' | Out-Null
    Write-AgenticState $state
    Initialize-AgenticJournalForGoal -GoalId $RequestId -Branch 'pending-preflight' -BaseBranch $state.base_branch
    Add-AgenticJournalEvent -Goal $RequestId -State 'REQUEST_ACCEPTED' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Persist immutable Request Envelope identity' -Gate $requestRelative -Result 'PASS'
    Set-AgenticSupervisorTransition -State $state -To 'PREFLIGHT_PREPARING' -PendingAction 'Fetch trusted base and capture exact remote SHA' | Out-Null
    Write-AgenticState $state
    }

    $temporaryRoot=$null;$archivePath=$null
    try {
    if(-not $Resume -or $resumePreflight){
    $base = [string]$state.base_branch
    $fetch = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'fetch','origin',"refs/heads/$base:refs/remotes/origin/$base") -CaptureStandardError
    Assert-AgenticNativeProcessSucceeded -Result $fetch -CommandName 'Fetch trusted remote base'
    $baseLines = @(Invoke-AgenticGit -GitArguments @('rev-parse',"refs/remotes/origin/$base"))
    $baseSha = ([string]$baseLines[0]).Trim()
    if ($baseSha -cnotmatch '^[0-9a-f]{40,64}$') { throw 'Remote base SHA inválido.' }
    $state.base_sha = $baseSha
    $engine = Resolve-AgenticPowerShellEngine
    $state.supervisor_runtime = [pscustomobject]@{ edition=$engine.Edition; version=$engine.Version; path=[IO.Path]::GetFileName($engine.Path) }
    $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('gerit-agentic-preflight-' + [guid]::NewGuid().ToString('N'))
    $archivePath = "$temporaryRoot.tar"
    [IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
        $archive = Invoke-AgenticNativeProcess -FilePath 'git' -Arguments @('-C',$script:AgenticRepoRoot,'archive','--format=tar',"--output=$archivePath",$baseSha)
        Assert-AgenticNativeProcessSucceeded -Result $archive -CommandName 'Create trusted-base read-only snapshot'
        $extract = Invoke-AgenticNativeProcess -FilePath 'tar' -Arguments @('-xf',$archivePath,'-C',$temporaryRoot)
        Assert-AgenticNativeProcessSucceeded -Result $extract -CommandName 'Extract trusted-base read-only snapshot'
        $tempRequestPath=Join-Path $temporaryRoot $requestRelative
        [IO.Directory]::CreateDirectory((Split-Path -Parent $tempRequestPath))|Out-Null
        [IO.File]::WriteAllText($tempRequestPath,(ConvertTo-Json -InputObject $envelope -Depth 10)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
        $treeLines = @(Invoke-AgenticGit -GitArguments @('rev-parse',"$baseSha^{tree}"))
        $baseSnapshot = Get-AgenticTextSha256 -Text ([string]$treeLines[0])
        $state.execution_snapshot_sha256 = $baseSnapshot
        $metadata = @{ ID=$RequestId; Title=([string]$envelope.user_requirement_verbatim.Substring(0,[Math]::Min(80,$envelope.user_requirement_verbatim.Length))); 'Base branch'=$base; 'Branch prefix'=[string]$envelope.request_type_hint; 'Allowed files'='none' }
        $preflightDispatchDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'PREFLIGHT_PREPARING' -Context "Trusted remote base snapshot is prepared: base=$base; base_sha=$baseSha; snapshot=$baseSnapshot. Dispatch Architect semantic preflight."
        if([string]$preflightDispatchDecision.next_state -cne 'PREFLIGHT_ANALYZING' -or @($preflightDispatchDecision.next_roles).Count -ne 1 -or [string]$preflightDispatchDecision.next_roles[0] -cne 'architect'){throw 'Orchestrator did not authorize Architect preflight dispatch.'}
        Set-AgenticSupervisorTransition -State $state -To ([string]$preflightDispatchDecision.next_state) -PendingAction 'Dispatch Architect semantic preflight against captured base'|Out-Null
        $state.execution_id = [guid]::NewGuid().ToString('N')
        $state.agent_calls++; $state.active_agent='architect'
        Write-AgenticState $state
        $context = "Mode: preflight. Assess this exact trusted base snapshot semantically. Request Envelope file: $requestRelative. User requirement verbatim: $($envelope.user_requirement_verbatim). Envelope SHA256: $($state.request_envelope_sha256). Base branch: $base. Base SHA: $baseSha. Return semantic_status SATISFIED, NOT_SATISFIED, or BLOCKED and concrete evidence. Do not create a Specification in this mode."
        $architect=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $preflightDispatchDecision -Phase 'PREFLIGHT_ANALYZING' -RoleInvoker {param($role,$dispatchPhase) Invoke-CodexAgentRole -State $state -GoalPath $requestPath -Role $role -Phase $dispatchPhase -InvocationId $state.execution_id -Mode 'preflight' -ExecutionRoot $temporaryRoot -AdditionalContext $context} -ParallelInvoker {param($roles) throw 'Architect preflight cannot be parallel-dispatched.'})[0]
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $architect -Metadata $metadata
        if ($architect.ExitCode -ne 0 -or $null -eq $architect.Result -or $architect.Result.status -ne 'PASS') { throw ('Architect preflight não produziu resultado válido. '+(ConvertTo-AgenticSanitizedText -Text ([string]$architect.Output) -MaximumLength 500)) }
        $semantic = [string]$architect.Result.semantic_status
        $preflight = New-AgenticPreflightResultArtifact -Envelope $envelope -BaseBranch $base -BaseSha $baseSha -InvocationId $state.execution_id -Status $semantic -Evidence @($architect.Result.evidence)
        Assert-AgenticPreflightResultArtifact -Artifact $preflight -Envelope $envelope -BaseBranch $base -BaseSha $baseSha | Out-Null
        $preflightRelative = "agentic/state/preflight/$RequestId-$($state.execution_id).json"
        $persisted = Write-AgenticImmutableJsonArtifact -RelativePath $preflightRelative -Value $preflight
        $state.preflight_result_path=$preflightRelative; $state.preflight_result_sha256=$persisted.Sha256
        $orchId=[guid]::NewGuid().ToString('N'); $state.execution_id=$orchId; $state.agent_calls++; $state.active_agent='orchestrator'
        Write-AgenticState $state
        $orchContext = "Decide the next action from the validated Architect semantic result and immutable Preflight Result. semantic_status=$semantic; preflight_artifact=$preflightRelative. No desired transition is supplied."
        $orchestratorDecision = Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'PREFLIGHT_ANALYZING' -Context $orchContext
        $expected = [string]$orchestratorDecision.next_state
        $semanticAllowed = switch ($semantic) { 'SATISFIED' {@('ALREADY_SATISFIED')} 'NOT_SATISFIED' {@('BRANCH_PREPARED')} 'BLOCKED' {@('BLOCKED')} default { throw 'Architect semantic status inválido.' } }
        if ($expected -notin $semanticAllowed) { throw 'Orchestrator decision conflicts with validated Architect semantic evidence.' }
        if ($expected -eq 'ALREADY_SATISFIED') {
            Set-AgenticSupervisorTransition -State $state -To 'ALREADY_SATISFIED' -PendingAction 'NO_CHANGES: Architect concluiu que a solicitação já está satisfeita' | Out-Null
            $state.no_changes=$true; $state.active_agent=$null; Write-AgenticState $state
            Add-AgenticJournalEvent -Goal $RequestId -State 'ALREADY_SATISFIED' -Agent 'orchestrator' -Controller 'supervisor' -Actor 'supervisor' -Action 'Persistir decisão sem alteração sem criar branch ou artifacts funcionais' -Gate $persisted.Path -Result 'NO_CHANGES'
            return $state
        }
        if ($expected -eq 'BLOCKED') {
            Set-AgenticSupervisorTransition -State $state -To 'BLOCKED' -PendingAction ([string]$orchestratorDecision.rationale) | Out-Null
            Write-AgenticState $state
            Add-AgenticJournalEvent -Goal $RequestId -State 'BLOCKED' -Agent 'orchestrator' -Controller 'supervisor' -Actor 'supervisor' -Action 'Registrar bloqueio do preflight' -Gate $persisted.Path -Result 'BLOCKED'
            return $state
        }
        $state.preflight_status=$semantic
        $state.branch=Start-GoalBranch -Metadata $metadata -BaseSha $baseSha
        $state.work_branch=$state.branch
        Set-AgenticJournalBranch -GoalId $RequestId -Branch $state.branch
        Set-AgenticSupervisorTransition -State $state -To 'BRANCH_PREPARED' -PendingAction 'Fresh single-use branch created from captured base SHA' | Out-Null
        Write-AgenticState $state
        Add-AgenticJournalEvent -Goal $RequestId -State 'BRANCH_PREPARED' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -Action 'Criar branch fresh após NOT_SATISFIED' -Gate "base_sha=$baseSha" -Result 'PASS'
        $architectureDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'BRANCH_PREPARED' -Context 'Architect preflight NOT_SATISFIED and fresh branch from exact captured base are validated.'
        Set-AgenticSupervisorTransition -State $state -To ([string]$architectureDecision.next_state) -PendingAction 'Begin Architect discovery and Specification' | Out-Null
        $state.execution_id=[guid]::NewGuid().ToString('N'); $state.execution_snapshot_sha256=Get-AgenticTextSha256 -Text $baseSha
        $state.active_agent='architect'; $state.agent_calls++; Write-AgenticState $state
        $archContext="Mode: specification. Read the full repository patterns and Request Envelope $requestRelative, plus Preflight Result $preflightRelative. Return the complete Specification payload defined in docs/agentic/4-execution-specification.md. No functional edits."
        $specInvocation=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $architectureDecision -Phase 'ARCHITECTURE' -RoleInvoker {param($role,$dispatchPhase) Invoke-CodexAgentRole -State $state -GoalPath $requestPath -Role $role -Phase $dispatchPhase -InvocationId $state.execution_id -Mode 'specification' -ExecutionRoot $script:AgenticRepoRoot -AdditionalContext $archContext} -ParallelInvoker {param($roles) throw 'Architect specification cannot be parallel-dispatched.'})[0]
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $specInvocation -Metadata $metadata
        if($specInvocation.ExitCode -ne 0 -or $null -eq $specInvocation.Result -or $specInvocation.Result.status -ne 'PASS'){throw ('Architect specification result inválido. '+(ConvertTo-AgenticSanitizedText -Text ([string]$specInvocation.Output) -MaximumLength 500))}
        $payload=$specInvocation.Result.payload
        Set-AgenticSupervisorTransition -State $state -To 'DOR_VALIDATION' -PendingAction 'Validate canonical Specification schema and DOR' | Out-Null
        Assert-AgenticDor -Specification $payload | Out-Null
        $scopePaths=@()
        foreach($entry in @($payload.scope)) {
            $candidate=if($entry -is [string]){[string]$entry}elseif($null -ne $entry.PSObject.Properties['path']){[string]$entry.path}else{''}
            if([string]::IsNullOrWhiteSpace($candidate)){continue}
            $candidate=$candidate.Replace('\','/')
            if($candidate -match '[*?]|(^|/)\.\.?(/|$)|^/|^[A-Za-z]:|\.git'){throw 'Architect Specification scope contém path inválido.'}
            $scopePaths+= $candidate
        }
        $scopePaths=@($scopePaths|Sort-Object -Unique)
        if($scopePaths.Count -eq 0){throw 'Architect Specification não declarou paths concretos no scope.'}
        $metadata['Allowed files']=$scopePaths -join ', '
        $state.allowed_functional_files=@($scopePaths)
        $specRelative="agentic/specifications/$RequestId.md"; $specFull=Join-Path $script:AgenticRepoRoot $specRelative
        if(Test-Path -LiteralPath $specFull){throw 'Canonical Specification já existe com conteúdo; não será sobrescrita.'}
        $state.specification_path=$specRelative; $state.specification_version=1
        $specText=New-AgenticSpecificationMarkdown -Payload $payload -State $state -Title ([string]$metadata.Title)
        Write-AgenticBytesSafely -Path $specFull -Bytes ([Text.UTF8Encoding]::new($false).GetBytes($specText))
        $state.specification_sha256=Get-AgenticFileSha256 -Path $specFull
        $state.specification_payload_path="agentic/state/specifications/$RequestId.json"
        $payloadArtifact=Write-AgenticImmutableJsonArtifact -RelativePath $state.specification_payload_path -Value $payload
        $state.specification_payload_sha256=$payloadArtifact.Sha256
        Write-AgenticState $state
        $decision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'DOR_VALIDATION' -Context "DOR PASS. Specification=$specRelative; sha256=$($state.specification_sha256)."
        Set-AgenticSupervisorTransition -State $state -To ([string]$decision.next_state) -PendingAction 'DOR validated; implementation authorized' | Out-Null
    }

        if([int]$state.iteration -eq 0){$state.iteration=1}
        while($true){
        $state.active_agent='implementer';$state.execution_id=[guid]::NewGuid().ToString('N')
        $initial=@(Get-AgenticCommitSnapshot -Paths $scopePaths);$state.execution_snapshot_sha256=Get-AgenticStableSnapshotSha256 -Snapshot $initial
        $state.agent_calls++;Write-AgenticState $state
        Add-AgenticJournalEvent -Goal $RequestId -State 'IMPLEMENTING' -Agent 'supervisor' -Controller 'supervisor' -Actor 'supervisor' -DelegatedAgent 'implementer' -Action 'Invoke implementer against validated Specification and bounded scope' -Gate $state.execution_snapshot_sha256 -Result 'PENDING'
        $implementer=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $decision -Phase 'IMPLEMENTING' -RoleInvoker {param($role,$dispatchPhase) Invoke-CodexAgentRole -State $state -GoalPath $requestPath -Role $role -Phase $dispatchPhase -InvocationId $state.execution_id -Mode 'implementation' -ExecutionRoot $script:AgenticRepoRoot -AdditionalContext "Read the complete Specification at $specRelative and implement only its concrete scope paths: $($scopePaths -join ', '). Active correction findings: $($state.last_failure)"} -ParallelInvoker {param($roles) throw 'Parallel dispatch is not valid for this decision.'})[0]
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $implementer -Metadata $metadata
        if($implementer.ExitCode -ne 0 -or $null -eq $implementer.Result -or $implementer.Result.status -ne 'PASS'){throw ('Implementer did not return a validated PASS artifact. '+(ConvertTo-AgenticSanitizedText -Text ([string]$implementer.Output) -MaximumLength 500))}
        $actual=@(Get-AgenticCommitPaths -ChangedPaths @(Get-AgenticWorkingTreePaths))
        if($actual.Count -eq 0 -or @($actual|Where-Object{$_ -notin $scopePaths}).Count -gt 0){throw 'Actual implementation paths diverge from approved Specification scope.'}
        $declared=@($implementer.Result.files_changed|ForEach-Object{([string]$_).Replace('\','/')}|Sort-Object -Unique)
        if(@($actual|Where-Object{$_ -notin $declared}).Count -gt 0 -or @($declared|Where-Object{$_ -notin $actual}).Count -gt 0){throw 'Implementer files_changed does not match the actual worktree diff.'}
        $implementationEvent=[string]$implementer.Result.summary
        Add-AgenticJournalEvent -Goal $RequestId -State 'IMPLEMENTING' -Agent 'implementer' -Controller 'supervisor' -Actor 'implementer' -Action $implementationEvent -FilesChanged @($actual) -Gate $implementer.ArtifactPath -Result 'PASS'
        Set-AgenticSpecificationProjection -State $state -Section 'Implementation Result' -Value ([pscustomobject]@{status='PASS';summary=$implementationEvent;files_changed=$actual;artifact=$implementer.ArtifactPath;snapshot_sha256=$implementer.Result.snapshot_sha256})|Out-Null

        $testingDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'IMPLEMENTING' -Context 'Implementer PASS provenance and actual changed paths match the Specification scope.'
        Set-AgenticSupervisorTransition -State $state -To ([string]$testingDecision.next_state) -PendingAction 'Tester QA plan and bounded broker actions' | Out-Null
        $state.active_agent='tester';$state.execution_id=[guid]::NewGuid().ToString('N')
        $functional=@(Get-AgenticCommitPaths -ChangedPaths @(Get-AgenticWorkingTreePaths));$snapshot=@(Get-AgenticCommitSnapshot -Paths $functional)
        $state.execution_snapshot_sha256=Get-AgenticStableSnapshotSha256 -Snapshot $snapshot;$state.approved_snapshot_sha256=$state.execution_snapshot_sha256
        $state.agent_calls++;Write-AgenticState $state
        $qa=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $testingDecision -Phase 'TESTING' -RoleInvoker {param($role,$dispatchPhase) Invoke-CodexAgentRole -State $state -GoalPath $requestPath -Role $role -Phase $dispatchPhase -InvocationId $state.execution_id -Mode 'qa-plan' -ExecutionRoot $script:AgenticRepoRoot -AdditionalContext "Read the full Specification $specRelative, derive AC/DOD test plan, and request required bounded actions only."} -ParallelInvoker {param($roles) throw 'Parallel dispatch is not valid for this decision.'})[0]
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $qa -Metadata $metadata
        if($qa.ExitCode -ne 0 -or $null -eq $qa.Result -or $qa.Result.status -ne 'PASS'){throw ('Tester QA plan failed or is blocked. '+(ConvertTo-AgenticSanitizedText -Text ([string]$qa.Output) -MaximumLength 500))}
        $broker=@()
        $requestedActions=@($qa.Result.test_actions)
        if($requestedActions.Count -gt 12 -or @($requestedActions|ForEach-Object{[string]$_.action_id}|Sort-Object -Unique).Count -ne $requestedActions.Count){throw 'Tester exceeded bounded action count or reused an action_id.'}
        foreach($action in $requestedActions){Assert-AgenticBrokerAction -Action $action|Out-Null;$broker+=Invoke-AgenticBrokerAction -Action $action -State $state}
        $state.brokered_test_results=@($broker);$evalId=[guid]::NewGuid().ToString('N');$state.execution_id=$evalId;$state.agent_calls++
        Write-AgenticState $state
        $evalContext="Evaluate each acceptance criterion and DOD against brokered host evidence. Evidence JSON: $(@($broker|ConvertTo-Json -Depth 10 -Compress) -join ''). Return PASS/FAIL/BLOCKED and an empty test_actions array."
        $evaluation=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $testingDecision -Phase 'TESTING_EVALUATE' -RoleInvoker {param($role,$dispatchPhase) Invoke-CodexAgentRole -State $state -GoalPath $requestPath -Role $role -Phase $dispatchPhase -InvocationId $evalId -Mode 'qa-evaluation' -ExecutionRoot $script:AgenticRepoRoot -AdditionalContext $evalContext} -ParallelInvoker {param($roles) throw 'Parallel dispatch is not valid for this decision.'})[0]
        Add-AgenticRoleInvocationEvidence -State $state -Invocation $evaluation -Metadata $metadata
        if($evaluation.ExitCode -ne 0 -or $null -eq $evaluation.Result){throw ('Tester evaluation artifact invalid. '+(ConvertTo-AgenticSanitizedText -Text ([string]$evaluation.Output) -MaximumLength 500))}
        if(@($evaluation.Result.test_actions).Count -gt 0){throw 'Tester evaluation cannot request additional actions after evidence evaluation.'}
        if($evaluation.Result.status -eq 'BLOCKED'){$state.failure_diagnostic=$evaluation.Result.failure;$blockedDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'TESTING' -Context "Tester evidence requires an unavailable external capability: $($evaluation.Result.failure.message).";Set-AgenticSupervisorTransition -State $state -To ([string]$blockedDecision.next_state) -PendingAction ([string]$evaluation.Result.failure.message)|Out-Null;Write-AgenticState $state;return $state}
        if($evaluation.Result.status -eq 'FAIL'){$state.last_failure=[string]$evaluation.Result.summary;$correctionDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'TESTING' -Context "Tester found functional acceptance failures. Findings: $($evaluation.Result.summary). Invalidate old snapshot approvals.";$decision=Complete-AgenticAutonomousCorrection -State $state -Metadata $metadata -Decision $correctionDecision -Failure $state.last_failure;if($null -eq $decision){return $state};continue}
        $state.tester_status='PASS';$state.tester_invocation_id=$evalId;$state.active_agent=$null
        Set-AgenticSpecificationProjection -State $state -Section 'Tester Result' -Value ([pscustomobject]@{status='PASS';summary=$evaluation.Result.summary;artifact=$evaluation.ArtifactPath;brokered_actions=$broker;snapshot_sha256=$state.approved_snapshot_sha256})|Out-Null
        $decision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'TESTING' -Context 'Tester PASS artifact is present and bound to approved snapshot.'
        Set-AgenticSupervisorTransition -State $state -To ([string]$decision.next_state) -PendingAction 'Tester PASS; start independent Reviewer and Security'|Out-Null
        Write-AgenticState $state
        $state.execution_snapshot_sha256=$state.approved_snapshot_sha256
        $parallel=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $decision -Phase 'REVIEWING' -RoleInvoker {param($role,$dispatchPhase) throw 'Reviewer and Security must be dispatched together.'} -ParallelInvoker {param($roles) Invoke-AgenticParallelReviews -State $state -RequestPath $requestPath -SnapshotSha $state.approved_snapshot_sha256})
        foreach($review in $parallel){
            if($review.ExitCode -ne 0 -or $null -eq $review.Result){throw ("Independent $($review.Role) result invalid. "+(ConvertTo-AgenticSanitizedText -Text ([string]$review.Output) -MaximumLength 500))}
            Add-AgenticRoleInvocationEvidence -State $state -Invocation $review -Metadata $metadata
        }
        $reviewer=@($parallel|Where-Object{$_.Role -ceq 'reviewer'}|Select-Object -First 1)[0]
        $security=@($parallel|Where-Object{$_.Role -ceq 'security'}|Select-Object -First 1)[0]
        if($null -eq $reviewer -or $null -eq $security -or $reviewer.InvocationId -ceq $security.InvocationId -or $reviewer.Result.snapshot_sha256 -cne $security.Result.snapshot_sha256){throw 'Reviewer/Security independence or shared snapshot invariant failed.'}
        if($reviewer.Result.status -eq 'BLOCKED' -or $security.Result.status -eq 'BLOCKED'){
            $blockedReviewDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'REVIEWING' -Context "Independent review status: reviewer=$($reviewer.Result.status), security=$($security.Result.status). Preserve the external blocker reason.";Set-AgenticSupervisorTransition -State $state -To ([string]$blockedReviewDecision.next_state) -PendingAction 'Reviewer or Security requires an unavailable external capability'|Out-Null;Write-AgenticState $state;return $state
        }
        if($reviewer.Result.status -eq 'FAIL' -or $security.Result.status -eq 'FAIL'){
            $state.last_failure='Reviewer or Security reported correction findings.'
            $correctionReviewDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'REVIEWING' -Context "Independent review findings require a full correction cycle. reviewer=$($reviewer.Result.status); security=$($security.Result.status)."
            $decision=Complete-AgenticAutonomousCorrection -State $state -Metadata $metadata -Decision $correctionReviewDecision -Failure $state.last_failure;if($null -eq $decision){return $state};continue
        }
        $state.security_review_status='PASS';$state.code_review_status='PASS'
        Set-AgenticSpecificationProjection -State $state -Section 'Reviewer Result' -Value ([pscustomobject]@{status='PASS';artifact=$reviewer.ArtifactPath;snapshot_sha256=$state.approved_snapshot_sha256})|Out-Null
        Set-AgenticSpecificationProjection -State $state -Section 'Security Result' -Value ([pscustomobject]@{status='PASS';artifact=$security.ArtifactPath;snapshot_sha256=$state.approved_snapshot_sha256})|Out-Null
        $decision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'REVIEWING' -Context 'Reviewer PASS and Security PASS exist independently for the same approved snapshot.'
        Set-AgenticSupervisorTransition -State $state -To ([string]$decision.next_state) -PendingAction 'Independent review aggregation passed; run final native gates'|Out-Null
        $state.change_classification=Get-AgenticChangeClassification -Paths $functional
        Write-AgenticState $state
        Invoke-AgenticQualityGates -State $state -Metadata $metadata | Out-Null
        Set-AgenticSpecificationProjection -State $state -Section 'Quality Gates' -Value @($state.gate_results)|Out-Null
        $current=@(Get-AgenticCommitSnapshot -Paths $functional);$currentHash=Get-AgenticStableSnapshotSha256 -Snapshot $current
        if($currentHash -cne [string]$state.approved_snapshot_sha256){throw 'Snapshot changed after Tester/Review approval; downstream approvals stale.'}
        $obsDispatchDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'QUALITY_GATES' -Context 'Required native gates passed for the approved snapshot; select the next verification action.'
        if([string]$obsDispatchDecision.next_state -cne 'OBSERVABILITY_VERIFICATION'){throw 'Orchestrator did not select observability verification after required gates.'}
        Set-AgenticSupervisorTransition -State $state -To ([string]$obsDispatchDecision.next_state) -PendingAction 'Dispatch observability verification'|Out-Null
        $obsId=[guid]::NewGuid().ToString('N');$obs=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $obsDispatchDecision -Phase 'OBSERVABILITY_VERIFICATION' -RoleInvoker {param($role,$dispatchPhase) throw 'Verification action cannot dispatch a specialized role.'} -ParallelInvoker {param($roles) throw 'Verification action cannot dispatch parallel roles.'} -VerificationInvoker {param($type) Invoke-AgenticObservabilityVerification -State $state -InvocationId $obsId -Paths $functional})[0]
        $state.observability_status=[string]$obs.artifact.status;$state.observability_verification_path=$obs.path
        Set-AgenticSpecificationProjection -State $state -Section 'Observability Verification' -Value $obs.artifact|Out-Null
        $obsDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'OBSERVABILITY_VERIFICATION' -Context "Validated verification artifact $($obs.path): status=$($obs.artifact.status); findings=$(@($obs.artifact.findings)-join '; ')."
        if($obs.artifact.status -ne 'PASS'){$state.last_failure="Observability verification: $(@($obs.artifact.findings)-join '; ')";$decision=Complete-AgenticAutonomousCorrection -State $state -Metadata $metadata -Decision $obsDecision -Failure $state.last_failure;if($null -eq $decision){return $state};continue}
        $reqDispatchDecision=$obsDecision
        if([string]$reqDispatchDecision.next_state -cne 'REQUIREMENT_VERIFICATION'){throw 'Orchestrator did not select requirement verification after observability PASS.'}
        Set-AgenticSupervisorTransition -State $state -To ([string]$reqDispatchDecision.next_state) -PendingAction 'Dispatch requirement verification'|Out-Null
        $reqId=[guid]::NewGuid().ToString('N');$acceptance=@($payload.acceptance_criteria|ForEach-Object{[string]$_});$dodCriteria=@($payload.dod|ForEach-Object{[string]$_})
        $requirementEvidence=@($evaluation.Result.evidence|ForEach-Object{if($_ -isnot [string]){$_}elseif([regex]::Match([string]$_,'^(?<id>(?:AC|DOD)-[A-Za-z0-9._-]+)\s*[:=]\s*PASS\s*[-:]\s*(?<proof>.+)$').Success){$match=[regex]::Match([string]$_,'^(?<id>(?:AC|DOD)-[A-Za-z0-9._-]+)\s*[:=]\s*PASS\s*[-:]\s*(?<proof>.+)$');[pscustomobject]@{criterion_id=$match.Groups['id'].Value;status='PASS';evidence=$match.Groups['proof'].Value}}})
        $req=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $reqDispatchDecision -Phase 'REQUIREMENT_VERIFICATION' -RoleInvoker {param($role,$dispatchPhase) throw 'Verification action cannot dispatch a specialized role.'} -ParallelInvoker {param($roles) throw 'Verification action cannot dispatch parallel roles.'} -VerificationInvoker {param($type) Invoke-AgenticRequirementVerification -State $state -InvocationId $reqId -AcceptanceCriteria $acceptance -DodCriteria $dodCriteria -TesterEvidence $requirementEvidence -Envelope $envelope})[0]
        $state.requirement_status=[string]$req.artifact.status;$state.requirement_verification_path=$req.path
        Set-AgenticSpecificationProjection -State $state -Section 'Requirement Verification' -Value $req.artifact|Out-Null
        $reqDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'REQUIREMENT_VERIFICATION' -Context "Validated verification artifact $($req.path): status=$($req.artifact.status); findings=$(@($req.artifact.findings)-join '; ')."
        if($req.artifact.status -ne 'PASS'){$state.last_failure="Requirement verification: $(@($req.artifact.findings)-join '; ')";$decision=Complete-AgenticAutonomousCorrection -State $state -Metadata $metadata -Decision $reqDecision -Failure $state.last_failure;if($null -eq $decision){return $state};continue}
        $scopeNow=@(Get-AgenticCommitPaths -ChangedPaths @(Get-AgenticWorkingTreePaths))
        $finalSnapshot=@(Get-AgenticCommitSnapshot -Paths $scopeNow);$finalHash=Get-AgenticStableSnapshotSha256 -Snapshot $finalSnapshot
        $scopeId=[guid]::NewGuid().ToString('N');$scopeDispatchDecision=$reqDecision
        if([string]$scopeDispatchDecision.next_state -cne 'SCOPE_DIFF_VERIFICATION'){throw 'Orchestrator did not select scope/diff verification after requirement PASS.'}
        Set-AgenticSupervisorTransition -State $state -To ([string]$scopeDispatchDecision.next_state) -PendingAction 'Dispatch scope/diff verification'|Out-Null
        $scopeResult=@(Invoke-AgenticWorkflowDispatcher -State $state -Decision $scopeDispatchDecision -Phase 'SCOPE_DIFF_VERIFICATION' -RoleInvoker {param($role,$dispatchPhase) throw 'Verification action cannot dispatch a specialized role.'} -ParallelInvoker {param($roles) throw 'Verification action cannot dispatch parallel roles.'} -VerificationInvoker {param($type) Invoke-AgenticScopeVerification -State $state -InvocationId $scopeId -ActualPaths $scopeNow -ApprovedPaths $scopePaths -ActualSnapshotSha256 $finalHash})[0]
        $scopeDecision=Invoke-AgenticWorkflowDecision -State $state -Metadata $metadata -Phase 'SCOPE_DIFF_VERIFICATION' -Context "Validated verification artifact $($scopeResult.path): status=$($scopeResult.artifact.status); findings=$(@($scopeResult.artifact.findings)-join '; ')."
        $state.scope_status=[string]$scopeResult.artifact.status;$state.scope_verification_path=$scopeResult.path
        Set-AgenticSpecificationProjection -State $state -Section 'Scope Verification' -Value $scopeResult.artifact|Out-Null
        if($scopeResult.artifact.status -ne 'PASS'){$state.last_failure="Scope/diff verification: $(@($scopeResult.artifact.findings)-join '; ')";$decision=Complete-AgenticAutonomousCorrection -State $state -Metadata $metadata -Decision $scopeDecision -Failure $state.last_failure;if($null -eq $decision){return $state};continue}
        Set-AgenticSupervisorTransition -State $state -To ([string]$scopeDecision.next_state) -PendingAction 'All vNext readiness evidence validated'|Out-Null
        Set-AgenticSpecificationProjection -State $state -Section 'Final Status' -Value ([pscustomobject]@{status='READY_TO_COMMIT';snapshot_sha256=$finalHash})|Out-Null
        Test-AgenticReadiness -State $state -Metadata $metadata -CurrentBranch $state.branch -ChangedPaths @(Get-AgenticWorkingTreePaths)|Out-Null
        $state.active_agent=$null;Write-AgenticState $state
        return (Invoke-AgenticVNextFinalization -State $state -Metadata $metadata)
        }
    }
    finally {
        if (-not [string]::IsNullOrWhiteSpace([string]$archivePath) -and (Test-Path -LiteralPath $archivePath)) { Remove-Item -LiteralPath $archivePath -Force }
        if (-not [string]::IsNullOrWhiteSpace([string]$temporaryRoot) -and (Test-Path -LiteralPath $temporaryRoot)) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
    }
}
