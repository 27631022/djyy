/**
 * 公文排版的互动:收藏 / 吐槽反馈(可带失败样本)/ 浏览量+时长 / 统计。
 *
 * 照 knowledge-interaction、showcase-interaction 的范式,但**表是自建的**(`// @module: doc-format`)——
 * 复用别人的表会破 conventions 约束 #1;走对方的 Service 又语义荒谬(它们每个方法第一步都是
 * requireVisibleArticle/requireTarget,而这里根本没有「内容实例」)。showcase 当初面对同一道选择题
 * 也是自建(CLAUDE.md 2026-07-07「7 表 @module: showcase … 互动照 knowledge 全套」)。
 *
 * ⚠ 与那两家的**根本不同:这是单例工具页,不是内容实例**。所以两处不能照抄:
 * 1. 浏览量去重不能用 `FOR UPDATE` 行锁 —— 它们锁的是「被浏览的那条内容」,而这里只能锁一行
 *    统计行,那就成了全站访问都排队的热点锁。改用 (userId, 30分钟窗口) 唯一约束 + upsert,无锁幂等。
 * 2. 收藏不套多态 Reaction —— targetId 恒定会让 @@unique 退化。照 DirectoryFavorite 的窄表。
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import type { AuditCtx } from './doc-format.service';

/** 同一用户这个窗口内重复进入不重复计浏览量(与 knowledge/showcase 同口径) */
export const VIEW_DEDUP_MINUTES = 30;
/** 单次浏览时长上限(秒)= 4 小时,beacon 回填超出按此钳制 */
export const VIEW_DURATION_MAX_SEC = 14400;
/** 一条反馈最多带几个失败样本 */
export const FEEDBACK_MAX_FILES = 5;
/** 转换量数的就是这个审计动作 —— 它在 render 成功后打(doc-format.service) */
const RENDER_ACTION = 'doc-format.render';

export type FeedbackStatus = 'open' | 'replied' | 'closed';

export type FeedbackView = {
  id: string;
  content: string;
  userName: string;
  anonymous: boolean;
  files: { id: string; name: string }[];
  status: string;
  createdAt: Date;
  replies: { id: string; userName: string; content: string; createdAt: Date }[];
};

@Injectable()
export class DocFormatInteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
  ) {}

  /** 照 showcase-interaction.hasManage 同款写法(platform_admin 直通) */
  private async hasManage(userId: string): Promise<boolean> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      userId,
      'doc-format:manage',
    );
    return isPlatformAdmin || entries.length > 0;
  }

  private async assertManage(userId: string): Promise<void> {
    if (!(await this.hasManage(userId))) throw new ForbiddenException('只有管理员能处理反馈');
  }

  // --------------------------------------------------------------- 收藏

  /** toggle 收藏(幂等)。返回权威状态 */
  async setFavorite(userId: string, on: boolean) {
    try {
      if (on) {
        await this.prisma.docFormatFavorite.create({ data: { userId } });
      } else {
        await this.prisma.docFormatFavorite.delete({ where: { userId } });
      }
    } catch (e) {
      // P2002 已收藏 / P2025 删已删 —— 幂等目标已达成,不是错
      const code = (e as { code?: string })?.code;
      if (code !== 'P2002' && code !== 'P2025') throw e;
    }
    return this.favoriteState(userId);
  }

  async favoriteState(userId: string) {
    const [mine, count] = await Promise.all([
      this.prisma.docFormatFavorite.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.docFormatFavorite.count(),
    ]);
    return { favorited: !!mine, favoriteCount: count };
  }

  // --------------------------------------------------------------- 浏览量

  /** 30 分钟窗口的起点 —— 去重靠它 + 唯一约束,不用行锁 */
  private bucketOf(at: Date): Date {
    const ms = VIEW_DEDUP_MINUTES * 60_000;
    return new Date(Math.floor(at.getTime() / ms) * ms);
  }

  /**
   * 记浏览。同人同 30 分钟窗口复用同一行(upsert 幂等),返回 viewLogId 供 beacon 回填时长。
   * 没有行锁 —— 见文件头注释。
   */
  async recordView(userId: string) {
    const bucket = this.bucketOf(new Date());
    try {
      const log = await this.prisma.docFormatViewLog.upsert({
        where: { userId_bucket: { userId, bucket } },
        create: { userId, bucket },
        update: {},
        select: { id: true },
      });
      return { viewLogId: log.id };
    } catch (e) {
      // Prisma upsert 不是原子的:两个并发「首次浏览」可能都走 create 分支,后到的撞唯一约束 P2002。
      // 兜底改查已存在的那条(此时它一定在了),仍是「同窗口一条」的幂等目标。
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      const log = await this.prisma.docFormatViewLog.findUnique({
        where: { userId_bucket: { userId, bucket } },
        select: { id: true },
      });
      if (log) return { viewLogId: log.id };
      throw e;
    }
  }

  /** 离开时回填时长(公开 beacon):只改已存在的日志、取 max、封顶 4h(cuid 不可枚举) */
  async recordDuration(viewLogId: string, durationSec: number) {
    const log = await this.prisma.docFormatViewLog.findUnique({
      where: { id: viewLogId },
      select: { id: true, durationSec: true },
    });
    if (!log) return { ok: false };
    const next = Math.min(Math.max(durationSec, log.durationSec, 0), VIEW_DURATION_MAX_SEC);
    if (next !== log.durationSec) {
      await this.prisma.docFormatViewLog.update({ where: { id: viewLogId }, data: { durationSec: next } });
    }
    return { ok: true };
  }

  // --------------------------------------------------------------- 吐槽反馈

  private view(f: {
    id: string;
    content: string;
    userName: string;
    anonymous: boolean;
    fileIds: string | null;
    status: string;
    createdAt: Date;
    replies: { id: string; userName: string; content: string; createdAt: Date }[];
  }, names: Map<string, string>): FeedbackView {
    return {
      id: f.id,
      content: f.content,
      // 匿名只影响展示;userId 始终存(防刷/审计)
      userName: f.anonymous ? '匿名用户' : f.userName,
      anonymous: f.anonymous,
      files: parseFileIds(f.fileIds).map((id) => ({ id, name: names.get(id) ?? '(文件已清理)' })),
      status: f.status,
      createdAt: f.createdAt,
      replies: f.replies,
    };
  }

  /** 提交吐槽。fileIds 可含:本次反馈新传的失败样本,或用户刚转换的原件(不用再传一遍) */
  async addFeedback(
    dto: { content: string; anonymous?: boolean; fileIds?: string[] },
    ctx: AuditCtx & { actorId: string; actorName: string },
  ) {
    const fileIds = (dto.fileIds ?? []).slice(0, FEEDBACK_MAX_FILES);
    if (fileIds.length) await this.assertOwnFeedbackFiles(fileIds, ctx.actorId);
    const row = await this.prisma.docFormatFeedback.create({
      data: {
        userId: ctx.actorId,
        userName: ctx.actorName,
        anonymous: dto.anonymous ?? false,
        content: dto.content.trim(),
        fileIds: fileIds.length ? JSON.stringify(fileIds) : null,
      },
    });
    await this.audit.log({ action: 'doc-format.feedback.create', detail: row.id, ...ctx });
    return { ok: true as const, id: row.id };
  }

  /**
   * 反馈附件的归属校验。两类合法,其余一律拒:
   * 1. **本次反馈新传的样本**(folder=feedback)—— 走 uploadSample 传的。
   * 2. **用户刚转换的原件**(folder=source 且 createdById=本人)—— 「不用再传一遍文件」的入口:
   *    在工作台里发现转得不对,直接反馈,自动带上正在转的那份。凭 createdById 校验是本人的,
   *    防止拿到别人的 source fileId(cuid 虽不可枚举,仍要挡)。
   * 不校验的话任意 fileId 都能被引用进反馈:既能拿别的模块的文件当样本,又会让它们进
   * collectInUseFileIds 永不回收。
   */
  private async assertOwnFeedbackFiles(ids: string[], userId: string): Promise<void> {
    const rows = await this.prisma.storedFile.findMany({
      where: { id: { in: ids }, ownerModule: 'doc-format', deletedAt: null },
      select: { id: true, folder: true, createdById: true },
    });
    const ok = new Set(
      rows
        .filter(
          (r) =>
            r.folder === FOLDER_FEEDBACK ||
            (r.folder === FOLDER_SOURCE && r.createdById === userId),
        )
        .map((r) => r.id),
    );
    if (ids.some((id) => !ok.has(id))) throw new BadRequestException('附件无效,请重新上传');
  }

  async listFeedback(userId: string, scope: 'all' | 'mine', status?: string) {
    if (scope === 'all') await this.assertManage(userId);
    const rows = await this.prisma.docFormatFeedback.findMany({
      where: {
        ...(scope === 'mine' ? { userId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, userName: true, content: true, createdAt: true },
        },
      },
    });
    const names = await this.fileNames(rows.flatMap((r) => parseFileIds(r.fileIds)));
    return rows.map((r) => this.view(r, names));
  }

  private async fileNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.storedFile.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, originalName: true },
    });
    return new Map(rows.map((r) => [r.id, r.originalName]));
  }

  /** 回复(仅管理员)。与置 replied 同事务 */
  async replyFeedback(id: string, content: string, ctx: AuditCtx & { actorId: string; actorName: string }) {
    await this.assertManage(ctx.actorId);
    const f = await this.prisma.docFormatFeedback.findUnique({ where: { id }, select: { id: true } });
    if (!f) throw new NotFoundException('反馈不存在');
    await this.prisma.$transaction([
      this.prisma.docFormatFeedbackReply.create({
        data: { feedbackId: id, userId: ctx.actorId, userName: ctx.actorName, content: content.trim() },
      }),
      this.prisma.docFormatFeedback.update({ where: { id }, data: { status: 'replied' } }),
    ]);
    await this.audit.log({ action: 'doc-format.feedback.reply', detail: id, ...ctx });
    return { ok: true as const };
  }

  async closeFeedback(id: string, ctx: AuditCtx & { actorId: string }) {
    await this.assertManage(ctx.actorId);
    const f = await this.prisma.docFormatFeedback.findUnique({ where: { id }, select: { id: true } });
    if (!f) throw new NotFoundException('反馈不存在');
    await this.prisma.docFormatFeedback.update({ where: { id }, data: { status: 'closed' } });
    await this.audit.log({ action: 'doc-format.feedback.close', detail: id, ...ctx });
    return { ok: true as const };
  }

  // --------------------------------------------------------------- 统计

  /**
   * 页面显眼处要的那几个数。
   * ⚠ 转换量走 audit 的 countByAction,**不建计数表** —— render 成功本来就打审计,
   *   AuditLog 有 action 索引;而且这样功能上线即有真实历史数据,不用从 0 爬。
   */
  async stats(userId: string) {
    const [converted, viewCount, favorite, durationAgg, feedbackOpen] = await Promise.all([
      this.audit.countByAction(RENDER_ACTION),
      this.prisma.docFormatViewLog.count(),
      this.favoriteState(userId),
      this.prisma.docFormatViewLog.aggregate({ _sum: { durationSec: true } }),
      this.prisma.docFormatFeedback.count({ where: { status: 'open' } }),
    ]);
    return {
      /** 累计排版的文档份数 */
      converted,
      /** 浏览量(同人 30 分钟内算一次) */
      viewCount,
      favoriteCount: favorite.favoriteCount,
      favorited: favorite.favorited,
      totalDurationSec: durationAgg._sum.durationSec ?? 0,
      feedbackOpen,
    };
  }

  /**
   * 孤儿 GC 自报在用文件 —— **只报反馈里的失败样本**。
   *
   * 排版的原件/产物**故意不报**(它们是一次性加工,30 天后被回收正是要的,见 README);
   * 但反馈里的样本是长期留存的引用,不报就会被 purge 掉 —— 而它正是用来复现问题的东西。
   */
  async collectInUseFileIds(): Promise<string[]> {
    const rows = await this.prisma.docFormatFeedback.findMany({
      where: { fileIds: { not: null } },
      select: { fileIds: true },
    });
    return rows.flatMap((r) => parseFileIds(r.fileIds));
  }
}

/** 反馈附件的 storage 文件夹 */
export const FOLDER_FEEDBACK = 'feedback';
/** analyze 存原件的文件夹(与 doc-format.service 的 FOLDER_SOURCE 一致)—— 反馈复用当前文件时认它 */
const FOLDER_SOURCE = 'source';

function parseFileIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
