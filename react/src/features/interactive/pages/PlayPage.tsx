import { useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiOrigin } from "@/shared/api/client";
import { useRoom, type RosterPlayer, type UseRoomResult } from "../useRoom";
import { getGameUi } from "../games/registry";
import { getAuthToken, getDeviceId, interactiveApi, type GroupingConfig } from "../api";
import { PRESET_AVATARS } from "../presetAvatars";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { HostControls } from "../components/HostControls";

const NICK_KEY = "djyy_interactive_nick";
const AVATAR_KEY = "djyy_interactive_avatar"; // 当前选中头像("p:idx" 预设 / "f:fileId" 上传)
const AVATAR_LIB_KEY = "djyy_interactive_avatar_lib"; // 我上传过的头像 fileId 列表(最近在前,可多张)
const AVATAR_LIB_MAX = 8;

function loadAvatarLib(): string[] {
  try {
    const raw = localStorage.getItem(AVATAR_LIB_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, AVATAR_LIB_MAX) : [];
  } catch {
    return [];
  }
}
function saveAvatarLib(ids: string[]) {
  try {
    localStorage.setItem(AVATAR_LIB_KEY, JSON.stringify(ids.slice(0, AVATAR_LIB_MAX)));
  } catch {
    /* ignore */
  }
}
/** 当前选中头像即时落本机(修请求4「刷新就没了」:不再只在「确认进入」时存,选/传即存) */
function persistAvatar(avatar: string | null) {
  try {
    if (avatar) localStorage.setItem(AVATAR_KEY, avatar);
    else localStorage.removeItem(AVATAR_KEY);
  } catch {
    /* ignore */
  }
}
function readAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY);
  } catch {
    return null;
  }
}
/** 初始上传库:localStorage 库 + 若当前选中是上传头像但不在库里则并入(保证刷新后仍显示) */
function initialUploads(): string[] {
  const lib = loadAvatarLib();
  const cur = readAvatar();
  if (cur && cur.startsWith("f:") && !lib.includes(cur.slice(2))) return [cur.slice(2), ...lib].slice(0, AVATAR_LIB_MAX);
  return lib;
}

function PlayShell({
  title,
  statusLine,
  error,
  children,
}: {
  title: string;
  statusLine: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 overflow-y-auto text-white flex flex-col items-center px-5 py-6"
      style={{
        background:
          "radial-gradient(900px 600px at 50% -10%, color-mix(in srgb, var(--party-primary) 55%, #14141c), #0b0b12)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-xl font-bold text-white/90">{title || "现场互动"}</div>
          <div className="text-xs text-white/50 mt-1">{statusLine}</div>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 text-red-200 text-sm px-4 py-2 text-center">
            {error}
          </div>
        )}
        <div className="flex-1 flex flex-col items-center">{children}</div>
      </div>
    </div>
  );
}

/** 手机上传自己的头像(匿名公开口,带房间码;≤3MB 图片)—— 进场页与个人信息编辑共用 */
function useAvatarUpload(roomCode: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File): Promise<string | null> => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("roomCode", roomCode);
      const resp = await fetch(`${apiOrigin}/api/public/interactive/avatar`, { method: "POST", body: form });
      if (!resp.ok) {
        let msg = "上传失败";
        try {
          const body = (await resp.json()) as { message?: string };
          if (body?.message) msg = String(body.message);
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const { fileId } = (await resp.json()) as { fileId: string };
      return `f:${fileId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
      return null;
    } finally {
      setUploading(false);
    }
  };
  return { uploading, error, upload };
}

/** 头像选择区:我上传的照片(可多张,✕ 移除)+ 预设头像库 —— 进场页与个人信息编辑共用 */
function AvatarPicker({
  label,
  value,
  onChange,
  name,
  uploads,
  uploading,
  uploadError,
  onUploadFile,
  onRemoveUpload,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  name: string;
  uploads: string[]; // 我上传过的 fileId 列表(不带 "f:" 前缀)
  uploading: boolean;
  uploadError: string | null;
  onUploadFile: (f: File) => void;
  onRemoveUpload: (fileId: string) => void;
}) {
  return (
    <div>
      {/* flex-wrap + nowrap:360px 窄屏安卓机上标签+按钮放不下时整体换行,不逐字折行 */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 mb-2">
        <span className="text-white/80 text-sm shrink-0">{label}</span>
        <label className="rounded-md border border-white/40 px-3 py-1 text-xs text-white/90 cursor-pointer hover:bg-white/10 whitespace-nowrap">
          {uploading ? "上传中…" : "📷 上传照片(可多张)"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {uploadError && <div className="text-red-300 text-xs mb-2">{uploadError}</div>}
      <div className="grid grid-cols-6 gap-2">
        {/* 我上传的头像(可多张;右上角 ✕ 从库里移除) */}
        {uploads.map((fid) => {
          const key = `f:${fid}`;
          const sel = value === key;
          return (
            <div key={key} className="relative">
              <button
                type="button"
                onClick={() => onChange(sel ? null : key)}
                className={`block w-full rounded-full ${sel ? "ring-2 ring-[var(--party-accent)] scale-105" : "opacity-85 hover:opacity-100"}`}
              >
                <PlayerAvatar avatar={key} name={name} color="#888" className="w-full" style={{ aspectRatio: "1" }} />
              </button>
              <button
                type="button"
                onClick={() => onRemoveUpload(fid)}
                title="移除这张上传的头像"
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/75 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-500"
              >
                ×
              </button>
            </div>
          );
        })}
        {PRESET_AVATARS.map((_, i) => {
          const key = `p:${i}`;
          const sel = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(sel ? null : key)}
              className={`rounded-full ${sel ? "ring-2 ring-[var(--party-accent)] scale-105" : "opacity-85 hover:opacity-100"}`}
            >
              <PlayerAvatar avatar={key} name={name} color="#888" className="w-full" style={{ aspectRatio: "1" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 个人信息编辑(改昵称 / 换头像 / 选队·换队·退出队伍)—— 明确的「确认 / 取消」两按钮,
 * 不点确认不生效;满员/锁定等由服务端校验,错误就地显示。
 */
function ProfileEditor({
  nickname,
  avatar,
  myTeamId,
  grouping,
  roster,
  roomCode,
  locked,
  busyText,
  onConfirm,
  onCancel,
}: {
  nickname: string;
  avatar: string | null;
  myTeamId: string | null;
  grouping: GroupingConfig | null;
  roster: RosterPlayer[];
  roomCode: string;
  locked: boolean;
  busyText: string | null;
  onConfirm: (nickname: string, teamId: string | null, avatar: string | null) => void;
  onCancel: () => void;
}) {
  const [nick, setNick] = useState(nickname);
  const [teamId, setTeamId] = useState<string | null>(myTeamId);
  const [avatarSel, setAvatarSel] = useState<string | null>(avatar);
  const [uploads, setUploads] = useState<string[]>(() => {
    const lib = loadAvatarLib();
    return avatar && avatar.startsWith("f:") && !lib.includes(avatar.slice(2)) ? [avatar.slice(2), ...lib].slice(0, AVATAR_LIB_MAX) : lib;
  });
  const up = useAvatarUpload(roomCode);
  const pickMode = grouping?.mode === "teams" && grouping.teams.length > 0 && grouping.assign === "pick";
  const counts = new Map<string, number>();
  for (const p of roster) if (p.connected && p.teamId) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);

  const onUpload = (f: File): void => {
    void up.upload(f).then((id) => {
      if (!id) return;
      const fid = id.slice(2);
      setUploads((prev) => {
        const next = [fid, ...prev.filter((x) => x !== fid)].slice(0, AVATAR_LIB_MAX);
        saveAvatarLib(next);
        return next;
      });
      setAvatarSel(id);
    });
  };
  const removeUpload = (fid: string) => {
    setUploads((prev) => {
      const next = prev.filter((x) => x !== fid);
      saveAvatarLib(next);
      return next;
    });
    if (avatarSel === `f:${fid}`) setAvatarSel(null);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm px-5 overflow-y-auto py-6">
      <div className="w-full max-w-md rounded-2xl bg-white/10 p-6 backdrop-blur my-auto">
        <div className="text-lg font-bold text-white mb-4">个人信息</div>

        <label className="block text-white/80 mb-2 text-sm">昵称</label>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={16}
          className="w-full rounded-lg px-4 py-3 bg-white text-gray-900 text-lg placeholder:text-gray-400"
        />

        {/* 头像:预设头像库(豆包生成)+ 手机上传自己的照片 */}
        <div className="mt-4">
          <AvatarPicker
            label="头像"
            value={avatarSel}
            onChange={setAvatarSel}
            name={nick}
            uploads={uploads}
            uploading={up.uploading}
            uploadError={up.error}
            onUploadFile={onUpload}
            onRemoveUpload={removeUpload}
          />
        </div>

        {pickMode && (
          <div className="mt-4">
            <div className="text-white/80 mb-2 text-sm">
              队伍(本节目分组对抗){locked && <span className="text-amber-300"> · 比赛进行中不能换队</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {grouping!.teams.map((t) => {
                const count = counts.get(t.id) ?? 0;
                const max = grouping!.maxPerTeam;
                const full = max > 0 && count >= max && t.id !== myTeamId;
                const sel = teamId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={full || locked}
                    onClick={() => setTeamId(sel ? null : t.id)}
                    className="rounded-lg border-2 px-3 py-2 text-left transition-colors disabled:opacity-40"
                    style={{
                      borderColor: t.color,
                      background: sel ? t.color : "transparent",
                      color: sel ? "#fff" : t.color,
                    }}
                  >
                    <div className="font-bold">{t.name}</div>
                    <div className="text-xs opacity-80">
                      {count}
                      {max > 0 ? `/${max}` : " 人"}
                      {full ? " · 满" : sel ? " · 已选" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-white/50 text-xs mt-2">再点一次已选的队 = 退出队伍(不参加分组)</div>
          </div>
        )}
        {grouping?.mode === "teams" && grouping.assign === "auto" && (
          <div className="text-white/60 text-sm mt-4">本节目由系统自动分组,无需选队</div>
        )}

        {busyText && <div className="mt-3 text-amber-300 text-sm text-center">{busyText}</div>}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => onConfirm(nick.trim().slice(0, 16) || nickname, teamId, avatarSel)}
            disabled={!!busyText || up.uploading}
            className="flex-1 rounded-lg py-3 text-white text-lg font-bold disabled:opacity-50"
            style={{ background: "var(--party-primary)" }}
          >
            确认
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={!!busyText}
            className="flex-1 rounded-lg py-3 text-white/90 text-lg font-bold border border-white/30 disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** 观众参与端(头像/昵称在入场页已定,这里持有修改入口) */
function PlayerRoom({
  roomCode,
  nickname,
  avatar,
  onNicknameChange,
  onAvatarChange,
}: {
  roomCode: string;
  nickname: string;
  avatar: string | null;
  onNicknameChange: (n: string) => void;
  onAvatarChange: (a: string | null) => void;
}) {
  const [deviceId] = useState(getDeviceId);
  const r: UseRoomResult = useRoom({ roomCode, role: "player", deviceId, nickname, avatar });
  const ui = getGameUi(r.gameType);
  const grouping = r.gameGrouping;
  const me = r.roster.find((p) => p.deviceId === deviceId);
  const myTeamId = me?.teamId ?? null;
  const myTeam = myTeamId && grouping ? grouping.teams.find((t) => t.id === myTeamId) ?? null : null;

  const status =
    (r.remoteView as { status?: string } | null)?.status ??
    (r.screenView as { status?: string } | null)?.status;
  const locked = status === "countdown" || status === "running";
  const pickMode = grouping?.mode === "teams" && grouping.teams.length > 0 && grouping.assign === "pick";

  // 编辑器开关:手动打开 || 分组节目就绪且未入队自动弹一次(取消后不再弹)—— 纯渲染期派生,零 effect
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const autoOpen = pickMode && !myTeamId && !locked && !dismissed && r.connected;
  const editorOpen = manualOpen || autoOpen;

  const closeEditor = () => {
    setManualOpen(false);
    setDismissed(true);
    setBusyText(null);
    setEditErr(null);
  };

  const confirmProfile = async (newNick: string, newTeamId: string | null, newAvatar: string | null) => {
    setEditErr(null);
    if (newNick !== nickname || newAvatar !== avatar) {
      r.updateProfile({ nickname: newNick, avatar: newAvatar });
      onNicknameChange(newNick);
      onAvatarChange(newAvatar);
      try {
        localStorage.setItem(NICK_KEY, newNick);
        if (newAvatar) localStorage.setItem(AVATAR_KEY, newAvatar);
        else localStorage.removeItem(AVATAR_KEY);
      } catch {
        /* ignore */
      }
    }
    if (pickMode && newTeamId !== myTeamId) {
      setBusyText("正在加入…");
      const res = await r.setTeam(newTeamId);
      setBusyText(null);
      if (!res.ok) {
        setEditErr(res.error ?? "操作失败");
        return; // 留在编辑器,让用户改选
      }
    }
    closeEditor();
  };

  return (
    <PlayShell
      title={r.title}
      statusLine={r.connected ? "已连接" : "连接中…"}
      error={r.joinError ?? editErr}
    >
      {/* 个人信息行:头像 + 昵称 + 队伍徽标 + 修改入口(退出来改名/换队/换头像) */}
      <div className="w-full flex items-center justify-center gap-2 mb-5 flex-wrap">
        <PlayerAvatar avatar={avatar} name={nickname} color="var(--party-primary)" className="w-10 h-10 ring-2 ring-white/50" style={{ fontSize: "1.1rem" }} />
        <span className="rounded-full bg-white/15 px-4 py-1.5 font-semibold">{nickname}</span>
        {myTeam && (
          <span className="rounded-full px-4 py-1.5 font-semibold text-white" style={{ background: myTeam.color }}>
            {myTeam.name}
          </span>
        )}
        {pickMode && !myTeam && !locked && (
          <span className="rounded-full bg-amber-400/20 text-amber-200 px-3 py-1.5 text-sm">未选队</span>
        )}
        <button
          type="button"
          onClick={() => {
            setManualOpen(true);
            setEditErr(null);
          }}
          className="rounded-full border border-white/30 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
        >
          修改
        </button>
      </div>

      {/* 游戏名称 + 规则(介绍个人/团体赛怎么玩);等待开局时展示,开跑/倒计时后自动收起不挡操作 */}
      {ui?.rules && (!status || status === "ready") && (
        <div className="w-full rounded-xl bg-white/10 backdrop-blur px-4 py-3 mb-4">
          <div className="font-bold text-white flex items-center gap-2">🎮 {ui.label}</div>
          <div className="text-white/75 text-sm mt-1.5 whitespace-pre-line leading-relaxed">{ui.rules}</div>
        </div>
      )}

      {ui ? (
        <ui.Remote
          view={r.remoteView}
          connected={r.connected}
          sendAction={r.sendAction}
          eventConfig={r.config}
          grouping={grouping}
        />
      ) : (
        <div className="text-center text-white/70 mt-6">
          <div className="text-2xl mb-2">🙌 {nickname}</div>
          <div>已进场,等主持人开始游戏…</div>
          <div className="text-white/40 text-sm mt-2">在场 {r.connectedCount} 人</div>
        </div>
      )}

      {editorOpen && (
        <ProfileEditor
          key={`${myTeamId ?? "none"}-${nickname}-${grouping?.teams.length ?? 0}`}
          nickname={nickname}
          avatar={avatar}
          myTeamId={myTeamId}
          grouping={grouping}
          roster={r.roster}
          roomCode={roomCode}
          locked={locked}
          busyText={busyText}
          onConfirm={confirmProfile}
          onCancel={closeEditor}
        />
      )}
    </PlayShell>
  );
}

/** 主持遥控端(扫后台控制器码进入:/play/:room?role=host&t=token) */
function HostRoom({ roomCode, token }: { roomCode: string; token: string | null }) {
  const r = useRoom({ roomCode, role: "host", token });
  return (
    <PlayShell
      title={r.title}
      statusLine={r.connected ? "遥控器 · 已连接" : "连接中…"}
      error={r.joinError}
    >
      <div className="w-full">
        <div className="text-center text-white/60 text-sm mb-3">
          房号 <span className="font-black tracking-widest text-white">{roomCode}</span>
        </div>
        <div className="rounded-2xl bg-white text-gray-900 p-5 shadow-2xl">
          <HostControls
            connected={r.connected}
            games={r.games}
            activeGameId={r.activeGameId}
            screenView={r.screenView}
            grouping={r.gameGrouping}
            control={r.control}
            compact
          />
        </div>
      </div>
    </PlayShell>
  );
}

/** 观众入场:① 先选头像(预设/上传)→ ② 再填昵称 → 确认进入(队伍在节目就绪时再选,确认/取消由 ProfileEditor 承载) */
function EntryGate({ roomCode }: { roomCode: string }) {
  const roomQ = useQuery({
    queryKey: ["interactive", "room", roomCode],
    queryFn: () => interactiveApi.publicRoomInfo(roomCode),
  });
  const info = roomQ.data;

  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem(NICK_KEY) ?? "";
    } catch {
      return "";
    }
  });
  // 头像持久在本机(下次进场自动带上);"p:<idx>"=预设 / "f:<fileId>"=上传
  const [avatar, setAvatar] = useState<string | null>(() => readAvatar());
  const [uploads, setUploads] = useState<string[]>(() => initialUploads());
  const [joined, setJoined] = useState(false);
  const up = useAvatarUpload(roomCode);

  // 选/传即存本机(修请求4:刷新不丢,不再只在「确认进入」时存)
  const chooseAvatar = (v: string | null) => {
    setAvatar(v);
    persistAvatar(v);
  };
  const onUpload = (f: File): void => {
    void up.upload(f).then((id) => {
      if (!id) return;
      const fid = id.slice(2);
      setUploads((prev) => {
        const next = [fid, ...prev.filter((x) => x !== fid)].slice(0, AVATAR_LIB_MAX);
        saveAvatarLib(next);
        return next;
      });
      chooseAvatar(id);
    });
  };
  const removeUpload = (fid: string) => {
    setUploads((prev) => {
      const next = prev.filter((x) => x !== fid);
      saveAvatarLib(next);
      return next;
    });
    if (avatar === `f:${fid}`) chooseAvatar(null);
  };

  const enter = () => {
    if (up.uploading) return; // 上传中不进场(与按钮 disabled 对齐;堵键盘回车/「前往」旁路,防头像双端分叉)
    const n = nick.trim().slice(0, 16) || "观众";
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* ignore */
    }
    persistAvatar(avatar); // 冗余保险(chooseAvatar 已即时存)
    setNick(n);
    setJoined(true);
  };

  if (joined) {
    // 不用 nick 作 key:改昵称/头像经 updateProfile 原地生效,不断线重连
    return (
      <PlayerRoom roomCode={roomCode} nickname={nick} avatar={avatar} onNicknameChange={setNick} onAvatarChange={setAvatar} />
    );
  }

  if (info && !info.exists) {
    return (
      <PlayShell title="现场互动" statusLine={`房号 ${roomCode}`} error="房间不存在或活动已结束">
        <div />
      </PlayShell>
    );
  }

  return (
    <PlayShell title={info?.title ?? "现场互动"} statusLine={`房号 ${roomCode}`}>
      <div className="w-full rounded-2xl bg-white/10 p-6 mt-6 backdrop-blur">
        {/* 第一步:选头像(上大屏/领奖台都用它;不选则用昵称首字的字母头像) */}
        <AvatarPicker
          label="① 选个头像(上大屏用)"
          value={avatar}
          onChange={chooseAvatar}
          name={nick.trim() || "观众"}
          uploads={uploads}
          uploading={up.uploading}
          uploadError={up.error}
          onUploadFile={onUpload}
          onRemoveUpload={removeUpload}
        />

        {/* 第二步:填昵称 */}
        <label className="block text-white/80 mb-2 mt-5">② 你的昵称</label>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enter()}
          maxLength={16}
          placeholder="起个名字上大屏"
          className="w-full rounded-lg px-4 py-3 bg-white text-gray-900 text-lg placeholder:text-gray-400"
        />
        <div className="text-white/50 text-xs mt-2">分组对抗的节目开场时再选队伍;头像/昵称进场后随时可改</div>
        <button
          type="button"
          onClick={enter}
          disabled={up.uploading}
          className="w-full mt-4 rounded-lg py-3 text-white text-lg font-bold disabled:opacity-50"
          style={{ background: "var(--party-primary)" }}
        >
          确认进入 🎉
        </button>
      </div>
    </PlayShell>
  );
}

export default function PlayPage() {
  const { room = "" } = useParams();
  const roomCode = room.toUpperCase();
  const [sp] = useSearchParams();
  const isHost = sp.get("role") === "host";

  if (isHost) {
    const token = sp.get("t") ?? getAuthToken();
    return <HostRoom roomCode={roomCode} token={token} />;
  }
  return <EntryGate roomCode={roomCode} />;
}
