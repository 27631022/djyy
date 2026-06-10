import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface RoomRow {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  description: string | null;
  photoFileIds: string | null;
  facilities: string | null;
  orgId: string | null;
  active: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 实体会议室 CRUD。一个会议室可挂多张会场图(VenueLayout,Cascade 删)。
 * 写操作 @Permission('venue:manage');读仅登录。
 */
@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = true) {
    const rows = await this.prisma.meetingRoom.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ updatedAt: 'desc' }],
      include: { _count: { select: { layouts: true } } },
    });
    return rows.map((r) => ({ ...this.toPublic(r), layoutCount: r._count.layouts }));
  }

  async findOne(id: string) {
    const r = await this.prisma.meetingRoom.findUnique({
      where: { id },
      include: { layouts: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!r) throw new NotFoundException('会议室不存在');
    return {
      ...this.toPublic(r),
      layouts: r.layouts.map((l) => ({
        id: l.id,
        name: l.name,
        thumbnail: l.thumbnail,
        width: l.width,
        height: l.height,
        gridSize: l.gridSize,
        seatCount: l.seatCount,
        active: l.active,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    };
  }

  async create(dto: CreateRoomDto, actor: ActorContext) {
    const created = await this.prisma.meetingRoom.create({
      data: {
        name: dto.name,
        location: dto.location,
        capacity: dto.capacity ?? 0,
        description: dto.description,
        photoFileIds: dto.photoFileIds ? JSON.stringify(dto.photoFileIds) : null,
        facilities: dto.facilities ? JSON.stringify(dto.facilities) : null,
        orgId: dto.orgId,
        active: dto.active ?? true,
        createdById: actor.actorId,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.room.create',
      target: created.id,
      detail: { name: created.name },
    });
    return this.toPublic(created);
  }

  async update(id: string, dto: UpdateRoomDto, actor: ActorContext) {
    const before = await this.prisma.meetingRoom.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('会议室不存在');

    const data: Record<string, unknown> = {
      name: dto.name,
      location: dto.location,
      capacity: dto.capacity,
      description: dto.description,
      orgId: dto.orgId,
      active: dto.active,
    };
    if (dto.photoFileIds !== undefined) {
      data.photoFileIds = JSON.stringify(dto.photoFileIds);
    }
    if (dto.facilities !== undefined) {
      data.facilities = JSON.stringify(dto.facilities);
    }
    await this.prisma.meetingRoom.update({ where: { id }, data });
    await this.audit.log({
      ...actor,
      action: 'venue.room.update',
      target: id,
      detail: { name: before.name },
    });
    return this.findOne(id);
  }

  async remove(id: string, actor: ActorContext) {
    const r = await this.prisma.meetingRoom.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('会议室不存在');
    // 会场图随会议室级联删除(schema onDelete: Cascade)
    await this.prisma.meetingRoom.delete({ where: { id } });
    await this.audit.log({
      ...actor,
      action: 'venue.room.delete',
      target: id,
      detail: { name: r.name },
    });
    return { id, deleted: true };
  }

  private toPublic(r: RoomRow) {
    return {
      id: r.id,
      name: r.name,
      location: r.location,
      capacity: r.capacity,
      description: r.description,
      photoFileIds: r.photoFileIds ? (JSON.parse(r.photoFileIds) as string[]) : [],
      facilities: r.facilities ? (JSON.parse(r.facilities) as string[]) : [],
      orgId: r.orgId,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
