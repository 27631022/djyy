import { api } from "@/shared/api/client";
import type {
  ConnectorMeta,
  Fixture,
  HallMeta,
  HallSummary,
  HallThemePreset,
  ResolvedHall,
  Wall,
} from "./lib/hallTypes";

/** AI 生成展厅入参:描述 / 参考图 / 选项,至少给一样 */
export interface GenerateHallBody {
  description?: string;
  imageFileId?: string;
  widthM?: number;
  depthM?: number;
  preset?: HallThemePreset;
  features?: string[];
}

/** AI 生成结果(不落库;应用进搭建器可撤销,确认后正常保存) */
export interface GeneratedHall {
  name: string;
  meta: HallMeta;
  walls: Wall[];
  fixtures: Fixture[];
}

export interface SaveHallBody {
  name?: string;
  meta?: HallMeta;
  walls?: Wall[];
  fixtures?: Fixture[];
  thumbnailFileId?: string;
  envModelFileId?: string;
  published?: boolean;
  sortOrder?: number;
}

export const hallApi = {
  /** 展厅目录(含未发布,published 字段区分) */
  list: () => api.get<HallSummary[]>("/halls").then((r) => r.data),

  /** 单厅「已解析」JSON(fileId 旁已补 url;保存前用 stripResolvedUrls 剥掉) */
  get: (id: string) => api.get<ResolvedHall>(`/halls/${id}`).then((r) => r.data),

  create: (body: SaveHallBody & { name: string }) =>
    api.post<ResolvedHall>("/halls", body).then((r) => r.data),

  update: (id: string, body: SaveHallBody) =>
    api.patch<ResolvedHall>(`/halls/${id}`, body).then((r) => r.data),

  remove: (id: string) => api.delete<{ ok: true }>(`/halls/${id}`).then((r) => r.data),

  /** 可用连接器(荣誉墙/党务板绑定数据来源;P1 占位 ready=false) */
  connectors: () => api.get<ConnectorMeta[]>("/connectors").then((r) => r.data),

  /** AI 生成展厅布置(LLM 较慢,给 120s) */
  aiGenerate: (body: GenerateHallBody) =>
    api.post<GeneratedHall>("/halls/ai-generate", body, { timeout: 120_000 }).then((r) => r.data),

  /** 解说员配音:解说词文本 → AI 合成音频,返回 fileId + url(写进 fixture.narration)。
   *  本地 IndexTTS2 声音克隆较慢(一句可能 ~1-2 分钟),给足超时。 */
  narrateTts: (body: { text: string; voice?: string; hallId?: string }) =>
    api
      .post<NarrateTtsResult>("/halls/narration/tts", body, { timeout: 300_000 })
      .then((r) => r.data),
};

/** 解说员配音返回 */
export interface NarrateTtsResult {
  fileId: string;
  url: string;
  provider: string;
  model: string;
}

/** 模型库条目(上传库 + AI 生成历史 合并;id=storage fileId,模型台 modelFileId 直接用) */
export interface LibraryModel {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  source: "upload" | "ai";
  url: string;
  /** 分类标签 */
  tags: string[];
  /** 物品截图(AI 生成的=源图;卡片默认显示,点击才加载 3D) */
  thumbUrl?: string;
}

/** 优化档位:原(只缩贴图保几何,画质最好)/ 中(减面 50%)/ 小(减面 75%);档名即产物文件名后缀 */
export type OptimizePreset = "orig" | "medium" | "small";

export interface OptimizeResult {
  newFileId: string;
  newName: string;
  beforeVertices: number;
  afterVertices: number;
  beforeSize: number;
  afterSize: number;
}

export const modelLibraryApi = {
  list: () => api.get<LibraryModel[]>("/exhibition/model-library").then((r) => r.data),
  /** 改名(不必带扩展名)/ 打标签(整组替换) */
  update: (fileId: string, body: { name?: string; tags?: string[] }) =>
    api.patch<{ ok: true }>(`/exhibition/model-library/${fileId}`, body).then((r) => r.data),
  /** 一键优化:减面 + 缩贴图,另存为「<原名>-opt.glb」(源保留);返回前后顶点/体积 */
  optimize: (fileId: string, preset: OptimizePreset = "medium") =>
    api
      .post<OptimizeResult>(`/exhibition/model-library/${fileId}/optimize`, { preset })
      .then((r) => r.data),
};

/* ── 展厅素材中心 ── */

/** 讲解员「形象包」:整套(立绘/3D 形象 + 音色 + 肩点参数),config 已解析(含 *Url 可预览/套用) */
export interface GuidePreset {
  id: string;
  name: string;
  createdAt: string;
  config: Record<string, unknown> & {
    kind?: "model" | "sprite";
    spriteUrl?: string;
    modelUrl?: string;
    modelName?: string;
  };
}

/** 文件型素材分类 */
export type AssetCategory = "voice" | "wall-texture" | "wall-decor";

/** 各分类上传到的 storage 文件夹(ownerModule 固定 exhibition) */
export const ASSET_FOLDER: Record<AssetCategory, string> = {
  voice: "library-voice",
  "wall-texture": "library-wall-texture",
  "wall-decor": "library-wall-decor",
};

/** 各分类上传 accept */
export const ASSET_ACCEPT: Record<AssetCategory, string> = {
  voice: ".mp3,.wav,.ogg,audio/*",
  "wall-texture": ".png,.jpg,.jpeg,.webp",
  "wall-decor": ".png,.jpg,.jpeg,.webp,.glb,.gltf",
};

/** 文件型素材条目 */
export interface LibraryAsset {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  url: string;
  tags: string[];
}

export const exhibitionLibraryApi = {
  /* 形象包 */
  listPresets: () => api.get<GuidePreset[]>("/exhibition/guide-presets").then((r) => r.data),
  createPreset: (name: string, config: Record<string, unknown>) =>
    api.post<GuidePreset>("/exhibition/guide-presets", { name, config }).then((r) => r.data),
  renamePreset: (id: string, name: string) =>
    api.patch<{ ok: true }>(`/exhibition/guide-presets/${id}`, { name }).then((r) => r.data),
  removePreset: (id: string) =>
    api.delete<{ ok: true }>(`/exhibition/guide-presets/${id}`).then((r) => r.data),
  /* 文件型素材(音色 / 墙面贴图 / 墙面装饰) */
  listAssets: (category: AssetCategory) =>
    api
      .get<LibraryAsset[]>("/exhibition/asset-library", { params: { category } })
      .then((r) => r.data),
  updateAsset: (category: AssetCategory, fileId: string, body: { name?: string; tags?: string[] }) =>
    api
      .patch<{ ok: true }>(`/exhibition/asset-library/${fileId}`, body, { params: { category } })
      .then((r) => r.data),
};
