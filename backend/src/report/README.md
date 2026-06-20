# report — 通用报送平台

「一次发布 · 多次提交」底座。与 `task`(任务分派)的本质区别:**提交无 `@unique`**(一对象可多次提交)+ 提交 = 发票头 + 明细子行(master-detail)。**扶贫采买**是它的第一个实例(`ReportTemplate code='fupin_purchase'`),非专用 CRUD。

> 完整规格(数据模型/字段类型/解耦考核数据源/分期路线/风险)见 **`docs/specs/2026-06-16-report-platform.md`**。

## 表(均 `// @module: report`)

- `ReportTemplate` — 可复用表单 schema(扶贫=一条配置)
- `ReportTask` — 一次发布(仿 Task,fields 快照)
- `ReportTarget` — fan-out 派发对象(**无提交 @unique**;handlerOrgId 对口部门 / ownerUserId 承办人)
- `ReportRouting` — 对口路由(单位→报送责任部门,仿 UnitTaskRouting)
- `ReportSubmission` — **一次提交 = 一张发票头**(发票/合同文件头层共享,金额存「分」)
- `ReportLine` — **明细行(原子)**:产品快照 + amountCents + feeSource(逐行独立),可 SQL group-by
- `ReportCatalog` / `ReportCatalogItem` — 目录(清单 3988 行,批量导入 + 服务端检索)

## 约定

- 跨模块 `fileId/orgId/userId` 松引用(string,不建外键);`report` 内部 relation+cascade。
- 金额一律存 **`Int` 分(cents)**(可 SQL 聚合 + 无浮点误差;UI ÷100 显示)。守 schema「仅用 String/Int/DateTime/Boolean」。
- 文件(发票/合同/通知)在**头层**,明细行不带文件指针 → `collectInUseFileIds()` 只扫头层,已在 `MaintenanceService.inUseFileIds()` 登记(漏登记会被孤儿 GC 误删)。
- 权限点:`report:manage`(发布/派发)/ `report:reception`(认领/指派/对口配置)/ `report:review`(审核)/ `report:fill`(填报)。

## 进度

- ✅ P1 地基:8 表 + 模块骨架 + 任务读取 + GC 在用集合登记 + 权限点。
- ⏭ P1 后续:清单导入+检索 → 字段注册表(`catalog_pick`/`detail_table`)→ 发布向导+fan-out+对口路由+inbox+认领/指派 → 录入发票向导(master-detail+发号)+审核。
- ⏭ P2:解耦考核数据源 `report.query`(在 assessment,不出现 fupin)。
