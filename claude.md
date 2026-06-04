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
| 后端 | NestJS 10 + Prisma 5 + SQLite(dev)→ PostgreSQL(prod) | 不用 Java/Spring —— 用户明确拒绝 |
| 认证 | Casdoor(规划中,未接入) | 不自建 IdP —— 6-12 人月的安全工程,不值得 |
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
│   │   │   ├── external-api/      ← AI 平台配置(DeepSeek/豆包/千问 — key/model/优先级)
│   │   │   ├── nav-category/
│   │   │   ├── organization/
│   │   │   ├── permission/        ← api.ts + index.ts (无独立页面,合并在 role)
│   │   │   ├── role/
│   │   │   ├── site-setting/
│   │   │   ├── storage/          ← 文件上传/下载 client(storageApi.upload / fetchBlob / fileUrl)
│   │   │   ├── user/
│   │   │   └── user-custom-field/
│   │   ├── shared/                ← 跨模块复用基础设施
│   │   │   ├── api/client.ts      ← axios 实例 + 401 拦截器
│   │   │   ├── components/        ← IconPicker + ui/(shadcn vendor)
│   │   │   ├── hooks/             ← use-mobile
│   │   │   └── lib/               ← pinyinSearch、utils(cn)
│   │   ├── layouts/AdminLayout.tsx
│   │   ├── pages/                 ← 全局/跨模块页面
│   │   │   ├── NavPage.tsx        ← 前台门户首页
│   │   │   ├── Login.tsx          ← Mock 登录(待换 Casdoor)
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
        ├── auth/                  ← JWT HS256(Mock,待换 Casdoor OIDC) + index.ts
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

# 数据库初始化(首次或重置后)
cd backend
npx prisma migrate dev
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

### 🟡 待启动(按优先级)
1. **Casdoor 真集成**:替换 `auth/dev-login` 为 OIDC,Login.tsx 跳 Casdoor
2. **访问量/点赞统计**:NavItem.likes/views 接真实计数 + Redis 缓存
3. **审计日志查询页**:AuditLog 表已有数据,加 `/admin/audit` 浏览界面
4. **首页综合查询**:`<CertificateSearchBox embedded />` 已具备,把它和其他业务的查询入口拼到 NavPage / 新首页查询板块
5. **任务分派系统 P3–P5**:P2 平级确认 + P2.5 指派承办人已落地(见已完成)。按 `~/.claude/plans/task-dispatch-system.md` 推进 P3 汇总(数字求和/附件汇总/导出)→ P4 富文本+群晖文档 → P5 Tauri 客户端
6. **其它业务模块**:排座 / AI 图片分拣 等 —— 按 conventions.md 的"加新模块"清单逐个加

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

---

## 给 Claude 自己的提醒

- **写代码前一定先看现有同类模块**(`site-setting/`、`nav-category/` 是最新最完整的范本)
- **跨模块只走 barrel**:`import from "@/features/x"` 或 `import from "../user"`,绝不 `from "../user/user.service"` —— ESLint 会报错,也违反约定 3
- **每次修改后跑 check**:react `npm run check`,backend `npm run check` + `npm run check:circular`,0 error / 0 cycle 才能 commit
- **新表加 `// @module: <name>`** 注释,声明归属
- **commit message 详细一些**,要写"为什么这么做",这是跨会话记忆的主要载体
- **不要主动删除孤儿文件**,先确认无人引用且用户同意
- **主题色 / 字典 / 自定义字段** 这三块容易混淆,先翻 docs/conventions.md
- **用户口语化目标 ≠ 写出来的规划文档**,以用户当下口语意图为准(他要"够用"不要"完美")
- **TODO/警告类风险登记**:看 docs/roadmap.md
- **文件上传一律走 storage**:前端 `storageApi.upload(file, {ownerModule, folder})` 拿 fileId 再提交,后端注入 `StorageService`(走 `../storage` barrel);别再把文件 base64 塞进 DB 列。`folder` 决定落盘的业务文件夹
