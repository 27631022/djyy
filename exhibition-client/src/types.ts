/**
 * 展厅数据契约 —— 与 backend/src/exhibition/exhibition.types.ts 一一对应。
 * ⚠ 跨工程无法 import,改契约时两边同步。
 */

export const FIXTURE_TYPES = [
  'image_case',
  'video_wall',
  'model_stand',
  'honor_wall',
  'notice_board',
  'door',
  'text_3d',
  'decor', // 装饰(绿植/长椅/地面引导箭头,程序化建模,不可点击)
  'ceiling_sign', // 顶端吊牌(吊杆 + 双面文字牌)
  'wall_decor', // 文化墙挂件(贴墙浮雕造型:党务/厂务公开栏、荣誉墙,程序化分层挤出)
] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

/** 装饰内容:程序化变体(arrow=地面引导箭头) */
export interface DecorContent {
  kind?: 'plant' | 'plant_short' | 'bench' | 'arrow';
}

/** 门内容:targetHallId 设置后,点门跳转到目标展厅 */
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
  template?: 'party_red' | 'blue_tech' | 'honor_red';
  title?: string;
  /** 栏目名(party_red/blue_tech;honor_red 不用) */
  panels?: string[];
  /** 相框行 × 列(仅 honor_red,默认 3 × 5) */
  rows?: number;
  cols?: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type HallThemePreset = 'modern_light' | 'party_red' | 'dark_tech' | 'future_tech';

export interface HallTheme {
  preset?: HallThemePreset;
  accent?: string;
  mirrorFloor?: boolean;
  floorMat?: string;
  wallMat?: string;
  lighting?: string;
  /** 灯光强度覆盖主题预设默认(缺省=用预设值)。
   *  ⚠ hemi/env 是集显 low 档下唯一仍生效的光;spot(展品射灯)在 low 档被禁用,此项不生效。 */
  hemiIntensity?: number; // 环境(半球)光,建议 0–1
  envIntensity?: number; // IBL 环境反射强度,建议 0–1
  spotIntensity?: number; // 展品射灯强度,建议 0–30
}

export interface HallMeta {
  gridM?: number;
  wallH?: number;
  theme?: HallTheme;
  /** 进场出生点(平面图坐标,米;rot 度,0=朝-Y) */
  spawn?: { x: number; y: number; rot?: number };
  /** 在线解说员「党建小益」(全展厅统一一个数字人) */
  guide?: HallGuide;
}

/** 在线解说员(数字人「党建小益」):3D 形象 modelFileId 指向 rigged glb,空=内置占位形象 */
export interface HallGuide {
  enabled?: boolean;
  name?: string; // 默认「党建小益」
  modelFileId?: string;
  modelName?: string;
  modelUrl?: string; // 响应态旁补
  scale?: number;
  voice?: string;
  /** 音色参考音频 fileId(IndexTTS2 声音克隆用) */
  voiceRefFileId?: string;
  kind?: 'model' | 'sprite'; // 形象类型:3D glb(默认)/ 2.5D 立绘看板
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
  narrateSide?: 'left' | 'right'; // 解说站位优先侧(默认 left,右侧兜底)
  brightness?: number; // 2.5D 立绘亮度(自发光强度,默认 1.0)
}

export interface Fixture {
  id: string;
  type: FixtureType;
  x: number; // 平面图 X(米)→ 三维 X
  y: number; // 平面图 Y(米)→ 三维 Z
  rot: number; // 朝向(度,0=朝-Y;面向 = (sin rot, -cos rot))
  w: number;
  d: number;
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

export interface FixtureSource {
  mode: 'manual' | 'connector';
  connectorId?: string;
  params?: Record<string, unknown>;
  content?: unknown; // 响应态已被后端「已解析」(fileId → url)
}

export interface ImageCaseContent {
  /** 正面图片(展示第 1 张;caption 渲染为图下说明条) */
  images: { fileId?: string; url?: string; thumbnail?: string; caption?: string }[];
  /** 背面图片(可与正面不同;未设则沿用正面) */
  backImages?: { fileId?: string; url?: string; thumbnail?: string; caption?: string }[];
  /** 板式:横屏(默认)/ 竖屏 */
  orientation?: 'landscape' | 'portrait';
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
  /** 模型原文件名(决定 .glb/.gltf 解析方式) */
  modelName?: string;
  /** 配套贴图散文件(glb 引用外链贴图时上传;运行时按 同folder+文件名 经 /rel/ 口解析) */
  textures?: { fileId: string; name: string; url?: string }[];
  scale?: number;
  autorotate?: boolean;
  /** 模型朝上轴:y=标准(默认);z=横倒摆正(部分建模软件导出 z-up,显示成竖立时选它) */
  upAxis?: 'y' | 'z';
  /** 台体形状:圆形(默认)/ 长方形;台面长宽取 fixture.w/d */
  shape?: 'round' | 'rect';
  /** 台面离地高度(米),默认 1.0;**0 = 不出台身,展品直接落地**(汽车等大件) */
  standH?: number;
  /** 玻璃罩,默认 true;false 不出罩 */
  dome?: boolean;
  /** 介绍信息:台旁立介绍牌 + 点击浮层显示 */
  intro?: string;
}
export interface HonorWallContent {
  items: {
    title: string;
    level?: string;
    year?: string | number;
    imageFileId?: string;
    imageUrl?: string;
  }[];
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
  color?: string;
  finish?: 'paint' | 'metal' | 'glow';
  mount?: 'floor' | 'wall' | 'flat'; // flat = 平铺地面(地板字)
  font?: 'sans' | 'serif'; // 黑体(默认)/ 宋体
  weight?: 'light' | 'regular' | 'medium' | 'bold' | 'black'; // 5 档字重
}

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

export interface HallSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  published: boolean;
}

/** 后端 /api/public/exhibition/font 返回的 typeface.js 格式字体子集 */
export interface TypefaceFontSubset {
  familyName: string;
  ascender: number;
  descender: number;
  underlinePosition: number;
  underlineThickness: number;
  boundingBox: { xMin: number; xMax: number; yMin: number; yMax: number };
  resolution: number;
  glyphs: Record<string, { ha: number; x_min: number; x_max: number; o: string }>;
}
