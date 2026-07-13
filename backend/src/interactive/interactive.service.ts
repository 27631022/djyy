import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import { getGame } from './games/registry';
import { type Settlement } from './game-def';
import {
  type EventConfig,
  normalizeEventConfig,
  normalizeGameSound,
  normalizeGrouping,
  parseEventConfig,
} from './event-config';
import { type CreateEventDto, type CreateGameDto } from './dto/create-event.dto';
import { type UpdateGameDto } from './dto/update-game.dto';
import { type CreateDesignDto, type UpdateDesignDto } from './dto/design.dto';
import { collectDesignFileIds, normalizeRouteRaceDesign } from './route-race-design';

/** 操作者上下文(controller 从 @CurrentUser + @Req 组装) */
export interface InteractiveActor {
  sub: string;
  name: string;
  ip?: string;
}

/**
 * 现场互动 —— HTTP 侧:活动/游戏/局的 CRUD + 鉴权 + 结算落库。
 * 实时侧(room-session.service)通过本服务读配置、建局、落结算,不自己直连 Prisma 之外的表。
 */
@Injectable()
export class InteractiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly role: RoleService,
  ) {}

  // ── 房间码(6 位大写,去除易混 I/O/0/1/L)──
  private genRoomCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    return s;
  }

  private async uniqueRoomCode(): Promise<string> {
    for (let i = 0; i < 12; i++) {
      const code = this.genRoomCode();
      const exists = await this.prisma.interactiveEvent.findUnique({
        where: { roomCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('房间码生成失败,请重试');
  }

  private async isPlatformAdmin(userId: string): Promise<boolean> {
    const { isPlatformAdmin } = await this.role.getScopesForPermission(userId, 'interactive:manage');
    return isPlatformAdmin;
  }

  private async assertManager(
    event: { id: string; createdById: string; managers?: { userId: string }[] },
    actor: InteractiveActor,
  ): Promise<void> {
    if (await this.isPlatformAdmin(actor.sub)) return;
    if (event.createdById === actor.sub) return;
    const managers =
      event.managers ??
      (await this.prisma.interactiveManager.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      }));
    if (managers.some((m) => m.userId === actor.sub)) return;
    throw new ForbiddenException('无权管理此活动');
  }

  // ── HTTP CRUD ──

  async createEvent(dto: CreateEventDto, actor: InteractiveActor) {
    if (!dto.games?.length) throw new BadRequestException('至少添加一个游戏');
    const roomCode = await this.uniqueRoomCode();
    const games = dto.games.map((g, idx) => {
      const def = getGame(g.gameType);
      if (!def) throw new BadRequestException(`未知游戏类型:${g.gameType}`);
      const config = def.validateConfig(g.config ?? {}) as Record<string, unknown>;
      // 节目级音效/分组:每节目独立一份(音效初始=同一套默认,不共用;分组属玩法)
      const sound = normalizeGameSound(g.config?.sound);
      const grouping = normalizeGrouping(g.config?.grouping);
      return {
        gameType: g.gameType,
        title: g.title?.trim() || def.label,
        orderIdx: idx,
        configJson: JSON.stringify({ ...config, sound, grouping }),
        status: 'pending',
      };
    });
    const config = normalizeEventConfig(dto.config ?? {});
    const event = await this.prisma.interactiveEvent.create({
      data: {
        roomCode,
        title: dto.title.trim(),
        status: 'draft',
        configJson: JSON.stringify(config),
        createdById: actor.sub,
        createdByName: actor.name,
        managers: { create: [{ userId: actor.sub, userName: actor.name, role: 'owner' }] },
        games: { create: games },
      },
      include: { games: { orderBy: { orderIdx: 'asc' } }, managers: true },
    });
    await this.audit.log({
      action: 'interactive.event.create',
      target: event.id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { title: event.title, roomCode, games: games.length },
    });
    return event;
  }

  async listEvents(actor: InteractiveActor) {
    const admin = await this.isPlatformAdmin(actor.sub);
    const where = admin
      ? {}
      : { OR: [{ createdById: actor.sub }, { managers: { some: { userId: actor.sub } } }] };
    return this.prisma.interactiveEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        games: { orderBy: { orderIdx: 'asc' } },
        _count: { select: { players: true } },
      },
    });
  }

  async getEvent(id: string, actor: InteractiveActor) {
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id },
      include: {
        games: { orderBy: { orderIdx: 'asc' }, include: { rounds: { orderBy: { seq: 'asc' } } } },
        managers: true,
        _count: { select: { players: true } },
      },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    return event;
  }

  async endEvent(id: string, actor: InteractiveActor) {
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id },
      include: { managers: { select: { userId: true } } },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    const updated = await this.prisma.interactiveEvent.update({
      where: { id },
      data: { status: 'ended', endedAt: new Date() },
    });
    await this.audit.log({
      action: 'interactive.event.end',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
    });
    return updated;
  }

  /** 改活动名称。返回 roomCode + 新标题供实时层即时刷新大屏/手机标题。 */
  async renameEvent(id: string, titleInput: string, actor: InteractiveActor): Promise<{ roomCode: string; title: string }> {
    const title = (titleInput ?? '').trim();
    if (!title) throw new BadRequestException('活动名称不能为空');
    if (title.length > 80) throw new BadRequestException('活动名称过长(最多 80 字)');
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id },
      include: { managers: { select: { userId: true } } },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    await this.prisma.interactiveEvent.update({ where: { id }, data: { title } });
    await this.audit.log({
      action: 'interactive.event.rename',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { from: event.title, to: title },
    });
    return { roomCode: event.roomCode, title };
  }

  /** 删除活动:级联删其下所有节目/局/共管人/玩家记录(schema onDelete:Cascade)。返回 roomCode 供关房。 */
  async deleteEvent(id: string, actor: InteractiveActor): Promise<{ roomCode: string }> {
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id },
      include: { managers: { select: { userId: true } }, _count: { select: { games: true } } },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    await this.prisma.interactiveEvent.delete({ where: { id } }); // 级联删 games/rounds/managers/players
    await this.audit.log({
      action: 'interactive.event.delete',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { title: event.title, roomCode: event.roomCode, games: event._count.games },
    });
    // 上传的背景/音乐/头像等 storage 文件不在此联动删,交孤儿 GC(collectInUseFileIds 已不再含它们)按 30 天宽限回收
    return { roomCode: event.roomCode };
  }

  /** 更新活动通用设置(背景/音乐/分组)。返回 roomCode + 归一化配置供实时层即时刷新。 */
  async updateConfig(
    id: string,
    configInput: unknown,
    actor: InteractiveActor,
  ): Promise<{ roomCode: string; config: EventConfig }> {
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id },
      include: { managers: { select: { userId: true } } },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    const config = normalizeEventConfig(configInput);
    await this.prisma.interactiveEvent.update({
      where: { id },
      data: { configJson: JSON.stringify(config) },
    });
    await this.audit.log({
      action: 'interactive.event.config',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
    });
    return { roomCode: event.roomCode, config };
  }

  /** 给已存在的活动追加一个节目(游戏)。 */
  async addGame(eventId: string, dto: CreateGameDto, actor: InteractiveActor) {
    const event = await this.prisma.interactiveEvent.findUnique({
      where: { id: eventId },
      include: { managers: { select: { userId: true } } },
    });
    if (!event) throw new NotFoundException('活动不存在');
    await this.assertManager(event, actor);
    const def = getGame(dto.gameType);
    if (!def) throw new BadRequestException(`未知游戏类型:${dto.gameType}`);
    const config = def.validateConfig(dto.config ?? {}) as Record<string, unknown>;
    const sound = normalizeGameSound(dto.config?.sound);
    const grouping = normalizeGrouping(dto.config?.grouping);
    const last = await this.prisma.interactiveGame.findFirst({
      where: { eventId },
      orderBy: { orderIdx: 'desc' },
      select: { orderIdx: true },
    });
    const game = await this.prisma.interactiveGame.create({
      data: {
        eventId,
        gameType: dto.gameType,
        title: dto.title?.trim() || def.label,
        orderIdx: (last?.orderIdx ?? -1) + 1,
        configJson: JSON.stringify({ ...config, sound, grouping }),
        status: 'pending',
      },
    });
    await this.audit.log({
      action: 'interactive.game.add',
      target: game.id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { eventId, gameType: dto.gameType },
    });
    return { game, roomCode: event.roomCode };
  }

  /** 删除一个节目(级联删其局)。 */
  async removeGame(gameId: string, actor: InteractiveActor) {
    const game = await this.prisma.interactiveGame.findUnique({
      where: { id: gameId },
      include: { event: { include: { managers: { select: { userId: true } } } } },
    });
    if (!game) throw new NotFoundException('节目不存在');
    await this.assertManager(game.event, actor);
    await this.prisma.interactiveGame.delete({ where: { id: gameId } });
    await this.audit.log({
      action: 'interactive.game.remove',
      target: gameId,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
    });
    return { roomCode: game.event.roomCode };
  }

  /** 更新一个节目(标题 / 玩法配置 / 独立音效)。config 整份提交,服务端重新归一化。 */
  async updateGame(gameId: string, dto: UpdateGameDto, actor: InteractiveActor) {
    const game = await this.prisma.interactiveGame.findUnique({
      where: { id: gameId },
      include: { event: { include: { managers: { select: { userId: true } } } } },
    });
    if (!game) throw new NotFoundException('节目不存在');
    await this.assertManager(game.event, actor);
    const def = getGame(game.gameType);
    if (!def) throw new BadRequestException(`未知游戏类型:${game.gameType}`);

    const data: { title?: string; configJson?: string } = {};
    if (dto.title !== undefined) data.title = dto.title.trim() || def.label;
    if (dto.config !== undefined) {
      const config = def.validateConfig(dto.config) as Record<string, unknown>;
      const sound = normalizeGameSound(dto.config?.sound);
      const grouping = normalizeGrouping(dto.config?.grouping);
      data.configJson = JSON.stringify({ ...config, sound, grouping });
    }
    const updated = await this.prisma.interactiveGame.update({ where: { id: gameId }, data });
    await this.audit.log({
      action: 'interactive.game.update',
      target: gameId,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { eventId: game.eventId, gameType: game.gameType },
    });
    return { game: updated, roomCode: game.event.roomCode };
  }

  // ── 自制游戏设计库(互动游戏编辑器产物;凡有 interactive:manage 者共享全库,照 KnowledgeTemplate 简单化) ──

  listDesigns() {
    return this.prisma.interactiveGameDesign.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getDesign(id: string) {
    const design = await this.prisma.interactiveGameDesign.findUnique({ where: { id } });
    if (!design) throw new NotFoundException('设计不存在');
    return design;
  }

  async createDesign(dto: CreateDesignDto, actor: InteractiveActor) {
    const config = normalizeRouteRaceDesign(dto.config ?? {});
    const design = await this.prisma.interactiveGameDesign.create({
      data: {
        name: dto.name.trim() || '未命名游戏',
        configJson: JSON.stringify(config),
        createdById: actor.sub,
        createdByName: actor.name,
      },
    });
    await this.audit.log({
      action: 'interactive.design.create',
      target: design.id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { name: design.name },
    });
    return design;
  }

  /** 更新设计(名称/整份配置)。只影响设计库本身,不影响已快照的节目(须显式「重新同步设计」)。 */
  async updateDesign(id: string, dto: UpdateDesignDto, actor: InteractiveActor) {
    const design = await this.prisma.interactiveGameDesign.findUnique({ where: { id } });
    if (!design) throw new NotFoundException('设计不存在');
    const data: { name?: string; configJson?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || design.name;
    if (dto.config !== undefined) data.configJson = JSON.stringify(normalizeRouteRaceDesign(dto.config));
    const updated = await this.prisma.interactiveGameDesign.update({ where: { id }, data });
    await this.audit.log({
      action: 'interactive.design.update',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { name: updated.name },
    });
    return updated;
  }

  /** 删除设计。素材不联动删(可能被已快照的节目引用),交孤儿 GC 按 30 天宽限回收。 */
  async removeDesign(id: string, actor: InteractiveActor) {
    const design = await this.prisma.interactiveGameDesign.findUnique({ where: { id } });
    if (!design) throw new NotFoundException('设计不存在');
    await this.prisma.interactiveGameDesign.delete({ where: { id } });
    await this.audit.log({
      action: 'interactive.design.delete',
      target: id,
      actorId: actor.sub,
      actorName: actor.name,
      ip: actor.ip,
      detail: { name: design.name },
    });
    return { ok: true };
  }

  /** 孤儿 GC 在用集合:各活动 configJson 里引用的背景图 + 背景音乐 fileId(接 MaintenanceService)。 */
  async collectInUseFileIds(): Promise<Set<string>> {
    const events = await this.prisma.interactiveEvent.findMany({ select: { configJson: true } });
    const ids = new Set<string>();
    for (const e of events) {
      const cfg = parseEventConfig(e.configJson);
      if (cfg.background.imageFileId) ids.add(cfg.background.imageFileId);
      for (const t of Object.values(cfg.music.effects)) {
        if (t.fileId) ids.add(t.fileId);
      }
    }
    // 游戏配置里的主题覆盖素材(赛跑主题 override)+ 节目级音效上传件 + 自制闯关赛设计快照素材
    const games = await this.prisma.interactiveGame.findMany({ select: { gameType: true, configJson: true } });
    for (const g of games) {
      try {
        const cfg = JSON.parse(g.configJson) as {
          overrides?: {
            backdropFileId?: string;
            trackFileId?: string;
            podiumFileId?: string;
            remoteBgFileId?: string;
            spriteFileIds?: string[];
          };
          sound?: { effects?: Record<string, { fileId?: string }> };
        };
        const ov = cfg.overrides;
        if (ov) {
          for (const f of [ov.backdropFileId, ov.trackFileId, ov.podiumFileId, ov.remoteBgFileId]) if (f) ids.add(f);
          for (const f of ov.spriteFileIds ?? []) if (f) ids.add(f);
        }
        for (const eff of Object.values(cfg.sound?.effects ?? {})) {
          if (eff?.fileId) ids.add(eff.fileId);
        }
        // 自制闯关赛节目 = 设计快照:背景/人物/题图/找错图/领奖台/手机背景全在 collectDesignFileIds
        if (g.gameType === 'route_race') {
          for (const f of collectDesignFileIds(normalizeRouteRaceDesign(cfg))) ids.add(f);
        }
      } catch {
        /* ignore 非 JSON */
      }
    }
    // 自制游戏设计库(InteractiveGameDesign.configJson)的素材 —— 与节目快照共用同一收集器
    const designs = await this.prisma.interactiveGameDesign.findMany({ select: { configJson: true } });
    for (const d of designs) {
      try {
        for (const f of collectDesignFileIds(normalizeRouteRaceDesign(JSON.parse(d.configJson)))) ids.add(f);
      } catch {
        /* ignore 非 JSON */
      }
    }
    // 玩家上传的头像("f:<fileId>")
    const players = await this.prisma.interactivePlayer.findMany({
      where: { avatar: { startsWith: 'f:' } },
      select: { avatar: true },
    });
    for (const pl of players) {
      if (pl.avatar) ids.add(pl.avatar.slice(2));
    }
    return ids;
  }

  // ── 供实时层(room-session.service)调用 ──

  loadRoomByCode(roomCode: string) {
    return this.prisma.interactiveEvent.findUnique({
      where: { roomCode },
      include: { games: { orderBy: { orderIdx: 'asc' } } },
    });
  }

  async markLive(eventId: string): Promise<void> {
    await this.prisma.interactiveEvent.updateMany({
      where: { id: eventId, status: 'draft' },
      data: { status: 'live', startedAt: new Date() },
    });
  }

  getGameRow(gameId: string) {
    return this.prisma.interactiveGame.findUnique({ where: { id: gameId } });
  }

  async setGameActive(eventId: string, gameId: string): Promise<void> {
    // 一次只一个 active:同活动其它 active 置回 pending,目标置 active
    await this.prisma.$transaction([
      this.prisma.interactiveGame.updateMany({
        where: { eventId, status: 'active', NOT: { id: gameId } },
        data: { status: 'pending' },
      }),
      this.prisma.interactiveGame.update({ where: { id: gameId }, data: { status: 'active' } }),
    ]);
  }

  /** 大屏回首页大厅:清掉该活动的 active 节目状态(节目回 pending,可再开)。 */
  async clearActiveGame(eventId: string): Promise<void> {
    await this.prisma.interactiveGame.updateMany({
      where: { eventId, status: 'active' },
      data: { status: 'pending' },
    });
  }

  async createRound(gameId: string) {
    const last = await this.prisma.interactiveRound.findFirst({
      where: { gameId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const seq = (last?.seq ?? 0) + 1;
    return this.prisma.interactiveRound.create({ data: { gameId, seq, status: 'running' } });
  }

  async endRound(roundId: string, settlement: Settlement) {
    return this.prisma.interactiveRound.update({
      where: { id: roundId },
      data: { status: 'ended', resultJson: JSON.stringify(settlement), endedAt: new Date() },
    });
  }

  async upsertPlayer(
    eventId: string,
    deviceId: string,
    nickname: string,
    teamId?: string | null,
    teamName?: string | null,
    avatar?: string | null,
  ) {
    return this.prisma.interactivePlayer.upsert({
      where: { eventId_deviceId: { eventId, deviceId } },
      create: {
        eventId,
        deviceId,
        nickname,
        teamId: teamId ?? null,
        teamName: teamName ?? null,
        avatar: avatar ?? null,
      },
      update: {
        nickname,
        teamId: teamId ?? null,
        teamName: teamName ?? null,
        avatar: avatar ?? null,
        lastSeenAt: new Date(),
      },
    });
  }
}
