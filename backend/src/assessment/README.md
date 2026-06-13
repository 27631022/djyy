# assessment —— 考核系统(通用考核平台)

把「指标体系 → 取数 → 计分 → 加权汇总 → 定级排名」做成可复用引擎,**党建考核 / 行政业绩考核两路线共用**。

## owns 的表
- `AssessmentScheme`（考核体系/模板:指标树 JSON 快照 + 定级规则 + 设置）
- (P2) `AssessmentRound` / `AssessmentTarget` / `IndicatorScore` / `AssessmentTargetGoal`

> 党组织↔行政机构关联(`PartyAdminLink`)归 **organization** 模块;本模块只消费 `OrganizationService.getLinkedAdminOrgs()`。

## 核心:两张可插拔注册表(照 task/fields 范式)
- **数据源 `data-sources.ts`**:`DataSourceSpec`,决定「完成情况从哪来」(dept_fill / target / self_report / business.* / survey / assessment.result),产出原始度量(rate/number/bool/count)。
- **计分工具 `scoring-strategies.ts`**:`ScoringSpec`,原始度量 → 得分。11 个:manual / proportional / overachieve_tiers / threshold_tiers / binary / rank_tiers / rank_linear / minmax / bonus / deduction / veto。
- 解耦:outputType ↔ inputType 兼容(`isInputCompatible`)即可任意组合 = 复用。
- 指标树 `indicator-tree.ts`:`IndicatorNode`(kind=normal/bonus/deduction/veto,weight=分值)+ `normalizeIndicatorTree` / `flattenLeaves` / `fullScoreOf` / `weightIssues`。

## 加新计分工具 / 数据源
- 计分工具 = `scoring-strategies.ts` 加一条 + 前端 `features/assessment/scoring/<type>.tsx` 镜像。
- 数据源 = `data-sources.ts` 加一条 + 前端 `features/assessment/data-sources/` 镜像;business 类取数在 service 注入对应模块实现。

## 对外 API(P1)
`GET /assessment/schemes`、`GET /assessment/schemes/:id`(登录);`POST/PATCH/DELETE /assessment/schemes[/:id]`(`@Permission('assessment:manage')`)。

## 权限点
`assessment:manage`(体系/发起)、`assessment:score`(责任部门打分,P2)、`assessment:view`、`assessment:export`。
