import { api } from "@/shared/api/client";

export interface NavItemDto {
  id: string;
  categoryId: string;
  icon: string;
  label: string;
  color: string;
  url: string | null;
  common: boolean;
  desc: string | null;
  likes: number;
  views: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NavCategoryDto {
  id: string;
  code: string;
  label: string;
  color: string;
  bgLight: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: NavItemDto[];
}

export interface CreateNavCategoryInput {
  code: string;
  label: string;
  color: string;
  bgLight: string;
  icon: string;
  sortOrder?: number;
  active?: boolean;
}

export interface UpdateNavCategoryInput {
  label?: string;
  color?: string;
  bgLight?: string;
  icon?: string;
  sortOrder?: number;
  active?: boolean;
}

export interface CreateNavItemInput {
  icon: string;
  label: string;
  color: string;
  url?: string;
  desc?: string;
  common?: boolean;
  likes?: number;
  views?: number;
  sortOrder?: number;
  active?: boolean;
}

export interface UpdateNavItemInput {
  icon?: string;
  label?: string;
  color?: string;
  url?: string;
  desc?: string;
  common?: boolean;
  likes?: number;
  views?: number;
  sortOrder?: number;
  active?: boolean;
}

export const navApi = {
  /** 公开 — 仅 active */
  listForPortal: () => api.get<NavCategoryDto[]>("/nav-categories").then((r) => r.data),
  /** 后台 — 含禁用 */
  listAll: () => api.get<NavCategoryDto[]>("/nav-categories/all").then((r) => r.data),

  /* 分类 */
  createCategory: (data: CreateNavCategoryInput) =>
    api.post<NavCategoryDto>("/nav-categories", data).then((r) => r.data),
  updateCategory: (id: string, data: UpdateNavCategoryInput) =>
    api.patch<NavCategoryDto>(`/nav-categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) =>
    api.delete<{ ok: boolean }>(`/nav-categories/${id}`).then((r) => r.data),

  /* 项目 */
  createItem: (categoryId: string, data: CreateNavItemInput) =>
    api.post<NavItemDto>(`/nav-categories/${categoryId}/items`, data).then((r) => r.data),
  updateItem: (itemId: string, data: UpdateNavItemInput) =>
    api.patch<NavItemDto>(`/nav-categories/items/${itemId}`, data).then((r) => r.data),
  deleteItem: (itemId: string) =>
    api.delete<{ ok: boolean }>(`/nav-categories/items/${itemId}`).then((r) => r.data),

  /* 拖拽排序 — 拖完成立即提交,服务端整批更新 sortOrder */
  reorderCategories: (orderedIds: string[]) =>
    api
      .post<{ ok: true; count: number }>("/nav-categories/reorder", { orderedIds })
      .then((r) => r.data),
  reorderItems: (categoryId: string, orderedIds: string[]) =>
    api
      .post<{ ok: true; count: number }>(
        `/nav-categories/${categoryId}/items/reorder`,
        { orderedIds },
      )
      .then((r) => r.data),
};
