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
};

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

export const modelLibraryApi = {
  list: () => api.get<LibraryModel[]>("/exhibition/model-library").then((r) => r.data),
  /** 改名(不必带扩展名)/ 打标签(整组替换) */
  update: (fileId: string, body: { name?: string; tags?: string[] }) =>
    api.patch<{ ok: true }>(`/exhibition/model-library/${fileId}`, body).then((r) => r.data),
};
