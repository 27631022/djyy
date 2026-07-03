# 党建益友 · 一键发布到群晖
# 用法:
#   .\release.ps1                     常规发布(构建→组包→存档→推送→远程重建→健康检查)
#   .\release.ps1 -SkipBuild          跳过前端构建(只改了后端时更快)
#   .\release.ps1 -Smoke              发布成功后追加 12 项接口冒烟
#   .\release.ps1 -RollbackZip <zip>  用 deploy\releases\ 下的历史存档回滚
# 首次运行会问一次 NAS SSH 用户名并保存(release.config.json,已 gitignore);
# SSH 未配好时自动降级:完成组包并打印手动部署两步,不报错。
param(
  [string]$NasHost,
  [string]$NasUser,
  [string]$RemotePath,
  [switch]$SkipBuild,
  [switch]$Smoke,
  [string]$RollbackZip
)

# 注意:不用 Stop —— PS 5.1 会把原生 exe(npm/ssh/scp/tar)的 stderr 正常输出当错误终止脚本;
# 失败判定一律走显式 $LASTEXITCODE 检查。
$ErrorActionPreference = "Continue"
$kit      = $PSScriptRoot                                  # deploy/synology
$repo     = Split-Path (Split-Path $kit -Parent) -Parent   # 仓库根
$releases = Join-Path (Split-Path $kit -Parent) "releases" # deploy/releases

# ---------- 参数与配置(config 在推送成功后才保存,避免失败运行留脏配置) ----------
$cfgPath = Join-Path $kit "release.config.json"
$cfg = $null
if (Test-Path $cfgPath) { try { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { $cfg = $null } }
if (-not $NasHost)    { if ($cfg -and $cfg.nasHost)    { $NasHost = $cfg.nasHost }       else { $NasHost = "10.185.28.220" } }
if (-not $RemotePath) { if ($cfg -and $cfg.remotePath) { $RemotePath = $cfg.remotePath } else { $RemotePath = "/volume1/docker/djyy" } }
if (-not $NasUser)    { if ($cfg -and $cfg.nasUser)    { $NasUser = $cfg.nasUser } }
if (-not $NasUser)    { $NasUser = Read-Host "NAS 的 SSH 用户名(推送成功后保存,下次免输)" }
$target = "$NasUser@$NasHost"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---------- 1. 准备发布内容(新构建 或 历史存档) ----------
$stage = Join-Path $env:TEMP "djyy-release-stage"

if ($RollbackZip) {
  if (-not (Test-Path $RollbackZip)) { throw "找不到回滚包: $RollbackZip" }
  Step "回滚模式:解包 $RollbackZip"
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Force $stage | Out-Null
  tar.exe -xf $RollbackZip -C $stage
  if ($LASTEXITCODE -ne 0) { throw "回滚包解压失败" }
} else {
  if (-not $SkipBuild) {
    Step "构建前端(react + exhibition-client)"
    Push-Location "$repo\react"
    npm run build
    $ok = ($LASTEXITCODE -eq 0); Pop-Location
    if (-not $ok) { throw "react 构建失败" }
    Push-Location "$repo\exhibition-client"
    npm run build
    $ok = ($LASTEXITCODE -eq 0); Pop-Location
    if (-not $ok) { throw "exhibition-client 构建失败" }
  } else {
    Step "跳过前端构建(-SkipBuild),使用现有 dist"
  }

  Step "组装部署包"
  & "$kit\make-bundle.ps1" -Out $stage

  Step "存档(deploy\releases,保留最近 5 份)"
  New-Item -ItemType Directory -Force $releases | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $archive = Join-Path $releases "djyy-release-$stamp.zip"
  Copy-Item "$stage.zip" $archive -Force
  Get-ChildItem $releases -Filter "djyy-release-*.zip" |
    Sort-Object Name -Descending | Select-Object -Skip 5 | Remove-Item -Force
  Write-Host "已存档: $archive"
}

# ---------- 2. SSH 探测(免密不可用则降级为手动指引) ----------
Step "探测 NAS SSH 免密($target)"
$probe = ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new $target "echo __SSH_OK__" 2>&1
if (-not ($probe -match "__SSH_OK__")) {
  Write-Host ""
  Write-Warning "SSH 免密未就绪(见 README-部署.md 附录做一次性配置)。已完成组包,请手动完成两步:"
  Write-Host "  1) 把以下目录内容拷贝覆盖到 NAS 的 $RemotePath (File Station 或 SMB):"
  Write-Host "       $stage"
  Write-Host "  2) Container Manager -> 项目 djyy -> 构建 -> 启动"
  Write-Host ""
  Write-Host "配置好免密后重跑本脚本即可全自动。探测输出: $probe"
  exit 0
}
Write-Host "SSH 可用"

# ---------- 3. 推送(tgz 上传后远端解压;只覆盖代码与产物,不触碰 pgdata/storage/backup) ----------
Step "推送发布内容到 ${target}:$RemotePath"
$tgz = Join-Path $env:TEMP "djyy-release-push.tgz"
if (Test-Path $tgz) { Remove-Item -Force $tgz }
tar.exe -czf $tgz -C $stage .
if ($LASTEXITCODE -ne 0) { throw "打 tgz 失败" }
scp -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new $tgz "${target}:/tmp/djyy-release.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }
ssh $target "mkdir -p $RemotePath && tar -xzf /tmp/djyy-release.tgz -C $RemotePath && rm -f /tmp/djyy-release.tgz"
if ($LASTEXITCODE -ne 0) { throw "远端解压失败" }

# 推送成功,保存配置供下次免参数运行
@{ nasHost = $NasHost; nasUser = $NasUser; remotePath = $RemotePath } |
  ConvertTo-Json | Out-File $cfgPath -Encoding utf8

# ---------- 4. 远程重建(兼容 docker 组免 sudo / sudo 免密 / 新旧 compose) ----------
Step "远程构建并启动(首次构建 5~15 分钟,请耐心)"
$build = "cd $RemotePath && (docker compose up -d --build 2>/dev/null || docker-compose up -d --build 2>/dev/null || sudo -n docker compose up -d --build 2>/dev/null || sudo -n docker-compose up -d --build)"
ssh $target $build
if ($LASTEXITCODE -ne 0) {
  throw "远程构建失败。可 SSH 登录后手动执行: cd $RemotePath && sudo docker compose up -d --build;若提示 sudo 需要密码,按 README 附录配置 docker 权限"
}

# ---------- 5. 健康检查 ----------
Step "健康检查 http://${NasHost}:3001/api/health"
$deadline = (Get-Date).AddMinutes(5)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  $h = $null
  try { $h = Invoke-RestMethod "http://${NasHost}:3001/api/health" -TimeoutSec 5 -ErrorAction SilentlyContinue } catch { }
  if ($h -and $h.checks.database -eq "up") { $healthy = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $healthy) {
  throw "5 分钟内健康检查未通过。看容器日志: ssh $target `"cd $RemotePath && docker logs --tail 100 djyy-app`""
}
Write-Host "健康检查通过:database up" -ForegroundColor Green

# ---------- 6. 可选冒烟 ----------
if ($Smoke) {
  Step "12 项接口冒烟"
  $env:SMOKE_BASE = "http://${NasHost}:3001/api"
  node "$kit\smoke.mjs"
  if ($LASTEXITCODE -ne 0) { throw "冒烟未全部通过,请检查上方输出" }
}

Step "发布完成 ✔  前端: http://${NasHost}:5173"
