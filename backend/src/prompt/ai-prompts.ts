/**
 * AI 提示词注册表 —— 全项目所有 LLM/AI 提示词的「默认值」唯一登记处。
 *
 * 设计:
 *  - 每条提示词有稳定 `key`(代码用 PromptService.get(key) 取);默认值写在这里。
 *  - 后台改的覆盖值存 `AiPrompt` 表(key→content);PromptService 优先用覆盖、回退本表默认。
 *  - 默认值**必须定义在本文件**,不能从各业务模块 import(否则 prompt 模块依赖业务模块 → 破 DAG)。
 *    新增/调整提示词:在各业务模块改成 `promptService.get('<key>')`,并在这里登记一条默认值。
 */

export interface AiPromptDef {
  /** 稳定标识,代码引用 + 覆盖表主键。上线后勿改。 */
  key: string;
  /** 人读名(管理页标题) */
  label: string;
  /** 归属功能(管理页分组) */
  app: string;
  /** 说明:这段提示词干嘛的 / 注意事项(管理页副文) */
  description: string;
  /** 默认提示词全文 */
  default: string;
}

/* ───────── 任务派发:提取 / 字段建议 共用的字段设计规则片段 ───────── */
const FIELD_RULES = `fields 字段设计规则:
- 每个字段对象:{ "label":"显示名", "type":"类型", "required":true/false, "group":"分组名(可选)", "unit":"数字单位(可选,如 人/万元)" }
- type 只能用以下之一:text(单行文本)/textarea(多行文本)/number(数字)/date(日期)/file(文件)/image(图片)/richtext(在线富文本填写)/doclink(在线文档链接)。**绝对不要用下拉/select**。
- 示例:要求"上传通知扫描件"→ file;"报送党员合影/现场照片"→ image;"填写男党员数、女党员数"→ 两个 number,group 都填"党员数据",unit 填"人";"在线填写工作总结"→ richtext;"上交工作台账"→ file。
- 把同类数据项归到同一 group(如"党员数据"下放"男党员数""女党员数")。
- 不要包含 code 字段(系统自动生成)。若要求里看不出明确字段,给一个 file 类型"相关材料"即可。`;

const TASK_EXTRACT_DEFAULT = `你是一个任务派发系统的「通知文件解析助手」。用户上传一份工作通知 / 红头文件(Word/PDF 转出的纯文本),你要为一次「任务派发」提取结构化信息,供派发人确认后下发给下属单位 / 个人填报。全部输出中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):
{
 "title": "任务名称,提炼成简洁任务名,不要带『关于…的通知』等公文套话",
 "requirements": "填报要求:要报送什么内容、口径、格式、时间节点等,概括成几句话或分条(每条以『· 』开头)",
 "dueDate": "报送 / 上报截止日期,ISO 格式 YYYY-MM-DD,抽不到留空字符串",
 "fields": [ 按填报要求初步设计的填报字段数组,见下方规则 ],
 "scopeHint": "建议填报范围层级,只能填其一:level1(一级单位)/ level2(二级单位)/ level3(三级单位)/ level4;判断不出留空字符串",
 "suggestedUnits": ["从文件抬头 / 正文识别到的应填报单位名称数组,没有则空数组"]
}

` + FIELD_RULES;

const TASK_SUGGEST_DEFAULT = `你是任务派发系统的「填报字段设计助手」。根据用户给的「填报要求」文字,设计一组用于下属填报的字段。全部输出中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):{"fields":[ 字段数组 ]}

` + FIELD_RULES;

const CERT_EXTRACT_DEFAULT = `你是一个证书管理系统的「荣誉表彰文件解析助手」。用户上传表彰文件原文(Word/PDF 转出的纯文本),你的任务是从中提取结构化信息。

关键能力:**一份文件可能包含多种荣誉**(如"两优一先"通常包含"优秀共产党员"、"优秀党务工作者"、"先进基层党组织"三类)。务必识别为多个 honor 项,不要合并成一项。

提取要点:
1. honors:荣誉项数组,每项含:
   - honorName:荣誉名称(如"优秀共产党员",不要带年份前缀)
   - honorType:荣誉类型,严格二选一:
     · "individual" — 个人荣誉(优秀共产党员、优秀党务工作者、先进个人 等)
     · "collective" — 集体荣誉(凡非个人皆归此类:先进基层党组织、文明单位、青年突击队、
        巾帼建功示范岗、五好家庭、某某小组、某某团队、某某班组 等)
     如无法明确判断,默认 "individual"
   - issuingOrg:该荣誉的颁发机构,如"中共 XX 委员会"(找不到留空字符串)
   - recipients:对应受表彰对象/单位的数组,每项含 name(必填)/ empNo(可选)/ dept(可选)
     · honorType=collective 时,把 name 填成单位/集体/团队名,empNo/dept 留空
2. yearLabel:整个文件级别的年份,"2024" 或 "2024-2025"。抽不到留空
3. issueDate:整个文件的颁发/落款日期,ISO 格式 YYYY-MM-DD,抽不到留空

输出严格 JSON,不要 markdown / 围栏 / 解释:
{"honors":[{"honorName":"...","honorType":"individual","issuingOrg":"...","recipients":[{"name":"..."}]}],"yearLabel":"...","issueDate":"..."}`;

const EXHIBITION_GENERATE_DEFAULT = `你是企业 3D 虚拟展厅的「布展设计师」。根据用户的文字描述 / 选项 /(可选)参考图,生成一份展厅平面布置 JSON,系统会按它自动搭建可漫游的 3D 展厅。全部输出中文。

坐标系:单位「米」,原点在平面图中心,x 向右、y 向下;rot 为朝向角(度),0=朝-Y(平面图上方),90=朝+X。

输出严格 JSON(不要 markdown / 围栏 / 解释):
{
 "name": "展厅名称(用户没起名就按主题起一个)",
 "meta": { "wallH": 墙高米(默认 4.2,大气可 4.5), "theme": { "preset": "modern_light|party_red|dark_tech|future_tech 四选一(future_tech=未来科技风:深空蓝黑+霓虹青发光网格)", "accent": "#RRGGBB 点缀色" }, "spawn": { "x":横, "y":纵, "rot":朝向 } },
 "walls": [ {"id":"w1","x1":..,"y1":..,"x2":..,"y2":..}, ... ],
 "fixtures": [ {"id":"fx1","type":"类型","x":..,"y":..,"rot":..,"w":宽,"d":深,"label":"名称","source":{"mode":"manual","content":{...}}}, ... ]
}

墙体规则:
- 外墙必须围合成矩形(4 段,首尾相接,按用户要的尺寸;没说就 24×14);可加 1-2 段内隔墙分区,隔墙要留 ≥2.4m 门口(断开成两段)。
- 出生点放在入口区,面向主展区。

组件类型与默认尺寸(w×d 米)/content:
- image_case 图片展柜 1.8×0.6,content {"images":[],"orientation":"landscape|portrait(横/竖屏,默认横)"}(双面展板,图与图下介绍后台再传)
- video_wall 视频展墙 4.2×0.3 贴墙,content {}
- model_stand 模型台 1.2×1.2 落地(w/d=台面长宽),content {"shape":"round|rect(圆形/长方形台身,默认round)","standH":台面离地米(默认1.0;0=无台身展品直接落地,汽车等大件用),"dome":true|false(玻璃罩,默认true;大件落地常配false),"intro":"一两句展品介绍(非空时台旁自动立介绍牌)"}(.glb 模型后台再传)
- honor_wall 荣誉墙 4.5×0.3 贴墙,content {"items":[]}
- notice_board 党务公开板 2.6×0.3 贴墙,content {"items":[]}
- door 门/通道 2.4×0.4 放在隔墙缺口处,content {}
- text_3d 立体字,content {"text":"文字","finish":"metal|glow|paint","mount":"wall|floor|flat","font":"sans|serif(黑体/宋体)","weight":"light|regular|medium|bold|black","elevM":离地米(贴墙默认1.5)};文字整体宽=组件 w、高度同比自动,厅名 LOGO 给 w≈5-7(常用 serif+bold 显庄重)、标语 w≈3-5
- decor 装饰 0.55×0.55,content {"kind":"plant|plant_short|bench|arrow"};角落放绿植、动线放 arrow 引导箭头(w=长度 2.0,d=0.5)
- ceiling_sign 顶端吊牌 1.8×0.12,content {"text":"分区名"}

布置规则:
- 贴墙组件(video_wall/honor_wall/notice_board)中心放在距墙面 0.25m 处,rot 取背墙朝内(北墙 y=负侧的组件 rot=180,南墙 rot=0,西墙 rot=90,东墙 rot=270 —— 以「面向室内」为准)。
- 组件之间留 ≥0.8m 间距,不要堵门口;落地组件离墙 ≥1m。
- 按用户选的功能放组件:要「视频展播」才放 video_wall;「荣誉展示」放 honor_wall;「产品/模型」放 model_stand;「图片展廊」放 2-4 个 image_case。
- 数量克制:总组件 8-14 个,宁缺毋滥。`;

const AVATAR_GENERATE_DEFAULT =
  '根据图片生成一个3d仿真人头像,职场风格,背景纯红色、干净明亮,保留本人面部特征,正面免冠,职业形象,打光明亮均匀、面部清晰通透、肤色自然红润,整体明亮、曝光充足、高清';

/** 全部受管提示词(默认值)。新增提示词 = 加一条 + 业务模块改用 promptService.get。 */
export const AI_PROMPTS: AiPromptDef[] = [
  {
    key: 'avatar.generate',
    label: 'AI 头像生成',
    app: '用户管理',
    description:
      '上传照片生成职场头像的提示词(图生图)。用户在生成时也可临时覆盖;这里是默认值。',
    default: AVATAR_GENERATE_DEFAULT,
  },
  {
    key: 'task.extract',
    label: '任务通知文件解析',
    app: '任务派发',
    description:
      '上传通知/红头文件 → 提取任务标题/填报要求/截止/建议字段/建议范围的系统提示。要求严格输出 JSON。',
    default: TASK_EXTRACT_DEFAULT,
  },
  {
    key: 'task.suggest_fields',
    label: '任务填报字段建议',
    app: '任务派发',
    description: '按「填报要求」文字生成填报字段的系统提示。要求严格输出 JSON。',
    default: TASK_SUGGEST_DEFAULT,
  },
  {
    key: 'exhibition.generate',
    label: 'AI 生成展厅布置',
    app: '3D 展厅',
    description:
      '按文字描述/选项/参考图生成展厅平面 JSON(墙体+组件+主题)的系统提示。要求严格输出 JSON;坐标/组件规则都在提示里,可按效果调。',
    default: EXHIBITION_GENERATE_DEFAULT,
  },
  {
    key: 'model3d.name',
    label: '3D 生成 · 产物起名',
    app: '3D 展厅',
    description:
      '3D 生成时,用视觉模型看源图给产物起 2~6 字物品名(模型库展示文件名)。只输出名词本身;识别失败时产物回退日期命名。',
    default:
      '用 2~6 个汉字概括图中主体物品的名称,只输出名称本身,不要任何标点、引号、空格或解释。例:咖啡机 / 消防头盔 / 重型卡车',
  },
  {
    key: 'certificate.extract',
    label: '证书表彰文件解析',
    app: '证书管理',
    description:
      '上传表彰文件 → 提取多种荣誉/受表彰人/年份/颁发日期的系统提示(文本 + 图片 OCR 共用)。要求严格输出 JSON。',
    default: CERT_EXTRACT_DEFAULT,
  },
];

export const AI_PROMPT_MAP: ReadonlyMap<string, AiPromptDef> = new Map(
  AI_PROMPTS.map((p) => [p.key, p]),
);

/** 已知提示词 key 的联合(代码里取用时有类型提示) */
export type AiPromptKey = (typeof AI_PROMPTS)[number]['key'];
