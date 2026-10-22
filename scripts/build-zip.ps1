# Đóng gói bản production: .\scripts\build-zip.ps1
# Kết quả: dist\dvt-giamsat-<version>.zip (đã kèm node_modules, máy đích chỉ cần cài Node.js 18+)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
$stage = Join-Path $root 'dist\dvt-giamsat'
$zip = Join-Path $root "dist\dvt-giamsat-$version.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($item in 'server.js', 'package.json', 'package-lock.json', '.env.example', 'start.bat', 'README.md', 'src', 'public') {
  Copy-Item (Join-Path $root $item) $stage -Recurse
}
Push-Location $stage
npm ci --omit=dev --no-audit --no-fund
Pop-Location

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip
Write-Host "Đã tạo $zip"
