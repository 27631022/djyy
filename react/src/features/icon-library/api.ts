import { api } from "@/shared/api/client";

/** 后端 IconAsset(自定义上传图标,含 dataUrl) */
export interface IconAssetDto {
  id: string;
  name: string;
  mimeType: string;
  ext: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export const iconAssetsApi = {
  list: () => api.get<IconAssetDto[]>("/icons").then((r) => r.data),

  upload: (file: File, name?: string) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    if (name) fd.append("name", name);
    return api
      .post<IconAssetDto>("/icons", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30_000,
      })
      .then((r) => r.data);
  },

  remove: (id: string) =>
    api.delete<{ ok: true }>(`/icons/${id}`).then((r) => r.data),
};
