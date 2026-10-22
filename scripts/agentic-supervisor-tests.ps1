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
$stale=[pscustomobject]@{tester_status='PASS';tester_invocation_id='0123456789abcdef0123456789abcdef';code_review_status='PASS';reviewer_invocation_id='1123456789abcdef0123456789abcdef';security_review_status='PASS';security_invocation_id='2123456789abcdef0123456789abcdef';observability_status='PASS';requirement_status='PASS';scope_status='PASS';approved_snapshot_sha256=('c'*64);gate_results=@('old');quality_gate_snapshot=@('old');brokered_test_results=@('old')}
Reset-AgenticDownstreamApprovals -State $stale|Out-Null
if($stale.tester_status -ne 'PENDING' -or $stale.code_review_status -ne 'PENDING' -or $stale.security_review_status -ne 'PENDING' -or $stale.approved_snapshot_sha256 -or $stale.gate_results.Count -ne 0 -or $stale.tester_invocation_id -or $stale.reviewer_invocation_id -or $stale.security_invocation_id){throw 'Functional correction did not invalidate every downstream approval.'}
$passed.Add('AT-073/074/075 correction invalidates Tester, Reviewer, Security and downstream evidence')

# AT-090: the supervisor supplies evidence, not a predetermined destination.
$script:fixtureDecisionNext='ARCHITECTURE'
function Write-AgenticState { param($State) }
function Add-AgenticRoleInvocationEvidence { param($State,$Invocation,$Metadata) }
function Invoke-CodexAgentRole {
    param($State,$GoalPath,$Role,$Phase,$InvocationId,$Mode,$ExecutionRoot,$AdditionalContext)
    if($AdditionalContext -match 'Expected next_state='){throw 'Supervisor supplied a fixed semantic destination.'}
    $d=[pscustomobject]@{next_state=$script:fixtureDecisionNext;next_roles=@('architect');correction_routing='';terminal_outcome='';rationale='Fixture evidence supports the selected action.';evidence=@('synthetic role evidence')}
    return [pscustomobject]@{ExitCode=0;Output='';Result=[pscustomobject]@{status='PASS';decision=$d}}
}
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
