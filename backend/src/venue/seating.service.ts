import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateSeatingPlanDto } from './dto/create-seating-plan.dto';
import { UpdateSeatingPlanDto } from './dto/update-seating-plan.dto';
import * as XLSX from 'xlsx';
import { normalizeRoster, parseRosterBuffer, parseRosterJson, type Attendee } from './roster';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const IMPORT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * 选座方案(排座)。一次活动绑一张会场图。V2.1:CRUD + 名单导入(rosterJson)。
 * 分区/排座(rulesJson + SeatingAssignment)在 V2.2-V2.3。
 */
@Injectable()
export class SeatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(layoutId?: string) {
    const rows = await this.prisma.seatingPlan.findMany({
      where: layoutId ? { layoutId } : {},
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        layout: { select: { name: true, roomId: true, room: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      layoutId: r.layoutId,
      layoutName: r.layout.name,
      roomId: r.layout.roomId,
      roomName: r.layout.room.name,
      eventDate: r.eventDate,
      status: r.status,
      attendeeCount: parseRosterJson(r.rosterJson).length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async get(id: string) {
    const r = await this.prisma.seatingPlan.findUnique({
      where: { id },
      include: {
        layout: { select: { name: true, roomId: true, room: { select: { name: true } } } },
        assignments: true,
      },
    });
    if (!r) throw new NotFoundException('选座方案不存在');
    const rules = parseRules(r.rulesJson);
    return {
      id: r.id,
      name: r.name,
      layoutId: r.layoutId,
      layoutName: r.layout.name,
      roomId: r.layout.roomId,
      roomName: r.layout.room.name,
      eventDate: r.eventDate,
      status: r.status,
      roster: parseRosterJson(r.rosterJson),
      groupZoneMap: rules.groupZoneMap,
      zones: rules.zones,
      meeting: rules.meeting,
      anchor: rules.anchor,
      reservedSeatIds: rules.reservedSeatIds,
      assignments: r.assignments.map((a) => ({
        seatId: a.seatId,
        attendeeId: a.attendeeId,
        attendeeName: a.attendeeName,
        unit: a.unit,
        position: a.position,
        source: a.source,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async create(dto: CreateSeatingPlanDto, actor: ActorContext) {
    const layout = await this.prisma.venueLayout.findUnique({ where: { id: dto.layoutId } });
    if (!layout) throw new NotFoundException('会场图不存在');
    const created = await this.prisma.seatingPlan.create({
      data: {
        layoutId: dto.layoutId,
        name: dto.name,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : null,
        createdById: actor.actorId,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.plan.create',
      target: created.id,
      detail: { name: created.name, layoutId: dto.layoutId },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateSeatingPlanDto, actor: ActorContext) {
    const before = await this.prisma.seatingPlan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('选座方案不存在');
    const data: Record<string, unknown> = {
      name: dto.name,
      status: dto.status,
    };
    if (dto.eventDate !== undefined) {
      data.eventDate = dto.eventDate ? new Date(dto.eventDate) : null;
    }
    if (dto.roster !== undefined) {
      data.rosterJson = JSON.stringify(normalizeRoster(dto.roster));
    }
    if (
      dto.groupZoneMap !== undefined ||
      dto.zones !== undefined ||
      dto.meeting !== undefined ||
      dto.anchor !== undefined ||
      dto.reservedSeatIds !== undefined
    ) {
      const rules = parseRules(before.rulesJson);
      if (dto.groupZoneMap !== undefined) rules.groupZoneMap = dto.groupZoneMap;
      if (dto.zones !== undefined) rules.zones = dto.zones;
      if (dto.meeting !== undefined) rules.meeting = dto.meeting;
      if (dto.reservedSeatIds !== undefined) rules.reservedSeatIds = dto.reservedSeatIds;
      if (dto.anchor !== undefined) {
        const a = dto.anchor;
        rules.anchor =
          a && typeof a === 'object' && typeof a.x === 'number' && typeof a.y === 'number'
            ? { x: a.x, y: a.y }
            : null;
      }
      data.rulesJson = JSON.stringify(rules);
    }

    // 更换会场图:换到另一张 layout 后,旧的分区映射 + 排座结果都失效 → 清空并回到草稿(名单保留)
    const changingLayout = dto.layoutId !== undefined && dto.layoutId !== before.layoutId;
    if (changingLayout) {
      const layout = await this.prisma.venueLayout.findUnique({ where: { id: dto.layoutId } });
      if (!layout) throw new NotFoundException('会场图不存在');
      data.layoutId = dto.layoutId;
      // 换图清空分区/排座,但保留会议信息
      data.rulesJson = JSON.stringify({ groupZoneMap: {}, zones: [], reservedSeatIds: [], meeting: parseRules(before.rulesJson).meeting, anchor: null });
      data.status = 'draft';
    }

    await this.prisma.$transaction([
      ...(changingLayout
        ? [this.prisma.seatingAssignment.deleteMany({ where: { planId: id } })]
        : []),
      this.prisma.seatingPlan.update({ where: { id }, data }),
    ]);
    await this.audit.log({
      ...actor,
      action: changingLayout ? 'venue.plan.relayout' : 'venue.plan.update',
      target: id,
      detail: changingLayout ? { name: before.name, layoutId: dto.layoutId } : { name: before.name },
    });
    return this.get(id);
  }

  async remove(id: string, actor: ActorContext) {
    const r = await this.prisma.seatingPlan.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('选座方案不存在');
    await this.prisma.seatingPlan.delete({ where: { id } });
    await this.audit.log({
      ...actor,
      action: 'venue.plan.delete',
      target: id,
      detail: { name: r.name },
    });
    return { id, deleted: true };
  }

  async importRoster(id: string, file: UploadedFileShape | undefined, actor: ActorContext) {
    const plan = await this.prisma.seatingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('选座方案不存在');
    if (!file) throw new BadRequestException('未收到文件');
    if (file.size > IMPORT_MAX_BYTES) {
      throw new BadRequestException(
        `文件过大(${(file.size / 1024 / 1024).toFixed(1)}MB),最大 ${IMPORT_MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    let attendees: Attendee[];
    try {
      attendees = parseRosterBuffer(file.buffer);
    } catch (e) {
      throw new BadRequestException(
        `名单解析失败:${e instanceof Error ? e.message : '请用 .xlsx/.xls/.csv 文件'}`,
      );
    }
    if (attendees.length === 0) {
      throw new BadRequestException(
        '没解析到人员。请确认表格里有「姓名」表头列(标题行可放最上方,会自动跳过),且下方有数据行',
      );
    }
    await this.prisma.seatingPlan.update({
      where: { id },
      data: { rosterJson: JSON.stringify(attendees) },
    });
    await this.audit.log({
      ...actor,
      action: 'venue.roster.import',
      target: id,
      detail: { fileName: file.originalname, count: attendees.length },
    });
    return { roster: attendees, count: attendees.length };
  }

  /** 保存排座结果:删旧 + 建新 SeatingAssignment(只存排到人的座),状态置 computed */
  async saveAssignments(id: string, assignments: unknown[], actor: ActorContext) {
    const plan = await this.prisma.seatingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('选座方案不存在');
    const rows = (Array.isArray(assignments) ? assignments : [])
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const a = raw as Record<string, unknown>;
        const seatId = typeof a.seatId === 'string' ? a.seatId : '';
        const attendeeId = typeof a.attendeeId === 'string' ? a.attendeeId : null;
        if (!seatId || !attendeeId) return null; // 只存排到人的座
        return {
          planId: id,
          seatId,
          attendeeId,
          attendeeName: typeof a.attendeeName === 'string' ? a.attendeeName : null,
          unit: typeof a.unit === 'string' ? a.unit : null,
          position: typeof a.position === 'string' ? a.position : null,
          source: typeof a.source === 'string' ? a.source : 'auto',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    await this.prisma.$transaction([
      this.prisma.seatingAssignment.deleteMany({ where: { planId: id } }),
      ...(rows.length ? [this.prisma.seatingAssignment.createMany({ data: rows })] : []),
    ]);
    await this.prisma.seatingPlan.update({ where: { id }, data: { status: 'computed' } });
    await this.audit.log({ ...actor, action: 'venue.seating.save', target: id, detail: { count: rows.length } });
    return this.get(id);
  }

  /**
   * 导出 Excel(.xlsx buffer):
   *   - arrangement 座位安排表:已排座的人按座位视觉顺序(前→后排、排内左→右),列「序号/座位/姓名/单位/职务」
   *   - signin 签到表:全部与会人按名单顺序,列「序号/姓名/单位/职务/分组/签到」(签到列留空供现场签字)
   */
  async exportXlsx(id: string, type: 'arrangement' | 'signin'): Promise<Buffer> {
    const r = await this.prisma.seatingPlan.findUnique({
      where: { id },
      include: { layout: true, assignments: true },
    });
    if (!r) throw new NotFoundException('选座方案不存在');
    const roster = parseRosterJson(r.rosterJson);
    let sheetName: string;
    let aoa: (string | number)[][];
    let cols: number[];
    if (type === 'signin') {
      sheetName = '签到表';
      aoa = [['序号', '姓名', '单位', '职务', '分组', '签到']];
      roster
        .filter((p) => p.name?.trim())
        .forEach((p, i) =>
          aoa.push([i + 1, p.name, p.unit ?? '', p.position ?? '', p.group ?? '', '']),
        );
      cols = [6, 12, 24, 16, 12, 18];
    } else {
      sheetName = '座位安排表';
      const seats = parseLayoutSeats(r.layout.layoutJson);
      const seatById = new Map(seats.map((s) => [s.id, s]));
      const arranged = r.assignments
        .filter((a) => a.attendeeId)
        .sort((a, b) => {
          const s1 = seatById.get(a.seatId);
          const s2 = seatById.get(b.seatId);
          if (!s1 || !s2) return 0;
          return Math.abs(s1.y - s2.y) > 14 ? s1.y - s2.y : s1.x - s2.x;
        });
      aoa = [['序号', '座位', '姓名', '单位', '职务']];
      arranged.forEach((a, i) => {
        const s = seatById.get(a.seatId);
        aoa.push([
          i + 1,
          s ? s.name || s.seatNo || '' : '',
          a.attendeeName ?? '',
          a.unit ?? '',
          a.position ?? '',
        ]);
      });
      cols = [6, 14, 12, 26, 18];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}

/** 解析 rulesJson → { 组区映射, 方案专属区域 } */
function parseRules(json: string | null | undefined): {
  groupZoneMap: Record<string, string>;
  zones: unknown[];
  reservedSeatIds: string[];
  meeting: Record<string, unknown>;
  anchor: { x: number; y: number } | null;
} {
  const out: {
    groupZoneMap: Record<string, string>;
    zones: unknown[];
    reservedSeatIds: string[];
    meeting: Record<string, unknown>;
    anchor: { x: number; y: number } | null;
  } = { groupZoneMap: {}, zones: [], reservedSeatIds: [], meeting: {}, anchor: null };
  if (!json) return out;
  try {
    const o = JSON.parse(json) as {
      groupZoneMap?: unknown;
      zones?: unknown;
      reservedSeatIds?: unknown;
      meeting?: unknown;
      anchor?: unknown;
    };
    const m = o?.groupZoneMap;
    if (m && typeof m === 'object') {
      for (const [k, v] of Object.entries(m)) if (typeof v === 'string') out.groupZoneMap[k] = v;
    }
    if (Array.isArray(o?.zones)) out.zones = o.zones;
    if (Array.isArray(o?.reservedSeatIds))
      out.reservedSeatIds = o.reservedSeatIds.filter((x): x is string => typeof x === 'string');
    if (o?.meeting && typeof o.meeting === 'object') out.meeting = o.meeting as Record<string, unknown>;
    const a = o?.anchor as { x?: unknown; y?: unknown } | undefined;
    if (a && typeof a === 'object' && typeof a.x === 'number' && typeof a.y === 'number') {
      out.anchor = { x: a.x, y: a.y };
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** 从 layoutJson 解析座位元素(id + 坐标 + 名称),用于导出座位安排表的排序与定位 */
function parseLayoutSeats(
  layoutJson: string | null | undefined,
): { id: string; x: number; y: number; name: string; seatNo: string }[] {
  if (!layoutJson) return [];
  try {
    const o = JSON.parse(layoutJson) as { elements?: unknown[] };
    if (!Array.isArray(o.elements)) return [];
    return o.elements
      .filter(
        (e): e is Record<string, unknown> =>
          !!e && typeof e === 'object' && (e as { type?: unknown }).type === 'seat',
      )
      .map((e) => ({
        id: typeof e.id === 'string' ? e.id : '',
        x: typeof e.x === 'number' ? e.x : 0,
        y: typeof e.y === 'number' ? e.y : 0,
        name: typeof e.name === 'string' ? e.name : '',
        seatNo: typeof e.seatNo === 'string' ? e.seatNo : '',
      }));
  } catch {
    return [];
  }
}
