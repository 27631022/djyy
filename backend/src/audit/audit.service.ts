import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';

export interface AuditLogInput {
  actorId?: string;
  actorName?: string;
  action: string;
  target?: string;
  pluginName?: string;
  detail?: unknown;
  ip?: string;
}

export interface AuditListQuery {
  take?: number;
  skip?: number;
  action?: string;
  actorId?: string;
  pluginName?: string;
  since?: Date;
  until?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 写入审计日志。失败不抛异常 (避免业务操作被审计写入连累),
   * 而是降级为 logger.error。
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          actorName: input.actorName,
          action: input.action,
          target: input.target,
          pluginName: input.pluginName,
          detail: input.detail === undefined ? null : JSON.stringify(input.detail),
          ip: input.ip,
        },
      });
    } catch (err) {
      this.logger.error(`审计日志写入失败 action=${input.action}: ${(err as Error).message}`);
    }
  }

  /**
   * 数某个 action 发生了多少次(精确匹配,走 AuditLog 的 action 索引)。
   *
   * 给业务模块拿「累计干了多少次」这类计数用(如公文排版的「已转换 N 份」)——
   * 审计里本来就有,不必为一个计数器再建表,而且功能上线即有真实历史数据、不用从 0 爬。
   * ⚠ 别绕过本方法直查 AuditLog:conventions.md 的「AuditLog 例外」只豁免了 auth.controller 直**写**。
   */
  async countByAction(action: string, since?: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: { action, ...(since ? { createdAt: { gte: since } } : {}) },
    });
  }

  /**
   * 分页查询审计日志,新到旧排序。
   * detail 字段反序列化回对象,前端无需自行 JSON.parse。
   */
  async list(query: AuditListQuery) {
    const { take = 50, skip = 0, action, actorId, pluginName, since, until } = query;
    const records = await this.prisma.auditLog.findMany({
      where: {
        ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
        ...(actorId ? { actorId } : {}),
        ...(pluginName ? { pluginName } : {}),
        ...(since || until
          ? {
              createdAt: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      skip: Math.max(skip, 0),
    });
    const total = await this.prisma.auditLog.count({
      where: {
        ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
        ...(actorId ? { actorId } : {}),
        ...(pluginName ? { pluginName } : {}),
        ...(since || until
          ? {
              createdAt: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            }
          : {}),
      },
    });
    return {
      total,
      items: records.map((r) => ({
        ...r,
        detail: r.detail ? safeParse(r.detail) : null,
      })),
    };
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
