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
  'wall_decor', // 文化墙挂件(贴墙浮雕造型:党务/厂务公开栏、荣誉墙,程序化分层挤出)
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
export type HallThemePreset = 'modern_light' | 'party_red' | 'dark_tech' | 'future_tech';

export interface HallTheme {
  preset?: HallThemePreset; // 默认 'modern_light'(现代展馆·浅色)
  accent?: string; // 点缀色(LOGO/灯带/标语),默认党建红 #C8001E
  mirrorFloor?: boolean; // true 时客户端启用 MirrorTexture 镜面地板(默认 env 反射兜底)
  floorMat?: string;
  wallMat?: string;
  lighting?: string;
  // 灯光强度覆盖主题预设默认(缺省=预设值);客户端 resolveTheme 应用。
  // hemi/env 在集显 low 档仍生效;spot 在 low 档被禁用,该项不生效。
  hemiIntensity?: number; // 环境(半球)光,建议 0–1
  envIntensity?: number; // IBL 环境反射强度,建议 0–1
  spotIntensity?: number; // 展品射灯强度,建议 0–30
}

export interface HallMeta {
  gridM?: number; // 网格(米)
  wallH?: number; // 墙高(米)
  theme?: HallTheme;
  /** 进场出生点(平面图坐标,米;rot 度,0=朝-Y);缺省时客户端取墙体包围盒中心 */
  spawn?: { x: number; y: number; rot?: number };
  /** 在线解说员「党建小益」(全展厅统一一个数字人) */
  guide?: HallGuide;
}

/**
 * 在线解说员(数字人「党建小益」)—— 全展厅统一一个。
 * 走到展品前点击 → 小益转向展品、播解说音频、底部字幕。
 * 3D 形象用 modelFileId 指向 storage 里的 rigged glb;空 = 客户端用内置程序化占位形象。
 */
export interface HallGuide {
  enabled?: boolean; // 是否启用解说员(默认关)
  name?: string; // 解说员名称,默认「党建小益」
  modelFileId?: string; // 3D 形象 glb(从模型库选/上传);空 = 内置占位形象
  modelName?: string; // 形象模型原文件名(编辑器显示用)
  modelUrl?: string; // 响应态旁补(见 FILE_ID_TO_URL)
  scale?: number; // 模型缩放,默认 1
  voice?: string; // 云 TTS 音色覆盖(空则用 provider 默认 ttsVoice)
  /** 音色参考音频 storage fileId —— 本地 IndexTTS2 声音克隆用(党建小益的声音),空则用 IndexTTS2 自带示例音色 */
  voiceRefFileId?: string;
  /** 形象类型:'model'(3D glb,默认)/ 'sprite'(2.5D 立绘看板 —— 朝相机的透明 PNG 立绘) */
  kind?: 'model' | 'sprite';
  /** 2.5D 立绘:默认/闭嘴帧(sprite 模式必填,空则回退内置占位形象) */
  spriteFileId?: string;
  spriteUrl?: string; // 响应态旁补(见 FILE_ID_TO_URL)
  /** 2.5D 立绘:说话/张嘴帧(讲解时按音频振幅切到这张做口型;空则不切) */
  spriteTalkFileId?: string;
  spriteTalkUrl?: string;
  /** 2.5D 立绘:眨眼帧(可选;有则周期眨眼) */
  spriteBlinkFileId?: string;
  spriteBlinkUrl?: string;
  /** 2.5D 立绘:手臂层(单独一张、同画布对齐的透明 PNG;以肩为轴做挥手/伸手手势) */
  spriteArmFileId?: string;
  spriteArmUrl?: string;
  armPivotX?: number; // 肩点 X(0..1,从左,默认 0.62)
  armPivotY?: number; // 肩点 Y(0..1,从上,默认 0.42)
  armFlip?: boolean; // 手臂旋转方向反向(图里手臂在另一侧时)
  /** 解说站位优先侧:观众视角 left(默认)/ right;优先侧被墙挡时自动兜底到另一侧 */
  narrateSide?: 'left' | 'right';
  /** 2.5D 立绘亮度(自发光强度,默认 1.0;调高更亮、治"暗沉",调低更柔和) */
  brightness?: number;
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
  /** 在线解说员讲解词 + AI 生成音频(走到展品前点击时由「党建小益」播报) */
  narration?: NarrationContent;
  source: FixtureSource;
}

/** 展品解说:解说词文本 + AI(TTS)生成的音频(存 storage fileId,响应态旁补 audioUrl) */
export interface NarrationContent {
  text?: string; // 解说词(供 AI 合成语音 + 字幕显示)
  audioFileId?: string; // AI 生成的解说音频 storage fileId
  audioUrl?: string; // 响应态旁补(见 FILE_ID_TO_URL)
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
  /** 屏幕(相框)高度(米);缺省按 16:9 自动(min(w*9/16, 2.6)) */
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
/** 立体字(v2):客户端经 /api/public/exhibition/font?chars= 取字体子集后 CreateText 挤出 */
export interface Text3dContent {
  text: string; // 中文/英文均可
  /** @deprecated 旧字段:文字现按容器宽(fixture.w)同比缩放,不再单独设字高 */
  sizeM?: number;
  /** @deprecated 旧字段:挤出厚度现按字高自动(≈字高×0.2) */
  depthM?: number;
  elevM?: number; // 离地高度(米,字底距地):wall 默认 1.5,floor/flat 默认 0
  color?: string; // 默认主题点缀色(accent)
  finish?: 'paint' | 'metal' | 'glow'; // 烤漆 / 金属 / 发光,默认 paint
  mount?: 'floor' | 'wall' | 'flat'; // 落地 / 贴墙 / 平铺地面(地板字),默认 floor
  font?: 'sans' | 'serif'; // 字体:黑体(默认)/ 宋体
  /** 粗细 5 档:细体/常规/中粗/加粗/特粗(细/中粗/特粗由后端对字形轮廓偏置合成) */
  weight?: 'light' | 'regular' | 'medium' | 'bold' | 'black';
}
/** 装饰内容:程序化变体(arrow=地面引导箭头,沿朝向指引) */
export interface DecorContent {
  kind?: 'plant' | 'plant_short' | 'bench' | 'arrow';
}
/** 门内容:targetHallId 设置后,3D 里点门跳转到目标展厅(展厅间互通) */
export interface DoorContent {
  targetHallId?: string;
  targetName?: string; // 冗余目标厅名(门头牌显示「→ 厅名」)
  /** 门头牌正面文字(缺省回退 targetName / fixture.label) */
  frontText?: string;
  /** 门头牌背面文字(两面可显示不同字;缺省回退正面) */
  backText?: string;
}
/** 顶端吊牌 */
export interface CeilingSignContent {
  text: string;
}
/**
 * 文化墙挂件:贴墙浮雕造型(参考广告公司文化墙版式,程序化分层挤出,零素材)。
 * 三套模板:party_red 党务公开栏(红飘带+金边)/ blue_tech 厂务公开栏(金属框+蓝科技)/
 * honor_red 荣誉墙(红飘带+金相框阵列+搁板灯带)。标题/栏目名可改,留空用模板默认。
 */
export interface WallDecorContent {
  template?: 'party_red' | 'blue_tech' | 'honor_red';
  /** 主标题(默认按模板:党务公开栏 / 厂务公开栏 / 荣誉墙) */
  title?: string;
  /** 栏目名(party_red/blue_tech 的栏目板标题;honor_red 不用) */
  panels?: string[];
  /** 相框行数 × 列数(仅 honor_red,默认 3 × 5) */
  rows?: number;
  cols?: number;
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
  audioFileId: 'audioUrl', // 解说音频(Fixture.narration / 也可用于其它语音素材)
  spriteFileId: 'spriteUrl', // 解说员 2.5D 立绘(默认/闭嘴帧)
  spriteTalkFileId: 'spriteTalkUrl', // 立绘说话/张嘴帧
  spriteBlinkFileId: 'spriteBlinkUrl', // 立绘眨眼帧
  spriteArmFileId: 'spriteArmUrl', // 立绘手臂层
};

/** 素材公开访问相对路径(免登录客户端可加载;dev 经 vite proxy 同源) */
export function exhibitionAssetUrl(fileId: string): string {
  return `/api/public/exhibition/assets/${fileId}`;
}
