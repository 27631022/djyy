# doc-format · 公文排版

上传 `.doc/.docx/.md` → 按规则重排版 → 下载 `.docx`。后台可配多套排版模板。
门户页带收藏 / 转换问题反馈(可带失败样本) / 浏览量 / 转换量统计。

## 全篇加粗(boldAll,默认开)

用户 2026-07-17「所有字体符号等都要加黑」。`config.boldAll` 默认 true,可在模板里关。
⚠ 公文规范里正文一般不加粗 —— 这是用户明确要求,不是国标。三处必须一起吃它,漏一处就预览/产物分叉:
renderer 的正文 run + **页码三个 run** + GridPreview 的正文行 fontWeight + **页码 div 的 fontWeight**
(对抗审查抓到过页码预览漏掉这一处)。与元素自带 bold 取或。

## 反馈「不用再传一遍文件」

工作台里发现转得不对,点反馈自动带上正在转的原件(analyze 存的 source 文件),不用重传。
- analyze 存 source 时补 `createdById: ctx.actorId`(原来没存)。
- `assertOwnFeedbackFiles(ids, userId)` 放行两类:folder=feedback 的(本次新传)、folder=source 且
  createdById=本人的(刚转的原件)。**凭 createdById 挡别人的 source fileId**(cuid 虽不可枚举仍要挡)。
- 反馈引用的 source 文件 id 落在 feedback.fileIds 里 → 天然进 collectInUseFileIds 被保护,不必改 GC。

## 三条输入管线,判据方向不同

| 输入 | 本质 | 层级判据 | 正文 |
|---|---|---|---|
| `.doc` | 重排已定稿的公文 | 正文里的序号(`一、`/`（一）`) | 一字不改(直引号→弯引号除外) |
| `.docx` | 同上 | 同上(jszip+saxes 直读 OOXML) | 同上 |
| `.md` | **把草稿转成公文** | **`#` 的层级**(正文里没有序号可认) | 会补序号(`## 总体要求`→`一、总体要求`) |

`.md` 与另两条**判据方向相反**:md 的层级写在 `#` 里,所以 `mdHeading` 是权威判据而不是提示;
而 .doc/.docx 恰恰相反(源里的字体/加粗不可信,只信正文正则)。见 `parse/md-parser.ts` 头注释。

### md 解析:走 marked 的 token 树,不用正则剥标记

正文里残留一个 `*` 或 `&quot;` 就是公文错字。`marked` 的 lexer 给的 token 树能精确抽纯文本,
字段选择是实测定的(`md-parser.ts` 有表):`text`→**raw**(text 被 HTML 转义过)、`escape`→**text**、
`html`→**丢弃**。别图省事用正则。多镜头对抗审查抓到的坑,都在 `_v.ts` 式回归里守着:

- **codespan 必须从 `raw` 去反引号,不能用 `text`** —— `` `a < b` `` 的 text 是 `a &lt; b`,
  那些 `&lt;/&amp;/&quot;` 会原样进公文正文。
- **嵌套列表**:`item.tokens` 里夹着子 `list` token,`plain()` 会把它当行内文本揉进来(父项和
  子项标记黏成一段)。要在 item 里把块级子节点(list/blockquote)分出来各自成段。
- **块级 HTML**(`<!-- 批注 -->`、`<div>`、`<table>`)整块丢弃 —— 和行内 html 一致。原先
  `blockToParas` 没有 html 分支,它落到 default 被 `push` 进正文(作者的私人批注变成可见正文)。
- **段内软换行 `\n`** 折成空格(`push` 里统一折叠段内空白)—— 裸 `\n` 留到网格里会被当整格字符。
- **md 不能套用 .doc 的「版头残片 / 版记 / 发文字号」规则** —— 那些是从二进制文档提取时的产物,
  md 里不存在。不隔离的话 md 的短正文(列表项「甲」)会被当成红头残片 skip 掉。`classifyOne(p, text, fromMd)`。

### 会改动正文字符的两条规则(默认开,可关,改动在确认页可见)

本模块默认「一字不改」,所以这两条单拎进 `config.textRules` / `config.markdown`,模板里可关:
- `curlyQuotes`:直引号 `"` → 弯引号 `“”`(段内成对切换)。公文规范用弯引号,源里的直引号本来就是错的。
- `markdown.autoNumber`:md 无序号的标题自动补层次序号。这是本模块**唯一凭空生成文字**的地方。
  空格照真实公文:`一、`/`（一）`/`（1）` 不加空格,只有 `1. ` 点号后跟一个空格。

```
上传 → 解析(parse/) → 结构识别(recognize.ts) → 【人工确认】→ 排版(render/) → 下载
                                                    ↑
                                        网格模型(grid.ts) 给孤字告警 + 预览
```

## 分工:我们只写 XML,排版交给 Word/WPS

服务端**不装字体、不渲染、不导 PDF**,只把字体「名字」这个字符串写进 OOXML。
`w:widowControl` 打开 + 标题段 `w:keepNext` → 孤行/寡行/标题孤立由 Word/WPS 自己避;
我们只算它不会自动修的那一类(孤字)。

### ⚠ 版权红线

`方正小标宋简体/黑体简体/楷体简体/仿宋简体` 是**北大方正商业字库**(用户机器上这套来自 WPS 捆绑
授权,`C:\ProgramData\Kingsoft\office6\muifont\`)。方正在国内以字体维权诉讼著称。

- **绝不可**把这些 `.ttf` 拷进服务器 / Docker 镜像 / 随产物分发。
- 具体到代码:**不要给 docx 的 `Document({ fonts })` 传值** —— 它的 `FontOptions` 是
  `{ name, data: Buffer }`,即**嵌入字体文件**。备选字体走 `patchFontTable()` 后处理写
  `w:altName`(只有名字,没有字节)。
- 推论:服务端做 PDF 导出 / 精确分页度量这条路是被版权堵死的,别再提案。

## 实证结论(改代码前必读)

这些不是查来的,是拿用户真实公文 + WPS 的 `Word.Application` COM 实测出来的。

### 1. `w:charSpace` 的单位是 1/4096 磅,不是 twips;取整用 floor

「每行 26 字」全靠它。用 COM 把 `PageSetup.CharsLine` 依次设成 24/26/27/28 让 Word 自己写
docGrid,得 `charSpace = 9941 / 4135 / 1554 / -842`,与 `(版心宽/N − 基准字号)` 回归,
比值恒为 **204.8 = 4096/20**;floor 4/4 命中(round 在 27/28 处差 1)。

```
charSpace = floor((版心宽_twips / 每行字数 − 基准字号_twips) / 20 × 4096)
```

- 版心宽必须用**写进 pgMar 的那个整数 twips**算(Word 是从文件里的整数反推的)。
- 基准字号 = 「已解析的默认段落字号」,所以必须用 `docDefaults` 钉死,否则会掉到引擎内置的
  `sz=20`,每行字数整个算错。
- ⚠ 曾按「charSpace = 字距的 twips 数」算得 20,Word 实测排成**每行 27 字**。差一个字,
  肉眼极难发现。**改这里必须用 COM 复核 `PageSetup.CharsLine`,不要相信算术自洽。**

### 2. 用户给的参数 5/6 就是国标,唯一偏离是「每行 26 字」

拿 `两优一先.pdf` 逐字测量:版心左边界 79.37pt(=2.8cm)、行基线间距 28.0pt、每页 22 行、
正文 15.95pt(三号)、标题 22pt(二号)、页码 14pt 奇右偶左 —— 与 GB/T 9704-2012 逐项吻合。
「26 字」是本单位惯例不是笔误:实测字符步进 **17.01pt = 442.2 ÷ 26**,精确到小数点后两位。
(国标是 28 字。两套都做成了内置模板。)

每页行数不是参数,是 `floor(版心高 / 行距)` 算出来的:637.8 / 28 = 22,与国标一致。

### 3. 「标题首行缩进 2 字符」的真实含义

真实公文里大标题 `jc=center` 且**完全没有** `w:ind`,而正文与各级层次标题**都是**
`firstLineChars="200"`。故读作「正文及各级层次标题缩进 2 字,公文大标题居中不缩进」。

`firstLineChars` 是权威值,`firstLine` 是缓存值:有字符网格时它 = 缩进字数 × **字符跨度**,
不是 × 字号(26 字网格下 2 字缩进 = 680 twips 而非 640)。

### 4. 「第X条」必须 run 级切分 —— 本模块最大的坑

实测那份办法的 19 个条:8 个是**行内正文**(「第一条」后面直接跟 202 字)、7 个是独立短标题、
4 个是「小标题。正文」。**整段套黑体会把 202 字正文全加粗。**

规则 19/19 命中:序号「第X条」恒黑体;序号后含「。」→ 仿宋,不含 → 黑体。见 `articleRule`。

### 5. 不需要文种检测

一张全局的「序号字形 → 元素类型」表跨 请示 / 办法(条例体) / 表彰决定 三种文种 8/8 命中。
层次序数是 GB/T 9704-2012 §7.3.3 的固定序列,与文种无关。

### 6. 源文档的字体/加粗不可信,一律以正文正则为判据

OA 产出的 `.doc` 全篇 100% 粗体(WPS 伪影、零信息);请示稿里 9 个「(N)」用楷体而第 10 个
「(四)」错用仿宋。按源字体分级会把源文件的错误继承甚至放大 —— 而修掉这些错正是本功能的价值。

### 6.5 `<w:delText>`(修订模式删掉的字)绝不能当正文

公文常带修订痕迹。`<w:del><w:r><w:delText>被删的字</w:delText></w:r></w:del>` 里的是**已经删掉的
内容**,当正文读进来会让它**复活到成品公文里** —— 对法规/制度类文件是法律风险。
解析器用 `inDel` 标志剔除(同理 `inField` 剔除 `<w:instrText>` 里的 `PAGE` 这类域指令)。

### 7. 解析器的两个坑

- **`mammoth` 对公文结构性不可用**:公文 100% 直接排版,实测 `<w:pStyle>` = **0 个**,而
  `<w:jc>` 36 个、`<w:sz>` 199 个。mammoth 只认命名样式,输出全裸 `<p>`,**且不报任何警告**。
  → `.docx` 用 `jszip + saxes` 自己遍历 `<w:p>`。
- **`word-extractor` 默认会静默毁数据**:`filterUnicode` 默认 `true`,把中文引号 `“”` 换成
  ASCII `"`、破折号 `—`(U+2014) 换成 `-` —— 页码规则「— 1 —」会被毁成「- 1 -」。
  → 全局强制 `{filterUnicode:false}`,只在 `parse/doc-parser.ts` 一处调用它。

### 7.5 避头尾字符表照抄 Word 自己的,不是照抄国标

断行是渲染端做的,模型要预测它,就得镜像**它的**表。来源可复现(zh-CN / 标准级):

```powershell
$doc = (New-Object -ComObject Word.Application).Documents.Add()
$doc.NoLineBreakBefore   # 行首禁则 45 字符
$doc.NoLineBreakAfter    # 行尾禁则 19 字符
```

原先按印象手写的表两个方向都错:多了 `—`(U+2014,Word 用的是 `―`U+2015)和 `%‰℃`,
漏了 `¨ˇˉ‖∶〃々〗＂＇．｀｜￠` 与全角 `！），．：；？］～`,而且**行尾禁则整块没实现**。

改用真表后,拿真实公文的一段与 Word 逐行对照(用 `Range.Information(10)` 问每个字符在第几行):
**4/4 行完全一致**,并且修掉了一处假阳性孤字 —— `“` 不能收尾要带到下一行,旧模型没这条,
末行算成「杆。」(2 格)误报,Word 实际是「标杆。」(3 格),不孤。

⚠ 这是「标准」级。用户把 Word 改成「严格」级则表更大 —— 我们不写 settings.xml 的 kinsoku 设置,
跟随用户本机默认(简体中文出厂即标准级)。这也是孤字只能报「疑似」的原因之一。

### 8. 孤字只能报「疑似」

网格模型断行准确率实测 90%(30 个决策错 3 个),**漏报过样本里唯一一处真孤字**。Word 真实断行
涉及标点压缩与中西文自动间距,是亚磅级临界判定 —— 这是原理性上限,不是调参能消除的。
实测教训:试过加点值模型 + 中西文自动间距想做「更精确」,准确率反而掉到 76.7%。
**朴素模型(汉字 1 格 / 半角 0.5 格 / 行首禁则悬挂)已是扫描最优,别再「优化」。**

→ 结论只能是「疑似」,**绝不能对用户说「已检测,无孤字」**。阈值默认放宽到 2 格提高召回。

## 为什么不用大模型

用户 2026-07-17 定案「不用 AI,纯规则 + 人工确认」。

- **不需要** —— 见实证 5,纯正则跨三种文种 8/8 命中。
- **有风险** —— 让大模型过一遍正文,它就有机会改标点、吞字、「优化」措辞。公文一字不能错。

质量闸门是**人工确认页**:规则拿不准的段落标 `confidence='low'`,人来改。
正文文本永远由服务端从原件重新解析,客户端只能改类型、改不了字(见 `RenderDto.overrides`)。

## 产品边界

**只排正文**(用户定案)。版头(红头/发文机关标志)与版记(抄送/印发)不在范围 ——
红头在源文件里是图片/文本框,纯文本提取只能抠出一个「件」字,留着也是垃圾;它们归 `skip`。
实测样本里的表格全是版头/版记的排版家具,「表彰名单」是普通段落不是表格。

## 互动(收藏 / 反馈 / 浏览量 / 转换量)

自建三张表(`DocFormatFavorite` / `DocFormatViewLog` / `DocFormatFeedback`+`Reply`),照
knowledge/showcase 的**范式**但表是自己的(复用别人的表破 conventions 约束 #1,走对方 Service
又语义荒谬 —— 它们每个方法第一步都是 requireVisibleArticle,而这里没有「内容实例」)。

**与那两家的根本不同:这是单例工具页,不是内容实例。** 所以两处不能照抄:
- **浏览量去重不用 `FOR UPDATE` 行锁** —— 它们锁「被浏览的那条内容」,这里只能锁一行统计行,
  那就成了全站访问都排队的热点锁。改用 `(userId, 30分钟窗口)` 唯一约束 + upsert,无锁幂等。
- **收藏不套多态 Reaction** —— targetId 恒定会让 `@@unique` 退化。照 `DirectoryFavorite` 的窄表
  (`@id userId` 一行到底)。

**转换量不建计数表**:`doc-format.render` 成功本来就打审计,`AuditService.countByAction('doc-format.render')`
一句就有,而且功能上线即有真实历史数据、不用从 0 爬。⚠ 别绕过它直查 AuditLog(conventions 的
「AuditLog 例外」只豁免 auth.controller 直**写**)。

**反馈可带失败样本**(全站首个带附件的反馈):`fileIds` JSON string[](照 `TaskSubmission.fileIds`)。
用户先经 storage 传好拿 fileId 再随 JSON 提交(dialog 不改 multipart)。附件必须在本模块 feedback
文件夹下(`assertOwnFeedbackFiles`),否则任意 fileId 都能被引用进反馈、既拿别人的文件又永不回收。

## 孤儿 GC:排版件不注册,反馈样本要注册

- **排版的原件/产物故意不注册** —— 一次性加工(上传→下载→结束),没有业务表引用,30 天后被清掉
  正是要的。⚠ 以后若加「我的排版历史」这类长期留存功能,必须回来补注册。
- **反馈里的失败样本必须注册**(`DocFormatInteractionService.collectInUseFileIds`)—— 它是长期留存的
  引用(用来复现问题),不注册就会 30 天后被 purge 掉。已接进 `MaintenanceService`。
  ⚠ 别把排版件也塞进 collectInUseFileIds,那会让它们永不回收。

## 加东西怎么加

| 要加 | 改哪儿 |
|---|---|
| 一种元素类型 | `types.ts` 的 `ElementType` + `ELEMENT_TYPE_LABEL` → `presets.ts` 的 `elements()` 给默认样式 → `recognize.ts` 加识别规则 → 前端 `api.ts` 联合类型补一项 |
| 一套内置模板 | `presets.ts` 的 `BUILTIN_PRESETS` 加一条(启动时 `ensureBuiltins` 自动种,不必 reseed) |
| 一个模板参数 | `types.ts` 的 `DocFormatConfig` → `config.ts` 的 `normalizeConfig` 加白名单重建 → `presets.ts` 给默认值 → 前端模板编辑器加控件 |

## docx 库的坑(都已绕开,别改回去)

1. `LineRuleType` 有 `EXACTLY:"exactly"` 和 `EXACT:"exact"` 两个常量,只有后者是 spec 合法值。
2. 页边距必须传 **twips 整数**;传 `"3.7cm"` 这种字符串会被库原样透传进 XML。
3. `updateFields` 必须写在 `features:{}` 里,写顶层会被**静默忽略**(库对写错的选项名不报错)。
4. 因为 3,构造 `Document` 选项一律用**字面量直接写**,不要先攒进变量再展开 ——
   TS 的多余属性检查只在对象字面量被直接定型时才触发,一 spread 就静默失效。
5. `ImportedXmlComponent.fromXmlString()` 有 bug(把内容包进 `<undefined>` 标签)。
   本模块用不到逃生舱:段落级 `kinsoku/wordWrap/overflowPunct/adjustRightInd/snapToGrid`
   规范默认就是开,真实公文里写出来只是 WPS 把整个 pPr 全量 dump 了。
6. tsc 和 eslint **都不校验正则字面量的转义合法性** —— 本模块踩过一次(`/[...\"&]/gu` 在 `u`
   标志下是非法转义,两道门禁全绿、一跑就崩)。改正则后要真跑。
7. 它产出的 `word/fontTable.xml` 是个**自闭合空标签** `<w:fonts .../>`。想往里注入 `w:font`
   声明时,`/(<w:fonts\b[^>]*>)/` 会把末尾的 `/` 一起吃进去、当成开标签匹配 —— 结果 decls 被
   追加到自闭合标签**之后**,产出 5 个根元素的非法 XML(踩过)。必须先认自闭合形态再撑开。
   替换串一律用**函数形式**:字符串形式会展开 `$&`/`$1`,而字体名来自用户配置。

## 几条不变量(破了就出事,改动后要复验)

| 不变量 | 破了会怎样 | 谁保证 |
|---|---|---|
| `normalize(preset)` 语义等于 `preset`(不动点) | 「恢复默认」拿到的与代码里写的对不上、存进 DB 再读出来漂移。已知破法:preset 里写「显式的零」(如 `spaceBeforeLines: 0`),会被 `\|\| undefined` 收敛掉 | `config.ts` + presets 里别写显式零 |
| 库里恒有且仅有 1 个默认模板 | `configFor()` 回不出真实 templateId → analyze 照样 201 但之后 preview/render 全 400「templateId should not be empty」,功能整体瘫痪且报错与真因无关 | `ensureSomeDefault()`(删默认时调 + 启动时自愈) |
| `configFor()` 返回的 id 必须能拿回来复用 | 同上 —— analyze 把它下发给前端,前端原样回传给 `@IsNotEmpty()` 的 preview/render | `configFor()` 顺位兜底 |
| 确认页显示的类型 == 下载用的类型 | 用户核对的和拿到的不是一份东西,而确认页是本产品唯一的质量闸门 | preview 失败时禁用下载(`stale`) |
| 改 presets.ts 的默认值,已种进库的内置模板要跟着变 | 否则改了默认值**悄悄地不生效**(踩过:把 title 段后空行去掉,库里那份仍是旧值)。注意 `normalizeConfig` 会用代码默认值补**缺失的键**,所以「新增元素类型」本来就能自动到位 —— 容易误以为整套默认值都跟着走,而**已存在的键的值不会** | `ensureBuiltins` 启动时刷新 `userEdited=false` 的内置模板 |
| 孤字告警 == 预览标黄 | 告警说有、画面不标,用户更找不到 | 两处共用 `orphanTailIndex` |
| 预览按 `segs`(run 级)画,不整行套 `elements[type].font` | 把「第X条」整段画成黑体,与产物矛盾 —— 预览对最重要的那条规则撒谎 | `grid.paginate` 出 `segs`,`GridPreview` 按截画 |
| skip 段仍留在 elements 数组里 | 用户误选「不排版」后该段连同下拉一起消失,再没入口改回来,只能重新上传、此前改判全废 | 前端不过滤 skip,带删除线显示 |
