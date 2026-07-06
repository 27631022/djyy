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
  CONTENT_FILE_REF_RE,
  LIST_PAGE_SIZE_MAX,
  TAG_MAX_COUNT,
  TAG_MAX_LEN,
  VIEW_DEDUP_MINUTES,
} from './knowledge.constants';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateTypeDto, UpdateTypeDto } from './dto/create-type.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ReviewArticleDto } from './dto/review-article.dto';
import { AddAttachmentDto } from './dto/add-attachment.dto';

interface ActorCtx {
  actorId: string;
  actorName?: string;
  ip?: string;
}

export interface ArticleListQuery {
  q?: string;
  categoryId?: string;
  typeCode?: string;
  tag?: string;
  mine?: boolean;
  favorite?: boolean;
  status?: string;
  sort?: 'latest' | 'hot';
  page?: number;
  pageSize?: number;
}

/**
 * 知识分享平台 —— 分类/类型/文章 CRUD + 审核状态机 + 版本链 + 浏览计数。
 * 互动(评论/点赞/收藏/反馈)在 knowledge-interaction.service(P3);
 * 导入(P2)/AI(P4)各自独立 service。
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly roles: RoleService,
  ) {}

  /* ═══════════ 权限辅助 ═══════════ */

  /** 是否有 knowledge:manage(platform_admin 直通) */
  async hasManage(userId: string): Promise<boolean> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      userId,
      'knowledge:manage',
    );
    return isPlatformAdmin || entries.length > 0;
  }

  /**
   * 校验「作者本人或知识管理员」,返回**是否拥有 manage 权**(与「是否作者」正交)。
   * 注意:作者兼管理员时也要返回 true —— 否则管理员改/删自己发布的文章会被当普通作者拦。
   */
  private async assertAuthorOrManage(
    article: { authorId: string },
    userId: string,
    what: string,
  ): Promise<boolean> {
    const manage = await this.hasManage(userId);
    if (article.authorId !== userId && !manage) {
      throw new ForbiddenException(`仅作者本人或知识管理员可${what}`);
    }
    return manage;
  }

  /* ═══════════ 领域分类(两级树) ═══════════ */

  /** 两级分类树,带各分类 published 文章数(含子类累计到父) */
  async listCategories() {
    const cats = await this.prisma.knowledgeCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = await this.prisma.knowledgeArticle.groupBy({
      by: ['categoryId'],
      where: { status: 'published' },
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    type Node = (typeof cats)[number] & { articleCount: number; children: Node[] };
    const nodes: Node[] = cats.map((c) => ({
      ...c,
      articleCount: countOf.get(c.id) ?? 0,
      children: [],
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots: Node[] = [];
    for (const n of nodes) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (parent) {
        parent.children.push(n);
        parent.articleCount += n.articleCount; // 父类计数含子类
      } else {
        roots.push(n);
      }
    }
    return roots;
  }

  async createCategory(dto: CreateCategoryDto, ctx: ActorCtx) {
    if (dto.parentId) {
      const parent = await this.prisma.knowledgeCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('上级分类不存在');
      if (parent.parentId) throw new BadRequestException('分类最多两级,不能在二级分类下再建子类');
    }
    await this.assertCategoryNameFree(dto.name, dto.parentId ?? null);
    const cat = await this.prisma.knowledgeCategory.create({
      data: {
        name: dto.name,
        parentId: dto.parentId ?? null,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.category.create',
      target: cat.id,
      detail: { name: cat.name, parentId: cat.parentId },
    });
    return cat;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, ctx: ActorCtx) {
    const cat = await this.prisma.knowledgeCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    if (dto.name && dto.name !== cat.name) {
      await this.assertCategoryNameFree(dto.name, cat.parentId, id);
    }
    const updated = await this.prisma.knowledgeCategory.update({
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
      action: 'knowledge.category.update',
      target: id,
      detail: { name: updated.name },
    });
    return updated;
  }

  async removeCategory(id: string, ctx: ActorCtx) {
    const cat = await this.prisma.knowledgeCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    const childCount = await this.prisma.knowledgeCategory.count({ where: { parentId: id } });
    if (childCount > 0) throw new ConflictException('该分类下还有子分类,先删除或移走子分类');
    const articleCount = await this.prisma.knowledgeArticle.count({ where: { categoryId: id } });
    if (articleCount > 0) throw new ConflictException(`该分类下还有 ${articleCount} 篇文章,不能删除`);
    await this.prisma.knowledgeCategory.delete({ where: { id } });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.category.delete',
      target: id,
      detail: { name: cat.name },
    });
    return { ok: true };
  }

  /** 拖拽排序:批量更新同批分类的 sortOrder(前端拖完提交受影响组的新顺序) */
  async reorderCategories(items: Array<{ id: string; sortOrder: number }>, ctx: ActorCtx) {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.knowledgeCategory.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } }),
      ),
    );
    await this.audit.log({
      ...ctx,
      action: 'knowledge.category.reorder',
      detail: { count: items.length },
    });
    return { ok: true };
  }

  /** 同级重名校验(PG 的 UNIQUE 对 parentId=NULL 行不生效,只能在应用层保证) */
  private async assertCategoryNameFree(name: string, parentId: string | null, exceptId?: string) {
    const dup = await this.prisma.knowledgeCategory.findFirst({
      where: { name, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup) throw new ConflictException('同级已存在同名分类');
  }

  /* ═══════════ 内容类型(审核开关) ═══════════ */

  async listTypes() {
    return this.prisma.knowledgeType.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  async createType(dto: CreateTypeDto, ctx: ActorCtx) {
    const exists = await this.prisma.knowledgeType.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('类型代码已存在');
    const t = await this.prisma.knowledgeType.create({
      data: {
        code: dto.code,
        name: dto.name,
        requireReview: dto.requireReview ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({ ...ctx, action: 'knowledge.type.create', target: t.code, detail: t });
    return t;
  }

  async updateType(code: string, dto: UpdateTypeDto, ctx: ActorCtx) {
    const exists = await this.prisma.knowledgeType.findUnique({ where: { code } });
    if (!exists) throw new NotFoundException('类型不存在');
    const t = await this.prisma.knowledgeType.update({
      where: { code },
      data: { name: dto.name, requireReview: dto.requireReview, sortOrder: dto.sortOrder },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.type.update',
      target: code,
      detail: { name: t.name, requireReview: t.requireReview },
    });
    return t;
  }

  async removeType(code: string, ctx: ActorCtx) {
    const exists = await this.prisma.knowledgeType.findUnique({ where: { code } });
    if (!exists) throw new NotFoundException('类型不存在');
    const articleCount = await this.prisma.knowledgeArticle.count({ where: { typeCode: code } });
    if (articleCount > 0) throw new ConflictException(`还有 ${articleCount} 篇文章属于该类型,不能删除`);
    await this.prisma.knowledgeType.delete({ where: { code } });
    await this.audit.log({ ...ctx, action: 'knowledge.type.delete', target: code, detail: { name: exists.name } });
    return { ok: true };
  }

  /* ═══════════ 文章:读侧 ═══════════ */

  async listArticles(query: ArticleListQuery, actorId: string) {
    const manage = await this.hasManage(actorId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), LIST_PAGE_SIZE_MAX);

    // 可见性:默认只看 published(archived 永不进列表);mine=1 看自己全状态;manage 可按 status 筛(any=全部)
    let statusWhere: Record<string, unknown>;
    if (query.mine) {
      statusWhere =
        query.status && query.status !== 'any' ? { status: query.status } : { status: { not: 'archived' } };
    } else if (manage && query.status === 'any') {
      statusWhere = {}; // 管理员「全部状态」:不加 status 约束(含 archived)
    } else if (manage && query.status) {
      statusWhere = { status: query.status };
    } else {
      statusWhere = { status: 'published' };
    }

    // 选中顶级分类时,连同其子分类一起筛
    let categoryWhere: Record<string, unknown> = {};
    if (query.categoryId) {
      const children = await this.prisma.knowledgeCategory.findMany({
        where: { parentId: query.categoryId },
        select: { id: true },
      });
      categoryWhere = { categoryId: { in: [query.categoryId, ...children.map((c) => c.id)] } };
    }

    const q = query.q?.trim();
    const where = {
      ...statusWhere,
      ...categoryWhere,
      ...(query.typeCode ? { typeCode: query.typeCode } : {}),
      ...(query.mine ? { authorId: actorId } : {}),
      ...(query.favorite
        ? { reactions: { some: { userId: actorId, type: 'favorite' } } }
        : {}),
      ...(query.tag ? { tagsJson: { contains: `"${query.tag}"` } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { contentMd: { contains: q, mode: 'insensitive' as const } },
              { tagsJson: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sort === 'hot'
        ? [{ pinned: 'desc' as const }, { viewCount: 'desc' as const }, { publishedAt: 'desc' as const }]
        : [{ pinned: 'desc' as const }, { publishedAt: 'desc' as const }, { createdAt: 'desc' as const }];

    const [total, rows, types, cats] = await Promise.all([
      this.prisma.knowledgeArticle.count({ where }),
      this.prisma.knowledgeArticle.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.knowledgeType.findMany(),
      this.prisma.knowledgeCategory.findMany({ select: { id: true, name: true } }),
    ]);
    const typeName = new Map(types.map((t) => [t.code, t.name]));
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    return {
      total,
      page,
      pageSize,
      items: rows.map((a) => ({
        id: a.id,
        title: a.title,
        categoryId: a.categoryId,
        categoryName: catName.get(a.categoryId) ?? '',
        typeCode: a.typeCode,
        typeName: typeName.get(a.typeCode) ?? a.typeCode,
        tags: parseTags(a.tagsJson),
        excerpt: a.summary?.trim() || mdExcerpt(a.contentMd),
        status: a.status,
        rejectReason: a.rejectReason,
        source: a.source,
        authorId: a.authorId,
        authorName: a.authorName,
        versionLabel: a.versionLabel,
        pinned: a.pinned,
        coverFileId: a.coverFileId,
        viewCount: a.viewCount,
        likeCount: a.likeCount,
        favoriteCount: a.favoriteCount,
        commentCount: a.commentCount,
        publishedAt: a.publishedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    };
  }

  /** 详情:published/archived 登录可见;draft/pending/rejected 仅作者或 manage */
  async getArticle(id: string, actorId: string) {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { attachments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, category: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    if (!['published', 'archived'].includes(a.status)) {
      await this.assertAuthorOrManage(a, actorId, '查看未发布的文章');
    }
    const type = await this.prisma.knowledgeType.findUnique({ where: { code: a.typeCode } });

    // 版本链:同组其他版本(新版发布后旧版=archived;正常至多一篇 published)
    let versions: Array<{
      id: string;
      title: string;
      versionLabel: string | null;
      status: string;
      publishedAt: Date | null;
    }> = [];
    if (a.versionGroupId) {
      versions = await this.prisma.knowledgeArticle.findMany({
        where: {
          versionGroupId: a.versionGroupId,
          id: { not: a.id },
          status: { in: ['published', 'archived'] },
        },
        select: { id: true, title: true, versionLabel: true, status: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
      });
    }

    return {
      ...a,
      tags: parseTags(a.tagsJson),
      faqs: parseFaqs(a.faqJson),
      categoryName: a.category.name,
      typeName: type?.name ?? a.typeCode,
      requireReview: type?.requireReview ?? false,
      versions,
    };
  }

  /**
   * 记浏览:每次进入建一条日志(返回 viewLogId 供离开时 beacon 回填时长);
   * 同人同文 30 分钟内重复进入不 +viewCount。
   */
  async recordView(articleId: string, actorId: string) {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    const since = new Date(Date.now() - VIEW_DEDUP_MINUTES * 60_000);
    // 事务 + 文章行锁:防「先查后写」竞态(双标签页/预取并发进入)重复 +viewCount
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "KnowledgeArticle" WHERE id = ${articleId} FOR UPDATE`;
      const recent = await tx.knowledgeViewLog.findFirst({
        where: { articleId, userId: actorId, createdAt: { gt: since } },
        select: { id: true },
      });
      const log = await tx.knowledgeViewLog.create({ data: { articleId, userId: actorId } });
      let counted = false;
      if (!recent && ['published', 'archived'].includes(a.status)) {
        await tx.knowledgeArticle.update({
          where: { id: articleId },
          data: { viewCount: { increment: 1 } },
        });
        counted = true;
      }
      return { viewLogId: log.id, counted };
    });
  }

  /* ═══════════ 文章:写侧 + 状态机 + 版本链 ═══════════ */

  async createArticle(dto: CreateArticleDto, ctx: ActorCtx & { actorName: string }) {
    await this.assertCategoryAndType(dto.categoryId, dto.typeCode);

    // 版本链:修订版沿用旧文章的组 id(旧文章还没组 id 就用它自己的 id 建组)
    let versionGroupId: string | null = null;
    if (dto.revisionOfId) {
      const old = await this.prisma.knowledgeArticle.findUnique({
        where: { id: dto.revisionOfId },
        select: { id: true, versionGroupId: true },
      });
      if (!old) throw new NotFoundException('要修订的原文章不存在');
      versionGroupId = old.versionGroupId ?? old.id;
      if (!old.versionGroupId) {
        await this.prisma.knowledgeArticle.update({
          where: { id: old.id },
          data: { versionGroupId: old.id },
        });
      }
    }

    const a = await this.prisma.knowledgeArticle.create({
      data: {
        title: dto.title,
        categoryId: dto.categoryId,
        typeCode: dto.typeCode,
        contentMd: dto.contentMd,
        summary: dto.summary,
        tagsJson: normalizeTags(dto.tags),
        versionGroupId,
        versionLabel: dto.versionLabel,
        coverFileId: dto.coverFileId,
        sourceUrl: dto.sourceUrl,
        authorId: ctx.actorId,
        authorName: ctx.actorName,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.create',
      target: a.id,
      detail: { title: a.title, typeCode: a.typeCode, revisionOf: dto.revisionOfId },
    });
    return a;
  }

  async updateArticle(id: string, dto: UpdateArticleDto, ctx: ActorCtx) {
    const a = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    const byManage = await this.assertAuthorOrManage(a, ctx.actorId, '编辑该文章');
    // 作者可直接编辑自己任意状态(含已发布)的文章,直接生效不重新审核(用户拍板);
    // 仅历史归档版不允许作者改(避免篡改版本链留痕),管理员可改。
    if (a.status === 'archived' && !byManage) {
      throw new BadRequestException('历史归档版本不能编辑');
    }
    if (dto.pinned !== undefined && !byManage) {
      throw new ForbiddenException('仅知识管理员可置顶');
    }
    if (dto.categoryId || dto.typeCode) {
      await this.assertCategoryAndType(dto.categoryId ?? a.categoryId, dto.typeCode ?? a.typeCode);
    }
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title,
        categoryId: dto.categoryId,
        typeCode: dto.typeCode,
        contentMd: dto.contentMd,
        summary: dto.summary,
        ...(dto.tags !== undefined ? { tagsJson: normalizeTags(dto.tags) } : {}),
        versionLabel: dto.versionLabel,
        coverFileId: dto.coverFileId,
        sourceUrl: dto.sourceUrl,
        pinned: dto.pinned,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.update',
      target: id,
      detail: { title: updated.title },
    });
    return updated;
  }

  /** 提交:按内容类型的审核开关分流 —— 需审 → pending;免审(或提交人本就是管理员)→ 直接发布 */
  async submitArticle(id: string, ctx: ActorCtx) {
    const a = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    await this.assertAuthorOrManage(a, ctx.actorId, '提交该文章');
    if (!['draft', 'rejected'].includes(a.status)) {
      throw new BadRequestException('仅草稿或被驳回的文章可提交');
    }
    if (!a.contentMd.trim()) throw new BadRequestException('正文为空,不能提交');
    const type = await this.prisma.knowledgeType.findUnique({ where: { code: a.typeCode } });
    const needReview = (type?.requireReview ?? false) && !(await this.hasManage(ctx.actorId));

    if (needReview) {
      const updated = await this.prisma.knowledgeArticle.update({
        where: { id },
        data: { status: 'pending', rejectReason: null },
      });
      await this.audit.log({
        ...ctx,
        action: 'knowledge.article.submit',
        target: id,
        detail: { title: a.title, to: 'pending' },
      });
      return updated;
    }
    const published = await this.publishTx(a.id, a.versionGroupId, null);
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.publish',
      target: id,
      detail: { title: a.title, direct: true, archivedOld: !!a.versionGroupId },
    });
    return published;
  }

  /** 审核(仅 pending):通过 → 发布(含版本链归档旧版);驳回 → rejected + 原因 */
  async reviewArticle(id: string, dto: ReviewArticleDto, ctx: ActorCtx & { actorName: string }) {
    const a = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    if (a.status !== 'pending') throw new BadRequestException('该文章不在待审核状态');

    if (!dto.approve) {
      if (!dto.reason?.trim()) throw new BadRequestException('驳回必须填写原因');
      const rejected = await this.prisma.knowledgeArticle.update({
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
        action: 'knowledge.article.reject',
        target: id,
        detail: { title: a.title, reason: dto.reason },
      });
      return rejected;
    }

    const published = await this.publishTx(a.id, a.versionGroupId, {
      reviewedById: ctx.actorId,
      reviewedByName: ctx.actorName,
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.publish',
      target: id,
      detail: { title: a.title, viaReview: true, archivedOld: !!a.versionGroupId },
    });
    return published;
  }

  /** 下架:published → draft(管理员) */
  async unpublishArticle(id: string, ctx: ActorCtx) {
    const a = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    if (a.status !== 'published') throw new BadRequestException('仅已发布的文章可下架');
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { status: 'draft', publishedAt: null },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.unpublish',
      target: id,
      detail: { title: a.title },
    });
    return updated;
  }

  /** 删除:作者删自己的草稿/驳回稿;管理员删任意。联动删 storage 文件(附件/封面/正文图片)。 */
  async removeArticle(id: string, ctx: ActorCtx) {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    const byManage = await this.assertAuthorOrManage(a, ctx.actorId, '删除该文章');
    if (!byManage && !['draft', 'rejected'].includes(a.status)) {
      throw new BadRequestException('已发布的文章仅知识管理员可删除');
    }
    const fileIds = new Set<string>(a.attachments.map((att) => att.fileId));
    if (a.coverFileId) fileIds.add(a.coverFileId);
    for (const fid of extractContentFileIds(a.contentMd)) fileIds.add(fid);

    await this.prisma.knowledgeArticle.delete({ where: { id } }); // 附件/评论/互动 cascade
    // 删本文后再逐个判定:仍被其他文章(封面/正文/附件)引用的文件不删字节 ——
    // 防「复制旧版正文发修订版 / 共用封面」时删一篇误删另一篇仍在用的图片(softDelete 不可逆)
    let purged = 0;
    for (const fid of fileIds) {
      if (await this.fileStillInUse(fid)) continue;
      try {
        await this.storage.softDelete(fid, { actorId: ctx.actorId });
        purged += 1;
      } catch {
        /* 单个文件删失败不阻断(可能已被删) */
      }
    }
    await this.audit.log({
      ...ctx,
      action: 'knowledge.article.delete',
      target: id,
      detail: { title: a.title, filesPurged: purged, filesKept: fileIds.size - purged },
    });
    return { ok: true };
  }

  /** 某 storage 文件是否仍被任何知识文章引用(封面 / 正文内嵌 / 附件)—— 交叉校验防误删共用文件 */
  private async fileStillInUse(fileId: string): Promise<boolean> {
    const [att, cover, inBody] = await Promise.all([
      this.prisma.knowledgeAttachment.count({ where: { fileId } }),
      this.prisma.knowledgeArticle.count({ where: { coverFileId: fileId } }),
      this.prisma.knowledgeArticle.count({ where: { contentMd: { contains: fileId } } }),
    ]);
    return att > 0 || cover > 0 || inBody > 0;
  }

  /** 发布事务:同版本组其他 published → archived,自己 → published。
   * 先对同组所有行 FOR UPDATE 加锁,串行化并发审核 —— 防两个修订版几乎同时通过,
   * 各自的 updateMany 快照都没看到对方,导致「一个版本组两篇 published」破坏版本链不变量。 */
  private async publishTx(
    id: string,
    versionGroupId: string | null,
    reviewer: { reviewedById: string; reviewedByName: string } | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (versionGroupId) {
        await tx.$queryRaw`SELECT id FROM "KnowledgeArticle" WHERE "versionGroupId" = ${versionGroupId} FOR UPDATE`;
        await tx.knowledgeArticle.updateMany({
          where: { versionGroupId, id: { not: id }, status: 'published' },
          data: { status: 'archived' },
        });
      }
      return tx.knowledgeArticle.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          rejectReason: null,
          ...(reviewer ? { ...reviewer, reviewedAt: new Date() } : {}),
        },
      });
    });
  }

  private async assertCategoryAndType(categoryId: string, typeCode: string) {
    const [cat, type] = await Promise.all([
      this.prisma.knowledgeCategory.findUnique({ where: { id: categoryId } }),
      this.prisma.knowledgeType.findUnique({ where: { code: typeCode } }),
    ]);
    if (!cat) throw new BadRequestException('领域分类不存在');
    if (!type) throw new BadRequestException('内容类型不存在');
  }

  /* ═══════════ 附件 ═══════════ */

  /**
   * 规范命名上传:同一篇文章的图片/视频/附件统一存 `article-<id>` 文件夹,
   * 文件名 = 「文章标题-序号.扩展名」(挂群晖 File Station 一看即知属哪篇、第几个)。
   * 图片/视频(MdEditor)与附件(编辑器)都走它,集中管理 + 规范命名。
   */
  async uploadResource(
    articleId: string,
    file: { originalName: string; mimeType: string; buffer: Buffer },
    ctx: ActorCtx,
  ): Promise<{ fileId: string; url: string; name: string }> {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, authorId: true, title: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    await this.assertAuthorOrManage(a, ctx.actorId, '上传该文章资源');

    const folder = `article-${articleId}`;
    const seq = (await this.storage.countInFolder('knowledge', folder)) + 1;
    const dot = file.originalName.lastIndexOf('.');
    const ext = dot > 0 ? file.originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    // 标题去文件名非法字符 + 截断;空标题兜底「资源」
    const cleanTitle = (a.title.replace(/[\\/:*?"<>|]/g, '').trim() || '资源').slice(0, 40);
    const originalName = ext ? `${cleanTitle}-${seq}.${ext}` : `${cleanTitle}-${seq}`;

    const meta = await this.storage.put(
      {
        buffer: file.buffer,
        originalName,
        mimeType: file.mimeType,
        ownerModule: 'knowledge',
        folder,
        visibility: 'private',
        createdById: ctx.actorId,
      },
      ctx,
    );
    return { fileId: meta.id, url: `/api/public/knowledge/files/${meta.id}`, name: meta.originalName };
  }

  async addAttachment(articleId: string, dto: AddAttachmentDto, ctx: ActorCtx) {
    const a = await this.prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!a) throw new NotFoundException('文章不存在');
    await this.assertAuthorOrManage(a, ctx.actorId, '管理该文章附件');
    const meta = await this.storage.getMeta(dto.fileId); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'knowledge') {
      throw new BadRequestException('附件必须以 knowledge 模块身份上传');
    }
    const maxSort = await this.prisma.knowledgeAttachment.aggregate({
      where: { articleId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.knowledgeAttachment.create({
      data: {
        articleId,
        fileId: dto.fileId,
        name: dto.name?.trim() || meta.originalName,
        size: meta.size,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'knowledge.attachment.add',
      target: articleId,
      detail: { attachmentId: created.id, fileId: dto.fileId, name: created.name },
    });
    return created;
  }

  async removeAttachment(attachmentId: string, ctx: ActorCtx) {
    const att = await this.prisma.knowledgeAttachment.findUnique({
      where: { id: attachmentId },
      include: { article: { select: { id: true, authorId: true } } },
    });
    if (!att) throw new NotFoundException('附件不存在');
    await this.assertAuthorOrManage(att.article, ctx.actorId, '删除该附件');
    await this.prisma.knowledgeAttachment.delete({ where: { id: attachmentId } });
    // 交叉校验:同一文件被其他附件/封面/正文引用则不删字节(防误删共用文件)
    if (!(await this.fileStillInUse(att.fileId))) {
      try {
        await this.storage.softDelete(att.fileId, { actorId: ctx.actorId });
      } catch {
        /* 已删不阻断 */
      }
    }
    await this.audit.log({
      ...ctx,
      action: 'knowledge.attachment.remove',
      target: att.article.id,
      detail: { attachmentId, fileId: att.fileId, name: att.name },
    });
    return { ok: true };
  }

  /** 下载计数(前端随后经公开口取文件流) */
  async attachmentDownloaded(attachmentId: string) {
    const att = await this.prisma.knowledgeAttachment.update({
      where: { id: attachmentId },
      data: { downloadCount: { increment: 1 } },
    });
    return { fileId: att.fileId, name: att.name };
  }

  /* ═══════════ 孤儿 GC 协议(MaintenanceService 聚合调用) ═══════════ */

  /** 在用 storage 文件:附件 + 封面 + 正文内嵌引用。漏报会被孤儿 GC 误删。 */
  async collectInUseFileIds(): Promise<string[]> {
    const ids = new Set<string>();
    const atts = await this.prisma.knowledgeAttachment.findMany({ select: { fileId: true } });
    for (const t of atts) ids.add(t.fileId);
    const articles = await this.prisma.knowledgeArticle.findMany({
      select: { coverFileId: true, contentMd: true },
    });
    for (const a of articles) {
      if (a.coverFileId) ids.add(a.coverFileId);
      for (const fid of extractContentFileIds(a.contentMd)) ids.add(fid);
    }
    return [...ids];
  }
}

/* ═══════════ 纯函数 ═══════════ */

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const v = JSON.parse(tagsJson);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function parseFaqs(faqJson: string | null): Array<{ q: string; a: string }> {
  if (!faqJson) return [];
  try {
    const v = JSON.parse(faqJson);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is { q: string; a: string } =>
        !!x && typeof x.q === 'string' && typeof x.a === 'string',
    );
  } catch {
    return [];
  }
}

/** 标签归一化:去空白/去重/限个数与长度;空 → null */
function normalizeTags(tags?: string[]): string | null {
  if (!tags) return null;
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim().slice(0, TAG_MAX_LEN);
    if (t) seen.add(t);
    if (seen.size >= TAG_MAX_COUNT) break;
  }
  return seen.size ? JSON.stringify([...seen]) : null;
}

/** 粗剥 markdown 语法取列表摘要(不求完美,summary 缺失时兜底) */
function mdExcerpt(md: string, len = 140): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

/** 提取正文里的 storage 文件引用 id */
function extractContentFileIds(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(CONTENT_FILE_REF_RE)) out.push(m[1]);
  return out;
}
