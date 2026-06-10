/**
 * 会场图设计器核心数据类型(fork 自 certificate/lib/designerTypes.ts)。
 *
 * 设计原则:
 *   - VenueDesignerState 必须可 JSON.stringify 存到后端 VenueLayout.layoutJson,
 *     JSON.parse 后完整还原。所以不能有 Function / class / Date / undefined。
 *   - 元素用 discriminated union(type 判别),方便 switch 渲染 + 属性编辑。
 *   - 相对证书设计器的新增:网格(gridSize/showGrid)+ 会场专属元素
 *     (座位/会议桌/主席台/发言席/横幅/背景墙/通道/门/区域)。
 *   - seat / zone 带稳定 id —— 选座(V2)按 seatId 引用座位,规则按 zoneId 分组。
 */

/* ─── 元素类型 ─── */

export type VenueElementType =
  | "seat" // 座位(稳定 id,选座的最小单位)
  | "table-rect" // 会议桌(矩形)
  | "table-round" // 圆桌
  | "presidium" // 主席台(评分"靠前"锚点)
  | "podium" // 发言席
  | "banner" // 横幅
  | "wall" // 背景墙
  | "aisle" // 通道
  | "door" // 门
  | "text" // 文字标签
  | "zone"; // 区域(稳定 id,规则按区域分组)

interface BaseElement {
  id: string;
  type: VenueElementType;
  /** 左上角坐标(画布坐标系,px) */
  x: number;
  y: number;
  /** bounding box 尺寸 */
  width: number;
  height: number;
  /** 旋转角度(度,顺时针,以 bbox 中心旋转) */
  rotation: number;
  /** 不透明度 0-1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** 图层名(图层面板辨认用) */
  name: string;
}

/** 座位 —— 选座最小单位,id 稳定 */
export interface SeatElement extends BaseElement {
  type: "seat";
  /** 座位号(显示在座位上,可空) */
  seatNo?: string;
  /** 所属区域 id(保存/计算时按几何回填,冗余便于规则等值判定) */
  zoneId?: string;
  /** 预留座 —— 智能选座不自动占用 */
  reserved?: boolean;
  /** 座位底色 */
  fill: string;
}

export interface TableRectElement extends BaseElement {
  type: "table-rect";
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** 桌牌文字 */
  label: string;
}

export interface TableRoundElement extends BaseElement {
  type: "table-round";
  fill: string;
  stroke: string;
  strokeWidth: number;
  label: string;
}

export interface PresidiumElement extends BaseElement {
  type: "presidium";
  fill: string;
  stroke: string;
  strokeWidth: number;
  label: string;
}

export interface PodiumElement extends BaseElement {
  type: "podium";
  fill: string;
  stroke: string;
  strokeWidth: number;
  label: string;
}

export interface BannerElement extends BaseElement {
  type: "banner";
  text: string;
  fontFamily: string;
  fontSize: number;
  /** 文字色 */
  color: string;
  /** 横幅底色(常为党建红) */
  bg: string;
}

export interface WallElement extends BaseElement {
  type: "wall";
  /** 纯色背景墙底色 */
  fill: string;
  /** 可选背景墙图片(V1 base64 data URL) */
  dataUrl?: string;
}

export interface AisleElement extends BaseElement {
  type: "aisle";
  fill: string;
}

export interface DoorElement extends BaseElement {
  type: "door";
  color: string;
  /** 门标识文字(入口/出口/安全通道…) */
  label: string;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  textAlign: "left" | "center" | "right";
}

/** 区域 —— 轴对齐矩形(不旋转),id 稳定;规则按 zoneId 分组,渲染为半透明色块 */
export interface ZoneElement extends BaseElement {
  type: "zone";
  zoneName: string;
  /** 区域代表色(半透明填充 + 边框) */
  color: string;
}

export type VenueElement =
  | SeatElement
  | TableRectElement
  | TableRoundElement
  | PresidiumElement
  | PodiumElement
  | BannerElement
  | WallElement
  | AisleElement
  | DoorElement
  | TextElement
  | ZoneElement;

/* ─── 背景 ─── */

export interface CanvasBackground {
  type: "color" | "image";
  color?: string;
  /** 平面图底图 URL(可为 base64 data URL 或 storage 文件 URL) */
  imageUrl?: string;
  fillMode?: "cover" | "contain" | "center";
}

/* ─── 完整设计器状态(可序列化,= VenueLayout.layoutJson) ─── */

export interface VenueDesignerState {
  elements: VenueElement[];
  background: CanvasBackground;
  canvasWidth: number;
  canvasHeight: number;
  /** 网格间距(px);吸附与网格线绘制都用它 */
  gridSize: number;
  /** 是否显示网格线 */
  showGrid: boolean;
}
