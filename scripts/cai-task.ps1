# Đăng ký Task Scheduler cho DVT Giám sát: chạy bằng SYSTEM, tự khởi động khi bật máy (không cần ai đăng nhập).
# Chạy bằng PowerShell quyền Admin, trong thư mục ứng dụng:
#   powershell -ExecutionPolicy Bypass -File scripts\cai-task.ps1
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$ten = 'DVT Giam sat'
$bat = Join-Path $app 'chay-nen.bat'
if (-not (Test-Path $bat)) { throw "Không thấy $bat" }

$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bat`"" -WorkingDirectory $app
$t = New-ScheduledTaskTrigger -AtStartup
$t.Delay = 'PT30S'   # đợi mạng lên 30 giây rồi mới chạy
$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# ExecutionTimeLimit 0 = chạy mãi (mặc định Windows tự tắt task sau 72 giờ)
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $ten -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
Write-Host "Đã đăng ký task '$ten' (SYSTEM, khởi động cùng máy). Chạy ngay: Start-ScheduledTask '$ten'"
