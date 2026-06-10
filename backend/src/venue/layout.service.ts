import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface LayoutRow {
  id: string;
  roomId: string;
  name: string;
  layoutJson: string;
  thumbnail: string | null;
  width: number;
  height: number;
  gridSize: number;
  seatCount: number;
  active: boolean;
  status: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 空画布默认值(与前端 VenueDesignerState 对齐;真正的初始化在设计器里) */
function emptyLayoutJson(width: number, height: number, gridSize: number): string {
  return JSON.stringify({
    elements: [],
    background: { type: 'color', color: '#FFFFFF' },
    canvasWidth: width,
    canvasHeight: height,
    gridSize,
    showGrid: true,
  });
}

/**
 * 会场图 CRUD。layoutJson 是可序列化的画布状态(VenueDesignerState)。
 * 列表不返回 layoutJson(体积大),详情才返回完整画布。
 * 写操作 @Permission('venue:manage');读仅登录。
 */
@Injectable()
export class LayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 列表(可按 roomId 过滤);不含 layoutJson */
  async list(roomId?: string, status?: string) {
    const where: { roomId?: string; status?: string } = {};
    if (roomId) where.roomId = roomId;
    if (status) where.status = status;
    const rows = await this.prisma.venueLayout.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map((r) => this.toListItem(r));
  }

  /** 详情(含 layoutJson) */
  async findOne(id: string) {
    const r = await this.prisma.venueLayout.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('会场图不存在');
    return this.toPublic(r);
  }

  async create(dto: CreateLayoutDto, actor: ActorContext) {
    const room = await this.prisma.meetingRoom.findUnique({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('会议室不存在');

    const width = dto.width ?? 1200;
    const height = dto.height ?? 800;
    const gridSize = dto.gridSize ?? 20;
    const layoutJson = dto.layoutJson ?? emptyLayoutJson(width, height, gridSize);

    const created = await this.prisma.venueLayout.create({
      data: {
        roomId: dto.roomId,
        name: dto.name,
        layoutJson,
        width,
        height,
        gridSize,
        createdById: actor.actorId,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.layout.create',
      target: created.id,
      detail: { name: created.name, roomId: dto.roomId },
    });
    return this.toPublic(created);
  }

  async update(id: string, dto: UpdateLayoutDto, actor: ActorContext) {
    const before = await this.prisma.venueLayout.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('会场图不存在');

    await this.prisma.venueLayout.update({
      where: { id },
      data: {
        name: dto.name,
        layoutJson: dto.layoutJson,
        thumbnail: dto.thumbnail,
        width: dto.width,
        height: dto.height,
        gridSize: dto.gridSize,
        seatCount: dto.seatCount,
        active: dto.active,
        status: dto.status,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.layout.update',
      target: id,
      detail: { name: before.name },
    });
    return this.findOne(id);
  }

  async remove(id: string, actor: ActorContext) {
    const r = await this.prisma.venueLayout.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('会场图不存在');
    const planCount = await this.prisma.seatingPlan.count({ where: { layoutId: id } });
    if (planCount > 0) {
      throw new ConflictException('该会场图已被选座方案引用,不能删除');
    }
    await this.prisma.venueLayout.delete({ where: { id } });
    await this.audit.log({
      ...actor,
      action: 'venue.layout.delete',
      target: id,
      detail: { name: r.name, roomId: r.roomId },
    });
    return { id, deleted: true };
  }

  /** 另存为新图:复制一张,状态置草稿(原图不动);发布后才进排座可选列表 */
  async duplicate(id: string, actor: ActorContext) {
    const src = await this.prisma.venueLayout.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('会场图不存在');
    const created = await this.prisma.venueLayout.create({
      data: {
        roomId: src.roomId,
        name: `${src.name}(副本)`,
        layoutJson: src.layoutJson,
        thumbnail: src.thumbnail,
        width: src.width,
        height: src.height,
        gridSize: src.gridSize,
        seatCount: src.seatCount,
        status: 'draft',
        createdById: actor.actorId,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.layout.duplicate',
      target: created.id,
      detail: { name: created.name, from: id },
    });
    return this.toPublic(created);
  }

  /** 列表项:不含体积大的 layoutJson */
  private toListItem(r: LayoutRow) {
    return {
      id: r.id,
      roomId: r.roomId,
      name: r.name,
      thumbnail: r.thumbnail,
      width: r.width,
      height: r.height,
      gridSize: r.gridSize,
      seatCount: r.seatCount,
      active: r.active,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toPublic(r: LayoutRow) {
    return {
      ...this.toListItem(r),
      layoutJson: r.layoutJson,
    };
  }
}
