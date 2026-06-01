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

### 🟡 待启动(按优先级)
1. **Casdoor 真集成**:替换 `auth/dev-login` 为 OIDC,Login.tsx 跳 Casdoor
2. **访问量/点赞统计**:NavItem.likes/views 接真实计数 + Redis 缓存
3. **审计日志查询页**:AuditLog 表已有数据,加 `/admin/audit` 浏览界面
4. **首页综合查询**:`<CertificateSearchBox embedded />` 已具备,把它和其他业务的查询入口拼到 NavPage / 新首页查询板块
5. **业务模块**:任务管理 / 排座 / AI 图片分拣 等 —— 按 conventions.md 的"加新模块"清单逐个加

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
