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
| 微前端 | wujie(规划中,未接入) | 不用 qiankun —— wujie 更轻;不用纯 iframe —— SSO 透传难 |
| 部署 | Docker Compose(MVP) → K8s(规模化) | |
| 信创/达梦/麒麟 | **延后,等真实客户需求出现** | 不要预先适配 |

---

## 目录结构

```
djyy/                              ← git 根 + monorepo
├── claude.md                      ← 本文件(项目宪法)
├── README.md                      ← 给人看的自述
├── docs/
│   ├── conventions.md             ← 命名约定 + 添加新模块清单
│   └── roadmap.md                 ← 路线图 + 决策记录
├── package.json                   ← root,装 husky 用
├── .husky/pre-commit              ← commit 前自动跑 npm run check
├── react/                         ← 前端工程
│   ├── src/
│   │   ├── api/                   ← axios client + 各业务模块的 API 封装
│   │   ├── components/            ← 复用组件(含 ui/ = shadcn vendor)
│   │   ├── layouts/AdminLayout.tsx
│   │   ├── pages/
│   │   │   ├── NavPage.tsx        ← 前台门户首页
│   │   │   ├── Login.tsx          ← Mock 登录(待换 Casdoor)
│   │   │   └── admin/             ← 后台各页面
│   │   ├── stores/auth.tsx        ← AuthProvider + me 状态
│   │   ├── App.tsx                ← 路由 + QueryClient + ThemeBootstrap
│   │   └── index.css              ← 主题 utility class
│   ├── vite.config.ts             ← 已移除 unplugin-auto-import(吞错元凶)
│   ├── tsconfig.app.json          ← 开了 noUnusedLocals / noImplicitAny
│   ├── eslint.config.js           ← no-unused-vars: error
│   └── package.json
└── backend/                       ← NestJS 工程
    ├── prisma/
    │   ├── schema.prisma          ← 全表定义
    │   ├── seed.ts                ← 演示账号 + 字典 + 导航默认数据
    │   └── migrations/
    └── src/
        ├── auth/                  ← JWT HS256(Mock,待换 Casdoor OIDC)
        ├── organization/          ← 双树(党 + 行政)
        ├── user/                  ← 用户 + memberships
        ├── role/ + permission/    ← RBAC(权限点表存在但 Guard 未启用)
        ├── dictionary/            ← 2 级字典
        ├── user-custom-field/     ← 元数据驱动的用户扩展字段
        ├── site-setting/          ← 站点设置(单行 JSON)
        ├── nav-category/          ← 首页导航(分类 + 项目两表)
        ├── audit/                 ← 审计日志
        └── main.ts                ← listen 0.0.0.0,CORS dev 放开 *:5173
```

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
- `src/api/<module>.ts` 导出 `xxxApi.list / create / update / delete`
- 用 `@tanstack/react-query` 管缓存,`queryKey: ["<module>", ...]`
- 表单变更后 mutation 成功 → `qc.invalidateQueries({ queryKey: [...] })`
- 401 由 `src/api/client.ts` 拦截器统一处理(清 token + 跳 login)

### 字典 vs 自定义字段
- **字典**(`Dictionary` + `DictItem`):2 级,管"下拉选项的可选值"。如"职务"、"学历"
- **自定义字段**(`UserCustomField`):元数据驱动,管"用户表上有哪些自定义字段 + 它的类型/校验"。如"入职日期"、"身份证号"

---

## 加新 admin 模块的 7 步清单

参考已有模块(`site-setting/`、`nav-category/`、`dictionary/`)的代码结构。

1. **Prisma schema** 加表 + `npx prisma migrate dev --name add_xxx`
2. **seed.ts** 加默认数据(可选)
3. **后端模块**:`backend/src/<module>/` 创建 `xxx.module.ts` + `xxx.service.ts` + `xxx.controller.ts` + `dto/*.ts`,在 `app.module.ts` 注册
4. **前端 API**:`react/src/api/<module>.ts` 类型 + axios 调用
5. **后台页面**:`react/src/pages/admin/Xxx.tsx`,follow 现有页面的 header bar + 表格 + dialog 模式
6. **App.tsx** 加路由 `<Route path="xxx" element={<XxxPage />} />`
7. **AdminLayout.tsx** 在合适分类下加菜单项

每次修改后:`npm run check`(react/)确保 0 error,然后 `git commit`(husky 会再跑一次)。

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

### 🟡 待启动(按优先级)
1. **wujie 微前端 PoC**:激活 AdminLayout 里"应用管理→插件管理"灰显项,做一个 demo 子应用通过 wujie 嵌入,验证 SSO 透传 / 菜单注入 / 事件总线
2. **Casdoor 真集成**:替换 `auth/dev-login` 为 OIDC,Login.tsx 跳 Casdoor
3. **访问量/点赞统计**:NavItem.likes/views 接真实计数 + Redis 缓存
4. **审计日志查询页**:AuditLog 表已有数据,加 `/admin/audit` 浏览界面

### ❌ 明确延后(有真实需求再做)
- **细粒度权限校验**(PermissionGuard + 前端 UI 隐藏)—— 用户明确"延后",单人 MVP 用不上
- 信创适配(达梦 / 麒麟 / 国密)
- K8s 部署
- SAML / CAS / LDAP 协议适配
- 插件签名 / .dyyp 包格式

---

## 关键决策记录

| 决策 | 时间 | 理由 |
|---|---|---|
| 不自建 IdP,用 Casdoor | 初版 | 自建 OIDC+SAML+LDAP 是 6-12 人月,Casdoor 一个 Go 单二进制就齐了 |
| 不用 Java,用 NestJS | 初版 | 用户明确拒绝;TS 前后端统一,模块化适配插件型平台 |
| 微前端选 wujie 不选 qiankun | 初版 | wujie 更轻,iframe 协议沙箱平衡体验和隔离 |
| 站点设置存单行 JSON 不存多列 | 站点设置阶段 | 后续加字段不用 migrate,前后端契约由 TS 类型管 |
| icon 存 lucide 字符串名 | 首页导航阶段 | 编译期无需打包整个 lucide,运行时按需取 |
| 主题色用 CSS var 而非每处 inline | 主题色阶段 | 改主题色一处变全站,不刷新 |
| 排行榜金/银/铜不跟主题色 | 颜色重构阶段 | 语义色,跟主题色解耦 |
| 移除 unplugin-auto-import | 基座加固阶段 | 静默吞错,IDE 已能 auto-import,得不偿失 |
| 权限模型暂不 enforce | 多次确认 | 单人 MVP 没必要,等多角色冲突真发生再补(4-6 小时即可上) |

---

## 给 Claude 自己的提醒

- **写代码前一定先看现有同类模块**(`site-setting/`、`nav-category/` 是最新最完整的范本)
- **每次修改后跑 `npm run check`**(在 react/ 目录),0 error 才行
- **commit message 详细一些**,要写"为什么这么做",这是跨会话记忆的主要载体
- **不要主动删除孤儿文件**,先确认无人引用且用户同意
- **主题色 / 字典 / 自定义字段** 这三块容易混淆,先翻 conventions.md
- **用户口语化目标 ≠ 写出来的规划文档**,以用户当下口语意图为准(他要"够用"不要"完美")
- **TODO/警告类风险登记**:看 docs/roadmap.md
