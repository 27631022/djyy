import { api, apiOrigin } from "@/shared/api/client";

export interface Model3dTaskCreated {
  /** 火山异步任务 id(拿去轮询) */
  arkTaskId: string;
  provider: string;
  model: string;
}

export interface Model3dTaskStatus {
  status: "running" | "done" | "failed";
  /** done 时:3D 模型 storage fileId */
  fileId?: string;
  /** done 时:公开 .glb URL(/api/public/model3d/:id) */
  url?: string;
  /** failed 时:原因 */
  error?: string;
}

export const model3dApi = {
  /** 第一步:上传图片(先 storageApi.upload)→ 创建 3D 生成任务,立刻返回 arkTaskId。 */
  createTask: (imageFileId: string, prompt?: string) =>
    api
      .post<Model3dTaskCreated>("/model3d/generate", { imageFileId, prompt }, { timeout: 90_000 })
      .then((r) => r.data),

  /** 第二步:轮询任务(每 ~15s 调一次直到 done/failed)。done 时返回 fileId+url。 */
  getTask: (arkTaskId: string) =>
    api
      .get<Model3dTaskStatus>(`/model3d/tasks/${encodeURIComponent(arkTaskId)}`, { timeout: 60_000 })
      .then((r) => r.data),
};

/** 3D 模型 URL → 可加载的完整 URL(相对 API 路径拼 apiOrigin,随 hostname,治 IP 变动)。 */
export function resolveModel3dUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|blob:)/i.test(url)) return url;
  return apiOrigin + (url.startsWith("/") ? url : `/${url}`);
}

/** 从 axios 错误里抽后端 message。 */
export function model3dErrorMessage(err: unknown, fallback = "生成失败"): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join("; ");
  return (typeof m === "string" && m) || e?.message || fallback;
}
