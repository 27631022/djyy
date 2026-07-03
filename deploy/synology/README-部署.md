# 党建益友 · 群晖部署手册

> 定位:在信创服务器采购到位前,先用现有群晖 NAS 承载生产运行;设备到位后按本文末尾"数据迁移预案"平移(可行性已被 2026-07 采购前 POC 验证)。

## 一、前置条件(部署前逐项确认)

| # | 条件 | 说明 |
|---|------|------|
| 1 | DSM 已安装 **Container Manager**(DSM 7.2+)或 **Docker** 套件(DSM 7.1 及以下) | 套件中心搜索安装;若套件中心搜不到,说明机型不支持容器,本方案不适用(需换一台 x86 机器跑) |
| 2 | 空闲内存 ≥ 2GB | db + app + web 三容器合计约 1~1.5GB |
| 3 | NAS 能访问外网 | 首次构建需拉取基础镜像和 npm 依赖(已配 npmmirror 国内源);AI 功能运行时也需外网调大模型 API |
| 4 | 固定 NAS 的内网 IP(如 10.185.28.220) | DSM 控制面板 → 网络 → 手动配置;IP 变更需同步改 compose 里的 CORS_ORIGIN |

## 二、部署步骤

1. **上传部署包**:File Station 在 `docker` 共享文件夹下新建 `djyy` 目录,把部署包全部内容上传进去(或 SMB 拷贝)。最终结构:
   ```
   /volume1/docker/djyy/
     docker-compose.yml   app.Dockerfile   entrypoint.sh   nginx.conf
     backend/             web-dist/        exhibition-dist/  migrations-pg/
   ```
2. **改两处配置**(编辑 docker-compose.yml):
   - `POSTGRES_PASSWORD` 与 `DATABASE_URL` 里的密码改成强密码(两处保持一致);
   - `CORS_ORIGIN` 改成实际 NAS 地址,如 `http://10.185.28.220:5173`。
3. **创建项目**:Container Manager → 项目 → 新增 → 项目名 `djyy` → 路径选 `/docker/djyy` → 自动识别 docker-compose.yml → 完成。首次构建约 5~15 分钟(拉镜像 + npm 依赖 + 编译)。
   - 旧版 Docker 套件无"项目"功能:SSH 登录后 `cd /volume1/docker/djyy && sudo docker-compose up -d --build`。
4. **验证**:
   - 健康检查:浏览器开 `http://<NAS_IP>:3001/api/health`,应返回 `database: "up"`;
   - 前端:`http://<NAS_IP>:5173`,Mock 登录选 `admin`;
   - 3D 展厅:`http://<NAS_IP>:3001/exhibition/`;
   - 文件区:File Station 看 `docker/djyy/storage/`,上传证书/素材后此处出现业务文件夹。
5. **正式启用前**:确认演示数据无误后,删除 compose 里的 `SEED_ON_FIRST_RUN` 一行并重启项目(防止误重置);按需在系统内录入真实组织/人员(或走花名册导入)。
6. **桌面客户端(可选)**:`desktop/tauri.conf.json` 的 `window.url` 与 `capabilities/default.json` 的 `remote.urls` 改为 `http://<NAS_IP>:5173` 后重新打包 msi 分发。

## 三、日常运维

- **备份(必做)**:DSM 控制面板 → 任务计划 → 新增"用户定义的脚本",每天凌晨执行:
  ```sh
  docker exec djyy-db pg_dump -U djyy -Fc djyy > /volume1/docker/djyy/backup/djyy-$(date +\%Y\%m\%d).dump
  find /volume1/docker/djyy/backup -name "*.dump" -mtime +30 -delete
  ```
  (先在 File Station 建好 `docker/djyy/backup` 目录。)`storage/` 与 `backup/` 再纳入 Hyper Backup / 快照,实现异机保护。
- **更新版本**:推荐一键发布(见"六、一键发布与升级");手动方式 = 替换 `backend/`、`web-dist/`、`exhibition-dist/` 后,项目页点"构建"→"启动"。数据库与文件区在卷里,不受影响。
- **看日志**:Container Manager → 容器 → djyy-app → 日志;启动日志会显示迁移与种子执行情况。
- **改端口**:compose 里 `5173:80` / `3001:3001` 左侧数字可改;注意前端按"访问页面的 hostname + 3001"推断接口地址,**3001 对外端口不要改**(要改需前端以 VITE_API_BASE_URL 重新构建)。

## 四、数据迁移预案(信创服务器到位后)

迁移可行性已被《采购前运行验证报告》实测背书(系统在 PG 全链路 12/12 冒烟通过)。到时:

1. **文件区**:`storage/` 目录整体拷贝到新服务器的 `STORAGE_LOCAL_DIR`(按字节拷贝,勿转码文件名);
2. **数据库**(目标为瀚高/金仓等 PG 系):
   - 新库上先跑 `npx prisma migrate deploy` 建空表结构(与本部署同一套 migrations-pg);
   - 再导数据:`pg_dump -U djyy --data-only --disable-triggers -Fc djyy` → 目标库 `pg_restore --data-only --disable-triggers`;若目标库版本工具不兼容,退回 `--data-only --inserts` 纯 SQL 方式,量级小(GB 内)无压力;
3. **切换**:新服务器上改 `DATABASE_URL`/`CORS_ORIGIN`,用户改访问新 IP;群晖转回"备份 + 文件存储"角色(把新服务器的 `STORAGE_LOCAL_DIR` 挂到群晖共享盘即可延续 File Station 浏览习惯)。
4. **提示**:迁移前一天全量备份;迁移后跑一遍 12 项冒烟(脚本随验证报告留档)再对外切换。

## 五、一键发布与升级(日常推荐)

首次部署完成并做完下方"一次性配置"后,以后每次升级只需在开发机仓库根目录执行:

```powershell
npm run release                # = .\deploy\synology\release.ps1
```

脚本自动完成:构建两个前端 → 组包 → 存档(deploy\releases,保留最近 5 份)→ 推送到 NAS → 远程重建容器 → 健康检查转绿。**数据库结构变更也是全自动的**——容器启动时 `prisma migrate deploy` 会应用新迁移。

| 场景 | 命令 |
|---|---|
| 常规升级 | `npm run release` |
| 只改了后端(跳过前端构建) | `npm run release -- -SkipBuild` |
| 发布后跑 12 项接口冒烟 | `npm run release -- -Smoke` |
| 回滚到上一版 | `npm run release -- -RollbackZip deploy\releases\<某历史包>.zip` |

**升级纪律(唯一要记的)**:本次改动若动了 `backend/prisma/schema.prisma`,发布前先执行 `.\deploy\synology\new-pg-migration.ps1 -Name <变更名>` 生成 PG 方言迁移(脚本自动起停本地临时 PostgreSQL 完成对比),否则远端表结构不会变。

### 一次性配置(约 10 分钟,配好才有"一条命令")

1. **NAS 开 SSH**:DSM 控制面板 → 终端机和 SNMP → 启用 SSH;控制面板 → 用户帐号 → 高级设置 → 启用家目录服务;
2. **免密登录**:开发机执行 `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <用户>@<NAS_IP> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`(输入一次密码;之后 `ssh <用户>@<NAS_IP>` 应免密直进。群晖对权限位敏感,700/600 不能省);
3. **docker 免 sudo(二选一)**:
   - 优先:SSH 到 NAS 执行 `sudo synogroup --add docker <用户>`,注销重连后 `docker ps` 应可直接执行;
   - 备选:`sudo visudo` 追加一行 `<用户> ALL=(ALL) NOPASSWD: /usr/local/bin/docker`(release 脚本会自动尝试 sudo -n)。

未完成配置时脚本不会报废:自动降级为"组好包 + 打印手动两步"(SMB 拷贝 + Container Manager 点构建)。

### 待首次部署后验证清单

- [ ] `npm run release -- -Smoke` 全流程绿(推送→重建→健康→12 项冒烟);
- [ ] 用 `-RollbackZip` 回滚一次再发回来,验证可逆。

## 六、常见问题

- **构建卡在 npm**:NAS 出网慢,Dockerfile 已配 npmmirror;仍慢可重试,层缓存会续传。
- **5173/3001 端口被占**:群晖上有其它服务占用时,改 compose 左侧端口(3001 见上文注意事项)。
- **登录后接口全红**:多为 CORS_ORIGIN 与实际访问地址不一致(端口/IP 任一不同都算),改后重启 app 容器。
- **AI 功能不可用**:检查 NAS 出网;或后台"外部 API 接入"页更换可达的服务商地址。
