import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  INTERACTIVE_SOCKET_URL,
  DEFAULT_EVENT_CONFIG,
  type EventConfig,
  type EventSound,
  type GroupingConfig,
} from "./api";

export type RoomRole = "screen" | "player" | "host";

export interface RosterPlayer {
  deviceId: string;
  nickname: string;
  avatar: string | null; // "p:<idx>"=预设 / "f:<fileId>"=上传 / null=字母头像
  teamId: string | null;
  teamName: string | null;
  connected: boolean;
}

export interface RoomGameLite {
  id: string;
  gameType: string;
  title: string;
  status: string;
  orderIdx: number;
}

export interface RoomSnapshot {
  roomCode: string;
  title: string;
  status: string;
  config?: EventConfig;
  games?: RoomGameLite[];
  players: RosterPlayer[];
  connectedCount: number;
  game: {
    gameId: string;
    gameType: string;
    sound?: EventSound;
    grouping?: GroupingConfig;
    screen: unknown;
    remote: unknown | null;
  } | null;
}

export interface ScreenEventMsg {
  kind: string;
  payload?: unknown;
  seq: number;
}

interface JoinAckMsg {
  ok?: boolean;
  error?: string;
  deviceId?: string;
  snapshot?: RoomSnapshot;
}
interface RosterMsg {
  players?: RosterPlayer[];
  connectedCount?: number;
}
interface ScreenStateMsg {
  game?: null;
  gameId?: string;
  gameType?: string;
  view?: unknown;
  sound?: EventSound;
  grouping?: GroupingConfig;
  settlement?: unknown;
  activated?: boolean;
}
interface RemoteStateMsg {
  view?: unknown;
}
interface ScreenEventRaw {
  kind?: string;
  payload?: unknown;
}

export interface UseRoomOptions {
  roomCode: string;
  role: RoomRole;
  deviceId?: string;
  nickname?: string;
  avatar?: string | null;
  teamId?: string;
  token?: string | null;
}

export interface UseRoomResult {
  connected: boolean;
  joinError: string | null;
  title: string;
  status: string;
  roster: RosterPlayer[];
  connectedCount: number;
  config: EventConfig;
  games: RoomGameLite[];
  activeGameId: string | null;
  gameType: string | null;
  gameSound: EventSound | null; // 当前节目的独立音效(无节目=null,大屏回退首页音乐)
  gameGrouping: GroupingConfig | null; // 当前节目的分组配置(选队/队色用;无节目=null)
  screenView: unknown | null;
  remoteView: unknown | null;
  settlement: unknown | null;
  lastEvent: ScreenEventMsg | null;
  sendAction: (action: Record<string, unknown>) => void;
  control: (cmd: Record<string, unknown>) => void;
  /** 改昵称/头像:同 deviceId 重新 room:join(身份/队伍保留);调用方需同步更新自己的状态 */
  updateProfile: (profile: { nickname: string; avatar?: string | null }) => void;
  /** 选队/换队/退出队伍(null=退出);服务端校验 满员/锁定/自动分组,返回 ack */
  setTeam: (teamId: string | null) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * 现场互动房间连接 hook —— 大屏/手机/主持三端共用。
 * socket.io 连后端 3001;连接(含每次自动重连)后自动 room:join。玩家凭 deviceId 重连恢复身份。
 * 服务端权威:本 hook 只发意图(sendAction/control)、渲染服务端下发的投影,不本地算状态。
 */
export function useRoom(opts: UseRoomOptions): UseRoomResult {
  const { roomCode, role } = opts;
  const socketRef = useRef<Socket | null>(null);
  const eventSeqRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("lobby");
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [config, setConfig] = useState<EventConfig>(DEFAULT_EVENT_CONFIG);
  const [games, setGames] = useState<RoomGameLite[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameType, setGameType] = useState<string | null>(null);
  const [gameSound, setGameSound] = useState<EventSound | null>(null);
  const [gameGrouping, setGameGrouping] = useState<GroupingConfig | null>(null);
  const [screenView, setScreenView] = useState<unknown | null>(null);
  const [remoteView, setRemoteView] = useState<unknown | null>(null);
  const [settlement, setSettlement] = useState<unknown | null>(null);
  const [lastEvent, setLastEvent] = useState<ScreenEventMsg | null>(null);

  // 最新 join 参数存 ref,供 connect/reconnect 复用(deviceId/nickname/token 变动不触发重连)。
  const joinArgsRef = useRef<UseRoomOptions>(opts);
  useEffect(() => {
    joinArgsRef.current = opts;
  });

  useEffect(() => {
    if (!roomCode) return;
    const socket = io(INTERACTIVE_SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = socket;

    const applySnapshot = (snap: RoomSnapshot | undefined) => {
      if (!snap) return;
      setTitle(snap.title ?? "");
      setStatus(snap.status ?? "lobby");
      setRoster(snap.players ?? []);
      setConnectedCount(snap.connectedCount ?? 0);
      if (snap.config) setConfig(snap.config);
      if (snap.games) setGames(snap.games);
      if (snap.game) {
        setActiveGameId(snap.game.gameId ?? null);
        setGameType(snap.game.gameType ?? null);
        setGameSound(snap.game.sound ?? null);
        setGameGrouping(snap.game.grouping ?? null);
        setScreenView(snap.game.screen ?? null);
        if (snap.game.remote !== undefined) setRemoteView(snap.game.remote);
      } else {
        setActiveGameId(null);
        setGameType(null);
        setGameSound(null);
        setGameGrouping(null);
        setScreenView(null);
        setRemoteView(null);
      }
    };

    const doJoin = () => {
      const a = joinArgsRef.current;
      socket.emit(
        "room:join",
        {
          roomCode: a.roomCode,
          role: a.role,
          deviceId: a.deviceId,
          nickname: a.nickname,
          avatar: a.avatar,
          teamId: a.teamId,
          token: a.token,
        },
        (ack: JoinAckMsg) => {
          if (!ack?.ok) {
            setJoinError(ack?.error ?? "进入房间失败");
            return;
          }
          setJoinError(null);
          applySnapshot(ack.snapshot);
        },
      );
    };

    socket.on("connect", () => {
      setConnected(true);
      doJoin();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:players", (m: RosterMsg) => {
      setRoster(m?.players ?? []);
      setConnectedCount(m?.connectedCount ?? 0);
    });
    socket.on("screen:state", (m: ScreenStateMsg) => {
      if (m?.game === null) {
        setActiveGameId(null);
        setGameType(null);
        setGameSound(null);
        setGameGrouping(null);
        setScreenView(null);
        return;
      }
      if (m?.gameId) setActiveGameId(m.gameId);
      if (m?.gameType) setGameType(m.gameType);
      if (m?.sound !== undefined) setGameSound(m.sound);
      if (m?.grouping !== undefined) setGameGrouping(m.grouping);
      if (m?.view !== undefined) setScreenView(m.view);
      if (m?.activated) setSettlement(null);
      if (m?.settlement !== undefined) setSettlement(m.settlement);
    });
    socket.on("remote:state", (m: RemoteStateMsg) => {
      if (m?.view !== undefined) setRemoteView(m.view);
    });
    socket.on("screen:event", (m: ScreenEventRaw) => {
      eventSeqRef.current += 1;
      setLastEvent({ kind: m?.kind ?? "", payload: m?.payload, seq: eventSeqRef.current });
    });
    socket.on("room:config", (m: { config?: EventConfig }) => {
      if (m?.config) setConfig(m.config);
    });
    socket.on("room:games", (m: { games?: RoomGameLite[] }) => {
      if (m?.games) setGames(m.games);
    });
    socket.on("room:meta", (m: { title?: string }) => {
      if (typeof m?.title === "string") setTitle(m.title); // 活动改名 → 大屏/手机标题即时刷新
    });
    socket.on("room:closed", () => setStatus("ended"));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, role]);

  const sendAction = useCallback(
    (action: Record<string, unknown>) => {
      socketRef.current?.emit("player:action", { roomCode, action });
    },
    [roomCode],
  );
  const control = useCallback(
    (cmd: Record<string, unknown>) => {
      socketRef.current?.emit("host:control", { roomCode, cmd });
    },
    [roomCode],
  );
  // 改昵称/头像 = 同 deviceId 重新 join(服务端幂等更新,队伍/身份保留)。
  // 调用方须同步更新自己的状态(joinArgsRef 每渲染从 opts 同步,重连才拿到新值)。
  const updateProfile = useCallback((profile: { nickname: string; avatar?: string | null }) => {
    const a = joinArgsRef.current;
    socketRef.current?.emit(
      "room:join",
      {
        roomCode: a.roomCode,
        role: a.role,
        deviceId: a.deviceId,
        nickname: profile.nickname,
        avatar: profile.avatar,
        token: a.token,
      },
      () => {},
    );
  }, []);
  const setTeam = useCallback((teamId: string | null) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const s = socketRef.current;
      if (!s) {
        resolve({ ok: false, error: "未连接" });
        return;
      }
      s.emit("player:setTeam", { teamId }, (ack: { ok?: boolean; error?: string } | undefined) => {
        resolve({ ok: !!ack?.ok, error: ack?.error });
      });
    });
  }, []);

  return {
    connected,
    joinError,
    title,
    status,
    roster,
    connectedCount,
    config,
    games,
    activeGameId,
    gameType,
    gameSound,
    gameGrouping,
    screenView,
    remoteView,
    settlement,
    lastEvent,
    sendAction,
    control,
    updateProfile,
    setTeam,
  };
}
