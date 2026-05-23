# 证书管理系统 V1 — 模板设计器 + 模板 CRUD

> **状态:已完成(2026-05-23 启动 → 2026-05-24 收尾)**
> 提交范围:[b226281..e40453f](https://github.com/) — 18 个 commit
> 当时计划文件原始位置:`~/.claude/plans/nest-1-warm-sky.md`

---

## Context

模块化单体底座已落地(commit b226281),现在开始加第一个业务模块:**证书管理系统**。

完整系统包含「设计器 + 模板 CRUD + 发证 + 公开验证」四块。**V1 只做前两块** —— 把"画证书模板"这件事跑通,验证新约定不别扭、Canvas 设计器复杂度可控,后续再加发证/验证。

参考实现:`D:\web\djyy\功能参考文件夹\证书设计模板\`(独立 Vite + Radix 工程)
- 用 **HTML5 原生 Canvas** + 自研鼠标交互(无 Fabric/Konva)
- 数据 = 可序列化的 `DesignerState` JSON
- 8 种元素 / 撤销重做 / 变量绑定 / PNG 导出 都已实现

V1 决策:
- **借鉴参考的数据模型 + 交互思路,代码自己写**(用我们的 shadcn/Tailwind 风格,集成到 features/ + shared/ 体系)
- 持证人源:虽然 V1 不发证,但 schema 留好"既能选 User 也能手填"的余地

---

## V1 范围

**做**:
- backend `certificate` 模块 + `CertificateTemplate` 表 + CRUD API
- 前端 `features/certificate/` + 模板列表页 + 设计器页
- 设计器:8 种元素、拖拽/缩放/旋转、撤销重做(50 步)、键盘快捷键、变量绑定、预览模式、PNG 导出 + 缩略图
- 加菜单:AdminLayout 加"业务功能"分类,放"证书模板"入口(后续 AI图片分拣/排座/任务管理 都进这类)

**V2 延后**:
- `Certificate` 表 + 发证流程(选模板 → 填数据 → 生成证书记录)
- 公开验证页(扫码/输证书号验证)
- 批量发证(CSV 导入)
- 证书撤销

---

## 数据模型

```prisma
// @module: certificate
model CertificateTemplate {
  id          String   @id @default(cuid())
  name        String                       // 如"年度优秀党员证书"
  description String?
  category    String?                      // 分类(可选):奖励/荣誉/培训...
  designJson  String                       // DesignerState 序列化(elements + background + canvas size + variables)
  thumbnail   String?                      // 缩略图 base64 或 data URL,列表显示用
  width       Int      @default(800)       // 画布 px
  height      Int      @default(566)
  active      Boolean  @default(true)      // 禁用不删
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?                      // user id,可空

  // 为 V2 预留:已发证书会 @relation 到本表 onDelete: Restrict

  @@index([active])
  @@index([category])
}
```

Migration: `npx prisma migrate dev --name add_certificate_template`

---

## 后端结构(按 conventions.md 5 条约定)

```
backend/src/certificate/
├── index.ts                     # barrel — CertificateService 在前,CertificateModule 放最后
├── certificate.module.ts        # @Module({ providers: [CertificateService], controllers: [CertificateController], exports: [CertificateService] })
├── certificate.service.ts       # CRUD + audit;owns CertificateTemplate 表
├── certificate.controller.ts    # @Controller('certificate-templates') + @UseGuards(AuthGuard)
├── dto/
│   ├── create-template.dto.ts
│   └── update-template.dto.ts
└── README.md                    # 该模块 owns 哪些表 / 对外 API
```

Endpoints(都加 AuthGuard):
- `GET    /api/certificate-templates` 列表(active filter 可选)
- `GET    /api/certificate-templates/:id`
- `POST   /api/certificate-templates`
- `PATCH  /api/certificate-templates/:id`
- `DELETE /api/certificate-templates/:id` (硬删,V2 改软删)

Service 写操作要 audit `cert.template.create/update/delete`。

注册:`app.module.ts` 加 `import { CertificateModule } from './certificate'`,放 imports。

---

## 前端结构

```
react/src/features/certificate/
├── api.ts                                 # certificateTemplateApi.{ list, get, create, update, delete }
├── index.ts                               # barrel: export api + page 默认导出
├── pages/
│   ├── CertificateTemplates.tsx          # 模板列表(网格+缩略图,新建/编辑/删除/启用禁用)
│   └── CertificateDesigner.tsx           # 设计器主页(全屏,顶部 header + 左/中/右 panel)
├── components/designer/                  # 设计器内部组件,不对外
│   ├── CanvasStage.tsx                   # ★ 核心:Canvas 渲染循环 + 鼠标交互(拖拽/缩放/旋转/多选)
│   ├── ElementPanel.tsx                  # 左:元素库 + 变量拖拽源
│   ├── PropertiesPanel.tsx               # 右:选中元素的属性编辑
│   ├── LayerPanel.tsx                    # 底/或右下:图层树 + 重排
│   └── DesignerHeader.tsx                # 顶:保存/导出 PNG/预览开关/撤销重做/缩放
├── hooks/
│   └── useHistory.ts                     # 撤销/重做栈(50 步上限)
└── lib/
    ├── designerTypes.ts                  # DesignerElement(8 种)+ DesignerState + VariableField
    ├── designerUtils.ts                  # 元素工厂、变量替换、纹理生成、占位符 {{xxx}} 解析
    └── canvasRenderer.ts                 # 每种元素一个 render(ctx, el) 函数;统一入口 renderAll(ctx, state)
```

参考已有模式:
- 模板列表页骨架抄 [Dictionaries.tsx](../../react/src/features/dictionary/pages/Dictionaries.tsx) 或 [Navigation.tsx](../../react/src/features/nav-category/pages/Navigation.tsx)(header + table/grid + dialog pattern)
- API client 形态抄 [features/site-setting/api.ts](../../react/src/features/site-setting/api.ts)
- 跨模块要的话从 `'@/features/certificate'` barrel 引,**禁止** `'@/features/certificate/api'` 这种深 import

---

## 路由 + 菜单

App.tsx 加 3 个路由:
```tsx
import { CertificateTemplatesPage, CertificateDesignerPage } from "@/features/certificate";
// ...
<Route path="certificate-templates"          element={<CertificateTemplatesPage />} />
<Route path="certificate-templates/new"      element={<CertificateDesignerPage />} />
<Route path="certificate-templates/:id/edit" element={<CertificateDesignerPage />} />
```

AdminLayout.tsx 新增分类:
```tsx
{
  id: "biz",
  label: "业务功能",
  icon: AwardIcon,           // 或 BriefcaseIcon
  items: [
    { path: "/admin/certificate-templates", label: "证书模板", icon: AwardIcon },
    // 后续:AI图片分拣 / 排座 / 任务管理 都进这里
  ],
},
```

---

## 5 个 Phase(每个 Phase 完都跑 check + 浏览器验证 + commit)

### Phase A:后端 + 模板列表页(骨架)
- Prisma `CertificateTemplate` 表 + migration
- `backend/src/certificate/` 完整模块(按约定 5 条:index.ts、@module 注释、走 DI、barrel)
- 前端 `features/certificate/api.ts` + `index.ts`
- `CertificateTemplates.tsx` 列表页(空网格 + "新建模板"按钮跳 `/new`)
- App.tsx 加路由,AdminLayout 加菜单
- `CertificateDesignerPage.tsx` 占位:Header + 三栏布局 + "保存"按钮调 API(画布空着)
- 验证:列表能拉(空)→ 新建 → 输入名字 → 保存 → 回列表看到一行

### Phase B:Canvas 渲染 + 文本/矩形/圆形 + 拖拽
- `designerTypes.ts` 定义 BaseElement + 三种元素类型 + DesignerState
- `designerUtils.ts` 写元素工厂(createTextElement / createRect / createCircle)
- `canvasRenderer.ts` 写 renderText / renderRect / renderCircle + renderAll
- `CanvasStage.tsx` 实现:requestAnimationFrame 渲染循环、鼠标事件(mousedown/move/up)做拖拽
- `ElementPanel.tsx` 左侧添加按钮(文本/矩形/圆形)
- 验证:能加 3 种元素 + 鼠标拖动 + 保存后重新打开能还原位置

### Phase C:缩放 + 旋转 + 多选 + 撤销重做 + 快捷键
- CanvasStage 加 8 个缩放 handle + 1 个旋转 handle
- 鼠标交互识别 handle 类型,做 resize / rotate
- 多选:Shift+click 加选,空白拖框选(可选,Shift+click 够 V1)
- `useHistory.ts` hook + DesignerPage 集成
- 键盘快捷键:Ctrl+Z/Y(undo/redo)、Delete(删除)、Ctrl+D(复制)、方向键(微调,Shift 大步)、Esc(取消选择)
- `PropertiesPanel.tsx` 实现:选中元素后右侧显示属性表单(位置/尺寸/旋转/颜色...)
- 验证:能任意操作 + 撤销/重做 50 步内可靠 + 快捷键全部可用

### Phase D:剩余 5 种元素 + 变量绑定 + 预览模式
- 加 line / decor-border / image(上传 base64) / stamp / qrcode 五种元素 + 各自 render 函数
- `LayerPanel.tsx` 图层树(可见/锁定/删除/重排)
- VariableField 体系:8 个预设变量(姓名/证书编号/颁发日期/...)+ ElementPanel 拖拽变量到画布自动创建文本
- 文本元素属性面板加 `variableKey` 选择
- 预览模式开关:开启后 `{{变量}}` 占位符替换为 sampleValue + 隐藏所有 handle/选择框
- 验证:8 种元素都能加 + 变量绑定生效 + 预览模式正确

### Phase E:导出 PNG + 缩略图 + 收尾
- DesignerHeader 加"导出 PNG":canvas.toDataURL('image/png') + a 标签下载
- 保存时:同时 toDataURL 出小图(限宽 300px,canvas.toDataURL('image/jpeg', 0.6))存到 `thumbnail` 字段
- 模板列表页用 thumbnail 渲染缩略图
- 收尾:加载状态、错误提示、空状态友好文案、暗的细节(背景纹理库?暂时只支持颜色背景,纹理留 V2)
- 验证:导出文件可打开 + 列表缩略图正确显示 + 全套手测一遍(新建/编辑/删除/启用禁用)

---

## 关键技术决策

1. **画布尺寸**:V1 固定 800×566(标准 A4 横版比例),Properties 面板提供改尺寸输入,但暂不支持横/竖切换 + 预设(留 V2)

2. **图片元素**:上传后用 FileReader 读成 base64 存进 designJson —— 简单,缺点是模板会很大。如果大于 ~500KB 警告。V2 改成上传到后端存 URL

3. **二维码**:V1 直接前端用 `qrcode` npm 包生成 dataURL,存 element.dataUrl;V2 发证时替换成验证 URL 的实际 QR

4. **变量绑定**:V1 只是预定义 8 个变量 + 预览替换。VariableField 数据存在 designJson 顶层。V2 发证时这些变量值从表单/User 数据来

5. **不用 Fabric/Konva 的理由**:参考的纯 Canvas 实现已证明能搞定;引入 Fabric 会拉进 200KB+ 的库,且其 API/事件系统跟我们的 React 状态管理不直接对齐,反而增加复杂度

6. **后端不渲染 PNG**:Canvas 在 Node 端要装 `canvas` 原生包(GTK 依赖,Windows 编译麻烦)。前端 canvas.toDataURL 已经够 —— 缩略图前端生成上传 base64

---

## 实施期间发现 + 修正(回顾)

| 问题 | 原因 | 修复 |
|---|---|---|
| 局域网 IP `crypto.randomUUID is not a function` | insecure context 不支持 | `genId()` 三级 fallback:randomUUID → getRandomValues → Date+Math.random |
| 保存 413 Payload Too Large | base64 背景图超过 Express 默认 100KB body limit | `main.ts` 提到 10mb |
| Auth ↔ Audit 循环依赖 | auth.controller 用 AuditService,audit.controller 用 AuthGuard | 在 auth.controller 里 inline `prisma.auditLog.create()`,文档化为 conventions.md 中的例外 |
| Module barrel 加载顺序 bug | AuthModule 放在 barrel 顶部,导致 `@UseGuards(AuthGuard)` 拿到 undefined | 约定:Module export 必须放 barrel 最后(已写入 conventions.md) |
| 印章/二维码默认不可见 | 默认 x 坐标在画布右侧,常见可视区外 | 默认坐标改到画布中部 |
| 印章顶弧文字倒置 | 弧角参数走的是下半圆 | 改为 `-π/2 ± 2π/3` 的真上半弧 |
| 党徽几何近似变形 | 自己画的不规则 | 用户提供官方 PNG → drawImage + source-in 染色,几何 fallback |

---

## 不在 V1 范围(留给 V2)

- `Certificate` 表 + 发证流程
- 公开验证页(`/verify/:token`)
- 批量发证(CSV)
- 证书撤销
- 模板导入/导出 .json 文件(只有 PNG 导出,JSON 持久化是后端 DB)
- 模板版本历史
- 协作 / 共享

→ 见 [2026-05-24-certificate-v2-issue-verify.md](./2026-05-24-certificate-v2-issue-verify.md)
