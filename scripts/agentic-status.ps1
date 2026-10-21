[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

try {
    $state = Get-AgenticState
    $roleInvocations = if ($null -ne $state.PSObject.Properties['role_invocations']) { @($state.role_invocations) } else { @() }
    $gateResults = if ($null -ne $state.PSObject.Properties['gate_results']) { @($state.gate_results) } else { @() }
    $lastRoleInvocation = @($roleInvocations | Select-Object -Last 1)
    $gateSummary = @($gateResults | ForEach-Object { '{0}={1}' -f $_.name, $_.status }) -join '; '
    $provenanceSummary = @($roleInvocations | ForEach-Object { '{0}:{1}:{2}' -f $_.role, $_.status, $_.invocation_id }) -join '; '
    [pscustomobject]@{
        Goal = $state.goal_id
        State = $state.state
        ChangeClassification = $state.change_classification
        Branch = $state.branch
        BaseBranch = $state.base_branch
        Iteration = "$($state.iteration)/$($state.max_iterations)"
        AgentCalls = "$($state.agent_calls)/$($state.max_agent_calls)"
        ConsecutiveFailures = "$($state.consecutive_failures)/$($state.max_consecutive_failures)"
        LastRole = if ($lastRoleInvocation.Count -gt 0) { $lastRoleInvocation[0].role } else { $null }
        QualityGates = $gateSummary
        SecurityReview = $state.security_review_status
        CodeReview = $state.code_review_status
        Readiness = if ($state.state -eq 'READY_TO_COMMIT') { 'pending supervisor revalidation' } else { 'not ready' }
        Provenance = $provenanceSummary
        FailureDiagnostic = if ($null -ne $state.failure_diagnostic) { $state.failure_diagnostic | ConvertTo-Json -Compress -Depth 5 } else { $null }
        PendingAction = $state.pending_action
        LastGate = $state.last_gate
        MemoryStatus = $state.memory_status
        QuotaState = $state.quota_state
        ResumeAfter = $state.resume_after
        Commit = $state.commit_sha
        PullRequest = $state.pr_url
        UpdatedAt = $state.updated_at
    } | Format-List
}
catch {
    Write-Error (ConvertTo-AgenticSanitizedText -Text $_.Exception.Message)
    exit 1
}
