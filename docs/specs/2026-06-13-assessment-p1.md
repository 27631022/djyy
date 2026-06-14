# 考核系统(通用考核平台)P1 —— 配置层 + 试算 + 组织关联

> 2026-06-13。模块 `assessment`(后端 `backend/src/assessment/`、前端 `react/src/features/assessment/`)。
> 计划原稿:`~/.claude/plans/effervescent-strolling-catmull.md`。

## ⚠ P1.1 修订(2026-06-13 续,用户实测反馈后)

- **「考核体系」改名「考核表」**(全 UI + 菜单)。一张**考核表 = 考核年度 + 考核内容(指标树)+ 考核对象**(三位一体)。**不做模板**;复用 = **整体复制**(`POST /assessment/schemes/:id/duplicate`,改年度/完善指标)。→ scheme 与 round 合并成「考核表」,P2 不再单独建 Round 表,直接在考核表的对象上打分。
- **考核对象进考核表 + 快照解耦**:`AssessmentScheme.targetsJson`(`[{orgId,name}]`,migrate `add_assessment_targets`)。一次性从组织树读出后**冻结**(单位每年会调整/合并,故与组织机构解耦)。编辑器右栏(未选指标时)= 考核对象多选 picker(按 track 选党组织/行政树)。
- **组织合并取平均**(用户提,留 P5 分析期):跨年对比时,合并后单位的历史得分 = 合并前几个单位得分的**平均**。快照(冻结对象名)是其地基。
- **数据源/计分工具加 ⓘ 说明**(`help.ts` 的 `SCORING_HELP`/`DATA_SOURCE_HELP`):点开显示「应用场景 + 使用案例」。
- **考核责任人**:叶子除「责任部门」(`ownerOrgId`)外加「考核责任人」(`ownerUserId`,按责任部门成员选)。
- **可见性模型(P2 提前谋划)**:部门考核管理员看本部门全部填报;责任人只看/填自己负责的指标;填报后期集成 Tauri 桌面端。

## ⚠ P1.2 交互/计分打磨(2026-06-13 续2,用户实测)

- **指标树拖拽排序**(去掉上下箭头):`@dnd-kit` 同级拖拽(`reorderSiblings`);每行加拖拽手柄。
- **有子指标不能删**:分支有子节点时删除按钮禁用(先删完下层)。
- **只填末端权重,上级累加**:叶子可填分值,分支只读=子节点之和(`recomputeWeights` 每次变更后重算)。
- **超额阶梯加分封顶=本项分值**(不可超):`overachieve_tiers` 改为 `{base(100%给分,默认满分), tiers}`,超额**累加**,`clamp(base+Σbonus, 0, fullScore)`。例:分值3、base1、超20%+1、超50%+1 → 160%=3 封顶。(去掉了 capBonus)
- **责任部门按考核主体层级精确显示**:`OrgPicker` 加 `deptOnly`(只列部门)+ `scopeOrgId`(限定主体单位子树)。考核表设置加「**考核主体单位**」(`settings.scopeOrgId`,走 settings JSON 免迁移)→ 责任部门 = 该主体的 isDept 子孙。公司机关→只显示 11 个机关部门(实测,非全 13)。**答用户「预设 or 权限」= 考核表预设**(权限正交,只管访问)。
- **考核责任人**:叶子加 `ownerUserId`(按责任部门成员选);**数据源/计分工具 ⓘ 说明**(应用场景+案例)。

## ⚠ P1.3 指标树/计分再打磨(2026-06-13 续3,用户实测)

- **指标行双行布局**:第 1 行指标名(占整行,不再被挤断);第 2 行权重/类型/操作。解决「一行显示不全」。
- **kind(计权/加分项/减分项)只在第一层选、下级继承**:`onKindChange`→`setKindDeep` 整棵子树同步;子节点显「加分/减分」徽标、无类型下拉。
- **去掉一票否决(veto)**:移除计分工具、kind 选项、定级「否决后定级」字段(前后端 + help)。
- **加分/减分块「整体上限」**:特殊块(kind≠normal)的 weight 改为**可编辑上限/封顶**(计权块仍下级累加、只读);`recomputeWeights` 只累加 normal 分支。如 减分项→一般减分(上限10)/重大减分(上限20),P2 引擎按块上限封顶(扣再多只到上限)。
- **超额阶梯加分封顶=本项分值**:见 P1.2 ④(base + 超额累加 + clamp 到 fullScore)。
- 验证:两端门禁绿 + API(veto→400 移除、超额 160%→3)+ 浏览器(kind 仅第一层 1 个/3 选项无 veto、子继承「减分」徽标、特殊块上限可填、计分工具 10 个、双行布局,0 运行时错误)。

> 下文「P2 round / 考核对象锚定」等表述以 P1.1 修订为准:考核对象已在考核表内(快照),非 P2。

## 这是什么

把「指标体系 → 取数 → 计分 → 加权汇总 → 定级排名」做成**可复用引擎**,党建 / 行政业绩两路线共用。
用户真实 Excel 体系(`xlsx_dump1.txt`/`xlsx_dump2.txt`)= 党建责任制考核:加权指标树(强党建六大工程60% / 八维示范40% / 加分 / 减分 / 一票否决),每指标挂「分值 + 责任部门 + 评分标准」。

**系统灵魂(用户定义)**:一套可复用、可组合的「考核工具(计分器)」库。指标只负责「接一个数据源 + 选一个计分工具 + 配参数」,引擎按注册表算分。**取数(数据源)与计分(计分工具)彻底解耦**,各做成一张注册表(照 `task/fields` 范式),任意 outputType↔inputType 兼容的组合即可复用。

## P1 范围(本期)= 配置层 + 试算 + 组织关联

落地:**考核体系(AssessmentScheme)CRUD + 指标树设计器 + 11 个计分工具 + 数据源库 + 单/整树试算预览 + organization 的「党组织↔行政机构」N:M 关联与手动维护 UI**。
**不含**(P2 起):发起考核(Round)/ 责任部门打分 / 汇总定级排名 / 业务接口数据源取数 / 各采集方式的填报。

## 架构 / 关键决策

- **指标树存 JSON 快照**(`AssessmentScheme.indicatorsJson`,IndicatorNode[]),不拆表 —— 同 `Task.fields` 范式;要 SQL 聚合的是分数(P2)不是定义。
- **权重 = 分值(绝对分)**,对齐 Excel(E 列 7/25/12/4…):叶子满分 = 其分值;分支分值 ≈ normal 子节点之和;顶层 normal 之和 ≈ `settings.baseFullScore`(默认 100)。一致性由 `weightIssues` 软提示,不阻断保存。
- **采集方式按叶子走、并入数据源维度**(不单列「采分模式」表):一套考核内可混用 部门填写 / 单位自评+佐证 / 业务系统自动 / 群众打分。
- **通用平台双路线**:`AssessmentScheme.track` = `party`(对象=党组织:党委/支部/党员)| `admin`(对象=行政机构/员工)。引擎 100% 共享。
- **考核对象锚定党组织树**(顶层=党委,1:1 二级单位);业务数据(按行政单位记)经 **organization 模块的 `PartyAdminLink`** 换算。党组织↔行政机构一般 N:M,党委/党总支当前 1:1,手动维护。
- **试算靠后端权威端点** `POST /assessment/scoring/trial`,前端不镜像 compute 公式(杜绝前后端漂移)。
- 与 task **独立建表**(语义不同;守 DAG:assessment 单向依赖,禁反依赖)。

## 计分工具库(11 个,`scoring-strategies.ts` / 前端 `scoring/registry.tsx`)

| type | 输入 | crossTarget | 规则 |
|---|---|---|---|
| `manual` | number | 否 | 录入值即分(clamp 0~满分),配评分标准 |
| `proportional` | rate | 否 | 满分×完成率,封顶 cap |
| `overachieve_tiers` | rate | 否 | ≤100%按比例;超额按档加分,封顶 capBonus |
| `threshold_tiers` | number | 否 | 命中第一个 值≥阈值 的 score |
| `binary` | bool | 否 | 完成→onTrue(默认满分),否则 onFalse |
| `rank_tiers` | number | **是** | 按名次(topN/topPct)落档 |
| `rank_linear` | number | **是** | 满分×(count-rank+1)/count |
| `minmax` | number | **是** | (本值-最低)/(最高-最低)×满分,保底 floor |
| `bonus` | count | 否 | 每项×perUnit,封顶 cap(P2 归 bonusScore) |
| `deduction` | count | 否 | 每项×perUnit,封顶 cap(P2 归 deductScore) |
| `veto` | bool | 否 | 命中→P2 定级降不合格 |

**加新计分工具** = `scoring-strategies.ts` 加一条 `SCORING_SPECS` + 前端 `scoring/registry.tsx` 加一个 `ScoringStrategyDef`(`makeDefaults/Properties/summary/validate`)。

## 数据源库(`data-sources.ts` / 前端 `data-sources/registry.ts`)

`dept_fill` 部门填写(ready)、`target` 目标值→完成率(ready)、`self_report` 单位自评+佐证(P2 填报)、`business.task.completionRate`/`.overdueRate`/`business.publicity`/`business.certificate.honor`(P2 占位)、`survey` 群众打分(P4)、`assessment.result` 他考核结果(党建占业绩 20%,后续)。
outputType(rate/number/bool/count)↔ 计分工具 inputType 由 `isInputCompatible` 校验。

## 数据模型(本期 2 张表 + 迁移 `add_assessment_and_party_link`)

- **`AssessmentScheme`**(`// @module: assessment`):name/year/track/targetLevel/indicatorsJson/gradeRulesJson/settingsJson/status。
- **`PartyAdminLink`**(`// @module: organization`):partyOrgId/adminOrgId N:M,`@@unique([partyOrgId,adminOrgId])`。

Round/Target/IndicatorScore/Goal 留 P2。

## 关键文件

- 后端:`backend/src/assessment/{indicator-tree,scoring-strategies,data-sources,assessment.service,assessment.controller,assessment.module,index}.ts` + `dto/{create-scheme,update-scheme,trial-score}.dto.ts`;`organization.service/controller` 加 link 方法/路由;`app.module` 注册;`seed.ts` 加 4 权限点。
- 前端:`react/src/features/assessment/{api.ts,treeOps.ts,hooks/useHistory.ts,scoring/*,data-sources/*,components/{IndicatorTreeEditor,IndicatorNodeRow,LeafConfigPanel,OrgPicker}.tsx,pages/{SchemeList,SchemeEditor}.tsx,index.ts}`;`organization/{api.ts,pages/Organizations.tsx}` 加「关联机构」tab + `OrgLinksPanel`;`App.tsx` 路由;`AdminLayout.tsx` 菜单「考核管理→考核体系」;`eslint.config.js` 加 scoring/data-sources 注册表豁免。

## 权限点(seed,reseed 生效;P1 演示靠 platform_admin 直通)

`assessment:manage`(体系/发起)、`assessment:score`(打分,P2)、`assessment:view`、`assessment:export`。授 platform_admin / enterprise_admin。

## 验证(已过)

- 门禁:后端 `npm run check`(tsc 0 / eslint 0)+ `check:circular`(0 cycle);前端 `npm run check`(tsc 0 / eslint 0,持平 0 基线)。
- 迁移 `add_assessment_and_party_link` 应用,Prisma Client 生成。
- **API 端到端冒烟 17/17**:计分引擎 7 例(完成率5.1/阶梯4/排名第1=6第3=3/极差5/二值2/扣分1.5)、体系 CRUD、不兼容组合拦截 400、组织关联 增删查 + 重复 409。
- **浏览器冒烟**:登录→考核体系页→新建→编辑器→加顶层指标→配置叶子(目标值+完成率比例,分值6)→**试算显示 得分 5.1/6**→保存→回读持久化(参数被后端规整为 `{cap:100}`)→0 console error。

## P1.4 修订(2026-06-13)— 考核主体重构为「考核关系」+ 区域收敛 + 考核对象自动带出

用户反馈:原「考核主体(责任部门所在单位)+ 自由组织树多选对象」不贴切,且对象「一个一个点太麻烦」。改为**枚举式考核关系 + 按登录账号收敛 + 对象自动带出 + 批量选**。

### 1. 考核关系注册表(`backend/src/assessment/assess-relations.ts`,纯逻辑)

7 条「谁考核谁」,每条声明 `track / level(company|unit2|unit3) / label / 主体推导 / 对象推导 / 责任部门归属`:

| key | level | 主体 | 考核对象 |
|---|---|---|---|
| `party.company.committee` 公司党委考核基层党委 | company | 党委 root | root 的 committee/general 子级(机关党委 + 34 基层党委)|
| `party.agency.branch` 机关党委考核党支部 | company | 机关党委(name 含「机关」)| 其 branch 党支部 |
| `party.grassroots.branch` 基层党委考核党支部 | unit2 | root 下非机关 committee/general | 其 branch 党支部 |
| `party.branch.member` 党支部考核党员 | unit3 | 各 branch | 其直接成员(党员)|
| `admin.company.unit2` 公司考核二级单位 | company | 行政 root(level1)| level3 非部门非虚拟单位 |
| `admin.unit2.unit3` 二级单位考核三级单位 | unit2 | level3 非部门单位 | 其非虚拟子级(level4)|
| `admin.unit3.employee` 三级单位考核员工 | unit3 | level4 非虚拟 | 其直接成员(员工)|

结构判定不写死深度:`isUnit2`/`isUnit3`(type+isDept+isVirtual)、`isCommittee`/`isBranch`;党组织→行政机构用 `PartyAdminLink` 优先、去后缀名(去「党委/党支部/委员会…」)兜底匹配。加新关系 = RELATIONS 加一条。

### 2. 按登录账号收敛(`GET /assessment/my-scope`)

- `RoleService.getScopesForPermission(actorId,'assessment:manage')`:platform_admin / scope=all → **全部 7 关系 + 全部主体**。
- 否则按 `UserService` 的 admin/party membership,经 `adminSubjectsOf`/`partySubjectsOf` 判所在层级(公司机关身处=company、二级单位子树=unit2、level4/党支部=unit3),只回该层级关系 + 主体限本人单位。即「在公司机关不显示二级/三级关系;身处二级单位不显示公司级 / 三级以下」。
- 每个主体附 `deptScopeOrgId`(选定后写 `settings.scopeOrgId`,责任部门按层级精确显示沿用 P1.2)。

### 3. 考核对象自动带出 + 批量(`GET /assessment/relations/:key/objects?subjectOrgId=`)

按主体推导候选:单位走结构(返回 orgId),党员/员工走 `OrganizationService.listMembers` 直接成员(返回 userId)。前端 `SubjectObjectsPanel.tsx` = 考核关系下拉(带 level 标签)→ 主体下拉(公司级单主体自动选、不显下拉)→ `ObjectsPicker`(候选清单 + 搜索 + **全选/反选/清空**)。`AssessmentTarget` 扩 `userId?`(单位 orgId、人员 userId),`targetRef` 取键;切主体清空已选;track 由关系推导存库;徽标/卡片改显「关系名 · 主体名」。

### 4. 删改

删旧 `TargetObjectsPicker`(扁平全树多选)+ 新建对话框「考核对象层级」select(即「不贴切」处);`OrgPicker`/`TARGET_LEVEL*` 改由关系驱动。`assessment.module` 注入 Role/User/Organization;`OrganizationService.getAllLinks()` 新增。

### 5. 验证

- 门禁:后端 0 error/0 warning/0 cycle、前端 0 error/0 warning。
- **API 端到端**:platform_admin my-scope=7 关系;公司党委→35 基层党委(含机关党委);公司→35 二级单位;塔运司→领导班子/综合办公室/特车运输大队;党支部(机关党支部)→李峰/孙彩霞(user);领导班子→李峰(user);机关党委→11 党支部。
- **浏览器**:7 关系下拉(带层级标签)、二级单位多主体选塔运司→3 三级单位、全选→已选 3、保存回读 track=admin + relationKey + subjectName + 3 对象带 orgId;公司级 `party.company.committee` 自动主体「昆仑物流党委」无需选;党支部考核党员候选=李峰/孙彩霞(user);0 console error。
- ⚠ 非 platform_admin 收敛路径暂无具 `assessment:manage` 的单位账号可演示(逻辑就位,P2 授权后验证)。测试用旧示例表已改存新模型(党建 / 公司党委考核基层党委 / 35 基层党委)。

## P1.5 修订(2026-06-13)— AI 生成指标(预留接口)+ 考核表设置可随时返回

### 1. AI 导入考核办法 → 生成指标(照 task.extract 范式,已可用)

- **后端**:`POST /assessment/extract`(multipart Word/PDF,`@Permission('assessment:manage')`)→ `AssessmentExtractionService`:mammoth(docx)/pdf-parse(pdf)转文本 → `callLlm`(chat,JSON 模式)→ 归一化成 `IndicatorNode[]`。
- **提示词**:`prompt/ai-prompts.ts` 的 `assessment.generate_indicators`(后台「提示词管理」可改),内含**数据源 + 计分工具清单 + 参数形态**,要求 LLM 为每个末端指标选 dataSource/scoringType 并配 strategyParams。**模型路由**:`external-api/ai-consumers.ts` 的 `assessment.indicators.extract.text`(capability=chat)。
- **归一化是安全网**(`normalizeExtractedIndicators`,best-effort 不抛错):code 自动 `n1..`;kind 只第一层取、下级继承;末端指标的 dataSource/scoringType 用注册表 `getDataSourceSpec`/`getScoringSpec` 校验,非法或 outputType↔inputType 不兼容 → 回退 `dept_fill + manual`;参数走 `spec.normalizeParams`。即使 AI 乱填也产出合法可保存的树。
- **不落库**:返回 `{indicators, source}`,前端「AI 生成指标」按钮上传文件 → `tree.record()+tree.setState(indicators)` 一次可撤销 → 人工核对分值/计分工具后再「保存」。
- `assessment.module` 注入 `ExternalApiModule + PromptModule`。
- **真测**:自造考核办法 docx(强党建60/经营业绩40/加分项上限10/减分项上限10)→ deepseek-v4-flash 返 7 末端,层级/kind(normal·bonus·deduction 继承)/分值/数据源/计分工具/参数全部正确(政治铸魂→dept_fill+manual max15、利润→target+proportional、安全生产→deduction perUnit5 cap20、荣誉→bonus perUnit2 cap10、通报批评→deduction perUnit5 cap10);无文件→400「未收到文件」、.txt→400「不支持的文件类型」。

### 2. 考核主体 / 考核对象设置可随时返回

原先选中任一指标后,右栏切到指标配置,**考核主体/对象设置面板就消失**且无返回入口。修:
- 右配置栏顶部常驻「**考核表设置(主体 / 对象 / 定级)**」按钮(未选指标时高亮=当前;选中指标时点它 `setSelectedCode(null)` 返回)。
- **点指标树空白处也返回**:`IndicatorTreeEditor` 滚动容器 `onClick` 判 `e.target === e.currentTarget` 时 `onSelect(null)`。
- 顺手清掉分支说明里的「一票否决」陈旧字样。

验证:门禁双绿;浏览器(AI 按钮 + 考核表设置按钮在位、选叶子→LeafConfigPanel、点按钮 / 点空白处均返回主体设置、0 console error)。⚠ AI 质量取决于所配 chat 模型 + 提示词;文件仅支持可复制文本的 Word/PDF(扫描件/图片 OCR 未做)。

## P2+ 后续

- **P2 打分闭环 + 业务数据源**:Round/Target/IndicatorScore(含 `evidenceFileIds` 佐证)/Goal 表;发起考核(选体系 + 点选党委,记 1:1 行政单位)→ 按叶子数据源/责任部门 fan-out → `dept_fill` 责任部门录入、`self_report` 单位自评+佐证 → `computeRound` 两遍引擎(crossTarget 先聚合全体值)→ 汇总/定级/排名。业务数据源接入(经 `OrganizationService.getLinkedAdminOrgs` 把党委→行政单位,查 `TaskService.getStatsByOrg` 新增 / `CertificateIssueService.countByOrg` 新增 + recipientUserId→memberships 反查)。
- **P2 可见性模型(提前谋划,用户 2026-06-13 提)**:叶子已存 `ownerOrgId`(责任部门)+ `ownerUserId`(考核责任人)。填报闭环按此控权——**部门考核管理员**(`assessment:score` + 本部门)看本部门全部指标填报情况;**责任人**只看/填自己负责的指标。填报后期**集成到桌面客户端**(Tauri,复用 task 的 `useDesktopInboxAlerts` 轮询 + 原生通知范式)。
- **P3** 自评+佐证+核定;**P4** 支部/党员层 + `survey` 群众打分;**行政路线** `track='admin'` 开启(同引擎,主要配置);**P5** 历年对比/导出/看板。
- ⚠ 本期未做 `seedAssessmentScheme` 起步体系(避免整库 reseed 覆盖 externalApi 能力);用户在设计器直接建。
