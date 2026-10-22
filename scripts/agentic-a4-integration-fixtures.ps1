function New-AgenticA4Decision {
    param([string]$NextState,[string[]]$NextRoles=@(),[string]$CorrectionRouting='',[string]$TerminalOutcome='',[string]$Evidence='fixture evidence')
    return [pscustomobject]@{next_state=$NextState;next_roles=@($NextRoles);correction_routing=$CorrectionRouting;terminal_outcome=$TerminalOutcome;rationale="Fixture routes to $NextState.";evidence=@($Evidence)}
}

function New-AgenticA4Fixture {
    param([string]$Name,[string]$InitialContent='v1')
    $root=Join-Path $script:AgenticRepoRoot ('.agentic-a4-'+$Name+'-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory((Join-Path $root 'src'))|Out-Null
    $path=Join-Path $root 'src/feature.txt';[IO.File]::WriteAllText($path,$InitialContent,[Text.UTF8Encoding]::new($false))
    $requestId='req-'+[guid]::NewGuid().ToString('N')
    $state=Get-AgenticStateTemplate;$state.request_id=$requestId;$state.goal_id=$requestId;$state.request_envelope_path="agentic/state/requests/$requestId.json";$state.request_envelope_sha256=('a'*64);$state.request_envelope_file_sha256=('b'*64);$state.branch="feature/$requestId";$state.work_branch=$state.branch;$state.base_branch='develop';$state.base_sha=('c'*40);$state.execution_id=[guid]::NewGuid().ToString('N');$state.max_agent_calls=80
    foreach($target in @('REQUEST_ACCEPTED','PREFLIGHT_PREPARING','PREFLIGHT_ANALYZING','BRANCH_PREPARED','ARCHITECTURE','DOR_VALIDATION','IMPLEMENTING')){Set-AgenticSupervisorTransition -State $state -To $target -PendingAction "Fixture checkpoint $target"|Out-Null}
    $envelope=[pscustomobject]@{schema_version=1;request_id=$requestId;received_at=[DateTimeOffset]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");target_repository=(Split-Path -Leaf $script:AgenticRepoRoot);request_type_hint='feature';user_requirement_verbatim='Complete the fixture acceptance behavior.';source='codex-desktop';content_sha256=''}
    $envelope.content_sha256=Get-AgenticRequestEnvelopeHash -Envelope $envelope
    $state.max_iterations=3
    return [pscustomobject]@{name=$Name;root=$root;state=$state;envelope=$envelope;path=$path;relative='src/feature.txt';observation_path=([IO.Path]::GetRelativePath($script:AgenticRepoRoot,$path).Replace('\','/'));old_snapshot=(Get-AgenticA4Snapshot -Path $path -RelativePath 'src/feature.txt');build=1;events=[Collections.Generic.List[string]]::new();old_approvals=$null}
}

function Get-AgenticA4Snapshot {
    param([string]$Path,[string]$RelativePath)
    $entry=[pscustomobject]@{path=$RelativePath;sha256=(Get-AgenticFileSha256 -Path $Path)}
    return Get-AgenticStableSnapshotSha256 -Snapshot @($entry)
}

function Add-AgenticA4Decision {
    param($Fixture,$Decision,[switch]$DoNotTransition)
    $script:a4DecisionRequest=[pscustomobject]@{scenario=$Fixture.name;current_state=[string]$Fixture.state.state;evidence=@($Decision.evidence);decision=$Decision}
    $script:a4ScenarioActive=$true;$script:a4Scenario=$Fixture.name
    $state=$Fixture.state
    $origin=[string]$state.state
    $resolved=Invoke-AgenticWorkflowDecision -State $state -Metadata @{} -Phase $origin -Context "Validated fixture evidence: $($Decision.evidence -join ', ')"
    if(-not $DoNotTransition){Set-AgenticSupervisorTransition -State $state -To ([string]$resolved.next_state) -PendingAction ([string]$resolved.rationale)|Out-Null}
    $Fixture.events.Add("${origin}:decision:$($resolved.next_state)")
    return $resolved
}

function New-AgenticA4RoleInvocation {
    param($Fixture,[string]$Role,[string]$Phase,[string]$Status,[string]$Snapshot)
    $state=$Fixture.state;$invocation=[guid]::NewGuid().ToString('N');$state.execution_id=$invocation
    $failure=if($Status -eq 'PASS'){$null}else{[pscustomobject]@{category='FIXTURE_FINDING';message="$Role fixture failure";operation=$Phase;retryable=$false}}
    $changed=if($Role -eq 'implementer'){@($Fixture.relative)}else{@()}
    $findings=[Collections.Generic.List[string]]::new();if($Status -ne 'PASS'){$findings.Add("$Role finding")}
    $evidence=[Collections.Generic.List[string]]::new();$evidence.Add("$Role evidence for $Snapshot")
    if($Role -eq 'tester' -and $Fixture.name -eq 'requirement-fail'){$evidence.Clear();$evidence.Add('AC-01: PASS - First criterion evidenced.');if($Fixture.build -gt 1){$evidence.Add('AC-02: PASS - Missing criterion implemented and evidenced.')}}
    $fileList=[Collections.Generic.List[string]]::new();foreach($file in $changed){$fileList.Add([string]$file)}
    $result=[pscustomobject]@{schema_version=1;goal_id=$state.goal_id;role=$Role;invocation_id=$invocation;phase=$Phase;snapshot_sha256=$Snapshot;status=$Status;summary="$Role $Status fixture";findings=$findings;evidence=$evidence;failure=$failure;files_changed=$fileList}
    if($Role -eq 'tester'){$result|Add-Member -NotePropertyName test_actions -NotePropertyValue @()}
    $validated=ConvertFrom-AgenticRoleResult -Json ($result|ConvertTo-Json -Compress -Depth 12) -State $state -ExpectedRole $Role -InvocationId $invocation -ExpectedPhase $Phase -SnapshotSha256 $Snapshot
    return [pscustomobject]@{ExitCode=0;Output='';Result=$validated;Role=$Role;InvocationId=$invocation;ArtifactPath="fixture/$invocation.json"}
}

function Invoke-AgenticA4FixtureRole {
    param($Fixture,[string]$Role,[string]$Phase)
    $snapshot=Get-AgenticA4Snapshot -Path $Fixture.path -RelativePath $Fixture.relative
    $status='PASS'
    if($script:a4StatusQueues.ContainsKey($Role) -and $script:a4StatusQueues[$Role].Count -gt 0){$status=$script:a4StatusQueues[$Role].Dequeue()}
    $Fixture.events.Add("$($Fixture.state.state):role:${Role}:$status`:$snapshot")
    $invocation=New-AgenticA4RoleInvocation -Fixture $Fixture -Role $Role -Phase $Phase -Status $status -Snapshot $snapshot
    if($Role -eq 'implementer' -and $status -eq 'PASS'){$Fixture.build++;[IO.File]::WriteAllText($Fixture.path,"v$($Fixture.build)",[Text.UTF8Encoding]::new($false));$Fixture.state.execution_snapshot_sha256=Get-AgenticA4Snapshot -Path $Fixture.path -RelativePath $Fixture.relative}
    return $invocation
}

function Invoke-AgenticA4FixtureDispatch {
    param($Fixture,$Decision,[string]$Phase,[scriptblock]$VerificationInvoker)
    $state=$Fixture.state;$state.agent_calls++;$state.execution_id=[guid]::NewGuid().ToString('N')
    return @(Invoke-AgenticWorkflowDispatcher -State $state -Decision $Decision -Phase $Phase -RoleInvoker {param($role,$rolePhase) Invoke-AgenticA4FixtureRole -Fixture $Fixture -Role $role -Phase $rolePhase} -ParallelInvoker {param($roles) foreach($role in $roles){Invoke-AgenticA4FixtureRole -Fixture $Fixture -Role $role -Phase 'REVIEWING'}} -VerificationInvoker $VerificationInvoker)
}

function Set-AgenticA4ApprovalFromDispatch {
    param($State,$Invocations)
    foreach($item in $Invocations){
        switch([string]$item.Role){
            'tester' {if($item.Result.status -eq 'PASS'){$State.tester_status='PASS';$State.tester_invocation_id=$item.InvocationId;$State.approved_snapshot_sha256=$item.Result.snapshot_sha256}}
            'reviewer' {if($item.Result.status -eq 'PASS'){$State.code_review_status='PASS';$State.reviewer_invocation_id=$item.InvocationId}}
            'security' {if($item.Result.status -eq 'PASS'){$State.security_review_status='PASS';$State.security_invocation_id=$item.InvocationId}}
        }
    }
}

function Invoke-AgenticA4DownstreamPass {
    param($Fixture,[switch]$StopAfterReviews)
    $state=$Fixture.state
    $toTester=Add-AgenticA4Decision -Fixture $Fixture -Decision (New-AgenticA4Decision -NextState 'TESTING' -NextRoles @('tester') -Evidence 'Implementer result PASS')
    $tester=Invoke-AgenticA4FixtureDispatch -Fixture $Fixture -Decision $toTester -Phase 'TESTING'
    if($tester.Count -ne 1 -or $tester[0].Result.status -ne 'PASS'){throw 'Fresh Tester evaluation did not PASS.'}
    Set-AgenticA4ApprovalFromDispatch -State $state -Invocations $tester
    if($StopAfterReviews){return [pscustomobject]@{tester=$tester[0];reviews=@();snapshot=$state.approved_snapshot_sha256}}
    $toReview=Add-AgenticA4Decision -Fixture $Fixture -Decision (New-AgenticA4Decision -NextState 'REVIEWING' -NextRoles @('reviewer','security') -Evidence 'Fresh Tester PASS')
    $reviews=Invoke-AgenticA4FixtureDispatch -Fixture $Fixture -Decision $toReview -Phase 'REVIEWING'
    if($reviews.Count -ne 2 -or @($reviews|Where-Object{$_.Result.status -ne 'PASS' -or $_.Result.snapshot_sha256 -cne $state.approved_snapshot_sha256}).Count -gt 0){throw 'Fresh Reviewer/Security evidence was not PASS on the new snapshot.'}
    Set-AgenticA4ApprovalFromDispatch -State $state -Invocations $reviews
    return [pscustomobject]@{tester=$tester[0];reviews=@($reviews);snapshot=$state.approved_snapshot_sha256}
}

function Invoke-AgenticA4Correction {
    param($Fixture,$FailureDecision,[string]$FailureText,[switch]$SkipDownstream)
    $state=$Fixture.state;$script:a4DecisionRequest=[pscustomobject]@{scenario=$Fixture.name;current_state='CORRECTING';evidence=@('correction bounded; downstream approvals invalidated');decision=(New-AgenticA4Decision -NextState 'IMPLEMENTING' -NextRoles @('implementer') -Evidence 'Correction bounded and downstream approvals invalidated.')};$script:a4ScenarioActive=$true;$script:a4Scenario=$Fixture.name;$next=Complete-AgenticAutonomousCorrection -State $state -Metadata @{} -Decision $FailureDecision -Failure $FailureText
    if($null -eq $next){return $null}
    $old=$Fixture.old_snapshot
    $implementer=Invoke-AgenticA4FixtureDispatch -Fixture $Fixture -Decision $next -Phase 'IMPLEMENTING'
    if($implementer.Count -ne 1 -or $implementer[0].Role -ne 'implementer' -or $implementer[0].Result.status -ne 'PASS'){throw 'Correction Dispatcher did not invoke Implementer.'}
    $new=Get-AgenticA4Snapshot -Path $Fixture.path -RelativePath $Fixture.relative
    if($new -ceq $old){throw 'Fixture-controlled implementation did not change the functional snapshot.'}
    $Fixture.events.Add("snapshot:$old->$new")
    $approvals=$null
    if(-not $SkipDownstream){$approvals=Invoke-AgenticA4DownstreamPass -Fixture $Fixture;if($approvals.snapshot -cne $new){throw 'Fresh downstream approvals do not bind to corrected snapshot.'}}
    return [pscustomobject]@{implementer=$implementer[0];approvals=$approvals;old_snapshot=$old;new_snapshot=$new}
}
