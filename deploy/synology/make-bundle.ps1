# 组装群晖部署包:.\make-bundle.ps1 [-Out 输出目录]
param([string]$Out = "$env:USERPROFILE\Desktop\djyy-synology-deploy")

$ErrorActionPreference = "Stop"
$kit  = $PSScriptRoot                                   # deploy/synology
$repo = Split-Path (Split-Path $kit -Parent) -Parent    # 仓库根

foreach ($p in @("$repo\react\dist\index.html", "$repo\exhibition-client\dist\index.html")) {
  if (-not (Test-Path $p)) { throw "missing frontend build: $p (run npm run build first)" }
}

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force $Out | Out-Null

# backend/prisma/migrations 已是 PG 方言(2026-07-03 起开发/生产统一 postgresql),随 backend 一并进包
robocopy "$repo\backend" "$Out\backend" /E /NFL /NDL /NJH /XD node_modules dist storage-data /XF dev.db dev.db-journal | Out-Null
robocopy "$repo\react\dist" "$Out\web-dist" /E /NFL /NDL /NJH | Out-Null
robocopy "$repo\exhibition-client\dist" "$Out\exhibition-dist" /E /NFL /NDL /NJH | Out-Null

# 拷贝套件顶层文件(compose/Dockerfile/入口脚本/nginx/手册),打包脚本自身除外
Get-ChildItem $kit -File | Where-Object { $_.Name -ne "make-bundle.ps1" } | Copy-Item -Destination $Out
# PG 首次初始化脚本(建 casdoor 库)
robocopy "$kit\initdb" "$Out\initdb" /E /NFL /NDL /NJH | Out-Null

# zip 格式不接受 1980 年前的时间戳(如 vite.svg 的 1979 假时间戳),先修正
Get-ChildItem $Out -Recurse -File | Where-Object { $_.LastWriteTime -lt (Get-Date "1980-01-02") } |
  ForEach-Object { $_.LastWriteTime = Get-Date }

tar.exe -a -cf "$Out.zip" -C $Out .
if ($LASTEXITCODE -ne 0) { throw "zip failed" }
$mb = [math]::Round((Get-Item "$Out.zip").Length / 1MB, 1)
Write-Host "bundle ready: $Out  (zip $mb MB)"
