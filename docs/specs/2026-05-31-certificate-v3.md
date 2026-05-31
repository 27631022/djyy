# 证书管理 V3 — 发证向导重构 + 组织化录入 + 公开验证完善

> **状态:已完成(2026-05-31)**
> 提交(均在 `main`):`b0d9abe1` → `7c053cad` → `01884ea1`
> 前置:[V1 模板设计器](./2026-05-23-certificate-v1.md) · [V2 发证+验证+AI+外部](./2026-05-24-certificate-v2-issue-verify.md)

---

## Context

V2 把"模板 → 发证 → 公开验证 → AI 提取 → 外部证书"的闭环跑通后,**真实试用暴露了一批体验 / 数据质量 / 对外可信问题**:发证向导一步塞太多、受表彰人单位/部门靠手填不规范("不知道表彰的是谁")、公开验证页打不开或信息不全、证书编号格式、AI 识别慢等。

V3 不是堆新功能,而是**把 V2 的闭环抛光到"可交付给真实客户用"**。一句话:让发证好用、数据可识别、对外可信。

---

## 本期改动(按主题)

### A. 发证向导(`CertificateIssue.tsx`)重构
- **拆成 5 步**(原 4 步):
  1. 上传 / AI 抽取(`Step1Upload`)
  2. **确认表彰公共信息**(年度 / 日期 / 有效期 — 新拆出的 `Step2SharedInfo`)
  3. **选证书模板 / 建表彰记录**(`Step2HonorRecords`)
  4. 逐条录入受表彰对象(`Step3RecipientsForm`,per-record 子步骤)
  5. 清单 + 一键发证(`Step4PreviewIssue`)
  - `WizardStep` 扩到 `1..5`,Stepper / 校验 / 前进后退 / 子步骤跳转全部重排。
  - 备注:**不 bump draft version** —— 老草稿落到稍早一步、点"下一步"继续即可,数据不丢。
- **第一步上传支持拖拽**:`onDragOver/onDragLeave/onDrop` + 拖入高亮 + `.docx/.pdf` 扩展名校验(点击上传仍走 input accept)。
- **第 4 步大名单布局修复**:内容区改**内部滚动**(`overflow-auto`)、底部「上一步/下一步」**固定**(`flex-shrink-0` 白底栏);人数多时表格不再压住按钮。

### B. 受表彰人「所在单位/部门」组织化 + 必填 ★核心
证书必须能识别"表彰的是谁",这是 V3 数据质量的重点。
- **从组织树点选**:复用 user 模块的 `OrgPicker`(组织树 + 拼音搜索 + 全称路径),个人/集体的单位/部门都用它,不再纯手填。`OrgPicker` 已提升为 `@/features/user` barrel 导出,供跨 feature 复用。
- **自动带出 + 点选补缺**(用户拍板的方案):
  - 个人(粘贴名单点"识别"):**有工号按工号、没工号按姓名**兜底,在行政机构树里定位主归属,自动带出**全称路径**(如「昆仑物流 / 公司机关 / 财务部」)并预选组织。
  - **待核对标记(重点检查)**:按姓名补的标「按姓名·待核对」(琥珀);**重名多人**标「重名·待核对」且**不自动补工号**(防认错);手动改工号 / 点选会清掉标记。
  - 集体:「按名称匹配单位」按钮 —— 集体名在组织树里**精确**则填、**模糊**(互相包含)填并标「名称不完全匹配·待核对」、没命中留空;集体表底显示「N 待核对」计数。
- **必填**:发证前校验每个收件人都填了单位/部门,缺的行黄条挡住下一步;后端 `issue-certificate.dto` 的 `recipientDept` 改**必填**(双保险)。
- **存全称路径快照**:`recipientDept` 存路径字符串(组织日后改名/改组不影响已发证书);收件人行另存 `deptOrgId` 仅供点选器回显。
- 备注:**外部证书录入页**(`CertificateExternal`)用独立 DTO,本期**未改** —— 外单位人员组织树里没有,保留手填。

### C. 公开验证页(`CertificateVerify.tsx` / `CertificateSearchBox.tsx`)
- **`/verify/:token` 直显证书**:之前只把 token 当搜索框 placeholder、不验证(扫码看不到对应证书)。改为带 token 时自动 `verifyByToken` 直接展示该证书;`/verify`(无 token)仍是通用查询页。
- **空白修复(性能 + 浏览器兼容)**:`verifyByToken` 原返回整张 **~16MB 的 `data:application/pdf`**,前端塞 `<iframe>`,在**非 HTTPS(局域网 IP)被 Chrome 拒渲染 → 空白**。改为:后端只返回**轻量 thumbnail(~14KB)**,前端用 `<img>` 渲染(任何上下文可靠);下载原件走新接口 `GET /public/certificates/verify/:token/file` 按需拉。
- **显示单位/部门**:卡片标签「部门」→「单位/部门」,显示全称路径 → 扫码即知是谁、哪个单位。

### D. 已发证书详情(`CertificateList.tsx` 抽屉)
- 打开抽屉**即自动渲染预览**(原来要点"加载证书预览"):内部证书用模板 `designJson` + `variableData` 现场渲染并**注入真实 certNo**(编号正确);外部证书提示"点下载查看原件"(不内联大 PDF)。
- 顶部信息表加**正确的证书编号**;移除无用的"变量快照"(其中编号是占位错值);移除"批次序号"行;表彰年度去等宽体,与其他行字体一致。

### E. 模板变量「表彰年度」
- 模板变量新增 `yearLabel`(占位符 `{{表彰年度}}`),变量面板可绑;**老模板打开设计器时 `withDefaultVariables` 自动补齐**缺失预设变量(否则老模板没这个变量可用)。
- `buildVariableValues` 输出 `yearLabel`(原样年份);详情抽屉 / 公开页显示「表彰年度」。
- **默认年度 = 上一年**(`defaultYearLabel()`,表彰针对上年度,如 2026 年初表彰 2025 年度);**颁发日期仍为今天**;AI 识别到年份则覆盖默认。

### F. 证书编号
- **总数段补零到 3 位**:`2026-X-5-001` → `2026-X-005-001`(前后端一致);`batchKey` 内部分组键保持原始值(避免改格式把在途批次重新分组/编号)。
- 变量预览值 / 占位编号示例段 `...-100-001` → `...-010-001`。

### G. 后台 / 清理
- 二级菜单「证书管理」分组**可点标题折叠/展开**(状态存 localStorage);分组标题美化(去掉把中文拉散的 `uppercase`/`tracking-wide`,13px 加粗深色)。
- **删模板校验**:删除前 `count` 关联证书,>0 抛中文友好错误(不再暴露英文 Prisma FK 报错);前端删除弹窗预查、有证书则禁用确认 + 给"查看关联证书"入口。
- 删除 **CSV 批量发证**残留页(+ `papaparse` 依赖)—— 旧路线遗留。

---

## 数据模型 / 契约变更

| 项 | 变更 |
|---|---|
| `Certificate.recipientDept` | 语义升级为「组织全称路径快照」;`issue-certificate.dto` 改**必填**(`@MinLength(1) @MaxLength(256)`)。external DTO 仍可选 |
| User lookup | `lookupByEmpNo` 返回值加 `adminOrgId/partyOrgId`;**新增 `lookupByName`**(`POST /users/lookup-by-name`,返回「姓名 → 命中数组」判重名) |
| 公开接口 | **新增 `GET /public/certificates/verify/:token/file`**(下载原件);`verifyByToken` 不再返回 `pdfData`,改返回 `thumbnail`(+ 元数据,脱敏不变) |
| 前端草稿类型(`certificateDraft.ts`) | `PersonRow` 加 `deptOrgId / byName / ambiguous`;`CollectiveRow` 加 `deptOrgId / deptReview`;`WizardStep = 1..5`;`defaultYearLabel()` |
| 新工具 | `certificate/lib/orgPath.ts`(`buildOrgPath` / `findOrgByName`);`OrgPicker` 从 `@/features/user` barrel 导出 |
| 模板变量 | `DEFAULT_VARIABLES` + `CERT_PALETTE_KEYS` 加 `yearLabel`;`withDefaultVariables()` 合并老模板缺失变量 |

> 无 Prisma migration(`recipientDept` 字段早已存在,只改 DTO 校验)。

---

## 关键决策 / 备注

1. **单位/部门不拆成「单位+部门」两个字段**:组织树节点的全称路径已含层级,一个 `recipientDept` 够用;拆字段要迁移老数据,得不偿失。
2. **必填只要求 dept 非空(不强制必须 orgId)**:符合"自动带出+点选补缺"——自动带出 / AI 填的值不强制重选,只挡空的。
3. **凡对外渲染一律用图片,不用 data:PDF iframe**:`data:application/pdf` 在非 HTTPS 上下文一律不可靠(局域网 IP 必空白),且十几 MB 传输也糟。公开页改 thumbnail `<img>` 是性能+兼容双赢。
4. **重名 / 按姓名补的一律标「待核对」**:证书发错人代价高,宁可多一道人工核对。
5. **发证编号格式改动只动显示段,不动 `batchKey`**:避免在途批次重新分组/重新发号。

---

## 已知遗留 / 后续(← 下次"继续干"的入口)

1. **【重要】证书 PDF / 缩略图上烤的是占位编号**:PDF 在后端分配真实 `certNo` *之前*就在前端渲染了(`variableMapping.ts` 里 certNo 是占位符 `年份-码-010-001`),所以**下载的 PDF 原件 + 公开页缩略图印的都是占位号**,真实号只在记录字段里。详情抽屉预览已现场注入真实号规避,但原件没修。
   - 需改发证流程:后端**先发号** → 前端用真号渲染;或发证后**回填重渲染**。已登记为独立 spawn task。
2. **AI 提取慢**:根因是当前误配了推理模型 `deepseek-v4-pro`(慢),改成 `deepseek-v4-flash`(快)即可解决大半 —— **配置改动,非代码**(后台「外部 API 接入」页改 model)。完整诊断 + 分层提速方案见 `~/.claude/plans/ai-swirling-bear.md`(本期用户决定**暂搁置**)。
3. **外部证书录入页**(`CertificateExternal`)未接组织树点选,`recipientDept` 仍可选(外单位场景合理),与发证向导不一致。
4. **老证书无单位/部门**:必填只对新发证书生效,旧证书 `recipientDept` 为空不追溯填充。
5. **证书 PDF 仍 base64 存 DB**(V2 遗留):量大需转对象存储(MinIO/OSS)。公开验证页已不传它,但下载 + 批量打包仍拉大字段。

---

## 验证基线
- react:`npm run check`(tsc + eslint)0 error
- backend:`npm run check` + `npm run check:circular` 0 error / 0 cycle
- 均由 husky pre-commit 强制,过不了提交不上去。
