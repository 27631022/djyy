# 党建益友 · CLAUDE.md

> 任何 Claude 新会话进来,先读完整个文件(5 分钟)。这是项目宪法。
> README / docs/ 是对用户的,这份是对 Claude 的 —— 简洁、信号密度高。

---

## 项目是什么

**党建益友** = 企业内部的"应用底座" + 党务/业务功能。

- 底座作用:把多个已建好的内部系统(党建、办公、培训、考核等)统一接入,首页门户做导航 + 搜索 + 排行,后台做组织/用户/权限/插件治理
- 业务功能:党费缴纳、活动报名、组织关系、积分管理等(等插件机制上线后逐个迁入)

**真实使用场景**:个人/小团队开发,目标是"先跑起来 → 接入真实客户 → 按需扩展"。**不是 K8s 信创全栈大平台**,以前的 25KB 规划文档已经在第一次审议时被剪到现在的范围。

---

## 技术栈 + 选型理由(锁定)

| 层 | 选型 | 不选什么 + 原因 |
|---|---|---|
| 前端 | React 19 + Vite 7 + TypeScript + Tailwind 4 + shadcn/ui | 不用 Vue / Element Plus —— 用户已经写了 NavPage 不重写 |
| 状态 | zustand + @tanstack/react-query | |
| 后端 | NestJS 10 + Prisma 5 + **PostgreSQL(2026-07-03 起开发/生产统一,不再用 SQLite)** | 不用 Java/Spring —— 用户明确拒绝。本地=PG10 便携版(兜信创兼容),群晖生产=postgres:16 |
| 认证 | **统一登录已落地(2026-07-04)**:标准 OIDC 授权码流,自建 Casdoor 容器;`AUTH_MODE=mock/oidc` 双模式,dev 保留 Mock 秒切账号 | 代码按标准 OIDC 写(discovery),单位 SSO 将来开放时改 `OIDC_ISSUER` 四件套即可,零代码改动 |
| 应用拓展 | **模块化单体**(NestJS module 边界 + features/shared 前端分层)| ~~wujie 微前端 / .djyy 插件包~~ 两个方案都试过,solo dev 都过重,2026-05 改回 monolith |
| 部署 | Docker Compose(MVP) → K8s(规模化) | |
| 信创/达梦/麒麟 | **延后,等真实客户需求出现** | 不要预先适配 |

---

## 目录结构

```
djyy/                              ← git 根 + monorepo
├── CLAUDE.md                      ← 本文件(项目宪法,给 Claude 读)
├── README.md                      ← 给人看的自述
├── docs/
│   ├── conventions.md             ← 5 条模块化约束 + 命名约定 + 加新模块清单
│   └── roadmap.md                 ← 路线图 + 决策记录
├── package.json                   ← root,装 husky + 聚合 npm run check
├── .husky/pre-commit              ← react check + backend check + check:circular
├── react/                         ← 前端工程(features + shared 分层)
│   ├── src/
│   │   ├── features/              ← 业务模块,每个对齐 backend 模块
│   │   │   ├── auth/              ← api.ts + index.ts (无页面)
│   │   │   ├── certificate/       ← 证书 V1-V3:模板设计器/发证向导/公开验证/AI 提取/外部录入
│   │   │   ├── dictionary/        ← api.ts + pages/Dictionaries.tsx + index.ts
│   │   │   ├── exhibition/        ← 3D 展厅管理:展厅库 + 2D 拖拽搭建器(SVG 画墙/组件/吸附)+ 内容编辑
│   │   │   ├── external-api/      ← AI 平台配置(DeepSeek/豆包/千问 — key/model/优先级)
│   │   │   ├── nav-category/
│   │   │   ├── organization/
│   │   │   ├── permission/        ← api.ts + index.ts (无独立页面,合并在 role)
│   │   │   ├── role/
│   │   │   ├── site-setting/
│   │   │   ├── storage/          ← 文件上传/下载 client(storageApi.upload / fetchBlob / fileUrl)
│   │   │   ├── user/
│   │   │   ├── user-custom-field/
│   │   │   └── venue/             ← 会场管理:会议室/会场图设计器/排座向导/排座工作台/导出
│   │   ├── shared/                ← 跨模块复用基础设施
│   │   │   ├── api/client.ts      ← axios 实例 + 401 拦截器
│   │   │   ├── components/        ← IconPicker + ui/(shadcn vendor)
│   │   │   ├── hooks/             ← use-mobile
│   │   │   └── lib/               ← pinyinSearch、utils(cn)
│   │   ├── layouts/AdminLayout.tsx
│   │   ├── pages/                 ← 全局/跨模块页面
│   │   │   ├── NavPage.tsx        ← 前台门户首页
│   │   │   ├── Login.tsx          ← 双模式登录(GET /auth/mode 决定:mock 演示面板 / oidc 统一登录按钮)
│   │   │   └── NotFound.tsx
│   │   ├── stores/auth.tsx        ← AuthProvider + me 状态
│   │   ├── App.tsx                ← 路由 + QueryClient + ThemeBootstrap
│   │   └── index.css              ← 主题 utility class
│   ├── vite.config.ts             ← `@/` alias → src/
│   ├── tsconfig.app.json          ← noUnusedLocals / noImplicitAny / paths
│   ├── eslint.config.js           ← + eslint-plugin-boundaries(features/shared 边界)
│   └── package.json
└── backend/                       ← NestJS 模块化单体
    ├── prisma/
    │   ├── schema.prisma          ← 全表定义,每 model 上方有 `// @module: <name>` 归属注释
    │   ├── seed.ts                ← 演示账号 + 字典 + 导航默认数据
    │   └── migrations/
    ├── eslint.config.js           ← + eslint-plugin-boundaries(模块只能走 index.ts 入口)
    └── src/
        ├── auth/                  ← JWT HS256 会话 + OIDC 统一登录(oidc.service/controller,Casdoor)+ index.ts
        ├── audit/                 ← 审计日志 + index.ts
        ├── prisma/                ← PrismaService + index.ts
        ├── organization/          ← 双树(党 + 行政)+ index.ts
        ├── user/                  ← 用户 + memberships + index.ts
        ├── role/                  ← + RolePermission junction + index.ts
        ├── permission/            ← Permission 表(Guard 未启用) + index.ts
        ├── dictionary/            ← 2 级字典 + index.ts
        ├── user-custom-field/     ← 元数据驱动的用户扩展字段 + index.ts
        ├── site-setting/          ← 站点设置(单行 JSON) + index.ts
        ├── nav-category/          ← 首页导航(分类 + 项目两表) + index.ts
        ├── certificate/           ← 证书 V1-V3:模板 + 发证 + 公开验证 + AI 提取 + 外部录入 + index.ts
        ├── external-api/          ← AI 平台配置(provider/key/model/visionModel/优先级)+ index.ts
        ├── storage/               ← 统一文件存储:StorageDriver 抽象(本地盘默认 / 群晖·S3 占位)+ StoredFile + index.ts
        ├── venue/                 ← 会场管理:会议室 + 会场图设计 + 选座排座 + AI 生成布局 + 导出 + index.ts(4 表)
        ├── health/                ← /api/health + index.ts
        └── main.ts                ← listen 0.0.0.0,CORS dev 放开 *:5173
```

**模块约束**(详见 [docs/conventions.md](docs/conventions.md) `后端模块化约束(5 条)`):
1. 每张表归属一个模块(`schema.prisma` 用 `// @module:` 标注)
2. 跨模块调用走 NestJS DI,不直 prisma 别人的表
3. 模块对外只通过 `index.ts` barrel,**禁止** `import from '../user/user.service'` 这种深 import
4. 依赖图必须是 DAG,`madge --circular` 在 pre-commit 拦截
5. 新模块用固定骨架(module/service/controller/dto/index.ts/README.md)

前端类似:`features/<x>/` 只能通过 `features/<x>/index.ts` 被引用,`shared/<x>/` 同理。ESLint `boundaries/entry-point` 规则强制。

---

## 启动

```bash
# 前端
cd react
npm run dev                # http://localhost:5173

# 后端
cd backend
npm run start:dev          # http://localhost:3001/api

# 本地数据库 = PostgreSQL 10 便携版(2026-07-03 起,不再用 SQLite)
# 开机自启(计划任务 djyy-postgres);手动启动 = D:\web\pg10-portable\start-djyy-pg.cmd
# 连接串在 backend/.env:postgresql://djyy@localhost:5432/djyy(trust 认证,仅 localhost)

# 数据库初始化(首次或重置后)
cd backend
npx prisma migrate dev     # 生成/应用的就是 PG 方言迁移,发布即生产可用
npm run db:seed
```

默认账号(Mock 登录,点头像选):`admin`(系统管理员)、`wang_zs`(王总书记)、`li_mgr`(李经理)、`zhang3`(张三 普通党员)。

---

## 主题色 var 体系(重要)

**两个 CSS 变量**承载品牌色:

- `--party-primary`(默认 `#C8001E` 党建红)
- `--party-accent`(默认 `#F5A623` 金黄)

**注入方式**:`src/App.tsx` 的 `ThemeBootstrap` 组件在拉到 `/api/site-settings` 后,通过 `document.documentElement.style.setProperty` 注入到 `:root`。**前台 + 后台共享**,后台改主题色全站生效,无需刷新。

**使用方式**(写代码时):

| 场景 | 写法 |
|---|---|
| 文本/边框/背景跟随主题色 | `text-[var(--party-primary)]` / `bg-[var(--party-primary)]` |
| 淡色背景(8% primary 混白) | `bg-party-soft`(已定义在 index.css) |
| Hover 加深 primary | `style={{ backgroundColor: "color-mix(in srgb, var(--party-primary) 80%, black)" }}` |
| 透明度版 ring focus | `focus:ring-party-primary-10` / `focus:ring-party-primary-20` |

**什么时候不跟主题色变 — 语义色**:
- 党委红 / 总支橙 / 支部蓝 / 临时支部紫(`api/organizations.ts` 里 `ORG_TYPE_COLORS`)—— 组织类型语义
- 金牌 #F5A623 / 银牌 #C0C0C0 / 铜牌 #CD7F32 —— 奖牌语义
- HOT 红标签 / "进行中" 红标签 / 警告红边框 —— 状态语义
- 排行榜 4-6 名红色进度条 / 7+ 名灰色进度条 —— 排名层级语义

**判断原则**:跟主题色变的是"品牌色";不跟变的是"语义色"(改主题色为蓝时,金牌仍是金,党委仍是红,HOT 仍是红)。

---

## 关键约定(写代码前必读)

### 文件命名
- React 组件 / 页面:`PascalCase.tsx`(`NavPage.tsx`、`AdminLayout.tsx`)
- API client:`camelCase.ts`(`site-setting.ts`、`organizations.ts`)
- DTO:`kebab-case.dto.ts`(`update-site-setting.dto.ts`)
- 后端 module 文件夹:`kebab-case/`(`site-setting/`、`nav-category/`)
- React hook:`useXxx`(camelCase)
- 常量:`SCREAMING_SNAKE_CASE`(`SITE_SETTING_ID`)

### 中文命名
- "员工编号"(不是"账号"/"工号")
- "行政机构"(不是"行政组织")
- "一级单位 / 二级单位 / ..."(不是"集团 / 公司 / 部门")—— 已经规范化
- "党委 / 党总支 / 党支部 / 临时党支部 / 党小组"

### 后端 API
- 路径:`/<resource>`(`/users`、`/site-settings`、`/nav-categories`)
- 全部走 `/api` 前缀(`main.ts` 里 `setGlobalPrefix('api')`)
- CRUD 谓词:`GET` 列表/详情 / `POST` 新建 / `PATCH` 部分更新 / `DELETE` 删除
- 子资源走嵌套路径:`POST /nav-categories/:id/items`
- 公开接口:不加 `@UseGuards(AuthGuard)`(仅 GET 站点设置 / GET 导航 公开)
- 鉴权接口:加 `@UseGuards(AuthGuard)`(目前只校验登录,不校验权限点)
- 写操作要 audit:`this.audit.log({ action: '<domain>.<verb>', ... })`

### 前端 API
- `src/features/<x>/api.ts` 导出 `xxxApi.list / create / update / delete`
- `src/features/<x>/index.ts` re-export `'./api'` —— 其他 feature 只 `import { xxxApi } from "@/features/<x>"`(走 barrel,不深 import `/api`)
- 用 `@tanstack/react-query` 管缓存,`queryKey: ["<module>", ...]`
- 表单变更后 mutation 成功 → `qc.invalidateQueries({ queryKey: [...] })`
- 401 由 `src/shared/api/client.ts` 拦截器统一处理(清 token + 跳 login)

### 字典 vs 自定义字段
- **字典**(`Dictionary` + `DictItem`):2 级,管"下拉选项的可选值"。如"职务"、"学历"
- **自定义字段**(`UserCustomField`):元数据驱动,管"用户表上有哪些自定义字段 + 它的类型/校验"。如"入职日期"、"身份证号"

---

## 加新业务模块的清单

详细规则见 [docs/conventions.md](docs/conventions.md) `加一个新 admin 模块的 7 步清单`。简要骨架:

1. **Prisma schema** 加 model + `// @module: <name>` 注释 + `npx prisma migrate dev --name add_xxx`
2. **seed.ts** 加默认数据(可选)
3. **后端模块** `backend/src/<module>/`:
   - `index.ts`(barrel,**Module 放最后**)
   - `xxx.module.ts` / `xxx.service.ts` / `xxx.controller.ts` / `dto/*.ts`
   - 跨模块用 Service 走 NestJS DI,且 `import from "../<other>"`(barrel),禁止深 import
   - 在 `app.module.ts` 用 `import { XxxModule } from './xxx'` 注册
4. **前端 feature** `react/src/features/<x>/`:
   - `api.ts`(类型 + axios)
   - `pages/<Xxx>.tsx`(follow `Dictionaries.tsx` / `Navigation.tsx` 范本)
   - `index.ts`(re-export api + page 默认导出)
5. **App.tsx** 加路由,从 barrel `@/features/<x>` 引入 `XxxPage`
6. **AdminLayout.tsx** 在合适分类下加菜单项

每次修改后:
- backend: `npm run check` + `npm run check:circular`(0 error / 0 cycle)
- react: `npm run check`(0 error)
- 都过了再 `git commit`(husky 会再聚合跑一次)

---

## 当前进度(2026-05 更新一次)

### ✅ 已完成
- 平台底座 MVP:auth(Mock)+ Organization + User + Role + Permission(表已建,Guard 未启)+ Dictionary + UserCustomField
- 站点设置:标题/LOGO/Hero 文案/页脚/主题色,后台 4 tab 编辑
- 首页导航数据化:NavCategory + NavItem 入库,后台二级表格编辑,全 lucide IconPicker,URL 跳转
- 主题色全局 var 体系
- 基座加固:移除 unplugin-auto-import / 收紧 tsconfig+eslint / vite-plugin-checker + eslint / husky pre-commit
- 局域网开发支持:Vite + Nest 都 listen 0.0.0.0,API base 按 hostname 推断
- 行政 4 级单位(level1~4)+ 党委/总支/支部/临时支部/党小组 + 虚拟组织
- 2 级字典 popup picker
- 用户多组织归属 + 多角色 + custom scope
- **(2026-05-23)放弃微前端/插件包,转模块化单体** + 5 条后端约束 + 前端 features/shared 分层 + eslint-plugin-boundaries + madge 在 pre-commit 强制
- **(2026-05-23)证书管理 V1**:模板设计器(8 种元素 / 撤销重做 50 步 / 变量绑定 / 预览 / PNG+PDF 导出 / 缩略图)+ 模板 CRUD + 列表卡片。详见 docs/specs/2026-05-23-certificate-v1.md
- **(2026-05-24)证书管理 V2**:发证 + 公开验证 + AI 提取 + CSV 批量 + 外部证书。详见 docs/specs/2026-05-24-certificate-v2-issue-verify.md
  - 5 阶段闭环:Phase A 核心发证(单证 + 列表 + PDF 下载,certNo 格式 `{年}-{honorCode}-{总数}-{seq}`,事务保证批次唯一)
  - Phase B 启用 PermissionGuard + 公开 `/verify` 查询页(SearchBox 组件留给后续"首页综合查询"复用)
  - Phase C 撤销 + 多选批量下载 ZIP(jszip,文件名「荣誉-姓名-员工号.pdf」)
  - Phase D 接入 DeepSeek AI(用户上传 Word/PDF → 抽出表彰荣誉/年份/受表彰人 → 预填表单 → 人工确认发证)
  - Phase E 外部证书上传(source='external')+ CSV 批量发证(papaparse 解析 + 自动字段映射 + 进度条 + 失败行回显)
- **(2026-05-31)证书管理 V3**:把 V2 闭环抛光到"可交付"。发证向导拆 5 步;受表彰人单位/部门改**组织树点选 + 必填**(个人按工号/姓名兜底自动带出全称路径,按姓名补的/重名的标「待核对」;集体按名称匹配单位);公开验证页 `/verify/:token` 直显证书 + 修空白(16MB data:PDF → 14KB 缩略图);详情抽屉预览自动渲染;模板变量加「表彰年度」(默认上一年);编号总数段补零。详见 **docs/specs/2026-05-31-certificate-v3.md**
  - ⚠ 两个遗留(下次继续):① 证书 PDF/缩略图上烤的是**占位编号**(真号只在记录字段,需改发证流程先发号再渲染)② AI 提取慢——只需把 deepseek 模型 `v4-pro`→`v4-flash`(后台「外部 API 接入」页改 model,纯配置)。详见 V3 spec「已知遗留」+ `~/.claude/plans/ai-swirling-bear.md`
  - CSV 批量发证页已删(旧路线遗留),改用发证向导的粘贴识别
- **(2026-06-01)统一文件存储模块 + 证书切 storage**:新增 `storage` 模块(StorageDriver 抽象 + **本地盘 driver 默认**,群晖 File Station / S3 留占位)+ StoredFile 元数据表;文件按**业务文件夹**组织(证书 = 每个表彰一个文件夹「年度-荣誉名」,挂载群晖后在 File Station 里可浏览)。证书 PDF / 外部原件从 base64 进库改为**存 storage 只留 fileId**,缩略图仍存 DB(列表/公开页 `<img>` 用)。前端上传统一走 `@/features/storage` 的 `storageApi.upload` 拿 fileId 再提交;公开下载经 `/public/certificates/verify/:token/file` 流式。生产把群晖共享盘挂载到 `STORAGE_LOCAL_DIR`(本机当前 = `backend/storage-data`)即生效,零改代码。规格 + 群晖 File Station API 备忘见 **`~/.claude/plans/ai-swirling-bear.md`**
  - **(2026-06-01 续)瘦身 + 正确性 + 下载/文件名根治**:① 证书 PDF 内图 PNG→**JPEG q0.92**(单证 ~22MB→~1.5MB,治存储膨胀 + 跨机下载失败)② **占位编号 bug 已修(原 V3 遗留⑤)**——发证改「先 issue 发号 → 用真 certNo 渲染 → `attachFile` 回填」③ 下载全改 **axios 取 Blob → `blob:` 本地下载**(HTTP 局域网不触发 "insecure/HTTPS" 警告;批量走 token + 流式 ZIP 口)④ multipart 中文文件名 **latin1→utf8** 修复(原本落盘/下载名乱码)⑤ 删证书**联动删** storage 文件
  - ⚠ 仍遗留:① 表彰原始文件「同文件夹」未接(`Certificate.sourceFileId` 列已就绪,需把 Step1 上传件提到容器、发证前传一次)② `file:upload`/`file:delete` 已进 seed,现有 dev 库靠 platform_admin 直通(未整库 reseed)③ SynologyDriver / S3Driver 仅占位 —— 当前 HTTP 局域网用 axios-Blob 下载;将来上 HTTPS 可启用**签名 URL 原生下载**(后端 `/public/files/:id?sig` + `/files/:id/download-url` 已备好)④ **孤儿文件定期回收(GC)未做** —— 删证书已联动删,但"上传后放弃发证"的孤儿需定期清(建议加手动「清理孤儿文件」按钮:storage 列候选 → certificate 用自己表过滤在用的 → 删剩下)

- **(2026-06-01)任务分派系统 P1(地基 + 派发)**:新增 `task` 模块——通用「下发-填报-汇总」底座。6 张表(`TaskTemplate` 可复用表单 schema / `Task` 一次派发 / `TaskTarget` fan-out 单位or个人 / `TaskCollaborator` 协同填报人 / `TaskSubmission` 回执 / `UnitTaskRouting` 对口配置),均 `// @module: task`、跨模块 fileId/userId/orgId 松引用不建外键。字段元数据驱动(text/textarea/number/date/select/file/image/richtext/doclink + **分组 group/groupLabel** + 数字 min/max/unit/decimals),照 `UserCustomField` 扩展(`task-fields.ts` 的 `normalizeFieldDefs`)。本期落地**派发闭环**:模板 CRUD + 新建任务 4 步向导(选模板→信息→TargetPicker 组织树/个人多选→确认)+ fan-out + **对口路由**(派发部门命中 `UnitTaskRouting` 自动定责任人 assigned,否则 pending 待分派;个人直派即责任人)+ 我派发列表/详情。权限点 `task:manage/review/reception/fill`。规格 + 决策见 **`~/.claude/plans/task-dispatch-system.md`**。已过门禁(后端 0 error/0 cycle、前端 0 error/warning 不增=41)+ 浏览器冒烟(模板/列表/详情渲染正常、对口状态正确、0 console error)。
  - ⚠ 后续阶段(均在 plan 文件):P2 接收侧(接受管理员分派 + 对口配置 CRUD + 责任人/协同/转交 + 动态填报表单 FieldRenderer + 草稿 + 提交 + 退回重填 + 站内待办轮询角标);P3 汇总(数字求和 + 附件汇总 + 导出);P4 内置富文本 + 群晖在线文档 `DocProvider` 占位接入;P5 Tauri 桌面客户端(托盘后台轮询 + 原生通知,选 Tauri 因 HTTP 内网无 HTTPS、PWA 安装/推送失效)。
  - ⚠ 本期约束:不强制「派发范围 = 派发人 scope 子树」(有 `task:manage` 即可派给任意存在对象,scope 限制留 P2);新权限点已进 seed,但现 dev 库靠 platform_admin 直通(未整库 reseed,启用非管理员派发时跑 `npm run db:seed`);冒烟生成了示例模板「报送党员数据」+ 一条示例任务,可在 UI 直接删。
  - **(2026-06-01 续 P1.5)交互重做**:菜单并入「业务功能」(证书管理 / 任务管理 两组,不再独立顶级分类);新建向导照发证流程重排 4 步 —— ① 基本信息(任务名/描述/**上传通知文件** 走 storage/截止日期)② **三栏字段设计器 `FieldDesigner`**(左:类型面板点选添加 / 中:拖拽排序画布、点选高亮 / 右:属性=显示名·必填·分组名·类型·限制规则;**字段 code 自动生成 field_N、用户不填代码**;group 直接用分组名)③ 派发对象 ④ 确认。模板页也复用 FieldDesigner(删 FieldDefDialog)。Task 加 `noticeFileId/noticeFileName` 列(migrate `add_task_notice_file`),详情页可下载通知文件。字号整体调大。门禁双绿 + 浏览器冒烟通过。
  - **(2026-06-01 续 P1.6)设计器重做为 WYSIWYG 拖拽搭建器**(用户反馈 P1.5「像把弹窗钉进页面」后):引入 **`@dnd-kit`**(项目首个拖拽库)。`FieldDesigner.tsx` 拆到 `components/designer/`(FieldPalette / FieldCanvas / FieldCard / useFieldHistory / fieldDesignerUtils):左类型面板点选添加 + 中**所见即所得画布**(拖类型进来即渲染真实控件、点标题**就地改名**、卡片悬浮出 必填 `Switch`/复制/删除、卡右上「⚙」就近 `Popover` 改 类型/字典/范围/单位/分组名)+ dnd-kit 拖拽排序带动画 + **撤销/重做**(`useFieldHistory`,Ctrl+Z)。**受控 value/onChange 契约不变** → 向导/模板页零改 import;字段 code 仍自动 `field_N` 用户不填。`useFieldHistory` 用 state 存 past/future 栈(不读 ref 渲染,避开 `react-hooks/refs` error)。门禁 0 error / warning 不增(41)+ 浏览器冒烟(拖入成真实控件、就地改名、⚙、撤销重做、0 console error)。
  - **(2026-06-02 P1.7)新建任务向导重构 = 发证向导式 + workbench 皮 + AI 贯穿**:整页改「左竖步骤 / 右操作区」结构(借鉴 `CertificateIssue` 的 `grid-cols-[280px_1fr]`,底部固定导航)+ workbench 视觉(`PAGE_BG` 渐变 / `bg-white/85` 卡片质感 / 大字)。4 步:① **AI 上传识别**(`TaskStep1Upload`:删「重点描述」、「注意事项」改 **填报要求**;上传 Word/PDF → `POST /tasks/extract` 现返回 `{title, requirements, dueDate, fields[], scopeHint, suggestedUnits[]}` —— **按填报要求自动生成填报字段**(file/image/number/richtext… 避开 select 免缺字典)+ 建议范围;同份文件存为通知文件)② **设计填报**(`FieldDesigner fill` 充满右区,不再 460 小框;**去掉选模板**,改「**按填报要求生成字段**」=`POST /tasks/suggest-fields` + 「**复制往期任务字段**」下拉)③ **派发对象**(`TargetPicker` 重做:上下贯通充满区域、不再 `max-h-72` 小盒;**快捷选单位** = 全部一/二/三级单位一键 toggle + **自定义快捷组**(选中存名、`localStorage` 按 uid) + **AI 建议范围** banner(上传文件后按 `scopeHint` 层级 + 名称匹配 `suggestedUnits` 一键选))④ 确认。后端:Task 加 `notes` 列(=填报要求,migrate `add_task_notes`);`task-extraction.service` 抽 `callLlm` 复用 + `normalizeSuggestedFields`(code 重排 field_N、select→text);`ai-consumers` 加 `task.extract.text`。**任务模板菜单/路由已删**(后端 `task-template` 接口 + `TaskTemplates.tsx` 留孤儿,确认弃用再清)。门禁双绿 + 冒烟(suggest-fields 实测 上传件→file/党员数→number/照片→image 正确;快捷选「全部二级单位」→已选 2;Step3 充满 598px;0 console error;AI 已配 chat 模型)。
  - **(2026-06-02 续 P1.8)向导三处打磨 + 派发权限说明**(用户实测反馈):① **派发对象快捷选单位改虚拟机构维度** —— 组织树有「虚拟壳」层(`公司机关`/`基层单位` 是 `isVirtual=true` 的 level2 壳,真实单位 塔运司/各分公司/各部门 在其下为 level3),原按 DB `type` 的「全部N级单位」会误选虚拟壳;改为 `findWrappers` 列出虚拟机构,按钮「全选公司机关(11)/全选基层单位(34)」→ 选其**非虚拟直接子单位**;AI 按层级选时排除虚拟壳。② **复制往期任务字段**:原生 select → `CopyTaskPicker`(Popover 搜索框 + 可点任务列表)。③ **设计器重做为三栏 + 结构化分组**:左 palette +「添加分组」/ 中 分组容器画布(`FieldCanvas` 用 `useDroppable` 每组一容器,点字段类型加到「当前分组」、字段卡 dnd 跨组拖拽、组标题就地改名/删组)/ 右 `PropertiesPanel`(选中字段属性,**去掉「分组名」字段属性** —— 分组改由容器结构决定);`fieldDesignerUtils` 加 `UNGROUPED`/`buildContainers`/`flattenContainers`/`newGroupId`,`FieldCard` 去掉 ⚙ 弹窗改点选高亮 + 右栏编辑。④ **派发 403 友好化**:`taskApiErrorMessage` 把无 `task:manage` 的 403 转「请用系统管理员账号…」,toast 延长;`下拉缺字典/空显示名` 在第二步提前拦截(`findFieldIssue`,非 useMemo 避开 React Compiler 报错)。⚠ 排查确认:**花名册账号(工号登录,无角色)派发会 403,系统管理员 admin 正常**;用户选「管理员统一派发」,不动权限。门禁前端 0 error/41 warning,冒烟 0 console error。
  - **(2026-06-02 续 P1.9)字段类型精修(填报体验)**:① **下拉改自定义选项,去字典** —— `TaskField.options: string[]`,`normalizeFieldDefs` select 校验「≥1 选项」(不再要 dictCode);删 `selectDictCodes`;`task.service`/`task-template.service` 去 `DictionaryService` 注入、`task.module` 去 `DictionaryModule`。右栏「下拉选项」编辑器(增删行),新建默认带 2 项。② **文件字段**:最多个数**默认不限**(留空)、接受类型改**点选多选 chips**(PDF/Word/Excel/PPT/图片/压缩包,默认选 PDF·Word·Excel = pdf/doc/docx/xls/xlsx);file/image 去掉「提示/占位」属性。③ **在线文档**:`TaskField.link`,右栏改「链接地址」输入(取代提示/占位),卡片 + 预览显示链接 + 填写(填报点击打开,P2 接)。④ 右栏**去「显示名/必填」**(画布卡片已有就地改名 + 必填开关,所有类型不重复)。⑤ **报送截止日期改必填**(Step1 `*` + canNext 门禁拦截)。门禁双绿(后端 select 带选项 201 / 空选项 400 实测)+ 冒烟 0 console error。
  - **(2026-06-02 续 P1.10)字段类型注册表重构(每种字段独立、加新类型=加一文件)**:把原散在 4~5 处 switch 的 9 种字段类型差异收敛到 `react/src/features/task/fields/` 注册表 —— `types.ts`(`FieldTypeDef` 契约:`label/icon/order/makeDefaults/ownProps/hasPlaceholder/Preview(variant:designer|form)/Properties/validate`)+ 每类型一文件 `<type>.tsx`(text/textarea/number/date/select/file/image/richtext/doclink)+ `registry.ts`(`FIELD_TYPES`/`FIELD_TYPE_LIST`/`getFieldType`/`fieldTypeLabel`/`validateFieldDef`/`findFieldIssue`)+ `shared.ts`(纯常量/函数,含 `DEFAULT_FILE_ACCEPT`/`FILE_ACCEPT_PRESETS`)+ `widgets.tsx`(共享编辑控件 `PropRow`/`NumberInput`/`OptionsEditor`/`AcceptChips`)。消费方全改走注册表:`FieldCard`(`def.Preview variant=designer` + `def.icon`)、`TaskFormPreview`(`variant=form`)、`FieldPalette`(`FIELD_TYPE_LIST`)、`PropertiesPanel`(瘦成**通用壳**:类型下拉 / 占位按 `hasPlaceholder` 门控 / 说明 + 委托 `def.Properties`,去重复显示名·必填)、`fieldDesignerUtils.makeField/cleanForType`(用 `makeDefaults`/`ownProps`/`hasPlaceholder`,切类型只留通用 + ownProps)、`TaskCreate.findFieldIssue`(改用注册表版去重)。删孤儿 `components/fieldTypeIcons.ts` + `api.ts` 的 `TASK_FIELD_TYPE_LABEL`。**后端对称**:`task-fields.ts` 把 select/number/file/image/doclink 的 if 块抽成 `FIELD_SPECS[type].normalize` 注册表,`TASK_FIELD_TYPES` 由其键派生(`TaskField`/`TaskFieldType` 导出不变、extraction 仍 `.includes` 可用)。**加新字段类型 = 新建 `fields/<type>.tsx` + registry 注册一行 + api.ts 联合补一项 + 后端 FIELD_SPECS 加一条**;`Preview/Properties/validate` 已就位,**P2 填报控件再给契约加 `FillInput` 一处**即可(不再到处 switch)。eslint 加 `src/features/task/fields/*.tsx` 作用域关掉 `react-refresh/only-export-components`(注册表模块导出「定义对象」非纯组件,仿 shadcn vendor 块,让加新文件保持惯常 PascalCase 写法无噪声)。受控 `value/onChange` 契约不变 → 向导/详情零改 import。门禁:前端 0 error / 41 warning 不增、后端 0 error / 0 cycle;浏览器冒烟(palette 9 类齐、加 number/select/doclink 卡预览正确=select「选项一·2 项可选 ▾」+doclink「未设置链接…+填写」、右栏委托=select→OptionsEditor+9 类型下拉+无显示名/必填、类型切 select→number 经 `cleanForType(ownProps)` 丢 options 显数字属性、0 console error)。
  - **填报数据结构(汇总向)备忘**:`TaskSubmission.formData` = JSON `{fieldCode:value}`,每个 target 一份(`targetId @unique`);文件存 fileId(`fileIds` 冗余)。一个 Task → N TaskTarget → N TaskSubmission(均 `@@index([taskId])`)。**汇总 = 按 taskId 捞全部回执 → 用 `Task.fields` 元数据(type=number/unit/decimals/group)程序内求和/收附件 → 一行一单位+合计+导出**(非 SQL 聚合;org 量级几十~几百单位无压力)。要值级 SQL 查询再上 PG JSONB 或 EAV 明细表。P2 填报数字按 JSON number 存便于 P3 求和。
- **(2026-06-04 任务分派 P2 · 平级确认)机关↔机关互派需双方部门负责人确认后才下发**。组织 `meta.ownerUserId` = **部门负责人**(组织页编辑部门时下拉指定,候选=本部门成员;`buildMeta` 保留对口属性)。触发判定按**结构层级**:派发人在 L2 机关部门、目标是**其他** L2 机关部门 → 挂起;派给基层单位/L3/个人不触发。`TaskTarget` 加 7 列(migrate `add_task_peer_confirm`):`confirmStatus`(none/pending/approved/rejected)+ `senderConfirm`/`receiverConfirm`(各方决定)+ `*ConfirmById` + `confirmNote` + `confirmActedAt`。
  - **流程**:派发时发方负责人=派发人本人(或部门未设负责人)→ 发方自动通过,只等收方;`confirmStatus=pending` 的对象**不进任何人待办、不可认领**(inbox/claim 拦截);双方都 approved → 激活进收方待办;任一方 reject → 该对象作废(不连累同任务其他对象)。`platform_admin` 可代未决方推动(防死锁)。
  - **接口**:`GET /tasks/confirm-queue`(部门负责人「待我确认」队列)、`POST /tasks/targets/:id/confirm`{decision,note}、`POST /tasks/targets/:id/reinitiate`(派发人对**已驳回**对象**重新发起** → 重置回 pending、发方自动通过、清原因)。授权:确认由「我是相关部门 owner」在 service 判;reinitiate `@Permission('task:manage')` + dispatchUserId 校验。
  - **前端**:`ConfirmDrawer.tsx`(看任务内容:填报要求+通知文件+`TaskFormPreview` 表单结构 + 底部同意/驳回);「我的待办」顶部 **待我确认** 区(查看任务/同意下发/驳回);`TaskDetail` 派发对象行 `ConfirmCell` 显示待确认/已驳回(+原因)+ **重新发起** 按钮(`reinitiateConfirm`)。api.ts 加 `CONFIRM_STATUS_LABEL`/`confirmStatusChip` + `confirmQueue`/`confirmTarget`/`reinitiateConfirm`。门禁双绿(后端 0/0,前端 0 error/41 warning)+ 浏览器 + API 端到端冒烟(派发挂起→收方确认→进待办;驳回→排除;重新发起→回队列;越权 403/缺原因 400/非驳回重发 400 全过)。
- **(2026-06-04 任务分派 P2.5 · 指派承办人)部门收到任务后,有指派权限的人可把待接收任务指定给本部门成员承办**(不必等成员自助认领)。**权限驱动**:挂在**已有的** `task:reception`(原计划「任务接收管理(分派/对口)」),**不新建权限点**;有 `task:reception` 者可对「自己所在部门(及其下级)」的待接收任务指派。与平级确认负责人(`meta.ownerUserId`)**解耦** —— 确认归 owner、指派归 task:reception,可同人可不同人。
  - **后端**:`POST /tasks/targets/:id/assign`{userId}(service 内鉴权,无 `@Permission` 装饰器);`assign` 校验 = 有 task:reception(`getScopesForPermission` 判)+ 承办部门在我所在区域(`orgInActorArea`:目标是我任一 membership 的子树内)+ 承办人是该部门成员;`platform_admin` 直通。承办部门 = 对口责任部门 / 否则目标单位本身。inbox 每条加 `canAssign`/`assignOrgId`/`assignOrgName`(按同一规则算)。设 ownerUserId+in_progress,自助 `claim` 仍保留。
  - **前端**:`AssignPicker.tsx`(Popover 搜索本部门成员,`usersApi.list({adminOrgIds})`);「我的待办·待接收」行有指派权限时多「指派」按钮(与「接收」并列)。api.ts `TaskInboxItem` 加 canAssign/assignOrgId/assignOrgName + `taskApi.assign`。门禁双绿 + API+浏览器冒烟全过(有 reception 本部门可指派、无 reception 看不到/403、跨部门指派 403 区域、指派后进承办人「我负责的」)。
  - ⚠ **dev 库补授**:给 `dept_manager`/`party_secretary`/`enterprise_admin` 手工授了 `task:reception`(dev 库陈旧漏授;seed 本就有此授权)。非 git,reseed 后自动恢复(seed 已含)。
  - ⚠ dev 库测试数据(非 git,reseed 需重设):确认负责人 王金雨=党委组织部、张明=党群工作部、孙彩霞=综合办公室;指派权限靠上面补授的 reception(朱海君=党群工作部经理 dept_manager 即可指派)。要让某机关部门能互派确认,先在组织页给它设负责人。
- **(2026-06-04 续 · 派发/填报打磨)** 一批用户实测后的交互/正确性打磨:
  - **派发向导第一步**:报送截止日期回到**单个 `datetime-local` 控件**(默认「今天+10 天 15:00」,日期、时间都可改;TaskCreate 初始化 dueAt),与「派发部门」同一行。
  - **派发对象 `TargetPicker`**:① 删掉默认「快捷选单位」壳按钮(全选公司机关/基层单位),只留用户自存快捷组(localStorage),并去掉误导的「加载单位中」;② 去掉「党组织」tab —— **只派行政机构**;③ 节点/已选/AI 范围标签按 `isDept` 显示「**部门**」,不再把部门误显成「二级单位」(`orgTypeLabel`)。
  - **下载修复**:抽 `shared/lib/download.ts` 的 `downloadBlob`(**延迟 revoke** + `rel=noopener`,对齐证书 `triggerDownload`)。修了汇总(CSV/附件ZIP/单附件)+ 审核/确认抽屉 + 详情通知文件共 6 处「`click()` 后**立即** `revokeObjectURL` 抢跑 → HTTP 局域网下报 `loaded over an insecure connection` + 下载失败」。
  - **附件打包命名**:从「{单位}/{字段}-{原名}」分文件夹改为**扁平**「`{单位序号}-{单位(部门)名}-{字段名}({同字段多文件跟序号}).扩展名`」,单位按中文名排序编号(补零)。
  - **填报页**:标题下显示**派发部门 · 派发人 · 电话**(`tel:` 可拨),便于基层咨询;`getFill` 补返回 `dispatchOrgName`/`dispatchUserName`/`dispatchUserPhone`。
  - ⚠ dev 库补授:**孙彩霞 加 `dept_manager` 角色**(从而有 task:reception,可指派本部门;原只有 member+task_dispatcher)。非 git,reseed 自动恢复(她的角色不在 seed,reseed 后需按需重设)。
- **(2026-06-04 续 · 回执中文化 + 超期自动通过 + 定时任务底座)**:
  - **回执状态中文化**:填报页标题小标在非草稿态用的是回执状态(draft/submitted/returned/**approved**),而 `TASK_TARGET_STATUS_LABEL` 没有 `approved` 键 → 露出英文。加 `SUBMISSION_STATUS_LABEL`(approved=**已通过**)+ `taskStatusChip` 的 approved 绿色;TaskFill 用 `chipLabel`(草稿→对象状态,其余→回执状态)。
  - **超期自动通过**:任务**截止满 1 个月**(dueAt + 1 月 < 现在)、回执仍停「已提交」待审 → 自动转**已通过(回执 approved)+ 已完成(对象 done)**,reviewNote 标「(超过截止满 1 个月,系统自动通过)」。幂等只动 submitted、无 dueAt 不参与。`TaskService.autoCompleteOverdue()` + 管理员手动端点 `POST /tasks/admin/sweep-overdue`(service 内 isPlatformAdmin 判)。
  - **定时任务底座**:新增依赖 **`@nestjs/schedule@^4`**(适配 Nest 10)+ `app.module` 加 `ScheduleModule.forRoot()`。`TaskService` 用 `@Timeout(20_000)`(启动补扫一次)+ `@Cron(CronExpression.EVERY_DAY_AT_3AM)`(每天凌晨3点)替代手搓 `setInterval`。**以后加定时任务 = 任意 provider 里写方法挂 `@Cron('cron表达式')`**。⚠ 单进程内跑;上多副本需加分布式锁(单机 MVP 无虑)。验证:app 带装饰器干净启动 + @Timeout 触发(审计有 sweep)+ 手动扫描 count=1、数据正确转换。
- **(2026-06-04 续 · 技术债清理)**:
  - **删 task-template 死代码**:任务模板早已弃用(向导改「按要求生成 / 复制往期」),菜单/路由先前已删,本次清掉剩余孤儿 —— 后端 `task-template.{controller,service}.ts` + 2 个 dto + task.module 注册 + barrel 导出;前端 `TaskTemplates.tsx` + `taskTemplateApi` + 3 个类型 + barrel 导出。**保留** Prisma `TaskTemplate` 模型/表 + `Task.templateId` 列(免一次迁移;现作元数据无害)。门禁双绿、0 外部引用残留(仅 task/README.md 还提及,待后续顺手清)。
  - **孤儿文件 GC**(原延后项):新增 **`maintenance` 模块**(位于 storage/certificate/task 之上、无人依赖 → 不破 DAG)。「孤儿」=storage 里上传过、无任何业务引用、超 30 天宽限的文件(典型:走了上传但放弃发证/派发)。**`storage.softDelete` 删字节不可逆 → 报告优先**:`@Cron(EVERY_WEEK)` 只扫描 + 写审计(`maintenance.orphan-scan`),真正清理由管理员手动 `POST /maintenance/orphan-files/purge`(`admin:menu` + service 内再判 platform_admin)。「在用集合」由各模块自报 `collectInUseFileIds()`(certificate=pdfFileId/sourceFileId,task=noticeFileId/回执 fileIds)聚合 —— **新增引用 storage 文件的模块,务必在 `MaintenanceService.inUseFileIds()` 加上,否则会误删**。`GET /maintenance/orphan-files` 看报告。验证:孤儿 A 被标 / 在用 B 排除 / 非管理员 403 / admin purge 软删 A 不动 B。⚠ 暂无前端 UI(端点就绪,可后续加「清理孤儿文件」按钮)。
- **(2026-06-04 任务分派 P5 · Tauri 桌面客户端)`desktop/`(Tauri v2 瘦壳)**:窗口直接加载局域网 web 地址(前端改动零重打包),常驻系统托盘,关闭=最小化到托盘,后台轮询待办 → 新任务弹**原生桌面通知**。选 Tauri 因内网 HTTP 无 HTTPS、PWA 安装/推送失效。
  - **结构**:`src-tauri/tauri.conf.json`(`app.windows[0].url` = web 地址 + `withGlobalTauri`)+ `capabilities/default.json`(`remote.urls` 白名单 + `notification:default`,让远程页 JS 能调通知)+ `src-tauri/src/lib.rs`(`TrayIconBuilder` 菜单/左键唤起、`CloseRequested→hide()` 最小化到托盘、注册 `tauri-plugin-notification`)。Cargo `tauri` 开 `tray-icon` 特性。
  - **web 端集成**:`react/src/shared/lib/desktop.ts`(`isDesktop()`/`desktopNotify()` 走 `window.__TAURI__`,不引 `@tauri-apps` npm 依赖)+ `react/src/features/task/useDesktopInboxAlerts.ts`(挂 `AdminLayout`,每 90s 轮询 inbox,新「待接收」→ 通知)。浏览器里全 no-op。
  - **改加载地址** = 改两处:`tauri.conf.json` 的 `window.url` + `capabilities/default.json` 的 `remote.urls`(当前默认 `http://10.10.10.194:5173`)。详见 `desktop/README.md`。
  - **验证**:`cargo check` ✓ + 前端门禁 0 error/41 warning + **`npm run tauri build` 成功出 `.msi`/`.exe`**(`target/release/bundle/`)。需 Rust(stable-msvc)+ VS C++ 生成工具 + WebView2;`desktop/{node_modules,target}` 已 gitignore。
  - ⚠ 后续打磨:① 后台轮询在 JS 端,webview 最小化后 WebView2 节流定时器、通知可能延迟 → 要实时改 **Rust 侧轮询**(登录后经 IPC 把 token 传 Rust);② 托盘**未读角标**、通知点击直达填报、开机自启;③ 未签名安装包内网分发有 SmartScreen 提示。
- **(2026-06-07)头像 AI 生成 + 3D 后端 + 提示词集中管理 + 组织成员管理**(一批):
  - **头像 AI 生成**(`avatar` 模块):火山 **Seedream 5.0 图生图**(`doubao-seedream-5-0-260128`,i2i:image=base64 dataURL / `sequential_image_generation:'disabled'` / `response_format:'url'` / `size:'2K'`)—— 上传本人照片 → 职场风 3D 仿真人头像(**红底、提亮**);**原图按「姓名-工号」存 storage**(文件夹 `avatars/{工号}-{姓名}/`,下次上线不必重生成)+ **历史头像库**可挑选;接入用户管理「基本信息」tab;**全站当前用户头像统一显示**(首页右上 / 后台右上 / 客户端左上)——根因=avatarUrl 存相对 `/api/public/avatars/:id`,`<img>` 必须经 `resolveAvatarUrl()` 拼后端 origin,否则 5173 origin 404。
  - **3D 生成后端**(`model3d` 模块,为「3D 展厅」打底):火山 **Seed3D-2.0**(`doubao-seed3d-2-0-260328`)**异步任务**(`POST .../contents/generations/tasks`→`cgt-…`、GET 轮询 → `.glb`,前端 12s 轮询);`external-api` 能力注册表加 `image`/`3d`,`ExternalApi` 加 `model3d` 列(migrate `add_external_api_model3d` + `add_external_api_image_model`);`storage` 放行 `glb/gltf`。前端 `Model3dStudio` 上传→生成→`@google/model-viewer` 预览。⚠ Seed3D 很慢(10min+),成功路径收尾见交接任务 `~/.claude/plans/ai-3d-indexed-wren.md`。
  - **提示词集中管理**(`prompt` 模块):代码注册表 `ai-prompts.ts` 存默认值(**不 import 业务模块,守 DAG**)+ `AiPrompt` 覆盖表(key 主键,migrate `add_ai_prompt`)+ `PromptService.get(key)`=覆盖或默认;**task/certificate/avatar 提示词全抽离**,业务模块注入 `PromptService` 调 `await this.prompts.get(key)`;前端 `/admin/prompts` **左列表/右编辑**分栏页(改即生效、可恢复默认)。**以后加 AI 提示词 = ai-prompts.ts 加一条 + 业务模块 get(key)**。
  - **组织管理**:行政机构设为**默认 tab 且左置**(原党组织默认);**编辑行政机构抽屉加「成员」tab**(基本属性 / 成员 切换)—— 看直接成员 + 加(选现有用户搜索 / 新建用户,带职务)+ 移出,**改动即时生效**(不走表单保存);后端 `user` 加**单条归属增删**接口(`POST /users/:id/memberships`、`DELETE /users/:id/memberships/:orgId`,复合主键 `userId_orgId`,首条同类自动设主、删主自动提升、重复加 409)。党组织侧不变。
  - 门禁:前端 0 error / 41 warning(基线),后端 0 error / 0 cycle;org 成员增删接口 API 端到端冒烟过(加→查→重复 409→删→不存在 404)。
- **(2026-06-09)企业虚拟展厅 P1:后端 exhibition 模块 + 美观大气 3D 客户端**(规格 v2 修订见 docs/specs/2026-06-07-virtual-exhibition-hall.md 第 15 节;用户三方向=美观大气 / 2D拖拽建厅 / 后台内容编辑,本期落①打底③):
  - **后端 `exhibition` 模块**:`Hall` 表(空间 JSON:metaJson/wallsJson/fixturesJson,素材松引用 storage fileId)+ CRUD(`GET /halls`、`GET /halls/:id` 公开;写 `@Permission('exhibition:manage')`,已进 seed 并授 platform/enterprise_admin)+「**已解析**」逻辑(fileId→`/api/public/exhibition/assets/:id` 公开流式口,校验 ownerModule)+ 连接器占位注册表(P5 接证书/任务真数据)。
  - **中文 3D 文字管线**(新组件类型 **`text_3d`**):`GET /api/public/exhibition/font?chars=` 用 **opentype.js** 解析 `backend/assets/fonts/NotoSansSC.ttf`(思源黑体 OFL,~18MB 进 git)按需出 **typeface 格式 glyph 子集**(6 字 ~5KB;TTF 二次曲线只产 m/l/q,**q/b 终点在前**);客户端 `MeshBuilder.CreateText + earcut` 挤出,失败回退平面字。冒烟实测「企业文化展厅」金属红立体字完美。
  - **独立客户端 `exhibition-client/`**(Vite+TS+Babylon 9,无 React;**端口约定=对外只有 5173/3001**:build 产物由后端 3001 静态托管在 `/exhibition/`(main.ts expressStatic,`base:'/exhibition/'`,与 /api 同源零 CORS;改码后 `npm run build` 即生效);5174 dev server 仅本机热更,host 锁 localhost):数据驱动渲染(墙体挤出+碰撞 / 第一人称 WASD+指针锁定+移动端摇杆 / POINTERTAP 拾取→HTML 详情浮层 / WebXR 优雅降级)+ **美术包前置**(全 PBR+IBL 自托管 HDR、发光格栅吊顶+GlowLayer、反光地板、展品射灯+假体积光锥 `includedOnlyMeshes` 控灯数、画框/卡纸/玻璃、踢脚线/顶角线、ACES+FXAA+轻bloom、**三套主题预设**(默认 modern_light 浅色现代,党建红点缀)、精致占位面板、品牌化加载页)。seed 示例厅「企业文化展厅」(24×14m 序厅+主展区、挑高 4.5m、9 个组件覆盖全类型)。
  - **踩坑记录(都修了)**:① PBR albedo/emissive 要 `.toLinearSpace()`(sRGB 直喂会把党建红洗成粉,统一收在 materialFactory);② HemisphericLight `groundColor` 默认黑→吊顶发黑(补灰底色+吊顶微 emissive);③ 双面文字禁 DOUBLESIDE(背面镜像,改两块单面板);④ **同源 POST 浏览器也带 Origin** → 经 vite proxy 透传,后端 dev CORS 放行 `*:517[34]`(main.ts);⑤ fixture rot 约定 0=朝-Y,根节点 `rotation.y=-rot`、相机 `π-rot`;⑥ 子路径托管后 public/ 资源不能写死绝对路径(HDR 用 `import.meta.env.BASE_URL` 拼)。
  - **「局域网访问不到」根因记录(2026-06-10,已二次更正)**:真根因 = **v2rayN 的 Tun 模式(`xray_tun` 网卡)全局劫持网络栈** —— 局域网设备的请求能进来,但回包被 TUN 抓进代理,TCP 握手完不成(铁证:`arp -a` 里 10.185.28.220/172.20.10.1 等局域网邻居出现在 xray_tun 接口下;本机自测 10.x 也被劫持返 503)。**修复 = v2rayN 关 Tun 模式,或路由规则加私有网段(10/8、172.16/12、192.168/16)直连**。防火墙不是根因(Public/Private profile 本就 Disabled;djyy-5173/3001 放行规则已加,无害保留)。本机还同时跑着 Clash Verge(mihomo),两套代理并存易打架。办公网=10.185.28.192/26(有群晖 .220 等设备),多网卡给地址按用户设备所在网段给。
  - 验证:两端门禁 0 error(+backend 0 cycle);预览窗隐藏用「手动 scene.render() + canvas→/api/files 落盘」截 6 张图核对美术包全项;拾取命中 fx_model;console 0 红错。⚠ 遗留:VR 按钮需安全上下文(localhost 可、局域网 IP 要 TLS);HTML 浮层 VR 内不可见;Draco/KTX2 解码器未配(当前 glb 不压缩,要压缩资产时自托管)。
  - ⏭ **下轮 = 2D 拖拽搭建器 + 内容编辑**(react/ `features/exhibition`:SVG 画布画墙/拖组件/吸附/撤销重做,右栏按类型编辑内容,复用证书设计器+dnd-kit+useFieldHistory 范式;保存→新窗口 3D 预览)。
- **(2026-06-10)会场管理(venue)模块合并入 main**:把独立分支 `claude/stoic-ishizaka-b6b312`(AI 会场排座系统,141 提交)的成果并入主干。
  - **合并方式(关键)**:因两分支大幅分叉(main 已演进出 exhibition/avatar/model3d/prompt/maintenance,venue 分支均无),**不走 `git merge`**(会反删这些后期模块),改用「`git checkout <branch> -- backend/src/venue react/src/features/venue` 取纯新增文件 + **手工补** schema/app.module/seed/路由」。迁移在 main 当前 schema 上**新生成**(`add_venue_module`),不抄分支旧迁移。
  - **后端 `venue` 模块**:4 表均 `// @module: venue` —— `MeetingRoom`(实体会议室)/ `VenueLayout`(会场图,`layoutJson`=可序列化画布 VenueDesignerState)/ `SeatingPlan`(选座方案,rosterJson+rulesJson)/ `SeatingAssignment`(座位分配,seatId 引用 layoutJson 稳定 id)。venue 内部真 relation+cascade,指向外部 orgId/userId/fileId 松引用不建外键。Room/Layout/Seating/VenueAI 4 组 controller+service(AI 生成布局走 ExternalApiModule)。权限点 `venue:manage`(授 platform/enterprise_admin)+ 字典 `venue_roster_group`/`venue_special_type` + seed 示例「综合楼三楼大会议室」+ 标准表彰布局 60 座。
  - **前端 `features/venue`**:会议室列表 / 会场图设计器(SVG 画布+元素面板+图层+属性栏,复用证书设计器+dnd-kit 范式)/ 排座向导(4 步)/ 排座工作台(名单工作台+AI 智能排座+手动微调)/ 导出(座位图 PNG·PDF、安排表/签到表 Excel、对折桌签)。AdminLayout「会场管理」分组 3 项 + App.tsx 6 路由 + `DICT_CODES` 加两键。
  - **踩坑**:首次合并我自编 venue 路由/菜单(`rooms/:roomId/layout/new` 等)与页面内部 navigate 对不上 → 菜单只 2 项且点进 404;**改回分支原配置**(6 路由含 `seating/:planId/wizard`,新建会议=planId="new")后 preview 实测三页全渲染+后端数据通+0 console error。门禁:后端 0 error/0 cycle、前端 0 error/41 warning(基线)。**已删** 分支(3 个 claude/*)+ worktree + 残留 backend 进程。⚠ 分支里的 `task-template` 是 main 已删死代码,**未并回**。详见 commit `a9572104`(合并)+ `da30a504`(路由修正)。
- **(2026-06-10)企业虚拟展厅 P2:2D 拖拽搭建器 + 组件内容编辑**(用户方向②③,接 P1 的 3D 客户端):`react/src/features/exhibition/` 全新 feature,菜单「3D 展厅 → 展厅管理」(`exhibition:manage`),路由 `/admin/halls` + `/admin/halls/:hallId/design`。
  - **2D 搭建器**(`HallDesigner` 三栏):左 `FixturePalette`(选择/画墙工具 + 7 组件类型 stamp 放置 + 对象列表)/ 中 **`HallCanvas` SVG 画布**(米坐标×`M2U=50` 直接当 viewBox 单位、原点居中;`<pattern>` 双层网格;**滚轮缩放锚定光标 + 空白左拖/中键平移**(viewBox 平移缩放,非滚动容器);**画墙**=点击连线 0.5m 网格吸附+端点吸附+7° 正交自动拉直+实时长度标注,双击/Esc/右键收笔;**贴墙组件自动吸附**(`snapFixtureToWall`:投影到最近墙段、偏移 `WALL_T/2+d/2`、朝向=背墙朝外,门吸在墙中线;Alt 取消);旋转手柄 15° 步进(Shift=1°);出生点可拖)/ 右 `PropertiesPanel`(未选=厅设置 墙高/网格/主题预设/点缀色/镜面地板/出生点;选中=通用属性+**按类型内容编辑器**)。撤销重做 `useHistory`(copy 同源)+ 快捷键(Ctrl+Z/Y、Delete、R 旋 90°、方向键微移)。
  - **内容编辑**(`ContentEditors`,方向③):图片展柜=多图上传+图注+排序;视频墙=mp4/webm+封面;模型台=.glb+缩放+自转;荣誉墙/党务板=条目编辑 + **数据来源切换 手动/连接器**(GET /connectors,P1 占位标「待接入」);立体字=文字/字高/厚度/颜色/质感(烤漆·金属·发光)/安装(贴墙·落地)。上传统一 `storageApi.upload({ownerModule:'exhibition', folder:hallId})`,预览用公开口 URL。
  - **保存链**:剥后端「已解析」旁补的 url 键(`stripResolvedUrls`)→ PATCH /halls/:id + **平面缩略图**(canvas 2d 画墙/组件/出生点 → PNG 传 storage → `thumbnailFileId`,旧图顺手删);「3D 预览」=先保存再开 `/exhibition/?hall=<id>`(vite 已代理);发布/下架按钮。列表页 `Halls`=卡片(缩略图+发布态+布展/3D/删除)+ 新建对话框(名称+三主题预设,初始 16×10m 矩形房)。
  - **后端配套**:`ResolvedHall` 加 `published`(三处契约同步:backend/react/exhibition-client);**`ExhibitionService.collectInUseFileIds()`**(thumbnail/envModel/fixtures 深层 `*FileId`)→ **`MaintenanceService` 聚合** + ⚠ 顺手修了潜在数据丢失:孤儿 GC 原本不分模块,**avatar(头像库)/model3d(生成历史)整库会被当孤儿 purge 真删** → 加 `LIBRARY_MODULES` 豁免(这俩设计上常驻、无业务表逐条引用)。
  - **React Compiler 踩坑**:① render 期读 `dragRef`(光标样式)→ `react-hooks/refs` error,改 `panning` state;② 「加载→effect 同步 setState」让编译器跳过组件、连带全部 useCallback 报 `preserve-manual-memoization` error → **数据就绪后以 `key={hall.id}` 重挂载内层组件,编辑态全用 useState 初始化器起步**(无加载 effect),画布初始视野也在 useState 初始化器里按内容包围盒适配。模式可复用:**取数页面想零 effect 同步,就拆「外壳查询 + key 重挂载内层」**。
  - 验证:双端门禁 0 error(前端 41 warning 基线持平、后端 0 cycle);preview 端到端冒烟=列表卡片→设计器加载 seed 厅(6 墙 9 组件平面图正确)→palette 点立体字→画布点击放置(9→10)→右栏出 text_3d 编辑器→保存(POST /files 201 + PATCH 200 + toast)→Ctrl+Z 撤销(10→9)→再保存恢复→`/exhibition/?hall=` 200;console 0 error。
  - ⏭ 下轮:门洞挖墙(P4)/ 装饰组件库 / 连接器真数据(P5:荣誉墙→证书、党务板→任务)/ VR 内网 TLS(P7);模型台「从 3D 生成历史挑选」(现仅提示去下载再上传,因公开素材口校验 ownerModule=exhibition)。
- **(2026-06-10 续 P2.1)用户实测三反馈修复:2D/3D 镜像 + 门洞/地板/绿植 + 面板 tab**:
  - **★2D/3D 左右镜像(根因+修法记牢)**:平面图是屏幕坐标(y 向下),Babylon 左手系直接 `z=+y` 时俯视 +z 视觉朝上 → **整个世界手性翻转**(平面图放左边,3D 里跑右边)。修法 = 客户端 `hallApi.get` 后**一次性归一化**:`y→-y`(墙/组件/出生点)+ `rot→(180-rot)%360`(组件/出生点),后续 builder(z=+y、root `rotation.y=-rot`、相机 `π-rot`)**零改动**。数学校验:spawn rot=0 → 相机 yaw=0 → forward=+z=平面图上方、右手=+x=平面图右侧 ✓。实测荣誉墙 平面(4,6.7)→3D z=-6.7 ✓。
  - **门洞挖墙(原 P4 提前)**:`wallBuilder.buildShell` 接收 fixtures,door 组件投影到墙段(垂距≤0.4m)→ 墙切成**实体段(全高带碰撞)+ 门洞过梁**(净高 2.5=门套梁底,其上补墙到顶);踢脚线随实体段,顶角线通长。人可穿行,多门/重叠门洞自动合并。
  - **程序化地板砖纹**(治「纯色不像地板」):`makeFloorTexture` DynamicTexture 画 1m 石材砖(主题地板色基调 + 每砖确定性微明暗 + 深色砖缝 + 细对角纹),`uScale=跨度/4`;floorMat albedo 给白、基色烤进贴图,粗糙度不变保 IBL 反光。零素材文件。
  - **装饰组件**(新类型 **`decor`**,契约三处同步):`DecorContent{kind:'plant'|'plant_short'|'bench'}`,`decorBuilder` 程序化建模(绿植=盆+干+错落压扁球叶团,确定性位置;长椅=木座+金属腿),**不可点击不配射灯**。
  - **设计器面板改版**(用户要 tab+扁平):`FixturePalette` 改 Tabs(展示组件 / 门·装饰)+ **整行扁平按钮**(h-8 图标+名+贴墙角标);装饰按**变体**出按钮(绿植/矮盆栽/长椅),`CanvasTool.stamp` 加 `preset{label,w,d,content}` 贯通 makeFixture/幽灵;右栏 decor 出样式下拉。
  - 验证:三端门禁 0 error(react 41 warning 基线);`npm run build` 出 dist;preview 开 3D 用 `__hallDebug` **数值断言**(荣誉墙 z=-6.7/相机 yaw90/w3 切 2 段+过梁/floorHasTexture/植物 6 件椅 3 件)+ 截图核对(砖纹地板、门洞透视、长椅);测试组件已清理(保留用户实验编辑)。⚠ 用户在设计器试画的墙(`w_il6gsqf`)上的门也正确挖洞 —— 真实数据双重验证。
- **(2026-06-10 续 P2.2)四需求:AI 生成展厅 + 右键旋转/地板字/引导箭头 + 门传送互通 + 顶端吊牌**:
  - **AI 生成展厅**(按既有 AI 范式):`ai-prompts.ts` 注册 `exhibition.generate`(坐标系/组件规则/布置约束全在提示词里,后台「提示词管理」可调)+ `ai-consumers` 加 `exhibition.generate.text`(chat)/`.vision`(参考图);`ExhibitionAiService` = PromptService 取词 + 文字/选项拼 user 消息 + 参考图(storage→base64 dataURL,>8MB 拒)走 vision;**返回强归一化**(类型白名单/坐标钳±60/id 重排/content 按类型兜底/preset·accent 校验),**不落库** —— 前端 `GenerateHallDialog`(描述 textarea + 尺寸三档 + 色调三选 + 功能 chips 多选 + 可选参考图)应用进画布 = 一步可撤销,确认后正常保存。`POST /halls/ai-generate`(exhibition:manage)。**真调冒烟过**:LLM 返回 4 墙 9 组件、自发用上 ceiling_sign/decor 新类型。
  - **右键旋转**:2D 画布组件上右键 = 旋转 90°(`fixtureContextMenu` 阻止冒泡,不触发画布右键退出工具)。
  - **地板字**(text_3d `mount:'flat'` 新值):3D 平躺 —— **`rotation.x=+π/2` 字面朝上,-π/2 是背壳=镜像**(AB 双截图实测敲定);正读站位 = fixture 正面侧(2D 朝向小三角那侧),要换读向把组件转 180°。⚠ 排镜像时一度误判:从组件**背面**看平躺字是 180° 倒字,长得像镜像 —— 先数值断言 `getDirection` 看法线/字顶朝向再下结论。
  - **地面引导箭头**(decor `kind:'arrow'` 新值):`MeshBuilder.CreatePolygon`(XZ 平面原生,earcut)画箭头多边形贴地 y=0.012,点缀色+微 emissive;w=长度 d=宽度,沿 fixture 朝向指引。
  - **门传送(展厅互通)**:`DoorContent{targetHallId,targetName}` 契约三处同步;设计器门属性「通往展厅」下拉(列其它厅);3D 门头牌显示「→ 厅名」,`main.ts` onPick 拦截 door+targetHallId → `location.href=?hall=目标`。**模拟点击实测跳转成功**(注:伪造 `notifyObservers({type:32})` 会被前序观察者断链,要用 `scene.simulatePointerDown/Up(pickInfo)` 官方 API 模拟)。
  - **顶端吊牌**(新类型 `ceiling_sign`):双吊杆(吊顶垂下)+ 点缀色牌身 + **双面文字**(两块单面板背靠背,canvasTexture;牌心高 min(wallH-1.05, 3.2) 保头顶净空);可点击。设计器 palette「展示组件」tab 加入,右栏编辑牌面文字。
  - 验证:三端门禁 0 error(react 41 warning 基线)+ client build;3D 数值断言(平铺字 rotX=90/箭头 mesh/吊牌 5 件 y=3.2/门 metadata 带目标)+ 截图(箭头+吊牌+正读地板字)+ 传送实测进「测试B厅」+ AI 接口真调;测试数据(4 组件+临时 B 厅)已清理。
- **(2026-06-10 续 P2.3)展柜双面 + 未来科技风主题 + 组件精致化**(用户三需求):
  - **图片展柜双面**:`imageCaseBuilder` 重构 `mkFace(side)` —— 正面第 1 张图、背面第 2 张(只有一张则两面同图),卡纸/图片/玻璃正反各一套(背面板 `rotation.y=π`);中岛摆放两侧可看。
  - **未来科技风**(新 preset **`future_tech`**,`HallThemePreset` 三处契约同步):深空蓝黑 + 霓虹青 #00D4FF;`ThemeParams` 加 **`floorStyle:'tile'|'tech'`**(makeFloorTexture 加 tech 分支:深底+发光网格线+交点亮斑,**同一张纹理喂 albedo+emissive** —— 线亮底黑,只有线发光)+ **`trimGlow`**(踢脚线/顶角线 emissive → 全场发光描边,GlowLayer 拾取);地板 roughness 0.06 近镜面网格倒影。接入五处:PRESET_LABEL/新建对话框/AI 生成对话框/AI 提示词(四选一)/ai-service 白名单。实测截图 = TRON 风。
  - **精致化**:展柜四边金属包边条(点缀色金属+微发光)+ 底座正反点缀灯线;模型台加 **底部发光环 + 台面下灯线环**(Torus emissive)+ **玻璃罩**(圆柱 glassMat 罩展品)。
  - 验证:三端门禁 0 error + client build;数值断言(floorEmissive/trimGlow/展柜每柜 2 面共 10 面/包边 20 根/光环 2 玻璃罩 1)+ 科技风全景截图;seed 厅主题已恢复 modern_light。
- **(2026-06-11 P2.4)模型台大修:模型不显示根治 + 圆/方台 + 长宽高 + 介绍牌**(用户四需求):
  - **「上传模型不显示」三个根因全修**:① 用户 glb 引用**外链贴图散文件**(39 张 jpg 没一起上传)→ Babylon 单图 404 整模加载失败回落占位晶体。修法 = 新增**兄弟文件素材口** `GET /public/exhibition/assets/:id/rel/*`(wildcard `@Param('0')`):`__self__`=主文件本身;其余按「同 ownerModule+folder+原始文件名」精确找配套上传的散文件(`StorageService.findByName`);**缺失的图片类资源回 1×1 白 BMP 兜底**(手工 58 字节构造,不靠记忆 base64)→ 模型永远能加载,缺图处素色;.bin 等非图缺失仍 404(几何缺了就该失败)。客户端加载改 `LoadAssetContainerAsync('…/:id/rel/', '__self__', …)`,glb 内相对 uri 自动落到 /rel/。编辑器配套「上传贴图(可多选)」存 `textures:[{fileId,name}]`(进 content 保 GC 在用)。② **包围盒 bug**:原 `root.getHierarchyBoundingVectors` 把台身/玻璃罩算进模型包围盒 → 小模型永远不被放大。修 = `container.createRootMesh()` 后、挂 root 前量模型自身,逐轴 fit(台面+0.1 × maxH × 台深+0.1)。③ **自转 bug**:glTF `__root__` 带 rotationQuaternion,直接设 `.rotation` 无效 → 包一层 holder TransformNode 转 holder。
  - **upAxis 摆正**:很多模型 z-up 导出(用户的卡车在 3D 里竖立)→ content 加 `upAxis:'y'|'z'`,z = `modelRoot.rotation.x=-π/2` **先转再量包围盒**,贴台/居中算式零改;编辑器「模型朝向→横倒摆正」。
  - **圆/方台 + 长宽高**:`shape:'round'|'rect'`(圆柱/长方体台身,玻璃罩/发光圈同步两形态——方台灯线用薄发光板替代 Torus);**台面长宽=fixture.w/d**(3D 端原来完全没用 w/d,固定 0.62m;现 clamp 0.4~6m)+ `standH` 台面离地高(0.3~1.6m,默认 1.0)。
  - **介绍牌**:`intro` 非空时台旁(正前右侧)立**讲台式斜面介绍牌**(金属斜杆+深背板+白面板 canvasTexture:点缀色顶条+标题+wrapCjk 折行正文,面板上仰 0.6rad 朝上前方);点击台/牌 → overlay 显示介绍全文(textContent 防注入)。
  - **⚠ 顺手修了潜在数据丢失**:`ExhibitionService.collectFileIdsDeep` 只匹配 `*FileId` 后缀(大小写敏感)→ 展柜图片的裸 `fileId` 键**不被计入在用** → 孤儿 GC 会把展柜全部图片当孤儿购删!修 = `k === 'fileId' || k.endsWith('FileId')`。
  - 契约三处同步(backend/client/react)+ AI 提示词与归一化(shape/standH/intro);`stripResolvedUrls` 已覆盖 textures[].url。验证:门禁三端 0 error;/rel/ 三行为 HTTP 实测(主文件 200 / 缺图 200 image/bmp / 缺 bin 404);3D 数值断言(模型加载✓尺寸逐轴 fit✓贴台 baseY=1✓圆台 198 顶点/方台 24 顶点✓standH 0.7→topY0.675✓介绍牌两块✓)+ 截图(卡车 upAxis=z 躺平在圆台、介绍牌文字清晰);测试厅+6 张临时截图已删;**用户「职工之家」的模型台顺手修到可用**(0.1m 深→1.6×1.6 + upAxis=z,已在其真实数据上截图验证)。
  - **(2026-06-11 续)贴图传了仍黑 + 材质/阴影兜底 + A/D·Q/E 对调**:① 用户配套传了 39 张贴图但整车仍近黑 —— 不是链路问题(贴图已挂上),是该 glb 导出事故:全部材质 `baseColorFactor≈#040404`(因子×贴图=黑)+ `metallic=1`+灰度图乱接 MR 槽。兜底(modelStandBuilder 加载后):**有 albedo 贴图却近黑因子(max(r,g,b)<0.25)→ 因子钳白 + 断 metallicTexture + metallic 0.15/roughness 0.7**;规范模型不命中。实测 ZIL 卡车蓝绿锈迹涂装/白格栅/车牌全显色。② **模型自带烘焙阴影片**(`shadow` 材质 4 顶点大平面,贴图断链 → 白色长方形)按名隐藏;**包围盒改手动累计 enabled 网格**(getHierarchyBoundingVectors 把禁用阴影片也算进去,且行为不稳 —— 阴影片常比车体大,fit 被撑小还偏心)。③ 漫游按键对调:**A/D=左右转视角、Q/E=左右横移**(方向键/鼠标不变),合成 keydown 数值断言(A/D 只转不移 ±0.959rad、Q/E 只移不转)。
- **(2026-06-11)3D 生成调试根治 + 模型库**(用户三需求:模型库管理 / 白色长方形(见上②) / 调试 3D 生成):
  - **3D 生成两层根因全修**:① **doubao 能力标签丢失** —— `model3d.generate` 消费点按 `3d` 能力路由,而 DB 里 doubao caps 只剩 `chat,vision,reasoning` → 报「未找到可用模型」。**真凶是 seed.ts**:externalApi upsert 的 **update 块每次 reseed 都覆盖 capabilities**,而 seed 默认值没带 `image,3d` → 2026-06-07 在 UI 勾的能力被后来某次 `db:seed` 冲掉。修 = DB PATCH 回 `chat,vision,reasoning,image,3d` + **seed 默认值补全**(imageModel/model3d 字段 + 两标签,update 块同步刷新)。② **Seed3D 产物是 ZIP 不是 glb**(「成功路径收尾」一直没做的部分):`file_url` 下载的是 zip(内含 `pbr/mesh_textured_pbr.glb`),直接当 .glb 存 → 客户端解析报 `"PK…" is not valid JSON`。修 = getTask 下载后**按魔数识别**(`PK` → jszip 解包抽第一个 .glb;`glTF` 原样),产物改可读名 `3D生成-YYYYMMDD-HHmm.glb`;**存量 2 个 zip 已解包重存 + 删旧**。端到端真测:创建任务 201(cgt-…)→ running → done → 入库。
  - **模型库**(菜单「3D 展厅 → 模型库」,`/admin/model-library`):后端 `GET /exhibition/model-library`(exhibition:manage)合并两源 —— 手动上传(`exhibition/model-library` 文件夹,前端 storageApi.upload 直传)+ AI 生成历史(`model3d/models`),按 .glb/.gltf 过滤、时间倒序;**公开素材口放行 `ownerModule=model3d`**(`ALLOWED_MODULES`,解掉 P2 遗留「从 3D 生成历史挑选」阻塞,/rel/ 兄弟解析也按主文件自己的模块+文件夹找)。前端 `ModelLibrary.tsx`(卡片网格 + 点击挂载 model-viewer 按需预览(模型动辄几十 MB 不全量拉)+ 来源徽标 AI生成/上传 + 多选上传 + 删除带「展台在用会变占位」提醒);**ModelStandEditor 加「从模型库选择」**展开面板(上传/AI 两源同列,点选即设 modelFileId+modelName)。
  - 验证:三端门禁 0 error/0 cycle + client rebuild;模型库接口/页面/设计器选择面板/素材口 200 全冒烟;库现存 2 个真 glb(`3D生成-20260607/20260611.glb`,魔数 glTF 实测);临时脚本与截图全清。⚠ 隐藏 preview 窗里 model-viewer 不渲染(IntersectionObserver 懒加载),loaded 断言只能真窗口做 —— 网络 200 + 魔数即可作隐藏窗验证。
- **(2026-06-11 续)模型库二期:幂等防重复 + AI 起名 + 缩略图 + 标签/搜索**(用户四反馈):
  - **「一张图生成出一堆」根因**:下载入库要十几秒 > 轮询 12s,前端 `setInterval` 不等上次返回 → 任务 done 后排队的几个轮询请求**各自下载入库**(审计实锤同一 arkTask 入库 5 份)。修 = `Model3dService` 幂等三件套:`inFlight`(并发共享同一 Promise)+ `doneCache`(完成结果缓存)+ **审计兜底**(重启后查 `model3d.done` 复用已入库产物,产物被删则重下);4 份重复已清。⚠ 注意 audit detail 是双重 stringify(业务传 string,audit.log 再 stringify),读取要再 parse 一层(`parseDetail` 兼容)。
  - **AI 看图起名**:createTask 时异步用 vision 模型概括源图物品名(新消费点 `model3d.name.vision` + 提示词 `model3d.name`,均进注册表;`PromptModule` 进 model3d.module),done 时产物命名「物品名-MMDD.glb」,失败回退「3D生成-MMDD」。
  - **缩略图=源图副本**:done 时把生成用的源图复制到同夹、命名 **`<产物文件名>.thumb.<ext>`**(列表按名字配对;改名时同步改 thumb 名保配对);卡片**默认显示物品截图、点击才挂 model-viewer**(模型几十 MB 不全量拉)。重启丢上下文时从 `model3d.create` 审计找回源图。
  - **改名/标签/搜索**:新表 `ModelLibraryMeta`(fileId 主键 + tags JSON,`// @module: exhibition`,migrate `add_model_library_meta`;松引用,删模型残留行无害);**`StorageService.rename`**(通用改 originalName,审计 file.rename;不动磁盘 storageKey);`PATCH /exhibition/model-library/:fileId` {name?, tags?}(改名自动保留扩展名);前端 `ModelLibrary` 重写 = **左侧综合搜索分栏**(关键词搜名称/标签 + 来源筛选 + 标签分类计数)+ 卡片就地改名(铅笔)+ 标签 chips 增删。`ExhibitionModelLibraryService` 承载逻辑(controller 瘦)。
  - 验证:双端门禁 0 error;浏览器端到端 = 打标签「设备」→ 卡片 chip + 左栏「设备(1)」分类出现、搜「咖啡」过滤到 1 张、缩略图真照片显示;存量数据已整理(重复删、咖啡机/职工之家改名+补缩略图)。⚠ Windows 下 `prisma migrate dev` 会因 nest watch 锁 dll 而 generate 失败 —— 先停 3001 进程再 migrate/generate 后重启。
  - ⏭ 模型台「从模型库选择」面板后续可加缩略图与搜索(现为名字列表);Model3dStudio 生成完成页可提示「已入库,去模型库管理」。
  - **(2026-06-11 续)缩略图改 3D 渲染截图(用户:别用源照片)**:模型库前端发现缺图模型时,**隐形 model-viewer 渲染一帧 → toBlob(png) → 上传「<模型名>.thumb.png」**(一次截一个;空帧守卫 size<8KB 不上传防黑图;失败进跳过集合不死循环;`document.visibilityState` 初始化器门控)。后端 model3d 不再复制源图作 thumb;配对/改名联动泛化到上传源(thumb 在模型自己的 模块+文件夹 找)。**React Compiler 坑**:`createElement` 手写 props 传 ref 对象报 `Cannot access refs during render` —— 改 **React 19 callback ref(可返回 cleanup)**,连 useEffect 都省了。验证:用户真实浏览器自动截齐 4 张(咖啡机/铁人王进喜铜像渲染图实查);门禁 0 error/41 warning 基线。
- **(2026-06-11)文化墙挂件 wall_decor:三套程序化浮雕模板**(用户发参考图要「墙上浮雕造型挂件」,问导入 CDR 还是自建编辑器;结论=都不选 —— CDR 私有格式无可靠 JS 解析器(要导也是 CorelDRAW 另存 SVG),自由矢量编辑器 solo 重造打不过设计师成品 → **P1 参数化模板(本期)+ P2 SVG 导入(后续)**):
  - **新组件类型 `wall_decor`**(契约三处同步):`WallDecorContent{template:'party_red'|'blue_tech'|'honor_red', title?, panels?[], rows?, cols?}`,标题/栏目空用模板默认。**三套模板全程序化挤出零素材**(`wallDecorBuilder.ts`):party_red 党务公开栏=红异形背板(顶左飘带飞角 Gauss 凸起+波浪底)+金细边圈+长城线稿 canvas+缎带头牌栏目板+底部红绸金线;blue_tech 厂务公开栏=金属圆角环框(ExtrudePolygon holes)+蓝斜角饰条/三斜杠+六边形栏目签+底部双波浪;honor_red 荣誉墙=标题★★★+短飘带+两侧弧形立飘带(arcBand,顶端钳在标题行下防交叉)+rows×cols 金相框阵列+红搁板带暖光灯带(emissive→Glow)+双级落地基座(checkCollisions)。
  - **浮雕原语**(以后做造型件复用):作画平面=墙面(`[x,离地高]`→`Vector3(x,0,-h)`+`rotation.x=π/2`),`plate(轮廓,depth,off距墙)`/`bar`/`borderBoxes`/`labelPlane`(canvas 字)/`makeTitle`(复用 text_3d 字体管线、按**字高**缩放;party/honor=serif-bold、blue=sans-bold;`collectCharsByFont` 已并入 wall_decor 标题)。挤出后体占 z∈[pos-depth,pos],正面朝 -Z 与 CreateText/CreatePlane 同向。
  - **★IBL 方向性坑(记牢)**:同一红材质 env=1 在北墙正红、**东墙被洗成珊瑚粉**(HDR 环境辐照有方向性;先误判为射灯过曝,关射灯无效,实验 `environmentIntensity=0.45` 实锤)—— 修 = `clampEnv()` 压低彩色件 env(红 0.55~0.6/蓝 0.6)+ 红补 `emissive×0.05` 抬暗侧墙 → 颜色跨墙面稳定;白板/金属不钳(白要吃室内光、金属要反射)。射灯只配两块公开栏(光池落中央浅色板),荣誉墙不配。
  - **设计器**:palette「展示组件」尾部三按钮(党务公开栏/厂务公开栏/荣誉文化墙,stamp preset 带默认 content);`WALL_DECOR_PRESETS` 在 hallUtils(编辑器**切模板=整体重置**为该模板预设,防跨模板残留键);右栏 `WallDecorEditor`(模板/主标题/栏目板增删改 或 honor 行列数);FIXTURE_META wallMount=true → 贴墙吸附/画布渲染/平面缩略图自动生效。AI:`exhibition.generate` 提示词加组件说明 + 归一化(模板白名单/panels≤8×12 字/rows 1-4/cols 2-7)。overlay 点击显示标题+栏目 chips。
  - 验证:三端门禁 0 error(react 41 warning 基线)+ client build;隐藏窗手动 render 截图三轮迭代(构图+红色)对照参考图;点击弹详情实测;2D 设计器冒烟(palette 三按钮 + 右栏编辑器渲染);测试厅+15 张截图文件已清。⚠ 截图工作流坑:**preview_resize 会整页 reload 丢 `?hall=` 参数**,resize 要在导航前做。
  - ⏭ P2(已和用户对齐的路线):**SVG 导入**=CorelDRAW 导 SVG → 后端解析分层(opentype 曲线打平/clipper 清理地基都在)→ 按填充色分层挤出 + 右栏层深度表;栏目板接连接器真数据(荣誉墙→证书)。
- **(2026-06-11 续)沉浸漫游跨厅延续 + 手柄按键点选**(用户两反馈:① 沉浸式到第二个厅就退出 ② 手柄漫游想用按键点选窗口):
  - **统一「瞄准模式」概念**:`isAimActive(canvas)` = 指针锁定 **或** 手柄已连接 **或** 跨厅延续标记 —— 准星、hover 中心拾取标签都按它走(原来只认 pointerLockElement;手柄用户连上即有准星+「⊕ 名称」瞄准标签,**不依赖指针锁定**,因为手柄转视角靠摇杆不靠鼠标)。
  - **跨厅沉浸延续**:门传送是整页跳转,指针锁定必被浏览器收回,且新页**无用户手势不能自动重锁**(requestPointerLock 需 user activation,手柄按键也不算)—— 折中:`goHall()` 统一传送入口(点门+走近门两处),锁定中先 `persistImmersiveAcrossNav` 写 sessionStorage;新厅准星直接亮(视觉不中断)+ 提示「点击画面恢复鼠标环视」,canvas pointerdown 自动重锁(成功/ESC 才清标记,被拒保留下次再试);手柄用户完全无感。`tryLock()` 包 Promise catch(新 Chrome 被拒会 unhandled rejection)。
  - **手柄点选**(`interaction/gamepadSelect.ts` 新):移动/视角本就是 `UniversalCamera` 内置手柄输入(左摇杆移动右摇杆视角);补 **A(Xbox)/×(PS)/0 号键 = 瞄准确认**(中心拾取 → 展品弹详情/传送门穿门;详情开着再按=关闭,单键开关)+ **B/○/1 号键 = 关闭**。走 `scene.gamepadManager`(与相机输入共享单例),Xbox360Pad/DualShockPad/GenericPad 三分支;handler 返回值挂 `__hallDebug.gamepad` 供调试。手柄连接时一次性提示键位(sessionStorage 门控)。鼠标点击与手柄 A 共用 `handleFixturePick`(main.ts 抽出)。
  - 验证:client build ✓;preview 实测 = `gamepad.confirm()` 瞄准荣誉墙开/再按关 ✓、合成 gamepadconnected 事件 → 准星亮+键位提示+中心标签「⊕ 荣誉墙」✓、resume 标记 reload → 准星亮/按钮藏/提示对/标记保留待消费 ✓、console 0 error。⚠ 隐藏预览窗无焦点拿不到指针锁(document not focused),点击重锁只能真浏览器验证 —— 代码路径已全跑通。
- **(2026-06-12)react lint 警告清零(41 → 0)+ backend 0 警告**(用户贴全部警告要求清理):四类修法(都是可复用范式)——
  - ①「`query.data ?? []`」包 useMemo(7 处:CertificateIssue/List/Templates/Navigation/Organizations)。
  - ② set-state-in-effect 三板斧:**默认选中改渲染期派生**(`picked ?? data[0]?.id ?? null`,Dictionaries/Roles/Navigation,setPicked 原名透出调用点零改);**详情/表单子组件改 key 重挂载**(`key={id}` + useState 初始化器读 props,DictHeader/RoleHeader/PermissionsTab/Users 四个 tab,删同步 effect);**取数页改「外壳 + key 重挂载内层」**(CertificateDesigner=外壳 useQuery → `<Inner key={id} template>`,initialDesignOf 解析 JSON 进 useHistory 初值;CertificateIssue=外壳等 auth → `<IssueWizard key={userId}>`,草稿 loadDraft 在 useState 初始化器一次读入、**draft 改纯 useMemo 派生**喂 useDebouncedDraft,删双向同步 effect)。Step4PreviewIssue hover 改「带 recordIdx 派生有效性」。
  - ③ Organizations 手搓 fetch 重构:「**参数 key 缓存 + 派生 loading**」—— `loadedTree:{key,tree}`,`loading = loaded.key !== reqKey(kind|showInactive|tick)`,reload=tick+1,setState 全进 promise 回调;`errMsgOf(e,fallback)` 统一错误提取清 6 处 `catch(e:any)`。auth.tsx 重写:初始 me 由 token 有无决定(无 token 不闪加载态)、bootstrap 拉 /auth/me 的 setState 全在 then/catch、login/logout/refresh 上 useCallback。CertificateDesigner 自适应缩放改 **rAF 回调内 setZoom**(量完布局再 set,顺带更正确)。
  - ④ 合法特例:AdminLayout「URL→累计访问 tab」是路由订阅(直链/后退也要进 tab,无法渲染期派生)→ 行级 disable + 理由注释;stores/auth fast-refresh(Provider+hook 同文件是 React 惯例)与生成文件 icon-zh.ts → eslint config 豁免块(有 task/fields 先例)。
  - **新基线 = react 0 error/0 warning、backend 0 error/0 warning/0 cycle**。冒烟全过:组织(双树切换 57/52 节点、派生 loading)/字典(默认选中+切学历)/角色(权限 tab+切角色)/用户(三 tab)/导航/证书模板列表/设计器(模板载入+缩放)/发证向导/证书列表,console 0 error。
  - ⚠ 经验:**React Compiler 对带病组件 bailout 会静默吞掉下游警告,修一处会「冒出」新警告**(Step4 修完冒出 effectiveHover 表达式、Organizations 重构冒出 4 条 tree)—— 修完必须复跑 lint 直到收敛,不能只看原清单。
- **(2026-06-12)移动端触屏手感调校**(用户实测:摇杆太快不好控、拖屏转向太慢):`mobileControls.ts` 两处根因 —— ① 摇杆 `cameraDirection` 被相机惯性(inertia 0.75)**累积放大 1/(1-0.75)=4 倍**,旧 2.4*dt 实际 ≈9.6 米/秒冲刺 → 改 0.5*dt(实际 ≈2 米/秒快走)+ **死区 0.12 + 二次响应曲线**(轻推微调推满全速;knob 视觉仍线性跟手指);② 拖屏转向走内置 touch 输入,`touchAngularSensibility` 默认 **200000 慢到 ≈7°/s** → 调 13500(满划 ≈100°/s),并开 `singleFingerRotate`(单指=纯转向,竖划改抬头低头 —— 原默认竖划是前后移动,与摇杆重复易误触)+ 每帧俯仰限位 ±1.1 防翻转。⚠ 写手感参数注释时必须说明 4 倍惯性放大,数值不能当米/秒直读。preview 的 mobile 仿真不带 touch 事件(`ontouchstart` 不存在),移动端分支只能真机验证;桌面端 early-return 零影响已实测。
- **(2026-06-13)考核系统(通用考核平台)P1 = 配置层 + 试算 + 组织关联**:新增 `assessment` 模块——把「指标体系→取数→计分→加权汇总→定级排名」做成**可复用引擎**,党建 / 行政业绩两路线共用(`AssessmentScheme.track`)。源于用户真实 Excel(党建责任制考核:强党建六大工程60%/八维40%/加分/减分/一票否决)。规格 **docs/specs/2026-06-13-assessment-p1.md**,计划 `~/.claude/plans/effervescent-strolling-catmull.md`。
  - **灵魂 = 取数(数据源)与计分(计分工具)彻底解耦的双注册表**(照 `task/fields` 范式):指标只「接一个数据源 + 选一个计分工具 + 配参数」,引擎按 outputType↔inputType 兼容自由组合。**加新计分工具 = `scoring-strategies.ts` 加一条 + 前端 `scoring/registry.tsx` 加一个 def**。
  - **11 个计分工具**(`backend/src/assessment/scoring-strategies.ts`):manual/proportional/overachieve_tiers/threshold_tiers/binary/rank_tiers/rank_linear/minmax/bonus/deduction/veto(rank/minmax 为 crossTarget 需全体对象值)。**数据源**(`data-sources.ts`):dept_fill/target 就绪;self_report(自评+佐证)/business.*(task完成率·逾期率·宣传稿件·证书荣誉)/survey(群众打分)/assessment.result(党建占业绩20%)占位待 P2-P4。
  - **采集方式按叶子走、并入数据源维度**(不单列「采分模式」表):一套考核内混用 部门填写/单位自评+佐证/业务系统自动/群众打分。
  - **数据模型**:`AssessmentScheme`(指标树 JSON 快照 IndicatorNode[]:kind=normal/bonus/deduction/veto,weight=分值绝对分;叶子带 dataSource/scoringType/strategyParams/责任部门/评分标准)+ `PartyAdminLink`(`// @module: organization` 党组织↔行政机构 N:M,党委/党总支当前 1:1,手动维护)。迁移 `add_assessment_and_party_link`。Round/Target/IndicatorScore/Goal 留 P2。
  - **试算靠后端权威端点** `POST /assessment/scoring/trial`(前端不镜像 compute,杜绝漂移)。指标树编辑器复用 venue `useHistory` 撤销重做范式。组织管理编辑抽屉加「关联机构」tab(`OrgLinksPanel`,双向手动维护)。菜单「业务功能→考核管理→考核体系」(`assessment:manage`),路由 `/admin/assessment/schemes[/:id]`。
  - **考核对象锚定党组织树**(顶层=党委,1:1 二级单位);业务数据(按行政单位记)经 `PartyAdminLink` 换算(P2 用 `OrganizationService.getLinkedAdminOrgs`)。权重=分值(对齐 Excel 的 E 列),顶层 normal 之和≈baseFullScore(默认100),`weightIssues` 软提示不阻断。
  - 验证:门禁双绿(后端 0/0/0、前端 0 error/0 warning 持平基线)+ **API 端到端 17/17**(计分7例算分精确/CRUD/不兼容拦截400/关联增删查+重复409,真实数据「昆仑物流党委↔昆仑物流」1:1)+ **浏览器冒烟**(建体系→搭树→配叶子 目标值+完成率比例→试算 得分5.1/6→保存→回读持久化、0 console error)。
  - ⚠ 遗留:① 本期不跑整库 `db:seed`(避免覆盖 externalApi 能力 / 重置手工角色授权)——4 个 `assessment:*` 权限点已进 seed 数组,reseed 生效;P1 演示靠 platform_admin 直通。② 未做 `seedAssessmentScheme` 起步体系(用户在设计器直接建)。③ P2 起:打分闭环 + 业务数据源 + `TaskService.getStatsByOrg`/`CertificateIssueService.countByOrg` 新增 + cert recipientUserId→memberships 反查。
  - **(2026-06-13 续 P1.1)用户实测反馈重构**:① **「考核体系」改名「考核表」**——一张考核表 = **考核年度 + 考核内容(指标)+ 考核对象**,**不做模板**,复用=**整体复制**(`/schemes/:id/duplicate`)。scheme+round 合并,P2 不再单建 Round。② **考核对象进考核表 + 快照解耦**:`targetsJson [{orgId,name}]`(migrate `add_assessment_targets`),一次性从组织树读出后冻结(单位每年调整/合并故解耦);编辑器右栏多选 picker。**组织合并按合并前单位均分**算(留 P5)。③ 数据源/计分工具加 **ⓘ 说明**(`assessment/help.ts` 的 SCORING_HELP/DATA_SOURCE_HELP:应用场景+案例)。④ 叶子加**考核责任人** `ownerUserId`(按责任部门成员选);**可见性**(部门管理员看全部/责任人看自己)+ 桌面填报 留 P2。验证:三端门禁绿 + API 5/5(对象快照去重/复制带快照)+ 浏览器(改名/52 项对象 picker/选中保存/ⓘ/责任人,0 console error)。详见 docs/specs/2026-06-13-assessment-p1.md「P1.1 修订」。
  - **(2026-06-13 续 P1.2)交互/计分打磨**:① 指标树**拖拽排序**(@dnd-kit,去上下箭头);② **有子指标不能删**(删除按钮禁用);③ **只填末端权重、上级自动累加**(`recomputeWeights`,分支只读);④ **超额阶梯加分封顶=本项分值**(`overachieve_tiers` 改 `{base,tiers}` 累加 + `clamp(base+Σbonus,0,fullScore)`,去 capBonus);⑤ **责任部门按考核主体层级精确显示**——`OrgPicker` 加 `deptOnly`+`scopeOrgId` 子树限定,考核表设置加「考核主体单位」(`settings.scopeOrgId`,走 settings JSON 免迁移),公司机关→只显 11 机关部门(实测,非全 13);用户问「预设/权限」答=**考核表预设**(权限正交)。验证:两端门禁绿 + API(超额 100%→1/130%→2/160%→3/300%→3)+ 浏览器(拖拽手柄✓/末端可填上级累加6→6✓/分支删除禁用✓/责任部门 12 项=11部门+未指定✓,0 console error)。
  - **(2026-06-13 续 P1.3)指标树/计分再打磨**:① 指标行**双行布局**(名占整行、权重/类型/操作移第二行,解决显示不全);② **kind(计权/加分/减分)只第一层选、下级继承**(`setKindDeep` 整树同步 + 子徽标,去掉行内箭头/逐层选);③ **去掉一票否决**(前后端计分工具/kind 选项/定级字段/help 全移,计分工具 11→10);④ **加分/减分块「整体上限」**——特殊块(kind≠normal)weight 改可编辑上限、`recomputeWeights` 只累加 normal 分支,如 减分项→一般减分上限10/重大减分上限20,P2 按块封顶(扣再多只到上限)。验证:两端门禁绿 + API(veto→400、超额 160%→3)+ 浏览器(kind 仅第一层 1 个/3 选项无 veto/子继承减分徽标/特殊块上限可填/计分工具10,0 运行时错误;Vite HMR 编辑中途的 `Ban` 陈旧报错 reload 即清)。
  - **(2026-06-13 续 P1.4)考核主体重构为「考核关系」+ 区域收敛 + 考核对象自动带出**(用户:原「考核主体」不贴切):把抽象 track+targetLevel+自由 scopeOrgId 改成**7 条枚举「谁考核谁」考核关系**(`backend/src/assessment/assess-relations.ts` 注册表,纯逻辑):党建=公司党委考核基层党委 / 机关党委考核党支部 / 基层党委考核党支部 / 党支部考核党员;行政=公司考核二级单位 / 二级单位考核三级单位 / 三级单位考核员工。每条带 `level`(company/unit2/unit3)+ 主体推导 + 对象推导(单位走结构,党员/员工走成员)+ 责任部门归属(deptScope)。结构判定不写死深度:`isUnit2`=admin level3 非部门非虚拟(34 分公司)、`isUnit3`=admin level4 非虚拟、党委=committee/general、机关党委按 name 含「机关」、党组织→行政按 PartyAdminLink 优先 + 去后缀名兜底匹配。
    - **① 主体按登录账号收敛**(用户选「按登录账号自动判定」):`GET /assessment/my-scope` 用 `RoleService.getScopesForPermission(actorId,'assessment:manage')` —— platform_admin/scope=all → 全部 7 关系全部主体;否则按 `UserService` 的 admin/party membership 经 `adminSubjectsOf`/`partySubjectsOf` 算所在层级(公司机关身处=company、二级单位子树=unit2、level4/党支部=unit3),只回该层级关系 + 限定到本人单位为主体。每个主体附 `deptScopeOrgId`(选定后写 settings.scopeOrgId,责任部门按层级精确显示沿用)。
    - **② 考核对象自动带出 + 批量**:`GET /assessment/relations/:key/objects?subjectOrgId=` 按主体推导候选(org 用 orgId / 党员·员工用 userId,走 `OrganizationService.listMembers` 直接成员)。前端 `SubjectObjectsPanel.tsx`:考核关系下拉(带 level 标签)→ 主体下拉(公司级单主体自动选、不显下拉)→ `ObjectsPicker` 候选清单 + 搜索 + **全选/反选/清空**(解决「一个一个点太麻烦」)。`AssessmentTarget` 扩 `userId?`(单位 orgId、人员 userId),`targetRef` 取键;切主体清空已选。track 由关系推导(选 admin 关系→track 存 admin);徽标/列表卡片改显「关系名 · 主体名」。`assessment.module` 注入 Role/User/Organization;`OrganizationService.getAllLinks()` 新增。
    - 删旧扁平 `TargetObjectsPicker` + 新建对话框「考核对象层级」(就是「不贴切」处);`OrgPicker`/`TARGET_LEVEL*` 改由关系驱动。验证:后端 0/0/0、前端 0/0;**API 端到端**(platform_admin my-scope=7 关系 / 公司党委→35基层党委含机关党委 / 公司→35二级单位 / 塔运司→领导班子·综合办·特车大队 / 党支部→党员 user / 三级单位→员工 user / 机关党委→11支部);**浏览器**(7 关系下拉、二级单位多主体选塔运司→3三级单位、全选→已选3、保存回读 track=admin+relationKey+subjectName+3对象带orgId、公司级 party.company 自动主体昆仑物流党委、党支部考核党员候选=李峰孙彩霞 user,0 console error)。⚠ 非 platform_admin 收敛路径暂无该权限账号可演示(逻辑已就位,P2 授权后验证);旧 26-对象示例表已在测试中改存为新模型 党建/公司党委考核基层党委/35基层党委。
  - **(2026-06-13 续 P1.5)AI 生成指标(预留接口,已可用)+ 考核表设置可随时返回**(用户两点):
    - **① AI 导入考核办法生成指标**(照 task.extract 范式):`POST /assessment/extract`(multipart Word/PDF,`@Permission('assessment:manage')`)→ `AssessmentExtractionService`(mammoth/pdf-parse 转文本 → `callLlm` chat JSON → 归一化)。提示词 `assessment.generate_indicators`(后台「提示词管理」可调,内含数据源/计分工具清单)+ 消费点 `assessment.indicators.extract.text`(chat)。**归一化是安全网**:code 自动 `n1..`、kind 只第一层取下级继承、末端指标 dataSource/scoringType 用注册表校验,非法/不兼容 → 回退 `dept_fill+manual`,参数走 `normalizeParams`。返回**不落库**,前端「AI 生成指标」按钮上传 → `tree.record()+setState` 一次可撤销 → 人工核对再保存。`assessment.module` 加 `ExternalApiModule`+`PromptModule`。**真测**:自造考核办法 docx → deepseek-v4-flash 返 7 末端,kind/分值/数据源/计分工具/参数全对(利润→target/proportional、荣誉→bonus perUnit2 cap10、通报批评→deduction perUnit5 cap10);无文件/.txt → 400。
    - **② 考核主体/对象设置可随时返回**(原:选了指标后设置面板就没了):右配置栏顶部常驻「**考核表设置(主体/对象/定级)**」按钮(选中指标时点它 `setSelectedCode(null)` 返回)+ **点指标树空白处也返回**(`IndicatorTreeEditor` 容器 `onClick` 判 `e.target===e.currentTarget`)。顺手清掉分支说明里的「一票否决」陈旧字样。
    - 验证:门禁双绿;浏览器(AI 按钮 + 考核表设置按钮在位、选叶子→LeafConfigPanel→点按钮/空白处均返回主体设置、0 console error)。⚠ AI 质量取决于所配模型 + 提示词(可在提示词管理调);文件仅支持文本型 Word/PDF(扫描件/图片需 OCR,未做)。
  - **(2026-06-13 续 P1.6)定级规则预设(按名次划档)+ 兑现标准工具评估**(用户给真实定级办法):
    - **3 套定级预设**(`react/src/features/assessment/gradePresets.ts`,按名次划档 mode='rank'):① **党委(直属党总支)** 先进/良好/一般/较差(前15%且未亏损→先进、后15%→一般、连续2年一般或当年重大不良影响→较差、其余→良好)② **党支部** 先进/达标/基本达标/未达标(前15%/后15%/连续2年基本达标或重大不良影响)③ **党员** 优秀/合格/基本合格/不合格(前30%/后5%/连续2年基本合格或重大不良影响)。`GradeRules` 扩 `mode:'score'|'rank'` + `tiers:GradeTier[]`(band=top/bottom/rest/downgrade + pct/requireNoLoss/fromGrade/years/onMajorIncident);后端 `gradeRulesJson` 本就存裸 JSON、`gradeRules?:Record` 不剥字段 → **零后端改动**。
    - **`GradeRulesEditor`**(新组件):套用预设下拉(3 预设 + 自定义总分阈值)+ **按考核关系自动推荐**(`presetForRelation`:party.company.committee→党委、party.*.branch→党支部、party.branch.member→党员)banner 一键套用 + 名次档可读编辑(档次名/比例/连续年数可改,未亏损·重大不良影响等条件随预设);自定义=旧总分阈值编辑器。计算口径在 **P2 引擎**(需全体名次),P1 只配置 + 预设 + 展示。
    - **兑现标准(定级→业绩分)工具评估**:用户的兑现是「定级档次→固定业绩分」(党委 先进24/良好20/一般18/较差16;党支部 先进·红旗24/达标20/基本达标18/未达标16)。**原 10 个计分工具无一直接吃「定级档次(文字)」做映射**(threshold_tiers 吃数字、按总分而非档次,语义不符)。→ 用户确认后于 P1.7 新增 `grade_map` 工具实现(见下)。
    - 验证:前端门禁 0 error/0 warning;浏览器端到端(党委考核表 → 定级规则推荐「党委」banner → 套用 → 4 档 先进/良好/一般/较差 含未亏损·前后%·连续2年 渲染 → 保存 → 重读 gradeRulesJson=mode:rank+4 tiers 持久化、0 console error)。
  - **(2026-06-13 续 P1.7)新增通用「评价定分(对照表)」计分工具 `grade_map`**(用户:这工具复用率高,做更通用——30+ 名次对应固定分,谁评上某档谁就是那个分,「抓两头带中间」不让内卷):
    - **新 inputType/outputType `'label'`**(评价名次/等次,字符串)——计分引擎首个非数值输入。`RawMetric` 扩 `string`;`asNumber` 对字符串返回 null;`isInputCompatible` 加 `label↔label`;trial 对 label 工具透传字符串 raw(`toRaw` 不动)。
    - **`grade_map` 计分工具**(`scoring-strategies.ts` + 前端 `scoring/registry.tsx`):params `{options:[{label,score}]}` 对照表,compute = 按 label 查表给固定分(命中返回该档分,clamp[0,max(fullScore,score)];未命中 0);`makeDefaults` 预置 先进24/良好20/一般18/较差16(党委兑现起步,可改名增删)。前端 `LabelScoreEditor`(widgets.tsx)= 名次+固定分 行编辑;TrialPreview 加 label 分支(下拉选名次试算)。计分工具 10→**11**。
    - **2 个 label 数据源**(`data-sources.ts` + 前端镜像):`dept_grade`(部门评定等次,**ready**——责任部门/考核人直接评一个名次/等次)、`assessment.grade`(他考核定级档次,**P2**——党建定级→业绩兑现)。
    - **加新计分工具仍是「注册表加一条」**:后端 SCORING_SPECS + 前端 scoring/registry 各加一份;label 类工具配 label 数据源即可。
    - 验证:双端门禁 0 error/0 warning/0 cycle;**API**(grade_map 试算 良好→20/先进→24/未知→0、空对照表→400、dept_grade+grade_map 保存 200、dept_fill(number)+grade_map→400 不匹配)+ **浏览器**(选 dept_grade → 计分工具仅剩 grade_map、选中出 4 行对照表 + 摘要「4 个名次→固定分」、试算下拉选 先进=24/良好=20、0 console error)。
  - **(2026-06-13 续 P1.8)难易系数(积分系数)= 按指标 × 按单位的具体可见值**(经用户三轮校正定型):大单位宣传人多、荣誉积分天然占优,按员工数给倍率拉平。**关键认知**:难易系数是「**某指标 × 某单位**」的一个**具体数、管理端和基层都要直观看到**(宣传积分上公司机关党委=1.8…);「多少人→多少系数」的档表只是**测算工具(辅助手段之一)**;员工数由用户**导出单位→填→导入**(不自动从组织取)。
    - **数据模型(全 JSON 裸存,零迁移)**:叶子 `IndicatorNode.difficultyOn`(本指标启用)+ `difficultyCoefs:{targetRef→系数}`(各单位具体系数,缺省=1,**权威可见值**);`SchemeSettings.headcounts:{targetRef→员工数}`(导入,全表共享)+ `difficultyTables[]`(测算表,共享)。后端 `indicator-tree.normalizeIndicatorTree` 保留 difficultyOn/difficultyCoefs。**去掉**旧的 `difficultyId` 引用式设计。
    - **按指标走(像计分工具),默认系数 1**:`LeafConfigPanel` 计分工具下方一个「难易系数」开关 + 「配置各单位难易系数(已设 N 个)」按钮 → **独立弹窗 `DifficultyCoefDialog`**:① 测算表(`DifficultyEditor`,人数档→系数,可编辑/多套)② **导出考核单位 CSV → Excel 填员工数 → 导入** → **按员工数测算**(`coefForCount`,写 settings.headcounts + 各单位系数)③ 每个单位一行 `单位 | 员工数 | 系数` **直接可看可改**(手动微调)。`difficulty.ts`=`DEFAULT_HEADCOUNT_TABLE`(6 档 100以下→2…2000以上→1)+ coefForCount + tableSummary + newTableId;CSV 自带 BOM(`String.fromCharCode(0xfeff)`,避 no-irregular-whitespace)+ 自写 splitCsvLine/parseCsv(无 papaparse 依赖),下载走 `shared/lib/download` downloadBlob。
    - **计算口径(P2)**:**本指标「得分」× 该单位系数,再排名/汇总**(不是乘原始度量;如宣传积分:各单位得分×系数→排名)。
    - 验证:双端门禁 0/0/0;API(临时表保存 200、difficultyOn=true / difficultyCoefs{o1:1.8,o2:1} / settings.headcounts 回读正确)+ 浏览器(选叶子→启用→弹窗列 35 个考核对象、启用测算表、某单位填员工数 180→测算得 1.8、手改 1.5、导出无报错、关闭后按钮显示「已设 1 个」、0 console error;未存盘不动用户表)。
  - **(2026-06-14 P2.1 后端)打分闭环引擎打通**(P2 第一刀,后端 API 实测):2 张表 `AssessmentRound`(发起考核时**快照**考核表:indicators/targets/settings/gradeRules,与日后改表解耦)+ `IndicatorScore`(轮次×对象×叶子,rawValue=原始度量 JSON),迁移 `add_assessment_round`。
    - **引擎 `round-engine.ts`(纯函数可测)`computeRoundResults`**:取数(rawValue)→ 计分(scoring-strategies)→ **×难易系数**(crossTarget 排名类:系数乘在「参与排名的值」上再排名,如宣传积分;非排名类:乘在算出的得分上)→ 加权汇总(normal 叶子累加;bonus/deduction **块按该块 weight 上限封顶**,total=normal+bonus−deduct clamp≥0)→ 按总分排名 → 名次划档定级(rank 模式 top/bottom/rest;**触底档「较差」需重大不良影响/连续N年 → P3**;score 模式按阈值)。
    - 服务 `createRound/listRounds/getRound/saveScores/computeRound/removeRound` + 6 接口(`POST schemes/:id/rounds` 发起、`GET rounds`、`GET rounds/:id`、`POST rounds/:id/scores` 录入、`POST rounds/:id/compute` 计算、`DELETE rounds/:id`);权限:发起/计算=`assessment:manage`、录入=`assessment:score`。`saveScores` upsert `rawValue=JSON.stringify`(number/bool/label),`computeRound` 回写 `resultsJson`+status=done。
    - **API 端到端实测全对**:3 单位场景(利润 target/proportional、宣传积分 rank_linear+难易系数 A×2、加分块封顶5、减分块封顶10、定级 先进/良好/一般)→ 乙100/先进、甲80.67/良好、丙66.67/一般,难易系数把甲宣传 10×2=20 拉到与丙并列。门禁后端 0/0/0。
    - ⏭ P2 后续:② 前端(发起考核 + 矩阵录入 + 结果页)③ 业务数据源(task 完成率/cert 荣誉,经 `getLinkedAdminOrgs` 党委→行政取数)④ 自评佐证+核定 ⑤ 桌面端填报。
  - **(2026-06-14 P2.2 前端)打分闭环 UI 打通**(P2 第二刀,浏览器端到端实测):
    - `features/assessment` 加 `RoundList`/`RoundDetail` 两页 + api 轮次类型/方法(createRound/listRounds/getRound/saveRoundScores/computeRound/deleteRound + parseRound*)。菜单「考核管理→考核打分」(`/admin/assessment/rounds`,`assessment:manage`)+ 路由 `rounds`/`rounds/:id`;`SchemeList` 卡片加「**发起考核**」按钮(createRound→跳轮次详情)。
    - **`RoundDetail` = 对象 × 指标矩阵录入**(sticky 表头/首列;每格按叶子计分工具 inputType 渲染:number/rate→数字、bool→是/否下拉、label→等次下拉(取 grade_map options))→「保存录入」(saveRoundScores upsert)→「计算得分」(先存后算 computeRound)→ **结果表**(名次/计权/加分/减分/合计/定级,按 resultsJson 渲染)。零 effect 范式:外壳 useQuery + `key={round.id}` 重挂载内层、useState 初始化器读已录值。
    - 验证:前端门禁 0 error/0 warning;浏览器端到端(考核表→发起考核→跳轮次→矩阵 5 指标×35 对象=175 格→填值→计算→结果 35 行 + 35 个定级徽标 先进/良好/一般、0 console error;测试轮次已删)。
    - ⏭ 剩 ③ 业务数据源 ④ 自评佐证+核定 ⑤ 桌面端填报。
  - **(2026-06-14 P2.3 录入页重做为「按指标」+ 统一分数符号)**(用户校正:之前的矩阵是「汇总排名」,核心应是**每项指标单独打分/积分/加权/排名**;手动打分可填**得分原因**;分数叫法统一):
    - **★ 统一符号约定(全平台只用这套,弃用「积分/汇总得分」)**:**实际值**(数据源录入的实际完成情况,不带"分")→ **● 得分**(末端单项指标的最终分,实际值经计分工具×难易系数算出)→ **Σ 小计**(一个分组范围内各得分之和)→ **★ 总分**(顶层合计=各组计权+加分−减分)。排名同符号 + `#`:**●# 单项排名 / Σ# 分组排名 / ★# 总排名**(#N=第N名)。
    - **录入页 `RoundDetail` 改三栏(按指标)**:左=指标列表(按分组)/ 中=选中指标逐单位录入「实际值 + 得分原因(选填)」+ 显示数据源/计分工具/评分标准 / 右=**该指标 ●# 单项排名实时刷新**。计分工具不单独占列,显示在指标头 +「怎么算来的」。另留「汇总排名」tab(★ 总分/★# 总排名/定级)。
    - **无状态预览端点** `POST /assessment/scoring/preview`(单指标×全体对象→●得分+●#,复用引擎 `round-engine.scoreOneLeaf`/`previewIndicator`,**前端不重复实现公式**);右栏实时排名由它驱动。`computeRoundResults` 重构为调 `scoreOneLeaf`(行为不变,3 单位复测一致)。
    - 验证:双端门禁 0/0/0;API(preview:排名线性+难易系数 甲10×2=20 拉到与丙并列 / 完成率比例 丙100%→#1;compute 重构后 乙100·甲80.67·丙66.67 不变)+ 浏览器(发起→三栏→选指标→录实际值→右栏实时重排 塔运司2#1/新疆1.5#2/公司机关1#3→计算→汇总 35 行+定级、0 console error;测试数据已删)。
    - ⏭ **步骤 2**:每种数据源/计分工具的录入控件做成 `FillInput` 注册表(照 task/fields,加类型=加一文件)。**步骤 3**:引擎补「每分组各出 Σ 小计 + 各节点排名」+ 按 ownerOrgId/ownerUserId **可见性过滤**(只回我负责的指标)。**步骤 4**:汇总页加分组小计。再 ③ 业务数据源 ④ 自评佐证 ⑤ 桌面端。
  - **(2026-06-16 P2.4 人工打分双模式:加分制 / 扣分制 + 扣分明细)**(用户:数据源两种——满分定格、有问题往下扣 / 0 分起评、给谁打分谁加(原有);选「两个并列打分方式 + 多条明细累加」):
    - **两个并列计分工具**,同挂「部门填写」二选一:`manual` 改名**「人工打分(加分制)」**(0 分起评录得分,逻辑不变)+ 新增 `manual_deduct`**「人工打分(扣分制)」**(满分起评,● 得分 = 分值 − 总扣分,扣到 0)。新 `inputType:'deductions'` + `isInputCompatible('deductions','number')=true` → 在「部门填写(number)」下与加分制并列。**加新工具仍是注册表加一条**(后端 `SCORING_SPECS` + 前端 `scoring/registry`)。
    - **扣分明细(留痕台账)**:rawValue 存 `{items:[{issue,points}]}`,引擎 `sumDeductions` 归约成总扣分(`RawMetric` 扩 `DeductRaw`,compute 容忍 number 或明细对象)。**后端 service/dto 零改**——`saveScores` 本就 `JSON.stringify(rawValue)`、preview/compute 透传 unknown raw,compute 自行归约。
    - **录入控件 = `RoundDetail` 的 `DeductionDialog` 弹窗**(多行明细一格放不下):对象行显「共扣 N 分 · M 条 / 录入扣分明细」→ 弹窗逐条录「问题+扣分」+ 底部实时「共扣 X → ● 得分」;明细即原因,扣分制隐藏「得分原因」列;右栏 ●# 排名照常(preview 透传明细对象)。**这是 Step 2 `FillInput` 注册表的雏形**(本期先为扣分制落一个录入控件,Step 2 再泛化成 per-数据源契约)。
    - 验证:双端门禁 0/0/0;**API**(preview manual_deduct 满分15:A 扣 3+2→10 / B 扣 8→7 / C 不扣→15,排名 C#1/A#2/B#3)+ **浏览器**(设计器「部门填写」下加分制·扣分制**并列**=注册表实证;录入弹窗「党员大会缺2次 扣5」→实时95、「安全事故 扣20」→80;右栏 ●# 重排 公司机关党委 95#34 / 塔运司 80#35;0 console error;冒烟副本表已删)。
- **(2026-06-20)3D 解说员 2.5D 立绘 + 拆层手臂手势 + 展厅素材中心 + 上传上限 500MB**(commit `e2f855c9`,已推 main):
  - **2.5D 立绘解说员**(用户 Maya 3D 解说员走 FBX→glb 屡踩坑:炸开/无动画/集显卡 → 改走立绘):`HallGuide.kind:'model'|'sprite'`。sprite=透明 PNG 立绘看板(父级 `BILLBOARDMODE_Y` 朝相机)——身体层切 `spriteFileId`(闭嘴)/`spriteTalkFileId`(说话)/`spriteBlinkFileId`(眨眼)帧,按音频振幅 `mouthAmp` 切口型 + 周期眨眼;**拆层手臂** `spriteArmFileId`(单独一张、同画布对齐的透明图,以肩 `armPivotX/Y` 为轴转 `rotation.z`,`armFlip` 反向)代码驱动 挥手/伸手/待机。手势触发:出场 / 解说词含「你好·欢迎」→挥手、走到展品讲解→伸手、说完→待机。**契约三处同步**(backend exhibition.types + react hallTypes + client types;`FILE_ID_TO_URL`/`stripResolvedUrls` 同补 sprite*Url)。3D/Live2D 留作并列模式(`kind` 互斥、按需懒加载,不相互影响)。素材要点:身体图须去掉会动那条胳膊+补好身体;手臂顶端剪圆弧盖肩;肩点 Y≈0.2(全身立绘肩在从上 1/5 处,默认 0.42 偏低)。
  - **3D 形象动画**:`guideNarrator` 加载 glb 后循环播自带 `AnimationGroup`(名字含 idle/wave/present/待机 优先,否则第 1 个),讲解口型仍由音频覆盖嘴部 morph。
  - **立绘四个实测修复**:① 整体飘浮 = root 位移呼吸对平面立绘变"飘"(sprite 时 `root.position.y=0` 钉地);② 说话挤压拉伸(去 Q 弹 talkPulse,真人立绘身体稳定);③ **身上发光 = 全自发光被 GlowLayer 整片点亮**(同展品光锥,`glow.addExcludedMesh(body/arm)` 排除;降亮度治不了);④ 过曝(unlit emissive 1→0.8)。
  - **上传上限**:`storage.EXT_MAX_BYTES` 视频/3D 模型 300/100 → **500MB**。⚠ nest --watch 改常量不重启 node,要手动重启后端;本次排查耗时主因 = 旧僵尸 node 占着 3001 跑旧代码,kill 后才生效(`Get-NetTCPConnection -LocalPort 3001` 查占用)。
  - **展厅素材中心**(菜单「3D 展厅→素材中心」,`/admin/exhibition-assets`,`exhibition:manage`):新表 `ExhibitionGuidePreset`(迁移 `add_exhibition_guide_preset`)+ `ExhibitionLibraryService`/`ExhibitionLibraryController` —— **讲解员形象包**(整套 立绘/3D + 音色 + 肩点,`configJson` 只存 fileId、响应旁补 url、剥 url+name+enabled)跨厅一键套用 + **音色/墙面贴图/墙面装饰** 文件库(storage `library-voice`/`library-wall-texture`/`library-wall-decor` 文件夹 + 复用 `ModelLibraryMeta` 标签)。`ExhibitionAssets` 页四 tab(形象包 列表/改名/删 + 三类文件 上传/预览/改名/删);解说员设置加 `GuidePresetBar`(套用/存为形象包)+ `VoiceLibraryPicker`(从库选音色)。**孤儿 GC**:`ExhibitionService.collectInUseFileIds` 聚合 `library.collectInUseFileIds()`(形象包引用 fileId + 素材库文件夹全部文件)防误删 —— 新增引用 storage 的展厅子功能务必在此补。墙贴/墙饰本期先收录,「贴到墙面」留下轮。
  - 验证:三端门禁绿(react/backend 0 error·0 warning·0 cycle、client build)+ 后端干净启动 + 新路由 401 注册。⚠ 本提交同批裹入工作区既有未提交工作(report 报送模块、TTS 配音、exhibition-client 漫游等,与本次共用文件无法干净拆分);排除临时 dump `xlsx_dump1/2.txt`。
- **(2026-07-04)统一登录(Casdoor / OIDC)落地**:auth 模块加 `oidc.service.ts`(**标准 OIDC 授权码流**:discovery 5min 缓存 + HMAC state 防 CSRF/携带回跳 + code→token→userinfo + 用户映射)+ `oidc.controller.ts`(`GET /auth/mode` 公开、`/auth/oidc/login` 302 IdP、`/auth/oidc/callback` 回签本地会话)。**设计不变量**:IdP 只认证,角色/组织/权限全留本地;IdP sub 一律解析成本地 `User.id` 再 `auth.signToken` 签原有 HS256 会话 → AuthGuard/PermissionGuard/业务模块**零改动**;公开口不受影响。
  - **用户映射(安全收紧)**:externalId 精确 → **单一 `OIDC_USERNAME_CLAIM`**(=工号列 username)命中即回填 externalId;**不用显示名/email 隐式匹配**(否则攻击者改 Casdoor 显示名/邮箱=admin 即首登抢绑超管);都不中默认拒登,`OIDC_JIT_CREATE=1` 才自动开通(无角色)。**⚠ claim 映射(2026-07-05 真 Casdoor 实测更正)**:`OIDC_USERNAME_CLAIM` 默认 **`preferred_username`** —— 标准 OIDC + 真 Casdoor 的 OIDC userinfo 都把**登录名/工号放 preferred_username**、显示名放 name(**早先"Casdoor name=登录名"是把它内部数据模型字段误当成对外 claim,错的**;假 IdP 曾把错误假设也编码进去导致假通过)。**部署要求**:Casdoor 关自助注册、登录名由管理员按工号下发。
  - **安全加固(对抗审查后)**:`AUTH_SECRET` 生产漏配/过弱→启动即 fail-fast(不回退公开默认密钥);OIDC state 绑 HttpOnly nonce cookie 防登录 CSRF + 回调二次校验 returnUrl;回跳白名单 dev 旁路收紧为私有网段主机(原 `[^/]+` 放行任意公网站点→token 外泄);错误信息泛化防账号枚举。详见 [[casdoor-oidc-login]] memory。
  - **双模式**:`AUTH_MODE=mock`(默认,dev 保留点头像秒切)| `oidc`(dev-login 401 禁用,`ALLOW_DEV_LOGIN=1` 兜底)。前端 `Login.tsx` 按 `GET /auth/mode` 渲染演示面板或「统一账号登录」按钮;回跳 token 挂 **URL fragment**(`#djyy_token=`,不进服务器日志),`/login` 页兼任回调落地(挂载时解析入库,无新路由);回跳地址按 CORS 白名单校验防 open redirect。
  - **部署**:compose 加 `casdoor` 服务(casbin/casdoor,PG 独立 casdoor 库,`initdb/01-create-casdoor-db.sql` 首次自动建库)+ app 的 OIDC 环境变量(首次部署留 mock,配好 Casdoor 应用再切 oidc);一次性配置手册 = README-部署.md **第七节**(改 admin 密码/建应用/回调 URL/用户名=工号对齐)。**将来单位 SSO 开放**:Casdoor 挂上游 IdP 或直接换 `OIDC_ISSUER` 四件套,平台零改码。
  - 验证:**fake OIDC IdP 本地 E2E 全过**(authorize→callback→本地 token→me=朱海君带本地角色;externalId 回填 psql 实查;二次登录用户数不变;未开通拒绝;伪造 state 拒绝;JIT 开通无角色;oidc 模式 dev-login 401)+ 双端门禁 0 error/0 cycle + 浏览器 mock 面板登录跳门户 0 console error。测试痕迹已清(假绑定/JIT 用户/临时 env)。
  - **(2026-07-04 续)对抗审查 + 真 Casdoor 实测两处关键修正**:① 多视角对抗审查确认并修 8 类真漏洞(账号接管——去掉按显示名/email 隐式绑定只认单一登录名 claim;AUTH_SECRET 生产漏配 fail-fast;开放重定向 dev 旁路收紧私有网段;登录 CSRF——state 绑 HttpOnly nonce cookie)。② **真 Casdoor v3.107 实测推翻"claim 语义反"的旧假设**:真 Casdoor OIDC userinfo 遵循标准 OIDC(preferred_username=登录名/工号、name=显示名)→ `OIDC_USERNAME_CLAIM` 默认由 `name` 改回 **`preferred_username`**(装反则拿显示名匹配工号→全员登录失败;假 IdP 曾把错误假设也编码进去假通过——**认证类改动必须对真 IdP 验**)。本地真 Casdoor 装在 `D:\web\casdoor-local`(单 exe 连本地 PG),员工同步脚本 djyy→Casdoor 在 scratchpad。详见 [[casdoor-oidc-login]] memory。
- **(2026-07-04)组织/用户批量导入(`import` 模块)**:后台「组织与权限 → 数据导入」页(`/admin/data-import`,perm `admin:user:write`)。后端新增 `backend/src/import`(位于 org/user/role 之上走 DI,不直连他表):`ImportService` 用 **xlsx 库**解析,组织按「上级编码」**拓扑建树**(子可乱序在父前,已存在 code 跳过只新增)、用户按工号建号 + 行政/党组织归属(按编码)+ **默认赋 `member` 角色(scope=self,仅当无角色时)**;4 端点(2 模板下载 GET + 2 导入 POST,`FileInterceptor('file')` multipart)。前端 `features/import`(api + DataImport 页两卡 下载模板/上传/错误行回显)。中文表头兼容带/不带括号说明。验证:双端门禁 0 error/0 cycle + API 端到端(组织拓扑乱序建树 + 坏层级/漏工号准确报错行号 + 默认角色/归属 psql 核对 + 模板 xlsx 魔数)+ 浏览器渲染 0 console error;测试数据已清。
1. ~~Casdoor 真集成~~ — **已落地(2026-07-04,见已完成)**;剩生产侧一次性配置(README-部署.md 第七节)
2. **访问量/点赞统计**:NavItem.likes/views 接真实计数 + Redis 缓存
3. **审计日志查询页**:AuditLog 表已有数据,加 `/admin/audit` 浏览界面
4. **首页综合查询**:`<CertificateSearchBox embedded />` 已具备,把它和其他业务的查询入口拼到 NavPage / 新首页查询板块
5. **任务分派系统 P4 富文本+在线文档**(仅剩这一期):P1–P3 + P2.5 指派 + P5 Tauri 客户端 + 超期自动通过都已落地(见已完成);汇总(数字求和/附件 ZIP/CSV)在 `TaskSummary` 已具备。剩 **P4**:内置富文本编辑器(`richtext` 字段)+ `doclink` 接 `DocProvider` 接口 + 群晖在线文档占位 driver。
6. **企业虚拟展厅系统(3D / VR)** ★大方向 —— **P1(美观 3D 客户端,2026-06-09)+ P2(2D 拖拽搭建器+内容编辑,2026-06-10)均已交付,见已完成**。剩余:门洞挖墙(P4)/ 装饰组件库 / 连接器真数据(P5:荣誉墙→证书、党务板→任务)/ VR 内网 TLS(P7)。规格 **docs/specs/2026-06-07-virtual-exhibition-hall.md**(含 v2 修订)
7. **其它业务模块**:AI 图片分拣 等 —— 按 conventions.md 的"加新模块"清单逐个加(**会场排座已落地**,见已完成 2026-06-10 venue 合并)

### ❌ 明确延后/放弃(有真实需求再做)
- 信创适配(达梦 / 麒麟 / 国密)
- K8s 部署
- SAML / CAS / LDAP 协议适配
- 证书 PDF 对象存储 —— **storage 抽象 + 本地盘已落地(2026-06-01,见已完成)**;当前群晖走「挂载共享盘 + 本地盘 driver」。S3/MinIO/群晖 File Station API driver 仅占位,有需求再实现
- 证书自动失效(到期变"已过期"批处理)
- 模板版本历史
- 证书图片 OCR(AI 提取仅支持 docx/pdf)
- ~~插件包/微前端~~ — 已放弃(2026-05-23,见决策记录)
- ~~细粒度权限校验~~ — 已落地(2026-05-24 证书 V2 Phase B,@Permission + 全局 PermissionGuard,platform_admin 直通)

---

## 关键决策记录

| 决策 | 时间 | 理由 |
|---|---|---|
| 不自建 IdP,用 Casdoor | 初版 | 自建 OIDC+SAML+LDAP 是 6-12 人月,Casdoor 一个 Go 单二进制就齐了 |
| 不用 Java,用 NestJS | 初版 | 用户明确拒绝;TS 前后端统一,模块化适配插件型平台 |
| ~~微前端选 wujie 不选 qiankun~~ | 初版 | 已放弃,见下一行 |
| **放弃微前端/插件包,改模块化单体** | 2026-05-23 | wujie 调试成本高、.djyy 插件包对 solo dev 过重(每模块自己 prisma/部署/端口);改成 NestJS 模块化单体 + ESLint boundaries 强制边界,加新模块零运维负担。详见 docs/conventions.md 5 条约定 |
| 站点设置存单行 JSON 不存多列 | 站点设置阶段 | 后续加字段不用 migrate,前后端契约由 TS 类型管 |
| icon 存 lucide 字符串名 | 首页导航阶段 | 编译期无需打包整个 lucide,运行时按需取 |
| 主题色用 CSS var 而非每处 inline | 主题色阶段 | 改主题色一处变全站,不刷新 |
| 排行榜金/银/铜不跟主题色 | 颜色重构阶段 | 语义色,跟主题色解耦 |
| 移除 unplugin-auto-import | 基座加固阶段 | 静默吞错,IDE 已能 auto-import,得不偿失 |
| 权限模型暂不 enforce | 多次确认 | 单人 MVP 没必要,等多角色冲突真发生再补(4-6 小时即可上) |
| 文件存储:driver 抽象 + 本地盘默认,群晖走挂载 | 2026-06-01 | 单位用群晖;挂载共享盘后 LocalDiskDriver 零改即用,文件落成 File Station 可浏览目录;SynologyDriver(File Station API)/ S3 留占位。消费方用 fileId 松引用、不建跨模块外键(守「表归属 + DAG」) |
| 企业虚拟展厅用 Babylon.js 独立 3D 客户端,不用 Unity/Unreal | 2026-06-07 | 非游戏企业应用免付费授权 +「开网址即进」+ WebXR 开箱 VR;单人浏览=普通网页访问,无多人/语音并发难点(剔除 Colyseus/LiveKit/声网);复用现有 NestJS 后台 + storage(MinIO),连接器对接荣誉/党务,数据与鉴权收敛后台。详见 docs/specs/2026-06-07-virtual-exhibition-hall.md |
| **开发/生产统一 PostgreSQL,弃 SQLite + 双方言迁移** | 2026-07-03 | 边上线边升级要求 dev/prod 一致。本地=PG10 便携版(D:\web\pg10-portable,比群晖 postgres:16 更旧 → 天然兜住信创瀚高/金仓≈PG10 的兼容性);迁移历史重置为单条 PG 基线 `20260703013028_init_postgres`(51 条 SQLite 迁移随 git 历史留档);dev.db 数据 50 表 9885 行已全量迁入本地 PG(行数逐表核对)。改 schema 后直接 `prisma migrate dev`,`new-pg-migration.ps1` 双方言流程退役。PG 专属修复:report 快捷组 raw SQL(`?` 占位符 PG 不认)改 typed;6 文件 12 处 `contains` 搜索补 `mode:'insensitive'`(PG 默认大小写敏感,SQLite 时代不敏感) |

---

## 给 Claude 自己的提醒

- **写代码前一定先看现有同类模块**(`site-setting/`、`nav-category/` 是最新最完整的范本)
- **跨模块只走 barrel**:`import from "@/features/x"` 或 `import from "../user"`,绝不 `from "../user/user.service"` —— ESLint 会报错,也违反约定 3
- **每次修改后跑 check**:react `npm run check`,backend `npm run check` + `npm run check:circular`,**0 error / 0 warning / 0 cycle** 才能 commit(2026-06-12 警告已清零,新基线不许涨;合法特例须行级 disable + 理由注释,或进 eslint config 豁免块)
- **新表加 `// @module: <name>`** 注释,声明归属
- **commit message 详细一些**,要写"为什么这么做",这是跨会话记忆的主要载体
- **不要主动删除孤儿文件**,先确认无人引用且用户同意
- **主题色 / 字典 / 自定义字段** 这三块容易混淆,先翻 docs/conventions.md
- **用户口语化目标 ≠ 写出来的规划文档**,以用户当下口语意图为准(他要"够用"不要"完美")
- **TODO/警告类风险登记**:看 docs/roadmap.md
- **文件上传一律走 storage**:前端 `storageApi.upload(file, {ownerModule, folder})` 拿 fileId 再提交,后端注入 `StorageService`(走 `../storage` barrel);别再把文件 base64 塞进 DB 列。`folder` 决定落盘的业务文件夹
