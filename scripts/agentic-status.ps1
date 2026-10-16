[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

try {
    $state = Get-AgenticState
    [pscustomobject]@{
        Goal = $state.goal_id
        State = $state.state
        Branch = $state.branch
        BaseBranch = $state.base_branch
        Iteration = "$($state.iteration)/$($state.max_iterations)"
        AgentCalls = "$($state.agent_calls)/$($state.max_agent_calls)"
        ConsecutiveFailures = "$($state.consecutive_failures)/$($state.max_consecutive_failures)"
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
    Write-Error $_.Exception.Message
    exit 1
}
