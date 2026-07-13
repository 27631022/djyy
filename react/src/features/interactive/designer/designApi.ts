import { api } from "@/shared/api/client";

/** 自制游戏设计库(互动游戏编辑器产物;InteractiveGameDesign 表) */
export interface GameDesignRow {
  id: string;
  name: string;
  configJson: string; // RouteRaceDesign 快照(后端归一化)
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const designApi = {
  async list(): Promise<GameDesignRow[]> {
    const { data } = await api.get<GameDesignRow[]>("/interactive/designs");
    return data;
  },
  async get(id: string): Promise<GameDesignRow> {
    const { data } = await api.get<GameDesignRow>(`/interactive/designs/${id}`);
    return data;
  },
  async create(name: string, config?: unknown): Promise<GameDesignRow> {
    const { data } = await api.post<GameDesignRow>("/interactive/designs", { name, config });
    return data;
  },
  async update(id: string, input: { name?: string; config?: unknown }): Promise<GameDesignRow> {
    const { data } = await api.patch<GameDesignRow>(`/interactive/designs/${id}`, input);
    return data;
  },
  async remove(id: string): Promise<{ ok: true }> {
    const { data } = await api.delete<{ ok: true }>(`/interactive/designs/${id}`);
    return data;
  },
};
