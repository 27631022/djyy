import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import {
  type ActionMeta,
  type ControlCmd,
  type GameDef,
  type PlayerRef,
  type ScreenEvent,
  safeParseConfig,
} from './game-def';
import {
  type EventConfig,
  type EventSound,
  type GroupingConfig,
  normalizeGameSound,
  normalizeGrouping,
  parseEventConfig,
} from './event-config';
import { getGame } from './games/registry';
import { InteractiveService } from './interactive.service';

/** 一个在房玩家的运行态(内存;跨游戏保留,断线只置 connected=false 不删) */
interface PlayerRuntime {
  deviceId: string;
  nickname: string;
  avatar: string | null; // "p:<idx>"=预设 / "f:<fileId>"=上传
  teamId: string | null;
  teamName: string | null;
  socketId: string | null;
  connected: boolean;
}

/** 头像标识白名单校验:预设 p:0..99 / 上传 f:<id>(id 长度有界);非法一律置 null */
function cleanAvatar(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (/^p:\d{1,2}$/.test(s)) return s;
  if (/^f:[A-Za-z0-9_-]{10,64}$/.test(s)) return s;
  return null;
}

/** 当前活跃游戏的运行态(state 由 GameDef 拥有,不透明) */
interface ActiveGame {
  gameId: string;
  roundId: string;
  gameType: string;
  def: GameDef;
  config: unknown;
  sound: EventSound; // 节目级独立音效(大屏据此播;PATCH 节目后经 refreshGames live 刷新)
  grouping: GroupingConfig; // 节目级分组(个人赛/分组对抗是节目玩法,队伍跟节目走)
  state: unknown;
}

/** 节目单一项(供主持台列出可开的游戏) */
interface RoomGame {
  id: string;
  gameType: string;
  title: string;
  status: string;
  orderIdx: number;
}

/** 一块大屏 = 一个房间 = 一场活动 的运行态 */
interface RoomRuntime {
  eventId: string;
  roomCode: string;
  title: string;
  status: 'lobby' | 'running' | 'ended';
  config: EventConfig; // 活动通用设置(背景/音乐/分组)
  games: RoomGame[];
  players: Map<string, PlayerRuntime>; // by deviceId
  screenSockets: Set<string>;
  hostSockets: Set<string>;
  activeGame: ActiveGame | null;
}

/** socketId → 该连接的身份绑定(断线/动作/控制时反查) */
interface SocketBinding {
  roomCode: string;
  role: 'screen' | 'player' | 'host';
  deviceId?: string;
  userId?: string;
  name?: string;
}

interface JoinData {
  roomCode?: string;
  role?: string;
  deviceId?: string;
  nickname?: string;
  avatar?: string; // "p:<idx>" | "f:<fileId>"(join 幂等更新,与昵称同路)
}
interface ActionData {
  action?: { kind?: string; [k: string]: unknown };
}
interface ControlData {
  cmd?: { kind?: string; [k: string]: unknown };
}
export interface HostIdentity {
  userId: string;
  name: string;
}
export interface JoinAck {
  ok: boolean;
  error?: string;
  deviceId?: string;
  snapshot?: unknown;
}

/**
 * 现场互动实时核心 —— 内存房间态 + socket.io 广播 + 倒计时 ticker。
 *
 * 取舍(照实时基座设计):运行态(玩家计数/当前局/倒计时)活在内存,活动结束即弃;
 * 只把「每局结算快照」经 InteractiveService 落库审计。服务端权威:客户端只发意图,
 * 状态一律由 GameDef.reduce/control/tick 计算后投影下发。
 *
 * ⚠ 单进程内存态:多副本部署会分裂房间,需 socket.io Redis adapter(单机 MVP 无虑)。
 * ⚠ 广播未节流:Phase 0 少量玩家可接受;高频/大房间的 delta+节流留 Phase 2(摇一摇设计已标注)。
 */
@Injectable()
export class RoomSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomSessionService.name);
  private server: Server | null = null;
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly sockets = new Map<string, SocketBinding>();
  private readonly ticker: ReturnType<typeof setInterval>;

  constructor(private readonly interactive: InteractiveService) {
    // 单一全局 ticker:驱动所有运行中游戏的倒计时(到点自动结算)。400ms 足够顺滑又不吵。
    this.ticker = setInterval(() => this.onTick(), 400);
  }

  onModuleDestroy(): void {
    clearInterval(this.ticker);
  }

  /** 网关 afterInit 注入 socket.io Server */
  bindServer(server: Server): void {
    this.server = server;
  }

  // ── 连接生命周期 ──

  async join(client: Socket, data: unknown, host: HostIdentity | null): Promise<JoinAck> {
    const d = (data ?? {}) as JoinData;
    const roomCode = String(d.roomCode ?? '').toUpperCase().trim();
    const role: 'screen' | 'player' | 'host' =
      d.role === 'screen' ? 'screen' : d.role === 'host' ? 'host' : 'player';
    if (!roomCode) return { ok: false, error: '缺少房间码' };

    const room = await this.ensureRoom(roomCode);
    if (!room) return { ok: false, error: '房间不存在或活动已结束' };

    await client.join(roomCode);

    if (role === 'screen') {
      room.screenSockets.add(client.id);
      this.sockets.set(client.id, { roomCode, role: 'screen' });
      this.broadcastRoster(room);
      return { ok: true, snapshot: this.snapshot(room) };
    }

    if (role === 'host') {
      if (!host) return { ok: false, error: '需要有效登录令牌' };
      room.hostSockets.add(client.id);
      this.sockets.set(client.id, { roomCode, role: 'host', userId: host.userId, name: host.name });
      return { ok: true, snapshot: this.snapshot(room) };
    }

    // player(匿名观众)—— 进场只要昵称;队伍属于节目玩法,由 player:setTeam 在节目就绪时选/换
    const deviceId = String(d.deviceId ?? '').trim();
    if (!deviceId) return { ok: false, error: '缺少设备标识' };
    const nickname = this.cleanNickname(d.nickname);
    const existing = room.players.get(deviceId);

    const p: PlayerRuntime = existing ?? {
      deviceId,
      nickname,
      avatar: null,
      teamId: null,
      teamName: null,
      socketId: null,
      connected: false,
    };
    p.nickname = nickname || p.nickname || '观众';
    // 头像:join 显式带了(含 ProfileEditor 确认)才更新;没带保留原值
    if (d.avatar !== undefined) p.avatar = cleanAvatar(d.avatar);
    // 已有队伍对当前节目无效(队伍定义在节目 grouping 里)→ 清掉
    const g = room.activeGame?.grouping;
    if (p.teamId && !(g?.mode === 'teams' && g.teams.some((t) => t.id === p.teamId))) {
      p.teamId = null;
      p.teamName = null;
    }
    p.socketId = client.id;
    p.connected = true;
    room.players.set(deviceId, p);
    this.sockets.set(client.id, { roomCode, role: 'player', deviceId });
    // 系统均分节目:进场即自动分到人数最少的队
    if (g && g.mode === 'teams' && g.assign === 'auto' && !p.teamId) this.autoAssign(room, p, g);
    await this.interactive.upsertPlayer(room.eventId, deviceId, p.nickname, p.teamId, p.teamName, p.avatar);

    this.broadcastRoster(room);
    return { ok: true, deviceId, snapshot: this.snapshot(room, deviceId) };
  }

  handleDisconnect(socketId: string): void {
    const b = this.sockets.get(socketId);
    if (!b) return;
    this.sockets.delete(socketId);
    const room = this.rooms.get(b.roomCode);
    if (!room) return;
    if (b.role === 'screen') {
      room.screenSockets.delete(socketId);
    } else if (b.role === 'host') {
      room.hostSockets.delete(socketId);
    } else if (b.role === 'player' && b.deviceId) {
      const p = room.players.get(b.deviceId);
      if (p && p.socketId === socketId) {
        p.connected = false;
        p.socketId = null;
      }
      this.broadcastRoster(room);
    }
  }

  // ── 动作 / 控制 ──

  async playerAction(socketId: string, data: unknown): Promise<void> {
    const b = this.sockets.get(socketId);
    if (!b || b.role !== 'player' || !b.deviceId) return;
    const room = this.rooms.get(b.roomCode);
    if (!room?.activeGame) return;
    const p = room.players.get(b.deviceId);
    if (!p) return;
    const action = (data as ActionData)?.action;
    if (!action || typeof action !== 'object' || typeof action.kind !== 'string') return;

    const meta: ActionMeta = {
      deviceId: b.deviceId,
      nickname: p.nickname,
      teamId: p.teamId,
      teamName: p.teamName,
      at: Date.now(),
      isHost: false,
    };
    const g = room.activeGame;
    const res = g.def.reduce(g.state, action, meta, g.config);
    g.state = res.state;
    if (res.events?.length) this.emitEvents(room, res.events);
    if (res.ended) await this.finishRound(room);
    else this.broadcastGame(room);
  }

  async control(socketId: string, data: unknown): Promise<void> {
    const b = this.sockets.get(socketId);
    if (!b || b.role !== 'host') return; // 仅 host socket(join 时已 verifyToken)可控制
    const room = this.rooms.get(b.roomCode);
    if (!room) return;
    const cmd = (data as ControlData)?.cmd;
    if (!cmd || typeof cmd !== 'object' || typeof cmd.kind !== 'string') return;

    const meta: ActionMeta = {
      deviceId: `host:${b.userId ?? ''}`,
      nickname: b.name ?? '主持人',
      at: Date.now(),
      isHost: true,
    };

    if (cmd.kind === 'activateGame') {
      await this.activateGame(room, String(cmd.gameId ?? ''));
      return;
    }
    if (cmd.kind === 'endEvent') {
      room.status = 'ended';
      this.server?.to(room.roomCode).emit('room:closed', { roomCode: room.roomCode });
      return;
    }
    if (!room.activeGame) return;
    const g = room.activeGame;
    const res = g.def.control(g.state, cmd as ControlCmd, meta, g.config);
    g.state = res.state;
    if (res.events?.length) this.emitEvents(room, res.events);
    if (res.ended) await this.finishRound(room);
    else this.broadcastGame(room);
  }

  // ── 内部 ──

  private async ensureRoom(roomCode: string): Promise<RoomRuntime | null> {
    const cached = this.rooms.get(roomCode);
    if (cached) return cached;
    const event = await this.interactive.loadRoomByCode(roomCode);
    if (!event || event.status === 'ended') return null;
    const room: RoomRuntime = {
      eventId: event.id,
      roomCode,
      title: event.title,
      status: 'lobby',
      config: parseEventConfig(event.configJson),
      games: event.games.map((g) => ({
        id: g.id,
        gameType: g.gameType,
        title: g.title,
        status: g.status,
        orderIdx: g.orderIdx,
      })),
      players: new Map(),
      screenSockets: new Set(),
      hostSockets: new Set(),
      activeGame: null,
    };
    this.rooms.set(roomCode, room);
    await this.interactive.markLive(event.id);
    return room;
  }

  private async activateGame(room: RoomRuntime, gameId: string): Promise<void> {
    const game = await this.interactive.getGameRow(gameId);
    if (!game || game.eventId !== room.eventId) return;
    const def = getGame(game.gameType);
    if (!def) {
      this.logger.warn(`未知游戏类型 ${game.gameType},无法激活`);
      return;
    }
    const rawCfg = safeParseConfig(game.configJson);
    const config = def.validateConfig(rawCfg); // validateConfig 会剥掉 sound/grouping(游戏私有配置外的通用键)
    const sound = normalizeGameSound((rawCfg as Record<string, unknown>).sound);
    const grouping = normalizeGrouping((rawCfg as Record<string, unknown>).grouping);

    // 队伍跟节目走:上一节目的队伍对本节目无效则清;同队伍表(重开同节目)则保留并刷新队名
    for (const p of room.players.values()) {
      if (!p.teamId) continue;
      const t = grouping.mode === 'teams' ? grouping.teams.find((x) => x.id === p.teamId) : undefined;
      if (t) {
        p.teamName = t.name;
      } else {
        p.teamId = null;
        p.teamName = null;
      }
    }
    // 系统均分:激活即把在场未分队的都分好
    if (grouping.mode === 'teams' && grouping.assign === 'auto') {
      for (const p of room.players.values()) if (p.connected && !p.teamId) this.autoAssign(room, p, grouping);
    }

    const state = def.makeInitialState(config, {
      roomCode: room.roomCode,
      players: this.playerRefs(room),
    });
    const round = await this.interactive.createRound(gameId);
    await this.interactive.setGameActive(room.eventId, gameId);
    // 内存节目单同步:目标 active,其余 active→pending(供后加入的主持台高亮当前局)
    for (const rg of room.games) rg.status = rg.id === gameId ? 'active' : rg.status === 'active' ? 'pending' : rg.status;
    room.activeGame = { gameId, roundId: round.id, gameType: game.gameType, def, config, sound, grouping, state };
    room.status = 'running';
    this.broadcastRoster(room); // 队伍归属可能变了(清队/自动均分),同步花名册
    this.broadcastGame(room, { activated: true });
  }

  private async finishRound(room: RoomRuntime): Promise<void> {
    if (!room.activeGame) return;
    const g = room.activeGame;
    const settlement = g.def.settle(g.state, g.config);
    await this.interactive.endRound(g.roundId, settlement);
    // 结算按开局时的配置算;展示层换成最新落库配置(领奖台版式/主题素材)——
    // 比赛进行中在后台改的版式,结算领奖页即生效(refreshGames 在 locked 时不刷 config 的补口)
    const row = await this.interactive.getGameRow(g.gameId);
    if (row) g.config = g.def.validateConfig(safeParseConfig(row.configJson));
    // 保留 activeGame(state 已 ended),大屏渲染结算;附带 settlement 一次性下发
    this.broadcastGame(room, { settlement });
  }

  private onTick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const g = room.activeGame;
      if (!g) continue;
      const res = g.def.tick(g.state, now, g.config);
      if (!res) continue;
      g.state = res.state;
      if (res.events?.length) this.emitEvents(room, res.events);
      if (res.ended) void this.finishRound(room);
      else this.broadcastGame(room);
    }
  }

  private playerRefs(room: RoomRuntime): PlayerRef[] {
    return [...room.players.values()].map((p) => ({
      deviceId: p.deviceId,
      nickname: p.nickname,
      teamId: p.teamId,
      teamName: p.teamName,
    }));
  }

  private rosterPayload(room: RoomRuntime) {
    return [...room.players.values()].map((p) => ({
      deviceId: p.deviceId,
      nickname: p.nickname,
      avatar: p.avatar,
      teamId: p.teamId,
      teamName: p.teamName,
      connected: p.connected,
    }));
  }

  private snapshot(room: RoomRuntime, deviceId?: string) {
    const g = room.activeGame;
    return {
      roomCode: room.roomCode,
      title: room.title,
      status: room.status,
      config: room.config,
      games: room.games,
      players: this.rosterPayload(room),
      connectedCount: [...room.players.values()].filter((p) => p.connected).length,
      game: g
        ? {
            gameId: g.gameId,
            gameType: g.gameType,
            sound: g.sound,
            grouping: g.grouping,
            screen: g.def.projectScreen(g.state, g.config),
            remote: deviceId ? g.def.projectRemote(g.state, g.config, deviceId) : null,
          }
        : null,
    };
  }

  private broadcastRoster(room: RoomRuntime): void {
    this.server?.to(room.roomCode).emit('room:players', {
      roomCode: room.roomCode,
      players: this.rosterPayload(room),
      connectedCount: [...room.players.values()].filter((p) => p.connected).length,
    });
  }

  private broadcastGame(room: RoomRuntime, extra?: Record<string, unknown>): void {
    if (!this.server) return;
    const g = room.activeGame;
    if (!g) {
      this.server.to(room.roomCode).emit('screen:state', { game: null });
      return;
    }
    const screen = g.def.projectScreen(g.state, g.config);
    this.server.to(room.roomCode).emit('screen:state', {
      gameId: g.gameId,
      gameType: g.gameType,
      view: screen,
      sound: g.sound, // 节目级独立音效(大屏切到该节目的音效集)
      grouping: g.grouping, // 节目级分组(手机选队 / 大屏队色)
      ...(extra ?? {}),
    });
    for (const p of room.players.values()) {
      if (p.connected && p.socketId) {
        const remote = g.def.projectRemote(g.state, g.config, p.deviceId);
        this.server.to(p.socketId).emit('remote:state', { gameType: g.gameType, view: remote });
      }
    }
  }

  private emitEvents(room: RoomRuntime, events: ScreenEvent[]): void {
    if (!this.server) return;
    for (const e of events) this.server.to(room.roomCode).emit('screen:event', e);
  }

  private teamCounts(room: RoomRuntime): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of room.players.values()) {
      if (p.connected && p.teamId) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
    }
    return m;
  }

  /** 系统均分:把玩家塞进人数最少且未满的队(全满则仍塞最少的,不卡死进场)。 */
  private autoAssign(room: RoomRuntime, p: PlayerRuntime, g: GroupingConfig): void {
    if (g.mode !== 'teams' || g.teams.length === 0) return;
    const counts = this.teamCounts(room);
    const notFull = g.teams.filter((t) => !(g.maxPerTeam > 0 && (counts.get(t.id) ?? 0) >= g.maxPerTeam));
    const pool = notFull.length ? notFull : g.teams;
    let best = pool[0];
    for (const t of pool) if ((counts.get(t.id) ?? 0) < (counts.get(best.id) ?? 0)) best = t;
    p.teamId = best.id;
    p.teamName = best.name;
  }

  /** 比赛进行中(倒计时/进行)不许换队 —— 依赖各游戏 projectScreen 的 status 约定(phaseOf 同源)。 */
  private activeGameLocked(room: RoomRuntime): boolean {
    const g = room.activeGame;
    if (!g) return false;
    const v = g.def.projectScreen(g.state, g.config) as { status?: string } | null;
    return v?.status === 'countdown' || v?.status === 'running';
  }

  /**
   * 玩家选队/换队/退出队伍(手机端「确认」按钮触发)。teamId=null 表示退出队伍。
   * 规则:仅分组节目 + 自选模式可用;比赛进行中锁定;满员拒绝(换到本队不算)。
   */
  async setTeam(
    socketId: string,
    data: unknown,
  ): Promise<{ ok: boolean; error?: string; teamId?: string | null; teamName?: string | null }> {
    const b = this.sockets.get(socketId);
    if (!b || b.role !== 'player' || !b.deviceId) return { ok: false, error: '未入场' };
    const room = this.rooms.get(b.roomCode);
    if (!room) return { ok: false, error: '房间不存在' };
    const p = room.players.get(b.deviceId);
    if (!p) return { ok: false, error: '未入场' };
    const g = room.activeGame?.grouping;
    if (!g || g.mode !== 'teams' || g.teams.length === 0) return { ok: false, error: '当前节目不分组' };
    if (g.assign === 'auto') return { ok: false, error: '本节目由系统自动分组' };
    if (this.activeGameLocked(room)) return { ok: false, error: '比赛进行中,暂不能换队' };

    const raw = (data as { teamId?: unknown } | null)?.teamId;
    const teamId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    if (teamId === null) {
      p.teamId = null;
      p.teamName = null;
    } else {
      const team = g.teams.find((t) => t.id === teamId);
      if (!team) return { ok: false, error: '队伍不存在' };
      if (p.teamId !== team.id) {
        const counts = this.teamCounts(room);
        if (g.maxPerTeam > 0 && (counts.get(team.id) ?? 0) >= g.maxPerTeam) {
          return { ok: false, error: '该队人数已满,请选其他队' };
        }
      }
      p.teamId = team.id;
      p.teamName = team.name;
    }
    await this.interactive.upsertPlayer(room.eventId, p.deviceId, p.nickname, p.teamId, p.teamName, p.avatar);
    this.broadcastRoster(room);
    return { ok: true, teamId: p.teamId, teamName: p.teamName };
  }

  /** 活动设置被 PATCH 修改时刷新运行态并通知房间(背景/音乐/队色即时生效) */
  refreshConfig(roomCode: string, config: EventConfig): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.config = config;
    this.server?.to(roomCode).emit('room:config', { config });
  }

  /** 活动改名:更新运行态标题并通知房间(大屏/手机标题即时刷新) */
  renameRoom(roomCode: string, title: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.title = title;
    this.server?.to(roomCode).emit('room:meta', { title });
  }

  /** 活动被删除:通知房间所有端关闭并从内存移除运行态(残留 socket 绑定在断线时自清) */
  closeRoom(roomCode: string): void {
    const code = roomCode.toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) return;
    this.server?.to(code).emit('room:closed', { roomCode: code });
    this.rooms.delete(code);
  }

  /** 节目(游戏)被加/删/改时重载运行态节目单并通知(主持台 live 更新;活跃节目的音效同步刷新) */
  async refreshGames(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const event = await this.interactive.loadRoomByCode(roomCode);
    if (!event) return;
    room.games = event.games.map((g) => ({
      id: g.id,
      gameType: g.gameType,
      title: g.title,
      status: g.status,
      orderIdx: g.orderIdx,
    }));
    this.server?.to(roomCode).emit('room:games', { games: room.games });
    // 正在进行的节目被 PATCH:重读其独立音效并重广播(大屏音效 live 切换;玩法配置不动,防局中改规则);
    // 分组仅在未开赛(报名阶段)时同步刷新,并复核玩家已选队伍
    const ag = room.activeGame;
    if (ag) {
      const row = event.games.find((g) => g.id === ag.gameId);
      if (row) {
        const raw = safeParseConfig(row.configJson) as Record<string, unknown>;
        ag.sound = normalizeGameSound(raw.sound);
        if (!this.activeGameLocked(room)) {
          // 非比赛中(报名页/结算领奖页)玩法+视觉配置(时长/主题/素材/领奖台版式)也同步刷新,
          // 后台改完保存即所见即所得;倒计时/进行中仍冻结,防局中改规则
          ag.config = ag.def.validateConfig(raw);
          ag.grouping = normalizeGrouping(raw.grouping);
          for (const p of room.players.values()) {
            if (!p.teamId) continue;
            const t = ag.grouping.mode === 'teams' ? ag.grouping.teams.find((x) => x.id === p.teamId) : undefined;
            if (t) p.teamName = t.name;
            else {
              p.teamId = null;
              p.teamName = null;
            }
          }
          if (ag.grouping.mode === 'teams' && ag.grouping.assign === 'auto') {
            for (const p of room.players.values()) if (p.connected && !p.teamId) this.autoAssign(room, p, ag.grouping);
          }
          this.broadcastRoster(room);
        }
        this.broadcastGame(room);
      }
    }
  }

  /** 公开房间信息(手机进场前拿队伍列表 + 各队实时人数;不创建运行态) */
  async publicRoomInfo(roomCode: string): Promise<{
    exists: boolean;
    title?: string;
    status?: string;
    config?: EventConfig;
    teamCounts?: Record<string, number>;
  }> {
    const code = roomCode.toUpperCase().trim();
    const room = this.rooms.get(code);
    if (room) {
      const counts: Record<string, number> = {};
      for (const [k, v] of this.teamCounts(room)) counts[k] = v;
      return { exists: true, title: room.title, status: room.status, config: room.config, teamCounts: counts };
    }
    const event = await this.interactive.loadRoomByCode(code);
    if (!event || event.status === 'ended') return { exists: false };
    return {
      exists: true,
      title: event.title,
      status: event.status,
      config: parseEventConfig(event.configJson),
      teamCounts: {},
    };
  }

  private cleanNickname(raw: unknown): string {
    const s = (typeof raw === 'string' ? raw : '').trim().slice(0, 16);
    return s || '观众';
  }
}
