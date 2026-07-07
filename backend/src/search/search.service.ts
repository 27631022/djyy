import { BadRequestException, Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge';
import { ShowcaseService } from '../showcase';
import { CertificateIssueService } from '../certificate';
import { NavCategoryService } from '../nav-category';

/** 全站搜索命中类型(每种都有前端落地页,见 README 对照表) */
export type SearchHitType =
  | 'knowledge'
  | 'faq'
  | 'nav'
  | 'showcase-stage'
  | 'showcase-entry'
  | 'certificate';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  /** 纯文本摘要(各模块已剥 markdown/JSON,前端直接渲染并做关键词高亮) */
  snippet: string;
  /** 补充信息(分类名/晒台名/年度等,前端灰字展示) */
  extra: string;
  /** 前端落地路由(集中在 buildUrl 生成);nav 命中为 NavItem.url 原样,可能是外链 */
  url: string;
}

export interface SearchGroup {
  type: SearchHitType;
  total: number;
  items: SearchHit[];
}

const ALL_TYPES: SearchHitType[] = [
  'nav',
  'knowledge',
  'faq',
  'showcase-stage',
  'showcase-entry',
  'certificate',
];

const Q_MAX_LEN = 100;

/**
 * 全站搜索聚合 —— 位于 knowledge / showcase / certificate / nav-category 之上,
 * 无人依赖本模块(只被 AppModule 注册)→ 依赖图仍是 DAG(照 maintenance 范式)。
 * 可见性过滤由各内容模块的 search* 方法自持(published 口径 / 我的证书注入 actorId),
 * 本模块只做扇出、聚合与 url 生成,不直连任何别人的表。
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly showcase: ShowcaseService,
    private readonly certificates: CertificateIssueService,
    private readonly nav: NavCategoryService,
  ) {}

  /** 联想(首页搜索框实时预览):各组前 perGroup 条 + 组 total,空组不返回 */
  async suggest(rawQ: string, perGroup = 3, actorId = '') {
    const q = normalizeQ(rawQ);
    if (!q) return { q, groups: [] as SearchGroup[] };
    const per = clamp(perGroup, 1, 5, 3);
    const groups = await Promise.all(ALL_TYPES.map((t) => this.fetchGroup(t, q, 1, per, actorId)));
    return { q, groups: groups.filter((g) => g.total > 0) };
  }

  /**
   * 全量搜索(结果页):
   * 无 type(「全部」tab)= 每组前 10 条 + 组 total;有 type = 该组分页。
   */
  async search(
    opts: { q: string; type?: string; page?: number; pageSize?: number },
    actorId = '',
  ) {
    const q = normalizeQ(opts.q);
    if (opts.type !== undefined && !ALL_TYPES.includes(opts.type as SearchHitType)) {
      throw new BadRequestException(`未知的搜索类型 ${opts.type}`);
    }
    if (!opts.type) {
      if (!q) return { q, groups: [] as SearchGroup[] };
      const groups = await Promise.all(
        ALL_TYPES.map((t) => this.fetchGroup(t, q, 1, 10, actorId)),
      );
      return { q, groups: groups.filter((g) => g.total > 0) };
    }
    const type = opts.type as SearchHitType;
    const page = clamp(opts.page ?? 1, 1, 10_000, 1);
    const pageSize = clamp(opts.pageSize ?? 10, 1, 50, 10);
    if (!q) return { q, type, total: 0, page, pageSize, items: [] as SearchHit[] };
    const g = await this.fetchGroup(type, q, page, pageSize, actorId);
    return { q, type, total: g.total, page, pageSize, items: g.items };
  }

  /** 单组取数:分发到各内容模块(可见性各模块自持),统一映射成 SearchHit */
  private async fetchGroup(
    type: SearchHitType,
    q: string,
    page: number,
    pageSize: number,
    actorId: string,
  ): Promise<SearchGroup> {
    switch (type) {
      case 'knowledge': {
        const r = await this.knowledge.searchArticles(q, page, pageSize);
        return {
          type,
          total: r.total,
          items: r.items.map((a) => ({
            type,
            id: a.id,
            title: a.title,
            snippet: a.snippet,
            extra: [a.categoryName, a.typeName].filter(Boolean).join(' · '),
            url: `/knowledge/articles/${a.id}?q=${encodeURIComponent(q)}`,
          })),
        };
      }
      case 'faq': {
        const r = await this.knowledge.searchFaqs(q, page, pageSize);
        return {
          type,
          total: r.total,
          items: r.items.map((f) => ({
            type,
            id: `${f.articleId}:${f.faqId}`,
            title: f.question,
            snippet: f.snippet,
            extra: f.articleTitle,
            url: `/knowledge/articles/${f.articleId}?faq=${encodeURIComponent(f.faqId)}`,
          })),
        };
      }
      case 'nav': {
        // 数据量小(首页导航项几十条),取门户口径后内存过滤;无独立详情页,url = 配置的跳转地址
        const cats = await this.nav.listForPortal();
        const ql = q.toLowerCase();
        const hits: SearchHit[] = [];
        for (const c of cats) {
          for (const it of c.items) {
            // 未配置跳转地址的占位项(url 空或 "#")点了没处去,不进搜索结果
            if (!it.url || it.url === '#') continue;
            const desc = it.desc ?? '';
            if (!it.label.toLowerCase().includes(ql) && !desc.toLowerCase().includes(ql)) continue;
            hits.push({
              type,
              id: it.id,
              title: it.label,
              snippet: desc,
              extra: c.label,
              url: it.url,
            });
          }
        }
        return { type, total: hits.length, items: hits.slice((page - 1) * pageSize, page * pageSize) };
      }
      case 'showcase-stage': {
        const r = await this.showcase.searchStages(q, page, pageSize);
        return {
          type,
          total: r.total,
          items: r.items.map((s) => ({
            type,
            id: s.id,
            title: s.title,
            snippet: s.intro,
            extra: [s.categoryName, s.ownerName, s.status === 'closed' ? '已收官' : '']
              .filter(Boolean)
              .join(' · '),
            url: `/showcase/stages/${s.id}?q=${encodeURIComponent(q)}`,
          })),
        };
      }
      case 'showcase-entry': {
        const r = await this.showcase.searchEntries(q, page, pageSize);
        return {
          type,
          total: r.total,
          items: r.items.map((e) => ({
            type,
            id: e.id,
            title: e.title,
            snippet: e.summary,
            extra: [e.stageTitle, e.authorName].filter(Boolean).join(' · '),
            url: `/showcase/entries/${e.id}?q=${encodeURIComponent(q)}`,
          })),
        };
      }
      case 'certificate': {
        const r = await this.certificates.searchMine(actorId, q, page, pageSize);
        return {
          type,
          total: r.total,
          items: r.items.map((c) => ({
            type,
            id: c.id,
            title: c.templateName || c.certNo,
            snippet: `证书编号 ${c.certNo} · ${fmtDate(c.issueDate)} 颁发`,
            extra: [c.yearLabel, c.revoked ? '已撤销' : ''].filter(Boolean).join(' · '),
            url: `/verify/${c.publicToken}`,
          })),
        };
      }
    }
  }
}

function normalizeQ(rawQ: string): string {
  return (rawQ ?? '').trim().slice(0, Q_MAX_LEN);
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
