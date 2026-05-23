/**
 * 证书设计器的核心数据类型。
 *
 * 设计原则:
 *   - DesignerState 必须可以 JSON.stringify 后存到后端 designJson 字段,
 *     反之 JSON.parse 后能完整还原画布。所以不能有 Function / class instance / Date / undefined。
 *   - 元素用 discriminated union(type 字段判别),方便 switch case 渲染 + 属性编辑
 *   - Phase B 只实装 text / rect / circle 三种;Phase D 补齐剩余 5 种
 */

/* ─── 元素 ─── */

export type ElementType =
  | "text"
  | "rect"
  | "circle"
  | "line" // Phase D
  | "decor-border" // Phase D
  | "image" // Phase D
  | "stamp" // Phase D
  | "qrcode"; // Phase D

interface BaseElement {
  id: string;
  type: ElementType;
  /** 左上角坐标(画布坐标系,px) */
  x: number;
  y: number;
  /** 元素 bounding box 尺寸 */
  width: number;
  height: number;
  /** 旋转角度(度,顺时针为正,以 bbox 中心为旋转中心)。Phase C 才能编辑 */
  rotation: number;
  /** 不透明度 0-1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** 用户可见的层级名,方便图层面板辨认 */
  name: string;
  /** 绑定的变量 key(Phase D 启用,V1 仅 text 支持) */
  variableKey?: string;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  /** CSS color */
  color: string;
  /** normal | bold */
  fontWeight: "normal" | "bold";
  /** normal | italic */
  fontStyle: "normal" | "italic";
  /** 文字水平对齐(对 bbox 而言) */
  textAlign: "left" | "center" | "right";
  /** 行高倍率(相对 fontSize) */
  lineHeight: number;
  /** 笔画(描边)颜色,空字符串表示不描边 */
  strokeColor: string;
  strokeWidth: number;
  /** 首行缩进(字符数;实际像素 = textIndent × fontSize) */
  textIndent: number;
}

export interface RectElement extends BaseElement {
  type: "rect";
  fill: string; // CSS color,空串=透明
  stroke: string; // 描边色,空串=不描
  strokeWidth: number;
  /** 圆角半径 */
  borderRadius: number;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineElement extends BaseElement {
  type: "line";
  /** 笔画颜色 */
  color: string;
  strokeWidth: number;
  /** true = 虚线 */
  dashed: boolean;
}

export interface DecorBorderElement extends BaseElement {
  type: "decor-border";
  color: string;
  variant: "simple" | "double" | "ornate";
  strokeWidth: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  /** base64 data URL */
  dataUrl: string;
  fillMode: "cover" | "contain" | "stretch";
}

export interface StampElement extends BaseElement {
  type: "stamp";
  /** 章面顶部弧形文字(机构名等) */
  text: string;
  /** 章面中段水平小字(如 "证书专用章") */
  centerText: string;
  /** 章面底部弧形文字 — 最细最小,常用于编号/日期/落款 */
  bottomText: string;
  /** 整体色,通常是红 */
  color: string;
  strokeWidth: number;
  /** 中心图案 — none/五角星/党徽 */
  centerPattern: "none" | "star" | "emblem";
  /** 顶弧字号(px) — 0/undefined = 用自动算 */
  topTextFontSize?: number;
  /** 顶弧距外圈内沿的额外内缩(px) — 0/undefined = 默认 2px */
  topTextPadding?: number;
  /** 底弧字号(px) — 0/undefined = 用自动算 */
  bottomTextFontSize?: number;
  /** 底弧距外圈内沿的额外内缩(px) — 0/undefined = 默认 2px */
  bottomTextPadding?: number;
}

export interface QRCodeElement extends BaseElement {
  type: "qrcode";
  /** 二维码内容(URL / 文本) */
  content: string;
  /** 前景色 */
  color: string;
  /** 背景色,空白 = 不画背景 */
  background: string;
}

export type DesignerElement =
  | TextElement
  | RectElement
  | CircleElement
  | LineElement
  | DecorBorderElement
  | ImageElement
  | StampElement
  | QRCodeElement;

/* ─── 背景 ─── */

export interface CanvasBackground {
  type: "color" | "image" | "texture"; // Phase D 支持 image/texture,V1 主要用 color
  color?: string;
  imageUrl?: string;
  fillMode?: "cover" | "contain" | "center";
  textureId?: string;
}

/* ─── 变量字段(Phase D 启用) ─── */

export interface VariableField {
  /** 程序内 key,如 'name' / 'certNo' */
  key: string;
  /** 显示名,如 '姓名' / '证书编号' */
  label: string;
  /** 文本元素里的占位符默认值,通常是 '{{label}}' */
  defaultValue: string;
  /** 预览模式下用的示例值,如 '张三' */
  sampleValue: string;
}

/* ─── 完整设计器状态(可序列化) ─── */

export interface DesignerState {
  elements: DesignerElement[];
  background: CanvasBackground;
  canvasWidth: number;
  canvasHeight: number;
  variables: VariableField[];
}

/* ─── 编辑器交互态(不持久化,仅本地) ─── */

export interface SelectionState {
  selectedIds: string[];
}
