import { Injectable, NotFoundException } from '@nestjs/common';
import type { Hall as HallRow } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateHallDto, UpdateHallDto } from './dto/hall.dto';
import {
  FILE_ID_TO_URL,
  exhibitionAssetUrl,
  type Fixture,
  type HallMeta,
  type HallSummary,
  type ResolvedHall,
  type Wall,
} from './exhibition.types';
import { CONNECTORS, resolveConnectorPlaceholder } from './connectors';

interface AuditCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/**
 * 展厅服务:Hall CRUD + 「已解析」逻辑(规格 5.4 关键约定)。
 *
 * 存储态把素材以 storage fileId 引用;GET 详情时把 fileId 旁补成公开相对 URL,
 * 并把 connector 组件的内容取回(P1 占位),客户端拿到「已解析」展厅即可直接渲染。
 * 不直接接触 storage 字节(素材经 ExhibitionAssetController 公开口流式)。
 */
@Injectable()
export class ExhibitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 展厅目录(规格 5.5 GET /halls)。P1 返回全部含未发布,带 published 供前端筛。 */
  async list(): Promise<HallSummary[]> {
    const rows = await this.prisma.hall.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      thumbnail: r.thumbnailFileId ? exhibitionAssetUrl(r.thumbnailFileId) : null,
      published: r.published,
    }));
  }

  /** 单个展厅的「已解析」JSON(规格 5.5 GET /halls/:id) */
  async getResolved(id: string): Promise<ResolvedHall> {
    const row = await this.prisma.hall.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('展厅不存在');
    return this.resolveHall(row);
  }

  /** 可用连接器列表(规格 5.5 GET /connectors) */
  listConnectors() {
    return CONNECTORS;
  }

  async create(dto: CreateHallDto, ctx: AuditCtx): Promise<ResolvedHall> {
    const row = await this.prisma.hall.create({
      data: {
        name: dto.name,
        metaJson: dto.meta ? JSON.stringify(dto.meta) : undefined,
        wallsJson: dto.walls ? JSON.stringify(dto.walls) : undefined,
        fixturesJson: dto.fixtures ? JSON.stringify(dto.fixtures) : undefined,
        thumbnailFileId: dto.thumbnailFileId,
        envModelFileId: dto.envModelFileId,
        published: dto.published,
        sortOrder: dto.sortOrder,
        createdById: ctx.actorId,
      },
    });
    await this.audit.log({
      action: 'exhibition.hall.create',
      target: row.id,
      ...ctx,
      detail: JSON.stringify({ name: dto.name }),
    });
    return this.resolveHall(row);
  }

  async update(id: string, dto: UpdateHallDto, ctx: AuditCtx): Promise<ResolvedHall> {
    const exists = await this.prisma.hall.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('展厅不存在');
    const row = await this.prisma.hall.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        metaJson: dto.meta !== undefined ? JSON.stringify(dto.meta) : undefined,
        wallsJson: dto.walls !== undefined ? JSON.stringify(dto.walls) : undefined,
        fixturesJson:
          dto.fixtures !== undefined ? JSON.stringify(dto.fixtures) : undefined,
        thumbnailFileId: dto.thumbnailFileId ?? undefined,
        envModelFileId: dto.envModelFileId ?? undefined,
        published: dto.published ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
      },
    });
    await this.audit.log({
      action: 'exhibition.hall.update',
      target: id,
      ...ctx,
      detail: JSON.stringify({ keys: Object.keys(dto) }),
    });
    return this.resolveHall(row);
  }

  async remove(id: string, ctx: AuditCtx): Promise<{ ok: true }> {
    const exists = await this.prisma.hall.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('展厅不存在');
    await this.prisma.hall.delete({ where: { id } });
    await this.audit.log({
      action: 'exhibition.hall.delete',
      target: id,
      ...ctx,
      detail: JSON.stringify({ name: exists.name }),
    });
    return { ok: true };
  }

  /* ─── 内部:已解析 ─── */

  private resolveHall(row: HallRow): ResolvedHall {
    const fixtures = this.parseJson<Fixture[]>(row.fixturesJson, []);
    return {
      id: row.id,
      name: row.name,
      thumbnail: row.thumbnailFileId ? exhibitionAssetUrl(row.thumbnailFileId) : null,
      meta: this.parseJson<HallMeta>(row.metaJson, {}),
      envModelUrl: row.envModelFileId ? exhibitionAssetUrl(row.envModelFileId) : null,
      walls: this.parseJson<Wall[]>(row.wallsJson, []),
      fixtures: fixtures.map((fx) => this.resolveFixture(fx)),
    };
  }

  /** 解析单个组件:connector → 取数(P1 占位);manual → 把 content 里 fileId 旁补 url */
  private resolveFixture(fx: Fixture): Fixture {
    const source = fx.source ?? { mode: 'manual' as const };
    const content =
      source.mode === 'connector'
        ? resolveConnectorPlaceholder(source.connectorId)
        : this.resolveAssets(source.content);
    return { ...fx, source: { ...source, content } };
  }

  /** 递归:遇到 `xxxFileId` 字段(非空字符串)→ 旁补对应 url 键(见 FILE_ID_TO_URL) */
  private resolveAssets(node: unknown): unknown {
    if (Array.isArray(node)) return node.map((n) => this.resolveAssets(n));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = this.resolveAssets(v);
        const urlKey = FILE_ID_TO_URL[k];
        if (urlKey && typeof v === 'string' && v) {
          out[urlKey] = exhibitionAssetUrl(v);
        }
      }
      return out;
    }
    return node;
  }

  private parseJson<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  }
}
