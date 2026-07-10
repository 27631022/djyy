# interactive —— 现场大屏互动(大屏 + 手机扫码遥控)

局域网大屏互动游戏平台的**实时基座**。一块大屏 = 一场活动 = 一个房间码;手机扫码进房,动作经 WebSocket 毫秒级同步到大屏。

## 结构

```
interactive/
├── index.ts                    barrel(Module 放最后)
├── interactive.module.ts       imports: Prisma / Audit / Auth(WS 令牌校验)/ Role(判 platform_admin)
├── interactive.gateway.ts      @WebSocketGateway —— WS 入口(room:join / player:action / host:control / room:leave)
├── room-session.service.ts     内存房间态 Map<roomCode> + socket.io 广播 + 倒计时 ticker(结算落库)
├── interactive.service.ts      HTTP 侧:活动/游戏/局 CRUD + 鉴权;供实时层读配置/建局/落结算
├── interactive.controller.ts   @Permission('interactive:manage')·建/列/看/结束活动
├── game-def.ts                 GameDef 契约 + 共享类型 + competitionRank(竞争排名 1,2,2,4)
├── games/
│   ├── registry.ts             GAMES / getGame / GAME_LIST
│   └── tap-race.game.ts        连点冲榜(占位游戏,已实现全契约)
└── dto/create-event.dto.ts
```

## 数据模型(5 表,`// @module: interactive`)

活动 `InteractiveEvent`(roomCode 唯一)→ 游戏 `InteractiveGame`(节目单)→ 局 `InteractiveRound`(一游戏多局)；
共管人 `InteractiveManager`(逐场授权)；玩家 `InteractivePlayer`(匿名,`@@unique([eventId,deviceId])` 重连恢复)。
**运行态在内存,活动结束即弃;只落「开过什么活动 + 每局结算快照」审计线。**

## WebSocket 事件

| 方向 | 事件 | 说明 |
|---|---|---|
| C→S | `room:join` `{roomCode, role, deviceId?, nickname?, token?}` | role=screen/player 匿名;host 带 JWT(`AuthService.verifyToken`)|
| C→S | `player:action` `{roomCode, action}` | 玩家意图 → `GameDef.reduce` |
| C→S | `host:control` `{roomCode, cmd}` | 主持意图(activateGame/start/end/reset/endEvent)|
| S→C | `room:players` | 花名册增量(进/退/断连)|
| S→C | `screen:state` `{gameId,gameType,view,...}` | 广播大屏(`projectScreen`)|
| S→C | `remote:state` `{gameType,view}` | 单播每玩家(`projectRemote`)|
| S→C | `screen:event` / `room:closed` | 一次性动画/音效;房间结束 |

## 加一个新游戏

1. 后端 `games/<type>.game.ts` 写一个 `GameDef`(`validateConfig`/`makeInitialState`/`reduce`/`control`/`tick`/`settle`/`projectScreen`/`projectRemote`)+ `games/registry.ts` 注册一行。
2. 前端 `react/src/features/interactive/games/<type>.tsx` 写一个 `GameUi`(`Screen`/`Remote`/`Config`)+ 前端 `games/registry.ts` 注册一行。

零改实时基座。服务端权威:客户端只发意图,状态一律服务端计算后投影下发。

## 注意

- WS **不经** Express `enableCors` —— 网关 `@WebSocketGateway({cors})` 里重复了 main.ts 白名单(连接时读 `process.env`)。
- 全局 `PermissionGuard` 会跑 WS handler,但未标 `@Permission` 即放行;**WS 鉴权在 gateway/service 内自判**,不能复用该 guard(它写死 HTTP 上下文)。
- 单进程内存态:多副本需 socket.io Redis adapter(单机 MVP 无虑)。
- 广播未节流:Phase 0 少人可接受,大房间需 delta + 节流(摇一摇设计已标注)。
- 素材(BGM/图片)后续接 storage 时,务必实现 `collectInUseFileIds()` 并接入 `MaintenanceService`,否则孤儿 GC 误删。
