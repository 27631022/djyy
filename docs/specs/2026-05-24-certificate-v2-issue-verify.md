# 证书管理系统 V2 — 发证 + 公开验证 + 批量 + 撤销

> **状态:草稿(待 brainstorm 细化 + 用户确认)**
> 前置:[V1 模板设计器 + 模板 CRUD](./2026-05-23-certificate-v1.md) 已完成

---

## Context

V1 已把"画证书模板"跑通,模板能存能取能预览能导出 PNG/PDF。
V2 在 V1 之上加"发证 + 验证"完整闭环 —— 这才是证书系统真正对外的价值。

四件事:
1. **发证**:选模板 → 填变量值 → 生成"已发证书"记录 → 渲染最终证书图 → 下载/打印
2. **公开验证**:二维码扫码 / 输证书编号 → 公开页显示证书 + 真伪状态
3. **批量发证**:CSV 导入 → 一次发 N 张(年度优秀党员表彰这种场景)
4. **撤销**:已发证书可标记作废,验证页显示"已撤销"

---

## V2 范围

**做**:
- backend `certificate` 模块加 `Certificate` 表 + 发证 API + 公开验证 API
- 前端 `features/certificate/` 加 3 个页面:发证表单 / 已发证书列表 / 公开验证页
- 二维码内容:V1 是写死的字符串,V2 换成真实验证 URL
- CSV 批量上传 + 错误行回显
- 撤销:软标记 + 公开页提示

**V3 延后**:
- 证书有效期自动失效(到期变"已过期")
- 公开页 OG 卡片(分享微信看预览)
- 模板版本历史(改模板后老证书还原原模板渲染)
- 证书统计仪表盘(发了多少张、谁发的最多)

---

## 数据模型

V1 给 `CertificateTemplate` 留了 `// 为 V2 预留:已发证书会 @relation 到本表 onDelete: Restrict` 注释,V2 实现这部分:

```prisma
// @module: certificate
model Certificate {
  id           String   @id @default(cuid())
  certNo       String   @unique          // 证书编号,如 DJYY-2026-0001(规则可配置)
  publicToken  String   @unique          // 公开验证 token,32+ 字符随机,跟 certNo 解耦防爆破

  templateId   String
  template     CertificateTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)

  // 持证人 — 既可关联系统 User,也可手填(培训颁发给外部人员)
  recipientUserId String?
  recipientUser   User?    @relation(fields: [recipientUserId], references: [id], onDelete: SetNull)
  recipientName   String                  // 必填,即使关联了 User 也存快照
  recipientIdCard String?                 // 身份证号(可选,加密存?V2 先明文,后续上加密)
  recipientDept   String?                 // 部门快照
  recipientPhone  String?

  // 变量值快照 — 发证时 template.variables 里的 sampleValue 被替换成实际值
  variableData String                     // JSON: { name: "张三", certNo: "...", issueDate: "...", ... }

  issueDate    DateTime @default(now())   // 颁发日期(显示用)
  validUntil   DateTime?                  // 有效期至,null = 永久
  issuedBy     String                     // user id,发证人
  issuerName   String                     // 发证人姓名快照

  // 撤销
  revoked       Boolean   @default(false)
  revokedAt     DateTime?
  revokedReason String?
  revokedBy     String?

  // 渲染产物(可选 — 减少公开验证页的服务端计算)
  imageUrl     String?                   // 静态 PNG(发证后离线生成,存 base64 或后续 CDN URL)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([templateId])
  @@index([recipientUserId])
  @@index([revoked])
  @@index([issueDate])
}
```

User 表反向加:
```prisma
model User {
  // ...
  certificates Certificate[]
}
```

Migration: `npx prisma migrate dev --name add_certificate_issue`

**关键决策**:
- `certNo` 公开可读、`publicToken` 不可猜 —— 验证 URL 走 token,避免知道编号就能枚举
- `recipientUser` 关联可空 + `recipientName/Dept` 快照 —— 即使删 User 或外部人员也能保留证书
- `imageUrl` 字段预留 —— V2 先不做离线渲染(发证时前端 canvas 渲染 → 上传 base64),V3 改 CDN

---

## 后端

```
backend/src/certificate/
├── certificate.module.ts             # 加 IssueService 和 IssueController
├── certificate.service.ts            # V1 模板服务(不变)
├── issue.service.ts                  # ★ 新:发证 + 撤销 + 列表
├── issue.controller.ts               # ★ 新:发证 API
├── public-verify.controller.ts       # ★ 新:公开验证 API(不加 AuthGuard)
├── dto/
│   ├── issue-certificate.dto.ts      # 单证发证
│   ├── bulk-issue.dto.ts             # CSV 批量
│   ├── revoke-certificate.dto.ts
│   └── update-template.dto.ts        # V1
└── index.ts
```

Endpoints:

| 方法 | 路径 | Auth | 说明 |
|---|---|---|---|
| `POST` | `/api/certificates` | Auth | 单证发证 |
| `POST` | `/api/certificates/bulk` | Auth | CSV 批量发证 |
| `GET`  | `/api/certificates` | Auth | 已发列表(filter:templateId/recipient/revoked/dateRange) |
| `GET`  | `/api/certificates/:id` | Auth | 详情 |
| `PATCH`| `/api/certificates/:id/revoke` | Auth | 撤销 |
| `DELETE`| `/api/certificates/:id` | Auth(admin) | 硬删(谨慎) |
| **`GET`** | **`/api/public/certificates/verify/:token`** | **公开** | 验证 — 返回简化版证书数据 |

**审计**:`cert.issue.create / cert.issue.bulk / cert.issue.revoke / cert.issue.delete`

**证书编号规则**:`DJYY-{YYYY}-{NNNN}`,按年序列(用 Prisma 事务 + 行锁)。可在 site-setting 加个 `certNoFormat` 字段后续做可配置。

---

## 前端

```
react/src/features/certificate/
├── api.ts                            # 加 certificateIssueApi.{ issue, bulk, list, get, revoke, delete }
│                                     # 加 certificateVerifyApi.{ verify(token) }(公开,无需 token 头)
├── pages/
│   ├── CertificateTemplates.tsx     # V1
│   ├── CertificateDesigner.tsx      # V1
│   ├── CertificateIssue.tsx         # ★ 新:发证表单页
│   ├── CertificateList.tsx          # ★ 新:已发证书列表
│   └── CertificateBulkIssue.tsx     # ★ 新:CSV 批量页(也可合并进 Issue 页加 tab)
├── pages-public/                    # ★ 新:公开页(不走 AdminLayout)
│   └── CertificateVerify.tsx        # /verify/:token
├── components/issue/                # ★ 新
│   ├── TemplatePicker.tsx           # 发证第一步:选模板
│   ├── VariableForm.tsx             # 动态表单(template.variables 驱动)
│   ├── PreviewCanvas.tsx            # 复用 CanvasStage 的 preview 模式
│   └── CertificateRenderer.tsx      # 给公开页用,渲染最终证书(canvas → dataURL)
└── ...
```

公开路由要绕过 AdminLayout/AuthGuard,App.tsx 加:
```tsx
<Route path="/verify/:token" element={<CertificateVerifyPage />} />
```

菜单 AdminLayout 加 2 项:
```tsx
{ path: "/admin/certificates",       label: "已发证书",   icon: AwardIcon },
{ path: "/admin/certificates/issue", label: "发证",       icon: SendIcon },
```

---

## Phase 拆分(预计 4 个)

### Phase A:发证后端 + 单证发证 UI
- Prisma `Certificate` 表 + migration
- `issue.service.ts` + `issue.controller.ts` + DTO
- 证书编号生成(事务 + 序列)
- 前端 `CertificateIssue.tsx`:模板选择器 → VariableForm(根据 template.variables 渲染) → PreviewCanvas → "发证"按钮
- 发证成功后跳详情页,显示二维码 + 下载 PNG/PDF
- 验证:能发一张,能在列表看到,能下载渲染好的证书

### Phase B:已发证书列表 + 撤销
- `CertificateList.tsx`:卡片或表格,带筛选(模板/收件人/状态/日期)
- 详情 drawer/页:展示证书 + 撤销按钮 + 撤销原因输入
- 撤销后状态变"已撤销",列表加灰色蒙层
- 验证:列表/筛选/详情/撤销全跑一遍

### Phase C:公开验证页
- `pages-public/CertificateVerify.tsx`:URL 走 `/verify/:token`,后端 `/api/public/certificates/verify/:token` 返回简化数据
- 真伪显示:"证书有效" / "证书已撤销" / "证书不存在" 三种状态
- 渲染证书图(用 V1 的 canvasRenderer + 实际变量值)
- 二维码内容更新:发证时 QR 自动指向 `${ORIGIN}/verify/${publicToken}`
- 验证:扫码进公开页 + 直接输 URL 进公开页 + 撤销后状态正确

### Phase D:批量发证 + 收尾
- `CertificateBulkIssue.tsx`:CSV 上传 + 模板预览 + 字段映射(CSV 列 → 模板变量)
- 后端 `POST /certificates/bulk`:逐行发证,失败行回显
- 进度条 + 部分成功提示
- 收尾:导出已发列表为 Excel/CSV、撤销时给 User 发通知(可选,V3?)
- 验证:CSV 一次 50 张 + 错行回显 + 全部成功路径

---

## 关键技术决策

1. **publicToken 32 字符随机**:`crypto.randomBytes(24).toString('base64url')`,防爆破。证书编号公开可见但 URL 不暴露编号。

2. **变量值快照存 JSON 不存关系**:发证时把 template.variables 的实际值固化进 `variableData`,后续即使改模板变量定义,老证书也能还原。

3. **不离线渲染 PNG**:V2 发证不存证书图,公开验证页前端拿 `template.designJson` + `cert.variableData` 现场 canvas 渲染。优点:文件小,改模板瞬时生效;缺点:依赖前端 JS。V3 再考虑后端渲染或缓存。

4. **CSV 解析**:用 `papaparse`(已是 React 生态常用)。CSV 模板示例可在发证页提供下载。

5. **撤销不删数据**:`revoked = true` + 记录人和原因,审计要求。

6. **公开页绝不要 AuthGuard**:`@Public()` 装饰器或单独的 `public-verify.controller.ts` 不被 AppModule 的全局 guard 套住。

---

## 不在 V2 范围

- 证书有效期自动失效(到期变"已过期")—— 验证页可显示,但不批量轮询
- 微信分享卡片 / OG image
- 模板版本历史
- 仪表盘统计
- 证书图加水印 / 防伪码
- 区块链存证(听起来酷,99% 场景用不上)

---

## 开工前要确认

1. **证书编号规则**:`DJYY-2026-0001` 这种?还是用户/客户要自定义前缀?
2. **持证人输入方式**:V2 默认"两种都支持(从 User 选 / 手填)",还是只走 User?如果只走 User,外部颁发(培训证书给外部人员)怎么办?
3. **批量发证字段映射**:CSV 列名跟变量 key 自动 match,还是手动配?
4. **签发权限**:任何登录用户都能发,还是要 role 限制(目前 Permission 表已建但 Guard 未启)?
5. **打印格式**:V1 已支持 PDF 导出,V2 发证后默认下载 PDF 还是 PNG?

→ 这些问题等明天开工前 brainstorm 时确认。
