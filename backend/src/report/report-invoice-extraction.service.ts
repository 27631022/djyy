import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
// pdf-parse v2.x 是 class API(老 v1 是 fn),且包 type:module + exports map 无法走子路径,
// 通过 require('pdf-parse').PDFParse 拿 class(与 certificate / task 提取一致)。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseMod = require('pdf-parse') as { PDFParse?: PdfParseCtor };
type PdfParseCtor = new (opts: { data: Buffer | Uint8Array }) => {
  getText(): Promise<{ text: string; total: number }>;
  destroy(): Promise<void>;
};
const PDFParse: PdfParseCtor = (() => {
  const C = pdfParseMod?.PDFParse;
  if (typeof C !== 'function')
    throw new Error('pdf-parse 加载失败:模块未导出 PDFParse class(需要 pdf-parse v2.x)');
  return C;
})();
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { ExternalApiService } from '../external-api';
import { PromptService } from '../prompt';
import { StorageService } from '../storage';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** getConfigForConsumer 的非空返回(避免 import 内部类型名) */
type ProviderCfg = NonNullable<
  Awaited<ReturnType<ExternalApiService['getConfigForConsumer']>>
>;

/** 命中清单后的快照(= 前端 CatalogPickValue,可直接作为「目录点选」字段值) */
interface CatalogSnapshot {
  catalogItemId: string;
  productName: string;
  spec: string | null;
  category: string | null;
  categoryDesc: string | null;
  supplier: string | null;
  recommendOrg: string | null;
  origin: string | null;
  unitPriceCents: number | null;
}

export interface InvoiceExtractLine {
  productName: string;
  spec: string | null;
  /** 不含税金额(元) */
  amountYuan: number | null;
  /** 税额(元) */
  taxYuan: number | null;
  /** 命中清单时带回快照(前端直接填入目录点选);未命中 null(前端只填名称待人工点选) */
  match: CatalogSnapshot | null;
  /** 命中了但规格尺寸对不上(如发票 5L、清单 1.5L)→ 取了最接近项,需重点核对 */
  specMismatch?: boolean;
}

export interface InvoiceExtractResult {
  invoiceNo: string;
  purchaseDate: string; // YYYY-MM-DD 或 ''
  supplier: string | null;
  /** 不含税合计(元) */
  totalAmountYuan: number | null;
  /** 税额合计(元) */
  totalTaxYuan: number | null;
  /** 价税合计(元) */
  totalWithTaxYuan: number | null;
  lines: InvoiceExtractLine[];
  /** 自检提示(需重点审查项):销售方缺失 / 规格不符 / 未匹配 / 合计与票面不一致 */
  warnings: string[];
  source: {
    fileName: string;
    pipeline: 'vision' | 'text';
    usedProvider: string;
    usedModel: string;
    matchedCount: number;
  };
}

/**
 * 发票 AI 识别(报送录入辅助)。
 * 图片走 vision(OpenAI 兼容多模态 image_url),PDF 走文本(pdf-parse → chat);
 * 两路都用「report.invoice.extract.vision」消费功能解析出的模型(可配内网本地 gemma,kind=internal 无 Key)。
 * 识别出的明细 best-effort 匹配清单(catalogTag)带回快照,供前端作为目录点选值自动填入。
 */
/**
 * 发票图片识别的视觉模型「自动回退顺序」(用户偏好:豆包优先、千问其次)。
 * 主模型仍由「模型路由」决定(默认绑定豆包);本表补充「主模型失败后」按序尝试的备选云视觉。
 * 想改顺序就改这里;本地 gemma 不在自动备选,需在「模型路由」显式绑定为主才会用。
 */
const INVOICE_VISION_FALLBACKS = ['doubao', 'qwen'];

/**
 * 清单匹配命中阈值(分)。放宽匹配:2 个共同字(20)、或 1 个共同字 + 规格/销售方 命中即可达标,
 * 取最接近的一条;只有名称完全无共同字才不匹配。调高=更严格,调低=更宽松。
 */
const MATCH_THRESHOLD = 16;

@Injectable()
export class ReportInvoiceExtractionService {
  private readonly logger = new Logger(ReportInvoiceExtractionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly externalApi: ExternalApiService,
    private readonly prompts: PromptService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async extractInvoice(
    fileId: string,
    catalogTag: string | undefined,
    ctx: ActorCtx,
  ): Promise<InvoiceExtractResult> {
    if (!fileId) throw new BadRequestException('缺少发票文件');
    const { meta, buffer } = await this.storage.getBuffer(fileId);
    if (meta.ownerModule !== 'report')
      throw new BadRequestException('只能识别本模块上传的发票文件');

    const isImage =
      (meta.mimeType || '').startsWith('image/') ||
      /\.(png|jpe?g|webp|bmp|gif)$/i.test(meta.originalName);
    const isPdf =
      (meta.mimeType || '') === 'application/pdf' || /\.pdf$/i.test(meta.originalName);
    if (!isImage && !isPdf)
      throw new BadRequestException('仅支持发票图片(jpg/png)或 PDF 的 AI 识别');

    const systemPrompt = await this.prompts.get('report.invoice_extract');
    let raw: string;
    let pipeline: 'vision' | 'text';
    let usedProvider: string;
    let usedModel: string;

    if (isImage) {
      // 图片 → 视觉模型链:主模型(模型路由,默认豆包)优先,失败自动回退 千问(用户偏好顺序)
      pipeline = 'vision';
      const chain = await this.visionChain();
      if (chain.length === 0)
        throw new ServiceUnavailableException(
          '未配置识别发票图片的视觉模型。请到「系统设置 → 外部 API」配豆包 / 通义千问(或本地 gemma)等带 vision 能力的模型,或在「模型路由」给「报送管理 · AI 识别发票图片」绑定一个。',
        );
      let got: { raw: string; cfg: ProviderCfg } | null = null;
      let lastErr: unknown;
      for (const cfg of chain) {
        try {
          got = {
            raw: await this.callVision(cfg, systemPrompt, meta.mimeType || 'image/jpeg', buffer, meta.originalName),
            cfg,
          };
          break;
        } catch (e) {
          lastErr = e;
          this.logger.warn(`发票图片识别用 ${cfg.provider} 失败,尝试下一个视觉模型`);
        }
      }
      if (!got)
        throw lastErr instanceof Error
          ? lastErr
          : new ServiceUnavailableException('发票图片识别失败,且无可用备选视觉模型');
      raw = got.raw;
      usedProvider = got.cfg.provider;
      usedModel = got.cfg.model;
    } else {
      // 文本型 PDF → 纯文本 chat 模型(如 DeepSeek,无需视觉)
      pipeline = 'text';
      const cfg = await this.externalApi.getConfigForConsumer('report.invoice.extract.text');
      if (!cfg)
        throw new ServiceUnavailableException(
          '未配置识别发票 PDF 的文本模型。请到「系统设置 → 外部 API」配一个标了 chat 能力的模型(如 DeepSeek),或在「模型路由」给「报送管理 · AI 识别发票PDF」绑定一个。',
        );
      const text = await this.pdfText(buffer);
      if (!text || text.trim().length < 8)
        throw new BadRequestException(
          '该 PDF 没有可提取文本(可能是扫描件)。扫描 / 拍照发票请走图片识别(需视觉模型)',
        );
      raw = await this.callText(
        cfg,
        systemPrompt,
        `发票文件名:${meta.originalName}\n--- 发票文本 ---\n${text.slice(0, 12000)}`,
      );
      usedProvider = cfg.provider;
      usedModel = cfg.model;
    }

    const parsed = parseJsonLoose(raw);
    if (!parsed) {
      this.logger.warn(`发票识别返回非 JSON: ${raw.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 返回格式异常,无法解析。请重试,或手动填写发票信息',
      );
    }

    const invoiceNo = cleanInvoiceNo(parsed.invoiceNo);
    const purchaseDate = normalizeDate(
      String(parsed.purchaseDate ?? parsed.invoiceDate ?? parsed.date ?? ''),
    );
    const supplier = (String(parsed.supplier ?? parsed.seller ?? '').trim() || null) as
      | string
      | null;
    const totalAmountYuan = toYuan(parsed.totalAmountYuan ?? parsed.total);
    const totalTaxYuan = toYuan(parsed.totalTaxYuan ?? parsed.tax);
    const totalWithTaxYuan = toYuan(
      parsed.totalWithTaxYuan ?? parsed.amountWithTax ?? parsed.grandTotal,
    );
    const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const lines: InvoiceExtractLine[] = [];
    rawLines.forEach((l) => {
      if (!l || typeof l !== 'object') return;
      const o = l as Record<string, unknown>;
      const productName = String(o.productName ?? o.name ?? o.product ?? '').trim();
      const spec = String(o.spec ?? o.model ?? o.specification ?? '').trim() || null;
      const amountYuan = toYuan(o.amountYuan ?? o.amount ?? o.money);
      const taxYuan = toYuan(o.taxYuan ?? o.tax);
      if (!productName && amountYuan == null) return;
      lines.push({ productName, spec, amountYuan, taxYuan, match: null });
    });

    // 匹配清单:按 销售方 + 品名 + 规格 综合打分锁定;命中带回快照(前端作目录点选值),未命中只回名称待人工点选
    const matches = await this.matchCatalog(catalogTag, supplier, lines);
    lines.forEach((l, i) => {
      l.match = matches[i] ?? null;
      if (l.match) l.specMismatch = specMismatch(l.productName, l.spec, l.match.productName, l.match.spec);
    });

    // 自检提示(需重点审查):销售方缺失 / 规格不符 / 未匹配 / 合计与票面不一致
    const warnings: string[] = [];
    if (!supplier) warnings.push('未识别到发票销售方,请核对(一张发票只应有一个销售方)');
    const specBad = lines.filter((l) => l.specMismatch).length;
    if (specBad) warnings.push(`${specBad} 项规格可能与采购库不符(如 5L↔1.5L、2.25kg↔2.5kg),已取最接近项,请核对`);
    const unmatched = lines.filter((l) => l.productName && !l.match).length;
    if (unmatched) warnings.push(`${unmatched} 项未匹配到采购库,需手动点选`);
    const invWithTax =
      totalWithTaxYuan ?? (totalAmountYuan ?? 0) + (totalTaxYuan ?? 0);
    const lineWithTax = lines.reduce((s, l) => s + (l.amountYuan ?? 0) + (l.taxYuan ?? 0), 0);
    if (invWithTax > 0 && Math.abs(invWithTax - lineWithTax) >= 0.02)
      warnings.push(
        `明细合计 ¥${lineWithTax.toFixed(2)} 与发票价税合计 ¥${invWithTax.toFixed(2)} 不一致`,
      );

    const result: InvoiceExtractResult = {
      invoiceNo,
      purchaseDate,
      supplier,
      totalAmountYuan,
      totalTaxYuan,
      totalWithTaxYuan,
      lines,
      warnings,
      source: {
        fileName: meta.originalName,
        pipeline,
        usedProvider,
        usedModel,
        matchedCount: lines.filter((l) => l.match).length,
      },
    };

    await this.audit.log({
      ...ctx,
      action: 'report.invoice.extract',
      target: fileId,
      detail: {
        fileId,
        fileName: meta.originalName,
        pipeline,
        invoiceNo,
        purchaseDate,
        lineCount: lines.length,
        matchedCount: result.source.matchedCount,
        usedProvider,
        usedModel,
      },
    });
    return result;
  }

  /** 视觉识别备选链:主模型(模型路由解析,默认豆包)在前,再按偏好补 豆包/千问 中尚未入链且当前可用的。 */
  private async visionChain(): Promise<ProviderCfg[]> {
    const chain: ProviderCfg[] = [];
    const primary = await this.externalApi.getConfigForConsumer('report.invoice.extract.vision');
    if (primary) chain.push(primary);
    for (const prov of INVOICE_VISION_FALLBACKS) {
      if (chain.some((c) => c.provider === prov)) continue;
      const cfg = await this.externalApi.getConfigForProviderCapability(prov, 'vision');
      if (cfg) chain.push(cfg);
    }
    return chain;
  }

  /* ─── 模型调用 ─── */

  private async callVision(
    cfg: ProviderCfg,
    systemPrompt: string,
    mime: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const apiUrl = (cfg.apiUrl || '').replace(/\/+$/, '');
    if (!apiUrl) throw new ServiceUnavailableException('视觉模型未配置 endpoint(apiUrl)');
    const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    const timeoutMs = this.timeout();
    try {
      const resp = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model: cfg.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `这是一张采购发票图片(文件名:${fileName})。请按 system 要求识别并返回 JSON。`,
                },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
          temperature: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          timeout: timeoutMs,
        },
      );
      return String(resp.data?.choices?.[0]?.message?.content ?? '');
    } catch (e) {
      throw this.mapErr(e, cfg.provider, cfg.model, timeoutMs);
    }
  }

  private async callText(
    cfg: ProviderCfg,
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const apiUrl = (cfg.apiUrl || '').replace(/\/+$/, '');
    if (!apiUrl) throw new ServiceUnavailableException('模型未配置 endpoint(apiUrl)');
    const timeoutMs = this.timeout();
    try {
      const resp = await axios.post(
        `${apiUrl}/chat/completions`,
        {
          model: cfg.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          timeout: timeoutMs,
        },
      );
      return String(resp.data?.choices?.[0]?.message?.content ?? '');
    } catch (e) {
      throw this.mapErr(e, cfg.provider, cfg.model, timeoutMs);
    }
  }

  /** 本地模型可能较慢 → 默认 180s,可由 REPORT_INVOICE_TIMEOUT_MS 覆盖 */
  private timeout(): number {
    return Number(this.config.get<string>('REPORT_INVOICE_TIMEOUT_MS') ?? '180000');
  }

  private mapErr(
    e: unknown,
    provider: string,
    model: string,
    timeoutMs: number,
  ): Error {
    const err = e as AxiosError<{ error?: { message?: string } }>;
    const detail = err.response?.data?.error?.message ?? err.message ?? '未知错误';
    this.logger.error(`发票识别 (${provider}/${model}) 失败: ${detail}`);
    if (isTimeoutError(err))
      return new ServiceUnavailableException(
        `发票识别超时(${Math.round(timeoutMs / 1000)}s)。本地模型较慢时可调大 REPORT_INVOICE_TIMEOUT_MS,或换更快的视觉模型 / 更小的图片`,
      );
    return new ServiceUnavailableException(`${provider} 发票识别失败:${detail}`);
  }

  private async pdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const r = await parser.getText();
      return r.text;
    } catch (e) {
      const m = e instanceof Error ? e.message : 'pdf 解析失败';
      throw new BadRequestException(`PDF 解析失败:${m}`);
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  /**
   * 把识别出的每行明细匹配清单(同一 catalogTag),按 **销售方 + 品名 + 规格** 综合打分锁定。
   * 清单量级数千行 → 一次性载入内存打分(避免逐行 SQL contains 漏掉「清单名比发票名更短」的情况)。
   * 命中需达阈值且与次优拉开距离,避免歧义乱配;未命中返回 null(承办人手动点选)。
   * 返回数组与 lines 一一对应。
   */
  private async matchCatalog(
    catalogTag: string | undefined,
    supplier: string | null,
    lines: InvoiceExtractLine[],
  ): Promise<(CatalogSnapshot | null)[]> {
    if (!catalogTag) return lines.map(() => null);
    const all = await this.prisma.reportCatalogItem.findMany({
      where: { catalogTag },
      take: 12000,
    });
    return lines.map((ln) => {
      const name = ln.productName.trim();
      if (!name) return null;
      let best: (typeof all)[number] | null = null;
      let bestScore = 0;
      for (const it of all) {
        const s = scoreCatalogItem(it.productName, it.spec, it.supplier, name, ln.spec, supplier);
        if (s > bestScore) {
          bestScore = s;
          best = it;
        }
      }
      // 放宽:达到较低阈值即取「最接近的一条」(不再要求与次优拉开距离);只有完全不沾边(0 分)才不匹配
      if (best && bestScore >= MATCH_THRESHOLD) {
        return {
          catalogItemId: best.id,
          productName: best.productName,
          spec: best.spec,
          category: best.category,
          categoryDesc: best.categoryDesc,
          supplier: best.supplier,
          recommendOrg: best.recommendOrg,
          origin: best.origin,
          unitPriceCents: best.purchasePriceCents,
        };
      }
      return null;
    });
  }
}

/** 商品匹配打分:品名(双向包含 / 字符重叠)为主,规格(尺寸感知)、销售方为辅。名称完全不沾边返 0,不靠规格/供应商硬凑。 */
export function scoreCatalogItem(
  catName: string,
  catSpec: string | null,
  catSupplier: string | null,
  invName: string,
  invSpec: string | null,
  invSupplier: string | null,
): number {
  const pn = (catName || '').trim();
  if (!pn) return 0;
  let s = 0;
  if (pn === invName) s += 100;
  else if (pn.includes(invName) || invName.includes(pn)) s += 60;
  else {
    const overlap = charOverlap(pn, invName);
    if (overlap >= 1) s += overlap * 10; // 放宽:1 个共同字也计分(再叠加 销售方/规格 凑足阈值)
  }
  if (s === 0) return 0; // 名称完全无共同字才放弃,不靠销售方/规格单独硬配
  // 规格「尺寸感知」:从 名称+规格 里解析 数值+单位(如 5l / 2.25kg / 300g)。
  //  - 同尺寸 → 强加分(把正确规格顶上去)
  //  - 同单位不同值(5L vs 1.5L、2.25kg vs 2.5kg)→ 轻扣(偏向正确规格,但不否决,仍可匹配并提示)
  //  - 无可解析尺寸 → 退化为子串(避免「1.5L 含 5L」这类子串误判)
  const invSize = sizeTokens(`${invName} ${invSpec ?? ''}`);
  const catSize = sizeTokens(`${catName} ${catSpec ?? ''}`);
  if (invSize.length && catSize.length) {
    if (invSize.some((t) => catSize.includes(t))) s += 40;
    else if (sameUnit(invSize, catSize)) s -= 10;
  } else if (invSpec && catSpec) {
    const a = invSpec.trim();
    const b = catSpec.trim();
    if (a && b && (a === b || b.includes(a))) s += 15;
  }
  if (invSupplier && catSupplier) {
    const a = invSupplier.trim();
    const b = catSupplier.trim();
    if (a && b && (a.includes(b) || b.includes(a))) s += 40;
  }
  return s;
}

/** 从字符串里解析「数值+单位」尺寸 token(归一化单位),如 "5L/桶"→["5l"]、"2.25KG"→["2.25kg"]。 */
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(ml|l|kg|毫升|千克|公斤|升|克|g|斤|桶|袋|盒|箱|瓶|罐|包|片|枚|支|只|个)/gi;
const UNIT_NORM: Record<string, string> = { 升: 'l', 毫升: 'ml', 千克: 'kg', 公斤: 'kg', 克: 'g' };
function sizeTokens(s: string): string[] {
  const out: string[] = [];
  const str = (s || '').toLowerCase();
  SIZE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SIZE_RE.exec(str))) {
    const u = UNIT_NORM[m[2]] || m[2];
    out.push(`${parseFloat(m[1])}${u}`);
  }
  return [...new Set(out)];
}
const unitOf = (tok: string): string => tok.replace(/^[\d.]+/, '');
/** 两组尺寸 token 是否「至少共用一个单位」(用于判定同单位不同值) */
function sameUnit(a: string[], b: string[]): boolean {
  const ub = new Set(b.map(unitOf));
  return a.some((t) => ub.has(unitOf(t)));
}

/** 发票行规格 与 命中商品规格 是否「尺寸对不上」(都能解析出尺寸、但无一相同)。供审核重点提示。 */
export function specMismatch(
  invName: string,
  invSpec: string | null,
  catName: string,
  catSpec: string | null,
): boolean {
  const inv = sizeTokens(`${invName} ${invSpec ?? ''}`);
  const cat = sizeTokens(`${catName} ${catSpec ?? ''}`);
  return inv.length > 0 && cat.length > 0 && !inv.some((t) => cat.includes(t));
}

/** 两串去重字符的交集大小(中文品名近似匹配用) */
function charOverlap(a: string, b: string): number {
  const sa = new Set(a.split(''));
  let c = 0;
  for (const ch of new Set(b.split(''))) if (sa.has(ch)) c++;
  return c;
}

/* ─── 解析辅助 ─── */

function isTimeoutError(err: AxiosError): boolean {
  if (!err) return false;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  if (err.name === 'CanceledError') return true;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('stream has been aborted')
  );
}

/** 容忍本地模型把 JSON 包在 markdown 围栏 / 夹带解释:先直接 parse,失败再取首个 {…} */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const fenced = raw.replace(/```(?:json)?/gi, '');
  const s = fenced.indexOf('{');
  const e = fenced.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(fenced.slice(s, e + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function cleanInvoiceNo(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z-]/g, '')
    .slice(0, 64);
}

/** "2024-06-15" / "2024年6月15日" / "2024.6.15" → "2024-06-15";抽不到为空串 */
function normalizeDate(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/(\d{4})[-年./](\d{1,2})[-月./](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 金额 → 元(数字)。容忍 "1,234.56" / "¥1234" / "1234元";无效给 null。 */
function toYuan(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,，¥￥\s元]/g, ''));
  return Number.isFinite(n) ? n : null;
}
