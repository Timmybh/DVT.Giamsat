# Đóng gói bản production: npm.cmd run build:zip
# Kết quả: Deploy\dvt-giamsat-<version>-<yyyyMMdd-HHmm>.zip (đã kèm node_modules, máy đích chỉ cần cài Node.js 18+)
# Không đóng gói .env, data\ (lượt tương tác), logs\, khao-sat\: máy production giữ bản của nó.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$outDir = Join-Path $root 'Deploy'
$stage = Join-Path $outDir 'dvt-giamsat'
$zip = Join-Path $outDir "dvt-giamsat-$version-$stamp.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($item in 'server.js', 'package.json', 'package-lock.json', '.env.example', 'start.bat', 'chay-nen.bat', 'README.md', 'DEPLOY.md', 'iis', 'src', 'public', 'scripts') {
  Copy-Item (Join-Path $root $item) $stage -Recurse
}
# Bảng đối chiếu tổ HiPro (nếu có) để máy production dùng luôn
if (Test-Path "$root\config\ma-to-hipro.json") {
  New-Item -ItemType Directory -Path "$stage\config" | Out-Null
  Copy-Item "$root\config\ma-to-hipro.json" "$stage\config\ma-to-hipro.json.mau"
}
Push-Location $stage
npm.cmd ci --omit=dev --no-audit --no-fund
Pop-Location

Compress-Archive -Path "$stage\*" -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Host "Đã tạo $zip"
