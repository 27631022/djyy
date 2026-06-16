/**
 * 展厅数据契约(镜像 backend/src/exhibition/exhibition.types.ts,改契约时两边同步)
 * + 2D 搭建器的设计态类型。坐标单位一律「米」,原点在平面图中心;rot 单位「度」,0=朝-Y。
 */

/** 组件类型(规格第 6 节组件库 + v2 text_3d) */
export const FIXTURE_TYPES = [
  "image_case",
  "video_wall",
  "model_stand",
  "honor_wall",
  "notice_board",
  "door",
  "text_3d",
  "decor",
  "ceiling_sign",
  "wall_decor",
] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

/** 墙段(米) */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type HallThemePreset = "modern_light" | "party_red" | "dark_tech" | "future_tech";

export interface HallTheme {
  preset?: HallThemePreset;
  accent?: string; // 点缀色,默认党建红 #C8001E
  mirrorFloor?: boolean;
  /** 灯光强度覆盖主题预设(缺省=预设值)。hemi/env 在集显 low 档仍生效;spot 在 low 档被禁用 */
  hemiIntensity?: number; // 环境光 0–1
  envIntensity?: number; // 环境反射 0–1
  spotIntensity?: number; // 展品射灯 0–30
}

export interface HallMeta {
  gridM?: number; // 网格(米),默认 0.5
  wallH?: number; // 墙高(米),默认 4.2
  theme?: HallTheme;
  /** 进场出生点(米;rot 度,0=朝-Y) */
  spawn?: { x: number; y: number; rot?: number };
}

export interface FixtureSource {
  mode: "manual" | "connector";
  connectorId?: string;
  params?: Record<string, unknown>;
  content?: unknown;
}

export interface Fixture {
  id: string;
  type: FixtureType;
  x: number;
  y: number;
  rot: number; // 度,0=朝-Y;面向 = (sin rot, -cos rot)
  w: number; // 占地宽(米)
  d: number; // 占地深(米)
  label?: string;
  source: FixtureSource;
}

/* ── 各类型手动内容(存储态:素材 fileId;响应态后端旁补 url 键) ── */

export interface ImageCaseContent {
  /** 正面图片(展示第 1 张;caption 渲染为图下说明条) */
  images: { fileId?: string; url?: string; caption?: string }[];
  /** 背面图片(可与正面不同;未设则沿用正面) */
  backImages?: { fileId?: string; url?: string; caption?: string }[];
  /** 板式:横屏(默认)/ 竖屏 */
  orientation?: "landscape" | "portrait";
}
export interface VideoWallContent {
  videoFileId?: string;
  videoUrl?: string;
  posterFileId?: string;
  poster?: string;
}
export interface ModelStandContent {
  modelFileId?: string;
  modelUrl?: string;
  /** 模型原文件名(决定 .glb/.gltf 解析方式;编辑器显示用) */
  modelName?: string;
  /** 配套贴图散文件(glb 引用外链贴图时上传;运行时按 同folder+文件名 经 /rel/ 口解析) */
  textures?: { fileId: string; name: string; url?: string }[];
  scale?: number;
  autorotate?: boolean;
  /** 模型朝上轴:y=标准(默认);z=横倒摆正(部分建模软件导出 z-up,显示成竖立时选它) */
  upAxis?: "y" | "z";
  /** 台体形状:圆形(默认)/ 长方形;台面长宽取 fixture.w/d */
  shape?: "round" | "rect";
  /** 台面离地高度(米),默认 1.0;0 = 不出台身,展品直接落地(汽车等大件) */
  standH?: number;
  /** 玻璃罩,默认 true;false 不出罩 */
  dome?: boolean;
  /** 介绍信息:台旁立介绍牌 + 点击浮层显示 */
  intro?: string;
}
export interface HonorWallContent {
  items: { title: string; level?: string; year?: string | number; imageFileId?: string; imageUrl?: string }[];
}
export interface NoticeBoardContent {
  items: { title: string; date?: string; body?: string }[];
}
export interface Text3dContent {
  text: string;
  /** @deprecated 文字现按容器宽(fixture.w)同比缩放 */
  sizeM?: number;
  /** @deprecated 厚度现按字高自动(≈字高×0.2) */
  depthM?: number;
  elevM?: number; // 离地高度(米,字底距地):wall 默认 1.5,floor/flat 默认 0
  color?: string; // 默认主题点缀色
  finish?: "paint" | "metal" | "glow";
  mount?: "floor" | "wall" | "flat"; // flat = 平铺地面(地板字)
  font?: "sans" | "serif"; // 黑体(默认)/ 宋体
  weight?: "light" | "regular" | "medium" | "bold" | "black"; // 5 档字重
}
export interface DecorContent {
  kind?: "plant" | "plant_short" | "bench" | "arrow"; // 高绿植 / 矮盆栽 / 长椅 / 地面引导箭头
}
/** 门内容:targetHallId 设置后,3D 里点门跳转到目标展厅 */
export interface DoorContent {
  targetHallId?: string;
  targetName?: string;
}
/** 顶端吊牌 */
export interface CeilingSignContent {
  text: string;
}
/** 文化墙挂件:三套浮雕模板(党务公开栏/厂务公开栏/荣誉墙),标题/栏目可改 */
export interface WallDecorContent {
  template?: "party_red" | "blue_tech" | "honor_red";
  title?: string;
  /** 栏目名(party_red/blue_tech;honor_red 不用) */
  panels?: string[];
  /** 相框行 × 列(仅 honor_red,默认 3 × 5) */
  rows?: number;
  cols?: number;
}

/** GET /halls/:id「已解析」响应 */
export interface ResolvedHall {
  id: string;
  name: string;
  thumbnail: string | null;
  published: boolean;
  meta: HallMeta;
  envModelUrl: string | null;
  walls: Wall[];
  fixtures: Fixture[];
}

/** GET /halls 目录项 */
export interface HallSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  published: boolean;
}

/** GET /connectors 连接器元信息 */
export interface ConnectorMeta {
  id: string;
  name: string;
  forType: FixtureType;
  description: string;
  ready: boolean;
}

/* ── 设计器 ── */

/** 撤销/重做的历史单元:空间三件套(name/published 不进历史) */
export interface HallDesignerState {
  walls: Wall[];
  fixtures: Fixture[];
  meta: HallMeta;
}

/** 画布选中目标 */
export type Selection =
  | { kind: "fixture"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "spawn" }
  | null;

/** stamp 放置预设(同一类型的变体:如装饰的 绿植/长椅,带各自尺寸与内容) */
export interface StampPreset {
  label?: string;
  w?: number;
  d?: number;
  content?: unknown;
}

/** 画布工具:select 选择/移动;wall 连续画墙;stamp 放置组件(可带变体预设) */
export type CanvasTool =
  | { mode: "select" }
  | { mode: "wall" }
  | { mode: "stamp"; type: FixtureType; preset?: StampPreset };

/** 素材公开访问相对 URL(后端公开口,<img>/<video> 可直接用) */
export function exhibitionAssetUrl(fileId: string): string {
  return `/api/public/exhibition/assets/${fileId}`;
}
