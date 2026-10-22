[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'agentic-common.ps1')

$passed=[Collections.Generic.List[string]]::new()
$canonicalDocs=@(1..7|ForEach-Object{Join-Path $script:AgenticRepoRoot ("docs/agentic/{0}-{1}.md" -f $_,@('architecture','execution-lifecycle','roles-and-handoffs','execution-specification','quality-model','git-and-branching','acceptance-tests')[$_-1])})
foreach($doc in $canonicalDocs){if(-not(Test-Path -LiteralPath $doc -PathType Leaf)){throw "Canonical v1.0 document missing: $doc"};$body=[IO.File]::ReadAllText($doc);if($body -notmatch '(?i)v1\.0' -or $body -notmatch '(?i)IMPLEMENTATION READY'){throw "Canonical v1.0 document is not marked implementation ready: $doc"}}
$passed.Add('AT-001 canonical v1.0 architecture document inventory')
$expected=@{
 IDLE=@('REQUEST_ACCEPTED'); REQUEST_ACCEPTED=@('PREFLIGHT_PREPARING','BLOCKED','FAILED')
 PREFLIGHT_PREPARING=@('PREFLIGHT_ANALYZING','BLOCKED','FAILED')
 PREFLIGHT_ANALYZING=@('ALREADY_SATISFIED','BRANCH_PREPARED','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 BRANCH_PREPARED=@('ARCHITECTURE','BLOCKED','WAITING_FOR_QUOTA','FAILED'); ARCHITECTURE=@('DOR_VALIDATION','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 DOR_VALIDATION=@('IMPLEMENTING','ARCHITECTURE','BLOCKED','WAITING_FOR_QUOTA','FAILED'); IMPLEMENTING=@('TESTING','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 TESTING=@('REVIEWING','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 REVIEWING=@('QUALITY_GATES','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 CORRECTING=@('IMPLEMENTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 QUALITY_GATES=@('OBSERVABILITY_VERIFICATION','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 OBSERVABILITY_VERIFICATION=@('REQUIREMENT_VERIFICATION','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 REQUIREMENT_VERIFICATION=@('SCOPE_DIFF_VERIFICATION','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 SCOPE_DIFF_VERIFICATION=@('READY_TO_COMMIT','CORRECTING','BLOCKED','WAITING_FOR_QUOTA','FAILED')
 READY_TO_COMMIT=@('READY_TO_PR','TESTING','WAITING_FOR_QUOTA','FAILED'); READY_TO_PR=@('WAITING_HUMAN_MERGE','WAITING_FOR_QUOTA','FAILED')
 WAITING_FOR_QUOTA=@('RESUMING','FAILED'); BLOCKED=@('RESUMING','FAILED')
 RESUMING=@('PREFLIGHT_PREPARING','PREFLIGHT_ANALYZING','BRANCH_PREPARED','ARCHITECTURE','DOR_VALIDATION','IMPLEMENTING','TESTING','REVIEWING','CORRECTING','QUALITY_GATES','OBSERVABILITY_VERIFICATION','REQUIREMENT_VERIFICATION','SCOPE_DIFF_VERIFICATION','READY_TO_COMMIT','READY_TO_PR','WAITING_FOR_QUOTA','BLOCKED','FAILED')
 WAITING_HUMAN_MERGE=@(); FAILED=@(); ALREADY_SATISFIED=@()
}
foreach($from in $expected.Keys){foreach($to in $expected[$from]){if(-not(Test-AgenticTransition $from $to)){throw "Canonical transition rejected: $from -> $to"}};foreach($to in $script:AgenticStates){if($to -notin $expected[$from] -and (Test-AgenticTransition $from $to)){throw "Unexpected transition accepted: $from -> $to"}}}
if((Test-AgenticTransition 'IMPLEMENTING' 'READY_TO_COMMIT') -or (Test-AgenticTransition 'CORRECTING' 'REVIEWING') -or (Test-AgenticTransition 'SECURITY_REVIEW' 'CODE_REVIEW')){throw 'Legacy/forbidden transition remains active.'}
$passed.Add('AT-040/041/042 state transition and terminal contract')
$temporaryQuota=Get-AgenticQuotaClassification -Text 'usage limit reached; retry after 21 minutes'
$weeklyQuota=Get-AgenticQuotaClassification -Text 'weekly usage limit reached'
if($temporaryQuota.Kind -cne 'QUOTA' -or $temporaryQuota.WaitMinutes -lt 21 -or $weeklyQuota.Kind -cne 'QUOTA' -or $weeklyQuota.WaitMinutes -lt 360 -or -not(Test-AgenticTransition 'PREFLIGHT_ANALYZING' 'WAITING_FOR_QUOTA') -or -not(Test-AgenticTransition 'WAITING_FOR_QUOTA' 'RESUMING')){throw 'Quota pause policy or lifecycle transition is incomplete.'}
$passed.Add('AT-082 quota pause policy and resume transition contract')
$id='req-0123456789abcdef0123456789abcdef'
$branchlessCheckpoint=[pscustomobject]@{state='BLOCKED';request_id=$id;request_envelope_path='agentic/state/requests/'+$id+'.json';request_envelope_sha256=('c'*64);goal_id=$id;branch=$null;base_branch='develop';pending_action='External preflight dependency';pending_phase='PREFLIGHT_ANALYZING'}
Assert-AgenticResumeCheckpoint -State $branchlessCheckpoint|Out-Null
$passed.Add('AT-083 preflight checkpoint may resume before branch preparation')

$envelope=[pscustomobject]@{schema_version=1;request_id=$id;received_at=[DateTimeOffset]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");target_repository=(Split-Path -Leaf $script:AgenticRepoRoot);request_type_hint='feature';user_requirement_verbatim='Add an observable control-plane capability.';source='codex-desktop';content_sha256=''}
$envelope.content_sha256=Get-AgenticRequestEnvelopeHash $envelope
Assert-AgenticRequestEnvelope $envelope | Out-Null
$bad=$envelope|ConvertTo-Json|ConvertFrom-Json;$bad.content_sha256='0'*64;$rejected=$false;try{Assert-AgenticRequestEnvelope $bad|Out-Null}catch{$rejected=$true};if(-not$rejected){throw 'Tampered Request Envelope was accepted.'}
$passed.Add('AT-004 Request Envelope identity, integrity and tamper rejection')

$pre=New-AgenticPreflightResultArtifact -Envelope $envelope -BaseBranch 'develop' -BaseSha ('a'*40) -InvocationId '0123456789abcdef0123456789abcdef' -Status 'SATISFIED' -Evidence @('Existing behavior satisfies AC-01.')
Assert-AgenticPreflightResultArtifact -Artifact $pre -Envelope $envelope -BaseBranch 'develop' -BaseSha ('a'*40)|Out-Null
$pre.status='NOT_SATISFIED';$preRejected=$false;try{Assert-AgenticPreflightResultArtifact $pre $envelope 'develop' ('a'*40)|Out-Null}catch{$preRejected=$true};if(-not$preRejected){throw 'Tampered preflight artifact was accepted.'}
$passed.Add('AT-005 Preflight Result identity and integrity')

$dor=1..10|ForEach-Object{[pscustomobject]@{id=('DOR-{0:D2}' -f $_);status='PASS';required=$true;rationale='Evidence recorded.'}}
$spec=[pscustomobject]@{dor=@($dor);complexity='TR';requirement='The original requirement';context='Repository control plane';architecture='Use existing layers';scope=@('scripts/agentic-loop.ps1');out_of_scope=@('Product changes');acceptance_criteria=@('AC-01: Request persists');dod=@('DOD-01: requirement verified');implementation_plan=@('Implement phases');test_strategy=@('unit: REQUIRED');security_requirements=@('Least privilege');observability_requirements=@('Sanitized evidence');dependencies=@('AVAILABLE: local host')}
Assert-AgenticDor $spec|Out-Null
$spec.dor[0].status='NOT_APPLICABLE';$spec.dor[0].required=$false;$spec.dor[0].rationale='No external dependency in this case.';Assert-AgenticDor $spec|Out-Null
$spec.dor[0].rationale='';$dorRejected=$false;try{Assert-AgenticDor $spec|Out-Null}catch{$dorRejected=$true};if(-not$dorRejected){throw 'N/A DOR without rationale was accepted.'}
$spec.dor[0].status='PASS';$spec.dor[0].required=$true;$spec.dor[0].rationale='Evidence recorded.'
$passed.Add('AT-006/088 Specification DOR PASS and justified N/A')

$identityState=[pscustomobject]@{goal_id=$id}
$roleResult=[pscustomobject]@{schema_version=1;goal_id=$id;role='reviewer';invocation_id='0123456789abcdef0123456789abcdef';phase='REVIEWING';snapshot_sha256=('c'*64);status='PASS';summary='Synthetic read-only review.';findings=@();evidence=@('same snapshot');failure=$null;files_changed=@()}
ConvertFrom-AgenticRoleResult -Json ($roleResult|ConvertTo-Json -Compress) -State $identityState -ExpectedRole 'reviewer' -InvocationId $roleResult.invocation_id -ExpectedPhase 'REVIEWING' -SnapshotSha256 ('c'*64)|Out-Null
$roleResult.invocation_id='1123456789abcdef0123456789abcdef';$identityRejected=$false;try{ConvertFrom-AgenticRoleResult -Json ($roleResult|ConvertTo-Json -Compress) -State $identityState -ExpectedRole 'reviewer' -InvocationId '0123456789abcdef0123456789abcdef' -ExpectedPhase 'REVIEWING' -SnapshotSha256 ('c'*64)|Out-Null}catch{$identityRejected=$true};if(-not$identityRejected){throw 'Mismatched role invocation was accepted.'}
$roleResult.invocation_id='0123456789abcdef0123456789abcdef';$snapshotRejected=$false;try{ConvertFrom-AgenticRoleResult -Json ($roleResult|ConvertTo-Json -Compress) -State $identityState -ExpectedRole 'reviewer' -InvocationId $roleResult.invocation_id -ExpectedPhase 'REVIEWING' -SnapshotSha256 ('d'*64)|Out-Null}catch{$snapshotRejected=$true};if(-not$snapshotRejected){throw 'Mismatched role snapshot was accepted.'}
$passed.Add('AT-043/044 role invocation identity and snapshot-bound result contract')
$safeFixture=ConvertTo-AgenticSanitizedText -Text 'password=synthetic-fixture-value-123';if($safeFixture -match 'synthetic-fixture-value-123'){throw 'Synthetic secret survived artifact sanitization.'}
$passed.Add('AT-046 secret sanitization fixture')

. (Join-Path $PSScriptRoot 'agentic-vnext-lifecycle.ps1')
. (Join-Path $PSScriptRoot 'agentic-a4-integration-fixtures.ps1')
$validDecision=[pscustomobject]@{next_state='ARCHITECTURE';next_roles=@('architect');correction_routing='';terminal_outcome='';rationale='Preflight requires specification.';evidence=@('preflight:fixture')}
Assert-AgenticOrchestratorDecision -Decision $validDecision -CurrentState 'BRANCH_PREPARED'|Out-Null
$extraDecision=$validDecision|Select-Object *;$extraDecision|Add-Member -NotePropertyName ignored -NotePropertyValue $true
$badDecisionRejected=$false;try{Assert-AgenticOrchestratorDecision -Decision $extraDecision -CurrentState 'BRANCH_PREPARED'|Out-Null}catch{$badDecisionRejected=$true};if(-not$badDecisionRejected){throw 'Orchestrator decision validator accepted an extra field.'}
$missingRoute=$validDecision|Select-Object *;$missingRoute.next_state='CORRECTING';$missingRoute.next_roles=@('implementer');$badDecisionRejected=$false;try{Assert-AgenticOrchestratorDecision -Decision $missingRoute -CurrentState 'TESTING'|Out-Null}catch{$badDecisionRejected=$true};if(-not$badDecisionRejected){throw 'Orchestrator decision validator accepted missing correction_routing.'}
$passed.Add('A1 canonical Orchestrator decision exact fields, required routing, lifecycle and evidence validation')
$stale=[pscustomobject]@{tester_status='PASS';tester_invocation_id='0123456789abcdef0123456789abcdef';code_review_status='PASS';reviewer_invocation_id='1123456789abcdef0123456789abcdef';security_review_status='PASS';security_invocation_id='2123456789abcdef0123456789abcdef';observability_status='PASS';requirement_status='PASS';scope_status='PASS';approved_snapshot_sha256=('c'*64);gate_results=@('old');quality_gate_snapshot=@('old');brokered_test_results=@('old')}
Reset-AgenticDownstreamApprovals -State $stale|Out-Null
if($stale.tester_status -ne 'PENDING' -or $stale.code_review_status -ne 'PENDING' -or $stale.security_review_status -ne 'PENDING' -or $stale.approved_snapshot_sha256 -or $stale.gate_results.Count -ne 0 -or $stale.tester_invocation_id -or $stale.reviewer_invocation_id -or $stale.security_invocation_id){throw 'Functional correction did not invalidate every downstream approval.'}
$passed.Add('AT-073/074/075 correction invalidates Tester, Reviewer, Security and downstream evidence')

# AT-090: the supervisor supplies evidence, not a predetermined destination.
$script:fixtureDecisionNext='ARCHITECTURE'
$script:fixtureDecisionRoles=@('architect')
$script:fixtureDecisionQueue=$null
function Write-AgenticState { param($State) }
function Add-AgenticRoleInvocationEvidence { param($State,$Invocation,$Metadata) }
function Invoke-CodexAgentRole {
    param($State,$GoalPath,$Role,$Phase,$InvocationId,$Mode,$ExecutionRoot,$AdditionalContext)
    if($AdditionalContext -match 'Expected next_state='){throw 'Supervisor supplied a fixed semantic destination.'}
    if($Role -eq 'orchestrator' -and $null -ne $script:a4DecisionRequest){
        $request=$script:a4DecisionRequest;$script:a4DecisionRequest=$null
        if([string]$request.current_state -cne [string]$State.state){throw "A4 fixture '$($request.scenario)' decision request state mismatch: expected $($request.current_state), received $($State.state)."}
        $decision=$request.decision
        if(-not(Test-AgenticTransition -From ([string]$State.state) -To ([string]$decision.next_state))){throw "A4 fixture '$($request.scenario)' requested illegal decision: $($State.state) -> $($decision.next_state); evidence=$($request.evidence -join '; ')."}
        return [pscustomobject]@{ExitCode=0;Output='';Result=[pscustomobject]@{status='PASS';decision=$decision}}
    }
    if($Role -eq 'orchestrator' -and $script:a4ScenarioActive){throw "A4 fixture unexpected decision request: scenario=$script:a4Scenario; current_state=$($State.state); phase=$Phase; no explicit evidence-bound decision was registered."}
    if($Role -eq 'orchestrator' -and $script:fixtureDecisionQueue -and $script:fixtureDecisionQueue.Count -gt 0){$d=$script:fixtureDecisionQueue[0];$script:fixtureDecisionQueue.RemoveAt(0);return [pscustomobject]@{ExitCode=0;Output='';Result=[pscustomobject]@{status='PASS';decision=$d}}}
    $d=[pscustomobject]@{next_state=$script:fixtureDecisionNext;next_roles=@($script:fixtureDecisionRoles);correction_routing='';terminal_outcome='';rationale='Fixture evidence supports the selected action.';evidence=@('synthetic role evidence')}
    return [pscustomobject]@{ExitCode=0;Output='';Result=[pscustomobject]@{status='PASS';decision=$d}}
}
$script:fixtureDecisionQueue=[Collections.Generic.List[object]]::new()
$script:a4Trace=[Collections.Generic.List[string]]::new()
$script:a4ExpectedDecision=$null
$script:a4DecisionRequest=$null
$script:a4ScenarioActive=$false
$script:a4Scenario=''
$orchestratorState=[pscustomobject]@{agent_calls=0;max_agent_calls=10;active_agent=$null;execution_id=$null;state='DOR_VALIDATION';request_envelope_path='agentic/state/requests/fixture.json';goal_id=$id}
$decisionA=Invoke-AgenticWorkflowDecision -State $orchestratorState -Metadata @{} -Phase 'DOR_VALIDATION' -Context 'DOR evidence incomplete; Architect must revise Specification.'
if($decisionA.next_state -cne 'ARCHITECTURE' -or 'architect' -notin $decisionA.next_roles){throw 'Orchestrator did not select a next action from supplied evidence.'}
$script:fixtureDecisionNext='IMPLEMENTING';$orchestratorState.state='DOR_VALIDATION'
$decisionB=Invoke-AgenticWorkflowDecision -State $orchestratorState -Metadata @{} -Phase 'DOR_VALIDATION' -Context 'Validated DOR PASS evidence is complete.'
if($decisionB.next_state -cne 'IMPLEMENTING'){throw 'Orchestrator did not choose a different legal action when evidence changed.'}
$script:fixtureDecisionNext='READY_TO_COMMIT';$orchestratorState.state='IMPLEMENTING';$illegalRejected=$false
try{Invoke-AgenticWorkflowDecision -State $orchestratorState -Metadata @{} -Phase 'IMPLEMENTING' -Context 'No Tester evidence.'|Out-Null}catch{$illegalRejected=$true}
if(-not$illegalRejected){throw 'Supervisor accepted illegal Orchestrator transition.'}
$passed.Add('AT-090 Orchestrator independently selects different actions from evidence; Supervisor rejects illegal proposal')
$dispatchState=[pscustomobject]@{state='IMPLEMENTING'};$script:dispatchSeen=@()
$dispatchRole={param($role,$phase) $script:dispatchSeen+=@("${role}:$phase");[pscustomobject]@{role=$role}}
$dispatchParallel={param($roles) $script:dispatchSeen+=@('parallel:'+($roles -join '+'));[pscustomobject]@{roles=$roles}}
$decisionTester=[pscustomobject]@{next_state='TESTING';next_roles=@('tester');correction_routing='';terminal_outcome='';rationale='QA is next.';evidence=@('impl:fixture')}
Invoke-AgenticWorkflowDispatcher -State $dispatchState -Decision $decisionTester -Phase 'TESTING' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null
$decisionReviews=[pscustomobject]@{next_state='REVIEWING';next_roles=@('reviewer','security');correction_routing='';terminal_outcome='';rationale='Independent review follows QA.';evidence=@('tester:fixture')}
$dispatchState.state='TESTING';Invoke-AgenticWorkflowDispatcher -State $dispatchState -Decision $decisionReviews -Phase 'REVIEWING' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null
if($script:dispatchSeen.Count -ne 2 -or $script:dispatchSeen[0] -cne 'tester:TESTING' -or $script:dispatchSeen[1] -cne 'parallel:reviewer+security'){throw 'Dispatcher did not route next_roles to the expected primitives.'}
$dispatchState.state='QUALITY_GATES';$verificationDispatch=[pscustomobject]@{next_state='OBSERVABILITY_VERIFICATION';next_roles=@();correction_routing='';terminal_outcome='';rationale='Required gates passed.';evidence=@('gates:pass')}
$verificationDispatched=@(Invoke-AgenticWorkflowDispatcher -State $dispatchState -Decision $verificationDispatch -Phase 'OBSERVABILITY_VERIFICATION' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel -VerificationInvoker {param($type) "verify:$type"})
if($verificationDispatched.Count -ne 1 -or $verificationDispatched[0] -cne 'verify:OBSERVABILITY_VERIFICATION'){throw 'Dispatcher did not execute the selected verification action.'}
$dispatchState.state='TESTING';$correction=[pscustomobject]@{next_state='CORRECTING';next_roles=@('implementer');correction_routing='implementer';terminal_outcome='';rationale='Tester finding requires implementation.';evidence=@('tester:fail')}
Invoke-AgenticWorkflowDispatcher -State $dispatchState -Decision $correction -Phase 'CORRECTING' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null
if($script:dispatchSeen[-1] -cne 'implementer:CORRECTING'){throw 'correction_routing was not consumed by Dispatcher.'}
$dispatchState.state='PREFLIGHT_ANALYZING';$terminal=[pscustomobject]@{next_state='ALREADY_SATISFIED';next_roles=@();correction_routing='';terminal_outcome='ALREADY_SATISFIED';rationale='Architect evidence confirms completion.';evidence=@('preflight:pass')}
$beforeTerminal=$script:dispatchSeen.Count;Invoke-AgenticWorkflowDispatcher -State $dispatchState -Decision $terminal -Phase 'PREFLIGHT_ANALYZING' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null
if($script:dispatchSeen.Count -ne $beforeTerminal){throw 'Terminal decision dispatched an additional role.'}
$badRole=$decisionTester|Select-Object *;$badRole.next_roles=@('unknown');$badRejected=$false;try{Invoke-AgenticWorkflowDispatcher -State ([pscustomobject]@{state='IMPLEMENTING'}) -Decision $badRole -Phase 'TESTING' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null}catch{$badRejected=$true};if(-not$badRejected){throw 'Dispatcher accepted an unknown role.'}
$illegalStateRejected=$false;try{Invoke-AgenticWorkflowDispatcher -State ([pscustomobject]@{state='IMPLEMENTING'}) -Decision ([pscustomobject]@{next_state='READY_TO_COMMIT';next_roles=@();correction_routing='';terminal_outcome='';rationale='Invalid direct jump.';evidence=@('none')}) -Phase 'READY_TO_COMMIT' -RoleInvoker $dispatchRole -ParallelInvoker $dispatchParallel|Out-Null}catch{$illegalStateRejected=$true};if(-not$illegalStateRejected){throw 'Dispatcher accepted an illegal transition.'}
$passed.Add('A2 decision-driven dispatcher role, parallel review, correction, terminal, unknown-role and transition fixtures')

# A4 deterministic integrated correction fixtures: production decision, transition, dispatcher,
# approval invalidation, verification engine and bounded correction primitives remain in the path.
$originalA4Root=$script:AgenticRepoRoot
$script:fixtureDecisionQueue=[Collections.Generic.List[object]]::new()
$script:a4StatusQueues=@{}
try {
    $script:AgenticRepoRoot=Join-Path $originalA4Root ('.agentic-a4-fixtures-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($script:AgenticRepoRoot)|Out-Null

    # Tester FAIL -> Orchestrator -> CORRECTING -> dispatcher Implementer -> fresh Tester/reviews.
    $a41=New-AgenticA4Fixture -Name 'tester-fail';$script:a4StatusQueues=@{tester=[Collections.Generic.Queue[string]]::new();reviewer=[Collections.Generic.Queue[string]]::new();security=[Collections.Generic.Queue[string]]::new()}
    $script:a4StatusQueues.tester.Enqueue('FAIL')
    $d=Add-AgenticA4Decision $a41 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Implementer PASS')
    $inv=@(Invoke-AgenticA4FixtureDispatch $a41 $d 'TESTING')
    if($inv.Count -ne 1 -or $inv[0].Role -cne 'tester' -or $inv[0].Result.status -cne 'FAIL'){throw 'A4.1 did not obtain validated Tester FAIL through Dispatcher.'}
    $a41.state.tester_status='FAIL';$a41.state.tester_invocation_id=$inv[0].InvocationId
    $d=Add-AgenticA4Decision $a41 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Tester FAIL artifact') -DoNotTransition
    if($a41.state.branch -cne "feature/$($a41.state.request_id)"){throw 'A4.1 request branch changed before correction.'}
    $a41.state.max_iterations=3
    $a41Correction=Invoke-AgenticA4Correction $a41 $d 'Tester found functional failures.'
    if($a41.state.iteration -ne 1 -or $a41.state.state -cne 'REVIEWING' -or $a41Correction.old_snapshot -ceq $a41Correction.new_snapshot -or $a41Correction.approvals.reviews.Count -ne 2){throw 'A4.1 correction did not complete a fresh downstream cycle.'}
    if($a41.state.request_id -cne $a41.envelope.request_id -or $a41.state.branch -cne "feature/$($a41.state.request_id)"){throw 'A4.1 request or branch identity changed.'}
    if(@($a41.events|Where-Object{$_ -match 'resume_request|RESUMING|agentic-resume\.ps1'}).Count -gt 0){throw 'A4.1 internal correction used resume flow.'}
    if($a41.state.tester_invocation_id -ceq $inv[0].InvocationId -or $a41.state.tester_status -cne 'PASS' -or $a41.state.code_review_status -cne 'PASS' -or $a41.state.security_review_status -cne 'PASS'){throw 'A4.1 retained old failure or missed fresh approvals.'}
    $passed.Add('A4.1 integrated Tester FAIL correction, changed snapshot, invalidation and fresh Tester/Reviewer/Security evidence')

    # Reviewer FAIL while Security PASS remains independent; both approvals must be refreshed.
    $a42=New-AgenticA4Fixture -Name 'reviewer-fail';$script:a4StatusQueues=@{tester=[Collections.Generic.Queue[string]]::new();reviewer=[Collections.Generic.Queue[string]]::new();security=[Collections.Generic.Queue[string]]::new()};$script:a4StatusQueues.reviewer.Enqueue('FAIL')
    $d=Add-AgenticA4Decision $a42 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Implementer PASS');$freshTester=Invoke-AgenticA4FixtureDispatch $a42 $d 'TESTING';Set-AgenticA4ApprovalFromDispatch $a42.state $freshTester
    $d=Add-AgenticA4Decision $a42 (New-AgenticA4Decision 'REVIEWING' @('reviewer','security') -Evidence 'Tester PASS');$oldReviews=Invoke-AgenticA4FixtureDispatch $a42 $d 'REVIEWING'
    if($oldReviews.Count -ne 2 -or $oldReviews[0].Result.snapshot_sha256 -cne $oldReviews[1].Result.snapshot_sha256 -or @($oldReviews|Where-Object{$_.Result.status -eq 'FAIL'}).Count -ne 1){throw 'A4.2 reviewer/security outcomes were not independent on a shared snapshot.'}
    $a42.state.code_review_status='FAIL';$a42.state.reviewer_invocation_id=($oldReviews|Where-Object{$_.Role -eq 'reviewer'}).InvocationId;$a42.state.security_review_status='PASS';$a42.state.security_invocation_id=($oldReviews|Where-Object{$_.Role -eq 'security'}).InvocationId;$a42.state.tester_status='PASS';$a42.state.tester_invocation_id=$freshTester[0].InvocationId;$a42.state.approved_snapshot_sha256=$freshTester[0].Result.snapshot_sha256
    $d=Add-AgenticA4Decision $a42 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Reviewer FAIL; Security PASS') -DoNotTransition
    $a42Correction=Invoke-AgenticA4Correction $a42 $d 'Reviewer reported findings.'
    if($a42.state.iteration -ne 1 -or $a42.state.tester_invocation_id -ceq $freshTester[0].InvocationId -or $a42.state.reviewer_invocation_id -ceq [string]($oldReviews|Where-Object{$_.Role -eq 'reviewer'}).InvocationId -or $a42.state.security_invocation_id -ceq [string]($oldReviews|Where-Object{$_.Role -eq 'security'}).InvocationId){throw 'A4.2 correction reused Tester or review approvals.'}
    $passed.Add('A4.2 integrated Reviewer FAIL/Security PASS independent outcomes and full fresh downstream cycle')

    # Security FAIL while Reviewer PASS is symmetric and also invalidates the Reviewer approval.
    $a43=New-AgenticA4Fixture -Name 'security-fail';$script:a4StatusQueues=@{tester=[Collections.Generic.Queue[string]]::new();reviewer=[Collections.Generic.Queue[string]]::new();security=[Collections.Generic.Queue[string]]::new()};$script:a4StatusQueues.security.Enqueue('FAIL')
    $d=Add-AgenticA4Decision $a43 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Implementer PASS');$freshTester=Invoke-AgenticA4FixtureDispatch $a43 $d 'TESTING';Set-AgenticA4ApprovalFromDispatch $a43.state $freshTester
    $d=Add-AgenticA4Decision $a43 (New-AgenticA4Decision 'REVIEWING' @('reviewer','security') -Evidence 'Tester PASS');$oldReviews=Invoke-AgenticA4FixtureDispatch $a43 $d 'REVIEWING'
    if($oldReviews.Count -ne 2 -or @($oldReviews|Where-Object{$_.Result.status -eq 'FAIL'}).Count -ne 1){throw 'A4.3 Security FAIL was not evaluated independently.'}
    $a43.state.code_review_status='PASS';$a43.state.reviewer_invocation_id=($oldReviews|Where-Object{$_.Role -eq 'reviewer'}).InvocationId;$a43.state.security_review_status='FAIL';$a43.state.security_invocation_id=($oldReviews|Where-Object{$_.Role -eq 'security'}).InvocationId;$a43.state.tester_status='PASS';$a43.state.tester_invocation_id=$freshTester[0].InvocationId;$a43.state.approved_snapshot_sha256=$freshTester[0].Result.snapshot_sha256
    $d=Add-AgenticA4Decision $a43 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Security FAIL; Reviewer PASS') -DoNotTransition
    $a43Correction=Invoke-AgenticA4Correction $a43 $d 'Security reported findings.'
    if($a43.state.iteration -ne 1 -or $a43.state.tester_invocation_id -ceq $freshTester[0].InvocationId -or $a43.state.reviewer_invocation_id -ceq [string]($oldReviews|Where-Object{$_.Role -eq 'reviewer'}).InvocationId -or $a43.state.security_invocation_id -ceq [string]($oldReviews|Where-Object{$_.Role -eq 'security'}).InvocationId){throw 'A4.3 retained old approvals after Security correction.'}
    $passed.Add('A4.3 integrated Security FAIL/Reviewer PASS and full fresh downstream cycle')

    # Real Requirement Verification FAIL artifact routes through Orchestrator and Dispatcher correction.
    $a44=New-AgenticA4Fixture -Name 'requirement-fail' -InitialContent 'diagnostic fixture';$script:a4StatusQueues=@{tester=[Collections.Generic.Queue[string]]::new();reviewer=[Collections.Generic.Queue[string]]::new();security=[Collections.Generic.Queue[string]]::new()}
    $script:fixtureDecisionQueue.Clear()
    $script:a4Trace.Clear()
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Implementer PASS');$tester=Invoke-AgenticA4FixtureDispatch $a44 $d 'TESTING';$tester[0].Result.evidence=[Collections.Generic.List[string]]::new();$tester[0].Result.evidence.Add('AC-01: PASS - Implements first criterion.');Set-AgenticA4ApprovalFromDispatch $a44.state $tester;$a44.state.approved_snapshot_sha256=$tester[0].Result.snapshot_sha256;$a44.state.execution_snapshot_sha256=$a44.state.approved_snapshot_sha256
    try{$d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'REVIEWING' @('reviewer','security') -Evidence 'Tester PASS');$reviews=Invoke-AgenticA4FixtureDispatch $a44 $d 'REVIEWING';Set-AgenticA4ApprovalFromDispatch $a44.state $reviews}catch{Write-Output ('A4TRACE '+($script:a4Trace -join ';'));throw}
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'QUALITY_GATES' -Evidence 'Tester, Reviewer and Security PASS');$a44.state.gate_results=@([pscustomobject]@{status='PASS';snapshot_sha256=$a44.state.approved_snapshot_sha256})
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'OBSERVABILITY_VERIFICATION' -Evidence 'Required gates PASS')
    $obs=Invoke-AgenticA4FixtureDispatch $a44 $d 'OBSERVABILITY_VERIFICATION' {param($type) Invoke-AgenticObservabilityVerification -State $a44.state -InvocationId ([guid]::NewGuid().ToString('N')) -Paths @($a44.observation_path)}
    if($obs[0].artifact.status -ne 'PASS'){throw 'A4.4 observability did not pass.'};$a44.state.observability_status='PASS';$a44.state.observability_verification_path=$obs[0].path
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'REQUIREMENT_VERIFICATION' -Evidence 'Observability PASS')
    $req=Invoke-AgenticA4FixtureDispatch $a44 $d 'REQUIREMENT_VERIFICATION' {param($type) Invoke-AgenticRequirementVerification -State $a44.state -InvocationId ([guid]::NewGuid().ToString('N')) -AcceptanceCriteria @('AC-01: First','AC-02: Missing proof') -DodCriteria @() -TesterEvidence @([pscustomobject]@{criterion_id='AC-01';status='PASS';evidence='First criterion fixture proof.'}) -Envelope $a44.envelope}
    if($req[0].artifact.status -ne 'FAIL' -or @($req[0].artifact.findings|Where-Object{$_ -match 'AC-02'}).Count -ne 1){throw 'A4.4 missing acceptance criterion did not produce a real Requirement Verification FAIL artifact.'}
    $a44.state.requirement_status='FAIL';$a44.state.requirement_verification_path=$req[0].path
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Requirement Verification FAIL artifact') -DoNotTransition
    $oldTesterId=$a44.state.tester_invocation_id;$oldReviewerId=$a44.state.reviewer_invocation_id;$oldSecurityId=$a44.state.security_invocation_id;$oldVerificationPath=$a44.state.requirement_verification_path;$oldSnapshot=$a44.state.approved_snapshot_sha256
    $initialReadyRejected=$false;try{Test-AgenticReadiness -State $a44.state -Metadata @{} -CurrentBranch $a44.state.branch -ChangedPaths @($a44.relative)|Out-Null}catch{$initialReadyRejected=$true}
    if(-not $initialReadyRejected -or (Test-AgenticTransition -From 'REQUIREMENT_VERIFICATION' -To 'READY_TO_COMMIT')){throw 'A4.4 initial missing-AC snapshot could reach READY_TO_COMMIT.'}
    $a44Correction=Invoke-AgenticA4Correction $a44 $d 'Missing AC-02 implementation proof.'
    if($a44Correction.approvals.reviews.Count -ne 2 -or $a44.state.requirement_status -ne 'PENDING' -or $a44.state.state -cne 'REVIEWING' -or $a44Correction.new_snapshot -ceq $oldSnapshot){throw 'A4.4 correction did not reach fresh review on a changed snapshot.'}
    if($a44.state.tester_invocation_id -ceq $oldTesterId -or $a44.state.reviewer_invocation_id -ceq $oldReviewerId -or $a44.state.security_invocation_id -ceq $oldSecurityId -or $a44.state.requirement_verification_path -or $a44.state.observability_verification_path -or $a44.state.scope_verification_path){throw 'A4.4 correction retained an old approval or verification artifact reference.'}
    if(@($a44.events|Where-Object{$_ -match 'RESUMING|resume_request|agentic-resume\.ps1'}).Count -gt 0){throw 'A4.4 correction used resume flow.'}

    # Continue the corrected snapshot through quality gates and every production verification primitive.
    $metadata=@{ID=$a44.state.request_id;Title='A4.4 corrected acceptance';'Base branch'='develop';'Branch prefix'='feature';'Allowed files'=$a44.relative}
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'QUALITY_GATES' -Evidence 'Corrected Tester, Reviewer and Security PASS')
    $a44.state.change_classification=Get-AgenticChangeClassification -Paths @($a44.relative)
    $policy=Get-AgenticGatePolicy -Classification $a44.state.change_classification -TypecheckStatus 'NOT_APPLICABLE' -RuntimeTestsStatus 'NOT_APPLICABLE' -Paths @($a44.relative)
    $a44.state.required_gates=@($policy.Required);$a44.state.skipped_gates=@($policy.Skipped);$a44.state.quality_gate_snapshot=@(Get-AgenticCommitSnapshot -Paths @($a44.relative))
    foreach($gate in $policy.Required){Set-AgenticGateResult -State $a44.state -Name $gate -Status 'PASS' -Command 'A4.4 deterministic gate evidence' -ExitCode 0 -EvidenceSummary "PASS bound to corrected snapshot $($a44Correction.new_snapshot)"|Out-Null}
    foreach($skip in $policy.Skipped){Set-AgenticGateResult -State $a44.state -Name $skip.name -Status 'NOT_APPLICABLE' -Reason $skip.reason -EvidenceSummary "Policy skip for fixture scope; evaluation snapshot=$($a44Correction.new_snapshot)"|Out-Null}
    $badRequired=@(foreach($gateName in $policy.Required){$record=@($a44.state.gate_results|Where-Object{$_.name -ceq $gateName}|Select-Object -Last 1);if($record.Count -ne 1 -or $record[0].status -cne 'PASS' -or $record[0].evidence_summary -notmatch [regex]::Escape($a44Correction.new_snapshot)){[pscustomobject]@{name=$gateName;status=$(if($record.Count){$record[0].status}else{'MISSING'});evidence=$(if($record.Count){$record[0].evidence_summary}else{''})}}})
    $badSkipped=@(foreach($skip in $policy.Skipped){$record=@($a44.state.gate_results|Where-Object{$_.name -ceq $skip.name}|Select-Object -Last 1);if($record.Count -ne 1 -or $record[0].status -cne 'NOT_APPLICABLE' -or [string]::IsNullOrWhiteSpace([string]$record[0].reason) -or [string]$record[0].reason -cne [string]$skip.reason -or $record[0].evidence_summary -notmatch [regex]::Escape($a44Correction.new_snapshot)){[pscustomobject]@{name=$skip.name;status=$(if($record.Count){$record[0].status}else{'MISSING'});reason=$(if($record.Count){$record[0].reason}else{''});evidence=$(if($record.Count){$record[0].evidence_summary}else{''})}}})
    if($badRequired.Count -gt 0 -or $badSkipped.Count -gt 0){throw "A4.4 policy-bound gate assertion failed. Required=$($badRequired|ConvertTo-Json -Compress -Depth 5); skipped=$($badSkipped|ConvertTo-Json -Compress -Depth 5)."}
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'OBSERVABILITY_VERIFICATION' -Evidence 'Corrected snapshot gates PASS')
    $obs2=Invoke-AgenticA4FixtureDispatch $a44 $d 'OBSERVABILITY_VERIFICATION' {param($type) Invoke-AgenticObservabilityVerification -State $a44.state -InvocationId ([guid]::NewGuid().ToString('N')) -Paths @($a44.observation_path)}
    if($obs2[0].artifact.status -ne 'PASS' -or $obs2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot){throw 'A4.4 corrected observability evidence did not PASS on the corrected snapshot.'};$a44.state.observability_status='PASS';$a44.state.observability_verification_path=$obs2[0].path
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'REQUIREMENT_VERIFICATION' -Evidence 'Corrected observability artifact PASS')
    $correctedTesterEvidence=@($a44Correction.approvals.tester.Result.evidence|ForEach-Object{if([regex]::Match([string]$_,'^(?<id>AC-[A-Za-z0-9._-]+): PASS - (?<proof>.+)$').Success){$match=[regex]::Match([string]$_,'^(?<id>AC-[A-Za-z0-9._-]+): PASS - (?<proof>.+)$');[pscustomobject]@{criterion_id=$match.Groups['id'].Value;status='PASS';evidence=$match.Groups['proof'].Value}}})
    $req2=Invoke-AgenticA4FixtureDispatch $a44 $d 'REQUIREMENT_VERIFICATION' {param($type) Invoke-AgenticRequirementVerification -State $a44.state -InvocationId ([guid]::NewGuid().ToString('N')) -AcceptanceCriteria @('AC-01: First','AC-02: Corrected proof') -DodCriteria @() -TesterEvidence $correctedTesterEvidence -Envelope $a44.envelope}
    if($req2[0].artifact.status -ne 'PASS' -or $req2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot){throw 'A4.4 corrected Requirement Verification did not PASS on corrected Tester evidence.'};$a44.state.requirement_status='PASS';$a44.state.requirement_verification_path=$req2[0].path
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'SCOPE_DIFF_VERIFICATION' -Evidence 'Corrected Requirement Verification PASS')
    $correctedSnapshotEntries=@(Get-AgenticCommitSnapshot -Paths @($a44.relative));$correctedSnapshotHash=Get-AgenticStableSnapshotSha256 -Snapshot $correctedSnapshotEntries
    $scope2=Invoke-AgenticA4FixtureDispatch $a44 $d 'SCOPE_DIFF_VERIFICATION' {param($type) Invoke-AgenticScopeVerification -State $a44.state -InvocationId ([guid]::NewGuid().ToString('N')) -ActualPaths @($a44.relative) -ApprovedPaths @($a44.relative) -ActualSnapshotSha256 $correctedSnapshotHash}
    if($scope2[0].artifact.status -ne 'PASS' -or $scope2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot){throw 'A4.4 corrected Scope/Diff evidence did not PASS on corrected snapshot.'};$a44.state.scope_status='PASS';$a44.state.scope_verification_path=$scope2[0].path
    $d=Add-AgenticA4Decision $a44 (New-AgenticA4Decision 'READY_TO_COMMIT' -Evidence 'All corrected snapshot verifications PASS')
    Set-AgenticSupervisorTransition -State $a44.state -To 'READY_TO_COMMIT' -PendingAction 'Corrected A4.4 evidence complete'|Out-Null

    # Populate the real readiness validator's immutable inputs and role-result provenance.
    $requestRel=$a44.state.request_envelope_path;$requestFull=Join-Path $script:AgenticRepoRoot $requestRel;[IO.Directory]::CreateDirectory((Split-Path -Parent $requestFull))|Out-Null
    [IO.File]::WriteAllText($requestFull,(ConvertTo-Json -InputObject $a44.envelope -Depth 8)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false));$a44.state.request_envelope_sha256=$a44.envelope.content_sha256
    $baseLines=@(Invoke-AgenticGit -GitArguments @('rev-parse','HEAD'));$a44.state.base_sha=([string]$baseLines[0]).Trim()
    $pre=New-AgenticPreflightResultArtifact -Envelope $a44.envelope -BaseBranch 'develop' -BaseSha $a44.state.base_sha -InvocationId ([guid]::NewGuid().ToString('N')) -Status 'NOT_SATISFIED' -Evidence @('fixture requirement not already satisfied')
    $a44.state.preflight_result_path="agentic/state/preflight/$($a44.state.request_id).json";$preSaved=Write-AgenticImmutableJsonArtifact -RelativePath $a44.state.preflight_result_path -Value $pre;$a44.state.preflight_result_sha256=$preSaved.Sha256
    $a44.state.specification_path="agentic/specifications/$($a44.state.request_id).md";$specFull=Join-Path $script:AgenticRepoRoot $a44.state.specification_path;[IO.Directory]::CreateDirectory((Split-Path -Parent $specFull))|Out-Null;[IO.File]::WriteAllText($specFull,'# A4.4 corrected acceptance specification',[Text.UTF8Encoding]::new($false));$a44.state.specification_sha256=Get-AgenticFileSha256 $specFull
    $a44.state.allowed_functional_files=@($a44.relative);$a44.state.change_classification=Get-AgenticChangeClassification -Paths @($a44.relative)
    $a44.state.role_invocations=@();foreach($invocation in @($a44Correction.approvals.tester)+@($a44Correction.approvals.reviews)){$artifactRel="agentic/state/results/$($a44.state.request_id)/$($invocation.InvocationId).json";$saved=Write-AgenticImmutableJsonArtifact -RelativePath $artifactRel -Value $invocation.Result;$a44.state.role_invocations+=@([pscustomobject]@{role=$invocation.Role;status=$invocation.Result.status;exit_code=0;invocation_id=$invocation.InvocationId;snapshot_sha256=$invocation.Result.snapshot_sha256;command_fingerprint=('f'*64);result_artifact_path=$artifactRel;result_artifact_sha256=$saved.Sha256})}
    $a44.state.tester_status='PASS';$a44.state.code_review_status='PASS';$a44.state.security_review_status='PASS'
    $journal=New-AgenticJournalHeader -GoalId $a44.state.goal_id -Branch $a44.state.branch -BaseBranch 'develop'
    $journal+="`n## 2026-10-22T00:00:00Z - $($a44.state.goal_id) - iteracao 1`n- state: IMPLEMENTING`n- controller: supervisor`n- actor: supervisor`n- delegated_agent: implementer`n- action: delegate implementation`n- files_changed: src/feature.txt`n- result: PASS`n"
    $journal+="`n## 2026-10-22T00:00:01Z - $($a44.state.goal_id) - iteracao 1`n- state: IMPLEMENTING`n- controller: supervisor`n- actor: implementer`n- delegated_agent: n/a`n- action: implemented corrected AC-02`n- files_changed: src/feature.txt`n- result: PASS`n"
    $readiness=Test-AgenticReadiness -State $a44.state -Metadata $metadata -CurrentBranch $a44.state.branch -ChangedPaths @($a44.relative) -JournalText $journal
    if(-not $readiness -or $a44.state.state -cne 'READY_TO_COMMIT' -or $obs2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot -or $req2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot -or $scope2[0].artifact.snapshot_sha256 -cne $a44Correction.new_snapshot){throw 'A4.4 actual readiness or corrected snapshot evidence validation failed.'}
    $passed.Add('A4.4 actual missing-AC FAIL, autonomous correction, full fresh gates/verifications and production Test-AgenticReadiness PASS')

    # Deterministic Reviewer FAIL repeats through legal phases and hits the production iteration bound.
    $a45=New-AgenticA4Fixture -Name 'bounded-loop';$a45.state.max_iterations=1;$script:a4StatusQueues=@{tester=[Collections.Generic.Queue[string]]::new();reviewer=[Collections.Generic.Queue[string]]::new();security=[Collections.Generic.Queue[string]]::new()};$script:a4StatusQueues.reviewer.Enqueue('FAIL')
    $initialSnapshot=$a45.old_snapshot
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Initial implementation snapshot ready');$t1=Invoke-AgenticA4FixtureDispatch $a45 $d 'TESTING';Set-AgenticA4ApprovalFromDispatch $a45.state $t1
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'REVIEWING' @('reviewer','security') -Evidence 'Tester PASS bound to initial snapshot');$r1=Invoke-AgenticA4FixtureDispatch $a45 $d 'REVIEWING';if(@($r1|Where-Object{$_.Role -eq 'reviewer' -and $_.Result.status -eq 'FAIL'}).Count -ne 1){throw 'A4.5 first Reviewer failure was not returned by the validated role adapter.'}
    $a45.state.code_review_status='FAIL';$a45.state.reviewer_invocation_id=($r1|Where-Object{$_.Role -eq 'reviewer'}).InvocationId;$a45.state.security_review_status='PASS';$a45.state.security_invocation_id=($r1|Where-Object{$_.Role -eq 'security'}).InvocationId
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Reviewer FAIL on initial snapshot') -DoNotTransition;$first=Invoke-AgenticA4Correction $a45 $d 'Repeated Reviewer finding.' -SkipDownstream
    if($first.new_snapshot -ceq $initialSnapshot -or $a45.state.tester_status -cne 'PENDING' -or $a45.state.code_review_status -cne 'PENDING' -or $a45.state.security_review_status -cne 'PENDING'){throw 'A4.5 first correction did not change snapshot and invalidate approvals.'}
    $script:a4StatusQueues.reviewer.Enqueue('FAIL')
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'TESTING' @('tester') -Evidence 'Corrected implementation creates new snapshot');$t2=Invoke-AgenticA4FixtureDispatch $a45 $d 'TESTING';Set-AgenticA4ApprovalFromDispatch $a45.state $t2
    if($t2[0].Result.snapshot_sha256 -cne $first.new_snapshot){throw 'A4.5 Tester evidence is not bound to the corrected snapshot.'}
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'REVIEWING' @('reviewer','security') -Evidence 'Tester PASS bound to corrected snapshot');$r2=Invoke-AgenticA4FixtureDispatch $a45 $d 'REVIEWING'
    if(@($r2|Where-Object{$_.Role -eq 'reviewer' -and $_.Result.status -eq 'FAIL' -and $_.Result.snapshot_sha256 -ceq $first.new_snapshot}).Count -ne 1 -or @($r2|Where-Object{$_.Role -eq 'security' -and $_.Result.status -eq 'PASS' -and $_.Result.snapshot_sha256 -ceq $first.new_snapshot}).Count -ne 1){throw 'A4.5 repeated Reviewer failure evidence is not bound to the corrected snapshot.'}
    $a45.state.code_review_status='FAIL';$a45.state.reviewer_invocation_id=($r2|Where-Object{$_.Role -eq 'reviewer'}).InvocationId;$a45.state.security_review_status='PASS';$a45.state.security_invocation_id=($r2|Where-Object{$_.Role -eq 'security'}).InvocationId
    $d=Add-AgenticA4Decision $a45 (New-AgenticA4Decision 'CORRECTING' @('implementer') 'implementer' -Evidence 'Same Reviewer finding repeated on corrected snapshot') -DoNotTransition;$null=Complete-AgenticAutonomousCorrection -State $a45.state -Metadata @{} -Decision $d -Failure 'Repeated Reviewer finding.'
    $diagnostic=$a45.state.failure_diagnostic
    if($a45.state.state -cne 'FAILED' -or $a45.state.iteration -ne 2 -or $diagnostic.category -cne 'CORRECTION_LIMIT' -or $a45.state.request_id -cne $a45.envelope.request_id -or $a45.state.branch -cne "feature/$($a45.state.request_id)" -or ($a45.state.PSObject.Properties['commit_sha'] -and $a45.state.commit_sha) -or ($a45.state.PSObject.Properties['pr_url'] -and $a45.state.pr_url)){throw 'A4.5 hard limit did not terminate with structured bounded failure and preserved identity/no publication.'}
    $a45|Add-Member -NotePropertyName snapshots -NotePropertyValue @($initialSnapshot,$first.new_snapshot) -Force
    if(@($a45.events|Where-Object{$_ -match 'RESUMING|resume_request|agentic-resume\.ps1'}).Count -gt 0){throw 'A4.5 ordinary correction entered resume flow.'}
    $passed.Add('A4.5 integrated repeated Reviewer FAIL follows legal lifecycle, changes snapshot, invalidates approvals and terminates at max_iterations=1')

    foreach($fixture in @($a41,$a42,$a43,$a44,$a45)) {if(@($fixture.events|Where-Object{$_ -match 'resume_request|RESUMING|agentic-resume\.ps1'}).Count -gt 0){throw 'A4.6 correction fixture used resume flow.'}}
    $lifecycleSource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'agentic-vnext-lifecycle.ps1'))
    if($lifecycleSource -notmatch 'while\(\$true\)' -or $lifecycleSource -match 'Complete-AgenticAutonomousCorrection[\s\S]{0,500}agentic-resume\.ps1'){throw 'A4.6 internal correction is not contained in the active lifecycle.'}
    $passed.Add('A4.6 internal correction remains in active lifecycle and never invokes resume_request, RESUMING or agentic-resume.ps1')
}
finally { $script:AgenticRepoRoot=$originalA4Root;Get-ChildItem -LiteralPath $originalA4Root -Directory -Filter '.agentic-a4-fixtures-*' -ErrorAction SilentlyContinue|Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }

$temporaryFixtureRoot=Join-Path $script:AgenticRepoRoot ('.agentic-vnext-fixtures-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temporaryFixtureRoot)|Out-Null
$originalRoot=$script:AgenticRepoRoot
try {
    $script:AgenticRepoRoot=$temporaryFixtureRoot
    $specFolder=Join-Path $temporaryFixtureRoot 'agentic/specifications';$stateFolder=Join-Path $temporaryFixtureRoot 'agentic/state/results'
    [IO.Directory]::CreateDirectory($specFolder)|Out-Null;[IO.Directory]::CreateDirectory($stateFolder)|Out-Null
    $projectionState=[pscustomobject]@{request_id=$id;goal_id=$id;base_branch='develop';base_sha=('a'*40);branch='feature/'+$id;state='DOR_VALIDATION';request_envelope_path='agentic/state/requests/'+$id+'.json';preflight_result_path='agentic/state/preflight/'+$id+'.json';specification_path='agentic/specifications/'+$id+'.md';specification_sha256=$null}
    $projectionText=New-AgenticSpecificationMarkdown -Payload $spec -State $projectionState -Title 'fixture'
    [IO.File]::WriteAllText((Join-Path $temporaryFixtureRoot $projectionState.specification_path),$projectionText,[Text.UTF8Encoding]::new($false))
    $verificationState=[pscustomobject]@{request_id=$id;approved_snapshot_sha256=('c'*64)}
    $verificationEnvelope=$envelope|Select-Object *;$verificationEnvelope.target_repository=(Split-Path -Leaf $temporaryFixtureRoot);$verificationEnvelope.content_sha256=Get-AgenticRequestEnvelopeHash -Envelope $verificationEnvelope
    $verifyFile=Join-Path $temporaryFixtureRoot 'fixture-observability.ps1';[IO.File]::WriteAllText($verifyFile,"Write-Output 'diagnostic event'`n",[Text.UTF8Encoding]::new($false))
    $obsPass=Invoke-AgenticObservabilityVerification -State $verificationState -InvocationId '3123456789abcdef0123456789abcdef' -Paths @('fixture-observability.ps1')
    if($obsPass.artifact.status -cne 'PASS'){throw 'Observability PASS fixture failed.'}
    [IO.File]::WriteAllText($verifyFile,"try { Invoke-Thing } catch { }`nWrite-Host `$password`n",[Text.UTF8Encoding]::new($false))
    $obsFail=Invoke-AgenticObservabilityVerification -State $verificationState -InvocationId '3223456789abcdef0123456789abcdef' -Paths @('fixture-observability.ps1')
    if($obsFail.artifact.status -cne 'FAIL'){throw 'Observability FAIL fixture failed.'}
    $obsBlocked=New-AgenticVerificationArtifact -VerificationType 'OBSERVABILITY_VERIFICATION' -RequestId $id -InvocationId '3233456789abcdef0123456789abcdef' -SnapshotSha256 ('c'*64) -Status 'BLOCKED' -Evidence @() -Findings @() -Failure 'Required source artifact is unavailable.'
    Assert-AgenticVerificationArtifact -Artifact $obsBlocked -RequestId $id -SnapshotSha256 ('c'*64)|Out-Null
$reqPass=Invoke-AgenticRequirementVerification -State $verificationState -InvocationId '3323456789abcdef0123456789abcdef' -AcceptanceCriteria @('AC-01: One') -DodCriteria @('DOD-01: Done') -TesterEvidence @([pscustomobject]@{criterion_id='AC-01';status='PASS';evidence='test evidence'},[pscustomobject]@{criterion_id='DOD-01';status='PASS';evidence='gate evidence'}) -Envelope $verificationEnvelope
$reqFail=Invoke-AgenticRequirementVerification -State $verificationState -InvocationId '3423456789abcdef0123456789abcdef' -AcceptanceCriteria @('AC-01: One','AC-02: Two') -DodCriteria @() -TesterEvidence @([pscustomobject]@{criterion_id='AC-01';status='PASS';evidence='test evidence'}) -Envelope $verificationEnvelope
    if($reqPass.artifact.status -cne 'PASS' -or $reqFail.artifact.status -cne 'FAIL'){throw 'Requirement PASS/missing-AC FAIL fixture failed.'}
    $scopePass=Invoke-AgenticScopeVerification -State $verificationState -InvocationId '3523456789abcdef0123456789abcdef' -ActualPaths @('src/a.ts') -ApprovedPaths @('src/a.ts') -ActualSnapshotSha256 ('c'*64)
    $scopeFail=Invoke-AgenticScopeVerification -State $verificationState -InvocationId '3623456789abcdef0123456789abcdef' -ActualPaths @('src/a.ts','src/extra.ts') -ApprovedPaths @('src/a.ts') -ActualSnapshotSha256 ('d'*64)
    if($scopePass.artifact.status -cne 'PASS' -or $scopeFail.artifact.status -cne 'FAIL'){throw 'Scope PASS/out-of-scope and drift FAIL fixtures failed.'}
    $tampered=$scopePass.artifact;$tampered.status='FAIL';$tamperRejected=$false;try{Assert-AgenticVerificationArtifact -Artifact $tampered -RequestId $id -SnapshotSha256 ('c'*64)|Out-Null}catch{$tamperRejected=$true};if(-not$tamperRejected){throw 'Tampered verification artifact was accepted.'}
    $staleRejected=$false;try{Assert-AgenticVerificationArtifact -Artifact $scopePass.artifact -RequestId $id -SnapshotSha256 ('d'*64)|Out-Null}catch{$staleRejected=$true};if(-not$staleRejected){throw 'Old-snapshot verification was accepted for a new snapshot.'}
    $passed.Add('A3 verification artifact PASS/FAIL, missing AC, scope drift, tamper and stale snapshot fixtures')
    Set-AgenticSpecificationProjection -State $projectionState -Section 'Reviewer Result' -Value ([pscustomobject]@{status='PASS';invocation_id='0123456789abcdef0123456789abcdef'})|Out-Null
    Set-AgenticSpecificationProjection -State $projectionState -Section 'Security Result' -Value ([pscustomobject]@{status='PASS';invocation_id='1123456789abcdef0123456789abcdef'})|Out-Null
    $projectionSaved=[IO.File]::ReadAllText((Join-Path $temporaryFixtureRoot $projectionState.specification_path))
    if($projectionSaved -notmatch '"invocation_id": "0123456789abcdef0123456789abcdef"' -or $projectionSaved -notmatch '"invocation_id": "1123456789abcdef0123456789abcdef"'){throw 'Independent review projections overwrote each other.'}
    $passed.Add('AT-050/051/052 Supervisor-owned Specification projection preserves independent results')
    $resultPath='agentic/state/results/'+$id+'/0123456789abcdef0123456789abcdef.json'
    $resultArtifact=Write-AgenticImmutableJsonArtifact -RelativePath $resultPath -Value ([pscustomobject]@{status='PASS';summary='immutable fixture'})
    $immutableRejected=$false;try{Write-AgenticImmutableJsonArtifact -RelativePath $resultPath -Value ([pscustomobject]@{status='FAIL';summary='tamper fixture'})|Out-Null}catch{$immutableRejected=$true};if(-not$immutableRejected){throw 'Immutable role evidence artifact was overwritten.'}
    $passed.Add('AT-045/053 immutable role evidence persistence')
    [IO.File]::WriteAllText((Join-Path $temporaryFixtureRoot 'package.json'),'{"scripts":{}}',[Text.UTF8Encoding]::new($false))
    $brokerState=[pscustomobject]@{request_id=$id;execution_id='2123456789abcdef0123456789abcdef';approved_snapshot_sha256=('c'*64)}
    $unavailable=Invoke-AgenticBrokerAction -Action ([pscustomobject]@{action_id='missing-test';type='RUN_TEST_COMMAND';approved_identifier='npm-test';purpose='Check repository tests.';expected_evidence='Availability status.'}) -State $brokerState
    if($unavailable.status -cne 'BLOCKED'){throw 'Missing mandatory test capability did not produce BLOCKED.'}
    $passed.Add('AT-060/064 bounded action and unavailable test capability')
}
finally { $script:AgenticRepoRoot=$originalRoot;Remove-Item -LiteralPath $temporaryFixtureRoot -Recurse -Force -ErrorAction SilentlyContinue }

$validAction=[pscustomobject]@{action_id='lint-check';type='RUN_PACKAGE_SCRIPT';approved_identifier='lint';purpose='Run the repository lint gate.';expected_evidence='Exit status and sanitized output.'}
Assert-AgenticBrokerAction -Action $validAction|Out-Null
$passed.Add('AT-060 bounded broker action schema and approved identifier')
$unknownIdentifier=$false;try{Assert-AgenticBrokerAction -Action ($validAction|Select-Object * -ExcludeProperty approved_identifier|Add-Member -NotePropertyName approved_identifier -NotePropertyValue 'free-form' -PassThru)|Out-Null}catch{$unknownIdentifier=$true};if(-not$unknownIdentifier){throw 'Broker accepted an unapproved action identifier.'}
$unsafe=$false
try { Invoke-AgenticBrokerAction -Action ([pscustomobject]@{action_id='try-shell';type='RUN_SHELL';approved_identifier='whoami';purpose='fixture';expected_evidence='none'}) -State ([pscustomobject]@{request_id=$id;execution_id='0123456789abcdef0123456789abcdef';approved_snapshot_sha256=('b'*64)})|Out-Null } catch { $unsafe=$true }
if(-not$unsafe){throw 'Test broker accepted an arbitrary shell action.'}
$passed.Add('AT-061 arbitrary shell action rejected before host execution')

$loopSource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'agentic-loop.ps1'))
foreach($legacy in @('''DISCOVERY'' {','''PLANNING'' {','''SECURITY_REVIEW'' { ''reviewer''')){if($loopSource.Contains($legacy)){throw "Legacy active lifecycle token remains: $legacy"}}
if($loopSource -notmatch 'Invoke-AgenticVNextLifecycle'){throw 'Canonical lifecycle entrypoint is not active.'}
if($loopSource -match 'function\s+Invoke-AgenticFinalization\b|git\s+(?:commit|push)|SECURITY_REVIEW\s*→\s*CODE_REVIEW'){throw 'Legacy or mutating finalization bypass remains active.'}
$roleNames=@('orchestrator','architect','implementer','tester','reviewer','security')
foreach($role in $roleNames){$rolePath=Join-Path $script:AgenticRepoRoot (".codex/agents/$role.toml");if(-not(Test-Path -LiteralPath $rolePath -PathType Leaf)){throw "Required role contract missing: $role"}}
if(@(Get-ChildItem -LiteralPath (Join-Path $script:AgenticRepoRoot 'agentic') -Directory -Filter 'plans' -ErrorAction SilentlyContinue).Count -gt 0){throw 'Legacy canonical planning directory remains.'}
$bridge=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'agentic-supervisor-mcp.js'))
foreach($forbidden in @('run_shell','execute_command')){if($bridge.Contains($forbidden)){throw "Forbidden arbitrary tool in bridge: $forbidden"}}
$passed.Add('AT-001/002/003/009/011 single lifecycle, role inventory, writer boundary, plan removal and narrow bridge static contract')

$node=Get-Command node -ErrorAction Stop
$mcpTest=Invoke-AgenticNativeProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot 'agentic-supervisor-mcp-tests.js')) -CaptureStandardError
if($mcpTest.ExitCode -ne 0){throw "MCP protocol fixtures failed (exit code $($mcpTest.ExitCode)): $((@($mcpTest.Output)|ForEach-Object{[string]$_}) -join ' ')"}
$passed.Add('AT-010/011/012/013/014 MCP initialization, narrow tools, valid start/resume handoff, status, invalid-input and trust-policy fixtures')
Write-Output ('AGENTIC_VNEXT_FIXTURES: PASS ('+($passed -join '; ')+')')
