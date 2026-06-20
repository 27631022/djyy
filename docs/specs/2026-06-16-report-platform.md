# 通用报送平台 `report` + 扶贫采买实例 + 解耦考核数据源 · 规格

> 2026-06-16 立项。源于"扶贫(消费帮扶)资金录入"需求。
> 决策方式:多 agent 并行设计 + 真实代码契约核对,详见本文「附录:裁决记录」。
> 本文是跨会话记忆载体,实施时以此为准;有偏差先改本文再改码。

---

## 0. 一句话定位

新建一个**完全独立的通用报送模块 `report`**(不碰现有 `task`,零回归)。它把
「**一次发布 → fan-out 多对象 → 同一对象可多次提交**」做成可复用底座。
**扶贫采买只是它的一份配置**(一条 `ReportTemplate` + 一批清单数据),不是专用 CRUD。

考核侧(P2)在 `assessment` 加一个**通用 `report.query` 自定义查询数据源**,单向只读消费报送数据,
**代码里不出现 "fupin"**。

---

## 1. 与现有 `task` 的本质区别 + 为什么另起模块

| | 现有 `task`(任务分派) | 新 `report`(报送平台) |
|---|---|---|
| 提交模型 | **一对象一回执**(`TaskSubmission.targetId @unique`) | **一对象可多次提交**(`ReportTarget` 去掉 @unique) |
| 单次提交结构 | 扁平 `formData {fieldCode:value}` | **发票头 + 明细子表行**(master-detail) |
| 文件 | 字段级 | 发票/合同**挂在提交头、N 行共享、不重复传** |
| 沉淀形态 | JSON blob,汇总靠遍历 | **明细落结构化列**,可一句 SQL group-by |

**为什么不改 `task` 而另起**:`TaskSubmission.targetId @unique` 把"一对象一回执"写进了表约束,
inbox / claim / 确认 / 指派 / 超期自动通过 全链路都假设一份回执;放宽它牵动已稳定逻辑,
回归风险远大于另起一个干净模块。用户拍板:**重新挖地基盖房子**。

---

## 2. 用户拍板的决定(锁定)

1. **模块取名 `report`**(报送/填报);前端 feature 同名 `features/report`;权限点 `report:manage` / `report:fill` 等;菜单组「报送管理」。
2. **基层填报入口进统一「我的待办」**:与 task 待办在同一页**分区展示**(「任务待办」/「报送待办」),角标 count 前端相加;**数据层不合并、后端互不依赖、不破 DAG**。
3. **派发模型 = 类任务管理,但去掉"部门↔部门互派"**:
   - 上级派发到**单位**(fan-out),选对象**照搬 task 派发**(分级树 + 类型标签 + 快捷组,`ReportTargetPicker`)。
   - 单位侧**对口责任部门**查看任务 —— **对口已在「组织机构」里配好**(部门 `meta.counterpartParentOrgIds`),
     报送**照搬 task 的 `findHandlerDept`** 实时读同一份 org-meta 解析责任部门。**不再维护独立对口表/配置页**。
   - 该部门人员可**认领/接任务 + 指派承办**录入。
   - **不做平级确认**(机关↔机关双方负责人确认那套,扶贫用不到)。
   - → org-meta 对口 + 认领/指派 **进 P1**;平级确认**不做**。
   - ⚠ **2026-06-16 修订**(用户反馈「对口已在组织机构里设置,照搬任务派发就好」):弃用早先的独立 `ReportRouting`
     表 + 对口路由配置页,改读 org-meta;`ReportRouting` 表留在 schema 但**不再使用**(避免迁移,后续可删)。
     发布向导新增「派发部门」(dispatchOrgId,默认派发人主部门)= 对口解析的 source。
4. **P1 只管信息录入**:考核 `report.query` 数据源、物化、配置 UI **整体放 P2**,P1 不碰 assessment。
5. **清单一年一调,本次整体导入**:批量导入 + 只读检索,不做重 CRUD。

补充已确认的录入语义:
- **费用来源每条明细行独立**(样例同发票内福利费/工会经费混合)。
- **一张发票挂多条明细**;发票文件 + 合同文件**在发票头上传一次,多明细共享引用,明细行不重复上传**(合同与发票同理)。
- 点选清单商品 → 自动带出 产品名称/分类/分类描述/推荐单位/产地/价格,**快照落库**(次年换清单不污染历史)。

---

## 3. 架构分层(一图流)

```
扶贫采买模板  =  report 的一份配置(ReportTemplate 一行 + 导入3988行清单)   ← 仅数据,无代码
        │ 跑在
        ▼
report  通用报送平台核心  (// @module: report)
   发布 ReportTask → fan-out ReportTarget(无 @unique)
        → 对口路由 ReportRouting(单位→责任部门)→ inbox → 认领/指派承办
        → 多次 ReportSubmission(发票头,共享发票/合同文件)
              └─ 1:N ReportLine(明细行:产品快照 / 金额 / 费用来源 = 结构化列)
   目录 ReportCatalog + ReportCatalogItem(批量导入 + 服务端检索)
   对外只读 port:ReportQueryService.aggregate() + collectInUseFileIds()
        │ 依赖下层                               │ 被只读消费(单向, P2)
        ▼                                        ▼
  storage / organization / role / audit   assessment(P2 增量:data-sources 加 report.query,不认识"fupin")

  maintenance(最上层)── inUseFileIds() 聚合 + report.collectInUseFileIds()
  task(现有)──╳── report   互不 import;前端「我的待办」仅 UI 层并列聚合
```

**DAG 守恒**(madge 必过 0 cycle):
- `report → storage / organization / role / audit / prisma`(全在下层)
- `assessment → report`(P2;report 在下层,不成环)
- `maintenance → report`(maintenance 最顶层,加边安全,与现有 certificate/task/exhibition 同构)
- `report` **绝不**反向依赖 `assessment` / `maintenance` / `task`(靠**复制结构镜像** task 范式,不深 import)

---

## 4. 核心裁决:提交粒度 = 「A 的头 + B 的行」

**提交 = 一张发票(头)**,**明细 = 独立结构化行**。二者是正交维度,组合为最优:

- 头(`ReportSubmission`)存 发票号/日期/单位/**发票文件/合同文件(头层各一份,N 行共享)**;
- 明细(`ReportLine`)把 `amount / feeSource / orgId / category` 落成**真实列**(非 JSON 子数组)。

**为什么明细不能埋 JSON**:P2 考核要「按单位高效聚合采购金额 / 按费用来源拆分」。
只有结构化列,聚合才是一句 `prisma.reportLine.groupBy({ by:['orgId'], _sum:{amount:true} })` 走索引;
埋 JSON 则 SQLite 无原生 JSON 聚合,退化为全表遍历。

**为什么文件在头层**:用户硬约束「上传一次、多明细共享、不重复传」**只有头存在时才自然成立**;
`ReportLine` 行内**不带任何文件指针**;`collectInUseFileIds()` 只扫头层两字段,孤儿 GC 登记简单可靠。

**明细唯一权威源 = `ReportLine` 行**,不在 submission 冗余明细数组(避免双写一致性风险)。
`ReportSubmission.headData` JSON 只存头层罕用的模板自由字段。

---

## 5. 最终数据模型(完整 Prisma)

> 跨模块 `fileId / orgId / userId` 全松引用(`String`,不建外键);
> `report` 内部 `ReportSubmission↔ReportLine`、`ReportCatalog↔ReportCatalogItem` 用真 relation + cascade。
> 迁移名 `add_report_module`。

### 5.1 通用报送平台表(`// @module: report`)

```prisma
// @module: report
// 可复用表单 schema(扶贫采买 = 一条实例)。一年一配,轻量。
model ReportTemplate {
  id         String   @id @default(cuid())
  code       String   @unique          // 'fupin_purchase'
  name       String
  fieldsJson String   @default("[]")   // ReportField[] 快照,复用 normalizeFieldDefs 范式
  catalogTag String?                   // 绑定哪批目录(扶贫='fupin-2026'),空=非目录型
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([active])
}

// @module: report
// 一次发布(= 任务根,仿 Task)。fields 是对 template 的快照,发布后改模板不影响在途。
model ReportTask {
  id             String   @id @default(cuid())
  templateId     String?                       // 松引用 ReportTemplate
  title          String
  notes          String?                        // 填报要求
  fieldsJson     String   @default("[]")       // 发布时快照
  catalogTag     String?                        // 快照绑定的目录批次
  dispatchUserId String                         // 派发人(松引用 user)
  dispatchOrgId  String?                         // 派发部门(供对口路由归属)
  dueAt          DateTime?
  noticeFileId   String?                         // 通知文件(松引用 storage)
  seriesId       String?                         // 周期报表串联各期(P3)
  periodLabel    String?                         // '2026'
  status         String   @default("open")       // draft | open | closed | archived
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([dispatchUserId, dispatchOrgId, status, seriesId])
}

// @module: report
// fan-out 派发对象,仿 TaskTarget。★关键差异:提交无 @unique → 一对象多次提交。
model ReportTarget {
  id           String   @id @default(cuid())
  taskId       String
  targetType   String                          // 'org' | 'user'(扶贫主用 org)
  targetOrgId  String?
  targetUserId String?
  handlerOrgId String?                          // 对口责任部门(由 ReportRouting 命中,P1)
  ownerUserId  String?                          // 承办人(认领/指派,P1)
  status       String   @default("pending")     // pending | in_progress | submitted | closed
  createdAt    DateTime @default(now())
  @@index([taskId, targetOrgId, targetUserId, handlerOrgId, ownerUserId, status])
}

// @module: report
// ⚠ 已弃用(2026-06-16):对口责任部门改读「组织机构」org-meta(部门 meta.counterpartParentOrgIds,
//   照搬 task.findHandlerDept)。本表留在 schema 但代码不再读写,后续可删(免一次迁移)。
model ReportRouting {
  id          String   @id @default(cuid())
  scope       String   @default("global")       // 'global' 或某 templateCode(可按报送类型分别配)
  unitOrgId   String                             // 被派发的单位
  handlerOrgId String                            // 该单位的报送责任部门
  createdAt   DateTime @default(now())
  @@unique([scope, unitOrgId])
  @@index([unitOrgId])
}

// @module: report
// ★一次提交 = 一张发票头。targetId 非 @unique(同对象多张发票=多条)。
model ReportSubmission {
  id             String   @id @default(cuid())
  taskId         String                          // 冗余,便于跨 target 聚合
  targetId       String                          // 挂 ReportTarget(非 unique)
  seq            Int                             // 该 target 下第几次提交(1-based)
  invoiceNo      String                          // 发票号
  purchaseDate   DateTime                        // 购买日期
  unitOrgId      String?                         // 单位(松引用 org)
  unitName       String?                         // 单位名称快照
  totalAmountCents Int    @default(0)            // 冗余 = SUM(lines.amountCents),单位=分;列表/校验
  invoiceFileId  String?                         // ★共享发票文件(头层一份)
  contractFileId String?                         // ★共享合同文件(头层一份)
  headData       String   @default("{}")         // 头层其余模板自由字段 JSON(明细不进这里)
  status         String   @default("draft")      // draft | submitted | returned | approved
  submittedById  String?
  submittedAt    DateTime?
  reviewNote     String?
  returnCount    Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  lines          ReportLine[]
  @@unique([targetId, seq])                       // 发号防并发重号(仿 certificate 批次)
  @@unique([taskId, targetId, invoiceNo])         // 防同对象重录同一发票号
  @@index([taskId, targetId, status])
}

// @module: report
// ★原子单位 = 一行结构化记录 = 一条发票明细。可聚合度量抽成真实列。
model ReportLine {
  id            String   @id @default(cuid())
  submissionId  String
  submission    ReportSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  taskId        String                           // 冗余,便于跨提交 SQL 聚合
  orgId         String?                          // 冗余 = 对象单位(便于 group-by)
  lineNo        Int
  catalogItemId String?                          // 松引用 ReportCatalogItem(仅溯源)
  // —— 点选带出的清单只读快照列(清单年度调整不污染历史;完整保留清单信息)——
  productName   String
  spec          String?                          // 规格(清单快照,如「5L」;2026-06-18 增,供按规格统计)
  category      String?                          // 第一~第四部分
  categoryDesc  String?
  recommendOrg  String?                          // 推荐单位
  origin        String?                          // 产地
  catalogSupplier String?                        // 清单供应商(扶贫目录里该产品的供货商;2026-06-18 增,区别于发票销售方)
  unitPriceCents Int?                            // 企业采购价快照(单位=分)
  // —— 录入度量列(可 SQL group-by;金额一律存「分」,UI ÷100 显示)——
  amountCents   Int                              // 购买金额(单位=分)
  feeSource     String                           // ★费用来源(福利费|工会经费),逐行独立
  supplier      String?                          // 销售方(发票识别的实际销售单位,一票一个→冗余到每行;2026-06-18 增,供按销售方统计)
  qty           Int?
  extraJson     String   @default("{}")          // 其余动态列 + catalog:{taxRate,minOrderQty,contact} 清单完整快照
  // 行内【不存文件指针】—— 发票/合同读头层共享
  @@index([submissionId])
  @@index([taskId, orgId])
  @@index([taskId, feeSource])
  @@index([taskId, category])
  @@index([taskId, supplier])                     // 2026-06-18 增(发票销售方)
  @@index([taskId, catalogSupplier])              // 2026-06-18 增(清单供应商)
  @@index([catalogItemId])
}

> **两个供应商概念(勿混)**:`catalogSupplier` = 扶贫清单里该产品的**供货商**(快照,年度调整不变);
> `supplier` = 发票上 AI 识别的**实际销售方**(一票一个,冗余到每行)。两者各一列、各一索引,可分别 group-by。
> 清单其余字段(税率/起订量/联系方式)随 `extraJson.catalog` 完整留存,保证"清单信息完整"。
```

### 5.2 目录(清单)表(`// @module: report`,并入同模块)

```prisma
// @module: report
model ReportCatalog {
  id          String   @id @default(cuid())
  catalogTag  String   @unique          // 'fupin-2026'
  name        String                     // '2026帮扶产品清单'
  year        Int?
  columnsJson String   @default("[]")    // 列定义,驱动 catalog_pick 带出哪些列
  active      Boolean  @default(true)
  items       ReportCatalogItem[]
  createdAt   DateTime @default(now())
  @@index([active])
}

// @module: report
// 清单一行(3988 行)。批量整体导入,一年一调,轻量维护。
model ReportCatalogItem {
  id            String   @id @default(cuid())
  catalogTag    String                    // 冗余,便于按 tag 检索
  catalogId     String
  catalog       ReportCatalog @relation(fields: [catalogId], references: [id], onDelete: Cascade)
  totalSeq      Int?                       // 总序号
  subSeq        Int?                       // 分序号
  productName   String
  spec          String?                    // 产品规格
  purchasePriceCents Int?                  // 企业采购价(单位=分)
  taxRate       String?                    // 税率
  minOrderQty   String?                    // 起订量
  contact       String?                    // 联系方式
  category      String                     // 第一~第四部分
  categoryDesc  String?                    // 类别说明
  supplier      String?                    // 供应商
  recommendOrg  String?                    // 推荐单位
  origin        String?                    // 产地
  dataJson      String   @default("{}")    // 其余列
  @@index([catalogTag, category])
  @@index([catalogTag, productName])
}
```

### 5.3 考核侧(P2,`// @module: assessment`)—— 零新表

复用现有 `IndicatorNode` 随 `indicatorsJson` 快照存 `querySpec`(与 `strategyParams`/`difficultyCoefs` 同范式,**零迁移**):

```ts
interface ReportQuerySpec {
  reportTaskId: string;              // 查哪个报送任务
  by: 'orgId';                       // 聚合维度(本期锁 orgId)
  metric: string;                    // 明细数值列,如 'amount'
  fn: 'sum' | 'count' | 'rate';      // 口径
  filters?: { feeSource?: string[]; category?: string[] };
  dateRange?: { from?: string; to?: string };
  target?: { mode: 'uniform'|'perUnit'; value?: number; perUnit?: Record<string, number> }; // ⚠ 2026-06-18 收窄:业务目标权威在 report(随报送任务下达);此处仅作「无业务下达目标的纯考核基准」兜底,扶贫不用。归属决策见 assessment spec「P2 预备·业务/考核边界」
}
```

`report.query` 叶子的合成值由 `refreshReportScores(roundId)` **物化进现有 `IndicatorScore.rawValue`**
(与人工录入同列、同 `@@unique([roundId,targetRef,leafCode])` upsert),`computeRound` 引擎**一行不改**。

---

## 6. 字段类型扩展(照 `task/fields` 注册表范式)

`report/fields/` 复制 `task/fields` 结构(`types.ts`/`registry.ts`/各 `<type>.tsx` + 后端 `report-fields.ts` 的 `FIELD_SPECS`),
**不 import task/fields**(跨 feature barrel 边界)。在镜像的 9 种字段(text/textarea/number/date/select/file/image/richtext/doclink)上新增:

| 类型 | 落地 |
|---|---|
| **`catalog_pick`** 目录点选带出 | `ownProps={catalogTag, bringOut:[]}`;`FillInput` 借鉴 OrgPicker 扁平检索 + react-query **服务端分页**查 `GET /reports/catalog?q=&category=&page=`(**严禁全量拉 3988 行**),选中把 productName/category/categoryDesc/recommendOrg/origin/unitPrice **一次 onChange 快照**写入本行;后端 `FIELD_SPECS.catalog_pick.normalize` 校验 catalogTag + bringOut 子集 |
| **`detail_table`** 明细子表 | 值=**行数组**,`ownProps={columns: ReportField[]}`(列复用现有字段类型作单元格:`catalog_pick`+`number`金额+`select`费用来源+`text`);`FillInput`=可增删行表格;提交时 service 把每行拆进 `ReportLine`;`normalize` **递归** `normalizeFieldDefs(columns)`;**P1 列类型限定这 4 种**,不开放全类型嵌套(避免组合爆炸) |
| 共享附件(发票/合同) | **不新建类型**:用字段分组,头字段组放 `file`(发票/合同)→ 值落 `ReportSubmission.invoiceFileId/contractFileId`;`detail_table.columns` 里不放 file 字段 |
| 费用来源 | 复用 `select`(选项=福利费/工会经费),作 `detail_table` 列,每行独立 |

eslint 给 `report/fields/*.tsx` 加 `react-refresh/only-export-components` 豁免块(仿 task/fields 先例)。

---

## 7. 解耦考核数据源 `report.query`(P2 设计,先存档)

- **report barrel 暴露只读 port**:
  `aggregate({ reportTaskId, by:'orgId', metric, fn:'sum'|'count', filters:{feeSource,category}, dateRange, orgIds }) → Map<orgId, number>`
  实现 = 一句 `prisma.reportLine.groupBy(...)` 走索引;`rate` 口径(实际/目标)由 assessment 解析层算,不进 port。
- **assessment 加可配置数据源** `report.query`(collection:'report'):per 指标存 `ReportQuerySpec`;`fn` 决定 effectiveOutputType(sum/count→number 喂 rank/minmax;rate→rate 喂 proportional)。**唯一需碰 `isInputCompatible` 之处**:对 `report.query` 叶子用 `effectiveOutputType(leaf)` 替代静态 `spec.outputType`,集中一处。
- **党组织考核对象 → 行政单位采购额**:`getLinkedAdminOrgs(partyOrgId)`(PartyAdminLink)换算,1:1 直取 / 1:N 求和;缺失 → UI 提示「未关联行政机构」。
- **前端 `ReportQueryEditor`** 挂进 `LeafConfigPanel`:选任务→维度→口径→过滤→预览各单位值(`POST /assessment/report-query/preview`,不落库)。
- **解耦红线**:assessment 代码不出现 发票/采购/fupin 字样;绝不直 prisma 查 `ReportLine`(走 DI port)。

---

## 8. 分期实施路线

| 期 | Scope | 交付物 | 验收 |
|---|---|---|---|
| **P1 通用核心 + 扶贫录入闭环**(本轮) | report 模块骨架(7 表 + migrate `add_report_module`)+ 字段注册表(`catalog_pick`+`detail_table`)+ 清单 xlsx 导入(镜像 venue `XLSX.read`→`createMany` 分批)+ 服务端检索 + 发布向导(镜像 task 4 步)+ **对口路由 ReportRouting 配置** + fan-out + inbox(统一「我的待办」分区)+ **认领/指派承办** + **录入发票向导**(头 + 共享发票/合同上传一次 + 明细子表多行点选带出 + 费用来源每行独立 + `$transaction` 落头+N行)+ 审核 + `collectInUseFileIds()` + maintenance 登记 + 扶贫模板 seed + 清单导入 | 可发布扶贫报送任务、责任部门接任务、基层点选录入多张发票、明细落 `ReportLine` 行 | 端到端:发布→对口路由命中责任部门→认领→录入发票(4 明细,共享文件)→审核;**同对象录第 2 张发票成功**(验证多次提交);孤儿 GC 不误删发票文件;门禁双绿 |
| **P2 解耦查询数据源接考核** | `data-sources.ts` 加 `report.query` + `ReportQuerySpec` 归一化 + `effectiveOutputType` + `refreshReportScores()` 物化 + 党组织换算 + preview 端点 + `ReportQueryEditor` UI + 录入页只读+同步按钮 | 考核叶子可配「查某报送任务累计采购金额/完成率→喂计分」 | 配 sum→number 喂 rank / rate→rate 喂 proportional;党委对象经 PartyAdminLink 取到行政采购额;compute 不漂移;assessment 无 fupin 字样 |
| **P3 可选增强** | 催办/超期提醒(复用 task `@Cron`)+ 周期报表 `seriesId` 串联 + 更多模板(设备台账报送等,证明通用性) | — | 新增一个非扶贫模板零改 report 核心 |

**明确不做**:平级确认(机关↔机关双方负责人确认,task P2 那套)—— 扶贫=上级直派单位填报,无机关互派。

---

## 9. 风险与门禁

1. **孤儿 GC 误删**(已两次踩坑:展柜图/头像):发票/合同 fileId **必须**随 report 同 PR 在 `MaintenanceService.inUseFileIds()` 登记 `report.collectInUseFileIds()`(深扫 `noticeFileId + invoiceFileId + contractFileId`);端到端测「上传发票→过宽限→扫描不命中」。report 文件是**业务引用**,**不能**用 `LIBRARY_MODULES` 豁免。
2. **明细必须结构化落库**:`amount/feeSource/orgId/category` 是真实列(非 JSON),否则 P2 聚合退化为遍历 JSON。P1 硬约束。
3. **快照落库防污染历史**:`catalog_pick` 带出值必须快照进 `ReportLine`,`catalogItemId` 仅溯源;次年换清单历史明细不漂移。
4. **费用来源在行不在头**:`ReportLine.feeSource`,绝不放头。
5. **发号并发**:`@@unique([targetId,seq])` + `$transaction` count+1;SQLite 单写锁可保;**切 PG 必须 `isolationLevel:'Serializable'`**(照搬 certificate)。
6. **Windows migrate 锁 dll**:`prisma migrate dev` 前**先停 3001 进程**再 migrate/generate 后重启。
7. **3988 行导入**:`createMany` 分批(SQLite 参数上限);幂等(按 catalogTag+totalSeq+subSeq 先清后灌或 upsert)。
8. **不破基线**:react 0 error/0 warning、backend 0 error/0 warning、`madge --circular` 0 cycle;`report/fields/*.tsx` 加 eslint 豁免块。
9. **DAG**:`report` 不 import `task`(靠复制结构镜像);前端「我的待办」UI 层聚合,后端互不依赖。

---

## 10. 模块骨架(P1 待建文件清单)

后端 `backend/src/report/`:
```
index.ts                      # barrel,Module 放最后
report.module.ts              # imports: StorageModule, OrganizationModule, RoleModule, AuditModule
report.service.ts             # 发布/fan-out/对口路由命中/inbox/认领/指派/审核
report-submission.service.ts  # 录入发票 master-detail + 发号 $transaction + collectInUseFileIds()
report-catalog.service.ts     # 清单 xlsx 导入 + 服务端检索
report-query.service.ts       # 只读 aggregate port(P2 给 assessment;P1 可先空壳)
report-fields.ts              # FIELD_SPECS 注册表(仿 task-fields.ts)
report.controller.ts          # /reports/* (CRUD/发布/inbox/认领/指派/提交/审核) + /reports/catalog
dto/*.ts                      # publish / save-submission / routing / import-catalog ...
README.md
```

前端 `react/src/features/report/`:
```
api.ts                        # reportApi.tasks/inbox/submissions/catalog/routing
index.ts                      # re-export
fields/                       # 复制 task/fields 范式 + catalog-pick.tsx + detail-table.tsx
pages/
  ReportTasks.tsx             # 我派发的报送任务(列表+发布向导)
  ReportInbox.tsx             # 报送待办(或并入统一「我的待办」分区)
  ReportFill.tsx              # 录入发票向导(头+共享文件+明细子表)
  ReportCatalogAdmin.tsx      # 清单导入+检索(轻)
components/
  designer/                   # 字段设计器(镜像 task FieldDesigner)
  CatalogPicker.tsx           # 3988 行点选(借鉴 OrgPicker,服务端分页)
  LineItemTable.tsx           # 明细行表格
```

App.tsx 加路由(`/admin/reports` 等);AdminLayout「业务功能」加「报送管理」组;统一「我的待办」加报送分区。
权限点 `report:manage` / `report:fill`(+ 复用 `report:reception` 做认领/指派,仿 task:reception)进 seed,授 platform/enterprise_admin。

---

## 11. 自动审批规则(扶贫专项,2026-06-18 增订)

> 用户口径:「发票总金额不一定要全对上,只要单项金额对上,并且清单的内容是包含在发票里,就视同安全,
> 直接系统判定审批通过。只有当发票明细金额和明细表金额对不上、发票商品不在扶贫清单目录时,需要审核人审批。」

### 11.1 规则(两条硬条件)

一张发票提交后,**两条同时满足 → 系统直接判定通过(status=`approved`),无需人工**:

1. **清单命中** —— 每条上报明细都关联到扶贫清单目录(`ReportLine.catalogItemId` 非空)= 「清单内容包含在发票里」。
2. **单项金额对上** —— 每条明细的**价税合计**金额,都能在发票各行金额里找到对应(**多重集**消费匹配)= 「单项金额对上」。

任一不满足 → **转人工审核(status=`submitted`)**,并记可读原因。

- **发票总额不参与判定**:一张发票里可混有非扶贫商品,只上报其中的扶贫明细,总额可不等(典型场景,见 11.6 用例 E)。
- **未做 AI 识别(无 `invoiceLines`)→ 无法比对金额 → 转人工**(纯手工录入默认走人工,安全兜底)。

### 11.2 取舍(待用户后续确认)

- **规格不符 / 未识别到销售方** = **仅附注提示,不作为转人工的硬条件**(遵用户「只有〔金额对不上 / 不在目录〕两种才需审批」原话,`只有` 为排他)。
  规格不符多数会表现为金额对不上,经金额这条拦截。若要让「规格不符」也强制转人工,只需在 verdict 里加一条判定即可。

### 11.3 计算位置(权威在后端,前端同口径预览)

- **后端 `report-submission.service.ts` 的 `autoApproveVerdict(lines, invoiceLines)` 是唯一权威判定**:
  - 清单命中:从 `formData` 映射出的 `line.catalogItemId` 算(服务端自有,无需前端给)。
  - 金额对上:用 `dto.invoiceLines`(前端传来的「AI 识别各行价税合计,元」)做多重集比对;发票金额池**逐项消费**,避免一行发票被多条明细复用;金额按**「分」整数**比较(`round(元*100)`)。
- **前端 `ReportFill.tsx` 的 `computeVerdict()` 同口径预览**(识别后绿/琥珀 banner + 提交弹窗),**不决定结果**,只做提示;真结果以后端返回的 `status` 为准。

### 11.4 数据 / 契约(无 schema 迁移)

- DTO 加 `SaveSubmissionDto.invoiceLines?: number[]`(AI 识别各行价税合计,元)。
- 判定结果落头层 `ReportSubmission.headData.__autoApproved`(bool),响应映射出 `autoApproved` 字段;自动通过时 `reviewNote` 记「系统自动审核通过:明细金额与发票一致,且均在扶贫清单目录」。
- 自动通过与人工通过 `status` 同为 `approved`,靠 `__autoApproved` 区分(人工通过缺省该标记)。

### 11.5 纠错通道 + UI 提示(两侧醒目)

- **删除权**:承办人可删除**系统自动通过**(`__autoApproved`)的发票重录(防 AI 误判把记录锁死);**人工审核通过**的不可删(`deleteSubmission` 内区分)。
- **承办人填报页**:识别后 banner —— 绿「核对一致 · 提交后系统自动审核通过」/ 琥珀「提交后将转人工审核」+ 原因;不满足时提交弹窗二次确认;已录卡片标「已通过 · 自动」。
- **审核页**:自动通过显绿「✓ 系统自动审核通过…」;转人工显琥珀「⚠ 需重点审查:〈原因〉」(沿用 `discrepancyNote` 高亮)。

### 11.6 验证(2026-06-18 端到端,真后端造任务→清理)

| 用例 | 输入 | 结果 |
|---|---|---|
| A | 命中目录 + 金额对上 | `approved` · 自动 ✓ |
| B | 命中目录 + 金额对不上 | `submitted` ·「1 项明细金额与发票不一致」 |
| C | 不在扶贫目录 | `submitted` ·「1 项不在扶贫清单目录」 |
| D | 未做识别(无 invoiceLines) | `submitted` ·「无法与发票自动比对」 |
| E | 发票多出非扶贫行·**总额不等**但逐项对上 | `approved` · 自动 ✓ |

删自动通过的发票 → `{ok:true}`;删任务连带清回执。门禁三绿(backend tsc/eslint/0 cycle、frontend typecheck/lint 0/0)。

### 11.7 方案 1 vs 方案 2(边界,方案 2 未做)

- **本规则 = 方案 1 = 扶贫产品统计专项**:检索的表固定(扶贫清单)、检索的内容固定(金额 + 目录命中)。**明确是专项,不适合其他多项内容填报复用**。
- **方案 2 = 通用化**:在配置栏可配「检索哪张表、检索什么内容、带出什么」,复用本「size-aware 规格匹配 + 多重集金额比对」引擎。**后续单独立项**,用户尚未要求开工。

---

## 附录:裁决记录(为什么这么定)

- **提交粒度 A vs B → A 头 + B 行**:A 描述提交动作与文件归属,B 描述明细存储形态,正交;以「P2 考核要 SQL 聚合」为决定性依据,明细必须结构化行。
- **catalog 并入 report 同模块**(不为 2 张数据表起独立模块骨架)。
- **考核侧零新表**:`querySpec` 随 `indicatorsJson` 快照,与现有 `strategyParams` 范式一致,零迁移。
- **对口路由 + 认领/指派进 P1、平级确认不做**:据用户 Q3「类任务管理,去掉部门互派」。
- **P1 不碰 assessment**:据用户 Q4「P1 只管录入,考核后面做」。

---

## 进度快照 + 待续(2026-06-19 收尾,明天继续)

### 本次已落地(均门禁双绿 + e2e 实测)
1. **自动审批规则**(见 §11):明细金额逐项对上发票 + 全部命中扶贫目录 → 系统自动通过(approved);否则转人工。发票总额不必相等。
2. **明细完整快照**:`ReportLine` 加 `spec`(规格)/ `catalogSupplier`(清单供应商)/ `supplier`(发票销售方,另列)+ `extraJson.catalog`(税率/起订量/联系方式);迁移 `add_report_line_spec_supplier`、`add_report_line_catalog_supplier`。两个供应商勿混(清单供货商 vs 发票销售方)。
3. **业务/考核边界 + 方法论收敛**:见 **assessment spec「P2 预备·业务/考核边界」** —— 目标设定放业务、计分工具放考核、11→6 核心工具、扶贫复合分→`minmax`(不用固定步长排名)、定级 rank 模式加绝对底线。
4. **★通用目标系统(本次主体)**:
   - 数据:`ReportTask.goalsJson`(ReportGoal[] 定义)+ `ReportTarget.goalTargetsJson`(逐单位目标值),迁移 `add_report_goals`。
   - 模型 `report-goals.ts`:`kind=amount|presence`;`dim=all|feeSource|category|field`;amount 的 `targetMode=uniform|perUnit`;完成情况 `computeGoalProgress`(纯业务、不依赖考核)。覆盖:总额/分项(费用来源)/分部分(第一部分)金额目标 + 某部分/某字段是否有内容。
   - 端点:`GET /reports/:id/goal-progress`、`POST /reports/:id/goal-targets`;`publish`/`updateTask` 收 `goals`;`publish` 时每个 target 可带 `goalTargets`(perUnit 值,service 过滤非 perUnit 键)。
   - 前端:发布向导**步骤重排**(基本 → 字段 → **派发对象 → 目标设定** → 确认);`ReportGoalEditor`(定义)+ `GoalPerUnitTable`(逐单位录入)+ `GoalTargetPasteBox`(**粘贴导入**,照证书发证解析:Tab/逗号/空格/万/千分位/全角,单位名精确→包含匹配);任务详情「目标完成情况」矩阵 + 逐单位录入(左表 + 右粘贴框)。
   - 验证:goal e2e(5 类目标完成情况、perUnit 发布即落+过滤、负例 amount+field→400)+ 粘贴解析单测 8/8。

### 下一步(明天接着做,按序)
- **② `report.query` 只读取数口**(业务侧,report 模块):把每单位「完成率 / 是否达标 / 各 dim 金额 / 是否买第一部分」按 orgId 单向暴露(§7 已设计,目前空壳)。= 把 `computeGoalProgress` / 明细聚合包装成考核可读的 port。
- **③ 接考核(assessment)**:扶贫 = 大考核表里的**一个 2 分项**,**子项内部对 34 单位排名**。复合分 = `proportional`(总额完成率)+ `binary`(福利费达标 0.4)+ `binary`(工会达标 0.4)+ `binary`(买第一部分 0.2);复合分 → 2 分用 **`minmax`**(或 `rank_tiers`),**不用固定步长**。⚠ 难点:引擎现按「整表总分」排名;子项内部排名需把复合分先算成**一个 leaf 值**(经 report.query 出),再在该 leaf 用 crossTarget 排名工具(叶子级排名已支持)。
- **④ 计分工具收敛**:弱化 `rank_linear` 等,整理到 6 核心。

### 已拍板(别再纠结)
- 目标设定 → **业务(report)**(DAG 红线:report 不反依赖 assessment)。
- 计分工具 → **考核(assessment)**。
- 扶贫 2 分 = 大考核里的 2 分项;**最终用途 = 排名**;**定点/对口 = `category='第一部分'`**;赋分用 `minmax` 不用固定步长。

### 环境提醒
- 后端 `npm run start:dev`(nest --watch)**重编译 dist 但不可靠重启 node** → 改后端运行逻辑后**手动重启**再 e2e(见记忆 `backend-watch-no-hot-restart`)。
- Windows `prisma migrate` 前先停后端(dll 锁)。
- 当前后端在跑(本次最后一次干净重启)。
