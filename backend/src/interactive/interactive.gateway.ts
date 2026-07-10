import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth';
import { RoomSessionService, type HostIdentity, type JoinAck } from './room-session.service';

/**
 * WebSocket CORS 校验 —— socket.io 握手**不经过** Express 的 enableCors,必须在网关侧
 * 重复 main.ts 那套白名单;函数在连接时执行,故读 process.env(此时 ConfigModule 已加载 .env)。
 */
function wsCorsOrigin(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) return cb(null, true);
  const whitelist = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (whitelist.includes(origin)) return cb(null, true);
  const isDev = process.env.NODE_ENV !== 'production';
  // dev:局域网内任意主机的 517x / 3001 源(与 main.ts 一致)
  if (isDev && /^https?:\/\/[^/]+:(517\d|3001)$/.test(origin)) return cb(null, true);
  return cb(null, false);
}

interface JoinPayload {
  roomCode?: string;
  role?: string;
  token?: string;
}

/**
 * 现场互动 WebSocket 网关(默认 IoAdapter 附着到 Nest 同一 HTTP server → 复用 3001 端口,
 * 握手路径 /socket.io/ 不受 setGlobalPrefix('api') 影响)。
 *
 * 事件:
 *  C→S  room:join / player:action / host:control / room:leave
 *  S→C  room:players / screen:state / remote:state / screen:event / room:closed
 *
 * 鉴权:host(主持/遥控)在握手 data.token 传 JWT,用现成 AuthService.verifyToken 校验;
 * screen(大屏)/ player(观众)匿名,仅凭房间码入房。
 */
@WebSocketGateway({ cors: { origin: wsCorsOrigin, credentials: true } })
export class InteractiveGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly rooms: RoomSessionService,
    private readonly auth: AuthService,
  ) {}

  afterInit(server: Server): void {
    this.rooms.bindServer(server);
  }

  handleDisconnect(client: Socket): void {
    this.rooms.handleDisconnect(client.id);
  }

  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<JoinAck> {
    const d = (data ?? {}) as JoinPayload;
    let host: HostIdentity | null = null;
    if (d.role === 'host') {
      const payload = d.token ? this.auth.verifyToken(d.token) : null;
      if (!payload) return { ok: false, error: '需要有效登录令牌' };
      host = { userId: payload.sub, name: payload.name };
    }
    return this.rooms.join(client, data, host);
  }

  @SubscribeMessage('player:action')
  async onAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<{ ok: boolean }> {
    await this.rooms.playerAction(client.id, data);
    return { ok: true };
  }

  @SubscribeMessage('player:setTeam')
  async onSetTeam(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<{ ok: boolean; error?: string; teamId?: string | null; teamName?: string | null }> {
    return this.rooms.setTeam(client.id, data);
  }

  @SubscribeMessage('host:control')
  async onControl(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<{ ok: boolean }> {
    await this.rooms.control(client.id, data);
    return { ok: true };
  }

  @SubscribeMessage('room:leave')
  onLeave(@ConnectedSocket() client: Socket): { ok: boolean } {
    this.rooms.handleDisconnect(client.id);
    return { ok: true };
  }
}
