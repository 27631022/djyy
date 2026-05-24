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
  /** 多模态/视觉模型(OCR 用)。空时图像调用走 model 兜底 */
  visionModel: string | null;
  /** 平台充值/计费控制台 URL */
  rechargeUrl: string | null;
  /** 业务优先级 0-100,数字大的优先,默认 50 */
  priority: number;
  /** 能力标签,逗号分隔。已知值:chat / vision / reasoning */
  capabilities: string;
  active: boolean;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
  /** DB 未配但 .env 有 fallback */
  envFallback: boolean;
}

export interface ExternalApiTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  model?: string;
}

export interface ExternalApiBalance {
  status: 'supported' | 'not_supported' | 'error';
  balance?: number;
  unit?: string;
  granted?: number;
  detail?: string;
}

export interface TestExternalApiInput {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
}

export interface UpdateExternalApiInput {
  name?: string;
  description?: string;
  /** 传 "" 清空当前 key;不传保持原值 */
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  visionModel?: string;
  rechargeUrl?: string;
  priority?: number;
  capabilities?: string;
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

  /** 测试连接 — body 可传 apiKey/apiUrl/model 覆盖,便于「测试当前编辑值」 */
  test: (provider: string, input: TestExternalApiInput = {}) =>
    api
      .post<ExternalApiTestResult>(`/external-apis/${provider}/test`, input, {
        // 测试本身是个 chat completion,后端给了 15s,这里前端要更宽松些
        timeout: 30_000,
      })
      .then((r) => r.data),

  /** 查询余额(部分 provider 支持) */
  balance: (provider: string) =>
    api
      .get<ExternalApiBalance>(`/external-apis/${provider}/balance`, {
        timeout: 20_000,
      })
      .then((r) => r.data),
};
