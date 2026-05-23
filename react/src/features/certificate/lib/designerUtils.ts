import type {
  CircleElement,
  DesignerElement,
  DesignerState,
  RectElement,
  TextElement,
  VariableField,
} from "./designerTypes";

/** crypto.randomUUID 在所有现代浏览器都有 */
export function genId(prefix = "el"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/* ─── 空状态 + 默认变量 ─── */

export const DEFAULT_VARIABLES: VariableField[] = [
  { key: "name", label: "姓名", defaultValue: "{{姓名}}", sampleValue: "张三" },
  { key: "certNo", label: "证书编号", defaultValue: "{{证书编号}}", sampleValue: "DJYY-2026-0001" },
  { key: "issueDate", label: "颁发日期", defaultValue: "{{颁发日期}}", sampleValue: "2026年05月23日" },
  { key: "validUntil", label: "有效期", defaultValue: "{{有效期}}", sampleValue: "永久有效" },
  { key: "position", label: "职务", defaultValue: "{{职务}}", sampleValue: "党支部书记" },
  { key: "department", label: "部门", defaultValue: "{{部门}}", sampleValue: "机关综合处" },
  { key: "issuer", label: "颁发机构", defaultValue: "{{颁发机构}}", sampleValue: "中共党建益友委员会" },
  { key: "grade", label: "成绩/等级", defaultValue: "{{成绩}}", sampleValue: "优秀" },
];

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
    fontFamily: "system-ui, -apple-system, 'Microsoft YaHei', sans-serif",
    fontSize: 24,
    color: "#1A1A1A",
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    lineHeight: 1.4,
    strokeColor: "",
    strokeWidth: 0,
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

/** 把变量占位符 {{label}} 替换为 sampleValue,用于预览模式(Phase D) */
export function replaceVariables(text: string, variables: VariableField[]): string {
  let out = text;
  for (const v of variables) {
    out = out.replace(new RegExp(`\\{\\{\\s*${v.label}\\s*\\}\\}`, "g"), v.sampleValue);
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
  }
}
