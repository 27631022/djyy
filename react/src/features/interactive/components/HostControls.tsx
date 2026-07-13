import { type RoomGameLite } from "../useRoom";
import { getGameUi } from "../games/registry";

interface HostControlsProps {
  connected: boolean;
  games: RoomGameLite[];
  activeGameId: string | null;
  screenStatus: string | undefined; // ready | running | ended(游戏私有)
  control: (cmd: Record<string, unknown>) => void;
  compact?: boolean; // 手机遥控器紧凑排版
}

/** 主持控制面板 —— 后台配置台内嵌 + 手机遥控器(扫控制器码)共用同一组件,均经 host socket 下发指令。 */
export function HostControls({
  connected,
  games,
  activeGameId,
  screenStatus,
  control,
  compact,
}: HostControlsProps) {
  const btnBase =
    "rounded-lg px-5 py-3 font-semibold transition-colors disabled:opacity-40 " +
    (compact ? "text-lg " : "");
  return (
    <div className="flex flex-col gap-4">
      {!connected && <div className="text-sm text-amber-600">连接中…</div>}

      <div>
        <div className={`mb-2 font-semibold text-gray-500 ${compact ? "text-base" : "text-sm"}`}>
          节目单(点选开一个游戏)
        </div>
        <div className="flex flex-col gap-2">
          {games.length === 0 && <div className="text-sm text-gray-400">该活动还没有游戏</div>}
          {games.map((g) => {
            const ui = getGameUi(g.gameType);
            const active = g.id === activeGameId;
            return (
              <button
                key={g.id}
                type="button"
                disabled={!connected}
                onClick={() => control({ kind: "activateGame", gameId: g.id })}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-[var(--party-primary)] bg-party-soft"
                    : "border-gray-200 hover:bg-gray-50"
                } ${compact ? "text-lg" : ""}`}
              >
                <span className="font-medium">{g.title}</span>
                <span className="text-xs text-gray-400">
                  {ui?.label ?? g.gameType}
                  {active ? " · 进行中" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeGameId && (
        <div className="flex flex-wrap gap-3">
          {screenStatus === "ready" && (
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "start" })}
              className={`${btnBase} text-white`}
              style={{ background: "var(--party-primary)" }}
            >
              ▶ 开始本局
            </button>
          )}
          {screenStatus === "running" && (
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "end" })}
              className={`${btnBase} border border-gray-300 text-gray-700 hover:bg-gray-50`}
            >
              ■ 结束本局
            </button>
          )}
          {screenStatus === "ended" && (
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "reset" })}
              className={`${btnBase} text-white`}
              style={{ background: "var(--party-primary)" }}
            >
              ↻ 再来一局
            </button>
          )}
          {/* 回首页大屏:大厅(入场二维码+花名册)。结束后返场/切节目间歇用;比赛进行中不显示防误触 */}
          {screenStatus !== "running" && (
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "backToLobby" })}
              className={`${btnBase} border border-gray-300 text-gray-700 hover:bg-gray-50`}
            >
              🏠 回首页大屏
            </button>
          )}
        </div>
      )}
    </div>
  );
}
