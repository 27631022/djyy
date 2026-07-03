# 生成 PostgreSQL 方言的增量迁移(schema.prisma 变更后、发布前执行)
# 用法: .\new-pg-migration.ps1 -Name add_xxx
# 原理: 本地起一个临时免安装版 PostgreSQL,用「provider 切 postgresql 的 schema 副本 +
#       migrations-pg 迁移目录」跑 prisma migrate dev,产生的新迁移目录写回 migrations-pg/。
# 依赖: D:\web\pg10-portable\pgsql(采购 POC 验证过的 PG 10.23 免安装版,已一次性备好)
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$PgDir = "D:\web\pg10-portable",
  [int]$Port = 54329
)

# 注意:不用 Stop —— PS 5.1 会把原生 exe(initdb/npx)的 stderr 正常输出当错误终止脚本;
# 失败判定一律走显式 $LASTEXITCODE 检查。
$ErrorActionPreference = "Continue"
$kit  = $PSScriptRoot
$repo = Split-Path (Split-Path $kit -Parent) -Parent
$bin  = Join-Path $PgDir "pgsql\bin"
if (-not (Test-Path "$bin\initdb.exe")) {
  throw "未找到免安装版 PostgreSQL($bin)。一次性准备:将 PG10 便携版的 pgsql\{bin,lib,share} 放到 $PgDir\pgsql\ 下(bin 内需含 msvcr120/msvcp120.dll)"
}

$work = Join-Path $env:TEMP "djyy-pg-mig"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force "$work\prisma" | Out-Null

Write-Host "==> 启动临时 PostgreSQL(端口 $Port)" -ForegroundColor Cyan
& "$bin\initdb.exe" -D "$work\data" -U postgres -E UTF8 --no-locale 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "initdb 失败(工作目录 $work)" }
# 端口写进 postgresql.conf(避免 Start-Process 对 -o "-p N" 带空格参数的引号问题)
Add-Content "$work\data\postgresql.conf" "port = $Port"
# 不能用管道捕获 pg_ctl start 的输出:postgres 子进程会继承句柄,管道永远等不到关闭(挂死)。
# Start-Process 分离启动,只等 pg_ctl 本身退出。
$pgArgs = @("-D", "$work\data", "-l", "$work\pg.log", "-w", "start")
$pgProc = Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList $pgArgs -PassThru -WindowStyle Hidden
$pgProc.WaitForExit()
if ($pgProc.ExitCode -ne 0) { throw "PostgreSQL 启动失败,见 $work\pg.log" }

try {
  & "$bin\createdb.exe" -p $Port -U postgres djyy_mig 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "createdb 失败" }

  # 组装 schema 副本(provider 一行切 postgresql)+ 现有 PG 迁移目录
  # 用 .NET API 显式 UTF-8 无 BOM 读写:PS5.1 的 Get-Content 默认按 GBK 读 UTF-8 会乱码,
  # Out-File utf8 又带 BOM,Prisma 解析器会在第 1 行报 P1012。
  $schemaText = [IO.File]::ReadAllText("$repo\backend\prisma\schema.prisma")
  $schemaText = $schemaText -replace 'provider = "sqlite"', 'provider = "postgresql"'
  [IO.File]::WriteAllText("$work\prisma\schema.prisma", $schemaText, (New-Object System.Text.UTF8Encoding($false)))
  robocopy "$kit\migrations-pg" "$work\prisma\migrations" /E /NFL /NDL /NJH /NJS | Out-Null

  $before = @(Get-ChildItem "$work\prisma\migrations" -Directory | Select-Object -ExpandProperty Name)

  Write-Host "==> prisma migrate dev --name $Name(应用现有迁移 + 对比 schema 差异)" -ForegroundColor Cyan
  Push-Location "$repo\backend"
  $env:DATABASE_URL = "postgresql://postgres@localhost:$Port/djyy_mig"
  npx prisma migrate dev --name $Name --skip-generate --schema "$work\prisma\schema.prisma" 2>&1 | ForEach-Object { "$_" }
  $mig_ok = ($LASTEXITCODE -eq 0)
  Pop-Location
  if (-not $mig_ok) { throw "prisma migrate dev 失败,见上方输出" }

  $after = @(Get-ChildItem "$work\prisma\migrations" -Directory | Select-Object -ExpandProperty Name)
  $new = @($after | Where-Object { $before -notcontains $_ })

  if ($new.Count -eq 0) {
    Write-Host "`n无变更:schema 与 migrations-pg 已同步,未生成新迁移。" -ForegroundColor Green
  } else {
    foreach ($d in $new) {
      robocopy "$work\prisma\migrations\$d" "$kit\migrations-pg\$d" /E /NFL /NDL /NJH /NJS | Out-Null
      Write-Host "`n已生成 PG 迁移并写回: deploy\synology\migrations-pg\$d" -ForegroundColor Green
    }
    Write-Host "下一步:.\release.ps1 发布(容器启动时 migrate deploy 自动应用)"
  }
} finally {
  & "$bin\pg_ctl.exe" -D "$work\data" stop -m fast 2>&1 | Out-Null
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
}
