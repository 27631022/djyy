import { api } from "@/shared/api/client";

export interface PromptView {
  key: string;
  label: string;
  app: string;
  description: string;
  /** 代码里的默认值 */
  default: string;
  /** 当前生效全文(覆盖优先,回退默认) */
  content: string;
  /** 是否被后台改过 */
  overridden: boolean;
  updatedAt: string | null;
}

export const promptApi = {
  /** 列全部受管提示词(默认 + 覆盖状态) */
  list: () => api.get<PromptView[]>("/prompts").then((r) => r.data),
  /** 覆盖某提示词 */
  update: (key: string, content: string) =>
    api.patch<PromptView>(`/prompts/${encodeURIComponent(key)}`, { content }).then((r) => r.data),
  /** 还原默认(删覆盖) */
  reset: (key: string) =>
    api.post<PromptView>(`/prompts/${encodeURIComponent(key)}/reset`).then((r) => r.data),
};

/** 从 axios 错误抽后端 message */
export function promptErrorMessage(err: unknown, fallback = "操作失败"): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join("; ");
  return (typeof m === "string" && m) || e?.message || fallback;
}
