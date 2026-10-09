# run-brief.ps1 -- run the CodeBuddy CLI headless with a task brief read from a file.
# ASCII only (Windows PowerShell 5.1 mangles non-ASCII .ps1 without BOM).
# Usage: powershell -ExecutionPolicy Bypass -File run-brief.ps1 -Brief <path.md> -Out <path.log> [-TimeoutSec 3600]
param(
    [Parameter(Mandatory = $true)][string]$Brief,
    [Parameter(Mandatory = $true)][string]$Out,
    [int]$TimeoutSec = 3600
)
$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'node_modules\@tencent-ai\codebuddy-code\bin\codebuddy'
if (-not (Test-Path $cli)) { throw "codebuddy CLI not found: $cli" }
if (-not (Test-Path $Brief)) { throw "brief not found: $Brief" }

$text = Get-Content -Raw -Encoding UTF8 $Brief
$t0 = Get-Date
"[run-brief] start $(Get-Date -Format s)"
& node $cli -p $text --permission-mode bypassPermissions --output-format json *> $Out
"[run-brief] exit=$LASTEXITCODE elapsed=$([int]((Get-Date) - $t0).TotalSeconds)s output=$Out"
