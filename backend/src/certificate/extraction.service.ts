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
// pdf-parse v2.x 改成 class API(老 v1 是 fn 形态),且包用 type:module
// + exports map,无法走 `pdf-parse/lib/...` 子路径。
// 通过 require('pdf-parse').PDFParse 拿 class。
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
  ExtractHonorResponse,
  ExtractedHonor,
  ExtractedRecipient,
} from './dto/extract-honor.dto';

interface ExtractCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 提示 DeepSeek 返回结构化 JSON 的 system prompt */
const SYSTEM_PROMPT = `你是一个证书管理系统的「荣誉表彰文件解析助手」。用户上传表彰文件原文(Word/PDF 转出的纯文本),你的任务是从中提取结构化信息。

关键能力:**一份文件可能包含多种荣誉**(如"两优一先"通常包含"优秀共产党员"、"优秀党务工作者"、"先进基层党组织"三类)。务必识别为多个 honor 项,不要合并成一项。

提取要点:
1. honors:荣誉项数组,每项含:
   - honorName:荣誉名称(如"优秀共产党员",不要带年份前缀)
   - honorType:荣誉类型,严格三选一:
     · "individual" — 个人荣誉(优秀共产党员、优秀党务工作者、先进个人 等)
     · "collective" — 集体荣誉(青年突击队、巾帼建功示范岗、某某小组 等)
     · "unit"       — 单位荣誉(先进基层党组织、文明单位、五好家庭 等)
     如无法明确判断,默认 "individual"
   - issuingOrg:该荣誉的颁发机构,如"中共 XX 委员会"(找不到留空字符串)
   - recipients:对应受表彰对象/单位的数组,每项含 name(必填)/ empNo(可选)/ dept(可选)
     · honorType=unit 或 collective 时,把 name 填成单位/集体名,empNo/dept 留空
2. yearLabel:整个文件级别的年份,"2024" 或 "2024-2025"。抽不到留空
3. issueDate:整个文件的颁发/落款日期,ISO 格式 YYYY-MM-DD,抽不到留空

输出严格 JSON,不要 markdown / 围栏 / 解释:
{"honors":[{"honorName":"...","honorType":"individual","issuingOrg":"...","recipients":[{"name":"..."}]}],"yearLabel":"...","issueDate":"..."}`;

@Injectable()
export class CertificateExtractionService {
  private readonly logger = new Logger(CertificateExtractionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
  ) {}

  /**
   * 把上传文件转文本 → 调 DeepSeek → 解析返回。
   *
   * 单步流程,30s 超时(可由 DEEPSEEK_TIMEOUT_MS 配置)。
   * 失败时抛带可读信息的 HTTP 异常,前端能直接 toast 出来。
   */
  async extract(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    ctx: ExtractCtx,
  ): Promise<ExtractHonorResponse> {
    // 图片走 vision 路径,Word/PDF 走文本路径
    if (file.mimetype.startsWith('image/')) {
      return this.extractFromImage(file, ctx);
    }

    // —— 文本路径 ——
    const cfg = await this.externalApi.getActiveLLM();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → 外部 API 接入」录入至少一个 LLM 的 API Key(标 chat 能力)。',
      );
    }
    const apiKey = cfg.apiKey;

    // 1. 解析文档 → 纯文本
    const text = await this.parseDocument(file);
    if (!text || text.trim().length < 10) {
      throw new BadRequestException(
        '文件解析后内容过少,可能是扫描件 / 图片 PDF。请用可复制文本的 Word/PDF,或换「拍照录入」走 OCR',
      );
    }

    const truncated = text.slice(0, 20000);

    const apiUrl =
      cfg.apiUrl ||
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com';
    const model =
      cfg.model ||
      this.config.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-v4-flash';
    // 默认 110s — DeepSeek thinking 模式 + 大 PDF 可以跑 30-90s。
    // 前端 axios 对 extract 给了 120s,这里留 10s 缓冲。
    // 可通过 .env DEEPSEEK_TIMEOUT_MS 覆盖。
    const timeoutMs = Number(
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '110000',
    );

    let raw: string;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    try {
      const resp = await axios.post(
        `${apiUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `文件名:${file.originalname}\n--- 文件正文 ---\n${truncated}`,
            },
          ],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        },
      );
      raw = String(resp.data?.choices?.[0]?.message?.content ?? '');
      promptTokens = resp.data?.usage?.prompt_tokens;
      completionTokens = resp.data?.usage?.completion_tokens;
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const detail =
        err.response?.data?.error?.message ??
        err.message ??
        '未知错误';
      this.logger.error(`LLM (${cfg.provider}) 调用失败: ${detail}`);
      if (isTimeoutError(err)) {
        throw new ServiceUnavailableException(
          `${cfg.provider}(${model})超时(${Math.round(timeoutMs / 1000)}s)。常见原因:模型选了带 thinking 的版本(如 deepseek-v4-pro)+ 大文件。建议:在「系统设置 → 外部 API」把 DeepSeek 默认模型换成 deepseek-v4-flash。`,
        );
      }
      throw new ServiceUnavailableException(`${cfg.provider} 调用失败:${detail}`);
    }

    // 3. 解析 JSON
    let parsed: {
      honors?: unknown;
      // 兼容旧形态:单 honor 字段(若 model 没听清新 prompt 仍能 fallback)
      honorName?: string;
      recipients?: unknown;
      yearLabel?: string;
      issueDate?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`DeepSeek 返回非 JSON: ${raw.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 返回格式异常,无法解析。请重试或人工补填表单',
      );
    }

    // 兼容旧形态(早期单 honor)+ 新形态(多 honor)
    let honors: ExtractedHonor[];
    if (Array.isArray(parsed.honors)) {
      honors = normalizeHonors(parsed.honors);
    } else if (parsed.honorName !== undefined || parsed.recipients !== undefined) {
      const fbName = String(parsed.honorName ?? '').trim();
      honors = [
        {
          honorName: fbName,
          honorType: normalizeHonorType(undefined, fbName),
          recipients: normalizeRecipients(parsed.recipients),
        },
      ];
    } else {
      honors = [];
    }

    const result: ExtractHonorResponse = {
      honors,
      yearLabel: normalizeYearLabel(String(parsed.yearLabel ?? '')),
      issueDate: normalizeIssueDate(String(parsed.issueDate ?? '')),
      source: {
        fileName: file.originalname,
        bytes: file.size,
        textLength: text.length,
        promptTokens,
        completionTokens,
        usedProvider: cfg.provider,
        usedModel: model,
        pipeline: 'text',
      },
    };

    await this.audit.log({
      action: 'cert.issue.extract',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        fileName: file.originalname,
        bytes: file.size,
        honorCount: result.honors.length,
        honorNames: result.honors.map((h) => h.honorName),
        recipientTotal: result.honors.reduce((s, h) => s + h.recipients.length, 0),
        yearLabel: result.yearLabel,
        promptTokens,
        completionTokens,
        usedProvider: cfg.provider,
        usedModel: model,
        pipeline: 'text',
      }),
    });

    return result;
  }

  /**
   * 图片提取 — 用 vision provider 走多模态 chat completions。
   * OpenAI 兼容的 vision 接口:messages[*].content 是数组,每项 { type:'text'|'image_url', ... }。
   * 豆包/千问/OpenAI/文心 都遵循这个格式。
   */
  private async extractFromImage(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    ctx: ExtractCtx,
  ): Promise<ExtractHonorResponse> {
    const cfg = await this.externalApi.getActiveVision();
    if (!cfg) {
      throw new ServiceUnavailableException(
        '未配置支持图像识别的 provider。请到「系统设置 → 外部 API」给豆包/千问/OpenAI/文心 中任一录入 Key,并确认 capabilities 含 vision。',
      );
    }

    const apiKey = cfg.apiKey;
    const apiUrl = (cfg.apiUrl || '').replace(/\/+$/, '');
    const model = cfg.model;
    const timeoutMs = 110000; // 视觉调用较慢,跟文本路径一致 110s

    // 图片转 base64 data URL
    const base64 = file.buffer.toString('base64');
    const imageDataUrl = `data:${file.mimetype};base64,${base64}`;

    let raw: string;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    try {
      const resp = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    `这是一张表彰文件 / 证书图片(文件名:${file.originalname})。` +
                    '请按 system 要求识别并返回 JSON。',
                },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl },
                },
              ],
            },
          ],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        },
      );
      raw = String(resp.data?.choices?.[0]?.message?.content ?? '');
      promptTokens = resp.data?.usage?.prompt_tokens;
      completionTokens = resp.data?.usage?.completion_tokens;
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const detail =
        err.response?.data?.error?.message ?? err.message ?? '未知错误';
      this.logger.error(`Vision (${cfg.provider}) 调用失败: ${detail}`);
      if (isTimeoutError(err)) {
        throw new ServiceUnavailableException(
          `${cfg.provider}(${model})vision 超时(${Math.round(timeoutMs / 1000)}s),请换更小的图片或换更快的视觉模型`,
        );
      }
      throw new ServiceUnavailableException(
        `${cfg.provider} vision 调用失败:${detail}`,
      );
    }

    let parsed: {
      honors?: unknown;
      honorName?: string;
      recipients?: unknown;
      yearLabel?: string;
      issueDate?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Vision 返回非 JSON: ${raw.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 返回格式异常,无法解析。请重试或换更清晰的图片',
      );
    }

    let honors: ExtractedHonor[];
    if (Array.isArray(parsed.honors)) {
      honors = normalizeHonors(parsed.honors);
    } else if (parsed.honorName !== undefined || parsed.recipients !== undefined) {
      const fbName = String(parsed.honorName ?? '').trim();
      honors = [
        {
          honorName: fbName,
          honorType: normalizeHonorType(undefined, fbName),
          recipients: normalizeRecipients(parsed.recipients),
        },
      ];
    } else {
      honors = [];
    }

    const result: ExtractHonorResponse = {
      honors,
      yearLabel: normalizeYearLabel(String(parsed.yearLabel ?? '')),
      issueDate: normalizeIssueDate(String(parsed.issueDate ?? '')),
      source: {
        fileName: file.originalname,
        bytes: file.size,
        textLength: 0,
        promptTokens,
        completionTokens,
        usedProvider: cfg.provider,
        usedModel: model,
        pipeline: 'vision',
      },
    };

    await this.audit.log({
      action: 'cert.issue.extract',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        fileName: file.originalname,
        bytes: file.size,
        honorCount: result.honors.length,
        honorNames: result.honors.map((h) => h.honorName),
        recipientTotal: result.honors.reduce((s, h) => s + h.recipients.length, 0),
        yearLabel: result.yearLabel,
        promptTokens,
        completionTokens,
        usedProvider: cfg.provider,
        usedModel: model,
        pipeline: 'vision',
      }),
    });

    return result;
  }

  /** 按 mime 类型 / 扩展名分发到不同解析器 */
  private async parseDocument(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<string> {
    const lower = file.originalname.toLowerCase();
    const mime = file.mimetype || '';

    // Word .docx
    if (
      mime.includes('wordprocessingml') ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
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

    // PDF — pdf-parse v2 class API
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const r = await parser.getText();
        return r.text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'pdf 解析失败';
        throw new BadRequestException(`PDF 解析失败:${msg}`);
      } finally {
        // 释放 worker / 临时资源
        await parser.destroy().catch(() => {});
      }
    }

    // 图片暂不支持(MVP 不做 OCR)
    if (mime.startsWith('image/')) {
      throw new BadRequestException(
        '暂不支持图片格式(MVP 阶段)。请上传 Word(.docx)或 PDF',
      );
    }

    // .doc(旧 Office)mammoth 也读不了,提示用户转 docx
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

/**
 * axios 在不同阶段超时给出的错误信息差异较大:
 *   - 连接超时:err.code = 'ECONNABORTED' / 'ETIMEDOUT' + message "timeout of X"
 *   - 响应流中断:message = "stream has been aborted"(实际也是超时触发)
 *   - 慢响应被 AbortController 杀:err.name = "CanceledError"
 * 统一识别
 */
function isTimeoutError(err: AxiosError): boolean {
  if (!err) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  if (err.name === 'CanceledError') return true;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout')) return true;
  if (msg.includes('aborted')) return true;
  if (msg.includes('stream has been aborted')) return true;
  return false;
}

function normalizeRecipients(input: unknown): ExtractedRecipient[] {
  if (!Array.isArray(input)) return [];
  const out: ExtractedRecipient[] = [];
  for (const r of input) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const name = String(obj.name ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      empNo: String(obj.empNo ?? '').trim() || undefined,
      dept: String(obj.dept ?? '').trim() || undefined,
    });
  }
  return out;
}

function normalizeHonors(input: unknown[]): ExtractedHonor[] {
  const out: ExtractedHonor[] = [];
  for (const h of input) {
    if (!h || typeof h !== 'object') continue;
    const obj = h as Record<string, unknown>;
    const honorName = String(obj.honorName ?? '').trim();
    if (!honorName) continue;
    out.push({
      honorName,
      honorType: normalizeHonorType(obj.honorType, honorName),
      issuingOrg: String(obj.issuingOrg ?? '').trim() || undefined,
      recipients: normalizeRecipients(obj.recipients),
    });
  }
  return out;
}

/**
 * honorType 规整:
 *   1. LLM 直接返回合法值 → 直接用
 *   2. 否则按 honorName 关键词推断(党组织/单位/集体/团队 → unit/collective)
 *   3. 兜底 individual
 */
function normalizeHonorType(
  raw: unknown,
  honorName: string,
): 'individual' | 'collective' | 'unit' {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'individual' || v === 'collective' || v === 'unit') return v;
  // 关键词推断
  const name = honorName.toLowerCase();
  if (
    name.includes('党组织') ||
    name.includes('党支部') ||
    name.includes('党委') ||
    name.includes('党总支') ||
    name.includes('党小组') ||
    name.includes('单位') ||
    name.includes('集体') ||
    name.includes('文明') ||
    name.includes('五好家庭') ||
    name.includes('家庭')
  ) {
    return 'unit';
  }
  if (
    name.includes('团队') ||
    name.includes('班组') ||
    name.includes('突击队') ||
    name.includes('示范岗') ||
    name.includes('小组')
  ) {
    return 'collective';
  }
  return 'individual';
}

function normalizeYearLabel(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  // 接受 "2024" / "2024-2025" / "2024年" / "2024-2025年度"
  const m = trimmed.match(/(\d{4})(?:[-—~](\d{4}))?/);
  if (!m) return '';
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

function normalizeIssueDate(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  // 接受 "2024-12-15" / "2024年12月15日" / "2024.12.15"
  const m = trimmed.match(/(\d{4})[-年.](\d{1,2})[-月.](\d{1,2})/);
  if (!m) return '';
  const yyyy = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
