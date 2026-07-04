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
