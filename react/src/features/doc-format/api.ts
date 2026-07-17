import { api } from "@/shared/api/client";

/** 字体角色 —— 后台只配这几个槽,元素引用角色而非字库名。与后端 types.ts 同步 */
export type FontRole = "title" | "heading" | "subheading" | "body" | "pageNumber";

export const FONT_ROLE_LABEL: Record<FontRole, string> = {
  title: "大标题",
  heading: "一级标题",
  subheading: "二级标题",
  body: "正文",
  pageNumber: "页码",
};

/** 元素类型。与后端 types.ts 的 ElementType 同步 */
export type ElementType =
  | "title"
  | "subtitle"
  | "docNumber"
  | "recipient"
  | "chapter"
  | "article"
  | "level1"
  | "level2"
  | "level3"
  | "level4"
  | "body"
  | "attachmentNote"
  | "signature"
  | "date"
  | "attachmentMark"
  | "attachmentTitle"
  | "skip";

export const ELEMENT_TYPE_LABEL: Record<ElementType, string> = {
  title: "大标题",
  subtitle: "副标题",
  docNumber: "发文字号",
  recipient: "主送机关",
  chapter: "章(第X章)",
  article: "条(第X条)",
  level1: "一级标题(一、)",
  level2: "二级标题((一))",
  level3: "三级标题(1.)",
  level4: "四级标题((1))",
  body: "正文",
  attachmentNote: "附件说明",
  signature: "落款",
  date: "成文日期",
  attachmentMark: "附件标记",
  attachmentTitle: "附件标题",
  skip: "不排版",
};

/** 确认页下拉里的顺序:常用的排前面 */
export const ELEMENT_TYPE_OPTIONS: ElementType[] = [
  "body",
  "title",
  "subtitle",
  "chapter",
  "article",
  "level1",
  "level2",
  "level3",
  "level4",
  "recipient",
  "attachmentNote",
  "signature",
  "date",
  "attachmentMark",
  "attachmentTitle",
  "docNumber",
  "skip",
];

/** 每种元素在确认页/预览里的色标 */
export const ELEMENT_TYPE_TONE: Record<ElementType, string> = {
  title: "bg-[var(--party-primary)]/12 text-[var(--party-primary)]",
  subtitle: "bg-[var(--party-primary)]/10 text-[var(--party-primary)]",
  chapter: "bg-[var(--party-primary)]/10 text-[var(--party-primary)]",
  article: "bg-amber-100 text-amber-800",
  level1: "bg-amber-100 text-amber-800",
  level2: "bg-sky-100 text-sky-800",
  level3: "bg-slate-100 text-slate-600",
  level4: "bg-slate-100 text-slate-600",
  body: "bg-slate-100 text-slate-600",
  recipient: "bg-emerald-100 text-emerald-800",
  signature: "bg-emerald-100 text-emerald-800",
  date: "bg-emerald-100 text-emerald-800",
  docNumber: "bg-violet-100 text-violet-700",
  attachmentNote: "bg-violet-100 text-violet-700",
  attachmentMark: "bg-violet-100 text-violet-700",
  attachmentTitle: "bg-violet-100 text-violet-700",
  skip: "bg-slate-100 text-slate-400 line-through",
};

export type Align = "left" | "center" | "right" | "justify";

export const ALIGN_LABEL: Record<Align, string> = {
  left: "左对齐",
  center: "居中",
  right: "右对齐",
  justify: "两端对齐",
};

export type ElementStyle = {
  font: FontRole;
  sizePt: number;
  align: Align;
  firstLineChars: number;
  rightIndentChars?: number;
  bold?: boolean;
  spaceBeforeLines?: number;
  spaceAfterLines?: number;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  emit: boolean;
};

export type DocFormatConfig = {
  page: {
    widthMm: number;
    heightMm: number;
    marginTopMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
    marginRightMm: number;
  };
  grid: { charsPerLine: number; lineSpacingPt: number };
  fonts: Record<FontRole, string>;
  fontFallback: Partial<Record<FontRole, string>>;
  elements: Record<ElementType, ElementStyle>;
  articleRule: {
    splitNumber: boolean;
    numberRole: FontRole;
    inlineRole: FontRole;
    standaloneRole: FontRole;
  };
  /** 会改动正文字符的规则(默认「一字不改」,这些单拎出来可关) */
  textRules: { curlyQuotes: boolean };
  /** md → 公文 的转换规则(只对 .md 输入生效) */
  markdown: { autoNumber: boolean };
  /** 全篇加粗(所有文字与符号) */
  boldAll: boolean;
  pageNumber: {
    enabled: boolean;
    dash: string;
    font: FontRole;
    sizePt: number;
    oddAlign: Align;
    evenAlign: Align;
    startAt: number;
    fromBottomMm: number;
  };
  widowControl: boolean;
  orphanWarn: { enabled: boolean; maxTailCells: number; firstPageOffsetLines: number };
};

export type DocTemplate = {
  id: string;
  name: string;
  description: string | null;
  /** 非空 = 内置模板(可恢复默认、不可删) */
  builtinKey: string | null;
  isDefault: boolean;
  config: DocFormatConfig;
  updatedAt: string;
};

export type DocRun = { text: string; role?: FontRole };

export type DocElement = {
  index: number;
  type: ElementType;
  runs: DocRun[];
  text: string;
  confidence: "high" | "low";
  note?: string;
};

export type OrphanHit = {
  index: number;
  lines: number;
  tailCells: number;
  tailText: string;
  /** 在预览的第几页 —— 光说「第 N 段」用户数不出来 */
  pageNo?: number;
};

/** 行内的一截:同一字体角色的连续字符。一行可跨多截(「第X条」序号黑体 + 正文仿宋) */
export type LaidSeg = { text: string; role?: FontRole };
export type PreviewLine = {
  segs: LaidSeg[];
  text: string;
  type: ElementType;
  first: boolean;
  indentCells: number;
  /** 疑似孤字的那一行 —— 预览标黄 */
  orphan?: boolean;
  /** 所属段落号(与上方告警列表对上) */
  index?: number;
};
export type PreviewPage = { pageNo: number; lines: PreviewLine[] };

export type PageMetrics = {
  textWidthPt: number;
  textHeightPt: number;
  charPitchPt: number;
  linesPerPage: number;
};

export type PreviewResult = {
  elements: DocElement[];
  orphans: OrphanHit[];
  pages: PreviewPage[];
  metrics: PageMetrics;
};

export type AnalyzeResult = PreviewResult & {
  fileId: string;
  fileName: string;
  templateId: string;
};

export type ElementOverride = { index: number; type: ElementType };

/** 字号速查:公文只用这几个 */
export const SIZE_OPTIONS: { label: string; pt: number }[] = [
  { label: "小初", pt: 36 },
  { label: "一号", pt: 26 },
  { label: "二号", pt: 22 },
  { label: "小二", pt: 18 },
  { label: "三号", pt: 16 },
  { label: "四号", pt: 14 },
  { label: "小四", pt: 12 },
];

export function sizeLabel(pt: number): string {
  return SIZE_OPTIONS.find((s) => s.pt === pt)?.label ?? `${pt}磅`;
}

export const docFormatApi = {
  analyze: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<AnalyzeResult>("/doc-format/analyze", fd, { timeout: 120_000 })
      .then((r) => r.data);
  },

  preview: (body: { fileId: string; templateId: string; overrides?: ElementOverride[] }) =>
    api.post<PreviewResult>("/doc-format/preview", body).then((r) => r.data),

  render: (body: { fileId: string; templateId: string; overrides?: ElementOverride[] }) =>
    api
      .post<{ fileId: string; fileName: string; orphans: number }>("/doc-format/render", body)
      .then((r) => r.data),

  listTemplates: () => api.get<DocTemplate[]>("/doc-format/templates").then((r) => r.data),

  createTemplate: (body: { name: string; description?: string; config?: DocFormatConfig }) =>
    api.post<DocTemplate>("/doc-format/templates", body).then((r) => r.data),

  updateTemplate: (
    id: string,
    body: { name: string; description?: string; config?: DocFormatConfig; isDefault?: boolean },
  ) => api.patch<DocTemplate>(`/doc-format/templates/${id}`, body).then((r) => r.data),

  duplicateTemplate: (id: string) =>
    api.post<DocTemplate>(`/doc-format/templates/${id}/duplicate`, {}).then((r) => r.data),

  resetTemplate: (id: string) =>
    api.post<DocTemplate>(`/doc-format/templates/${id}/reset`, {}).then((r) => r.data),

  removeTemplate: (id: string) =>
    api.delete<{ ok: true }>(`/doc-format/templates/${id}`).then((r) => r.data),
};


// ----------------------------------------------------------------- 互动

export type DocStats = {
  /** 累计排版的文档份数 —— 显眼处要的那个数 */
  converted: number;
  /** 浏览量(同人 30 分钟内算一次) */
  viewCount: number;
  favoriteCount: number;
  favorited: boolean;
  totalDurationSec: number;
  feedbackOpen: number;
};

export type FavoriteState = { favorited: boolean; favoriteCount: number };

export type DocFeedback = {
  id: string;
  content: string;
  userName: string;
  anonymous: boolean;
  /** 用户上传的「转换失败的原始文件」—— 本模块反馈的核心 */
  files: { id: string; name: string }[];
  status: "open" | "replied" | "closed" | string;
  createdAt: string;
  replies: { id: string; userName: string; content: string; createdAt: string }[];
};

export const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  replied: "已回复",
  closed: "已关闭",
};

export const FEEDBACK_STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  replied: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-100 text-slate-500",
};

/** 单次浏览时长上限,与后端 DTO 的 @Max 对齐 —— 超了 beacon 会被 400 拒收、时长直接丢失 */
export const VIEW_DURATION_MAX_SEC = 14400;

export const docInteractionApi = {
  stats: () => api.get<DocStats>("/doc-format/stats").then((r) => r.data),

  setFavorite: (on: boolean) =>
    api.post<FavoriteState>("/doc-format/favorite", { on }).then((r) => r.data),

  recordView: () =>
    api.post<{ viewLogId: string }>("/doc-format/view").then((r) => r.data),

  /** 先传失败样本拿 fileId,再把 id 带进反馈(与 knowledge/showcase 的 JSON 反馈形状一致) */
  uploadSample: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ fileId: string; fileName: string }>("/doc-format/feedback/sample", fd, { timeout: 120_000 })
      .then((r) => r.data);
  },

  addFeedback: (body: { content: string; anonymous?: boolean; fileIds?: string[] }) =>
    api.post<{ ok: true; id: string }>("/doc-format/feedback", body).then((r) => r.data),

  listFeedback: (scope: "all" | "mine", status?: string) =>
    api
      .get<DocFeedback[]>("/doc-format/feedback", { params: { scope, ...(status ? { status } : {}) } })
      .then((r) => r.data),

  replyFeedback: (id: string, content: string) =>
    api.post<{ ok: true }>(`/doc-format/feedback/${id}/reply`, { content }).then((r) => r.data),

  closeFeedback: (id: string) =>
    api.post<{ ok: true }>(`/doc-format/feedback/${id}/close`, {}).then((r) => r.data),
};

/** 浏览时长上报 URL —— useViewTracking 用 navigator.sendBeacon 发,公开口(带不了 auth 头) */
export function docViewBeaconUrl(): string {
  return `${api.defaults.baseURL}/public/doc-format/view-beacon`;
}
