# 知识分享平台(knowledge)+ 通用积分系统(points)

> 2026-07-05 用户确认需求;P1 同日落地。本文是跨期设计基准,后续期在文末追加「Px 修订」。

## 一句话定位

把用户原来的 docsify + md 知识站(条例/制度/经验;视频、模板下载、图文步骤)升级为**平台内的现代知识分享系统**:存量 MD 导入、AI 辅助归档条例、AI 导读/FAQ/标签、互动(点赞/收藏/评论/吐槽)、浏览量+时长、多用户发布带审核、制度版本管理、积分+称号、首页搜索直达。

## 用户拍板的决定(锁定)

| # | 决定 |
|---|---|
| 1 | **联网检索 = 半自动兜底 + 联网可选**:默认贴 URL(后端抓正文)/贴全文,AI 只做清洗归档;配了联网搜索模型(千问 enable_search)才显示「一键联网检索」 |
| 2 | **积分一次设计到位、分期实现**:通用 points 模块(事件注册表→规则覆盖→账本→称号→排行),知识平台先埋事件,引擎在 P5 |
| 3 | **前台 = 独立知识门户 /knowledge + NavPage 首页搜索接入**(P2) |
| 4 | **审核按内容类型可配**(条例/制度需审、经验/操作指南直发);**吐槽 = 独立反馈通道**(可匿名,仅作者+管理员可见并回复,与评论分开) |
| 5 | **制度版本管理**:发布修订版确认后旧版归档(不进列表/搜索、可直接访问),新版详情页「历史版本」可查 |
| 6 | **标签**:AI 生成(人工确认)+ 手动增删,搜索/筛选用 |
| 7 | **三个正交维度**:领域分类(党建/设备/安全,两级,门户导航)× 内容类型(审核开关挂这里)× 标签 |

## 关键设计裁决(为什么这么做)

- **内容类型独立小表 `KnowledgeType`**(不并进分类、不做 article 字段枚举):审核开关要「一处可配、语义清晰」,和领域分类正交。
- **版本链 = `versionGroupId`(首版=自身 id)+ `versionLabel`,链序按 publishedAt**,不加 supersededById —— 最少字段;发布事务内 `updateMany` 把同组其他 published → archived。
- **标签存 `tagsJson`(JSON string[])不建 Tag 表**:照「站点设置单行 JSON」轻量偏好;搜索 ILIKE tagsJson,标签云内存聚合(几百篇量级)。
- **contentMd 直存 PG text**:ILIKE 全文搜索 + AI 处理都在库内;正文图片/附件走 storage 只留引用。
- **积分事件 = 代码注册表(照 ai-consumers)+ PointRule DB 覆盖(照 AiPrompt)**;账本不可变,取消点赞写负向冲账,去重按 (userId,eventKey,subjectId) 净分;**award 永不 throw**(积分是旁路)。
- **公开口只有两个**(「登录可见」的受控豁免):`GET /public/knowledge/files/:id`(`<img>` 带不了 auth 头;仅放行 ownerModule=knowledge,cuid 不可枚举)+ P3 的 `POST /public/knowledge/view-beacon`(sendBeacon 同样带不了 auth 头)。
- **审计例外**:reaction toggle 与 view/beacon **不打审计**(高频,业务表自身留痕);其余写操作全打。
- **前端 markdown 仅 4 个同族依赖**:react-markdown + remark-gfm + rehype-raw(存量 md 内嵌 `<video>`/`<img>`)+ **rehype-sanitize(XSS 唯一闸门**,白名单只加 video/source);代码高亮不加、视频原生 `<video>`、编辑器 = textarea 分栏预览 + 粘贴图片直传(富文本属 task P4,不搅合)。
- **URL 抓取零新依赖**(P4):自写标签剥离 + `TextDecoder('gbk')`,SSRF 拒私网段(env `KNOWLEDGE_FETCH_ALLOW_PRIVATE=1` 放开);正文最终过 LLM clean,剥离只求"够干净"。
- **LLM 调用抽 `LlmClientService` 进 external-api**(P4,泛化 task 的 callLlm 加 extraBody);既有 task/assessment/report 三处复制不动。
- **联网标记 = `ExternalApi.webSearch` 列**(联网是模型能力不是功能需求);qwen → `extraBody:{enable_search:true}`。⚠ 加列时 seed upsert update 块必须同步(2026-06-11 capabilities 被 reseed 冲掉教训)。

## 数据模型(9 + 5 表,全松引用跨模块)

**knowledge(P1 一次建齐)**:`KnowledgeCategory`(两级树;深度/同级重名 service 校验 —— PG UNIQUE 对 NULL 父不生效)/ `KnowledgeType`(code 主键 + requireReview)/ `KnowledgeArticle`(status: draft|pending|published|rejected|archived;source: manual|import|ai_archive;冗余计数列原子 increment;summary=导读、faqJson、tagsJson、versionGroupId/versionLabel、coverFileId)/ `KnowledgeAttachment` / `KnowledgeComment`(单层+replyToId,纯文本渲染)/ `KnowledgeReaction`(like|favorite,@@unique[userId,articleId,type])/ `KnowledgeFeedback` + `KnowledgeFeedbackReply`(匿名只影响展示,userId 始终存)/ `KnowledgeViewLog`(durationSec beacon 回填取 max 封顶 4h;articleId 松引用删文留日志)。

**points(P5 迁移)**:`PointRule`(eventKey 主键,覆盖注册表默认)/ `PointLedger`(不可变账本)/ `UserPointAccount`(汇总缓存)/ `PointTitle`(threshold 空=仅手动)/ `UserPointTitle`。

**P5 埋点事件**:article.publish 作者+10(once,日限3)/ liked·favorited 作者+2(subjectId=`${articleId}:${likerId}` 净分)/ comment.create +1(日限5)/ article.view +1(per-day-subject,日限10)/ feedback.reply +1(日限5)/ manual.adjust。

## 状态机与版本流程

`draft →(submit)→ pending|published`(按 type.requireReview 分流;**管理员本人提交免审**)→ `review` 通过/驳回(驳回必填原因)→ `published →(unpublish)→ draft`。发布(直发或过审)事务内归档同版本组旧 published。编辑器/AI 归档向导可「关联为某文章的修订版」(旧文无组则回填 `versionGroupId=旧文 id`);前端提交确认弹窗提示「旧版将归档」。

## 权限 / 审计 / GC

- `knowledge:manage`(分类/类型/审核/导入/反馈/删任意)→ enterprise_admin、party_secretary;`knowledge:publish`(人人可发)→ member、dept_manager 及以上;`points:manage`(P5)→ enterprise_admin。互动仅登录态。
- 审计 action:`knowledge.category|type.*`、`knowledge.article.create/update/delete/submit/publish/reject/unpublish/import`、`knowledge.ai.*`、`knowledge.comment.create/delete`、`knowledge.feedback.*`、`points.*`。
- GC:`KnowledgeService.collectInUseFileIds()` = 附件 + 封面 + 正则扫 contentMd 的 `/public/knowledge/files/(id)`,已聚合进 `MaintenanceService`;**新增引用 storage 的字段必须同步此方法**。删文章联动软删 storage 文件。
- markdown 里图片存**相对路径** `/api/public/knowledge/files/<id>`,渲染时拼 `apiOrigin`(治局域网 IP 变动,同头像策略)。

## 分期(P3/P4 可对调)

- **P1(✅ 2026-07-05)地基**:9 表 + 模块 + 门户/阅读/我的/编辑器 + 后台分类/审核管理 + 版本链 + 标签 + 浏览计数(30min 去重)。
- **P2 存量迁移 + 首页**:storage 放行 md/zip;zip 导入两步式(analyze 预览:_sidebar.md/目录 → 分类映射、dup 标 skip;execute:相对图片引用上传改写、模板成附件、首图=封面、每篇独立事务);NavPage 搜索跳 /knowledge?q= + 知识园地卡片(usePortalKnowledgeBoard)。
- **P3 互动统计**:评论/点赞/收藏/吐槽 + useViewTracking(visibilitychange 累计可见时长 + sendBeacon)+ 后台点亮 数据统计 3 个占位(/admin/stats/views、/admin/stats/likes、/admin/feedback)。
- **P4 AI**:提示词 `knowledge.clean`(→{title,contentMd,categoryHint})/`knowledge.guide`(→{summary,tags[]})/`knowledge.faq`;消费点 `knowledge.{clean,guide,faq,search}.text`;LlmClientService;fetch-url 正文提取;归档向导(检索按钮按 capabilities 显隐/贴URL/贴全文 → 清洗 → 预览 → 可关联修订版)。
- **P5 积分称号**:points 模块全套 + knowledge 埋点接线 + 我的积分/排行/后台三 tab(规则/称号/账户调分)+ 阈值自动授称号 + @Cron 兜底补授。

## P1 落地记录(2026-07-05)

- 迁移 `20260706004825_add_knowledge_module`(9 表);seed:权限 2 + 角色授权 + 类型 4(条例√审/制度√审/经验分享/操作指南,**update 块不动 requireReview** 防 reseed 冲掉 UI 配置)+ 示例分类 党建/设备/安全/综合(固定 id upsert)。dev 库用专项脚本补种,未整库 reseed(项目既有约定)。
- 后端 `backend/src/knowledge/`:service(分类/类型/文章/状态机/版本/浏览/附件/GC)+ controller + public-controller + 7 dto;app.module 注册;maintenance 聚合。
- 前端 `react/src/features/knowledge/`:api + MarkdownView(sanitize 白名单+锚点)/markdownToc/MdEditor(分栏+粘贴直传)/ArticleCard/CategoryPicker/TagsInput/VersionLinkPicker + Portal/Article(TOC/导读/FAQ/附件/历史版本/archived 横幅)/Mine/Editor + admin Categories(分类+类型两 tab)/Manage(待审核+全部);App.tsx 前台 5 路由 + admin 2 路由;AdminLayout「知识管理」组。
- 新依赖:react-markdown / remark-gfm / rehype-raw / rehype-sanitize。
- 门禁:backend 0 error/0 warning/0 cycle;react 0 error/0 warning。

### P1 多镜头对抗审查 + 修复(2026-07-05)

4 镜头(后端正确性/安全/前端正确性/项目约定)并行审查 + 每条发现独立对抗验证,确认 18 条真缺陷并全部修复:
- **[高·安全] sourceUrl 存储型 XSS**:`原文` 链接 `<a href={sourceUrl}>` 不走 markdown sanitize,`javascript:` 可执行 → DTO 加 `@Matches(/^https?:\/\//)` + 前端 `safeHttpUrl` 兜底。
- **[安全] contentMd 无长度上限** → DTO `@MaxLength(400_000)`。
- **[后端] assertAuthorOrManage 把「作者兼管理员」误判为无管理权** → 重构为「有 manage 权返回 true(与是否作者正交)」,修复管理员改/删/置顶自己已发布文章被拦。
- **[后端] removeArticle/removeAttachment 联动删共用文件**(复制正文发修订版、共用封面)→ 删前 `fileStillInUse` 交叉校验,仍被引用不删字节;两方法补审计。
- **[后端] recordView 先查后写竞态 / publishTx 并发审核产生两篇 published** → 各自事务内 `FOR UPDATE` 行锁串行化。
- **[后端] seed KnowledgeType update 块冲掉用户改的 name/sortOrder** → 改 `update: {}`。
- **[前端] 编辑器保存后 navigate 重挂载丢输入 / 缓存陈旧覆盖 / 半程失败重复建文** → EditorInner 用内部 `articleId` state,create 后 `setArticleId + history.replaceState`(不 navigate、不重挂载),persist() 幂等。
- **[前端] MdEditor 多图上传 stale closure 只留最后一张** → `valueRef` 取最新值 + append。
- **[前端] TagsInput IME 组合期回车提交裸拼音 / 粘贴逗号 stale closure** → `isComposing` 守卫 + 当场用原始串 addTag。
- **[前端] TOC 重复标题锚点冲突 + 链接标题两端 id 不一致** → `makeDeduper`(渲染端/提取端同序去重)+ `plainHeadingText` 剥行内语法。
- **[前端] 后台「全部文章」缺「全部状态」选项**(死代码 status==='any')→ 加选项 + 后端 manage `status=any` 不加过滤。
- 否决 1 条(attachmentDownloaded 无鉴权刷计数:边际泄露为零)。
- 修复后:双端门禁复绿;API 冒烟(原 10/10 + 修复项 6/6:javascript: 400 / 超长 400 / 管理员改删自己发布件 / status=any 含归档 / 共用文件不误删);浏览器验(TagsInput IME 守卫、TOC 去重 4 锚点全命中无重复)。

## 后续路线:主流知识网站功能增强(P6 候选,2026-07-05 与用户对齐)

对照语雀/飞书知识库、知乎/SO 问答、CSDN/掘金、Zendesk 帮助中心、学习强国督学,筛出**契合企业内网 KM、且能复用已有基建**的增强项(按价值/成本排序),不动 P1–P5 主线,P2 存量导入后按实际体感定序:

1. **必读任务(制度宣贯督学)**:管理员指派某制度给范围人员(复用 TargetPicker/组织树)→ 跟踪已读/未读 + 阅读时长达标(ViewLog 已有)→ 未读进「我的待办」(复用 task inbox 轮询+桌面通知)。党建场景刚需,浏览时长数据最佳变现。
2. **搜索运营闭环**:记搜索词 → 门户「热门搜索」;无结果一键「求这方面知识」→ 管理端看缺什么反哺内容。一张日志表 + 一个统计页。
3. **修订对比(diff)**:历史版本页「与当前版对比」,markdown 文本 diff 高亮增删。衔接已有版本链。
4. **相关推荐**:文章底部「相关知识」= 同分类/同标签规则匹配。几十行,顺阅读动线。
5. **AI 知识问答(RAG)**:首页搜索升级为「直接问」——ILIKE 召回候选片段 → LLM 带原文引用作答。P4 AI 链路后顺手一步;内网量级不需向量库(不够再上 pgvector)。
6. **求知识/悬赏问答**:发「我想要 XX 经验/模板」→ 他人认领发布 → 双方得积分,让积分产生供需循环。
7. **合集/学习路径**:散文章串成「新任支部书记必读」有序集合 + 学习进度。培训场景强。
8. **关注订阅**:关注分类/标签,新发布进待办(复用 inbox);内容频率低时价值有限。
9. **有效期管理**:制度带生效/废止日期,到期 @Cron 提醒复核。

**明确不做(与定位冲突)**:协同富文本/段落级评论、推荐算法信息流、外部公开分享、Wiki 双链/知识图谱 —— 工程量远超内网数百用户场景的收益,标签已承担轻量关联。
