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
import { normalizeRoster, type Attendee } from './roster';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 排式会议厅布局参数(= 前端 VenueLayoutSpec) */
export interface VenueLayoutSpecResult {
  meetingName: string;
  attendeeCount: number;
  seatsPerRow: number;
  aisles: number;
  presidiumCount: number;
  podium: 'none' | 'left' | 'right';
  banner: boolean;
  backWall: boolean;
}

const LAYOUT_PROMPT = `你是会场布置助手。把用户对一场「排式会议厅」的描述,解析成结构化布局参数,供系统自动生成会场图。全部用中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):
{
 "meetingName": "会议名称(用于横幅);抽不到留空字符串",
 "attendeeCount": 台下参会人数(整数,不含主席台;抽不到给 0),
 "seatsPerRow": 每排座位数(整数;没说就按人数估个合理值,常见 10-20,默认 12),
 "aisles": 中间过道数(0/1/2;没说默认 1),
 "presidiumCount": 主席台/台上领导人数(整数;没有主席台给 0),
 "podium": 发言席("none"无 / "left"左 / "right"右;没说默认 "right"),
 "banner": 是否要顶部横幅(true/false;默认 true),
 "backWall": 是否要主席台背景墙(true/false;默认 true)
}

理解要点:
- "200人大会""参会200人" → attendeeCount=200。
- "主席台坐7位领导""台上7人" → presidiumCount=7。
- "要发言席/发言台" → podium 给 left 或 right(默认 right);"不要发言席" → none。
- "每排20个""一排坐20" → seatsPerRow=20。
- 数字抽不到就用上面默认值,不要编造过大的数。`;

const ROSTER_PROMPT = `你是会场排座助手。把用户粘贴的参会人员名单(可能从 Excel/Word/微信复制,列顺序任意、格式杂乱)解析成结构化 JSON。全部中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):
{"attendees":[{"name":"姓名","empNo":"工号(可空)","unit":"单位(可空)","position":"职务(可空)","score":评分数字(可空),"group":"分组/类别(可空)"}]}

规则:
- 每行通常一个人;自动判断每列是 姓名/单位/职务/评分/工号/分组,**不要求固定顺序**。
- 姓名:2-4 个汉字的人名。评分:0-100 之间的数字(可带小数);3 位以上的纯数字一般是工号,不是评分。
- 认不出的列忽略;没有的字段省略。不要编造内容。`;

/**
 * 会场 AI 助手:① 描述 → 排式布局参数(智能生成的「AI 帮填」)② 粘贴名单 → 结构化与会人。
 * 复用 task 已注册的 chat consumer('task.extract.text'),不侵入 external-api;
 * 真正的几何排布/排座仍由确定性算法完成。
 */
@Injectable()
export class VenueAiService {
  private readonly logger = new Logger(VenueAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
  ) {}

  async extractLayoutSpec(description: string, ctx: ActorContext): Promise<VenueLayoutSpecResult> {
    const desc = (description || '').trim();
    if (desc.length < 4) {
      throw new BadRequestException('描述太短,请把参会人数、主席台、发言席等说清楚');
    }
    const llm = await this.callLlm(LAYOUT_PROMPT, desc.slice(0, 2000));
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(llm.raw);
    } catch {
      this.logger.warn(`venue LLM 返回非 JSON: ${llm.raw.slice(0, 200)}`);
      throw new InternalServerErrorException('AI 返回格式异常,请重试或手动填写参数');
    }
    const result = normalizeSpec(parsed);
    await this.audit.log({
      ...ctx,
      action: 'venue.layout.extract',
      detail: { ...result, usedProvider: llm.provider, usedModel: llm.model },
    });
    return result;
  }

  async extractRoster(text: string, ctx: ActorContext): Promise<{ roster: Attendee[]; count: number }> {
    const t = (text || '').trim();
    if (t.length < 2) throw new BadRequestException('名单内容太短');
    const llm = await this.callLlm(ROSTER_PROMPT, t.slice(0, 12000));
    let parsed: { attendees?: unknown };
    try {
      parsed = JSON.parse(llm.raw);
    } catch {
      this.logger.warn(`venue roster LLM 返回非 JSON: ${llm.raw.slice(0, 200)}`);
      throw new InternalServerErrorException('AI 返回格式异常,请重试或改用「按列解析」');
    }
    const roster = normalizeRoster(Array.isArray(parsed.attendees) ? parsed.attendees : []);
    if (roster.length === 0) {
      throw new BadRequestException('没识别到人员,请检查粘贴内容,或改用「按列解析」');
    }
    await this.audit.log({
      ...ctx,
      action: 'venue.roster.extract',
      detail: { count: roster.length, usedProvider: llm.provider, usedModel: llm.model },
    });
    return { roster, count: roster.length };
  }

  /** 调 LLM(chat,JSON 模式)。extractLayoutSpec / extractRoster 共用。 */
  private async callLlm(
    systemPrompt: string,
    userContent: string,
  ): Promise<{ raw: string; provider: string; model: string }> {
    const cfg = await this.externalApi.getConfigForConsumer('task.extract.text');
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → 外部 API 接入」录入一个标了 chat 能力的模型后再用 AI 识别。',
      );
    }
    const apiUrl =
      cfg.apiUrl || this.config.get<string>('DEEPSEEK_API_URL') || 'https://api.deepseek.com';
    const model =
      cfg.model || this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';
    const timeoutMs = Number(this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '60000');
    try {
      const resp = await axios.post(
        `${apiUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.1,
        },
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
      this.logger.error(`venue LLM 调用失败: ${detail}`);
      throw new ServiceUnavailableException(`AI 调用失败:${detail}`);
    }
  }
}

/* ─── 布局参数规整 ─── */

function toInt(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toBool(v: unknown, dflt: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', '是', '要', 'y', 'yes'].includes(s)) return true;
    if (['false', '0', '否', '不', 'n', 'no'].includes(s)) return false;
  }
  return dflt;
}

function normalizeSpec(p: Record<string, unknown>): VenueLayoutSpecResult {
  const podiumRaw = String(p.podium ?? '').trim().toLowerCase();
  const podium: 'none' | 'left' | 'right' =
    podiumRaw === 'none' ? 'none' : podiumRaw === 'left' ? 'left' : 'right';
  return {
    meetingName: typeof p.meetingName === 'string' ? p.meetingName.trim().slice(0, 60) : '',
    attendeeCount: toInt(p.attendeeCount, 0, 0, 5000),
    seatsPerRow: toInt(p.seatsPerRow, 12, 1, 60),
    aisles: toInt(p.aisles, 1, 0, 2),
    presidiumCount: toInt(p.presidiumCount, 0, 0, 50),
    podium,
    banner: toBool(p.banner, true),
    backWall: toBool(p.backWall, true),
  };
}
