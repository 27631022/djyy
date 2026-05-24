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

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 列表/详情 API 响应:apiKey 已脱敏 */
export interface ExternalApiPublic {
  id: string;
  provider: string;
  name: string;
  description: string | null;
  /** 已脱敏:sk-1234***********abcd 或 ✓已配置(过短)或 null(未配置) */
  apiKeyMasked: string | null;
  /** 是否配置了 key(前端 UI 显示用) */
  hasKey: boolean;
  apiUrl: string | null;
  model: string | null;
  visionModel: string | null;
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
  apiKey: string;
  apiUrl: string;
  model: string;
  source: 'db';
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
    name: row.name,
    description: row.description,
    apiKeyMasked: masked,
    hasKey,
    apiUrl: row.apiUrl,
    model: row.model,
    visionModel: row.visionModel,
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
    tag: 'chat' | 'vision' | 'reasoning',
  ): Promise<ActiveProviderConfig | null> {
    // SQLite 没有 array contains,改用 LIKE %tag% 过滤
    const candidates = await this.prisma.externalApi.findMany({
      where: {
        active: true,
        apiKey: { not: null },
        capabilities: { contains: tag },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
    // capabilities 是逗号分隔,需要二次过滤防误中(比如 'reasoning' 不能命中 'chat')
    const row = candidates.find((r) => {
      const caps = (r.capabilities ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase());
      return caps.includes(tag);
    });
    if (!row || !row.apiKey) return null;
    const model =
      (tag === 'vision' ? row.visionModel : row.model) ||
      row.model ||
      '';
    return {
      provider: row.provider,
      apiKey: row.apiKey,
      apiUrl: row.apiUrl ?? '',
      model,
      source: 'db',
    };
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
        name: dto.name,
        description: dto.description,
        apiKey: dto.apiKey || null,
        apiUrl: dto.apiUrl,
        model: dto.model,
        visionModel: dto.visionModel,
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
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        apiKey: apiKeyUpdate,
        apiUrl: dto.apiUrl ?? undefined,
        model: dto.model ?? undefined,
        visionModel: dto.visionModel ?? undefined,
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

    const apiKey = dto.apiKey || row.apiKey || this.envFallback(provider);
    if (!apiKey) {
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
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
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
