# 考核系统 · 交接文档(2026-06-24)

> **给下一个 Claude 会话**:这是「考核(assessment)」模块的当前状态全景。**只读这份 + 代码**就能接着推进考核工作,不必翻历史会话。
> 历史细节(P1.1~P2.x 每次迭代的 why)在 `docs/specs/2026-06-13-assessment-p1.md`(可选参考);本文件是**当前快照 + 路线**。
> 计划文件:`~/.claude/plans/effervescent-strolling-catmull.md`(P1 起步)、`~/.claude/plans/steady-meandering-music.md`(考核结果/排名 P1)。

---

## 0. 一句话

**通用考核平台**:把「指标体系 → 取数 → 计分 → 加权汇总 → 定级排名 → 确认」做成可复用引擎。党建 / 行政业绩两路线共用(`AssessmentScheme.track = party|admin`)。源于真实 Excel(党建责任制考核)。

**核心心智模型(用户最新拍板,务必遵守):**
- **一张考核表 = 一个年度考核 = 一轮(Round)**。全年实时打分,**不清空、不重开**。「考核打分」按钮 = 没轮次就建一次、有就直接进(`SchemeList.goScore`)。
- 一切围绕**考核表(SchemeList)**这一个入口页;考核表只给**管理员**看。
- **打分人(责任人)**走人人可见的**「我的考核」**入口,看到「该我打分了」(实时角标),点进直达打分页、只显自己负责的指标。
- **授权 = 被指派为某指标的「考核责任人」(ownerUserIds)**,不需要单独发 `assessment:score` 权限点。

---

## 1. 数据模型(5 张表)

### assessment 模块(4 表,均 `// @module: assessment`)
- **`AssessmentScheme`**(考核表):`name / year / track(party|admin) / targetLevel / indicatorsJson / targetsJson / gradeRulesJson / settingsJson / status(draft|active|archived) / createdById`。**不做模板**,复用=整体复制(`/schemes/:id/duplicate`)。
- **`AssessmentRound`**(轮次):创建时**快照**考核表(`indicatorsJson/targetsJson/settingsJson/gradeRulesJson`)→ 与日后改表解耦。`resultsJson` = `computeRound` 产出;`status(open|done)`。`scores`/`confirms` 反向关系。
- **`IndicatorScore`**(指标得分):`@@unique([roundId, targetRef, leafCode])`。`rawValue`(原始度量 JSON 串:number/bool/"label"/扣分明细对象)、`note`、`evidenceFileIds`(佐证,P3 留)。一格 = 一个(轮次×对象×叶子)。
- **`AssessmentScoreConfirm`**(分数确认会签):`@@unique([roundId, leafCode, userId])`。`status(pending|confirmed)` + `confirmedAt` + `note`(预留申诉)。

### organization 模块(1 表)
- **`PartyAdminLink`**(党组织↔行政机构 N:M):`partyOrgId / adminOrgId`。手动维护(组织页编辑抽屉「关联机构」tab)。用于党建考核对象(党组织)经映射读行政侧业务数据。`OrganizationService.getLinkedAdminOrgs(partyOrgId)` / `getAllLinks()`。

### 关键 JSON 形状
- **`IndicatorNode`**(指标树节点,存 `indicatorsJson`,定义在 `backend/src/assessment/indicator-tree.ts` + 镜像 `react/.../api.ts`):
  ```
  code, label, weight(分值绝对分), kind(normal|bonus|deduction), children?[]
  // 叶子专属:
  dataSource, sourceParams?(如 report.query 的 {reportTaskId,goalKey,field}),
  scoringType, strategyParams?, ownerOrgId?(责任部门), ownerUserIds?[](考核责任人,多人),
  adminUserIds?[](节点管理员,可多人,任意层级,管其子树), rubric?(评分标准/打分参考),
  difficultyOn?(难易系数开关), difficultyCoefs?({targetRef→系数})
  ```
  - 层级:**顶层=一级目录,children=二级目录,leaf=末端指标**。
  - `kind`:`normal` 计权(累加进 normalScore);`bonus`/`deduction` 只第一层选、下级继承,分支 weight=该块**上限**,按块封顶。
  - ⚠ 旧单值 `ownerUserId` 已废,normalize 时并入 `ownerUserIds`(读取兼容)。
- **`SchemeSettings`**(存 `settingsJson`):`baseFullScore(默认100) / scopeOrgId(考核主体单位,责任部门候选限定) / relationKey / subjectOrgId / subjectName / managerUserIds[](协同维护人) / difficultyTables[] / headcounts({targetRef→员工数})`。
- **`AssessmentTarget`**(考核对象快照,存 `targetsJson`):`[{orgId?|userId?, name}]`。单位用 orgId、人员(党员/员工)用 userId。一次性从组织树读出后冻结。
- **`RoundResults`**(存 `resultsJson`):`{computedAt, targets:[{ref,name,leafScores:{leafCode→分}, normalScore, bonus, deduct, total, rank, grade}]}`。`leafScores` 按叶子 code 存**最终分**(过计分工具 + 难易系数)。**无分组/一级二级小计** → 前端按树自行汇总(见 `lib/ranking.ts`)。
- **`GradeRules`**(存 `gradeRulesJson`):`mode='score'`(`thresholds:[{grade,min}]`)| `'rank'`(`tiers:[{grade,band(top|bottom|rest|downgrade),pct?,requireNoLoss?,fromGrade?,years?,onMajorIncident?}]`)。

---

## 2. 计分引擎(灵魂 = 取数与计分解耦的双注册表)

指标只「接一个**数据源** + 选一个**计分工具** + 配参数」,引擎按 outputType↔inputType 兼容自由组合。**照 `task/fields` 注册表范式。**

### 数据源(`backend/src/assessment/data-sources.ts` + 前端 `data-sources/registry.ts`)
| id | label | outputType | ready |
|---|---|---|---|
| `dept_fill` | 部门填写 | number | ✅ |
| `target` | 目标值→完成率 | rate | ✅ |
| `report.query` | 报送任务取数 | number/rate(随 field) | ✅ |
| `dept_grade` | 部门评定等次 | label | ✅ |
| `self_report` 单位自评+佐证 / `business.task.*` 任务完成率·逾期率 / `business.publicity` 宣传 / `business.certificate.honor` 荣誉 / `survey` 群众打分 / `assessment.result` 他考核结果 / `assessment.grade` 他考核定级 | — | ⛔ 占位待接 |
- **`effectiveOutputType(dataSource, sourceParams)`**:`report.query` 的 field=rate→'rate'、actual→'number'(集中一处,避免漂移)。
- **`report.query` 取数**(已通):`assessment.service.resolveReportQuery(taskId, goalKey, field, targetRefs)` → 调 `report.queryGoal` → 按 targetRef 映射(直接 orgId 命中优先;党组织对象经 `getLinkedAdminOrgs` 换算,1:N 时 actual 求和 / rate 平均)。「报送目标=0 视同 100% 完成」已修(在 `report-goals.computeGoalProgress`)。

### 计分工具(12 个,`backend/src/assessment/scoring-strategies.ts` 的 `SCORING_SPECS` + 前端 `scoring/registry.tsx`)
`manual`(人工加分制)· `manual_deduct`(人工扣分制,rawValue=`{items:[{issue,points}]}`)· `proportional`(完成率比例)· `overachieve_tiers`(超额阶梯加分,封顶=分值)· `threshold_tiers`(阶梯赋分,达标→分/未达→0)· `binary`(是否完成,inputType=bool)· `rank_tiers`(排名阶梯)· `rank_linear`(排名线性)· `minmax`(极差标准化,range=0→满分=「视同完成」)· `bonus` · `deduction` · `grade_map`(评价定分对照表,inputType=label,name→固定分)。
- `crossTarget` 工具(rank_*/minmax)需全体对象值才能算。
- **加新计分工具 = 注册表加一条**:后端 `SCORING_SPECS` + 前端 `scoring/registry.tsx` 各加一份。label 类工具配 label 数据源(dept_grade / assessment.grade)。

### round-engine(`backend/src/assessment/round-engine.ts`,纯函数可测)
- `computeRoundResults(indicators, targets, gradeRules, raw, computedAt)` → `RoundResults`。流程:**取数(rawValue)→ 计分(scoring-strategies)→ ×难易系数**(crossTarget 排名类:系数乘「参与排名的值」再排名;非排名类:乘得分)**→ 加权汇总**(normal 累加;bonus/deduction 按块上限封顶;total=normal+bonus−deduct,clamp≥0)**→ 排名 → 名次划档定级**。
- `scoreOneLeaf(leaf, targets, rawOf)` → `{ref→分}`(单叶子)。`previewIndicator(leaf, units)` → `[{ref,name,score,rank}]`(无状态预览,打分页右栏 ●# 实时排名用,前端不重复实现公式)。
- **难易系数**(`difficulty.ts` 前端):大单位人多、积分天然占优,按员工数给倍率拉平。导出单位 CSV→填员工数→导入测算→各单位系数;手动可微调。

### 考核关系(`backend/src/assessment/assess-relations.ts`,7 条枚举「谁考核谁」)
党建:`party.company.committee`(公司党委考核基层党委)、`party.agency.branch`(机关党委考核党支部)、`party.grassroots.branch`(基层党委考核党支部)、`party.branch.member`(党支部考核党员)。
行政:`admin.company.unit2`(公司考核二级单位)、`admin.unit2.unit3`、`admin.unit3.employee`。
- 每条带 level(company/unit2/unit3)+ 主体推导 + 对象推导 + 责任部门归属。结构判定不写死深度(`isUnit2`=admin level3 非部门非虚拟=34 分公司,等)。
- `GET /my-scope` 按登录账号收敛可建的关系 + 主体;`GET /relations/:key/objects?subjectOrgId=` 自动带出考核对象候选。
- ⚠ 组织树有**虚拟壳**层(公司机关/基层单位 = `isVirtual` level2 壳,真实单位在其下 level3),选对象/责任部门要排除虚拟壳。

---

## 3. 后端结构(`backend/src/assessment/`)

| 文件 | 职责 |
|---|---|
| `assessment.module.ts` | 注入 `RoleModule/UserModule/OrganizationModule/ExternalApiModule/PromptModule/ReportModule` |
| `assessment.service.ts` | CRUD + 轮次 + 打分 + 计算 + 确认 + 我的考核 + report.query 解析 + myScope/relations(主体/对象)|
| `assessment-extraction.service.ts` | AI:`extractIndicators`(传考核办法→指标树草稿)、`generateCriteria`(配置→评分标准)。`callLlm` 复用,消费点 `assessment.indicators.extract.text`(chat),json 模式 |
| `indicator-tree.ts` | `IndicatorNode` + `normalizeIndicatorTree`(结构校验)+ `flattenLeaves` + `weightIssues`(权重一致性软提示)|
| `scoring-strategies.ts` | `SCORING_SPECS` 注册表 + `getScoringSpec` + `isInputCompatible` |
| `data-sources.ts` | 数据源注册表 + `effectiveOutputType` |
| `round-engine.ts` | 纯函数计分引擎 |
| `assess-relations.ts` | 7 考核关系 + 主体/对象推导 + `buildOrgIndex` |
| `dto/*` | class-validator DTO |

### 端点全表(`/api/assessment/...`,均 `@UseGuards(AuthGuard)` 登录;标注的另需权限)
**考核表 / 配置:**
- `GET schemes`(登录)/ `GET schemes/:id`(登录,enrich `createdByName`+`userNames`)/ `POST schemes` / `PATCH schemes/:id` / `DELETE schemes/:id` / `POST schemes/:id/duplicate` —— 均 **`@Permission('assessment:manage')`**(除两个 GET)
- `POST scoring/trial`(登录,试算)/ `POST scoring/preview`(登录,单指标 ●# 实时排名)
- `GET report-query/sources`(登录)/ `POST report-query/preview`(登录)
- `GET my-scope`(登录)/ `GET relations/:key/objects`(登录)
- `POST extract`(manage,AI 生成指标)/ `POST criteria/generate`(manage,AI 评分标准)

**轮次 / 打分:**
- `POST schemes/:id/rounds`(manage,发起=快照)/ `GET rounds`(登录)/ `GET rounds/:id`(登录,返回 `{round, scores}`)/ `DELETE rounds/:id`(manage)
- **`POST rounds/:id/scores`(登录 + service 判责任人!)** —— 见权限节
- `POST rounds/:id/compute`(manage,计算)

**确认会签:**
- `POST rounds/:id/confirm-request`(manage,发起/重新发起确认)/ `GET rounds/:id/confirm`(manage,进度+电话)
- `GET confirm/mine`(登录,跨轮次我的确认 —— ⚠ **现孤儿**,MyConfirmations 页已删,可清)
- `POST rounds/:id/confirm/:leafCode`(登录,service 判责任人,逐指标确认 —— 现也基本孤儿)
- **`GET rounds/:id/confirm-mine`**(登录,我在本轮的确认状态,打分页「确认完成」按钮用)
- **`POST rounds/:id/confirm-mine`**(登录,「确认完成」= 我本轮负责的全部标记已确认)
- **`GET my-assessments`**(登录,「我的考核」打分人入口 + 实时角标数据)

---

## 4. 前端结构(`react/src/features/assessment/`)

### 页面 + 路由(`App.tsx`)+ 菜单(`AdminLayout.tsx`,「业务功能 > 考核管理」组)
| 页面文件 | 路由 | 菜单 | 谁可见 |
|---|---|---|---|
| `pages/SchemeList.tsx` | `/admin/assessment/schemes` | **考核表** | `assessment:manage`(管理员)|
| `pages/SchemeEditor.tsx` | `/admin/assessment/schemes/:id` | (从卡片进)| 管理员 |
| `pages/AssessmentResults.tsx` | `/admin/assessment/schemes/:id/results?tab=ranking\|board` | (从卡片进)| 管理员 |
| `pages/RoundDetail.tsx`(打分页)| `/admin/assessment/rounds/:id` | — | 登录(管理员控件门控)|
| `pages/RoundList.tsx` | `/admin/assessment/rounds` | **考核打分**(管理员)| 略冗余,可后续清 |
| `pages/MyAssessments.tsx` | `/admin/assessment/mine` | **我的考核**(无 perm=人人可见 + 实时角标)| 打分人入口 |

- **SchemeList(统一入口)**:卡片下 4 按钮 —— 考核打分(`goScore` 一轮制)/ 考核排名(②)/ 各单位排名(③)/ 单位报告(P2 占位 disabled)。`新建/复制/删除` 顶部(目前未门控,人人可见的页本就只管理员能进)。
- **RoundDetail(打分页)**:三栏(左 指标列表 + 「我负责的/全部」toggle / 中 选中指标逐对象录入 + 「本指标考核规则(打分参考)」rubric 卡 / 右 ●# 实时排名)。顶部 tab:按指标打分 / 汇总排名 / **确认进度(仅管理员)**。按钮:保存录入(登录)/ **计算★总分(仅管理员)** / **确认完成(打分人,带提醒 window.confirm)**。`?leaf=` 深链预选指标。`isManager` 门控见权限节。
- **MyAssessments(打分人入口)**:列我有负责指标的轮次 → 点进 `/rounds/:id`。`useMyAssessmentBadge`(90s 轮询 my-assessments,待确认项数 → 菜单红色角标,经 `AdminLayout` MenuItem.badgeKey + SidebarMenuItem)。
- **AssessmentResults(②③)**:`?tab=ranking`=按我负责的指标(或全部)合计排名 + 下钻 per-leaf + 「去完善」跳打分页预选;`?tab=board`=全量总分榜(金银铜+定级)+ 邻近卡(前三+高它/它/低它)。纯前端从 `resultsJson` 汇总(`lib/ranking.ts`)。

### 关键工具/组件
- `lib/ranking.ts`:`responsibleLeafCodes(tree, userId)` / `leafMetaMap` / `rankBySubtotal` / `medalStyle` / `barPct` / `gradeRulesText`。
- `scoring/`(registry.tsx + types/shared/widgets)、`data-sources/registry.ts`:前端镜像注册表。
- `components/`:`IndicatorTreeEditor`+`IndicatorNodeRow`(指标树,dnd-kit 拖拽 + `useHistory` 撤销重做)、`LeafConfigPanel`(叶子配置:数据源/计分工具/难易系数/责任部门/责任人/节点管理员/评分标准)、`SubjectObjectsPanel`(考核关系→主体→对象)、`GradeRulesEditor`+`gradePresets`(定级预设)、`DifficultyCoefDialog`+`DifficultyEditor`(难易系数)、`ReportQueryEditor`(report.query 配置)、`UserMultiPicker`(全员搜索多选,协同人/节点管理员)、`OrgPicker`、`help.ts`(数据源/计分工具 ⓘ 说明)、`rubric.ts`(评分标准按配置/AI 生成)。

---

## 5. 权限 / 角色模型(当前状态,重要)

### 三层维护角色(配置+展示,**不 enforce** —— 沿用 platform_admin 直通)
- **总管理员** = 考核表创建者(`createdById`)。
- **协同维护人** = `settings.managerUserIds[]`(「考核表设置」加人)。
- **节点管理员** = `IndicatorNode.adminUserIds[]`(任意层级,管其子树)。
- 这三者目前**只记录 + 展示**,后端**不拦编辑**(谁有 `assessment:manage` 都能改任意表)。

### 打分授权(已 enforce,本轮刚改)
- **`saveScores`** = **登录即可 + service 判责任人**:有 `assessment:manage`/platform_admin → 录全部;否则只能录**自己负责的指标**(`confirmLeavesOfRound` 过滤 `ownerUserIds` 含 actor;无负责指标 / 录别人的 → **403**)。**已去掉** `@Permission('assessment:score')`。
- **确认**(`confirm-mine`)同理:登录 + service 判责任人。
- **管理操作**(建表/发起/计算/确认进度/删除)= `@Permission('assessment:manage')`。

### ⚠ platform_admin 检测的坑(已修,务必记牢)
- **平台超管 `admin` 账号的 `me.permissions` 不含字面 `assessment:manage`**(它靠 `permission.guard.ts` 对 `platform_admin` 角色直通,角色没有那条权限行)。
- 前端判「是不是管理员」**必须** `me.isPlatformAdmin || me.permissions.includes('assessment:manage')`(`AdminLayout.canSee` 就是这么写的)。已修 `RoundDetail` / `AssessmentResults` 的 `isManager`。**新写任何「是否管理员」判断都要带 `me.isPlatformAdmin`。**

### 权限点(seed 里有,dev 库靠 platform_admin 直通,未整库 reseed)
- `assessment:manage`(考核管理)、`assessment:score`(原打分点 —— **现已不用于 saveScores**,留着无害)。
- 真要非超管账号测试多角色:`cd backend && npm run db:seed`(⚠ reseed 会覆盖 externalApi 能力勾选 / 重置手工授的角色,见踩坑)。

---

## 6. 已完成(当前可用)

配置层:考核表 CRUD + 整体复制 / 指标树编辑器(拖拽+撤销重做)/ 双注册表(12 计分工具 + 数据源)/ 难易系数 / 定级预设 / 考核关系收敛(7 条,按登录账号判主体)/ 考核对象自动带出 / AI 生成指标 + AI 评分标准 / report.query 报送取数(党组织经 PartyAdminLink 换算)。
打分闭环:发起轮次(快照)/ 三栏按指标录入(每数据源 inputType 对应控件)/ 计算(取数→计分→难易系数→排名→汇总→定级)/ 汇总结果。
协作:三层角色(配置+展示)/ 分数确认会签(管理员发起 → 打分人「确认完成」→ 管理员看谁没确认+电话)。
入口/展示:**一轮制**(考核表卡片合并按钮)/ 考核排名②(按责任指标合计+下钻+跳打分)/ 各单位排名③(全量榜+邻近)/ 打分页规则展示(本指标 rubric)/ **打分人入口「我的考核」+ 实时角标** / 打分页按管理员/打分人收敛控件。
权限:**打分/确认改登录+判责任人**(责任人身份即授权);管理留 `assessment:manage`;修了 platform_admin 检测。

### 相关 git 提交(`git log --oneline | grep assessment`)
`21e05e0d` 三层角色 · `109095bf` 确认会签+统一入口/排名/打分规则 P1 · `10c81de0` report 目标=0 修复 · `d0609402` 一轮制+确认整合 · `00204ada` 打分人入口+打分权限。

---

## 7. 下一步路线(用户已对齐 / 待办)

1. **★ 季度结果快照(用户明确要,下一步首选)**:一轮制下不重开轮,改成「到季度/截止日**手动生成并命名**一个**只读结果快照**(如 1季度结果、2季度结果)」。打分继续在同一轮累积。**需:新表(如 `AssessmentResultSnapshot`{roundId,label,computedAt,resultsJson})+ 生成/查看端点 + 「我的考核结果」可看当前+历次快照对比**。
2. **单位考核报告页(④,P2)**:登录路由(后台+桌面端复用,不做匿名公开),从①「单位报告」按钮 / ③ 单位行进入。体检报告(leafScores 按一级/二级分组,加/减明细)+ Recharts 雷达图(`recharts@2.15.4` 已装,按一级或二级目录,得分率 vs 平均)+ 问题与建议(规则版 `buildIssues` + 「AI 生成」按钮:新增 `ai-prompts.ts` 一条 + `ai-consumers.ts` 一条 chat + `assessment-extraction.generateIssues`;AI 不可达→规则兜底)。
3. **业务数据源接入**:`business.task.*`(任务完成率/逾期 —— 需 `TaskService.getStatsByOrg`)、`business.certificate.honor`(荣誉积分 —— cert recipientUserId→memberships 反查 + `countByOrg`)、`self_report`(自评+佐证+核定)、`survey`(群众打分)、`assessment.result/grade`(他考核→业绩兑现)。均经 `getLinkedAdminOrgs` 党委→行政取数。
4. **清理**:`GET confirm/mine` + `POST confirm/:leafCode` 已成孤儿(MyConfirmations 页删了),可清;`RoundList`(考核打分菜单)在一轮制下略冗余,可评估并入考核表。
5. **难易系数计算口径**落地校验(P2 引擎已写「得分×系数再排名」,真实数据再核)。

---

## 8. 踩坑 / 约束(省时间,务必先看)

- **改后端逻辑后要手动重启 node**:`nest start --watch` 重编 dist 但**不可靠热重启**;改 service/controller 后,跑 e2e 前先确认新代码已生效(探一个新端点 200,或 kill 3001 重启)。查占用:`Get-NetTCPConnection -LocalPort 3001`。
- **prisma migrate(Windows)**:nest watch 锁 dll → generate 失败。**先停 3001 进程**再 `npx prisma migrate dev --name xxx`,然后重启。
- **Edit 工具偶发匹配失败**:本仓 CRLF + 偶有 linter 改写;Edit 报「string not found」时**重新 Read 当前内容**再 Edit,或整文件 Write。
- **测试账号**(dev-login `POST /api/auth/dev-login {username}`,token key `djyy_auth_token_v1`):
  - `admin` = **platform_admin**(直通全功能),user id `cmpidctem005w63udv0lphbjq`。
  - `张明` = username **`81243632`**,user id `cmpk1wwwc0000gf7546h9ztm1`,**role=member(普通用户),无 assessment 权限** → 是验证「打分人/责任人」路径的标准账号。`赵娟`=`cmq54cedu0002u2go983gmboc`。
  - 真实党建考核表:scheme `cmqdehqo9000510pnatqvf0ra`(2026年公司党建考核,track=party,35 基层党委);张明在其中有责任叶子(legacy)。
- **throwaway 测试模式**(全程用):API 建 scheme(admin)→ PATCH indicators(含 `ownerUserIds`)+ targets + 建 round + saveScores + compute → 浏览器/接口验证 → **DELETE round + scheme 清理**。命名带 `__xxx__` 便于核查残留。验证用浏览器:`mcp__Claude_Preview__preview_*`,token 注入 localStorage 后 `location.href` 导航;窄预览窗截图挤,优先用 `preview_eval` 读 `document.body.innerText` 做文本断言。
- **db:seed 副作用**:reseed 覆盖 externalApi 能力勾选(image/3d 标签会被冲掉)+ 重置手工授的角色 → 非必要别整库 reseed;要加权限点就只在 seed 数组加、按需对单账号手工授。
- **门禁**(commit 前必过):`cd react && npm run check`(0 error/0 warning);`cd backend && npm run check`(0/0)+ `npm run check:circular`(0 cycle)。husky pre-commit 会聚合再跑。
- **提交卫生**:本仓常有**另一个会话(3D 展厅 exhibition)**的未提交改动 + `xlsx_dump*.txt` 临时文件 —— commit 时**只 `git add` 考核相关文件**,排除 `backend/src/exhibition/*`、`exhibition-client/*`、`react/src/features/exhibition/*`、`xlsx_dump*.txt`。
- **report 依赖方向**:`assessment → report` 单向(madge 拦);report **绝不**反向依赖 assessment。report.query 是唯一跨界口。
- **theme/语义色**:跟主题色用 `var(--party-primary)`;金/银/铜、定级徽标等是语义色不跟主题变(见 CLAUDE.md)。

---

## 9. 快速上手(新会话第一步)

1. 读本文件 + `backend/src/assessment/assessment.service.ts`(主逻辑)+ `round-engine.ts`(引擎)+ `react/src/features/assessment/pages/RoundDetail.tsx`(打分页)。
2. 起服务:`backend: npm run start:dev`(:3001)、`react: npm run dev`(:5173)。
3. 用 `admin` 账号走一遍:考核表 → 新建/选表 → 发起/进打分(考核打分按钮)→ 录分 → 计算 → 看排名;用 `张明`(81243632)走打分人路径:我的考核 → 进打分页(只显自己指标)→ 保存 → 确认完成。
4. 接着推进**季度结果快照**(路线 1)。
