import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import mammoth from 'mammoth';
// pdf-parse v2.x:class API,经 require 拿 PDFParse(与 task/certificate 提取一致)。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseMod = require('pdf-parse') as { PDFParse?: PdfParseCtor };
type PdfParseCtor = new (opts: { data: Buffer | Uint8Array }) => {
  getText(): Promise<{ text: string; total: number }>;
  destroy(): Promise<void>;
};
const PDFParse: PdfParseCtor = (() => {
  const C = pdfParseMod?.PDFParse;
  if (typeof C !== 'function') {
    throw new Error('pdf-parse 加载失败:模块未导出 PDFParse class(需 pdf-parse v2.x)');
  }
  return C;
})();
import { AuditService } from '../audit';
import { ExternalApiService } from '../external-api';
import { PromptService } from '../prompt';
import {
  INDICATOR_KINDS,
  type IndicatorKind,
  type IndicatorNode,
} from './indicator-tree';
import { getDataSourceSpec } from './data-sources';
import { getScoringSpec, isInputCompatible } from './scoring-strategies';

interface ExtractCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

export interface ExtractIndicatorsResult {
  indicators: IndicatorNode[];
  source: {
    fileName: string;
    bytes: number;
    textLength: number;
    leafCount: number;
    usedProvider: string;
    usedModel: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}

/**
 * 「AI 生成考核指标」—— 预留接口(P1.5)。
 * 上传考核办法 / 责任制文件(Word/PDF)→ 转文本 → LLM → 指标树草稿
 * (每个末端指标已选好数据源 + 计分工具 + 参数;非法组合归一化回退 dept_fill+manual)。
 * 返回不落库,前端应用到设计器作一次可撤销操作,人工确认后再保存。
 * 提示词在 prompt 模块(key=assessment.generate_indicators),模型路由 key=assessment.indicators.extract.text。
 */
@Injectable()
export class AssessmentExtractionService {
  private readonly logger = new Logger(AssessmentExtractionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
    private readonly prompts: PromptService,
  ) {}

  async extractIndicators(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    ctx: ExtractCtx,
  ): Promise<ExtractIndicatorsResult> {
    const text = await this.parseDocument(file);
    if (!text || text.trim().length < 10) {
      throw new BadRequestException(
        '文件解析后内容过少,可能是扫描件 / 图片 PDF。请用可复制文本的 Word/PDF,或直接手动搭建指标。',
      );
    }

    const llm = await this.callLlm(
      await this.prompts.get('assessment.generate_indicators'),
      `文件名:${file.originalname}\n--- 考核办法正文 ---\n${text.slice(0, 24000)}`,
    );

    let parsed: { indicators?: unknown };
    try {
      parsed = JSON.parse(llm.raw);
    } catch {
      this.logger.warn(`LLM 返回非 JSON: ${llm.raw.slice(0, 200)}`);
      throw new InternalServerErrorException('AI 返回格式异常,无法解析。请重试或手动搭建指标。');
    }

    const indicators = normalizeExtractedIndicators(parsed.indicators);
    if (indicators.length === 0) {
      throw new BadRequestException('未能从文件生成指标,请确认是考核办法/细则,或手动搭建。');
    }
    const leafCount = countLeaves(indicators);

    await this.audit.log({
      action: 'assessment.extract_indicators',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        fileName: file.originalname,
        bytes: file.size,
        topCount: indicators.length,
        leafCount,
        usedProvider: llm.provider,
        usedModel: llm.model,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
      }),
    });

    return {
      indicators,
      source: {
        fileName: file.originalname,
        bytes: file.size,
        textLength: text.length,
        leafCount,
        usedProvider: llm.provider,
        usedModel: llm.model,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
      },
    };
  }

  /** 调 LLM(chat,JSON 模式)。模型路由 consumer=assessment.indicators.extract.text。 */
  private async callLlm(
    systemPrompt: string,
    userContent: string,
  ): Promise<{
    raw: string;
    promptTokens?: number;
    completionTokens?: number;
    provider: string;
    model: string;
  }> {
    const cfg = await this.externalApi.getConfigForConsumer('assessment.indicators.extract.text');
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → 外部 API 接入」录入至少一个标了 chat 能力的模型(或在「模型路由」里给「考核管理 · AI 生成指标」绑定一个)。',
      );
    }
    const apiUrl =
      cfg.apiUrl || this.config.get<string>('DEEPSEEK_API_URL') || 'https://api.deepseek.com';
    const model =
      cfg.model || this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';
    const timeoutMs = Number(this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '110000');
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
        promptTokens: resp.data?.usage?.prompt_tokens,
        completionTokens: resp.data?.usage?.completion_tokens,
        provider: cfg.provider,
        model,
      };
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const detail = err.response?.data?.error?.message ?? err.message ?? '未知错误';
      this.logger.error(`LLM (${cfg.provider}) 调用失败: ${detail}`);
      if (isTimeoutError(err)) {
        throw new ServiceUnavailableException(
          `${cfg.provider}(${model})超时(${Math.round(timeoutMs / 1000)}s)。建议在「系统设置 → 外部 API」换成更快的模型(如 deepseek-v4-flash)。`,
        );
      }
      throw new ServiceUnavailableException(`${cfg.provider} 调用失败:${detail}`);
    }
  }

  /** docx → mammoth,pdf → pdf-parse。 */
  private async parseDocument(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<string> {
    const lower = file.originalname.toLowerCase();
    const mime = file.mimetype || '';
    if (
      mime.includes('wordprocessingml') ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      try {
        const r = await mammoth.extractRawText({ buffer: file.buffer });
        return r.value;
      } catch (e) {
        throw new BadRequestException(
          `Word 文档解析失败:${e instanceof Error ? e.message : 'docx 解析失败'}`,
        );
      }
    }
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const r = await parser.getText();
        return r.text;
      } catch (e) {
        throw new BadRequestException(
          `PDF 解析失败:${e instanceof Error ? e.message : 'pdf 解析失败'}`,
        );
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    if (lower.endsWith('.doc')) {
      throw new BadRequestException('旧版 .doc 暂不支持,请用 Word 另存为 .docx 后再上传');
    }
    throw new BadRequestException(`不支持的文件类型 ${mime || lower}。请用 .docx 或 .pdf`);
  }
}

/* ─── 解析辅助 ─── */

function isTimeoutError(err: AxiosError): boolean {
  if (!err) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  if (err.name === 'CanceledError') return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('aborted');
}

function countLeaves(tree: IndicatorNode[]): number {
  let n = 0;
  for (const x of tree) {
    if (!x.children || x.children.length === 0) n += 1;
    else n += countLeaves(x.children);
  }
  return n;
}

/**
 * 把 LLM 给的指标数组规整成干净 IndicatorNode[](best-effort,不抛错):
 * - code 自动生成 n1..(忽略 AI 给的);label 缺失跳过;weight 非数字归 0
 * - kind 只第一层取,下级继承(setKindDeep 范式)
 * - 末端指标:dataSource/scoringType 用注册表校验,非法 / 不兼容 → 回退 dept_fill + manual;参数 normalizeParams
 */
function normalizeExtractedIndicators(raw: unknown): IndicatorNode[] {
  if (!Array.isArray(raw)) return [];
  let counter = 0;
  const nextCode = () => `n${++counter}`;

  const applyLeafDefaults = (node: IndicatorNode, o: Record<string, unknown>) => {
    let dataSource = typeof o.dataSource === 'string' ? o.dataSource.trim() : '';
    let scoringType = typeof o.scoringType === 'string' ? o.scoringType.trim() : '';
    let ds = getDataSourceSpec(dataSource);
    if (!ds) {
      dataSource = 'dept_fill';
      ds = getDataSourceSpec('dept_fill');
    }
    let ss = getScoringSpec(scoringType);
    if (!ss) {
      scoringType = 'manual';
      ss = getScoringSpec('manual');
    }
    if (ds && ss && !isInputCompatible(ss.inputType, ds.outputType)) {
      dataSource = 'dept_fill';
      scoringType = 'manual';
      ss = getScoringSpec('manual');
    }
    node.dataSource = dataSource || 'dept_fill';
    node.scoringType = scoringType || 'manual';
    const params =
      o.strategyParams && typeof o.strategyParams === 'object'
        ? (o.strategyParams as Record<string, unknown>)
        : {};
    if (ss) {
      try {
        node.strategyParams = ss.normalizeParams(params);
      } catch {
        node.strategyParams = ss.normalizeParams({});
      }
    }
    if (typeof o.rubric === 'string' && o.rubric.trim()) node.rubric = o.rubric.trim();
  };

  const walk = (
    nodes: unknown[],
    depth: number,
    inheritedKind: IndicatorKind | null,
  ): IndicatorNode[] => {
    if (depth > 5) return [];
    const out: IndicatorNode[] = [];
    for (const item of nodes) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label) continue;
      const kind: IndicatorKind =
        inheritedKind ??
        (INDICATOR_KINDS.includes(o.kind as IndicatorKind) ? (o.kind as IndicatorKind) : 'normal');
      const weight = typeof o.weight === 'number' && Number.isFinite(o.weight) ? o.weight : 0;
      const node: IndicatorNode = { code: nextCode(), label, weight, kind };

      const rawChildren = Array.isArray(o.children) ? o.children : [];
      if (rawChildren.length > 0) {
        const kids = walk(rawChildren, depth + 1, kind);
        if (kids.length > 0) {
          node.children = kids;
          out.push(node);
          continue;
        }
      }
      // 末端:配数据源 + 计分工具
      applyLeafDefaults(node, o);
      out.push(node);
    }
    return out;
  };

  return walk(raw, 1, null);
}
