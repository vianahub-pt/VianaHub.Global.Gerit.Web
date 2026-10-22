[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'agentic-common.ps1')
$state = Get-AgenticState
[pscustomobject]@{
    RequestId = $state.request_id
    State = $state.state
    Branch = $state.branch
    BaseBranch = $state.base_branch
    BaseSha = $state.base_sha
    SpecificationVersion = $state.specification_version
    Tester = $state.tester_status
    Reviewer = $state.code_review_status
    Security = $state.security_review_status
    UpdatedAt = $state.updated_at
} | ConvertTo-Json -Depth 5
