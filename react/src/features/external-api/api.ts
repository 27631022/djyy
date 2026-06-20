import { api } from "@/shared/api/client";

/** 后端返回的 ExternalApi(apiKey 已脱敏) */
export interface ExternalApiDto {
  id: string;
  provider: string;
  /** 'cloud'(云平台)| 'internal'(内网自建,可无 key) */
  kind: string;
  /** 图标引用:lucide:X / brand:X / asset:<id>;null=按 provider 名自动品牌头像 */
  iconRef: string | null;
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
  /** 图像生成/图生图模型(SeedEdit 等,出图)。空 = 不支持生图 */
  imageModel: string | null;
  /** 语音合成(TTS)模型。空 = 不支持配音 */
  ttsModel: string | null;
  /** TTS 音色标识(provider 各自的音色名)。空 = 用默认 */
  ttsVoice: string | null;
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
  /** 'cloud'(云平台)| 'internal'(内网自建) */
  kind?: "cloud" | "internal";
  /** 图标引用 lucide:X / brand:X / asset:<id>;"" 清空回默认 */
  iconRef?: string;
  name?: string;
  description?: string;
  /** 传 "" 清空当前 key;不传保持原值 */
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  visionModel?: string;
  imageModel?: string;
  ttsModel?: string;
  ttsVoice?: string;
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

/* ─── 模型路由(按应用功能绑定 / 自动按优先级)─── */

/** 某能力下的一个候选模型(备选链里的一项) */
export interface RoutingCandidate {
  provider: string;
  name: string;
  kind: string;
  model: string;
  priority: number;
  active: boolean;
  hasKey: boolean;
  /** 当前是否可被选中(启用 + 有 key 或内网) */
  eligible: boolean;
  /** 不可用原因 */
  reason?: string;
}

/** 一个 AI 消费功能(应用×功能)的路由解析结果 */
export interface ResolvedConsumer {
  consumerKey: string;
  app: string;
  label: string;
  description?: string;
  capability: "chat" | "vision" | "reasoning" | "image";
  /** 'pinned'=已指定;'auto'=按优先级 */
  mode: "pinned" | "auto";
  /** 用户绑定的 provider(null=自动) */
  pinnedProvider: string | null;
  /** 当前实际命中(null=无可用) */
  resolved: {
    provider: string;
    name: string;
    kind: string;
    model: string;
  } | null;
  /** pin 失效回退等告警 */
  warning: string | null;
  candidates: RoutingCandidate[];
}

export const externalApiApi = {
  list: () =>
    api.get<ExternalApiDto[]>("/external-apis").then((r) => r.data),

  /** 模型路由总览:每个 AI 消费功能当前命中的模型 + 备选链 */
  routing: () =>
    api.get<ResolvedConsumer[]>("/external-apis/routing").then((r) => r.data),

  /** 绑定/解绑某功能到某 provider(provider=null 即解绑回自动) */
  bindRoute: (consumerKey: string, provider: string | null) =>
    api
      .patch<ResolvedConsumer>(`/external-apis/routing/${consumerKey}`, {
        provider: provider ?? "",
      })
      .then((r) => r.data),

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
