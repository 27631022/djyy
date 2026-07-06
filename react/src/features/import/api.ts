import { api } from "@/shared/api/client";

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

/**
 * 组织机构 + 用户 批量导入。模板下载走 blob(带鉴权头),导入走 multipart。
 */
export const importApi = {
  orgTemplate: () =>
    api.get("/import/templates/organizations", { responseType: "blob" }).then((r) => r.data as Blob),
  userTemplate: () =>
    api.get("/import/templates/users", { responseType: "blob" }).then((r) => r.data as Blob),
  importOrganizations: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ImportResult>("/import/organizations", fd).then((r) => r.data);
  },
  importUsers: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ImportResult>("/import/users", fd).then((r) => r.data);
  },
};
