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

## P1.6 修订(2026-06-13)— 定级规则预设(按名次划档)+ 兑现标准工具评估

### 1. 三套定级预设(用户真实定级办法)

按名次划档(`GradeRules.mode='rank'`),计算在 P2 引擎(需全体名次);P1 配置 + 预设 + 可读展示。

| 预设 | 适用考核关系 | 档次 | 规则 |
|---|---|---|---|
| 党委(直属党总支)综合考核定级 | `party.company.committee` | 先进 / 良好 / 一般 / 较差 | 排名前 15% 且未亏损→先进;后 15%→一般;连续 2 年「一般」或当年重大不良影响→较差;其余→良好 |
| 党支部综合考核定级 | `party.agency.branch` / `party.grassroots.branch` | 先进 / 达标 / 基本达标 / 未达标 | 前 15%→先进;后 15%→基本达标;连续 2 年「基本达标」或当年重大不良影响→未达标;其余→达标 |
| 党员综合考核定级 | `party.branch.member` | 优秀 / 合格 / 基本合格 / 不合格 | 前 30%→优秀;后 5%→基本合格;连续 2 年「基本合格」或当年重大不良影响→不合格;其余→合格 |

- **数据模型**:`GradeRules` 扩 `mode:'score'|'rank'` + `tiers:GradeTier[]`(`band` = top/bottom/rest/downgrade;`pct`/`requireNoLoss`/`fromGrade`/`years`/`onMajorIncident`)。后端 `gradeRulesJson` 本就存裸 JSON、DTO `gradeRules?:Record<string,unknown>` 不剥字段 → **零后端改动**。
- **前端**:`gradePresets.ts`(`GRADE_PRESETS` + `presetForRelation` + `tierRuleText` + `cloneRules`)+ `GradeRulesEditor.tsx`(套用预设下拉 3 + 自定义总分阈值;**按当前考核关系自动推荐** banner 一键套用;名次档可读编辑——档次名/比例/连续年数可改,未亏损·重大不良影响条件随预设)。`SchemeEditor` 的 `SettingsPanel` 用 `GradeRulesEditor` 取代原内联总分阈值编辑器。
- **加新定级预设** = `gradePresets.ts` 加一条(关联考核关系 key 即自动推荐)。

### 2. 兑现标准(定级 → 业绩分)工具评估

用户兑现标准:党委 先进 24 / 良好 20 / 一般 18 / 较差 16;党支部 先进·红旗 24 / 达标 20 / 基本达标 18 / 未达标 16(均「定级档次 → 固定业绩分」)。

- **结论:现有 10 个计分工具无一直接吃「定级档次(文字)」做映射**。`threshold_tiers` 吃数字、按总分阈值而非档次,语义不符(同档不同分会被拆开)。
- **当前可用** = `manual`:人工按党建定级在业绩表「党建评价」指标录入对应分(无需新工具,今天即可)。
- **自动化干净解法** = 新增 `grade_map`(评价定分)计分工具 + label 数据源。→ 用户确认后于 P1.7 实现(见下)。

验证:前端门禁 0 error/0 warning;浏览器端到端(党委考核表 → 定级规则区出「建议套用:党委…」banner → 套用 → 4 档渲染含未亏损/前后%/连续2年 → 保存 → 重读 gradeRulesJson=mode:rank + 4 tiers 持久化、0 console error)。

## P1.7 修订(2026-06-13)— 通用「评价定分(对照表)」计分工具 `grade_map`

用户要把兑现做成可大量复用的通用工具:**30+ 评价名次 → 各自固定分,评上某档即得该档分**(不按名次细分,「抓两头带中间」不让过度内卷)。

### 引擎扩展:label 输入类型

- 计分引擎首个**非数值输入**:`ScoreInput`/`DataSourceOutput` 加 `'label'`(评价名次/等次,字符串);`RawMetric` 扩 `string`;`asNumber` 对字符串返回 null(其余工具遇 label 输入安全得 0);`isInputCompatible` 加 `label↔label`;`trial()` 对 label 工具透传字符串 raw(`toRaw` 不动)。

### 计分工具 `grade_map`(评价定分 · 对照表)

- params `{ options: [{ label, score }] }`;`compute` = 按 label 查表给固定分(命中→`clamp(score,0,max(fullScore,score))`;未命中→0)。`normalizeParams` 要求 ≥1 项,否则 400。
- 前端:`scoring/registry.tsx` 加 def(`makeDefaults` 预置 先进24/良好20/一般18/较差16 起步,可改名增删)+ `widgets.tsx` 的 `LabelScoreEditor`(名次+固定分 行编辑)+ `LeafConfigPanel` 的 TrialPreview 加 label 分支(下拉选名次试算)。计分工具 10→**11**。

### 配套 label 数据源

- `dept_grade`(部门评定等次,**ready**):责任部门/考核人直接评一个名次/等次,配 grade_map 给固定分。
- `assessment.grade`(他考核定级档次,**P2**):取另一考核的定级档次(党建定级→业绩兑现)。

> 加新计分工具仍是「注册表加一条」:后端 `SCORING_SPECS` + 前端 `scoring/registry` 各一份;label 类工具配 label 数据源即可。本工具同时解决了「定级兑现」与「按等次直接定分」两类需求,复用面广。

验证:双端门禁 0 error/0 warning/0 cycle;API(grade_map 试算 良好→20 / 先进→24 / 未知→0、空对照表→400、`dept_grade`+`grade_map` 保存 200、`dept_fill`(number)+`grade_map`→400 不匹配)+ 浏览器(选 `dept_grade` → 计分工具仅剩「评价定分(对照表)」、选中出 4 行对照表 + 摘要「4 个名次→固定分」、试算下拉 先进=24/良好=20、0 console error)。

## P1.8 修订(2026-06-13)— 难易系数(积分系数)

用户单位:大单位宣传人员多,荣誉积分天然占优、排名靠前。按**员工人数**给不同**积分系数**拉平(小单位倍率高)。

| 员工人数档 | 积分系数 |
|---|---|
| 2000 以上 | 1 |
| 1001-2000 | 1.2 |
| 501-1000 | 1.4 |
| 301-500 | 1.6 |
| 101-300 | 1.8 |
| 100 以下 | 2 |

**核心认知(经三轮校正定型)**:难易系数是「**某指标 × 某单位**」的一个**具体数,管理端和基层都要直观看到**(如宣传积分上「公司机关党委 = 1.8」);上面这张「多少人→多少系数」的档表只是 **测算工具(辅助手段之一)**;员工数由用户 **导出单位 → 填 → 导入**,不自动从组织取。

- **数据模型(全 JSON 裸存,零迁移)**:叶子 `IndicatorNode.difficultyOn`(本指标启用)+ `difficultyCoefs: {targetRef→系数}`(各单位具体系数,缺省=1,**权威可见值**)。`SchemeSettings.headcounts: {targetRef→员工数}`(导入,全表共享)+ `difficultyTables[]`(测算表 `{id,label,basis:'headcount',tiers:[{maxCount,coef}]}`,共享)。后端 `normalizeIndicatorTree` 保留 difficultyOn/difficultyCoefs(唯一后端改动);**去掉**旧 `difficultyId` 引用式设计。
- **按指标走(像计分工具),默认系数 1**:`LeafConfigPanel` 计分工具下方「难易系数」开关 + 「配置各单位难易系数(已设 N 个)」按钮 → 独立弹窗 `DifficultyCoefDialog`:
  1. 测算表(`DifficultyEditor`,人数档→系数,可编辑/多套);
  2. **导出考核单位 CSV → Excel 填员工数 → 导入** → **按员工数测算**(`coefForCount` 写 settings.headcounts + 各单位系数);
  3. 每个单位一行 `单位 | 员工数 | 系数`,**直接可看可改**(手动微调)。
- **前端工具**:`difficulty.ts`(`DEFAULT_HEADCOUNT_TABLE` 6 档 + `coefForCount`(count≤上限命中,null 兜底)+ `tierRangeLabel`/`tableSummary`/`newTableId`);CSV 自带 BOM(`String.fromCharCode(0xfeff)`,避 no-irregular-whitespace)+ 自写 `splitCsvLine`/`parseCsv`(无 papaparse 依赖);下载走 `shared/lib/download` 的 `downloadBlob`。
- **计算口径(P2)**:**本指标「得分」× 该单位系数,再排名/汇总**(不是乘原始度量)。如宣传积分:各单位先算得分 → × 系数 → 再排名。
- **加新口径** = `BASIS_LABELS` 加一项 + 默认表(如党员人数、营收规模)。

验证:双端门禁 0/0/0;API(临时表保存 200、`difficultyOn=true` / `difficultyCoefs{o1:1.8,o2:1}` / `settings.headcounts` 回读正确)+ 浏览器(选叶子→启用→弹窗列 35 个考核对象、启用测算表、某单位填员工数 180→测算得 1.8、手改 1.5、导出无报错、关闭后按钮「已设 1 个」、0 console error;未存盘,不动用户考核表)。

## P1.9 修订(2026-06-23)— 考核表三层角色 / 责任人多人(**配置+展示版,不 enforce**)
用户要三层维护角色。和用户确认范围后选「配置+展示」:数据结构 + 配置 UI 全做、记录展示,**暂不后端拦截编辑权**(沿用 platform_admin 直通;真 enforce —— 非授权改不了表/节点管理员只见子树/责任人填报过滤 —— 留多人真用时再做)。**全走 JSON,零迁移**。
- **① 总管理员 + 协同维护人**:`createdById` 即总管理员(新建即定,已有);scheme 新增 `settings.managerUserIds[]`(协同维护人,后端 settings 原样存 JSON,**后端零改**)。「考核表设置」顶部新增**维护人员**卡片(总管理员只读显名 + 协同维护人 `UserMultiPicker` 全员搜索多选)。
- **② 节点管理员**:`IndicatorNode.adminUserIds[]`(可多人,**任意层级**),随指标树 JSON 走,语义=可见并维护本节点及其下全部子指标。分支选中(原只有说明文字)+ 叶子均出 `NodeAdminField`;指标树行 `UserCog` 徽标标出已设管理员的节点。
- **③ 责任人改多人**:叶子 `ownerUserId`(单)→ `ownerUserIds[]`(从责任部门成员**勾选多人**);**不选=整个责任部门**;`indicator-tree.normalizeIndicatorTree` 兼容旧单值(`ownerUserId`→并入 `ownerUserIds`,统一只输出多值)。
- **展示名字**:`findOne` enrich `createdByName` + `userNames`(id→姓名,覆盖 总管理员/协同人/节点管理员/责任人;`collectNodeUserIds` 递归收 + 兼容旧 `ownerUserId`);`UserService.namesByIds(ids)` 批量解析(走 DI,不直查别人表)。`findOne` 拆纯查 `loadScheme`(update/remove/duplicate/createRound 内部用,enrich 只在对外 `findOne`)。
- **关键文件**:后端 `indicator-tree.ts`(normalize+`strIdArray`)· `user.service.ts`(`namesByIds`)· `assessment.service.ts`(`findOne` enrich + `loadScheme` + `collectNodeUserIds`);前端 `api.ts`(契约)· 新 `components/UserMultiPicker.tsx`(`UserMultiPicker`+`NodeAdminField`)· `LeafConfigPanel.tsx`(责任人多选 `MemberMultiPicker` + 节点管理员)· `pages/SchemeEditor.tsx`(维护人员卡片 + 分支节点管理员 + `nameMap`/`rememberNames`)· `IndicatorNodeRow.tsx`(徽标)。
- **加新「人员引用字段」范式**:存 id[];后端 enrich 进 `userNames` 供展示;搜索候选用 `UserMultiPicker`(全员)或部门成员勾选。
- 验证:门禁 后端 0/0/0、前端 0 error/0 warning;**API 端到端**(新建临时表→PATCH branch `adminUserIds`/leaf `ownerUserIds`/`settings.managerUserIds`→GET 三者持久化 + `createdByName`/`userNames` enrich + 旧 `ownerUserId`→`ownerUserIds` 迁移→DELETE 清理,全过)+ **浏览器**(维护人员卡片显总管理员+协同人搜「王」出 2 结果加 chip、叶子责任人多选、分支「指标管理员」+维护子树说明、0 console error;未保存真实考核表)。

## P2+ 后续

- **✅ P2.1 后端引擎(2026-06-14 已落地,API 实测)**:`AssessmentRound`(发起考核快照 indicators/targets/settings/gradeRules,与改表解耦)+ `IndicatorScore`(轮次×对象×叶子,rawValue JSON)两表 + migrate `add_assessment_round`。纯函数引擎 `round-engine.computeRoundResults`:取数→计分→**×难易系数**(crossTarget 系数乘排名值再排名,非 crossTarget 乘得分)→ 加权汇总(normal 累加 / bonus·deduction 块按上限封顶,total clamp≥0)→ 排名 → 名次划档定级(rank top/bottom/rest;触底档 P3;score 阈值)。6 接口 `POST schemes/:id/rounds`/`GET rounds`/`GET rounds/:id`/`POST rounds/:id/scores`(`assessment:score`)/`POST rounds/:id/compute`/`DELETE rounds/:id`。实测 3 单位场景算分/排名/定级/难易系数/块封顶全对。
- **✅ P2.2 前端(2026-06-14 已落地,浏览器实测)**:`RoundList`/`RoundDetail` 两页 + api 轮次方法;菜单「考核打分」+ `SchemeList` 卡片「发起考核」。`RoundDetail`=对象×指标矩阵录入(每格按计分工具 inputType:number/rate 数字、bool 是否、label 等次下拉)→ 保存 → 计算(先存后算)→ 结果表(名次/计权/加分/减分/合计/定级)。实测 5×35=175 格 → 计算 → 35 行结果含定级,0 console error。
- **✅ P2.3 录入页重做为「按指标」+ 统一分数符号(2026-06-14)**:用户校正——矩阵那套是「汇总排名」,核心应是**每项指标单独打分/积分/加权/排名**。① **统一符号**(弃用「积分/汇总得分」):实际值 → ● 得分(末端单项)→ Σ 小计(分组范围合计)→ ★ 总分(顶层);排名同符号+`#`:●# 单项 / Σ# 分组 / ★# 总。② `RoundDetail` 改**三栏**:左 指标列表(按分组)/ 中 选中指标逐单位「实际值 + 得分原因(选填)」/ 右 **该指标 ●# 单项排名实时刷新**;另留「汇总排名」tab。③ **无状态预览端点** `POST /scoring/preview`(`round-engine.scoreOneLeaf`/`previewIndicator`,前端不镜像公式)驱动右栏;`computeRoundResults` 重构调 `scoreOneLeaf`(行为不变,复测一致)。**剩**:步骤2 `FillInput` 注册表(逐数据源录入控件)· 步骤3 引擎补分组 Σ 小计 + 各节点排名 + 按责任人/部门可见性过滤 · 步骤4 汇总页加分组小计;再 ③ 业务数据源 ④ 自评佐证 ⑤ 桌面端。
- **✅ P2.4 人工打分双模式:加分制 / 扣分制 + 扣分明细(2026-06-16,API+浏览器实测)**:用户要数据源两种——满分定格有问题往下扣 / 0 分起评给谁打分谁加(原有);选「两个并列打分方式 + 多条明细累加」。做成**两个并列计分工具**同挂「部门填写」:`manual` 改名「人工打分(加分制)」+ 新增 `manual_deduct`「人工打分(扣分制)」(满分起评,● 得分=分值−总扣分,扣到 0)。新 `inputType:'deductions'`,`isInputCompatible('deductions','number')=true` → 与加分制在「部门填写(number)」下并列;**加新工具仍是注册表加一条**(后端 `SCORING_SPECS` + 前端 `scoring/registry`)。扣分明细 rawValue 存 `{items:[{issue,points}]}`,引擎 `sumDeductions` 归约(`RawMetric` 扩 `DeductRaw`,compute 容忍 number/明细对象);**后端 service/dto 零改**(`saveScores` 已 `JSON.stringify`、preview/compute 透传 unknown raw)。录入控件 = `RoundDetail` 的 `DeductionDialog` 弹窗(对象行「共扣 N 分·M 条」→ 弹窗逐条录「问题+扣分」+ 底部实时「共扣 X → ● 得分」),明细即原因、扣分制隐藏「得分原因」列、右栏 ●# 照常;**Step 2 `FillInput` 注册表雏形**(本期先为扣分制落一个)。实测:API preview(满分15 A扣5→10 / B扣8→7 / C不扣→15,排名 C#1/A#2/B#3)+ 浏览器(设计器两工具并列、弹窗录扣分实时算、右栏 公司机关党委95#34/塔运司80#35、0 console error,冒烟副本表已删)。
- **P2 业务数据源(③)**:经 `OrganizationService.getLinkedAdminOrgs` 把党委→行政单位,查 `TaskService.getStatsByOrg` 新增 / `CertificateIssueService.countByOrg` 新增 + recipientUserId→memberships 反查。`self_report` 单位自评+佐证(`IndicatorScore.evidenceFileIds` 已留列)。
- **P2 可见性模型(提前谋划,用户 2026-06-13 提)**:叶子已存 `ownerOrgId`(责任部门)+ `ownerUserId`(考核责任人)。填报闭环按此控权——**部门考核管理员**(`assessment:score` + 本部门)看本部门全部指标填报情况;**责任人**只看/填自己负责的指标。填报后期**集成到桌面客户端**(Tauri,复用 task 的 `useDesktopInboxAlerts` 轮询 + 原生通知范式)。
- **P3** 自评+佐证+核定;**P4** 支部/党员层 + `survey` 群众打分;**行政路线** `track='admin'` 开启(同引擎,主要配置);**P5** 历年对比/导出/看板。
- ⚠ 本期未做 `seedAssessmentScheme` 起步体系(避免整库 reseed 覆盖 externalApi 能力);用户在设计器直接建。

---

## P2 预备 · 业务/考核边界 + 方法论收敛(2026-06-18,含文献依据)

> 源于「扶贫报送结果 → 目标设定 → 完成情况统计 → 考核打分」的边界讨论 + 一次管理考核文献调研。

### A. 目标设定归属 —— 已拍板:放**业务(report)**,不放考核
决定性理由(按分量排序):
1. **DAG 红线(决定性)**:模块依赖单向 `assessment → report`,**report 绝不反向依赖 assessment**(madge 拦)。目标若存考核,业务侧「报送汇总/完成率」就得反读考核 → 破坏依赖方向、过不了门禁。目标放 report,业务直接读、考核经 `report.query` 单向读 —— **唯一不破 DAG 的位置**。
2. **目标是「下达指令」非「评判尺子」**:扶贫采购目标(总额/福利费/工会经费)是上级下达、单位照着干、平时看进度的 → 业务。
3. **单一事实源**:同一目标驱动「业务进度 + 完成率 + 考核打分」,放 report 一处三处都读。
4. **生命周期各属各**:目标随「报送任务下达」变(业务管理员/年度),考核表随「考核办设计」变;考核复制/改表不连累目标。

**可复用判据(收敛多套考核)**:目标值若「下达给被考核对象、要照着干、平时看进度」→ **业务**;若「只在考核时用、对象平时不接触的内部基准」→ **考核**。

**数据流(定死)**:`report 存每单位目标(随报送任务) → report 算客观完成度(完成率/是否达标/各费用来源额/是否买第一部分) → report.query 单向暴露 → assessment 选计分工具 → 合成 → 排名/分档`。
→ 据此**收窄 `ReportQuerySpec.target`**:不再承载业务目标,仅作「无业务下达目标的纯考核基准」兜底;扶贫不用它。

#### A.1 数据采集方式决定「完成数据」放哪(报送 vs 考核 `dept_fill`)—— 2026-06-19 补
同样是「目标 + 完成情况」,按**数据怎么来**判归属:
- **有明细要收集 + 汇总**(扶贫采购:逐条发票/商品 → 求和)→ **报送(report)**,actual 从明细聚合(`computeGoalProgress`),目标随报送任务下达(见 A)。
- **单值、部门直接录一个数**(利润完成额、某汇总数)→ **考核(assessment)的 `dept_fill`「部门填写」数据源**。**别为单值建退化报送任务**(重 + 与 dept_fill 重复)。其目标无业务/报送承载 → 纯考核基准,配在该考核指标(对齐 A 末「纯考核基准→考核」)。
- **其它模块算出**(任务完成率 / 证书荣誉)→ `business.*` 数据源。
- **收敛点**:「目标 + 完成 + 评价 + 排名」的**统一阵地是考核**;数据源按来源选(`report.query` / `dept_fill` / `business.*`),**报送只管「有明细的收集」**。单值结果若需审核/核定 + 佐证材料 → 用考核 P3「自评 + 佐证 + 核定」,现可先 `dept_fill` 录入。

### B. 计分工具收敛 + 标准化/排名选型(研究依据见文末)
- **核心发现**:① 标准化方法的选择实质改变结果(秩次抗异常但丢绝对差距 / min-max 直观 / z-score 常用但极端值主导);② 加权和=**完全可补偿**(瘸腿项可被高分项补上)、几何平均=部分不可补偿;③ **加权和里的权重数学上=指标间替代率,不等于「重要性」**(想表达重要性需非补偿性方法)→ 我们的「分值」按「换算汇率」理解;④ **纯序数排名/固定步长赋分丢距离、对权重与噪声极敏感、制造名次博弈**,是最不被推荐的一档;⑤ 强制分布(钟形/末位)证据最差(假设正态常不成立、过半评分方差来自打分者偏见)。
- **11 工具 → 收敛 6 核心**(覆盖绝大多数考核):`proportional`(完成率)· **`minmax`(极差标准化,提为「排名前置」默认)** · `binary`(是否达标)· `threshold_tiers`(阶梯/if-then 可解释)· `rank_tiers`(必须排名时用分档吸噪,优于线性)· `manual`/`manual_deduct`(人工/审查)。**弱化**:`rank_linear`(等步长名次→锯齿,最不推荐)、`overachieve_tiers`、`bonus`/`deduction`(可后续并)。
- **定级 rank 模式(前15%/后15%)= 一种强制分布** → 给触底档加**绝对底线**(后15%但绝对达标的不判「较差」),避免硬造差单位。

### C. 扶贫 2 分(大考核里的 2 分项 · 子项内部排名)落地口径
1. 三子目标合成**扶贫复合分**:`proportional`(总额完成率)+ `binary`(福利费达标→0.4)+ `binary`(工会达标→0.4)+ `binary`(买了第一部分→0.2);**「定点/对口」= `category='第一部分'`**。
2. 复合分 → 2 分:**首选 `minmax`**(最高 2、其余按真实分差缩放、可设保底 floor),**不用「每降 1 名 -0.05」固定步长**(研究里最弱);要档次感用 `rank_tiers`(前 N 名 2 分 / 中段 / 末段)。
3. 两工具引擎都已有 → **近零新增**,只差把「子项内部按复合分排名」接上(叶子级 crossTarget 排名已支持)。
4. ⚠ 加权和=可补偿:福利费/工会用 `binary`(达标才给 0.4)= 半非补偿,符合「这两项要单独达标、不被总额补」的意图;要更硬可设为前置门槛(gate)。

### D. 画像/报告口径
引擎每对象已存 `leafScores` → 画像 = **各维度得分雷达图 + 同侪分位 + 贡献度分解(每项占总分多少)**;`threshold_tiers`/`grade_map` 本身是可解释规则。**标注名次不确定性**(相邻名次多为噪声,别过度解读;研究建议发布不确定区间 + 敏感性分析)。

### 文献来源
- OECD/JRC《Handbook on Constructing Composite Indicators》(EUR 21682):标准化/权重/聚合可补偿性。
- 美国国家科学院 read/27317:标准化选项 + 补偿性 + 赋权途径。
- 约克大学 CHE tp29:权重→名次大幅漂移、不确定区间重叠、序数丢距离、分档丢方差。
- EU knowledge4policy 工具箱·第7步:加权和权重=替代率非重要性 + 偏好独立前提。
- arXiv 2506.13259:综合分须可解释 + if-then 规则替代;arXiv 2512.06583(很新预印本,数字仅参考):强制排名误判率高。
- ⚠ 该研究的自动三票验证因 API 限流未跑成(claim 抓取完整、来源权威,已人工把关);很新的预印本数字仅参考。
