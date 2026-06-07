import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { AI_PROMPTS, AI_PROMPT_MAP } from './ai-prompts';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

export interface PromptView {
  key: string;
  label: string;
  app: string;
  description: string;
  /** 代码里的默认值(用于「恢复默认」对比) */
  default: string;
  /** 当前生效全文(覆盖优先,回退默认) */
  content: string;
  /** 是否被后台改过(有覆盖行) */
  overridden: boolean;
  updatedAt: Date | null;
}

/**
 * AI 提示词解析 + 管理。
 * 默认值在 `ai-prompts.ts` 注册表;后台改的覆盖值存 `AiPrompt` 表。
 * 业务代码只调 `get(key)` 拿当前生效全文(覆盖优先、回退默认)。
 */
@Injectable()
export class PromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 取某提示词当前生效全文(覆盖优先,回退注册表默认)。未知 key 抛错。 */
  async get(key: string): Promise<string> {
    const def = AI_PROMPT_MAP.get(key);
    if (!def) throw new BadRequestException(`未知提示词 key: ${key}`);
    const row = await this.prisma.aiPrompt.findUnique({ where: { key } });
    if (row && row.content.trim().length > 0) return row.content;
    return def.default;
  }

  /** 列全部受管提示词(默认 + 覆盖状态)供管理页。 */
  async list(): Promise<PromptView[]> {
    const rows = await this.prisma.aiPrompt.findMany();
    const map = new Map(rows.map((r) => [r.key, r] as const));
    return AI_PROMPTS.map((def) => {
      const row = map.get(def.key);
      const overridden = !!row && row.content.trim().length > 0;
      return {
        key: def.key,
        label: def.label,
        app: def.app,
        description: def.description,
        default: def.default,
        content: overridden && row ? row.content : def.default,
        overridden,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /** 覆盖某提示词(upsert)。 */
  async update(key: string, content: string, actor: ActorCtx): Promise<PromptView> {
    if (!AI_PROMPT_MAP.has(key)) throw new BadRequestException(`未知提示词 key: ${key}`);
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('提示词内容不能为空(要还原默认请用「恢复默认」)');
    }
    await this.prisma.aiPrompt.upsert({
      where: { key },
      create: { key, content: trimmed, updatedById: actor.actorId },
      update: { content: trimmed, updatedById: actor.actorId },
    });
    await this.audit.log({
      action: 'prompt.update',
      target: key,
      ...actor,
      detail: JSON.stringify({ key, len: trimmed.length }),
    });
    return this.one(key);
  }

  /** 还原默认(删覆盖行;无行也幂等)。 */
  async reset(key: string, actor: ActorCtx): Promise<PromptView> {
    if (!AI_PROMPT_MAP.has(key)) throw new BadRequestException(`未知提示词 key: ${key}`);
    await this.prisma.aiPrompt.deleteMany({ where: { key } });
    await this.audit.log({
      action: 'prompt.reset',
      target: key,
      ...actor,
      detail: JSON.stringify({ key }),
    });
    return this.one(key);
  }

  private async one(key: string): Promise<PromptView> {
    const all = await this.list();
    const found = all.find((p) => p.key === key);
    if (!found) throw new BadRequestException(`未知提示词 key: ${key}`);
    return found;
  }
}
