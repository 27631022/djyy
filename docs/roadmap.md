# 路线图 + 决策记录

每阶段更新一次。最近更新:2026-05。

---

## M1:平台底座(已基本完成)

> 目标:把"组织 + 用户 + 角色 + 权限点表 + 字典 + 自定义字段 + 站点设置 + 首页导航"骨架立起来,前后台跑通。

### ✅ 已完成

- 后端
  - NestJS + Prisma + SQLite 工程骨架
  - JWT(HS256,自签)mock 认证
  - Organization 双树(党组织 4 级 + 行政机构 4 级 + 虚拟组织)
  - User + UserOrganization(多归属,1 个 primary)
  - Role + UserRole + UserRoleScope(多 scope custom)
  - Permission + RolePermission(表已建,Guard 未启)
  - Dictionary + DictItem(2 级)
  - UserCustomField(5 种类型:text/number/date/textarea/select)
  - SiteSetting(单例,JSON)
  - NavCategory + NavItem(首页导航数据化)
  - AuditLog
  - 全局 ValidationPipe(class-validator)
  - CORS dev 模式放开 *:5173,listen 0.0.0.0
- 前端
  - React 19 + Vite 7 + Tailwind 4 + shadcn/ui
  - 前台 NavPage:Hero 搜索 / 6 分类导航 / 排行榜 / 热点任务 / 资讯 / 公共部分免登录 / 需登录项灰显
  - Mock Login 页(选用户登录)
  - AdminLayout 顶部分类 + 侧边二级菜单 + Tab 多页签
  - 后台 6 个完整模块:Organizations / Users / Roles / Dictionaries / UserCustomFields / SiteSettings / Navigation
  - ThemeBootstrap 全局主题色注入
  - IconPicker 通用组件(全 lucide 搜索)
  - API base 按 hostname 推断(局域网另一台机器访问自动适配)
- 工具链
  - TypeScript 严格化(`noUnusedLocals` + `noImplicitAny` + `noUnusedParameters`)
  - ESLint `no-unused-vars: error`
  - vite-plugin-checker 跑 tsc + eslint
  - husky pre-commit 自动 check
  - 字体回退系统字体栈

### 🟡 进行中

(无)

### ❌ 未开始

(M1 收尾,转 M2)

---

## M2:平台契约验证(下一步)

> 目标:用 wujie 接一个 demo 子应用,验证"底座 + 插件"契约可用。这是平台是不是"平台"的试金石。

### 任务清单

1. **wujie 微前端 PoC**(优先级 ★★★)
   - 后端:`Plugin` 表 + CRUD,plugin.yaml 上传解析
   - 前端:`plugin-host/WujieFrame.tsx` 动态挂载 / `pluginRegistry.ts` 从后端拉激活插件清单
   - 激活 `/admin/plugins` 现在的灰显项
   - **验收**:做一个最小 demo 子应用(独立 React + Nest 工程),plugin.yaml 描述清楚后,主壳菜单出现该插件,点击进入 wujie 加载的子页面;子应用能通过约定 API 拿到主壳 user / 发事件给主壳

2. **Casdoor 真集成**(优先级 ★★)
   - 本机 docker run 一份 Casdoor
   - 创建 dyy-app 应用,拿 client_id/secret
   - 后端 auth 加 OIDC client(替换 dev-login)
   - 前端 Login 跳 Casdoor;加 OAuthCallback 页处理回调
   - JIT 用户创建(Casdoor 返回的 sub 写入 User.externalId)

3. **访问量 / 点赞统计**(优先级 ★)
   - NavItem.views 加 Redis 计数(写穿透,每分钟刷库)
   - 加 `POST /nav-categories/items/:id/like` 接口
   - NavPage 卡片显示真实统计

4. **审计日志查询页**(优先级 ★)
   - `/admin/audit` 列表 + 过滤(action / actor / 时间范围 / target)
   - 数据已经在写,只是没界面看

---

## M3:能力补全(M2 之后)

- **统计看板**:党支部考核、积分排行的真实数据(目前是 mock)
- **首批业务插件**:任务派发系统作为第一个真插件
- **党组织树原生功能**:党费缴纳工作流、组织关系转接介绍信、活动报名签到
- **细粒度权限**(只有 M3 之后真有多角色冲突时才做)

---

## M4+:生态扩展(规模化以后)

- 插件市场 / 插件签名(.dyyp 包格式)
- 多租户(SaaS 模式)
- SAML / CAS / LDAP 协议适配(M5+,有真实企业客户的对接需求时)
- 信创适配(达梦 / 麒麟 / 国密 / 等保)—— **延后,等真实客户**
- K8s 部署(规模化后)
- Prometheus / Loki 监控(信创版本时)

---

## 决策记录

按时间顺序。每条都答了"我们为什么不那么做"。

### 不自建 IdP,用 Casdoor

**背景**:最初规划文档写了"自建 OIDC + SAML + CAS + LDAP IdP"。

**决策**:删掉,用 Casdoor 作为外部 IdP。

**理由**:
- 自建 IdP 是 6-12 人月的安全工程,且容易出安全漏洞(密码 hash、token 签发、会话管理、防 CSRF/XSS)
- Casdoor 是 Go 单二进制,内置管理 UI,协议齐(OIDC/SAML/CAS),社区活跃
- 平台只作 OIDC Client,把"认证"这个最严肃的模块外置给专业产品

### 不用 Java + Spring Boot,用 NestJS

**背景**:最初规划写"Spring Boot 3"。

**决策**:换 NestJS 10 + Prisma 5。

**理由**:
- 用户明确"不要 Java"
- 前后端同 TypeScript 减少上下文切换 / 类型共享
- NestJS 的模块化 + DI 天生适合插件型平台
- Prisma 类型安全 + 迁移自动生成,胜过 JPA/MyBatis

### 微前端选 wujie 不选 qiankun

**理由**:
- qiankun 沙箱要 patch window / document,复杂且坑多
- wujie 用 iframe + proxy sandbox,体验比纯 iframe 好,比 qiankun 轻
- "起步阶段不需要进程内热插拔,iframe 协议沙箱平衡体验和隔离"

### 站点设置存单行 JSON,而非每字段一列

**背景**:站点设置有 brand / hero / footer / theme 4 类,十几个字段。

**决策**:`SiteSetting` 表只有一行(`id = "default"`),所有字段塞进一个 `data: String`(JSON)。

**理由**:
- 后续加字段不用 migrate
- 前后端共享 TS 类型(`SiteSettingsData` interface)做契约
- 单例表只有 GET / PUT,不需要复杂查询和索引

### Icon 存 lucide 字符串名,而非组件引用

**背景**:导航项要选 icon。

**决策**:存 `"BookOpenIcon"` 这种 PascalCase 字符串。前端运行时 `(lucide as any)[name]` 解析。

**理由**:
- 编译期无需打包整个 lucide
- IconPicker 提供 1500+ 图标的 autocomplete
- 数据库可序列化(不能存 React 组件)

### 主题色用 CSS var,不每处 inline

**背景**:党建红 `#C8001E` + 金黄 `#F5A623` 散布在几十个文件、上百处。

**决策**:`--party-primary` + `--party-accent` 两个 CSS var,`ThemeBootstrap` 注入到 `:root`。所有代码用 `var(--party-primary)`。

**理由**:
- 后台改主题色 → 写 `:root` → 全站秒变色,不刷新
- 派生色用 `color-mix(in srgb, var(--party-primary) 8%, white)`,不需要额外加字段
- 前后台共享一份变量

### 排行榜金/银/铜不跟主题色变(以及其他语义色)

**判断**:用户改主题色为蓝色时,这个颜色还应该是它原来的样子吗?
- 金牌应该还是金色 → 语义色,写死
- "进行中"红标签,在蓝主题下变蓝吗?不,红色 = 紧急 / 进行,是状态语义 → 写死
- 党委红、总支橙、支部蓝 → 组织类型语义 → 写死

### 权限模型暂不 enforce

**背景**:Role / Permission / RolePermission 表都建好了,角色管理页也能勾权限点,但后端 Guard 不校验权限点。

**决策**:延后启用 PermissionGuard,直到真实多角色冲突出现。

**理由**:
- 当前只有 admin 一个人用,做了也没用户用
- 启用是 4-6 小时工作量(补全权限点 seed + 写 PermissionGuard + 给所有 controller 接口加装饰器 + 前端按权限隐藏 UI),不是 6 个月
- 提前做容易过度设计、约束错地方

### 移除 unplugin-auto-import

**背景**:最初 vite.config 装了 AutoImport,声称"自动注入 react / lucide-react import"。但今天发现它跟显式 import 冲突时 transform **静默失败**(Vite 返回空模块,浏览器报"no default export"无法定位)。

**决策**:整个移除。所有 import 显式写。

**理由**:
- IDE 已经能 auto-import,这个插件的价值只是"少打几行字"
- 代价是脆弱 + 难调试
- 移除后 + 收紧 tsc/eslint + husky hook + dev overlay,有四道防线,bug 不再静默

### 字体不用 Poppins,改系统字体栈

**背景**:原模板引用 `/fonts/Poppins-Regular_6.ttf`,但 `public/fonts/` 目录从来没建过,Vite SPA fallback 把字体请求当 HTML 返回,浏览器报 "OTS parsing error"。

**决策**:删 `@font-face`,`--fontSans` 用 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "微软雅黑", "Noto Sans SC", "Source Han Sans SC", "Helvetica Neue", Arial, sans-serif`。

**理由**:
- Poppins 是英文字体,中文回退到系统字体,得不到一致美感
- 系统字体栈在中文场景观感更整齐
- 无网络请求,无 CORS,跨平台一致

---

## 风险登记

| 风险 | 触发条件 | 应对 |
|---|---|---|
| 多角色权限冲突 | 接入真实企业客户 / 加第二个 admin 用户 | M3 启用 PermissionGuard |
| 性能瓶颈 | NavCategory > 50 / NavItem > 1000 | 加 Redis 缓存 listForPortal |
| SQLite 不够用 | 数据量 > 5 万行 / 高并发 | schema.prisma 改 provider postgresql + 跑迁移 |
| 单点故障 | 上线后 | 部署 K8s + 多副本(规模化阶段) |
| 字体缺失 | 系统字体在某些设备不全 | 接入 Google Fonts 镜像或 fontmin 子集 |
| Casdoor 不可用 | 上线后 Casdoor 挂掉 | 退化:启用 dev-login 临时通道(写一份"开关",紧急时打开) |
| 浏览器扩展冲突 | 用户用 360 浏览器或装了某些扩展 | 文档建议用 Chrome / Edge,无痕窗口验证 |
