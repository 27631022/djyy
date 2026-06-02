# task 模块 — 任务分派(下发 → 填报 → 汇总)

通用「下发-填报-汇总」底座。部门建**模板**(可复用表单 schema)→ 派发成一次 **Task**(fan-out 到多个单位/个人 **TaskTarget**)→ 接收方**责任人(单人)+ 协同填报人(多人)**共填一份 **TaskSubmission** → 派发人**汇总**。接收单位用 **UnitTaskRouting** 配「上级部门 → 本单位责任人」自动划转。

## owns(表归属本模块)
`TaskTemplate` / `Task` / `TaskTarget` / `TaskCollaborator` / `TaskSubmission` / `UnitTaskRouting`(均 `// @module: task`)。

## 跨模块(松引用,不建外键)
- `fileId`(file/image 字段值、附件)→ storage 的 `StoredFile`
- `userId` / `orgId` → user / organization
- 通过 NestJS DI 调 `OrganizationService` / `UserService` / `DictionaryService` 校验存在性与取名;**不直查别人的表**。守「表归属单一模块 + 依赖图 DAG」。

## 字段(TaskField)
定义存 `*.fields` 的 JSON(非表),见 `task-fields.ts`。类型:text/textarea/number/date/select/file/image/richtext/doclink;支持分组 `group/groupLabel`、数字约束 `min/max/unit/decimals`。`normalizeFieldDefs()` 校验定义,P2 再加值校验。

## HTTP(P1 已实现)
- `GET/POST/PATCH/DELETE /task-templates` — 模板 CRUD(写 `@Permission('task:manage')`)
- `POST /tasks` — 建任务 + 派发(fan-out + 对口路由),`@Permission('task:manage')`
- `GET /tasks` `/tasks/:id` — 我派发的列表 / 详情(登录)

## 权限点
`task:manage`(建模板/派发/汇总)`task:review`(审核退回)`task:reception`(接收管理员分派+对口)`task:fill`(填报)。platform_admin 直通。

## 分期
P1 地基+派发(本次)→ P2 接收+填报+退回 + 站内待办轮询 → P3 汇总 → P4 富文本 + 群晖在线文档接口(`doc/` 占位)→ P5 Tauri 桌面客户端。

## 已知约束 / 待硬化
- P1 不强制「派发范围 = 派发人数据 scope 子树」:有 `task:manage` 即可派给任意存在的单位/个人;scope 限制留 P2。
- 详情取名按 id 逐个 `findOne`(已去重),量大再批量化。
- multipart 上传(P2 文件字段)走 storage 的 `POST /files`,与 json body 限额两套独立。
