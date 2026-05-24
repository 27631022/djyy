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
// pdf-parse 是 CommonJS 包,默认导出形态对 TS 5 不友好,这里强制类型签名
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse');
import { AuditService } from '../audit';
import { ExternalApiService } from '../external-api';
import type {
  ExtractHonorResponse,
  ExtractedRecipient,
} from './dto/extract-honor.dto';

interface ExtractCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 提示 DeepSeek 返回结构化 JSON 的 system prompt */
const SYSTEM_PROMPT = `你是一个证书管理系统的「荣誉表彰文件解析助手」。用户会上传一段表彰文件原文(可能来自 Word/PDF 转出的纯文本),你的任务是从中提取:
1. 表彰荣誉名称(如"2024 年度优秀党员"、"先进基层党委")
2. 表彰年份段(如"2024"、"2024-2025"。年度跨年的写完整段;若只见单年用单年)
3. 表彰对象列表:每人包含 姓名(必填)、员工编号(可选)、部门(可选)

输出严格 JSON,不要任何 markdown / 解释 / 围栏标记。形如:
{"honorName":"...","yearLabel":"...","recipients":[{"name":"...","empNo":"...","dept":"..."}]}

如果某字段无法从原文判断,留空字符串。年份无法判断时 yearLabel="".`;

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
    // 配置来源:DB(系统设置 → 外部 API)优先 → .env 兜底
    const cfg = await this.externalApi.getKeyForProvider('deepseek');
    const apiKey = cfg.apiKey ?? '';
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → 外部 API」录入 DeepSeek API Key,或后端 .env 设置 DEEPSEEK_API_KEY',
      );
    }

    // 1. 解析文档 → 纯文本
    const text = await this.parseDocument(file);
    if (!text || text.trim().length < 10) {
      throw new BadRequestException(
        '文件解析后内容过少,可能是扫描件 / 图片 PDF。请用可复制文本的 Word/PDF',
      );
    }

    // 截断:DeepSeek 上下文限制,留前 20000 字符给提取足够用
    const truncated = text.slice(0, 20000);

    // 2. 调 DeepSeek — apiUrl/model 同样 DB 优先,字段为空时回退到 .env / 默认
    const apiUrl =
      cfg.apiUrl ||
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';
    const model =
      cfg.model ||
      this.config.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-chat';
    const timeoutMs = Number(
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '30000',
    );

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
      this.logger.error(`DeepSeek API failed: ${detail}`);
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        throw new ServiceUnavailableException(
          `AI 服务超时(${timeoutMs}ms),请稍后重试或换更小的文件`,
        );
      }
      throw new ServiceUnavailableException(`AI 服务调用失败:${detail}`);
    }

    // 3. 解析 JSON
    let parsed: { honorName?: string; yearLabel?: string; recipients?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`DeepSeek 返回非 JSON: ${raw.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 返回格式异常,无法解析。请重试或人工补填表单',
      );
    }

    const recipients = normalizeRecipients(parsed.recipients);

    const result: ExtractHonorResponse = {
      honorName: String(parsed.honorName ?? '').trim(),
      yearLabel: normalizeYearLabel(String(parsed.yearLabel ?? '')),
      recipients,
      source: {
        fileName: file.originalname,
        bytes: file.size,
        textLength: text.length,
        promptTokens,
        completionTokens,
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
        honorName: result.honorName,
        yearLabel: result.yearLabel,
        recipientCount: result.recipients.length,
        promptTokens,
        completionTokens,
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

    // PDF
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      try {
        const r = await pdfParse(file.buffer);
        return r.text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'pdf 解析失败';
        throw new BadRequestException(`PDF 解析失败:${msg}`);
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

function normalizeYearLabel(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  // 接受 "2024" / "2024-2025" / "2024年" / "2024-2025年度"
  const m = trimmed.match(/(\d{4})(?:[-—~](\d{4}))?/);
  if (!m) return '';
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}
