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
