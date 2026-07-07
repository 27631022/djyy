import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { StorageService } from '../storage';
import { RoleService } from '../role';
import {
  ENTRY_BLOCKS_MAX,
  LIST_PAGE_SIZE_MAX,
  STAGE_INTRO_BLOCKS_MAX,
} from './showcase.constants';
import { collectBlocksFileIds, normalizeBlocks, parseBlocks } from './showcase-blocks';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { ReviewDto } from './dto/review.dto';

interface ActorCtx {
  actorId: string;
  actorName?: string;
  ip?: string;
}

export interface StageListQuery {
  q?: string;
  categoryId?: string;
  mine?: boolean;
  status?: string;
  sort?: 'latest' | 'hot';
  page?: number;
  pageSize?: number;
}

export interface EntryListQuery {
  status?: string;
  sort?: 'rank' | 'latest';
  page?: number;
  pageSize?: number;
}

/** 榜单值格式化(后端统一算好 display 下发,前端不再算) */
function fmtMetric(value: number, decimals: number, unit?: string | null): string {
  const s = value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${s} ${unit}` : s;
}

/**
 * 先锋晒场 —— 分类 / 晒台(擂台)/ 参晒作品 CRUD + 双层审核状态机 + 台内排位 + 上传。
 * 互动(点赞/吐槽/浏览)在 showcase-interaction.service。
 * 晒台:台主发起 → 管理员审核上架(管理员本人免审)→ 开放参晒;published ↔ closed。
 * 作品:登录即可投稿 → 台主或管理员审核(本人=台主/管理员免审);
 *       published 被作者再编辑 → 回 pending 重审(防赛后篡改申报值)。
 */
@Injectable()
export class ShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly roles: RoleService,
  ) {}

  /* ═══════════ 权限辅助 ═══════════ */

  /** 是否有 showcase:manage(platform_admin 直通) */
  async hasManage(userId: string): Promise<boolean> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      userId,
      'showcase:manage',
    );
    return isPlatformAdmin || entries.length > 0;
  }

  /** 校验「台主本人或晒场管理员」,返回是否拥有 manage 权(台主兼管理员也返回 true) */
  private async assertOwnerOrManage(
    stage: { ownerId: string },
    userId: string,
    what: string,
  ): Promise<boolean> {
    const manage = await this.hasManage(userId);
    if (stage.ownerId !== userId && !manage) {
      throw new ForbiddenException(`仅台主本人或晒场管理员可${what}`);
    }
    return manage;
  }

  /* ═══════════ 晒场分类(六榜,扁平) ═══════════ */

  /** 分类列表,带各分类已上架晒台数 */
  async listCategories() {
    const [cats, counts] = await Promise.all([
      this.prisma.showcaseCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.showcaseStage.groupBy({
        by: ['categoryId'],
        where: { status: { in: ['published', 'closed'] } },
        _count: { _all: true },
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return cats.map((c) => ({ ...c, stageCount: countOf.get(c.id) ?? 0 }));
  }

  async createCategory(dto: CreateCategoryDto, ctx: ActorCtx) {
    await this.assertCategoryNameFree(dto.name);
    const cat = await this.prisma.showcaseCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.category.create',
      target: cat.id,
      detail: { name: cat.name },
    });
    return cat;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, ctx: ActorCtx) {
    const cat = await this.prisma.showcaseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    if (dto.name && dto.name !== cat.name) await this.assertCategoryNameFree(dto.name, id);
    const updated = await this.prisma.showcaseCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.category.update',
      target: id,
      detail: { name: updated.name },
    });
    return updated;
  }

  async removeCategory(id: string, ctx: ActorCtx) {
    const cat = await this.prisma.showcaseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    const stageCount = await this.prisma.showcaseStage.count({ where: { categoryId: id } });
    if (stageCount > 0) throw new ConflictException(`该分类下还有 ${stageCount} 个晒台,不能删除`);
    await this.prisma.showcaseCategory.delete({ where: { id } });
    await this.audit.log({
      ...ctx,
      action: 'showcase.category.delete',
      target: id,
      detail: { name: cat.name },
    });
    return { ok: true };
  }

  /** 拖拽排序:批量更新 sortOrder */
  async reorderCategories(items: Array<{ id: string; sortOrder: number }>, ctx: ActorCtx) {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.showcaseCategory.update({
          where: { id: it.id },
          data: { sortOrder: it.sortOrder },
        }),
      ),
    );
    await this.audit.log({ ...ctx, action: 'showcase.category.reorder', detail: { count: items.length } });
    return { ok: true };
  }

  private async assertCategoryNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.showcaseCategory.findFirst({
      where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup) throw new ConflictException('已存在同名分类');
  }

  /* ═══════════ 晒台:读侧 ═══════════ */

  async listStages(query: StageListQuery, actorId: string) {
    const manage = await this.hasManage(actorId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), LIST_PAGE_SIZE_MAX);

    // 可见性:默认只看 published+closed;mine=1 看自己全状态;manage 可按 status 筛(any=全部)
    let statusWhere: Record<string, unknown>;
    if (query.mine) {
      statusWhere =
        query.status && query.status !== 'any' ? { status: query.status } : {};
    } else if (manage && query.status === 'any') {
      statusWhere = {};
    } else if (manage && query.status) {
      statusWhere = { status: query.status };
    } else {
      statusWhere = { status: { in: ['published', 'closed'] } };
    }

    const q = query.q?.trim();
    const where = {
      ...statusWhere,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.mine ? { ownerId: actorId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { intro: { contains: q, mode: 'insensitive' as const } },
              { ownerName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sort === 'hot'
        ? [{ pinned: 'desc' as const }, { likeCount: 'desc' as const }, { publishedAt: 'desc' as const }]
        : [{ pinned: 'desc' as const }, { publishedAt: 'desc' as const }, { createdAt: 'desc' as const }];

    const [total, rows, cats] = await Promise.all([
      this.prisma.showcaseStage.count({ where }),
      this.prisma.showcaseStage.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.showcaseCategory.findMany({ select: { id: true, name: true } }),
    ]);
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    return {
      total,
      page,
      pageSize,
      items: rows.map((s) => ({
        id: s.id,
        title: s.title,
        categoryId: s.categoryId,
        categoryName: catName.get(s.categoryId) ?? '',
        intro: s.intro,
        coverFileId: s.coverFileId,
        rankBy: s.rankBy,
        metricLabel: s.metricLabel,
        metricUnit: s.metricUnit,
        status: s.status,
        rejectReason: s.rejectReason,
        ownerId: s.ownerId,
        ownerName: s.ownerName,
        pinned: s.pinned,
        viewCount: s.viewCount,
        likeCount: s.likeCount,
        entryCount: s.entryCount,
        publishedAt: s.publishedAt,
        createdAt: s.createdAt,
      })),
    };
  }

  /** 详情:published/closed 登录可见;draft/pending/rejected 仅台主或 manage */
  async getStage(id: string, actorId: string) {
    const s = await this.prisma.showcaseStage.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!s) throw new NotFoundException('晒台不存在');
    const manage = await this.hasManage(actorId);
    const isOwner = s.ownerId === actorId;
    if (!['published', 'closed'].includes(s.status) && !isOwner && !manage) {
      throw new ForbiddenException('无权查看未上架的晒台');
    }
    const [myReaction, pendingEntryCount, myEntries] = await Promise.all([
      this.prisma.showcaseReaction.findFirst({
        where: { targetType: 'stage', targetId: id, userId: actorId, type: 'like' },
        select: { id: true },
      }),
      isOwner || manage
        ? this.prisma.showcaseEntry.count({ where: { stageId: id, status: 'pending' } })
        : Promise.resolve(0),
      this.prisma.showcaseEntry.findMany({
        where: { stageId: id, authorId: actorId },
        select: { id: true, title: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      ...s,
      categoryName: s.category.name,
      category: undefined,
      introBlocks: parseBlocks(s.introBlocksJson),
      introBlocksJson: undefined,
      liked: !!myReaction,
      isOwner,
      canManage: manage,
      canReview: isOwner || manage,
      pendingEntryCount,
      myEntries,
    };
  }

  /* ═══════════ 晒台:写侧 + 状态机 ═══════════ */

  async createStage(dto: CreateStageDto, ctx: ActorCtx & { actorName: string }) {
    const cat = await this.prisma.showcaseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!cat) throw new BadRequestException('晒场分类不存在');
    const introBlocks = normalizeBlocks(dto.introBlocks, {
      max: STAGE_INTRO_BLOCKS_MAX,
      what: '台头介绍',
    });
    const s = await this.prisma.showcaseStage.create({
      data: {
        title: dto.title,
        categoryId: dto.categoryId,
        intro: dto.intro,
        rulesMd: dto.rulesMd,
        introBlocksJson: introBlocks.length ? JSON.stringify(introBlocks) : null,
        coverFileId: dto.coverFileId,
        rankBy: dto.rankBy ?? 'likes',
        metricLabel: dto.metricLabel,
        metricUnit: dto.metricUnit,
        metricDecimals: dto.metricDecimals ?? 0,
        metricOrder: dto.metricOrder ?? 'desc',
        ownerId: ctx.actorId,
        ownerName: ctx.actorName,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.stage.create',
      target: s.id,
      detail: { title: s.title, rankBy: s.rankBy },
    });
    return s;
  }

  async updateStage(id: string, dto: UpdateStageDto, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    const manage = await this.assertOwnerOrManage(s, ctx.actorId, '编辑该晒台');
    if (dto.pinned !== undefined && !manage) {
      throw new ForbiddenException('仅晒场管理员可置顶');
    }
    if (dto.categoryId && dto.categoryId !== s.categoryId) {
      const cat = await this.prisma.showcaseCategory.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('晒场分类不存在');
    }

    // 排位配置锁:已有参晒作品(任意状态)后不允许再改 rankBy/metric 四件套(防旧作品申报值失义)
    const rankChanged =
      (dto.rankBy !== undefined && dto.rankBy !== s.rankBy) ||
      (dto.metricLabel !== undefined && dto.metricLabel !== s.metricLabel) ||
      (dto.metricUnit !== undefined && dto.metricUnit !== s.metricUnit) ||
      (dto.metricDecimals !== undefined && dto.metricDecimals !== s.metricDecimals) ||
      (dto.metricOrder !== undefined && dto.metricOrder !== s.metricOrder);
    if (rankChanged) {
      const entryCount = await this.prisma.showcaseEntry.count({ where: { stageId: id } });
      if (entryCount > 0) {
        throw new BadRequestException('晒台已有参晒作品,排位方式与比拼指标不能再修改');
      }
    }

    const updated = await this.prisma.showcaseStage.update({
      where: { id },
      data: {
        title: dto.title,
        categoryId: dto.categoryId,
        intro: dto.intro,
        rulesMd: dto.rulesMd,
        ...(dto.introBlocks !== undefined
          ? {
              introBlocksJson: (() => {
                const blocks = normalizeBlocks(dto.introBlocks, {
                  max: STAGE_INTRO_BLOCKS_MAX,
                  what: '台头介绍',
                });
                return blocks.length ? JSON.stringify(blocks) : null;
              })(),
            }
          : {}),
        coverFileId: dto.coverFileId,
        rankBy: dto.rankBy,
        metricLabel: dto.metricLabel,
        metricUnit: dto.metricUnit,
        metricDecimals: dto.metricDecimals,
        metricOrder: dto.metricOrder,
        pinned: dto.pinned,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.stage.update',
      target: id,
      detail: { title: updated.title },
    });
    return updated;
  }

  /** 提交:draft/rejected → pending;提交人有 manage → 直接上架(免审) */
  async submitStage(id: string, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    await this.assertOwnerOrManage(s, ctx.actorId, '提交该晒台');
    if (!['draft', 'rejected'].includes(s.status)) {
      throw new BadRequestException('仅草稿或被驳回的晒台可提交');
    }
    if (s.rankBy === 'metric' && !s.metricLabel?.trim()) {
      throw new BadRequestException('按数值比拼的晒台需要先填写比拼指标名称');
    }
    if (await this.hasManage(ctx.actorId)) {
      const published = await this.prisma.showcaseStage.update({
        where: { id },
        data: { status: 'published', publishedAt: new Date(), rejectReason: null },
      });
      await this.audit.log({
        ...ctx,
        action: 'showcase.stage.publish',
        target: id,
        detail: { title: s.title, direct: true },
      });
      return published;
    }
    const updated = await this.prisma.showcaseStage.update({
      where: { id },
      data: { status: 'pending', rejectReason: null },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.stage.submit',
      target: id,
      detail: { title: s.title, to: 'pending' },
    });
    return updated;
  }

  /** 审核(仅 pending,manage):通过 → 上架;驳回 → rejected + 原因 */
  async reviewStage(id: string, dto: ReviewDto, ctx: ActorCtx & { actorName: string }) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    if (s.status !== 'pending') throw new BadRequestException('该晒台不在待审核状态');

    if (!dto.approve) {
      if (!dto.reason?.trim()) throw new BadRequestException('驳回必须填写原因');
      const rejected = await this.prisma.showcaseStage.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectReason: dto.reason.trim(),
          reviewedById: ctx.actorId,
          reviewedByName: ctx.actorName,
          reviewedAt: new Date(),
        },
      });
      await this.audit.log({
        ...ctx,
        action: 'showcase.stage.reject',
        target: id,
        detail: { title: s.title, reason: dto.reason },
      });
      return rejected;
    }
    const published = await this.prisma.showcaseStage.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        rejectReason: null,
        reviewedById: ctx.actorId,
        reviewedByName: ctx.actorName,
        reviewedAt: new Date(),
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.stage.publish',
      target: id,
      detail: { title: s.title, viaReview: true },
    });
    return published;
  }

  /** 关闭:published → closed(停止收稿、榜单定格、仍可浏览) */
  async closeStage(id: string, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    await this.assertOwnerOrManage(s, ctx.actorId, '关闭该晒台');
    if (s.status !== 'published') throw new BadRequestException('仅上架中的晒台可关闭');
    const updated = await this.prisma.showcaseStage.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date() },
    });
    await this.audit.log({ ...ctx, action: 'showcase.stage.close', target: id, detail: { title: s.title } });
    return updated;
  }

  /** 重开:closed → published */
  async reopenStage(id: string, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    await this.assertOwnerOrManage(s, ctx.actorId, '重开该晒台');
    if (s.status !== 'closed') throw new BadRequestException('仅已关闭的晒台可重开');
    const updated = await this.prisma.showcaseStage.update({
      where: { id },
      data: { status: 'published', closedAt: null },
    });
    await this.audit.log({ ...ctx, action: 'showcase.stage.reopen', target: id, detail: { title: s.title } });
    return updated;
  }

  /** 下架(仅 manage):published/closed → draft(违规内容整体隐藏;台主改后可重新提交) */
  async unpublishStage(id: string, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('晒台不存在');
    if (!['published', 'closed'].includes(s.status)) {
      throw new BadRequestException('仅已上架/已关闭的晒台可下架');
    }
    const updated = await this.prisma.showcaseStage.update({
      where: { id },
      data: { status: 'draft', publishedAt: null, closedAt: null },
    });
    await this.audit.log({ ...ctx, action: 'showcase.stage.unpublish', target: id, detail: { title: s.title } });
    return updated;
  }

  /** 删除:台主删自己的草稿/驳回稿;管理员删任意。级联删作品 + 联动删 storage 文件与点赞行。 */
  async removeStage(id: string, ctx: ActorCtx) {
    const s = await this.prisma.showcaseStage.findUnique({
      where: { id },
      include: { entries: { select: { id: true, coverFileId: true, blocksJson: true } } },
    });
    if (!s) throw new NotFoundException('晒台不存在');
    const manage = await this.assertOwnerOrManage(s, ctx.actorId, '删除该晒台');
    if (!manage && !['draft', 'rejected'].includes(s.status)) {
      throw new BadRequestException('已上架的晒台仅晒场管理员可删除');
    }

    const fileIds = new Set<string>();
    if (s.coverFileId) fileIds.add(s.coverFileId);
    for (const fid of collectBlocksFileIds(s.introBlocksJson)) fileIds.add(fid);
    for (const e of s.entries) {
      if (e.coverFileId) fileIds.add(e.coverFileId);
      for (const fid of collectBlocksFileIds(e.blocksJson)) fileIds.add(fid);
    }
    const entryIds = s.entries.map((e) => e.id);

    await this.prisma.$transaction([
      // 多态松引用无 cascade:点赞行联动清(吐槽/浏览日志留档,列表显「已删除」)
      this.prisma.showcaseReaction.deleteMany({
        where: {
          OR: [
            { targetType: 'stage', targetId: id },
            ...(entryIds.length ? [{ targetType: 'entry', targetId: { in: entryIds } }] : []),
          ],
        },
      }),
      this.prisma.showcaseStage.delete({ where: { id } }), // 作品 cascade
    ]);

    // 删库后逐个交叉校验再删字节(softDelete 不可逆,防共用文件误删)
    let purged = 0;
    for (const fid of fileIds) {
      if (await this.fileStillInUse(fid)) continue;
      try {
        await this.storage.softDelete(fid, { actorId: ctx.actorId });
        purged += 1;
      } catch {
        /* 单个失败不阻断 */
      }
    }
    await this.audit.log({
      ...ctx,
      action: 'showcase.stage.delete',
      target: id,
      detail: { title: s.title, entries: entryIds.length, filesPurged: purged },
    });
    return { ok: true };
  }

  /* ═══════════ 台内榜单 ═══════════ */

  /**
   * 榜单:全部 published 作品内存排名(量级几十~几百)。
   * likes 按点赞数;metric 按申报数值(升/降序按台配置,null 者列「未申报」区)。
   * **竞争排名(1,2,2,4)**:值相同名次相同;并列时先发布者列前(先交先得)。
   */
  async getRanking(stageId: string, actorId: string) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id: stageId } });
    if (!s) throw new NotFoundException('晒台不存在');
    const manage = await this.hasManage(actorId);
    if (!['published', 'closed'].includes(s.status) && s.ownerId !== actorId && !manage) {
      throw new ForbiddenException('无权查看未上架的晒台');
    }

    const entries = await this.prisma.showcaseEntry.findMany({
      where: { stageId, status: 'published' },
      select: {
        id: true,
        title: true,
        authorId: true,
        authorName: true,
        coverFileId: true,
        likeCount: true,
        metricValue: true,
        publishedAt: true,
      },
    });

    const byTime = (a: { publishedAt: Date | null }, b: { publishedAt: Date | null }) =>
      (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);

    let ranked: typeof entries;
    let unranked: typeof entries = [];
    let valueOf: (e: (typeof entries)[number]) => number;

    if (s.rankBy === 'metric') {
      ranked = entries.filter((e) => e.metricValue !== null);
      unranked = entries.filter((e) => e.metricValue === null);
      const dir = s.metricOrder === 'asc' ? 1 : -1;
      ranked.sort((a, b) => dir * ((a.metricValue as number) - (b.metricValue as number)) || byTime(a, b));
      valueOf = (e) => e.metricValue as number;
    } else {
      ranked = [...entries];
      ranked.sort((a, b) => b.likeCount - a.likeCount || byTime(a, b));
      valueOf = (e) => e.likeCount;
    }

    // 竞争排名:与前一名同值 → 沿用名次
    let prevValue: number | null = null;
    let prevRank = 0;
    const items = ranked.map((e, i) => {
      const v = valueOf(e);
      const rank = prevValue !== null && v === prevValue ? prevRank : i + 1;
      prevValue = v;
      prevRank = rank;
      return {
        rank,
        entryId: e.id,
        title: e.title,
        authorId: e.authorId,
        authorName: e.authorName,
        coverFileId: e.coverFileId,
        value: v,
        display:
          s.rankBy === 'metric'
            ? fmtMetric(v, s.metricDecimals, s.metricUnit)
            : `${v} 赞`,
      };
    });

    return {
      rankBy: s.rankBy,
      metricLabel: s.metricLabel,
      metricUnit: s.metricUnit,
      metricDecimals: s.metricDecimals,
      metricOrder: s.metricOrder,
      items,
      unranked: unranked.map((e) => ({
        entryId: e.id,
        title: e.title,
        authorName: e.authorName,
      })),
      myEntryIds: entries.filter((e) => e.authorId === actorId).map((e) => e.id),
    };
  }

  /* ═══════════ 参晒作品 ═══════════ */

  async listEntries(stageId: string, query: EntryListQuery, actorId: string) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id: stageId } });
    if (!s) throw new NotFoundException('晒台不存在');
    const manage = await this.hasManage(actorId);
    const isOwner = s.ownerId === actorId;
    if (!['published', 'closed'].includes(s.status) && !isOwner && !manage) {
      throw new ForbiddenException('无权查看未上架的晒台');
    }

    // 默认只看 published;pending/rejected/any 审核队列仅台主或 manage
    let statusWhere: Record<string, unknown> = { status: 'published' };
    if (query.status && query.status !== 'published') {
      if (!isOwner && !manage) throw new ForbiddenException('仅台主或管理员可查看待审作品');
      statusWhere = query.status === 'any' ? {} : { status: query.status };
    }

    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), LIST_PAGE_SIZE_MAX);
    const where = { stageId, ...statusWhere };

    // rank 序:likes 台按点赞、metric 台按申报值(null 靠后);latest 按发布/创建时间
    const dir = s.metricOrder === 'asc' ? ('asc' as const) : ('desc' as const);
    const orderBy =
      query.sort === 'rank'
        ? s.rankBy === 'metric'
          ? [{ metricValue: { sort: dir, nulls: 'last' as const } }, { publishedAt: 'asc' as const }]
          : [{ likeCount: 'desc' as const }, { publishedAt: 'asc' as const }]
        : [{ publishedAt: 'desc' as const }, { createdAt: 'desc' as const }];

    const [total, rows] = await Promise.all([
      this.prisma.showcaseEntry.count({ where }),
      this.prisma.showcaseEntry.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((e) => this.entryListItem(e)),
    };
  }

  /** 跨台作品列表(管理员审核页):按状态筛,带晒台标题 */
  async listAllEntries(query: { status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), LIST_PAGE_SIZE_MAX);
    const where = query.status && query.status !== 'any' ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.showcaseEntry.count({ where }),
      this.prisma.showcaseEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { stage: { select: { id: true, title: true, status: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((e) => ({
        ...this.entryListItem(e),
        stageTitle: e.stage.title,
        stageStatus: e.stage.status,
      })),
    };
  }

  /** 我的参晒(跨晒台,「我的」页) */
  async listMyEntries(actorId: string) {
    const rows = await this.prisma.showcaseEntry.findMany({
      where: { authorId: actorId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { stage: { select: { id: true, title: true, status: true, rankBy: true, metricLabel: true, metricUnit: true } } },
    });
    return rows.map((e) => ({
      ...this.entryListItem(e),
      stageTitle: e.stage.title,
      stageStatus: e.stage.status,
    }));
  }

  private entryListItem(e: {
    id: string;
    stageId: string;
    title: string;
    summary: string | null;
    coverFileId: string | null;
    metricValue: number | null;
    status: string;
    rejectReason: string | null;
    authorId: string;
    authorName: string;
    viewCount: number;
    likeCount: number;
    publishedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      stageId: e.stageId,
      title: e.title,
      summary: e.summary,
      coverFileId: e.coverFileId,
      metricValue: e.metricValue,
      status: e.status,
      rejectReason: e.rejectReason,
      authorId: e.authorId,
      authorName: e.authorName,
      viewCount: e.viewCount,
      likeCount: e.likeCount,
      publishedAt: e.publishedAt,
      createdAt: e.createdAt,
    };
  }

  /** 投稿(登录即可):晒台须上架中;建草稿先拿 id(区块内上传要挂 entry-<id> 文件夹) */
  async createEntry(stageId: string, dto: CreateEntryDto, ctx: ActorCtx & { actorName: string }) {
    const s = await this.prisma.showcaseStage.findUnique({ where: { id: stageId } });
    if (!s) throw new NotFoundException('晒台不存在');
    if (s.status === 'closed') throw new BadRequestException('晒台已收官,不再接收参晒');
    if (s.status !== 'published') throw new BadRequestException('晒台尚未上架,不能投稿');

    const blocks = normalizeBlocks(dto.blocks, { max: ENTRY_BLOCKS_MAX, what: '参晒作品' });
    const e = await this.prisma.showcaseEntry.create({
      data: {
        stageId,
        title: dto.title,
        summary: dto.summary,
        coverFileId: dto.coverFileId,
        blocksJson: JSON.stringify(blocks),
        metricValue: dto.metricValue,
        authorId: ctx.actorId,
        authorName: ctx.actorName,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.entry.create',
      target: e.id,
      detail: { stageId, title: e.title },
    });
    return e;
  }

  /** 详情:published 登录可见;draft/pending/rejected 仅作者/台主/manage */
  async getEntry(id: string, actorId: string) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id },
      include: {
        stage: {
          select: {
            id: true,
            title: true,
            status: true,
            ownerId: true,
            ownerName: true,
            rankBy: true,
            metricLabel: true,
            metricUnit: true,
            metricDecimals: true,
            metricOrder: true,
          },
        },
      },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    const manage = await this.hasManage(actorId);
    const isAuthor = e.authorId === actorId;
    const isStageOwner = e.stage.ownerId === actorId;
    if (e.status !== 'published' && !isAuthor && !isStageOwner && !manage) {
      throw new ForbiddenException('无权查看未公开的参晒作品');
    }
    // 晒台被下架(unpublish→draft)= 违规内容**整体**隐藏:已公开作品也不能再走直链看
    // (作品仍保持 published,重新上架自动恢复、entryCount 语义不漂移;仅可见性随台收紧)
    if (!['published', 'closed'].includes(e.stage.status) && !isAuthor && !isStageOwner && !manage) {
      throw new ForbiddenException('该作品所属晒台未上架');
    }

    const [myReaction, rank] = await Promise.all([
      this.prisma.showcaseReaction.findFirst({
        where: { targetType: 'entry', targetId: id, userId: actorId, type: 'like' },
        select: { id: true },
      }),
      e.status === 'published' ? this.entryRank(e) : Promise.resolve(null),
    ]);

    return {
      ...e,
      blocks: parseBlocks(e.blocksJson),
      blocksJson: undefined,
      stage: {
        ...e.stage,
        metricDisplay:
          e.metricValue !== null && e.stage.rankBy === 'metric'
            ? fmtMetric(e.metricValue, e.stage.metricDecimals, e.stage.metricUnit)
            : null,
      },
      rank,
      liked: !!myReaction,
      isAuthor,
      canReview: isStageOwner || manage,
      canEdit: isAuthor || manage,
    };
  }

  /** 单作品当前名次(竞争排名:比我值好的作品数 + 1) */
  private async entryRank(e: {
    stageId: string;
    likeCount: number;
    metricValue: number | null;
    stage: { rankBy: string; metricOrder: string };
  }): Promise<number | null> {
    if (e.stage.rankBy === 'metric') {
      if (e.metricValue === null) return null;
      const better = await this.prisma.showcaseEntry.count({
        where: {
          stageId: e.stageId,
          status: 'published',
          metricValue:
            e.stage.metricOrder === 'asc' ? { lt: e.metricValue } : { gt: e.metricValue },
        },
      });
      return better + 1;
    }
    const better = await this.prisma.showcaseEntry.count({
      where: { stageId: e.stageId, status: 'published', likeCount: { gt: e.likeCount } },
    });
    return better + 1;
  }

  /**
   * 编辑:作者或 manage(台主非作者不能代改内容,只能审)。
   * **published 被作者编辑 → 回 pending 重审**(防赛后篡改申报值;manage 或 作者=台主 改不回炉)。
   */
  async updateEntry(id: string, dto: UpdateEntryDto, ctx: ActorCtx) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id },
      include: { stage: { select: { ownerId: true } } },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    const manage = await this.hasManage(ctx.actorId);
    const isAuthor = e.authorId === ctx.actorId;
    if (!isAuthor && !manage) throw new ForbiddenException('仅作者本人或晒场管理员可编辑该作品');

    const trusted = manage || e.stage.ownerId === ctx.actorId; // 台主/管理员本人改不回炉
    const demote = e.status === 'published' && !trusted;

    const data: Record<string, unknown> = {
      title: dto.title,
      summary: dto.summary,
      coverFileId: dto.coverFileId,
      metricValue: dto.metricValue,
      ...(dto.blocks !== undefined
        ? {
            blocksJson: JSON.stringify(
              normalizeBlocks(dto.blocks, { max: ENTRY_BLOCKS_MAX, what: '参晒作品' }),
            ),
          }
        : {}),
      ...(demote ? { status: 'pending', rejectReason: null } : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.showcaseEntry.update({ where: { id }, data });
      if (demote) {
        // 公开榜单少一件 → 冗余计数同步
        await tx.showcaseStage.update({
          where: { id: e.stageId },
          data: { entryCount: { decrement: 1 } },
        });
      }
      return u;
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.entry.update',
      target: id,
      detail: { title: updated.title, demoted: demote },
    });
    return updated;
  }

  /** 提交:draft/rejected → pending;作者=台主或有 manage → 免审直发 */
  async submitEntry(id: string, ctx: ActorCtx) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id },
      include: {
        stage: { select: { id: true, status: true, ownerId: true, rankBy: true, metricLabel: true } },
      },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    if (e.authorId !== ctx.actorId) throw new ForbiddenException('仅作者本人可提交作品');
    if (!['draft', 'rejected'].includes(e.status)) {
      throw new BadRequestException('仅草稿或被驳回的作品可提交');
    }
    if (e.stage.status !== 'published') {
      throw new BadRequestException('晒台已收官或未上架,不能提交');
    }
    if (parseBlocks(e.blocksJson).length === 0) {
      throw new BadRequestException('作品还没有任何展示内容,先添加至少一个展示区块');
    }
    if (e.stage.rankBy === 'metric' && e.metricValue === null) {
      throw new BadRequestException(`请填写申报数值:${e.stage.metricLabel ?? '比拼指标'}`);
    }

    const direct = e.stage.ownerId === ctx.actorId || (await this.hasManage(ctx.actorId));
    if (direct) {
      const published = await this.publishEntryTx(id, e.stageId, null);
      await this.audit.log({
        ...ctx,
        action: 'showcase.entry.publish',
        target: id,
        detail: { title: e.title, direct: true },
      });
      return published;
    }
    const updated = await this.prisma.showcaseEntry.update({
      where: { id },
      data: { status: 'pending', rejectReason: null },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.entry.submit',
      target: id,
      detail: { title: e.title, to: 'pending' },
    });
    return updated;
  }

  /** 审核作品(台主或 manage,service 内判):通过 → 公开 + entryCount+1;驳回 → rejected */
  async reviewEntry(id: string, dto: ReviewDto, ctx: ActorCtx & { actorName: string }) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id },
      include: { stage: { select: { id: true, ownerId: true } } },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    if (e.stage.ownerId !== ctx.actorId && !(await this.hasManage(ctx.actorId))) {
      throw new ForbiddenException('仅台主或晒场管理员可审核参晒作品');
    }
    if (e.status !== 'pending') throw new BadRequestException('该作品不在待审核状态');

    if (!dto.approve) {
      if (!dto.reason?.trim()) throw new BadRequestException('驳回必须填写原因');
      const rejected = await this.prisma.showcaseEntry.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectReason: dto.reason.trim(),
          reviewedById: ctx.actorId,
          reviewedByName: ctx.actorName,
          reviewedAt: new Date(),
        },
      });
      await this.audit.log({
        ...ctx,
        action: 'showcase.entry.reject',
        target: id,
        detail: { title: e.title, reason: dto.reason },
      });
      return rejected;
    }
    const published = await this.publishEntryTx(id, e.stage.id, {
      reviewedById: ctx.actorId,
      reviewedByName: ctx.actorName,
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.entry.publish',
      target: id,
      detail: { title: e.title, viaReview: true },
    });
    return published;
  }

  /** 公开作品事务:status→published + 台 entryCount+1(冗余计数与状态同事务保持一致) */
  private async publishEntryTx(
    id: string,
    stageId: string,
    reviewer: { reviewedById: string; reviewedByName: string } | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.showcaseEntry.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          rejectReason: null,
          ...(reviewer ? { ...reviewer, reviewedAt: new Date() } : {}),
        },
      });
      await tx.showcaseStage.update({ where: { id: stageId }, data: { entryCount: { increment: 1 } } });
      return u;
    });
  }

  /** 删除:作者删自己的草稿/驳回稿;台主/管理员删任意。联动删 storage 文件与点赞行。 */
  async removeEntry(id: string, ctx: ActorCtx) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id },
      include: { stage: { select: { id: true, ownerId: true } } },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    const manage = await this.hasManage(ctx.actorId);
    const isAuthor = e.authorId === ctx.actorId;
    const isStageOwner = e.stage.ownerId === ctx.actorId;
    if (!isAuthor && !isStageOwner && !manage) {
      throw new ForbiddenException('仅作者本人、台主或晒场管理员可删除该作品');
    }
    if (isAuthor && !isStageOwner && !manage && !['draft', 'rejected'].includes(e.status)) {
      throw new BadRequestException('已提交/已公开的作品请联系台主或管理员删除');
    }

    const fileIds = new Set<string>();
    if (e.coverFileId) fileIds.add(e.coverFileId);
    for (const fid of collectBlocksFileIds(e.blocksJson)) fileIds.add(fid);

    await this.prisma.$transaction(async (tx) => {
      await tx.showcaseReaction.deleteMany({ where: { targetType: 'entry', targetId: id } });
      await tx.showcaseEntry.delete({ where: { id } });
      if (e.status === 'published') {
        await tx.showcaseStage.update({
          where: { id: e.stage.id },
          data: { entryCount: { decrement: 1 } },
        });
      }
    });

    let purged = 0;
    for (const fid of fileIds) {
      if (await this.fileStillInUse(fid)) continue;
      try {
        await this.storage.softDelete(fid, { actorId: ctx.actorId });
        purged += 1;
      } catch {
        /* 单个失败不阻断 */
      }
    }
    await this.audit.log({
      ...ctx,
      action: 'showcase.entry.delete',
      target: id,
      detail: { title: e.title, stageId: e.stage.id, filesPurged: purged },
    });
    return { ok: true };
  }

  /* ═══════════ 资源上传(规范命名:标题-序号) ═══════════ */

  /** 晒台资源(封面/台头区块图):台主或 manage;存 stage-<id> 文件夹 */
  async uploadStageFile(
    stageId: string,
    file: { originalName: string; mimeType: string; buffer: Buffer },
    ctx: ActorCtx,
  ) {
    const s = await this.prisma.showcaseStage.findUnique({
      where: { id: stageId },
      select: { id: true, ownerId: true, title: true },
    });
    if (!s) throw new NotFoundException('晒台不存在');
    await this.assertOwnerOrManage(s, ctx.actorId, '上传该晒台资源');
    return this.putNamedFile(`stage-${stageId}`, s.title, file, ctx);
  }

  /** 作品资源(封面/区块图/视频):作者或 manage;存 entry-<id> 文件夹 */
  async uploadEntryFile(
    entryId: string,
    file: { originalName: string; mimeType: string; buffer: Buffer },
    ctx: ActorCtx,
  ) {
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id: entryId },
      select: { id: true, authorId: true, title: true },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    if (e.authorId !== ctx.actorId && !(await this.hasManage(ctx.actorId))) {
      throw new ForbiddenException('仅作者本人或晒场管理员可上传该作品资源');
    }
    return this.putNamedFile(`entry-${entryId}`, e.title, file, ctx);
  }

  private async putNamedFile(
    folder: string,
    title: string,
    file: { originalName: string; mimeType: string; buffer: Buffer },
    ctx: ActorCtx,
  ): Promise<{ fileId: string; url: string; name: string }> {
    const seq = (await this.storage.countInFolder('showcase', folder)) + 1;
    const dot = file.originalName.lastIndexOf('.');
    const ext = dot > 0 ? file.originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const cleanTitle = (title.replace(/[\\/:*?"<>|]/g, '').trim() || '资源').slice(0, 40);
    const originalName = ext ? `${cleanTitle}-${seq}.${ext}` : `${cleanTitle}-${seq}`;

    const meta = await this.storage.put(
      {
        buffer: file.buffer,
        originalName,
        mimeType: file.mimeType,
        ownerModule: 'showcase',
        folder,
        visibility: 'private',
        createdById: ctx.actorId,
      },
      ctx,
    );
    return { fileId: meta.id, url: `/api/public/showcase/files/${meta.id}`, name: meta.originalName };
  }

  /** 某 storage 文件是否仍被任何晒台/作品引用(封面 / 区块 JSON)—— 交叉校验防误删共用文件 */
  private async fileStillInUse(fileId: string): Promise<boolean> {
    const [stageCover, stageBlocks, entryCover, entryBlocks] = await Promise.all([
      this.prisma.showcaseStage.count({ where: { coverFileId: fileId } }),
      this.prisma.showcaseStage.count({ where: { introBlocksJson: { contains: fileId } } }),
      this.prisma.showcaseEntry.count({ where: { coverFileId: fileId } }),
      this.prisma.showcaseEntry.count({ where: { blocksJson: { contains: fileId } } }),
    ]);
    return stageCover > 0 || stageBlocks > 0 || entryCover > 0 || entryBlocks > 0;
  }

  /* ═══════════ 孤儿 GC 协议(MaintenanceService 聚合调用) ═══════════ */

  /** 在用 storage 文件:晒台封面/台头区块 + 作品封面/区块。**全状态收集**(草稿/驳回稿作者还会改)。 */
  async collectInUseFileIds(): Promise<string[]> {
    const ids = new Set<string>();
    const stages = await this.prisma.showcaseStage.findMany({
      select: { coverFileId: true, introBlocksJson: true },
    });
    for (const s of stages) {
      if (s.coverFileId) ids.add(s.coverFileId);
      for (const fid of collectBlocksFileIds(s.introBlocksJson)) ids.add(fid);
    }
    const entries = await this.prisma.showcaseEntry.findMany({
      select: { coverFileId: true, blocksJson: true },
    });
    for (const e of entries) {
      if (e.coverFileId) ids.add(e.coverFileId);
      for (const fid of collectBlocksFileIds(e.blocksJson)) ids.add(fid);
    }
    return [...ids];
  }
}
