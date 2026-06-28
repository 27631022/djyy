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
  "flag",
] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

/** 墙面质感(注册表键;P2 可加 brick 砖纹 / relief 浮雕等贴图类) */
export type WallFinish = "paint" | "metal" | "glow";

/**
 * 单面墙样式(可选;字段一次定型,P1 仅 finish/color 进 UI,其余为已对齐的扩展位)。
 * 缺省一律回退主题墙(theme.wall + theme.wallRoughness),旧展厅 style=undefined 自动兼容。
 */
export interface WallStyle {
  finish?: WallFinish; // 质感:烤漆(默认)/ 金属 / 发光
  color?: string; // 墙面颜色 sRGB hex;缺省回退主题墙色
  roughness?: number; // 可选微调,缺省由 finish 决定(本期不进 UI)
  metallic?: number; // 可选微调(本期不进 UI)
  tileScale?: number; // 平铺密度,1=1m 一格(P2 贴图用)
  textureFileId?: string; // 墙面贴图 storage 松引用(P2;命名 *FileId 后缀供孤儿 GC 自动认领)
  textureUrl?: string; // 仅响应态旁补(P2)
}

/** 墙段(米) */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style?: WallStyle; // 单面墙样式(两面共用;faces 缺省时的兜底)
  /** 两面单独设样式:inner 朝展厅内、outer 背面;缺省回退 style/整盒单材质 */
  faces?: { inner?: WallStyle; outer?: WallStyle };
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
  /** 在线解说员「党建小益」(全展厅统一一个数字人) */
  guide?: HallGuide;
}

/** 在线解说员(数字人「党建小益」):3D 形象 modelFileId 指向 rigged glb,空=内置占位形象 */
export interface HallGuide {
  enabled?: boolean; // 是否启用解说员(默认关)
  name?: string; // 默认「党建小益」
  modelFileId?: string; // 3D 形象 glb(从模型库选)
  modelName?: string; // 形象模型原文件名(编辑器显示用)
  modelUrl?: string; // 响应态旁补
  scale?: number; // 缩放,默认 1
  voice?: string; // 云 TTS 音色覆盖
  /** 音色参考音频 storage fileId(本地 IndexTTS2 声音克隆用) */
  voiceRefFileId?: string;
  kind?: "model" | "sprite"; // 形象类型:3D glb(默认)/ 2.5D 立绘看板
  spriteFileId?: string; // 立绘默认/闭嘴帧
  spriteUrl?: string; // 响应态旁补
  spriteTalkFileId?: string; // 说话/张嘴帧
  spriteTalkUrl?: string;
  spriteBlinkFileId?: string; // 眨眼帧(可选)
  spriteBlinkUrl?: string;
  spriteArmFileId?: string; // 手臂层(拆层手势)
  spriteArmUrl?: string;
  armPivotX?: number; // 肩点 X(0..1)
  armPivotY?: number; // 肩点 Y(0..1)
  armFlip?: boolean; // 手臂方向反向
  narrateSide?: "left" | "right"; // 解说站位优先侧(默认 left,右侧兜底)
  brightness?: number; // 2.5D 立绘亮度(自发光强度,默认 1.0)
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
  /** 在线解说员讲解词 + AI 生成音频(点击展品时由「党建小益」播报) */
  narration?: NarrationContent;
  source: FixtureSource;
}

/** 展品解说:解说词 + AI 生成音频(响应态旁补 audioUrl) */
export interface NarrationContent {
  text?: string;
  audioFileId?: string;
  audioUrl?: string;
}

/* ── 各类型手动内容(存储态:素材 fileId;响应态后端旁补 url 键) ── */

export interface ImageCaseContent {
  /** 正面图片(展示第 1 张;caption 渲染为图下说明条) */
  images: { fileId?: string; url?: string; thumbnail?: string; caption?: string }[];
  /** 背面图片(可与正面不同;未设则沿用正面) */
  backImages?: { fileId?: string; url?: string; thumbnail?: string; caption?: string }[];
  /** 板式:横屏(默认)/ 竖屏 */
  orientation?: "landscape" | "portrait";
  /** 显示底座(落地座台);false = 不出底座(贴墙/悬空式) */
  showBase?: boolean;
  /** 展板下边缘离地高度(米);缺省 横屏 0.75 / 竖屏 0.55 */
  baseElevM?: number;
  /** 画框(展板)高度(米);缺省 横屏 1.9 / 竖屏 2.2 */
  frameH?: number;
}
export interface VideoWallContent {
  videoFileId?: string;
  videoUrl?: string;
  posterFileId?: string;
  poster?: string;
  /** 屏幕下边缘离地高度(米);缺省 1.1 */
  baseElevM?: number;
  /** 屏幕(相框)高度(米);缺省按 16:9 自动 */
  frameH?: number;
  /** 两面显示(背面同屏);默认 false */
  doubleSided?: boolean;
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
  /** 门头牌正面文字(缺省回退 targetName / fixture.label) */
  frontText?: string;
  /** 门头牌背面文字(两面可显示不同字;缺省回退正面) */
  backText?: string;
}
/** 顶端吊牌 */
export interface CeilingSignContent {
  text: string;
}
/** 文化墙挂件:三套浮雕模板(党务公开栏/厂务公开栏/荣誉墙),标题/栏目可改 */
export interface WallDecorContent {
  template?: "party_red" | "blue_tech" | "honor_red" | "pledge_oath";
  title?: string;
  /** 栏目名(party_red/blue_tech;honor_red/pledge_oath 不用) */
  panels?: string[];
  /** 相框行 × 列(仅 honor_red,默认 3 × 5) */
  rows?: number;
  cols?: number;
  /** 正文(仅 pledge_oath 入党誓词板:整段誓词,走 canvas 贴图渲染;留空用标准誓词) */
  bodyText?: string;
}
/** 党旗 / 旗帜:贴墙贴图平面(上传旗面图) */
export interface FlagContent {
  imageFileId?: string;
  imageUrl?: string; // 响应态旁补(imageFileId → imageUrl)
  frameH?: number; // 旗面高(米,默认按 3:2 自动)
  baseElevM?: number; // 下边缘离地高度(米,默认 1.4)
  withPole?: boolean; // 是否配旗杆
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
