# Dừng hẳn DVT Giám sát (task + tiến trình node của thư mục này). PowerShell quyền Admin:
#   powershell -ExecutionPolicy Bypass -File scripts\dung-task.ps1
$app = Split-Path -Parent $PSScriptRoot
$ten = 'DVT Giam sat'
Stop-ScheduledTask -TaskName $ten -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*') -or
                 ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*chay-nen.bat*') } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Đã dừng $($_.Name) ($($_.ProcessId))" }
Write-Host "Đã dừng '$ten'. Chạy lại: Start-ScheduledTask '$ten'"
