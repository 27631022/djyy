import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosError } from 'axios';
import type { ExternalApi } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  CreateExternalApiDto,
  TestExternalApiDto,
  UpdateExternalApiDto,
} from './dto/update-external-api.dto';
import {
  AI_CONSUMERS,
  getConsumer,
  type AiConsumer,
  type AiCapability,
} from './ai-consumers';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 列表/详情 API 响应:apiKey 已脱敏 */
export interface ExternalApiPublic {
  id: string;
  provider: string;
  /** 'cloud'(云平台)| 'internal'(内网自建,可无 key) */
  kind: string;
  /** 图标引用:lucide:X / brand:X / asset:<id>;null=按 provider 名自动品牌头像 */
  iconRef: string | null;
  name: string;
  description: string | null;
  /** 已脱敏:sk-1234***********abcd 或 ✓已配置(过短)或 null(未配置) */
  apiKeyMasked: string | null;
  /** 是否配置了 key(前端 UI 显示用) */
  hasKey: boolean;
  apiUrl: string | null;
  model: string | null;
  visionModel: string | null;
  imageModel: string | null;
  model3d: string | null;
  ttsModel: string | null;
  ttsVoice: string | null;
  rechargeUrl: string | null;
  priority: number;
  capabilities: string;
  active: boolean;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
  /** key 是否由 .env 提供(DB 没配但 .env 有时显示这个) */
  envFallback: boolean;
}

/** 选中的「活跃 LLM/Vision」配置 — 业务模块拿这个直接调外部 API */
export interface ActiveProviderConfig {
  provider: string;
  /** internal 内网可无 key,此处可能为空串;调用方有 key 才带 Authorization 头 */
  apiKey: string;
  apiUrl: string;
  model: string;
  /** TTS 音色(仅 tts 能力时有意义;来自 ExternalApi.ttsVoice,可空) */
  voice?: string;
  /** 'cloud' | 'internal' */
  kind: string;
  source: 'db';
}

/** 路由备选链里的一个候选 provider(管理页展示) */
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
  /** 不可用时的原因(已禁用 / 未配置 Key 等) */
  reason?: string;
}

/** 某消费功能(应用×功能)的路由解析结果 */
export interface ResolvedConsumer {
  consumerKey: string;
  app: string;
  label: string;
  description?: string;
  capability: AiCapability;
  /** 'pinned'=已指定 provider;'auto'=按优先级自动 */
  mode: 'pinned' | 'auto';
  /** 用户指定绑定的 provider(null=未绑定/自动) */
  pinnedProvider: string | null;
  /** 当前实际命中(null=没有可用 provider) */
  resolved: {
    provider: string;
    name: string;
    kind: string;
    model: string;
  } | null;
  /** pin 失效回退等告警 */
  warning: string | null;
  /** 该能力下的完整备选链(按优先级降序) */
  candidates: RoutingCandidate[];
}

/** 测试连接响应 */
export interface ExternalApiTestResult {
  ok: boolean;
  latencyMs: number;
  /** 平台返回的样例文本(成功时为 chat 回复,失败时为错误描述) */
  message: string;
  /** 测试时用的模型 */
  model?: string;
}

/** 余额查询响应 — 不同 provider 字段可能差异,统一接口 */
export interface ExternalApiBalance {
  /** 'supported' 含有效余额信息;'not_supported' 表示该 provider 当前未实现余额查询 */
  status: 'supported' | 'not_supported' | 'error';
  /** 主余额数字(单位见 unit) */
  balance?: number;
  unit?: string;
  /** 充值过的总额(可选) */
  granted?: number;
  /** 详细文本展示(失败时是错误信息) */
  detail?: string;
  /** 原始响应(用于排错,前端不显示) */
  raw?: unknown;
}

/** 把数据库行脱敏 + 添加 envFallback 标记 */
function toPublic(
  row: ExternalApi,
  envHasFallback: boolean,
): ExternalApiPublic {
  const k = row.apiKey ?? '';
  let masked: string | null = null;
  let hasKey = false;
  if (k.length > 0) {
    hasKey = true;
    if (k.length <= 8) {
      masked = '✓ 已配置';
    } else {
      masked = `${k.slice(0, 4)}${'*'.repeat(Math.min(12, k.length - 8))}${k.slice(-4)}`;
    }
  }
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    iconRef: row.iconRef,
    name: row.name,
    description: row.description,
    apiKeyMasked: masked,
    hasKey,
    apiUrl: row.apiUrl,
    model: row.model,
    visionModel: row.visionModel,
    imageModel: row.imageModel,
    model3d: row.model3d,
    ttsModel: row.ttsModel,
    ttsVoice: row.ttsVoice,
    rechargeUrl: row.rechargeUrl,
    priority: row.priority,
    capabilities: row.capabilities,
    active: row.active,
    meta: row.meta,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    envFallback: !hasKey && envHasFallback,
  };
}

/** 能力 tag → 中文(错误提示/告警里用) */
function capabilityLabel(tag: string): string {
  if (tag === 'chat') return '对话';
  if (tag === 'vision') return '视觉';
  if (tag === 'reasoning') return '推理';
  if (tag === 'image') return '图像生成';
  if (tag === '3d') return '3D生成';
  if (tag === 'tts') return '语音合成';
  return tag;
}

/** provider → .env 兜底变量名映射(用户没在 DB 配 key 时回退到这些) */
const ENV_FALLBACK_KEYS: Record<string, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  qwen: 'QWEN_API_KEY',
  doubao: 'DOUBAO_API_KEY',
  ernie: 'ERNIE_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
};

@Injectable()
export class ExternalApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** 列表 — 全返脱敏字段 */
  async list(): Promise<ExternalApiPublic[]> {
    const rows = await this.prisma.externalApi.findMany({
      orderBy: [{ active: 'desc' }, { provider: 'asc' }],
    });
    return rows.map((r) => toPublic(r, this.envHas(r.provider)));
  }

  async get(provider: string): Promise<ExternalApiPublic> {
    const row = await this.prisma.externalApi.findUnique({
      where: { provider },
    });
    if (!row) throw new NotFoundException(`未找到 provider=${provider}`);
    return toPublic(row, this.envHas(provider));
  }

  /**
   * 业务层入口 1:按 capability tag 选「活跃的 LLM/Vision provider」。
   *
   * 选法:
   *   1. active=true 且 apiKey 非空 且 capabilities 包含 tag
   *   2. 按 priority 降序取第一条
   *   3. 都没的话返回 null —— 业务层抛友好错(「请到系统设置配 LLM」)
   *
   * 注:.env 兜底只在 getKeyForProvider() 走,这里只看 DB(因为多模型场景
   * 用户期望显式在 UI 管理)。如要支持 .env 兜底,加 fallback 参数即可。
   */
  async getActiveByCapability(
    tag: AiCapability,
  ): Promise<ActiveProviderConfig | null> {
    const rows = await this.rowsForCapability(tag);
    const row = rows.find((r) => this.isEligible(r));
    return row ? this.toActiveConfig(row, tag) : null;
  }

  /** 业务层快捷:取主 LLM(chat tag,最高 priority) */
  async getActiveLLM(): Promise<ActiveProviderConfig | null> {
    return this.getActiveByCapability('chat');
  }

  /** 业务层快捷:取主 Vision(vision tag,最高 priority) */
  async getActiveVision(): Promise<ActiveProviderConfig | null> {
    return this.getActiveByCapability('vision');
  }

  /**
   * 业务层入口(推荐):按「消费功能 key」(ai-consumers.ts)解析该用哪个 provider。
   * 先看 AiRoute 是否把该功能 pin 到某 provider;pin 有效用之,失效回退 auto。
   * 返回 null = 当前没有可用 provider(业务层抛友好错)。
   */
  async getConfigForConsumer(
    key: string,
  ): Promise<ActiveProviderConfig | null> {
    const consumer = getConsumer(key);
    if (!consumer) return null;
    const { row } = await this.pickForConsumer(consumer);
    return row ? this.toActiveConfig(row, consumer.capability) : null;
  }

  /**
   * 取指定 provider 在某能力下的可用配置(active + 有 key/内网 + 具备该能力);不可用返回 null。
   * 供业务做「优先 A、失败回退 B」的显式备选链(如发票图片识别:豆包优先、千问其次)。
   */
  async getConfigForProviderCapability(
    provider: string,
    tag: AiCapability,
  ): Promise<ActiveProviderConfig | null> {
    const row = await this.prisma.externalApi.findUnique({ where: { provider } });
    if (!row || !this.isEligible(row)) return null;
    const caps = (row.capabilities ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase());
    if (!caps.includes(tag)) return null;
    return this.toActiveConfig(row, tag);
  }

  /** 路由总览:每个消费功能解析出 当前命中 + 备选链 + 绑定/告警(管理页展示用) */
  async listRouting(): Promise<ResolvedConsumer[]> {
    return Promise.all(AI_CONSUMERS.map((c) => this.resolveConsumer(c.key)));
  }

  /** 解析单个消费功能的完整路由信息(命中 + 候选链 + pin 状态 + 失效告警) */
  async resolveConsumer(key: string): Promise<ResolvedConsumer> {
    const consumer = getConsumer(key);
    if (!consumer) throw new NotFoundException(`未知消费功能:${key}`);
    const route = await this.prisma.aiRoute.findUnique({
      where: { consumerKey: key },
    });
    const pinnedProvider = route?.provider ?? null;
    const { row, mode, warning, rows } = await this.pickForConsumer(consumer);
    const candidates: RoutingCandidate[] = rows.map((r) => {
      const hasKey = Boolean(r.apiKey && r.apiKey.trim());
      const eligible = this.isEligible(r);
      let reason: string | undefined;
      if (!eligible) {
        reason = !r.active
          ? '已禁用'
          : r.kind === 'internal'
            ? '内网模型未启用'
            : '未配置 Key';
      }
      return {
        provider: r.provider,
        name: r.name,
        kind: r.kind,
        model: this.modelForCapability(r, consumer.capability),
        priority: r.priority,
        active: r.active,
        hasKey,
        eligible,
        reason,
      };
    });
    return {
      consumerKey: key,
      app: consumer.app,
      label: consumer.label,
      description: consumer.description,
      capability: consumer.capability,
      mode,
      pinnedProvider,
      resolved: row
        ? {
            provider: row.provider,
            name: row.name,
            kind: row.kind,
            model: this.modelForCapability(row, consumer.capability),
          }
        : null,
      warning,
      candidates,
    };
  }

  /** 绑定/解绑某功能到某 provider(provider=null 即解绑回自动) */
  async setRoute(
    consumerKey: string,
    provider: string | null,
    ctx: AuditCtx,
  ): Promise<ResolvedConsumer> {
    const consumer = getConsumer(consumerKey);
    if (!consumer) throw new NotFoundException(`未知消费功能:${consumerKey}`);
    if (provider) {
      const row = await this.prisma.externalApi.findUnique({
        where: { provider },
      });
      if (!row) throw new BadRequestException(`provider=${provider} 不存在`);
      const caps = (row.capabilities ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase());
      if (!caps.includes(consumer.capability)) {
        throw new BadRequestException(
          `「${row.name}」未标注${capabilityLabel(consumer.capability)}(${consumer.capability})能力,不能绑定到「${consumer.label}」。请先在该平台「能力标签」里加上 ${consumer.capability}。`,
        );
      }
    }
    await this.prisma.aiRoute.upsert({
      where: { consumerKey },
      create: { consumerKey, provider, updatedById: ctx.actorId },
      update: { provider, updatedById: ctx.actorId },
    });
    await this.audit.log({
      action: 'api.route.set',
      target: consumerKey,
      ...ctx,
      detail: JSON.stringify({ consumerKey, provider: provider ?? '(auto)' }),
    });
    return this.resolveConsumer(consumerKey);
  }

  /* ─── 路由内部 helpers ─── */

  /** 取声明了某能力的所有行(不论是否可用),按优先级降序 */
  private async rowsForCapability(tag: AiCapability): Promise<ExternalApi[]> {
    // SQLite 无 array contains:先 LIKE 粗筛,再逗号精确二筛(防 'reasoning' 误命中 'chat')
    const candidates = await this.prisma.externalApi.findMany({
      where: { capabilities: { contains: tag } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
    return candidates.filter((r) => {
      const caps = (r.capabilities ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase());
      return caps.includes(tag);
    });
  }

  /** 资格:启用 + (有 key 或 内网自建可无 key) */
  private isEligible(r: ExternalApi): boolean {
    if (!r.active) return false;
    if (r.apiKey && r.apiKey.trim()) return true;
    return r.kind === 'internal';
  }

  /**
   * 某能力下实际会用的模型:
   *   vision → visionModel,空则兜底 model;
   *   image  → imageModel(**不兜底 model** —— 文本/视觉模型不能生图,空即视为该 provider 无生图能力);
   *   其它   → model。
   */
  private modelForCapability(r: ExternalApi, tag: AiCapability): string {
    if (tag === 'vision') return r.visionModel || r.model || '';
    if (tag === 'image') return r.imageModel || '';
    if (tag === '3d') return r.model3d || '';
    if (tag === 'tts') return r.ttsModel || '';
    return r.model || '';
  }

  private toActiveConfig(
    r: ExternalApi,
    tag: AiCapability,
  ): ActiveProviderConfig {
    return {
      provider: r.provider,
      apiKey: r.apiKey ?? '',
      apiUrl: r.apiUrl ?? '',
      model: this.modelForCapability(r, tag),
      voice: r.ttsVoice ?? undefined,
      kind: r.kind,
      source: 'db',
    };
  }

  /**
   * 解析某功能当前实际命中的 provider 行:
   *   - 有 pin 且 pin 在能力池内且可用 → 用 pin(mode='pinned')
   *   - 有 pin 但失效 → 回退 auto(mode='pinned' + warning 说明)
   *   - 无 pin → auto(mode='auto')
   */
  private async pickForConsumer(consumer: AiConsumer): Promise<{
    row: ExternalApi | null;
    mode: 'pinned' | 'auto';
    warning: string | null;
    rows: ExternalApi[];
  }> {
    const rows = await this.rowsForCapability(consumer.capability);
    const route = await this.prisma.aiRoute.findUnique({
      where: { consumerKey: consumer.key },
    });
    const pinned = route?.provider ?? null;
    const autoRow = rows.find((r) => this.isEligible(r)) ?? null;
    if (!pinned) {
      return { row: autoRow, mode: 'auto', warning: null, rows };
    }
    const inPool = rows.find((r) => r.provider === pinned);
    if (inPool && this.isEligible(inPool)) {
      return { row: inPool, mode: 'pinned', warning: null, rows };
    }
    // pin 失效 → 查清原因,回退 auto
    const anyRow =
      inPool ??
      (await this.prisma.externalApi.findUnique({
        where: { provider: pinned },
      }));
    const why = !anyRow
      ? `指定的平台「${pinned}」已删除`
      : !inPool
        ? `指定的「${anyRow.name}」已不具备${capabilityLabel(consumer.capability)}能力`
        : !anyRow.active
          ? `指定的「${anyRow.name}」已禁用`
          : `指定的「${anyRow.name}」未配置 Key`;
    return {
      row: autoRow,
      mode: 'pinned',
      warning: `${why},已临时回退到${autoRow ? `「${autoRow.name}」` : '——(无可用)'}`,
      rows,
    };
  }

  /**
   * 业务层入口 2:按 provider 精确取(老接口,仍保留)。
   * 顺序:DB.apiKey(且 active=true) → process.env → null
   */
  async getKeyForProvider(provider: string): Promise<{
    apiKey: string | null;
    apiUrl: string | null;
    model: string | null;
    source: 'db' | 'env' | 'none';
  }> {
    const row = await this.prisma.externalApi.findUnique({
      where: { provider },
    });
    if (row && row.active && row.apiKey) {
      return {
        apiKey: row.apiKey,
        apiUrl: row.apiUrl,
        model: row.model,
        source: 'db',
      };
    }
    const envKey = this.envFallback(provider);
    if (envKey) {
      return {
        apiKey: envKey,
        apiUrl: row?.apiUrl ?? null,
        model: row?.model ?? null,
        source: 'env',
      };
    }
    return { apiKey: null, apiUrl: row?.apiUrl ?? null, model: row?.model ?? null, source: 'none' };
  }

  async create(
    dto: CreateExternalApiDto,
    ctx: AuditCtx,
  ): Promise<ExternalApiPublic> {
    if (!/^[a-z0-9-]+$/.test(dto.provider)) {
      throw new BadRequestException(
        'provider 只能含小写字母/数字/横线(如 deepseek、sms-aliyun)',
      );
    }
    const exists = await this.prisma.externalApi.findUnique({
      where: { provider: dto.provider },
    });
    if (exists) throw new ConflictException(`provider=${dto.provider} 已存在`);
    const row = await this.prisma.externalApi.create({
      data: {
        provider: dto.provider,
        kind: dto.kind ?? 'cloud',
        iconRef: dto.iconRef ?? null,
        name: dto.name,
        description: dto.description,
        apiKey: dto.apiKey || null,
        apiUrl: dto.apiUrl,
        model: dto.model,
        visionModel: dto.visionModel,
        imageModel: dto.imageModel,
        model3d: dto.model3d,
        ttsModel: dto.ttsModel,
        ttsVoice: dto.ttsVoice,
        rechargeUrl: dto.rechargeUrl,
        priority: dto.priority ?? 50,
        capabilities: dto.capabilities ?? 'chat',
        active: dto.active ?? true,
        meta: dto.meta,
      },
    });
    await this.audit.log({
      action: 'api.create',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({
        provider: dto.provider,
        name: dto.name,
        hasKey: Boolean(dto.apiKey),
      }),
    });
    return toPublic(row, this.envHas(row.provider));
  }

  async update(
    provider: string,
    dto: UpdateExternalApiDto,
    ctx: AuditCtx,
  ): Promise<ExternalApiPublic> {
    const row = await this.prisma.externalApi.findUnique({
      where: { provider },
    });
    if (!row) throw new NotFoundException(`未找到 provider=${provider}`);

    // apiKey 处理:
    //   undefined → 保持原值
    //   ""        → 清空
    //   非空      → 更新
    const apiKeyUpdate =
      dto.apiKey === undefined
        ? undefined
        : dto.apiKey === ''
          ? null
          : dto.apiKey;

    const updated = await this.prisma.externalApi.update({
      where: { provider },
      data: {
        kind: dto.kind ?? undefined,
        iconRef:
          dto.iconRef === undefined ? undefined : dto.iconRef || null,
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        apiKey: apiKeyUpdate,
        apiUrl: dto.apiUrl ?? undefined,
        model: dto.model ?? undefined,
        visionModel: dto.visionModel ?? undefined,
        imageModel: dto.imageModel ?? undefined,
        model3d: dto.model3d ?? undefined,
        ttsModel: dto.ttsModel ?? undefined,
        ttsVoice: dto.ttsVoice ?? undefined,
        rechargeUrl: dto.rechargeUrl ?? undefined,
        priority: dto.priority ?? undefined,
        capabilities: dto.capabilities ?? undefined,
        active: dto.active ?? undefined,
        meta: dto.meta ?? undefined,
      },
    });

    await this.audit.log({
      action: 'api.update',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({
        provider,
        // apiKey 不入审计,只记 changed
        apiKeyChanged: dto.apiKey !== undefined,
        nameChanged: dto.name !== undefined,
        urlChanged: dto.apiUrl !== undefined,
        modelChanged: dto.model !== undefined,
        activeChanged: dto.active !== undefined,
      }),
    });
    return toPublic(updated, this.envHas(provider));
  }

  /**
   * 测试连接 — 发一条最小 chat completion 请求验证 key + endpoint + model。
   * 大多数国产 LLM (DeepSeek/Qwen/Doubao/Ernie) 都 OpenAI-compatible,统一接口可跑通。
   * dto 里传的 apiKey/apiUrl/model 会覆盖数据库值,便于编辑对话框「测试当前编辑值」。
   */
  async test(
    provider: string,
    dto: TestExternalApiDto,
    ctx: AuditCtx,
  ): Promise<ExternalApiTestResult> {
    const row = await this.prisma.externalApi.findUnique({ where: { provider } });
    if (!row) throw new NotFoundException(`未找到 provider=${provider}`);

    const apiKey =
      dto.apiKey || row.apiKey || this.envFallback(provider) || '';
    // 内网自建模型允许无 key(内网直连);云平台仍要求有 key
    if (!apiKey && row.kind !== 'internal') {
      return {
        ok: false,
        latencyMs: 0,
        message: '未设置 API Key — 请先填入或保存后再测',
      };
    }
    const apiUrl = (dto.apiUrl || row.apiUrl || '').replace(/\/+$/, '');
    if (!apiUrl) {
      return { ok: false, latencyMs: 0, message: '未设置 endpoint(apiUrl)' };
    }
    const model = dto.model || row.model || 'gpt-3.5-turbo';

    const started = Date.now();
    try {
      const resp = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'user', content: '请回复:OK' },
          ],
          max_tokens: 10,
          temperature: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            // 内网无 key 时不带 Authorization(否则空 Bearer 可能被网关拒)
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          timeout: 15000,
        },
      );
      const latencyMs = Date.now() - started;
      const reply = String(resp.data?.choices?.[0]?.message?.content ?? '').slice(0, 200);
      await this.audit.log({
        action: 'api.test',
        target: row.id,
        ...ctx,
        detail: JSON.stringify({ provider, ok: true, latencyMs, model }),
      });
      return {
        ok: true,
        latencyMs,
        message: reply || '响应为空但通了',
        model,
      };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const message =
        err.response?.data?.error?.message ??
        err.message ??
        '未知错误';
      await this.audit.log({
        action: 'api.test',
        target: row.id,
        ...ctx,
        detail: JSON.stringify({ provider, ok: false, latencyMs, message }),
      });
      return { ok: false, latencyMs, message, model };
    }
  }

  /**
   * 余额查询 — 仅个别 provider 实现:
   *   - deepseek: GET /user/balance(官方支持)
   *   - 其他:返回 status='not_supported'
   * 后续按需添加更多 provider 适配。
   */
  async queryBalance(provider: string): Promise<ExternalApiBalance> {
    const cfg = await this.getKeyForProvider(provider);
    if (!cfg.apiKey) {
      return {
        status: 'error',
        detail: '未配置 API Key,无法查询余额',
      };
    }
    const apiUrl = (cfg.apiUrl || '').replace(/\/+$/, '');

    try {
      if (provider === 'deepseek') {
        // 官方:GET https://api.deepseek.com/user/balance
        // 注意路径不带 v1。从 cfg.apiUrl(可能是 /v1)推根域名
        const base = apiUrl.replace(/\/v\d+$/, '') || 'https://api.deepseek.com';
        const resp = await axios.get(`${base}/user/balance`, {
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          timeout: 10000,
        });
        const data = resp.data as {
          is_available?: boolean;
          balance_infos?: Array<{
            currency: string;
            total_balance: string;
            granted_balance: string;
            topped_up_balance: string;
          }>;
        };
        const info = data.balance_infos?.[0];
        if (!info) {
          return { status: 'error', detail: '响应缺少 balance_infos', raw: data };
        }
        return {
          status: 'supported',
          balance: Number(info.total_balance),
          granted: Number(info.granted_balance),
          unit: info.currency,
          detail: data.is_available
            ? `可用 · 共充 ${info.topped_up_balance} ${info.currency}`
            : '账户暂不可用',
          raw: data,
        };
      }

      return {
        status: 'not_supported',
        detail: `${provider} 暂未实现余额查询适配。可点「去充值/管理」到平台控制台查看。`,
      };
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const message =
        err.response?.data?.error?.message ?? err.message ?? '未知错误';
      return { status: 'error', detail: message };
    }
  }

  async remove(provider: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const row = await this.prisma.externalApi.findUnique({
      where: { provider },
    });
    if (!row) throw new NotFoundException(`未找到 provider=${provider}`);
    await this.prisma.externalApi.delete({ where: { provider } });
    await this.audit.log({
      action: 'api.delete',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({ provider, name: row.name }),
    });
    return { ok: true };
  }

  /* ─── helpers ─── */

  private envFallback(provider: string): string | null {
    const envVar = ENV_FALLBACK_KEYS[provider];
    if (!envVar) return null;
    const val = this.config.get<string>(envVar);
    return val && val.trim() ? val : null;
  }

  private envHas(provider: string): boolean {
    return Boolean(this.envFallback(provider));
  }
}
