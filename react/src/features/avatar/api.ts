import { api, apiOrigin } from "@/shared/api/client";

export interface AvatarGenerateResult {
  /** 生成头像的 storage fileId */
  fileId: string;
  /** 公开可访问的相对 URL(/api/public/avatars/:id);设为用户头像就存它 */
  url: string;
  provider: string;
  model: string;
}

/** 历史头像库一项(供从历史挑选复用) */
export interface AvatarHistoryItem {
  fileId: string;
  url: string;
  originalName: string;
  createdAt: string;
}

export interface AvatarGenerateOpts {
  prompt?: string;
  /** 目标用户姓名(归档文件名 + 文件夹) */
  targetName?: string;
  /** 目标用户员工编号(归档文件夹) */
  employeeNumber?: string;
}

/** 公共头像库一项 */
export interface AvatarLibraryItem {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  source: "upload" | "studio";
  /** studio 来源带部件配置,后续可回头像编辑器再编辑 */
  hasConfig: boolean;
  fileId: string;
  /** 原图公开 URL(相对 API,经 resolveAvatarUrl 显示) */
  url: string;
  /** 缩略图公开 URL(网格用小图省流量;无缩略图时后端已回退原图) */
  thumbUrl: string;
  createdAt: string;
}

export type AvatarGender = AvatarLibraryItem["gender"];

/** 公共头像库(管理 avatar:manage;查看仅登录) */
export const avatarLibraryApi = {
  list: (params?: { q?: string; gender?: string }) =>
    api.get<AvatarLibraryItem[]>("/avatars/library", { params }).then((r) => r.data),

  /** 入库:文件先 storageApi.upload({ ownerModule:'user', folder:'avatars/library' }) 拿 fileId */
  add: (body: { fileId: string; name?: string; gender?: AvatarGender }) =>
    api.post<AvatarLibraryItem>("/avatars/library", body).then((r) => r.data),

  update: (id: string, body: { name?: string; gender?: AvatarGender }) =>
    api.patch<AvatarLibraryItem>(`/avatars/library/${id}`, body).then((r) => r.data),

  remove: (id: string) => api.delete(`/avatars/library/${id}`).then((r) => r.data),
};

export const avatarApi = {
  /**
   * 上传照片(先经 storageApi.upload 得 fileId)→ AI 生成职场头像。
   * 图生图较慢,给 150s。返回预览 fileId + 公开 URL(确认后再走 usersApi.update 设头像)。
   * 传 targetName/employeeNumber 时,生成头像按「员工编号-姓名」归档到对应文件夹。
   */
  generate: (photoFileId: string, opts?: AvatarGenerateOpts) =>
    api
      .post<AvatarGenerateResult>(
        "/avatars/generate",
        { photoFileId, ...opts },
        { timeout: 150_000 },
      )
      .then((r) => r.data),

  /** 某用户的历史 AI 头像(新→旧),供「从历史头像库挑选」。 */
  history: (name?: string, employeeNumber?: string) =>
    api
      .get<AvatarHistoryItem[]>("/avatars/history", { params: { name, employeeNumber } })
      .then((r) => r.data),
};

/**
 * 头像 URL → `<img src>` 可用的完整 URL。
 *   - 外链(http/https)/ data: / blob: → 原样(兼容历史粘贴的外链头像 + 本地预览)
 *   - 相对 API 路径(/api/public/avatars/:id)→ 拼 apiOrigin(随 hostname 推断,治局域网 IP 变动)
 */
export function resolveAvatarUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return apiOrigin + (url.startsWith("/") ? url : `/${url}`);
}

/** 从 axios 错误里抽后端 message(头像生成的 400 友好提示)。 */
export function avatarErrorMessage(err: unknown, fallback = "生成失败"): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join("; ");
  return (typeof m === "string" && m) || e?.message || fallback;
}
