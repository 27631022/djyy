import { interactiveFileUrl } from "../../api";
import { type RouteRaceDesign } from "../designTypes";

/**
 * 场景①「游戏前」报名页预览(纯预览无交互):虚化背景 + 装饰边框 + 二维码占位 + 头像墙示意。
 * 运行时真实渲染在 games/routeRace.tsx 的报名视图,此处只让设计者看到大概效果。
 */
export function LobbyCanvas({ design }: { design: RouteRaceDesign }) {
  const lobbyBg = design.lobby.backgroundFileId ? interactiveFileUrl(design.lobby.backgroundFileId) : null;
  const boardBg = design.board.backgroundFileId ? interactiveFileUrl(design.board.backgroundFileId) : null;
  const bg = lobbyBg ?? boardBg;
  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-[960px]">
        <div className="relative w-full rounded-lg overflow-hidden shadow ring-1 ring-black/10 bg-[#20242e]" style={{ aspectRatio: "16 / 9" }}>
          {bg ? (
            // 未单独传报名页背景时,用「游戏中」背景虚化兜底(与运行时一致)
            <img src={bg} alt="" className={`absolute inset-0 w-full h-full object-cover ${lobbyBg ? "" : "blur-md scale-110"}`} draggable={false} />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#241a3a,#0b0b12)" }} />
          )}
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-4 rounded-2xl border-4 pointer-events-none" style={{ borderColor: "var(--party-accent)", boxShadow: "inset 0 0 40px rgba(245,166,35,0.3)" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="text-2xl font-black drop-shadow" style={{ color: "var(--party-accent)" }}>
              {design.lobby.title || "扫码报名参赛"}
            </div>
            <div className="rounded-xl bg-white/95 p-3 flex flex-col items-center">
              <div className="w-24 h-24 bg-[repeating-linear-gradient(45deg,#333_0_6px,#fff_6px_12px)] rounded" />
              <div className="text-gray-500 text-xs mt-1.5">入场二维码(现场自动生成)</div>
              <div className="text-lg font-black tracking-[0.3em] text-gray-800">ABC123</div>
            </div>
            <div className="flex gap-2">
              {["丙", "丁", "戊"].map((n, i) => (
                <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/60" style={{ background: ["#E23B3B", "#3B82F6", "#22B573"][i] }}>
                  {n}
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/40" />
            </div>
            <div className="text-white/60 text-xs">报名头像墙(现场实时显示)</div>
          </div>
        </div>
        <div className="mt-1.5 text-xs text-gray-400">报名页标题/背景在右栏「场景设置」里改;二维码/头像墙由现场自动生成</div>
      </div>
    </div>
  );
}
