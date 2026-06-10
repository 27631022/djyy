import { api } from "@/shared/api/client";
import type {
  ConnectorMeta,
  Fixture,
  HallMeta,
  HallSummary,
  ResolvedHall,
  Wall,
} from "./lib/hallTypes";

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
};
