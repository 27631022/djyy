import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { parseCatalogBuffer, persistCatalog } from './report-catalog.import';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface CatalogSearchQuery {
  catalogTag: string;
  q?: string;
  category?: string;
  recommendOrg?: string;
  origin?: string;
  page?: number;
  pageSize?: number;
}

/** 多词搜索匹配的列(空格分词,每词须命中任一列 = AND of per-term OR)。 */
const SEARCH_COLS = ['productName', 'spec', 'category', 'categoryDesc', 'supplier', 'recommendOrg', 'origin'] as const;

const MAX_IMPORT_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * 报送目录(清单)—— 批量导入 + 服务端检索(供 catalog_pick 点选,不全量拉)。
 */
@Injectable()
export class ReportCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 上传 xlsx 整体导入(幂等)。 */
  async importFromFile(
    file: UploadedFileShape | undefined,
    meta: { catalogTag: string; name: string; year?: number | null },
    ctx: ActorContext,
  ) {
    if (!file) throw new BadRequestException('未收到清单文件');
    if (file.size > MAX_IMPORT_BYTES) {
      throw new BadRequestException(`文件过大,最大 ${MAX_IMPORT_BYTES / 1024 / 1024}MB`);
    }
    if (!meta.catalogTag?.trim() || !meta.name?.trim()) {
      throw new BadRequestException('catalogTag 与 name 必填');
    }
    const items = parseCatalogBuffer(file.buffer);
    if (!items.length) throw new BadRequestException('未从文件解析到任何清单行(检查表头是否含「产品名称」)');
    const res = await persistCatalog(this.prisma, meta, items);
    await this.audit.log({
      action: 'report.catalog.import',
      detail: { catalogTag: meta.catalogTag, name: meta.name, count: res.count, file: file.originalname },
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
    });
    return res;
  }

  /** 清单列表 + 各自条目数。 */
  async listCatalogs() {
    const [catalogs, counts] = await Promise.all([
      this.prisma.reportCatalog.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.reportCatalogItem.groupBy({ by: ['catalogTag'], _count: { _all: true } }),
    ]);
    const countMap = new Map(counts.map((c) => [c.catalogTag, c._count._all]));
    return catalogs.map((c) => ({ ...c, itemCount: countMap.get(c.catalogTag) ?? 0 }));
  }

  /**
   * 服务端检索:多词空格分词(每词命中任一列,词间 AND;如「新疆 大米」= 产地新疆 且 名称大米)
   * + 分类 / 推荐单位 / 产地 精确过滤 + 分页。供 catalog_pick 点选。
   */
  async searchItems(query: CatalogSearchQuery) {
    const { catalogTag } = query;
    if (!catalogTag) throw new BadRequestException('catalogTag 必填');
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const terms = (query.q ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);
    const where: Prisma.ReportCatalogItemWhereInput = {
      catalogTag,
      ...(query.category ? { category: query.category } : {}),
      ...(query.recommendOrg ? { recommendOrg: { contains: query.recommendOrg } } : {}),
      ...(query.origin ? { origin: { contains: query.origin } } : {}),
      ...(terms.length
        ? { AND: terms.map((t) => ({ OR: SEARCH_COLS.map((c) => ({ [c]: { contains: t } })) })) }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.reportCatalogItem.count({ where }),
      this.prisma.reportCatalogItem.findMany({
        where,
        orderBy: [{ totalSeq: 'asc' }, { subSeq: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  /**
   * 各类别(第一~第四部分)的代表「类别说明」(categoryDesc,如「集团公司定点帮扶和对口支援地区」)+ 计数,
   * 按**数据自然顺序**(min totalSeq)排 —— 不用拼音 localeCompare(否则 一/二/三/四 按拼音 yī 排到最后)。
   */
  private async categoryRows(catalogTag: string) {
    const rows = await this.prisma.reportCatalogItem.groupBy({
      by: ['category', 'categoryDesc'],
      where: { catalogTag },
      _count: { _all: true },
      _min: { totalSeq: true },
    });
    // 收敛到每个 category 一行:取 totalSeq 最小那条的 categoryDesc 为代表,count 求和
    const byCat = new Map<string, { category: string; categoryDesc: string | null; count: number; seq: number }>();
    for (const r of rows) {
      const seq = r._min.totalSeq ?? Number.MAX_SAFE_INTEGER;
      const cur = byCat.get(r.category);
      if (!cur) byCat.set(r.category, { category: r.category, categoryDesc: r.categoryDesc, count: r._count._all, seq });
      else {
        cur.count += r._count._all;
        if (seq < cur.seq) {
          cur.seq = seq;
          cur.categoryDesc = r.categoryDesc;
        }
      }
    }
    return [...byCat.values()].sort((a, b) => a.seq - b.seq);
  }

  /** 分类分面(第一~第四部分 + 类别说明 + 各计数),供检索侧边筛选。按数据自然顺序排。 */
  async categories(catalogTag: string) {
    if (!catalogTag) throw new BadRequestException('catalogTag 必填');
    return (await this.categoryRows(catalogTag)).map((r) => ({ category: r.category, categoryDesc: r.categoryDesc, count: r.count }));
  }

  /** 筛选分面:类别(带说明,自然序)/ 推荐单位 / 产地 的可选值 + 计数。 */
  async filterFacets(catalogTag: string) {
    if (!catalogTag) throw new BadRequestException('catalogTag 必填');
    const [catRows, orgs, origins] = await Promise.all([
      this.categoryRows(catalogTag),
      this.prisma.reportCatalogItem.groupBy({ by: ['recommendOrg'], where: { catalogTag }, _count: { _all: true } }),
      this.prisma.reportCatalogItem.groupBy({ by: ['origin'], where: { catalogTag }, _count: { _all: true } }),
    ]);
    const byCount = (rows: { value: string | null; count: number }[]) =>
      rows.filter((r): r is { value: string; count: number } => !!r.value).sort((a, b) => b.count - a.count);
    return {
      categories: catRows.map((r) => ({ value: r.category, count: r.count, desc: r.categoryDesc })),
      recommendOrgs: byCount(orgs.map((r) => ({ value: r.recommendOrg, count: r._count._all }))),
      origins: byCount(origins.map((r) => ({ value: r.origin, count: r._count._all }))),
    };
  }
}
