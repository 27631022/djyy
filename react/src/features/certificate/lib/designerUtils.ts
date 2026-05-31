import type {
  CircleElement,
  DecorBorderElement,
  DesignerElement,
  DesignerState,
  ImageElement,
  LineElement,
  QRCodeElement,
  RectElement,
  StampElement,
  TextElement,
  VariableField,
} from "./designerTypes";

/**
 * 生成元素 ID。
 *
 * 浏览器坑:`crypto.randomUUID()` 只在 secure context(HTTPS / localhost)有,
 * 局域网 IP(http://10.x.x.x)是 insecure context,API 不存在 → 设计器一加元素就崩。
 * 这里只用来在单次会话内做唯一标识,不要求全局唯一,所以走 时间戳 + Math.random 兜底。
 */
export function genId(prefix = "el"): string {
  // 优先:crypto.randomUUID(localhost / HTTPS 下可用)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  // 次选:crypto.getRandomValues(insecure context 下也可用)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return `${prefix}_${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  // 兜底:Date.now + Math.random
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t.slice(-4)}${r}`;
}

/* ─── 空状态 + 默认变量 ─── */

export const DEFAULT_VARIABLES: VariableField[] = [
  { key: "name", label: "姓名", defaultValue: "{{姓名}}", sampleValue: "张三" },
  { key: "certNo", label: "证书编号", defaultValue: "{{证书编号}}", sampleValue: "2026-QDJL-010-001" },
  { key: "yearLabel", label: "表彰年度", defaultValue: "{{表彰年度}}", sampleValue: "2026" },
  { key: "issueDate", label: "颁发日期", defaultValue: "{{颁发日期}}", sampleValue: "2026年05月23日" },
  { key: "validUntil", label: "有效期", defaultValue: "{{有效期}}", sampleValue: "永久有效" },
  { key: "position", label: "职务", defaultValue: "{{职务}}", sampleValue: "党支部书记" },
  { key: "department", label: "部门", defaultValue: "{{部门}}", sampleValue: "机关综合处" },
  { key: "issuer", label: "颁发机构", defaultValue: "{{颁发机构}}", sampleValue: "中共党建益友委员会" },
  { key: "grade", label: "成绩/等级", defaultValue: "{{成绩}}", sampleValue: "优秀" },
];

/**
 * 证书变量面板 / 插入器实际展示的预设变量(按荣誉类型策划)。
 * 个人 / 集体都用这 6 个:证书编号 · 表彰年度 · 姓名(集体=获奖集体) · 颁发日期 · 有效期 · 颁发机构。
 * DEFAULT_VARIABLES 里其余 key(职务 / 部门 / 等级)仍保留在 state.variables,
 * 仅用于兼容老模板已放置的占位符替换,不再出现在面板里。
 */
export const CERT_PALETTE_KEYS = [
  "certNo",
  "yearLabel",
  "name",
  "issueDate",
  "validUntil",
  "issuer",
] as const;

/**
 * 按荣誉类型把 "name" 变量在「姓名 / 获奖集体」之间切换。
 * 只改显示 label + 示例值;占位符 token 保持 {{姓名}} 不变 —— 改 token 会导致
 * 此前已用 {{姓名}} 设计的集体模板替换不上。值映射按 key("name")走,个人/集体通用。
 */
export function deriveVariables(
  variables: VariableField[],
  honorType: "individual" | "collective",
): VariableField[] {
  return variables.map((v) => {
    if (v.key !== "name") return v;
    return honorType === "collective"
      ? { ...v, label: "获奖集体", sampleValue: "青年突击队" }
      : { ...v, label: "姓名", sampleValue: "张三" };
  });
}

/** 取面板/插入器要展示的变量(CERT_PALETTE_KEYS 子集,按其顺序) */
export function paletteVariables(variables: VariableField[]): VariableField[] {
  const byKey = new Map(variables.map((v) => [v.key, v]));
  return CERT_PALETTE_KEYS.map((k) => byKey.get(k)).filter(
    (v): v is VariableField => Boolean(v),
  );
}

/**
 * 把 DEFAULT_VARIABLES 里缺失的预设变量补进模板自带的变量表(保留已有自定义)。
 * 用于加载老模板:老模板存的 variables 没有后来新增的预设变量(如「表彰年度」yearLabel),
 * 合并后该变量才会出现在变量面板、且渲染时能按 {{表彰年度}} 占位符替换。
 */
export function withDefaultVariables(variables?: VariableField[]): VariableField[] {
  if (!variables || variables.length === 0) return [...DEFAULT_VARIABLES];
  const merged = [...variables];
  const keys = new Set(merged.map((v) => v.key));
  for (const dv of DEFAULT_VARIABLES) {
    if (!keys.has(dv.key)) merged.push(dv);
  }
  return merged;
}

export function emptyDesignerState(width = 800, height = 566): DesignerState {
  return {
    elements: [],
    background: { type: "color", color: "#FFFFFF" },
    canvasWidth: width,
    canvasHeight: height,
    variables: DEFAULT_VARIABLES,
  };
}

/* ─── 元素工厂(Phase B 范围:text/rect/circle)─── */

/** 常用中文字体栈,提供给字体选择器和元素默认值用 */
export const FONT_STACKS = [
  {
    value: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif',
    label: "系统默认",
  },
  {
    value: '"Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif',
    label: "微软雅黑",
  },
  {
    value: 'SimHei, "Microsoft YaHei", "Heiti SC", sans-serif',
    label: "黑体",
  },
  {
    value: 'KaiTi, "KaiTi_GB2312", STKaiti, "BiauKai", serif',
    label: "楷体",
  },
  {
    value: 'FangSong, "FangSong_GB2312", STFangsong, serif',
    label: "仿宋",
  },
  {
    value: 'SimSun, "Songti SC", STSong, serif',
    label: "宋体",
  },
] as const;

export function createTextElement(opts?: Partial<TextElement>): TextElement {
  return {
    id: genId("txt"),
    type: "text",
    x: 100,
    y: 100,
    width: 240,
    height: 48,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "文本",
    text: "双击编辑文本",
    fontFamily: FONT_STACKS[0].value,
    fontSize: 24,
    color: "#1A1A1A",
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    lineHeight: 1.4,
    strokeColor: "",
    strokeWidth: 0,
    textIndent: 0,
    ...opts,
  };
}

export function createRectElement(opts?: Partial<RectElement>): RectElement {
  return {
    id: genId("rect"),
    type: "rect",
    x: 120,
    y: 120,
    width: 200,
    height: 120,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "矩形",
    fill: "#FFE5E5",
    stroke: "#C8001E",
    strokeWidth: 2,
    borderRadius: 0,
    ...opts,
  };
}

export function createCircleElement(opts?: Partial<CircleElement>): CircleElement {
  return {
    id: genId("circ"),
    type: "circle",
    x: 140,
    y: 140,
    width: 140,
    height: 140,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "圆形",
    fill: "#FFF5E5",
    stroke: "#F5A623",
    strokeWidth: 2,
    ...opts,
  };
}

export function createLineElement(opts?: Partial<LineElement>): LineElement {
  return {
    id: genId("line"),
    type: "line",
    x: 100,
    y: 200,
    width: 240,
    height: 4,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "线",
    color: "#C8001E",
    strokeWidth: 2,
    dashed: false,
    ...opts,
  };
}

export function createDecorBorderElement(
  opts?: Partial<DecorBorderElement>,
): DecorBorderElement {
  return {
    id: genId("brd"),
    type: "decor-border",
    x: 40,
    y: 40,
    width: 720,
    height: 486,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "装饰边框",
    color: "#C8001E",
    variant: "double",
    strokeWidth: 3,
    ...opts,
  };
}

export function createImageElement(opts?: Partial<ImageElement>): ImageElement {
  return {
    id: genId("img"),
    type: "image",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "图片",
    dataUrl: "",
    fillMode: "contain",
    ...opts,
  };
}

export function createStampElement(opts?: Partial<StampElement>): StampElement {
  return {
    id: genId("stmp"),
    type: "stamp",
    x: 320,
    y: 200,
    width: 160,
    height: 160,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "印章",
    text: "中共党建益友委员会",
    centerText: "",
    // 两端各 3 个空格,让底弧文字在弧上不顶到弧两端,看着透气
    bottomText: "   荣誉专用章   ",
    color: "#eb250f",
    strokeWidth: 4,
    centerPattern: "star",
    topTextFontSize: 20,
    topTextPadding: -5,
    bottomTextFontSize: 11,
    bottomTextPadding: -5,
    ...opts,
  };
}

/** 判断元素拖角缩放时是否锁定宽高比(印章 / 二维码 是 1:1) */
export function isAspectLocked(el: DesignerElement): boolean {
  return el.type === "stamp" || el.type === "qrcode";
}

export function createQRCodeElement(
  opts?: Partial<QRCodeElement>,
): QRCodeElement {
  return {
    id: genId("qr"),
    type: "qrcode",
    x: 330,
    y: 210,
    width: 140,
    height: 140,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: "二维码",
    content: "https://djyy.example.com/verify/SAMPLE",
    color: "#1A1A1A",
    background: "#FFFFFF",
    ...opts,
  };
}

/* ─── 通用工具 ─── */

export function cloneElement(el: DesignerElement): DesignerElement {
  return { ...el, id: genId(el.type.slice(0, 4)), x: el.x + 16, y: el.y + 16 };
}

/** 命中测试:鼠标(画布坐标)是否落在元素 bbox 内。Phase B 暂忽略旋转 */
export function hitTest(el: DesignerElement, px: number, py: number): boolean {
  if (!el.visible) return false;
  return px >= el.x && px <= el.x + el.width && py >= el.y && py <= el.y + el.height;
}

/** 从上往下找第一个命中的元素(elements 数组末尾 = topmost) */
export function pickElementAt(
  elements: DesignerElement[],
  px: number,
  py: number,
): DesignerElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.locked) continue;
    if (hitTest(el, px, py)) return el;
  }
  return null;
}

/** 正则元字符转义 — 用 label 拼正则时防止 "/" 等字符破坏匹配 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 把文本里的变量占位符替换为 sampleValue,用于预览 / 发证渲染。
 *
 * 匹配两种形态,优先级从精确到兼容:
 *  1. 变量自身的占位符串 `v.defaultValue`(如 "{{成绩}}")——元素就是用它创建的,
 *     用 split/join 精确替换,不走正则,避免特殊字符问题。
 *     (修复历史 bug:旧实现用 `{{label}}` 拼正则,而 grade 的 label "成绩/等级"
 *      与占位符 "{{成绩}}" 对不上,导致 grade 永远替换不掉。)
 *  2. `{{label}}` 形式(老数据 / 用户手填),正则匹配并转义 label。
 */
export function replaceVariables(text: string, variables: VariableField[]): string {
  let out = text;
  for (const v of variables) {
    if (v.defaultValue) {
      out = out.split(v.defaultValue).join(v.sampleValue);
    }
    out = out.replace(
      new RegExp(`\\{\\{\\s*${escapeRegExp(v.label)}\\s*\\}\\}`, "g"),
      v.sampleValue,
    );
  }
  return out;
}

/**
 * 取元素的"代表色"用于图层栏的色条 —— 让用户能一眼对应画布上的元素。
 * 优先级:可见的填充色 → 描边色 → fallback 灰
 */
export function getElementColor(el: DesignerElement): string {
  switch (el.type) {
    case "text":
      return el.color || "#9CA3AF";
    case "rect":
    case "circle":
      return el.fill || el.stroke || "#9CA3AF";
    case "line":
    case "decor-border":
    case "stamp":
    case "qrcode":
      return el.color || "#9CA3AF";
    case "image":
      return "#6B7280";
  }
}
