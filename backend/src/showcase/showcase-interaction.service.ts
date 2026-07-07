import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import {
  REACTION_TYPES,
  TARGET_TYPES,
  VIEW_DEDUP_MINUTES,
  VIEW_DURATION_MAX_SEC,
  type ReactionType,
  type TargetType,
} from './showcase.constants';
import { CreateFeedbackDto, ReplyFeedbackDto } from './dto/interaction.dto';

interface ActorCtx {
  actorId: string;
  actorName?: string;
  ip?: string;
}

/**
 * 先锋晒场互动:点赞(多态 stage|entry,一账户一对象一次、可取消)/ 吐槽(可匿名+回复+关闭)/
 * 浏览量+时长(view-beacon)/ 统计。照 knowledge-interaction 范式:
 * 计数冗余在主表,事务内 increment;P2002/P2025 竞态视为幂等;返回权威状态。
 */
@Injectable()
export class ShowcaseInteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
  ) {}

  private async hasManage(userId: string): Promise<boolean> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      userId,
      'showcase:manage',
    );
    return isPlatformAdmin || entries.length > 0;
  }

  private assertTargetType(t: string): asserts t is TargetType {
    if (!TARGET_TYPES.includes(t as TargetType)) throw new BadRequestException('未知的互动对象类型');
  }

  /** 目标存在性 + 基本信息(标题/归属人:stage=台主、entry=作者+台主) */
  private async requireTarget(targetType: TargetType, targetId: string) {
    if (targetType === 'stage') {
      const s = await this.prisma.showcaseStage.findUnique({
        where: { id: targetId },
        select: { id: true, title: true, status: true, ownerId: true },
      });
      if (!s) throw new NotFoundException('晒台不存在');
      return { title: s.title, status: s.status, handlerIds: [s.ownerId] };
    }
    const e = await this.prisma.showcaseEntry.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, status: true, authorId: true, stage: { select: { ownerId: true } } },
    });
    if (!e) throw new NotFoundException('参晒作品不存在');
    return { title: e.title, status: e.status, handlerIds: [e.authorId, e.stage.ownerId] };
  }

  /* ═══════════ 点赞(toggle,幂等) ═══════════ */

  async setReaction(targetType: string, targetId: string, userId: string, type: string, on: boolean) {
    this.assertTargetType(targetType);
    if (!REACTION_TYPES.includes(type as ReactionType)) throw new BadRequestException('未知的互动类型');
    await this.requireTarget(targetType, targetId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.showcaseReaction.findUnique({
          where: { userId_targetType_targetId_type: { userId, targetType, targetId, type } },
          select: { id: true },
        });
        if (on && !existing) {
          await tx.showcaseReaction.create({ data: { targetType, targetId, userId, type } });
          await this.bumpLikeCount(tx, targetType, targetId, 1);
        } else if (!on && existing) {
          await tx.showcaseReaction.delete({ where: { id: existing.id } });
          await this.bumpLikeCount(tx, targetType, targetId, -1);
        }
      });
    } catch (e) {
      // 双击/并发竞态:P2002(已有)/ P2025(已删)= 幂等目标已达成,事务已回滚不重复计数
      const code = (e as { code?: string })?.code;
      if (code !== 'P2002' && code !== 'P2025') throw e;
    }
    return this.reactionState(targetType, targetId, userId);
  }

  private async bumpLikeCount(
    tx: Pick<PrismaService, 'showcaseStage' | 'showcaseEntry'>,
    targetType: TargetType,
    targetId: string,
    delta: 1 | -1,
  ) {
    const data = { likeCount: delta > 0 ? { increment: 1 } : { decrement: 1 } };
    if (targetType === 'stage') {
      await tx.showcaseStage.update({ where: { id: targetId }, data });
    } else {
      await tx.showcaseEntry.update({ where: { id: targetId }, data });
    }
  }

  /** 当前用户对该对象的点赞状态 + 权威计数 */
  async reactionState(targetType: string, targetId: string, userId: string) {
    this.assertTargetType(targetType);
    const [mine, likeCount] = await Promise.all([
      this.prisma.showcaseReaction.findFirst({
        where: { targetType, targetId, userId, type: 'like' },
        select: { id: true },
      }),
      targetType === 'stage'
        ? this.prisma.showcaseStage
            .findUnique({ where: { id: targetId }, select: { likeCount: true } })
            .then((s) => s?.likeCount ?? 0)
        : this.prisma.showcaseEntry
            .findUnique({ where: { id: targetId }, select: { likeCount: true } })
            .then((e) => e?.likeCount ?? 0),
    ]);
    return { liked: !!mine, likeCount };
  }

  /* ═══════════ 吐槽(不公开:台主/作者/管理员可见并回复) ═══════════ */

  async addFeedback(targetType: string, targetId: string, dto: CreateFeedbackDto, ctx: ActorCtx) {
    this.assertTargetType(targetType);
    await this.requireTarget(targetType, targetId);
    const fb = await this.prisma.showcaseFeedback.create({
      data: {
        targetType,
        targetId,
        userId: ctx.actorId,
        userName: ctx.actorName ?? '',
        anonymous: dto.anonymous ?? false,
        content: dto.content.trim(),
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'showcase.feedback.create',
      target: targetId,
      detail: { feedbackId: fb.id, targetType },
    });
    return { ok: true };
  }

  /**
   * scope=mine:我台主的晒台 + 我作者的作品 收到的吐槽;all:全部(仅 manage)。
   * 匿名对所有查看者隐名;目标已删显示「已删除」。
   */
  async listFeedback(userId: string, scope: 'mine' | 'all', status: string | undefined) {
    const manage = await this.hasManage(userId);
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (scope === 'all') {
      if (!manage) throw new ForbiddenException('无权查看全部吐槽');
    } else {
      const [myStages, myEntries] = await Promise.all([
        this.prisma.showcaseStage.findMany({ where: { ownerId: userId }, select: { id: true } }),
        this.prisma.showcaseEntry.findMany({ where: { authorId: userId }, select: { id: true } }),
      ]);
      where.OR = [
        { targetType: 'stage', targetId: { in: myStages.map((s) => s.id) } },
        { targetType: 'entry', targetId: { in: myEntries.map((e) => e.id) } },
      ];
    }
    const rows = await this.prisma.showcaseFeedback.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });

    // 反查目标标题(多态无 relation;两批 in 查询拼 Map)
    const stageIds = rows.filter((r) => r.targetType === 'stage').map((r) => r.targetId);
    const entryIds = rows.filter((r) => r.targetType === 'entry').map((r) => r.targetId);
    const [stages, entries] = await Promise.all([
      stageIds.length
        ? this.prisma.showcaseStage.findMany({ where: { id: { in: stageIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
      entryIds.length
        ? this.prisma.showcaseEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
    ]);
    const titleOf = new Map([...stages, ...entries].map((t) => [t.id, t.title]));

    return rows.map((f) => ({
      id: f.id,
      targetType: f.targetType,
      targetId: f.targetId,
      targetTitle: titleOf.get(f.targetId) ?? '(已删除)',
      userName: f.anonymous ? '匿名用户' : f.userName,
      anonymous: f.anonymous,
      content: f.content,
      status: f.status,
      createdAt: f.createdAt,
      replies: f.replies.map((r) => ({ id: r.id, userName: r.userName, content: r.content, createdAt: r.createdAt })),
    }));
  }

  /** 回复吐槽:目标的台主(stage)/作者或台主(entry)或管理员 */
  async replyFeedback(feedbackId: string, dto: ReplyFeedbackDto, ctx: ActorCtx) {
    const fb = await this.prisma.showcaseFeedback.findUnique({ where: { id: feedbackId } });
    if (!fb) throw new NotFoundException('吐槽不存在');
    await this.assertCanHandle(fb, ctx.actorId);
    const reply = await this.prisma.$transaction(async (tx) => {
      const r = await tx.showcaseFeedbackReply.create({
        data: { feedbackId, userId: ctx.actorId, userName: ctx.actorName ?? '', content: dto.content.trim() },
      });
      await tx.showcaseFeedback.update({ where: { id: feedbackId }, data: { status: 'replied' } });
      return r;
    });
    await this.audit.log({ ...ctx, action: 'showcase.feedback.reply', target: feedbackId });
    return reply;
  }

  async closeFeedback(feedbackId: string, ctx: ActorCtx) {
    const fb = await this.prisma.showcaseFeedback.findUnique({ where: { id: feedbackId } });
    if (!fb) throw new NotFoundException('吐槽不存在');
    await this.assertCanHandle(fb, ctx.actorId);
    await this.prisma.showcaseFeedback.update({ where: { id: feedbackId }, data: { status: 'closed' } });
    await this.audit.log({ ...ctx, action: 'showcase.feedback.close', target: feedbackId });
    return { ok: true };
  }

  private async assertCanHandle(fb: { targetType: string; targetId: string }, userId: string) {
    if (await this.hasManage(userId)) return;
    try {
      const t = await this.requireTarget(fb.targetType as TargetType, fb.targetId);
      if (t.handlerIds.includes(userId)) return;
    } catch {
      /* 目标已删 → 仅管理员可处理 */
    }
    throw new ForbiddenException('仅台主、作者或晒场管理员可处理该吐槽');
  }

  /* ═══════════ 浏览量 + 时长 ═══════════ */

  /**
   * 记浏览:每次进入建一条日志(返回 viewLogId 供 beacon 回填时长);
   * 同人同对象 30 分钟内重复进入不 +viewCount。事务 + 行锁防并发重复计数。
   */
  async recordView(targetType: string, targetId: string, actorId: string) {
    this.assertTargetType(targetType);
    const t = await this.requireTarget(targetType, targetId);
    const since = new Date(Date.now() - VIEW_DEDUP_MINUTES * 60_000);
    const countable = ['published', 'closed'].includes(t.status);
    return this.prisma.$transaction(async (tx) => {
      if (targetType === 'stage') {
        await tx.$queryRaw`SELECT id FROM "ShowcaseStage" WHERE id = ${targetId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "ShowcaseEntry" WHERE id = ${targetId} FOR UPDATE`;
      }
      const recent = await tx.showcaseViewLog.findFirst({
        where: { targetType, targetId, userId: actorId, createdAt: { gt: since } },
        select: { id: true },
      });
      const log = await tx.showcaseViewLog.create({ data: { targetType, targetId, userId: actorId } });
      let counted = false;
      if (!recent && countable) {
        const data = { viewCount: { increment: 1 } };
        if (targetType === 'stage') {
          await tx.showcaseStage.update({ where: { id: targetId }, data });
        } else {
          await tx.showcaseEntry.update({ where: { id: targetId }, data });
        }
        counted = true;
      }
      return { viewLogId: log.id, counted };
    });
  }

  /** 离开时回填时长(公开 beacon):只改已存在日志、取 max、封顶 4h(cuid 不可枚举) */
  async recordDuration(viewLogId: string, durationSec: number) {
    const log = await this.prisma.showcaseViewLog.findUnique({
      where: { id: viewLogId },
      select: { id: true, durationSec: true },
    });
    if (!log) return { ok: false };
    const next = Math.min(Math.max(durationSec, log.durationSec, 0), VIEW_DURATION_MAX_SEC);
    if (next !== log.durationSec) {
      await this.prisma.showcaseViewLog.update({ where: { id: viewLogId }, data: { durationSec: next } });
    }
    return { ok: true };
  }

  /* ═══════════ 统计(管理端) ═══════════ */

  async stats() {
    const [stageCount, entryCount, stageAgg, entryAgg, topStages, feedbackOpen] = await Promise.all([
      this.prisma.showcaseStage.count({ where: { status: { in: ['published', 'closed'] } } }),
      this.prisma.showcaseEntry.count({ where: { status: 'published' } }),
      this.prisma.showcaseStage.aggregate({
        where: { status: { in: ['published', 'closed'] } },
        _sum: { viewCount: true, likeCount: true },
      }),
      this.prisma.showcaseEntry.aggregate({
        where: { status: 'published' },
        _sum: { viewCount: true, likeCount: true },
      }),
      this.prisma.showcaseStage.findMany({
        where: { status: { in: ['published', 'closed'] } },
        orderBy: [{ likeCount: 'desc' }, { entryCount: 'desc' }],
        take: 10,
        select: { id: true, title: true, entryCount: true, viewCount: true, likeCount: true },
      }),
      this.prisma.showcaseFeedback.count({ where: { status: 'open' } }),
    ]);
    return {
      stageCount,
      entryCount,
      totalViews: (stageAgg._sum.viewCount ?? 0) + (entryAgg._sum.viewCount ?? 0),
      totalLikes: (stageAgg._sum.likeCount ?? 0) + (entryAgg._sum.likeCount ?? 0),
      feedbackOpen,
      topStages,
    };
  }
}
