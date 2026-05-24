import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExternalApi } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import {
  CreateExternalApiDto,
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
  active: boolean;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
  /** key 是否由 .env 提供(DB 没配但 .env 有时显示这个) */
  envFallback: boolean;
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
   * 业务层用 — 拿真实 key 调外部 API。
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
