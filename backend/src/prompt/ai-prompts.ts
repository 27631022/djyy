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
