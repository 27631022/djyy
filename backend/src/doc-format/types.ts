/**
 * 公文排版契约 —— 本模块的单一事实源。
 *
 * 设计要点(均有实证依据,改动前先读 README.md 的「实证结论」一节):
 * 1. 字体走「角色」不走字面名:用户心智就是「标题/一级/二级/正文用什么字体」四个槽,
 *    改一处全篇一致。elements 里存角色,fonts 里存角色→字库名的映射。
 * 2. 元素样式与「run 级字体」分离:多数元素整段一个角色;但「第X条」必须 run 级切分
 *    (实测 19/19:序号恒黑体,序号后含「。」→仿宋、不含→黑体),整段套黑体会把
 *    两百字正文全加粗。故 DocRun.role 可覆盖元素默认角色。
 * 3. 每页行数不是参数,是 floor(版心高/行距) 算出来的(本套参数 = 22 行,与国标一致)。
 * 4. 服务端只写字体「名字」,永不接触字体文件 —— 方正字库是商业授权,详见 README「版权红线」。
 */

/** 字体角色。用户后台只配这几个槽,元素引用角色而非字库名。 */
export type FontRole = 'title' | 'heading' | 'subheading' | 'body' | 'pageNumber';

export const FONT_ROLES: readonly FontRole[] = [
  'title',
  'heading',
  'subheading',
  'body',
  'pageNumber',
] as const;

export const FONT_ROLE_LABEL: Record<FontRole, string> = {
  title: '大标题',
  heading: '一级标题',
  subheading: '二级标题',
  body: '正文',
  pageNumber: '页码',
};

/**
 * 元素类型。
 *
 * 「只排正文」的产品定位(用户 2026-07-17 定案):版头(红头图片/发文机关标志)与版记
 * (抄送/印发表格)不在排版范围 —— 红头在源文件里是图片/文本框,纯文本提取只能抠出
 * 一个「件」字,留着也是垃圾。故它们归 `skip`,默认不输出;用户可在确认页改回来。
 */
export type ElementType =
  | 'title' // 公文大标题(可跨多段,作者手工断行,保留原断行)
  | 'docNumber' // 发文字号「物流党发〔2026〕24号」
  | 'recipient' // 主送机关「各单位党委……:」
  | 'chapter' // 第X章(条例体)
  | 'article' // 第X条(条例体,run 级切分)
  | 'level1' // 一、
  | 'level2' // (一)
  | 'level3' // 1.
  | 'level4' // (1)
  | 'body' // 正文
  | 'attachmentNote' // 附件说明「附件:xxx」(正文末,左空二字)
  | 'signature' // 落款/署名机关
  | 'date' // 成文日期
  | 'attachmentMark' // 附件页左上角的「附件」「附件1」标记(顶格、另起页)
  | 'attachmentTitle' // 附件标题(附件页的标题)
  | 'skip'; // 不排版(空段/版头残片/版记)

export const ELEMENT_TYPES: readonly ElementType[] = [
  'title',
  'docNumber',
  'recipient',
  'chapter',
  'article',
  'level1',
  'level2',
  'level3',
  'level4',
  'body',
  'attachmentNote',
  'signature',
  'date',
  'attachmentMark',
  'attachmentTitle',
  'skip',
] as const;

export const ELEMENT_TYPE_LABEL: Record<ElementType, string> = {
  title: '大标题',
  docNumber: '发文字号',
  recipient: '主送机关',
  chapter: '章(第X章)',
  article: '条(第X条)',
  level1: '一级标题(一、)',
  level2: '二级标题((一))',
  level3: '三级标题(1.)',
  level4: '四级标题((1))',
  body: '正文',
  attachmentNote: '附件说明',
  signature: '落款',
  date: '成文日期',
  attachmentMark: '附件标记',
  attachmentTitle: '附件标题',
  skip: '不排版',
};

export type Align = 'left' | 'center' | 'right' | 'justify';

/** 单个元素的排版样式 */
export type ElementStyle = {
  /** 字体角色(→ config.fonts 取字库名) */
  font: FontRole;
  /** 字号(磅)。二号=22 / 三号=16 / 四号=14 / 小四=12 */
  sizePt: number;
  align: Align;
  /** 首行缩进「字符」数 ×100 —— OOXML 的 w:firstLineChars 口径。200 = 缩进 2 字符 */
  firstLineChars: number;
  /** 右缩进「字符」数 ×100。国标的成文日期「右空四字」= 400 */
  rightIndentChars?: number;
  bold?: boolean;
  /** 段前空几行(行=当前行距) */
  spaceBeforeLines?: number;
  /** 段后空几行 */
  spaceAfterLines?: number;
  /** 与下段同页 —— 标题类要开,避免标题孤零零落在页尾 */
  keepNext?: boolean;
  /** 另起一页(附件标记用) */
  pageBreakBefore?: boolean;
  /** false = 识别出来但不输出到 docx */
  emit: boolean;
};

/** 页码设置 */
export type PageNumberConfig = {
  enabled: boolean;
  /** 破折号字符。国标用 em dash(U+2014);写成参数是因为有单位用 U+2015 */
  dash: string;
  font: FontRole;
  sizePt: number;
  /** 奇数页对齐(国标:居右) */
  oddAlign: Align;
  /** 偶数页对齐(国标:居左) */
  evenAlign: Align;
  /** 起始页码 */
  startAt: number;
  /**
   * 页脚距页面下边缘(mm)。
   * 国标口径是「一字线上距版心下边缘 7mm」,换算成 OOXML 的 w:footer(页底→页脚底)还要减掉
   * 页码自身行高,所以给的是个可调参数而不是硬算 —— 字号一改就得跟着动,让用户在模板里微调。
   */
  fromBottomMm: number;
};

/** 「第X条」的 run 级切分规则(实测 19/19 命中) */
export type ArticleRule = {
  /** 关掉则整段用 elements.article.font */
  splitNumber: boolean;
  /** 序号「第X条」本身的角色 */
  numberRole: FontRole;
  /** 序号后含句号(= 行内条文,后面跟着大段正文)时,余下部分的角色 */
  inlineRole: FontRole;
  /** 序号后不含句号(= 独立短标题)时,余下部分的角色 */
  standaloneRole: FontRole;
};

/** 排版模板的完整参数 —— 后台可配的就是这一整坨 */
export type DocFormatConfig = {
  page: {
    widthMm: number;
    heightMm: number;
    marginTopMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
    marginRightMm: number;
  };
  grid: {
    /** 每行字数。国标 28,昆仑物流惯例 26(实测其成文字符步进 17.01pt = 442.2/26) */
    charsPerLine: number;
    /** 行距(磅,固定值)。本套参数 28 磅 → 版心 637.8pt / 28 = 每页 22 行 */
    lineSpacingPt: number;
  };
  /** 字体角色 → 字库名。服务端只写这个字符串,不碰字体文件 */
  fonts: Record<FontRole, string>;
  /**
   * 备选字体(OOXML fontTable 的 w:altName)。目标字库缺失时渲染端回落到它,
   * 否则会掉到系统默认(实测 WPS 上是 SimSun)。只有一级,不是字体链。
   */
  fontFallback: Partial<Record<FontRole, string>>;
  elements: Record<ElementType, ElementStyle>;
  articleRule: ArticleRule;
  pageNumber: PageNumberConfig;
  /**
   * 打开 Word/WPS 自带的孤行控制。
   * 孤行/寡行/标题孤立由渲染端自己解决(配合标题的 keepNext),我们不模拟。
   * 注:源公文里普遍是 widowControl=0,那是中文 Normal 模板的出厂默认,不是谁故意关的。
   */
  widowControl: boolean;
  /** 孤字告警(渲染端不会自动修的唯一一类,只能我们算 —— 且只能报「疑似」) */
  orphanWarn: {
    enabled: boolean;
    /** 末行实占格数 ≤ 此值 → 疑似孤字。默认 2(一个字 + 一个句号) */
    maxTailCells: number;
    /** 首页版头预留行数 —— 输出不含红头,但用户后续套红头会占掉首页若干行,填了分页更准 */
    firstPageOffsetLines: number;
  };
};

/** 一个 run(同一段里字体不同的片段) */
export type DocRun = {
  text: string;
  /** 覆盖元素默认角色。仅 article 的序号切分会用到 */
  role?: FontRole;
};

/** 识别后的一个段落 */
export type DocElement = {
  /** 原始段落序号(解析器给的,确认页据此回填) */
  index: number;
  type: ElementType;
  /** 已切分的 runs。多数元素只有 1 个;article 有 2 个 */
  runs: DocRun[];
  /** 段落原文(UI 显示 + 网格计算用,不参与渲染) */
  text: string;
  /** low = 规则拿不准,确认页标黄 */
  confidence: 'high' | 'low';
  /** 识别理由 / 提醒 */
  note?: string;
};

/** 孤字告警 */
export type OrphanWarning = {
  index: number;
  /** 该段占几行 */
  lines: number;
  /** 末行实占格数 */
  tailCells: number;
  /** 末行文本(给用户看是哪几个字掉下去了) */
  tailText: string;
};

/** 版面几何(由 config 算出,前后端共用 —— 前端预览按它画格子) */
export type PageMetrics = {
  /** 版心宽(磅) */
  textWidthPt: number;
  /** 版心高(磅) */
  textHeightPt: number;
  /** 每字跨度(磅) = 版心宽 / 每行字数 */
  charPitchPt: number;
  /** 每页行数 = floor(版心高 / 行距) */
  linesPerPage: number;
};
