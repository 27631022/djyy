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
// pdf-parse v2.x 改成 class API(老 v1 是 fn 形态),且包用 type:module + exports map,
// 无法走子路径。通过 require('pdf-parse').PDFParse 拿 class(与证书提取一致)。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseMod = require('pdf-parse') as { PDFParse?: PdfParseCtor };
type PdfParseCtor = new (opts: { data: Buffer | Uint8Array }) => {
  getText(): Promise<{ text: string; total: number }>;
  destroy(): Promise<void>;
};
const PDFParse: PdfParseCtor = (() => {
  const C = pdfParseMod?.PDFParse;
  if (typeof C !== 'function') {
    throw new Error(
      'pdf-parse 加载失败:模块未导出 PDFParse class(需要 pdf-parse v2.x)',
    );
  }
  return C;
})();
import { AuditService } from '../audit';
import { ExternalApiService } from '../external-api';
import type {
  TaskExtractResponse,
  SuggestFieldsResponse,
} from './dto/extract-task.dto';
import type { TaskField, TaskFieldType } from './task-fields';
import { TASK_FIELD_TYPES } from './task-fields';

interface ExtractCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 填报字段设计规则(extract / suggest-fields 共用,保证两条路径产出一致) */
const FIELD_RULES = `fields 字段设计规则:
- 每个字段对象:{ "label":"显示名", "type":"类型", "required":true/false, "group":"分组名(可选)", "unit":"数字单位(可选,如 人/万元)" }
- type 只能用以下之一:text(单行文本)/textarea(多行文本)/number(数字)/date(日期)/file(文件)/image(图片)/richtext(在线富文本填写)/doclink(在线文档链接)。**绝对不要用下拉/select**。
- 示例:要求"上传通知扫描件"→ file;"报送党员合影/现场照片"→ image;"填写男党员数、女党员数"→ 两个 number,group 都填"党员数据",unit 填"人";"在线填写工作总结"→ richtext;"上交工作台账"→ file。
- 把同类数据项归到同一 group(如"党员数据"下放"男党员数""女党员数")。
- 不要包含 code 字段(系统自动生成)。若要求里看不出明确字段,给一个 file 类型"相关材料"即可。`;

/** 从通知文件提取整套任务信息 */
const EXTRACT_PROMPT = `你是一个任务派发系统的「通知文件解析助手」。用户上传一份工作通知 / 红头文件(Word/PDF 转出的纯文本),你要为一次「任务派发」提取结构化信息,供派发人确认后下发给下属单位 / 个人填报。全部输出中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):
{
 "title": "任务名称,提炼成简洁任务名,不要带『关于…的通知』等公文套话",
 "requirements": "填报要求:要报送什么内容、口径、格式、时间节点等,概括成几句话或分条(每条以『· 』开头)",
 "dueDate": "报送 / 上报截止日期,ISO 格式 YYYY-MM-DD,抽不到留空字符串",
 "fields": [ 按填报要求初步设计的填报字段数组,见下方规则 ],
 "scopeHint": "建议填报范围层级,只能填其一:level1(一级单位)/ level2(二级单位)/ level3(三级单位)/ level4;判断不出留空字符串",
 "suggestedUnits": ["从文件抬头 / 正文识别到的应填报单位名称数组,没有则空数组"]
}

` + FIELD_RULES;

/** 仅按填报要求文本生成字段 */
const FIELD_SUGGEST_PROMPT = `你是任务派发系统的「填报字段设计助手」。根据用户给的「填报要求」文字,设计一组用于下属填报的字段。全部输出中文。

输出严格 JSON(不要 markdown / 围栏 / 解释):{"fields":[ 字段数组 ]}

` + FIELD_RULES;

@Injectable()
export class TaskExtractionService {
  private readonly logger = new Logger(TaskExtractionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
  ) {}

  /**
   * 上传通知文件 → 转文本 → LLM → 任务草稿(标题/填报要求/截止/建议字段/建议范围)。
   */
  async extract(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    ctx: ExtractCtx,
  ): Promise<TaskExtractResponse> {
    const text = await this.parseDocument(file);
    if (!text || text.trim().length < 10) {
      throw new BadRequestException(
        '文件解析后内容过少,可能是扫描件 / 图片 PDF。请用可复制文本的 Word/PDF,或直接手动填写任务信息',
      );
    }

    const llm = await this.callLlm(
      EXTRACT_PROMPT,
      `文件名:${file.originalname}\n--- 文件正文 ---\n${text.slice(0, 20000)}`,
    );

    let parsed: {
      title?: string;
      requirements?: string;
      // 兼容旧字段名 description / notes
      description?: string;
      notes?: string;
      dueDate?: string;
      fields?: unknown;
      scopeHint?: string;
      suggestedUnits?: unknown;
    };
    try {
      parsed = JSON.parse(llm.raw);
    } catch {
      this.logger.warn(`LLM 返回非 JSON: ${llm.raw.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 返回格式异常,无法解析。请重试或手动填写任务信息',
      );
    }

    const requirements = String(
      parsed.requirements ?? parsed.notes ?? parsed.description ?? '',
    ).trim();

    const result: TaskExtractResponse = {
      title: String(parsed.title ?? '').trim(),
      requirements,
      dueDate: normalizeDate(String(parsed.dueDate ?? '')),
      fields: normalizeSuggestedFields(parsed.fields),
      scopeHint: normalizeScope(String(parsed.scopeHint ?? '')),
      suggestedUnits: normalizeStringList(parsed.suggestedUnits),
      source: {
        fileName: file.originalname,
        bytes: file.size,
        textLength: text.length,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        usedProvider: llm.provider,
        usedModel: llm.model,
      },
    };

    await this.audit.log({
      action: 'task.extract',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        fileName: file.originalname,
        bytes: file.size,
        title: result.title,
        dueDate: result.dueDate,
        fieldCount: result.fields.length,
        scopeHint: result.scopeHint,
        suggestedUnits: result.suggestedUnits,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        usedProvider: llm.provider,
        usedModel: llm.model,
      }),
    });

    return result;
  }

  /** 仅按填报要求文本生成填报字段(不读文件) */
  async suggestFields(
    requirements: string,
    title: string | undefined,
    ctx: ExtractCtx,
  ): Promise<SuggestFieldsResponse> {
    const req = (requirements || '').trim();
    if (req.length < 4) {
      throw new BadRequestException('填报要求太短,请先把要填报的内容写清楚再生成');
    }
    const llm = await this.callLlm(
      FIELD_SUGGEST_PROMPT,
      `${title ? `任务名称:${title}\n` : ''}填报要求:\n${req.slice(0, 8000)}`,
    );

    let parsed: { fields?: unknown };
    try {
      parsed = JSON.parse(llm.raw);
    } catch {
      throw new InternalServerErrorException('AI 返回格式异常,请重试');
    }
    const fields = normalizeSuggestedFields(parsed.fields);
    if (fields.length === 0) {
      throw new BadRequestException('未能从填报要求生成字段,请把要求写得更具体些');
    }

    await this.audit.log({
      action: 'task.suggest_fields',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        fieldCount: fields.length,
        usedProvider: llm.provider,
        usedModel: llm.model,
      }),
    });

    return {
      fields,
      source: {
        usedProvider: llm.provider,
        usedModel: llm.model,
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
      },
    };
  }

  /** 调 LLM(chat,JSON 模式)。两条路径共用。 */
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
    const cfg = await this.externalApi.getConfigForConsumer('task.extract.text');
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → 外部 API 接入」录入至少一个标了 chat 能力的模型(或在「模型路由」里给「任务派发 · AI 识别」绑定一个)。',
      );
    }
    const apiUrl =
      cfg.apiUrl ||
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com';
    const model =
      cfg.model || this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';
    const timeoutMs = Number(
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '110000',
    );
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
      const detail =
        err.response?.data?.error?.message ?? err.message ?? '未知错误';
      this.logger.error(`LLM (${cfg.provider}) 调用失败: ${detail}`);
      if (isTimeoutError(err)) {
        throw new ServiceUnavailableException(
          `${cfg.provider}(${model})超时(${Math.round(timeoutMs / 1000)}s)。建议在「系统设置 → 外部 API」把默认模型换成更快的版本(如 deepseek-v4-flash)。`,
        );
      }
      throw new ServiceUnavailableException(`${cfg.provider} 调用失败:${detail}`);
    }
  }

  /** 按 mime / 扩展名分发解析器(docx → mammoth,pdf → pdf-parse) */
  private async parseDocument(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<string> {
    const lower = file.originalname.toLowerCase();
    const mime = file.mimetype || '';

    if (
      mime.includes('wordprocessingml') ||
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      try {
        const r = await mammoth.extractRawText({ buffer: file.buffer });
        return r.value;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'docx 解析失败';
        throw new BadRequestException(`Word 文档解析失败:${msg}`);
      }
    }

    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const r = await parser.getText();
        return r.text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'pdf 解析失败';
        throw new BadRequestException(`PDF 解析失败:${msg}`);
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    if (lower.endsWith('.doc')) {
      throw new BadRequestException(
        '旧版 .doc 暂不支持,请用 Word 另存为 .docx 后再上传',
      );
    }

    throw new BadRequestException(
      `不支持的文件类型 ${mime || lower}。请用 .docx 或 .pdf`,
    );
  }
}

/* ─── 解析辅助 ─── */

function isTimeoutError(err: AxiosError): boolean {
  if (!err) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  if (err.name === 'CanceledError') return true;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout')) return true;
  if (msg.includes('aborted')) return true;
  return false;
}

/** 接受 "2024-06-15" / "2024年6月15日" / "2024.6.15" → "2024-06-15";抽不到为空串 */
function normalizeDate(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/(\d{4})[-年.](\d{1,2})[-月.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** scopeHint 规整:只接受 level1..level4,其余按关键词推断,推断不出留空 */
function normalizeScope(s: string): string {
  const v = s.trim().toLowerCase();
  if (/^level[1-4]$/.test(v)) return v;
  if (s.includes('一级')) return 'level1';
  if (s.includes('二级')) return 'level2';
  if (s.includes('三级')) return 'level3';
  if (s.includes('四级')) return 'level4';
  return '';
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0),
    ),
  ].slice(0, 50);
}

/**
 * 把 LLM 给的字段数组规整成干净 TaskField[](best-effort,不抛错):
 * - code 一律重新生成 field_1..(忽略 AI 给的 code)
 * - type 不合法 / 是 select → 退化为 text(避免下拉缺字典)
 * - label 缺失 → 跳过
 */
function normalizeSuggestedFields(input: unknown): TaskField[] {
  if (!Array.isArray(input)) return [];
  const out: TaskField[] = [];
  input.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const f = raw as Record<string, unknown>;
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    if (!label) return;
    let type = (typeof f.type === 'string' ? f.type.trim() : 'text') as TaskFieldType;
    if (!TASK_FIELD_TYPES.includes(type) || type === 'select') type = 'text';
    const field: TaskField = {
      code: `field_${out.length + 1}`,
      label,
      type,
      required: f.required === true,
      sortOrder: out.length,
    };
    const group = typeof f.group === 'string' ? f.group.trim() : '';
    if (group) {
      field.group = group;
      field.groupLabel = group;
    }
    if (type === 'number' && typeof f.unit === 'string' && f.unit.trim())
      field.unit = f.unit.trim();
    if (typeof f.placeholder === 'string' && f.placeholder.trim())
      field.placeholder = f.placeholder.trim();
    out.push(field);
  });
  return out.slice(0, 100);
}
