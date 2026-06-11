import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { AuditService } from '../audit';
import { ExternalApiService } from '../external-api';
import { PromptService } from '../prompt';
import { StorageService } from '../storage';
import {
  FIXTURE_TYPES,
  type Fixture,
  type FixtureType,
  type HallMeta,
  type HallThemePreset,
  type Wall,
} from './exhibition.types';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

export interface GenerateHallInput {
  description?: string;
  /** 参考图(storage fileId,ownerModule=exhibition;有图走 vision 模型) */
  imageFileId?: string;
  widthM?: number;
  depthM?: number;
  preset?: string; // modern_light | party_red | dark_tech
  /** 功能点选:荣誉展示 / 视频展播 / 产品模型 / 图片展廊 / 党建文化 等 */
  features?: string[];
}

export interface GeneratedHall {
  name: string;
  meta: HallMeta;
  walls: Wall[];
  fixtures: Fixture[];
}

/**
 * AI 生成展厅布置:文字描述 + 选项 +(可选)参考图 → 平面 JSON(墙体/组件/主题)。
 * 提示词经 PromptService('exhibition.generate')可后台调;返回结果**强归一化**
 * (类型白名单 / 坐标钳制 / id 重排 / content 兜底),不直接落库 —— 由前端
 * 应用进搭建器(可撤销),用户确认后照常保存。
 */
@Injectable()
export class ExhibitionAiService {
  private readonly logger = new Logger(ExhibitionAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
    private readonly prompts: PromptService,
    private readonly storage: StorageService,
  ) {}

  async generate(input: GenerateHallInput, ctx: ActorContext): Promise<GeneratedHall> {
    const desc = (input.description ?? '').trim();
    const hasOptions = !!(input.widthM || input.preset || input.features?.length);
    if (desc.length < 2 && !hasOptions && !input.imageFileId) {
      throw new BadRequestException('请至少给一段描述、选几个选项,或上传一张参考图');
    }

    const userLines: string[] = [];
    if (input.widthM && input.depthM) userLines.push(`展厅尺寸:约 ${input.widthM}×${input.depthM} 米`);
    if (input.preset) userLines.push(`主题色调:${input.preset}`);
    if (input.features?.length) userLines.push(`需要的功能:${input.features.join('、')}`);
    if (desc) userLines.push(`描述:${desc.slice(0, 2000)}`);
    if (input.imageFileId) userLines.push('(附参考图,请结合图片的空间感与风格布置)');
    const userText = userLines.join('\n') || '请生成一个通用的企业文化展厅。';

    const systemPrompt = await this.prompts.get('exhibition.generate');
    const llm = input.imageFileId
      ? await this.callVision(systemPrompt, userText, input.imageFileId)
      : await this.callChat(systemPrompt, userText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stripFence(llm.raw)) as Record<string, unknown>;
    } catch {
      this.logger.warn(`exhibition LLM 返回非 JSON: ${llm.raw.slice(0, 200)}`);
      throw new InternalServerErrorException('AI 返回格式异常,请重试或换种描述');
    }
    const result = normalizeGeneratedHall(parsed);
    if (result.walls.length < 3) {
      throw new InternalServerErrorException('AI 生成的空间不完整(墙体过少),请重试');
    }
    await this.audit.log({
      ...ctx,
      action: 'exhibition.hall.ai-generate',
      detail: {
        walls: result.walls.length,
        fixtures: result.fixtures.length,
        usedProvider: llm.provider,
        usedModel: llm.model,
        withImage: !!input.imageFileId,
      },
    });
    return result;
  }

  /* ── LLM 调用 ── */

  private async callChat(systemPrompt: string, userText: string) {
    const cfg = await this.externalApi.getConfigForConsumer('exhibition.generate.text');
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「外部 API 接入」录入标了 chat 能力的模型',
      );
    }
    return this.postChat(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ]);
  }

  private async callVision(systemPrompt: string, userText: string, imageFileId: string) {
    const cfg = await this.externalApi.getConfigForConsumer('exhibition.generate.vision');
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置 vision 模型:请到「外部 API 接入」录入多模态模型,或去掉参考图改用文字描述',
      );
    }
    const dataUrl = await this.fileToDataUrl(imageFileId);
    return this.postChat(cfg, [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ]);
  }

  private async fileToDataUrl(fileId: string): Promise<string> {
    const meta = await this.storage.getMeta(fileId);
    if (!meta.mimeType.startsWith('image/')) {
      throw new BadRequestException('参考文件不是图片');
    }
    const { stream } = await this.storage.getStream(fileId);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const buf = Buffer.concat(chunks);
    if (buf.length > 8 * 1024 * 1024) throw new BadRequestException('参考图过大(>8MB),请压缩后再传');
    return `data:${meta.mimeType};base64,${buf.toString('base64')}`;
  }

  private async postChat(
    cfg: { apiUrl?: string | null; apiKey?: string | null; model?: string | null; visionModel?: string | null; provider: string },
    messages: unknown[],
  ): Promise<{ raw: string; provider: string; model: string }> {
    const apiUrl =
      cfg.apiUrl || this.config.get<string>('DEEPSEEK_API_URL') || 'https://api.deepseek.com';
    const model =
      cfg.model || this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';
    const timeoutMs = Number(this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '90000');
    try {
      const resp = await axios.post(
        `${apiUrl.replace(/\/+$/, '')}/chat/completions`,
        { model, response_format: { type: 'json_object' }, messages, temperature: 0.3 },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          timeout: timeoutMs,
        },
      );
      return {
        raw: String(resp.data?.choices?.[0]?.message?.content ?? ''),
        provider: cfg.provider,
        model,
      };
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const detail = err.response?.data?.error?.message ?? err.message ?? '未知错误';
      this.logger.error(`exhibition LLM 调用失败: ${detail}`);
      throw new ServiceUnavailableException(`AI 调用失败:${detail}`);
    }
  }
}

/* ─── 归一化(LLM 几何不可信,这里兜底) ─── */

function stripFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

function num(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

const TYPE_SET = new Set<string>(FIXTURE_TYPES);
const PRESETS = new Set(['modern_light', 'party_red', 'dark_tech', 'future_tech']);

function defaultContent(type: FixtureType, raw: unknown): unknown {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  switch (type) {
    case 'image_case':
      return { images: Array.isArray(c.images) ? [] : [] };
    case 'honor_wall':
    case 'notice_board':
      return { items: [] };
    case 'text_3d':
      return {
        text: typeof c.text === 'string' ? c.text.slice(0, 40) : '展厅标语',
        sizeM: num(c.sizeM, 0.6, 0.15, 2),
        depthM: num(c.depthM, 0.12, 0.02, 0.5),
        finish: ['paint', 'metal', 'glow'].includes(String(c.finish)) ? c.finish : 'paint',
        mount: ['floor', 'wall', 'flat'].includes(String(c.mount)) ? c.mount : 'wall',
      };
    case 'decor':
      return { kind: ['plant', 'plant_short', 'bench', 'arrow'].includes(String(c.kind)) ? c.kind : 'plant' };
    case 'ceiling_sign':
      return { text: typeof c.text === 'string' ? c.text.slice(0, 20) : '展区' };
    default:
      return {};
  }
}

function normalizeGeneratedHall(p: Record<string, unknown>): GeneratedHall {
  const rawWalls = Array.isArray(p.walls) ? p.walls : [];
  const walls: Wall[] = [];
  rawWalls.slice(0, 16).forEach((w, i) => {
    const o = (w ?? {}) as Record<string, unknown>;
    const x1 = num(o.x1, NaN, -60, 60);
    const y1 = num(o.y1, NaN, -60, 60);
    const x2 = num(o.x2, NaN, -60, 60);
    const y2 = num(o.y2, NaN, -60, 60);
    if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) return;
    if (Math.hypot(x2 - x1, y2 - y1) < 0.3) return;
    walls.push({ id: `w${i + 1}`, x1, y1, x2, y2 });
  });

  const rawFx = Array.isArray(p.fixtures) ? p.fixtures : [];
  const fixtures: Fixture[] = [];
  rawFx.slice(0, 24).forEach((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const type = String(o.type ?? '');
    if (!TYPE_SET.has(type)) return;
    const t = type as FixtureType;
    const src = (o.source ?? {}) as Record<string, unknown>;
    fixtures.push({
      id: `fx${i + 1}`,
      type: t,
      x: num(o.x, 0, -60, 60),
      y: num(o.y, 0, -60, 60),
      rot: ((Math.round(num(o.rot, 0, -360, 720)) % 360) + 360) % 360,
      w: num(o.w, 1, 0.2, 30),
      d: num(o.d, 0.5, 0.1, 20),
      label: typeof o.label === 'string' ? o.label.slice(0, 30) : undefined,
      source: { mode: 'manual', content: defaultContent(t, src.content) },
    });
  });

  const m = (p.meta ?? {}) as Record<string, unknown>;
  const theme = (m.theme ?? {}) as Record<string, unknown>;
  const spawnRaw = (m.spawn ?? {}) as Record<string, unknown>;
  const meta: HallMeta = {
    gridM: 0.5,
    wallH: num(m.wallH, 4.2, 2.8, 8),
    theme: {
      preset: (PRESETS.has(String(theme.preset)) ? String(theme.preset) : 'modern_light') as HallThemePreset,
      accent: /^#[0-9a-fA-F]{6}$/.test(String(theme.accent ?? '')) ? String(theme.accent) : '#C8001E',
    },
    spawn: {
      x: num(spawnRaw.x, 0, -60, 60),
      y: num(spawnRaw.y, 0, -60, 60),
      rot: ((Math.round(num(spawnRaw.rot, 0, -360, 720)) % 360) + 360) % 360,
    },
  };

  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : 'AI 生成展厅',
    meta,
    walls,
    fixtures,
  };
}
