# ws-backup.ps1 -- mirror the workspace repos to a backup drive (cross-disk).
# 2026-10-09 established. ASCII-only on purpose. Never pipe git's stderr: Windows
# PowerShell turns it into a terminating error under ErrorActionPreference=Stop.
# Usage: powershell -ExecutionPolicy Bypass -File tools\ws-backup.ps1 [-Dest E:\ws-backup]
param([string]$Dest = "E:\ws-backup")
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# Root repo + the four self-hosting repos (version map: docs/rules/git-workflow.md)
$repos = @(
  @{ Name = "workspace.git";         Src = $root },
  @{ Name = "whale-room.git";        Src = (Join-Path $root "whale-room") },
  @{ Name = "memory-tool.git";       Src = (Join-Path $root "memory-tool") },
  @{ Name = "dsh-pet-indesktop.git"; Src = (Join-Path $root "dsh-pet-indesktop") },
  @{ Name = "dsh-whale-board.git";   Src = (Join-Path $root "dsh-whale-board") }
)

$fail = 0
foreach ($r in $repos) {
  if (-not (Test-Path (Join-Path $r.Src ".git"))) { "SKIP     $($r.Name) (not a repo)"; continue }
  $target = Join-Path $Dest $r.Name
  if (Test-Path $target) {
    & git --git-dir="$target" remote update --prune
    if ($LASTEXITCODE -eq 0) { "UPDATED  $($r.Name)" } else { $fail++; "FAILED   $($r.Name) (exit $LASTEXITCODE)" }
  } else {
    & git clone --mirror "$($r.Src)" "$target"
    if ($LASTEXITCODE -eq 0) { "CREATED  $($r.Name)" } else { $fail++; "FAILED   $($r.Name) (exit $LASTEXITCODE)" }
  }
}

"--- mirror sizes ---"
Get-ChildItem $Dest -Directory | ForEach-Object {
  $mb = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
  "{0,-24} {1,8:N1} MB" -f $_.Name, $mb
}
"--- failures: $fail ---"
