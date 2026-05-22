# 开发约定

写代码前先读一遍。

---

## 命名

### 文件
| 类型 | 风格 | 例 |
|---|---|---|
| React 组件 / 页面 | `PascalCase.tsx` | `NavPage.tsx`、`AdminLayout.tsx` |
| 共享组件 | `PascalCase.tsx` | `IconPicker.tsx` |
| API client | `kebab-case.ts` 或 `camelCase.ts` | `site-setting.ts`、`organizations.ts` |
| 后端 module 目录 | `kebab-case/` | `site-setting/`、`nav-category/` |
| DTO | `kebab-case.dto.ts` | `update-site-setting.dto.ts` |
| Hook | `useXxx.ts` (camelCase) | `useLoginGate.ts` |
| 工具函数 | `camelCase.ts` | `pinyinSearch.ts` |
| 常量文件 | `xxx.constants.ts` | `site-setting.constants.ts` |

### 变量
- React state / 局部变量:`camelCase`
- React 组件 / TypeScript 类型 / DTO 类:`PascalCase`
- 常量:`SCREAMING_SNAKE_CASE`(`SITE_SETTING_ID`、`NAV_SEED`)
- 故意未使用的解构变量:`_` 前缀(ESLint 配了 `argsIgnorePattern: "^_"`)

### 中文命名(产品语言一致)
- ✅ "员工编号" / ❌ "账号" / ❌ "工号"
- ✅ "行政机构" / ❌ "行政组织"
- ✅ "一级单位 / 二级单位 / 三级单位 / 四级单位" / ❌ "集团 / 公司 / 部门 / 班组"
- ✅ "党委 / 党总支 / 党支部 / 临时党支部 / 党小组"

---

## 后端 API 约定

### 路径

- 全部走 `/api` 前缀(`main.ts` 里 `setGlobalPrefix('api')`)
- 资源用复数名词:`/users`、`/organizations`、`/site-settings`、`/nav-categories`
- 子资源走嵌套:`POST /nav-categories/:id/items` / `PATCH /users/:id/memberships`

### CRUD 动词

| HTTP | 用途 |
|---|---|
| `GET /resource` | 列表(可带 query 过滤) |
| `GET /resource/:id` | 详情 |
| `POST /resource` | 新建 |
| `PATCH /resource/:id` | 部分更新(推荐) |
| `PUT /resource` | 整体替换(仅用于单例,如 `/site-settings`) |
| `DELETE /resource/:id` | 删除 |

### 鉴权

```ts
@Controller('resource')
@UseGuards(AuthGuard)              // 整个 controller 鉴权
export class XxxController { ... }

// 个别接口公开 — 在该方法上故意不挂 @UseGuards
@Get()
publicList() { ... }
```

**当前公开接口**:`GET /site-settings`、`GET /nav-categories` —— 前台 NavPage 未登录也要拉这些渲染。

### 审计

写操作(POST/PATCH/DELETE)必须打审计:

```ts
await this.audit.log({
  action: 'domain.verb',        // 如 'nav.item.create' / 'org.update'
  target: resourceId,
  actorId: ctx.actorId,
  actorName: ctx.actorName,
  ip: ctx.ip,
  detail: JSON.stringify({ ...diff }),
});
```

### Service 接收 ctx

Service 方法接收一个 `AuditCtx`,Controller 从 `@CurrentUser()` 和 `@Req()` 组装传入:

```ts
return this.svc.update(id, dto, {
  actorId: me.sub,
  actorName: me.name,
  ip: req.ip,
});
```

### DTO 用 class-validator

```ts
export class CreateXxxDto {
  @IsString() @MinLength(1) @MaxLength(64)
  code!: string;

  @IsOptional() @IsInt()
  sortOrder?: number;
}
```

`main.ts` 已全局开启 `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`。

---

## 前端 API client 约定

`src/api/<module>.ts` 一个文件,内部:

```ts
import { api } from "./client";

// 1. 类型(与后端 schema 一致,字段名严格匹配)
export interface XxxDto { ... }

// 2. fallback(可选,用于初始 query 还没拉到时的默认显示)
export const FALLBACK_XXX: XxxDto = { ... };

// 3. API 方法集合
export const xxxApi = {
  list:   ()        => api.get<XxxDto[]>("/xxxx").then(r => r.data),
  create: (data: CreateXxxInput) =>
                       api.post<XxxDto>("/xxxx", data).then(r => r.data),
  update: (id: string, data: UpdateXxxInput) =>
                       api.patch<XxxDto>(`/xxxx/${id}`, data).then(r => r.data),
  delete: (id: string) =>
                       api.delete<{ ok: boolean }>(`/xxxx/${id}`).then(r => r.data),
};
```

### React Query

```ts
const xxxQuery = useQuery({
  queryKey: ["xxx", filterId],          // 数组,可加过滤参数
  queryFn: () => xxxApi.list(filterId),
  staleTime: 60_000,                    // 看场景调
});

const createMut = useMutation({
  mutationFn: (data: CreateXxxInput) => xxxApi.create(data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["xxx"] });  // 同 queryKey 前缀都会刷
    toast.success("已创建");
  },
  onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "失败"),
});
```

---

## 主题色 var 体系

参见 [`../claude.md`](../claude.md#主题色-var-体系-重要) 完整说明。简版:

```tsx
// 跟主题色变(品牌色)
<div className="text-[var(--party-primary)] bg-[var(--party-accent)]">
<div className="bg-party-soft">                     // 8% primary 混白
<div className="hover:bg-party-soft">

// inline style 派生
style={{ backgroundColor: "color-mix(in srgb, var(--party-primary) 80%, black)" }}

// 不跟主题色变(语义色)
<div className="bg-red-100 text-red-700">  // "进行中" 状态标签
<CrownIcon className="text-[#F5A623]" />   // 金牌
```

判断原则:用户改主题色为蓝时,这个颜色还应该是红/橙吗?是 → 语义色,写死;否 → 品牌色,用 var。

---

## 字典 vs 自定义字段

容易混淆,牢记区别:

|  | 字典 Dictionary | 自定义字段 UserCustomField |
|---|---|---|
| 管什么 | "下拉选项的可选值" | "用户表上有哪些自定义字段" |
| 例 | 职务(经理/主管/专员)、学历(本科/硕士)、政治面貌 | 入职日期、身份证号、教育背景 |
| 结构 | 2 级树(category → item) | 扁平,5 种类型(text/number/date/textarea/select) |
| 谁引用 | 自定义字段(type=select 时 dictCode 引用) + 用户表 position 字段 | 用户 customFields JSON 字段 |
| 后台 | `/admin/dictionaries` | `/admin/custom-fields` |

**自定义字段 type=select 时关联字典**:用 `dictCode` 字段指向 `Dictionary.code`。

---

## 加一个新 admin 模块的 7 步清单

参考 `site-setting/` 和 `nav-category/`(最新最完整的模板)。

### 1. Prisma schema

`backend/prisma/schema.prisma` 加 model。注意:
- `id` 默认用 `@default(cuid())`
- 加 `createdAt` / `updatedAt`
- 加合理的索引(`@@index`)
- 关系用 `onDelete: Cascade` 还是 `Restrict` 想清楚

跑迁移:

```bash
cd backend
npx prisma migrate dev --name add_xxx
```

### 2. seed.ts(可选)

如果有默认数据,加 `seedXxx()` 函数,在 `main()` 里调用。用 `upsert` 保证幂等。

```bash
npm run db:seed
```

### 3. 后端模块

`backend/src/<module>/`:
- `xxx.module.ts`
- `xxx.service.ts` —— 注入 `PrismaService` + `AuditService`
- `xxx.controller.ts` —— `@UseGuards(AuthGuard)` 默认加在 class 上
- `dto/create-xxx.dto.ts` + `dto/update-xxx.dto.ts`
- `xxx.constants.ts`(可选,放 enum / 默认值)

在 `app.module.ts` 注册 `XxxModule`。

### 4. 前端 API

`react/src/api/<module>.ts`:类型 + `xxxApi.{ list, create, update, delete }`。

### 5. 后台页面

`react/src/pages/admin/Xxx.tsx`。**抄 `SiteSettings.tsx` 或 `Navigation.tsx` 的骨架**:

- Header bar: `h1` + 描述 + `refresh` + 主操作按钮
- Body: 列表 / 表格 / 表单
- 弹窗组件用 `<DialogShell>` pattern(见 Navigation.tsx)
- 表单状态用独立 boolean dirty flag,不要用 `JSON.stringify(form) !== JSON.stringify(data)`(性能差且对 key 顺序敏感)
- mutation 成功后 `qc.invalidateQueries` + `toast`

### 6. 路由 + 菜单

`react/src/App.tsx`:
```tsx
<Route path="xxx" element={<XxxPage />} />
```

`react/src/layouts/AdminLayout.tsx` 在合适分类下加菜单项 + 选个合适的 lucide icon。

### 7. 验证

```bash
cd react
npm run check    # tsc + eslint 必须 0 error
```

```bash
git status
git add .
git commit -m "feat: xxx"
git push
```

---

## 常见坑

### 1. unused import 会导致 tsc 报错
配了 `noUnusedLocals: true`。删任何未用的 import / 变量。`_` 前缀的故意未用是允许的。

### 2. inline style 里用 CSS var
React 允许:

```tsx
style={{ backgroundColor: "var(--party-primary)" }}
```

浏览器会按 CSS 解析。**别**写 `style={{ backgroundColor: var(--party-primary) }}`(那是 JS 语法错)。

### 3. Tailwind arbitrary value 不能用 var + 透明度
不行:`text-[var(--party-primary)]/40`
解决:在 `index.css` 加 utility class:
```css
.text-party-primary-40 { color: color-mix(in srgb, var(--party-primary) 40%, transparent); }
```

### 4. Prisma client TS 类型在 schema 改后需要重新生成
`npx prisma migrate dev` 会自动跑 generate。如果只改 schema 没跑 migrate,手动:
```bash
npx prisma generate
```

### 5. 后端 dev server 占着 query_engine.dll
Windows 上 prisma generate 失败 EPERM 通常是后端 dev server 锁着。停了 dev server 再 generate。

### 6. 浏览器在另一台电脑访问 timeout
99% 防火墙。开发机 PowerShell 管理员:
```powershell
New-NetFirewallRule -DisplayName "Vite 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Any
New-NetFirewallRule -DisplayName "Nest 3001" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Any
```

### 7. Clash/V2Ray TUN 模式劫持局域网
开发机的 198.18.0.x/16 网卡是这个。把局域网网段加入代理软件的"直连"或"bypass"。

### 8. 360 浏览器
报奇怪的错误页 + 安全检查会拦截局域网 IP + 自定义端口。直接换 Chrome / Edge / Firefox。
