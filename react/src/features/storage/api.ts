import { api } from "@/shared/api/client";

/** 后端 StoredFileMeta 镜像(脱字节) */
export interface StoredFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  ext: string | null;
  ownerModule: string;
  folder: string | null;
  visibility: string;
  createdAt: string;
}

export interface UploadFileOptions {
  /** 业务来源(= 顶层文件夹),如 'certificate' | 'task' */
  ownerModule: string;
  /** 业务子文件夹,如 '2025-先进工作者'(可多级,'/' 分隔) */
  folder?: string;
  visibility?: "private" | "public";
}

export const storageApi = {
  /**
   * 上传文件,返回元数据(含 id)。Blob 没有文件名,务必传 filename。
   * 大文件(证书 PDF 可十几 MB)给 120s 超时。
   */
  upload: (file: File | Blob, opts: UploadFileOptions, filename?: string) => {
    const form = new FormData();
    const name =
      filename ?? (file instanceof File ? file.name : "upload.bin");
    form.append("file", file, name);
    form.append("ownerModule", opts.ownerModule);
    if (opts.folder) form.append("folder", opts.folder);
    if (opts.visibility) form.append("visibility", opts.visibility);
    return api
      .post<StoredFileMeta>("/files", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },

  /**
   * 鉴权拉取文件为 Blob(走 axios,自动带 Bearer)。
   * 私有文件只能这样取 —— 不要把 fileUrl 直接塞 <img>/<a href>(那带不上 token)。
   */
  fetchBlob: (id: string) =>
    api
      .get<Blob>(`/files/${id}`, { responseType: "blob", timeout: 60_000 })
      .then((r) => r.data),

  /** 文件的后端 URL(仅 public 文件 / 已知可匿名访问时用;私有文件请用 fetchBlob) */
  fileUrl: (id: string) => `${api.defaults.baseURL}/files/${id}`,

  remove: (id: string) =>
    api.delete<{ ok: true }>(`/files/${id}`).then((r) => r.data),
};
