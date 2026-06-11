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
}

/** 顶端吊牌 */
export interface CeilingSignContent {
  text: string;
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
}

export interface HallMeta {
  gridM?: number;
  wallH?: number;
  theme?: HallTheme;
  /** 进场出生点(平面图坐标,米;rot 度,0=朝-Y) */
  spawn?: { x: number; y: number; rot?: number };
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
  source: FixtureSource;
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
