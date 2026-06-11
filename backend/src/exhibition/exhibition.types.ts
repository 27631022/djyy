/**
 * 企业虚拟展厅 — 数据契约(规格 docs/specs/2026-06-07-virtual-exhibition-hall.md 第 5 节)。
 *
 * 这是后端「存储态 ↔ 响应态」与前端客户端共享的形状定义:
 *   - 存储态:素材一律以 storage `fileId` 引用(松引用,见 schema Hall 注释)。
 *   - 响应态(GET /halls/:id「已解析」):service 在 fileId 旁补出可访问的相对 URL
 *     `/api/public/exhibition/assets/<fileId>`,客户端直接用 url 加载。
 *
 * ⚠ 前端独立工程 exhibition-client/ 复制了一份等价类型(跨工程无法 import),改契约时两边同步。
 */

/** 组件类型(规格第 6 节组件库 + v2 新增 text_3d) */
export const FIXTURE_TYPES = [
  'image_case', // 图片展柜(落地)
  'video_wall', // 视频展墙(贴墙)
  'model_stand', // 模型台(落地)
  'honor_wall', // 荣誉墙(贴墙,连接器 → 证书/荣誉)
  'notice_board', // 党务公开板(贴墙,连接器 → 任务/党务)
  'door', // 门 / 通道(3D 端自动在墙上挖洞 + 过梁)
  'text_3d', // 立体字(入口 LOGO 墙 / 标语,挤出 3D 文字;mount=flat 平铺地面)
  'decor', // 装饰(绿植/长椅/地面引导箭头,程序化建模,不可点击)
  'ceiling_sign', // 顶端吊牌(吊杆 + 双面文字牌)
] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

/** 墙(单位:米,原点在平面图中心) */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 主题预设(v2):客户端 theme/presets.ts 按 preset 取整套材质/灯光参数 */
export type HallThemePreset = 'modern_light' | 'party_red' | 'dark_tech';

export interface HallTheme {
  preset?: HallThemePreset; // 默认 'modern_light'(现代展馆·浅色)
  accent?: string; // 点缀色(LOGO/灯带/标语),默认党建红 #C8001E
  mirrorFloor?: boolean; // true 时客户端启用 MirrorTexture 镜面地板(默认 env 反射兜底)
  floorMat?: string;
  wallMat?: string;
  lighting?: string;
}

export interface HallMeta {
  gridM?: number; // 网格(米)
  wallH?: number; // 墙高(米)
  theme?: HallTheme;
  /** 进场出生点(平面图坐标,米;rot 度,0=朝-Y);缺省时客户端取墙体包围盒中心 */
  spawn?: { x: number; y: number; rot?: number };
}

/** 组件实例(规格 5.2) */
export interface Fixture {
  id: string;
  type: FixtureType;
  x: number; // 位置 X(米)
  y: number; // 位置 Y(米,→ 三维 Z)
  rot: number; // 朝向(度,0 = 朝 -Y / 平面图正上方)
  w: number; // 占地宽(米)
  d: number; // 占地深(米)
  label?: string;
  source: FixtureSource;
}

/** 数据来源:手动上传 或 连接器对接系统(规格 5.2 / 5.4) */
export interface FixtureSource {
  mode: 'manual' | 'connector';
  connectorId?: string; // mode=connector 时:用哪个连接器
  params?: Record<string, unknown>; // 连接器参数(如 { category:'national' })
  content?: unknown; // mode=manual:ManualContent;响应态会被「已解析」内容填充
}

/**
 * 手动内容(存储态)— 素材用 fileId 引用,service 解析时旁补 url。
 * 命名约定:`xxxFileId` 字段 → 响应里旁补 `xxx`/对应 url 键(见 FILE_ID_TO_URL)。
 */
export interface ImageCaseContent {
  images: { fileId?: string; url?: string; thumbnail?: string; caption?: string }[];
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
  scale?: number;
  autorotate?: boolean;
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
/** 立体字(v2):客户端经 /api/public/exhibition/font?chars= 取字体子集后 CreateText 挤出 */
export interface Text3dContent {
  text: string; // 中文/英文均可
  sizeM?: number; // 字高(米),默认 0.6
  depthM?: number; // 挤出厚度(米),默认 0.12
  color?: string; // 默认主题点缀色(accent)
  finish?: 'paint' | 'metal' | 'glow'; // 烤漆 / 金属 / 发光,默认 paint
  mount?: 'floor' | 'wall' | 'flat'; // 落地 / 贴墙 / 平铺地面(地板字),默认 floor
}
/** 装饰内容:程序化变体(arrow=地面引导箭头,沿朝向指引) */
export interface DecorContent {
  kind?: 'plant' | 'plant_short' | 'bench' | 'arrow';
}
/** 门内容:targetHallId 设置后,3D 里点门跳转到目标展厅(展厅间互通) */
export interface DoorContent {
  targetHallId?: string;
  targetName?: string; // 冗余目标厅名(门头牌显示「→ 厅名」)
}
/** 顶端吊牌 */
export interface CeilingSignContent {
  text: string;
}

/** 已解析展厅(GET /halls/:id 响应,客户端拿到即用) */
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

/** 展厅目录项(GET /halls) */
export interface HallSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  published: boolean;
}

/**
 * 「已解析」映射:存储态里以这些 key 持有 storage fileId,响应态在旁边补出对应 url 键。
 * 例:{ videoFileId:'abc' } → 解析后 { videoFileId:'abc', videoUrl:'/api/public/exhibition/assets/abc' }。
 */
export const FILE_ID_TO_URL: Record<string, string> = {
  fileId: 'url',
  imageFileId: 'imageUrl',
  videoFileId: 'videoUrl',
  posterFileId: 'poster',
  modelFileId: 'modelUrl',
};

/** 素材公开访问相对路径(免登录客户端可加载;dev 经 vite proxy 同源) */
export function exhibitionAssetUrl(fileId: string): string {
  return `/api/public/exhibition/assets/${fileId}`;
}
