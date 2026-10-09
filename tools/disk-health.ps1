# disk-health.ps1 - run ELEVATED: health diagnostics for the old 512 GB NVMe (E/F/G/H).
# READ-ONLY: chkdsk /scan does not repair; nothing here writes to the volumes.
$ErrorActionPreference = 'Continue'
$base = 'D:\deepseek-harness\work space\tools'
$log = Join-Path $base 'disk-health-2026-09-21.log'
function W($m) { Write-Host $m; Add-Content -LiteralPath $log -Value $m -Encoding UTF8 }

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
W ""
W "=== disk health $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$isAdmin ==="
if (-not $isAdmin) { W "!! NOT ELEVATED - aborting"; exit 1 }

W ""
W "--- [1] physical disks ---"
try {
  Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, BusType, HealthStatus, OperationalStatus, @{n = 'SizeGiB'; e = { [math]::Round($_.Size / 1GB, 1) } }, FirmwareVersion | Format-Table -AutoSize | Out-String | ForEach-Object { W $_ }
} catch { W "   Get-PhysicalDisk failed: $($_.Exception.Message)" }

W "--- [2] storage reliability counters (SMART-derived) ---"
try {
  Get-PhysicalDisk | Get-StorageReliabilityCounter | Select-Object DeviceId, Wear, Temperature, TemperatureMax, PowerOnHours, StartStopCycleCount, ReadErrorsTotal, ReadErrorsUncorrected, WriteErrorsTotal, WriteErrorsUncorrected | Format-List | Out-String | ForEach-Object { W $_ }
} catch { W "   Get-StorageReliabilityCounter failed: $($_.Exception.Message)" }

W "--- [3] disks / partition layout ---"
try {
  Get-Disk | Select-Object Number, FriendlyName, SerialNumber, PartitionStyle, HealthStatus, OperationalStatus, @{n = 'SizeGiB'; e = { [math]::Round($_.Size / 1GB, 1) } } | Format-Table -AutoSize | Out-String | ForEach-Object { W $_ }
} catch { W "   Get-Disk failed: $($_.Exception.Message)" }

W "--- [4] partitions incl. hidden ones (alignment check) ---"
try {
  Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, @{n = 'OffsetMiB'; e = { [math]::Round($_.Offset / 1MB, 2) } }, @{n = 'SizeGiB'; e = { [math]::Round($_.Size / 1GB, 2) } }, @{n = 'Aligned4K'; e = { ($_.Offset % 4096) -eq 0 } }, Type | Sort-Object DiskNumber, PartitionNumber | Format-Table -AutoSize | Out-String | ForEach-Object { W $_ }
} catch { W "   Get-Partition failed: $($_.Exception.Message)" }

W "--- [5] fsutil repair state (self-healing / dirty bit) ---"
foreach ($d in @('E', 'F', 'G', 'H')) {
  W "   [$d]"
  & fsutil repair query "${d}:" 2>&1 | Select-Object -First 10 | ForEach-Object { W "      $_" }
  & fsutil dirty query "${d}:" 2>&1 | Select-Object -First 3 | ForEach-Object { W "      $_" }
}

W "--- [6] chkdsk /scan (read-only, may take several minutes) ---"
foreach ($d in @('E', 'F', 'G', 'H')) {
  W "   --- ${d}:"
  $t0 = Get-Date
  & chkdsk.exe "${d}:" /scan 2>&1 | Select-Object -Last 18 | ForEach-Object { W "      $_" }
  W ("      ({0:N1} min)" -f ((Get-Date) - $t0).TotalMinutes)
}

W "--- [7] SMART via WMI (fallback) ---"
try {
  Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction Stop |
    Select-Object InstanceName, PredictFailure, Reason | Format-Table -AutoSize | Out-String | ForEach-Object { W $_ }
} catch { W "   $($_.Exception.Message)" }

W "--- [8] volume info ---"
try {
  Get-Volume | Where-Object { $_.DriveLetter -in @('E', 'F', 'G', 'H') } | Select-Object DriveLetter, FileSystemLabel, FileSystem, HealthStatus, @{n = 'SizeGiB'; e = { [math]::Round($_.Size / 1GB, 1) } }, @{n = 'FreeGiB'; e = { [math]::Round($_.SizeRemaining / 1GB, 1) } } | Format-Table -AutoSize | Out-String | ForEach-Object { W $_ }
} catch { W "   Get-Volume failed: $($_.Exception.Message)" }

W "=== done $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
Start-Sleep -Seconds 4
