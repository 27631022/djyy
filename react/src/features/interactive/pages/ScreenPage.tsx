import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useRoom, type UseRoomResult } from "../useRoom";
import { getGameUi } from "../games/registry";
import { useQrDataUrl } from "../useQrDataUrl";
import { interactiveFileUrl } from "../api";
import { useSoundEngine, phaseOf, bgmDuckOf } from "../useSoundEngine";
import { AutoScrollGrid } from "../components/AutoScrollGrid";

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ background: "color-mix(in srgb, var(--party-primary) 70%, #444)" }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

function Lobby({ r, qr, roomCode }: { r: UseRoomResult; qr: string | null; roomCode: string }) {
  const connectedPlayers = r.roster.filter((p) => p.connected);
  return (
    <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="text-white/80 text-2xl">扫码加入</div>
        <div className="bg-white p-4 rounded-2xl shadow-2xl">
          {qr ? <img src={qr} alt="入场二维码" className="w-64 h-64" /> : <div className="w-64 h-64" />}
        </div>
        <div className="text-center">
          <div className="text-white/60 text-lg">房间号</div>
          <div className="text-6xl font-black tracking-[0.3em]" style={{ color: "var(--party-accent)" }}>
            {roomCode}
          </div>
        </div>
      </div>

      <div>
        <div className="text-3xl font-bold mb-4">
          已入场 <span style={{ color: "var(--party-accent)" }}>{connectedPlayers.length}</span> 人
        </div>
        <AutoScrollGrid className="max-h-[50vh]">
          <div className="flex flex-wrap gap-3 content-start">
            {connectedPlayers.map((p) => (
              <div key={p.deviceId} className="flex items-center gap-2 bg-white/10 rounded-full pl-1 pr-4 py-1">
                <Avatar name={p.nickname} />
                <span className="text-white/90 text-lg truncate max-w-[10rem]">{p.nickname}</span>
              </div>
            ))}
            {connectedPlayers.length === 0 && (
              <div className="text-white/40 text-xl">等待观众扫码进场…</div>
            )}
          </div>
        </AutoScrollGrid>
      </div>
    </div>
  );
}

export default function ScreenPage() {
  const { room = "" } = useParams();
  const roomCode = room.toUpperCase();
  const r = useRoom({ roomCode, role: "screen" });
  const playUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${roomCode}` : "";
  const qr = useQrDataUrl(playUrl);
  const ui = getGameUi(r.gameType);

  const bg = r.config.background;
  // 音源:节目进行中=该节目的独立音效;首页(无节目)=活动级首页音乐
  const sound = ui && r.gameSound ? r.gameSound : r.config.music;
  const soundSourceId = ui ? r.activeGameId ?? "game" : "event";
  const [entered, setEntered] = useState(false);
  const [muted, setMuted] = useState(false);
  // 节目音效默认启用 → 只要有节目单就可能出声,统一用一次进入手势解锁
  const needGesture = !entered && (r.config.music.enabled || r.games.length > 0 || !!ui);

  // 按阶段自动播放 5 段音效(内部管理 <audio>,不渲染到 DOM);默认音按当前游戏解析;
  // bgmDuck=游戏投影的闪避乘数(如 抢答器抢到后压背景音到 1% 别盖住答题人说话)
  const phase = phaseOf(!!ui, r.screenView);
  useSoundEngine(sound, phase, entered, muted, soundSourceId, ui?.defaultSounds, bgmDuckOf(r.screenView));

  // 底部基础控制条:鼠标/触摸活动时显示,空闲 3s 自动隐藏(kiosk 不干扰观感)
  const [controlsOn, setControlsOn] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const wake = () => {
      setControlsOn(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setControlsOn(false), 3000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    hideTimerRef.current = setTimeout(() => setControlsOn(false), 3000);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // 背景:图片(cover)或双色渐变
  const backgroundStyle =
    bg.kind === "image" && bg.imageFileId
      ? { backgroundImage: `url(${interactiveFileUrl(bg.imageFileId)})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: `radial-gradient(1200px 820px at 50% -12%, ${bg.color1}, ${bg.color2})` };

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const onEnter = () => {
    enterFullscreen();
    setEntered(true);
  };

  return (
    <div className="fixed inset-0 overflow-hidden text-white" style={backgroundStyle}>
      {/* 背景图时压一层暗罩,保证文字可读 */}
      {bg.kind === "image" && bg.imageFileId && (
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
      )}

      {/* 音效需用户手势解锁自动播放 → 一次性进入遮罩 */}
      {needGesture && (
        <button
          type="button"
          onClick={onEnter}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur text-white"
        >
          <div className="text-5xl mb-4">▶</div>
          <div className="text-2xl font-bold">点击进入</div>
          <div className="text-white/60 mt-2">开启声音 · 全屏</div>
        </button>
      )}

      {/* 游戏区:全屏铺满(背景/看台/赛道占整屏) */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        {ui ? (
          <ui.Screen
            view={r.screenView}
            roster={r.roster}
            connectedCount={r.connectedCount}
            settlement={r.settlement}
            lastEvent={r.lastEvent}
            eventConfig={r.config}
            grouping={r.gameGrouping}
            roomCode={roomCode}
            joinQr={qr}
          />
        ) : (
          <Lobby r={r} qr={qr} roomCode={roomCode} />
        )}
      </div>

      {/* 标题 + 在场数:悬浮左上角文字框(不占版面,背景全屏) */}
      <div className="absolute top-4 left-4 z-20 rounded-xl bg-black/45 backdrop-blur px-4 py-2 pointer-events-none">
        <div className="text-lg font-bold text-white/95 drop-shadow">{r.title || "现场互动"}</div>
        <div className="text-xs text-white/70 mt-0.5">
          {r.connected ? `已连接 · 在场 ${r.connectedCount} 人` : "连接中…"}
        </div>
      </div>

      {/* (原右下角小二维码+房号已移除:报名页中央已有醒目大二维码,不再重复) */}

      {/* 底部基础控制条(声音 / 全屏);鼠标空闲自动隐藏,移动即显 */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur px-2 py-1.5 transition-opacity duration-300 ${
          controlsOn ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "开启声音" : "静音"}
          className="w-9 h-9 rounded-full hover:bg-white/15 text-lg flex items-center justify-center"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          onClick={enterFullscreen}
          title="全屏"
          className="w-9 h-9 rounded-full hover:bg-white/15 text-lg flex items-center justify-center"
        >
          ⛶
        </button>
      </div>

      {r.joinError && (
        <div className="absolute bottom-4 left-4 text-red-300 text-lg">{r.joinError}</div>
      )}
    </div>
  );
}
