[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "agentic-common.ps1")

try {
    $result = Invoke-AgenticSupervisorFixtures
    Write-Output "SUPERVISOR_TESTS: $result"
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
