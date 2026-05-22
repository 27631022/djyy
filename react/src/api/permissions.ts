import { api } from "./client";

export type PermissionCategory = "menu" | "operation" | "field" | "data";

export const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  menu:      "菜单",
  operation: "操作",
  field:     "字段",
  data:      "数据",
};

export const PERMISSION_CATEGORY_ORDER: PermissionCategory[] = ["menu", "operation", "field", "data"];

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  pluginName: string | null;
  builtin: boolean;
  createdAt: string;
}

export const permissionsApi = {
  list: () => api.get<Permission[]>("/permissions").then((r) => r.data),
};
