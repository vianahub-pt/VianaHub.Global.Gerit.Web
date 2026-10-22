[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^req-[0-9a-f]{32}$')][string]$RequestId)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'agentic-loop.ps1') -RequestId $RequestId
exit $LASTEXITCODE
