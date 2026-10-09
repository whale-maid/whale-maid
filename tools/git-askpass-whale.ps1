# git-askpass-whale.ps1 -- GIT_ASKPASS helper: prints ONLY the password for a vault site.
# Reads the vault with Node (UTF-8 safe). NEVER echoes file content on failure: silent exit 1.
# (Lesson 2026-10-10: PowerShell's ConvertFrom-Json on this file dumped the whole vault into the log.)
# ASCII-only. Usage: set GIT_ASKPASS to tools\git-askpass-whale.cmd
$ErrorActionPreference = "SilentlyContinue"
$site = if ($env:WHALE_VAULT_SITE) { $env:WHALE_VAULT_SITE } else { "github" }
$vault = Join-Path $env:USERPROFILE ".dsh\secrets\sites.json"
if (-not (Test-Path $vault)) { exit 1 }

$js = @'
const fs = require("fs");
try {
  const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const s = j[process.argv[2]];
  if (s && typeof s.password === "string" && s.password) { process.stdout.write(s.password); process.exit(0); }
} catch (e) { /* fall through */ }
process.exit(1);
'@

$out = & node -e $js $vault $site 2>$null
if ($LASTEXITCODE -ne 0) { exit 1 }
if (-not $out) { exit 1 }
Write-Output $out
exit 0
