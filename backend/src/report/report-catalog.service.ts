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

  /** 分类分面(第一~第四部分 + 各计数),供检索侧边筛选。 */
  async categories(catalogTag: string) {
    if (!catalogTag) throw new BadRequestException('catalogTag 必填');
    const rows = await this.prisma.reportCatalogItem.groupBy({
      by: ['category'],
      where: { catalogTag },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ category: r.category, count: r._count._all }))
      .sort((a, b) => a.category.localeCompare(b.category, 'zh'));
  }

  /** 筛选分面:类别 / 推荐单位 / 产地 的可选值 + 计数(供点选栏目)。 */
  async filterFacets(catalogTag: string) {
    if (!catalogTag) throw new BadRequestException('catalogTag 必填');
    const [cats, orgs, origins] = await Promise.all([
      this.prisma.reportCatalogItem.groupBy({ by: ['category'], where: { catalogTag }, _count: { _all: true } }),
      this.prisma.reportCatalogItem.groupBy({ by: ['recommendOrg'], where: { catalogTag }, _count: { _all: true } }),
      this.prisma.reportCatalogItem.groupBy({ by: ['origin'], where: { catalogTag }, _count: { _all: true } }),
    ]);
    const byCount = (rows: { value: string | null; count: number }[]) =>
      rows.filter((r): r is { value: string; count: number } => !!r.value).sort((a, b) => b.count - a.count);
    return {
      categories: byCount(cats.map((r) => ({ value: r.category, count: r._count._all }))).sort((a, b) =>
        a.value.localeCompare(b.value, 'zh'),
      ),
      recommendOrgs: byCount(orgs.map((r) => ({ value: r.recommendOrg, count: r._count._all }))),
      origins: byCount(origins.map((r) => ({ value: r.origin, count: r._count._all }))),
    };
  }
}
