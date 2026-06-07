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
