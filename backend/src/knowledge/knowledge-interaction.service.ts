import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import { REACTION_TYPES, VIEW_DURATION_MAX_SEC, type ReactionType } from './knowledge.constants';
import {
  CreateCommentDto,
  CreateFeedbackDto,
  ReplyFeedbackDto,
} from './dto/interaction.dto';

interface ActorCtx {
  actorId: string;
  actorName: string;
  ip?: string;
}

const COMMENT_PAGE_SIZE = 30;

/**
 * 知识分享互动:评论(单层+@回复)/ 点赞收藏(Reaction)/ 吐槽反馈(可匿名+回复)/ 浏览时长 / 统计。
 * 计数(likeCount/favoriteCount/commentCount)冗余在 KnowledgeArticle,事务内 increment 保持一致。
 */
@Injectable()
export class KnowledgeInteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
  ) {}

  private async hasManage(userId: string): Promise<boolean> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      userId,
      'knowledge:manage',
    );
    return isPlatformAdmin || entries.length > 0;
  }

  private async requireVisibleArticle(articleId: string) {
    const a = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, status: true, authorId: true, title: true },
    });
    if (!a) throw new NotFoundException('文章不存在');
    return a;
  }

  /* ═══════════ 点赞 / 收藏 ═══════════ */

  /** toggle:on=true 加,false 取消;返回最新状态与计数(幂等) */
  async setReaction(articleId: string, userId: string, type: string, on: boolean) {
    if (!REACTION_TYPES.includes(type as ReactionType)) throw new BadRequestException('未知的互动类型');
    await this.requireVisibleArticle(articleId);
    const countField = type === 'like' ? 'likeCount' : 'favoriteCount';

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.knowledgeReaction.findUnique({
          where: { userId_articleId_type: { userId, articleId, type } },
          select: { id: true },
        });
        if (on && !existing) {
          await tx.knowledgeReaction.create({ data: { articleId, userId, type } });
          await tx.knowledgeArticle.update({ where: { id: articleId }, data: { [countField]: { increment: 1 } } });
        } else if (!on && existing) {
          await tx.knowledgeReaction.delete({ where: { id: existing.id } });
          await tx.knowledgeArticle.update({ where: { id: articleId }, data: { [countField]: { decrement: 1 } } });
        }
      });
    } catch (e) {
      // 并发/双击竞态:P2002(唯一约束,已有同款 reaction)/ P2025(删已删)——
      // 均属幂等目标已达成,事务已回滚(不重复计数),返回权威状态即可,不抛 500。
      const code = (e as { code?: string })?.code;
      if (code !== 'P2002' && code !== 'P2025') throw e;
    }
    return this.reactionState(articleId, userId);
  }

  /** 当前用户对该文章的点赞/收藏状态 + 计数 */
  async reactionState(articleId: string, userId: string) {
    const [rows, article] = await Promise.all([
      this.prisma.knowledgeReaction.findMany({ where: { articleId, userId }, select: { type: true } }),
      this.prisma.knowledgeArticle.findUnique({
        where: { id: articleId },
        select: { likeCount: true, favoriteCount: true },
      }),
    ]);
    const types = new Set(rows.map((r) => r.type));
    return {
      liked: types.has('like'),
      favorited: types.has('favorite'),
      likeCount: article?.likeCount ?? 0,
      favoriteCount: article?.favoriteCount ?? 0,
    };
  }

  /* ═══════════ 评论 ═══════════ */

  async listComments(articleId: string, page = 1) {
    const p = Math.max(page, 1);
    const [total, rows] = await Promise.all([
      this.prisma.knowledgeComment.count({ where: { articleId } }),
      this.prisma.knowledgeComment.findMany({
        where: { articleId },
        orderBy: { createdAt: 'asc' },
        skip: (p - 1) * COMMENT_PAGE_SIZE,
        take: COMMENT_PAGE_SIZE,
      }),
    ]);
    return { total, page: p, pageSize: COMMENT_PAGE_SIZE, items: rows };
  }

  async addComment(articleId: string, dto: CreateCommentDto, ctx: ActorCtx) {
    await this.requireVisibleArticle(articleId);
    let replyToUserName: string | null = null;
    if (dto.replyToId) {
      const parent = await this.prisma.knowledgeComment.findUnique({
        where: { id: dto.replyToId },
        select: { articleId: true, userName: true },
      });
      // 被回复评论须属同文章;不存在则忽略回复关系(不报错)
      if (parent && parent.articleId === articleId) replyToUserName = parent.userName;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.knowledgeComment.create({
        data: {
          articleId,
          userId: ctx.actorId,
          userName: ctx.actorName,
          content: dto.content.trim(),
          replyToId: replyToUserName ? dto.replyToId : null,
          replyToUserName,
        },
      });
      await tx.knowledgeArticle.update({ where: { id: articleId }, data: { commentCount: { increment: 1 } } });
      return c;
    });
    await this.audit.log({ ...ctx, action: 'knowledge.comment.create', target: articleId, detail: { commentId: created.id } });
    return created;
  }

  async removeComment(commentId: string, ctx: ActorCtx) {
    const c = await this.prisma.knowledgeComment.findUnique({ where: { id: commentId } });
    if (!c) throw new NotFoundException('评论不存在');
    if (c.userId !== ctx.actorId && !(await this.hasManage(ctx.actorId))) {
      throw new ForbiddenException('只能删除自己的评论');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeComment.delete({ where: { id: commentId } });
        await tx.knowledgeArticle.update({ where: { id: c.articleId }, data: { commentCount: { decrement: 1 } } });
      });
    } catch (e) {
      // 双击/并发删同一条:P2025(已删)幂等返回,事务已回滚不重复 decrement
      if ((e as { code?: string })?.code !== 'P2025') throw e;
      return { ok: true };
    }
    await this.audit.log({ ...ctx, action: 'knowledge.comment.delete', target: c.articleId, detail: { commentId } });
    return { ok: true };
  }

  /* ═══════════ 吐槽反馈(不公开) ═══════════ */

  async addFeedback(articleId: string, dto: CreateFeedbackDto, ctx: ActorCtx) {
    await this.requireVisibleArticle(articleId);
    const fb = await this.prisma.knowledgeFeedback.create({
      data: {
        articleId,
        userId: ctx.actorId,
        userName: ctx.actorName,
        anonymous: dto.anonymous ?? false,
        content: dto.content.trim(),
      },
    });
    await this.audit.log({ ...ctx, action: 'knowledge.feedback.create', target: articleId, detail: { feedbackId: fb.id } });
    return { ok: true };
  }

  /** scope=mine:我发布的文章收到的反馈(作者视角);all:全部(仅 manage)。匿名对作者/管理员均隐去真实姓名。 */
  async listFeedback(userId: string, scope: 'mine' | 'all', status: string | undefined) {
    const manage = await this.hasManage(userId);
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (scope === 'all') {
      if (!manage) throw new ForbiddenException('无权查看全部反馈');
    } else {
      // mine:限本人作者的文章
      const mine = await this.prisma.knowledgeArticle.findMany({ where: { authorId: userId }, select: { id: true } });
      where.articleId = { in: mine.map((a) => a.id) };
    }
    const rows = await this.prisma.knowledgeFeedback.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        replies: { orderBy: { createdAt: 'asc' } },
        article: { select: { id: true, title: true } },
      },
    });
    return rows.map((f) => ({
      id: f.id,
      articleId: f.articleId,
      articleTitle: f.article.title,
      userName: f.anonymous ? '匿名用户' : f.userName,
      anonymous: f.anonymous,
      content: f.content,
      status: f.status,
      createdAt: f.createdAt,
      replies: f.replies.map((r) => ({ id: r.id, userName: r.userName, content: r.content, createdAt: r.createdAt })),
    }));
  }

  /** 回复反馈(作者或管理员)—— 须是该文章作者或有 manage */
  async replyFeedback(feedbackId: string, dto: ReplyFeedbackDto, ctx: ActorCtx) {
    const fb = await this.prisma.knowledgeFeedback.findUnique({
      where: { id: feedbackId },
      include: { article: { select: { authorId: true } } },
    });
    if (!fb) throw new NotFoundException('反馈不存在');
    if (fb.article.authorId !== ctx.actorId && !(await this.hasManage(ctx.actorId))) {
      throw new ForbiddenException('只有文章作者或管理员可回复反馈');
    }
    const reply = await this.prisma.$transaction(async (tx) => {
      const r = await tx.knowledgeFeedbackReply.create({
        data: { feedbackId, userId: ctx.actorId, userName: ctx.actorName, content: dto.content.trim() },
      });
      await tx.knowledgeFeedback.update({ where: { id: feedbackId }, data: { status: 'replied' } });
      return r;
    });
    await this.audit.log({ ...ctx, action: 'knowledge.feedback.reply', target: feedbackId });
    return reply;
  }

  async closeFeedback(feedbackId: string, ctx: ActorCtx) {
    const fb = await this.prisma.knowledgeFeedback.findUnique({
      where: { id: feedbackId },
      include: { article: { select: { authorId: true } } },
    });
    if (!fb) throw new NotFoundException('反馈不存在');
    if (fb.article.authorId !== ctx.actorId && !(await this.hasManage(ctx.actorId))) {
      throw new ForbiddenException('只有文章作者或管理员可关闭反馈');
    }
    await this.prisma.knowledgeFeedback.update({ where: { id: feedbackId }, data: { status: 'closed' } });
    await this.audit.log({ ...ctx, action: 'knowledge.feedback.close', target: feedbackId });
    return { ok: true };
  }

  /* ═══════════ 浏览时长(公开 beacon) ═══════════ */

  /** 离开时回填时长:只允许对已存在日志更新,取 max、封顶 4h(cuid 不可枚举,只能改这一条) */
  async recordDuration(viewLogId: string, durationSec: number) {
    const log = await this.prisma.knowledgeViewLog.findUnique({
      where: { id: viewLogId },
      select: { id: true, durationSec: true },
    });
    if (!log) return { ok: false };
    const next = Math.min(Math.max(durationSec, log.durationSec, 0), VIEW_DURATION_MAX_SEC);
    if (next !== log.durationSec) {
      await this.prisma.knowledgeViewLog.update({ where: { id: viewLogId }, data: { durationSec: next } });
    }
    return { ok: true };
  }

  /* ═══════════ 统计(管理端) ═══════════ */

  async stats() {
    const [articleCount, agg, topViewed, topLiked, topFav, durationAgg, feedbackOpen] = await Promise.all([
      this.prisma.knowledgeArticle.count({ where: { status: 'published' } }),
      this.prisma.knowledgeArticle.aggregate({
        where: { status: 'published' },
        _sum: { viewCount: true, likeCount: true, favoriteCount: true, commentCount: true },
      }),
      this.prisma.knowledgeArticle.findMany({
        where: { status: 'published' },
        orderBy: { viewCount: 'desc' },
        take: 10,
        select: { id: true, title: true, viewCount: true, likeCount: true, commentCount: true },
      }),
      this.prisma.knowledgeArticle.findMany({
        where: { status: 'published' },
        orderBy: { likeCount: 'desc' },
        take: 10,
        select: { id: true, title: true, likeCount: true, favoriteCount: true, commentCount: true },
      }),
      this.prisma.knowledgeArticle.findMany({
        where: { status: 'published' },
        orderBy: { favoriteCount: 'desc' },
        take: 10,
        select: { id: true, title: true, favoriteCount: true },
      }),
      this.prisma.knowledgeViewLog.aggregate({ _sum: { durationSec: true }, _count: { _all: true } }),
      this.prisma.knowledgeFeedback.count({ where: { status: 'open' } }),
    ]);
    return {
      articleCount,
      totalViews: agg._sum.viewCount ?? 0,
      totalLikes: agg._sum.likeCount ?? 0,
      totalFavorites: agg._sum.favoriteCount ?? 0,
      totalComments: agg._sum.commentCount ?? 0,
      totalViewLogs: durationAgg._count._all,
      totalDurationSec: durationAgg._sum.durationSec ?? 0,
      feedbackOpen,
      topViewed,
      topLiked,
      topFavorited: topFav,
    };
  }
}
