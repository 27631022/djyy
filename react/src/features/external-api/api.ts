import { api } from "@/shared/api/client";

/** 后端返回的 ExternalApi(apiKey 已脱敏) */
export interface ExternalApiDto {
  id: string;
  provider: string;
  name: string;
  description: string | null;
  /** 脱敏后的 key,如 sk-t************CDEF;未配置时 null */
  apiKeyMasked: string | null;
  /** 是否配置了 key(等价于 apiKeyMasked !== null) */
  hasKey: boolean;
  apiUrl: string | null;
  model: string | null;
  active: boolean;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
  /** DB 未配但 .env 有 fallback */
  envFallback: boolean;
}

export interface UpdateExternalApiInput {
  name?: string;
  description?: string;
  /** 传 "" 清空当前 key;不传保持原值 */
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  active?: boolean;
  meta?: string;
}

export interface CreateExternalApiInput extends UpdateExternalApiInput {
  provider: string;
  name: string;
}

export const externalApiApi = {
  list: () =>
    api.get<ExternalApiDto[]>("/external-apis").then((r) => r.data),

  get: (provider: string) =>
    api.get<ExternalApiDto>(`/external-apis/${provider}`).then((r) => r.data),

  create: (input: CreateExternalApiInput) =>
    api.post<ExternalApiDto>("/external-apis", input).then((r) => r.data),

  update: (provider: string, input: UpdateExternalApiInput) =>
    api
      .patch<ExternalApiDto>(`/external-apis/${provider}`, input)
      .then((r) => r.data),

  delete: (provider: string) =>
    api.delete<{ ok: true }>(`/external-apis/${provider}`).then((r) => r.data),
};
