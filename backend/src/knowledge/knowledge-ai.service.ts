import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { lookup } from 'node:dns/promises';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import { PromptService } from '../prompt';
import { ExternalApiService, LlmClientService } from '../external-api';
import { TAG_MAX_COUNT, TAG_MAX_LEN } from './knowledge.constants';
import { isMaintainerOf, mergeFaqs, parseFaqsRaw } from './knowledge.helpers';

interface ActorCtx {
  actorId: string;
  actorName: string;
  ip?: string;
}

const FETCH_MAX_BYTES = 5 * 1024 * 1024;

/**
 * 知识分享 AI(P4):URL 抓取正文 + AI 清洗归档 / 联网检索 / 导读 / FAQ。
 * LLM 走 external-api 的 LlmClientService(联网复用 knowledge.search.text 消费点的 webSearch)。
 */
@Injectable()
export class KnowledgeAiService {
  private readonly logger = new Logger(KnowledgeAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
    private readonly prompts: PromptService,
    private readonly llm: LlmClientService,
    private readonly externalApi: ExternalApiService,
    private readonly config: ConfigService,
  ) {}

  /* ═══════════ 能力探测(前端据此显隐「一键联网检索」) ═══════════ */
  async capabilities() {
    const cfg = await this.externalApi.getConfigForConsumer('knowledge.search.text');
    return { webSearch: !!cfg?.webSearch && cfg.provider === 'qwen' };
  }

  /* ═══════════ URL 抓取正文(SSRF 防护 + GBK 兜底 + 自写正文提取) ═══════════ */
  async fetchUrl(url: string, ctx: ActorCtx): Promise<{ title: string; text: string }> {
    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      throw new BadRequestException('链接格式不正确');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new BadRequestException('仅支持 http/https 链接');
    }
    const allowPrivate = this.config.get<string>('KNOWLEDGE_FETCH_ALLOW_PRIVATE') === '1';
    if (!allowPrivate) await this.assertPublicHost(u.hostname);

    let html: string;
    try {
      // 手动逐跳跟随重定向,**每一跳都校验目标 host** —— 防公网域名 302 到内网/云元数据的 SSRF 绕过
      // (axios 自带 maxRedirects 会跟随但不再过 assertPublicHost)。
      let currentUrl = u.toString();
      let resp: Awaited<ReturnType<typeof axios.get<ArrayBuffer>>> | undefined;
      for (let hop = 0; ; hop++) {
        if (hop > 3) throw new Error('重定向次数过多');
        resp = await axios.get<ArrayBuffer>(currentUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxContentLength: FETCH_MAX_BYTES,
          maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; djyy-knowledge/1.0)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (resp.status < 300) break; // 2xx:拿到内容
        const loc = resp.headers['location'];
        if (!loc) break;
        const next = new URL(String(loc), currentUrl);
        if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('重定向到非 http(s) 链接');
        if (!allowPrivate) await this.assertPublicHost(next.hostname);
        currentUrl = next.toString();
      }
      if (!resp) throw new Error('无响应');
      const buf = Buffer.from(resp.data);
      html = decodeHtml(buf, String(resp.headers['content-type'] ?? ''));
    } catch (e) {
      throw new BadRequestException(`抓取失败:${(e as Error).message}`);
    }
    const { title, text } = extractMainText(html);
    if (!text.trim()) throw new BadRequestException('未能从该网页提取到正文,请改用「粘贴全文」');
    await this.audit.log({ ...ctx, action: 'knowledge.ai.fetch-url', detail: { url: u.toString(), chars: text.length } });
    return { title, text: text.slice(0, 200_000) };
  }

  private async assertPublicHost(hostname: string) {
    let addrs: { address: string }[];
    try {
      addrs = await lookup(hostname, { all: true });
    } catch {
      throw new BadRequestException('无法解析该域名');
    }
    for (const a of addrs) {
      if (isPrivateAddress(a.address)) {
        throw new BadRequestException('出于安全,拒绝访问内网/本机地址');
      }
    }
  }

  /* ═══════════ AI 清洗归档 ═══════════ */
  async clean(name: string, text: string, ctx: ActorCtx) {
    return this.runClean(name, text, false, ctx);
  }

  /** 联网检索归档:未配联网模型 → 400 引导 */
  async search(name: string, hint: string | undefined, ctx: ActorCtx) {
    const cap = await this.capabilities();
    if (!cap.webSearch) {
      throw new BadRequestException(
        '「一键联网检索」未启用:请到「AI 接入管理」给「知识分享 · AI 联网检索归档」绑定一个开启了联网搜索的模型(如千问 qwen 勾上联网)。或改用「粘贴链接 / 粘贴全文」。',
      );
    }
    const userContent = `请联网搜索《${name}》的最新权威全文${hint ? `(补充:${hint})` : ''},然后按要求清洗归档。`;
    return this.runClean(name, userContent, true, ctx);
  }

  private async runClean(name: string, text: string, web: boolean, ctx: ActorCtx) {
    const systemPrompt = await this.prompts.get('knowledge.clean');
    const userContent = web ? text : `文件名称:《${name}》\n\n原始正文:\n${text}`;
    const r = await this.llm.chatJson({
      consumerKey: web ? 'knowledge.search.text' : 'knowledge.clean.text',
      systemPrompt,
      userContent,
      enableWebSearch: web,
      timeoutMs: web ? 180_000 : 120_000,
    });
    const parsed = parseJson(r.raw);
    const out = {
      title: str(parsed.title) || name,
      contentMd: str(parsed.contentMd),
      categoryHint: str(parsed.categoryHint),
    };
    if (!out.contentMd.trim()) throw new BadRequestException('AI 未能生成规范全文,请重试或改用粘贴全文');
    await this.audit.log({
      ...ctx,
      action: web ? 'knowledge.ai.search' : 'knowledge.ai.clean',
      detail: { name, web, provider: r.provider, model: r.model, promptTokens: r.promptTokens, completionTokens: r.completionTokens },
    });
    return out;
  }

  /* ═══════════ 导读 + 标签 ═══════════ */
  async generateGuide(articleId: string, ctx: ActorCtx) {
    const a = await this.requireEditable(articleId, ctx.actorId, '生成导读');
    const systemPrompt = await this.prompts.get('knowledge.guide');
    const r = await this.llm.chatJson({
      consumerKey: 'knowledge.guide.text',
      systemPrompt,
      userContent: a.contentMd.slice(0, 40_000),
    });
    const parsed = parseJson(r.raw);
    const summary = str(parsed.summary).slice(0, 2000);
    const tags = normTags(parsed.tags);
    if (summary) await this.prisma.knowledgeArticle.update({ where: { id: articleId }, data: { summary } });
    await this.audit.log({ ...ctx, action: 'knowledge.ai.guide', target: articleId, detail: { provider: r.provider, model: r.model } });
    return { summary, tags };
  }

  /* ═══════════ FAQ ═══════════ */
  async generateFaq(articleId: string, ctx: ActorCtx) {
    const a = await this.requireEditable(articleId, ctx.actorId, '生成 FAQ');
    const systemPrompt = await this.prompts.get('knowledge.faq');
    const r = await this.llm.chatJson({
      consumerKey: 'knowledge.faq.text',
      systemPrompt,
      userContent: a.contentMd.slice(0, 40_000),
    });
    const parsed = parseJson(r.raw);
    const raw = Array.isArray(parsed.faqs)
      ? parsed.faqs
          .filter((f: unknown): f is { q: unknown; a: unknown } => !!f && typeof f === 'object')
          .map((f: { q: unknown; a: unknown }) => ({ q: str(f.q), a: str(f.a) }))
          .filter((f: { q: string; a: string }) => f.q && f.a)
          .slice(0, 12)
      : [];
    // 重新生成 = 全替换:mergeFaqs(null, …) 分配稳定 id、clicks 从 0 起(旧问题的热度不迁移)
    const faqJson = mergeFaqs(null, raw);
    await this.prisma.knowledgeArticle.update({ where: { id: articleId }, data: { faqJson } });
    const faqs = parseFaqsRaw(faqJson);
    await this.audit.log({ ...ctx, action: 'knowledge.ai.faq', target: articleId, detail: { count: faqs.length, provider: r.provider, model: r.model } });
    return { faqs };
  }

  private async requireEditable(articleId: string, userId: string, what: string) {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, authorId: true, contentMd: true, maintainersJson: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    if (a.authorId !== userId && !isMaintainerOf(a.maintainersJson, userId)) {
      const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(userId, 'knowledge:manage');
      if (!isPlatformAdmin && entries.length === 0) {
        throw new ForbiddenException(`仅作者、维护人员或管理员可${what}`);
      }
    }
    if (!a.contentMd.trim()) throw new BadRequestException('正文为空,先写点内容再生成');
    return a;
  }
}

/* ═══════════ 纯函数 ═══════════ */

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    // 容错:剥可能的 ```json 围栏后再试
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    throw new BadRequestException('AI 返回的不是有效 JSON,请重试');
  }
}

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const raw of v) {
    const t = str(raw).trim().slice(0, TAG_MAX_LEN);
    if (t) seen.add(t);
    if (seen.size >= TAG_MAX_COUNT) break;
  }
  return [...seen];
}

/** IPv4/IPv6 私网/环回/链路本地判定(SSRF 防护) */
function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(v);
  const target = mapped ? mapped[1] : v;
  const p = target.split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** 按 Content-Type / <meta charset> 嗅探编码;GBK 用 TextDecoder('gbk')(政府网站常见) */
function decodeHtml(buf: Buffer, contentType: string): string {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  if (!charset) {
    const head = buf.subarray(0, 2048).toString('latin1');
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  }
  const isGbk = charset === 'gbk' || charset === 'gb2312' || charset === 'gb18030';
  try {
    return new TextDecoder(isGbk ? 'gbk' : 'utf-8').decode(buf);
  } catch {
    return buf.toString('utf-8');
  }
}

const NOISE_TAGS = ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'svg', 'iframe'];

/**
 * 自写正文提取:剥噪声标签,优先 <article>/<main>,块级标签转换行,去标签。
 * ⚠ 全部用**线性**操作:输入先截断 + 噪声标签用 unrolled 非回溯正则 + article/main 用 indexOf ——
 * 避免带反向引用的惰性正则在超大/未闭合标签 HTML 上灾难回溯(ReDoS 阻塞事件循环)。
 */
function extractMainText(htmlRaw: string): { title: string; text: string } {
  const html = htmlRaw.slice(0, 800_000); // 上限:正文提取只需前 800KB,防超大/恶意 HTML 拖垮正则
  const title = /<title[^>]*>([^<]{0,300})/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  let body = html.replace(/<!--(?:[^-]|-(?!->))*-->/g, ' '); // 线性注释剥除
  for (const tag of NOISE_TAGS) {
    // unrolled 非回溯:<tag ...> …(内部非 <,或 < 但不是 </tag)… </tag>
    body = body.replace(new RegExp(`<${tag}\\b[^<]*(?:<(?!/${tag}[\\s>])[^<]*)*</${tag}\\s*>`, 'gi'), ' ');
  }
  // 优先取 article / main —— 用 indexOf 线性定位首个开合标签,避免带 backref 的惰性正则
  const lower = body.toLowerCase();
  for (const tag of ['article', 'main']) {
    const open = lower.indexOf(`<${tag}`);
    if (open < 0) continue;
    const gt = body.indexOf('>', open);
    const close = lower.indexOf(`</${tag}`, gt);
    if (gt >= 0 && close > gt) {
      body = body.slice(gt + 1, close);
      break;
    }
  }
  const text = body
    .replace(/<\/(p|div|section|li|tr|h[1-6]|br)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return { title, text };
}
