import { useRef, useState } from "react";

/** 领奖台版式:前 3 名头像圈(圆心 ax/ay + 直径 as,% of 领奖台图)+ 名牌位置(nx/ny)。 */
export interface NumFrame {
  ax: number;
  ay: number;
  as: number;
  nx: number;
  ny: number;
}

/** 与 raceThemes SOCCER_FRAMES 同步的数值版默认(用户在现场调校后的版式,取「666666」活动定稿) */
export const DEFAULT_NUM_FRAMES: NumFrame[] = [
  { ax: 49.46, ay: 32.04, as: 23.5, nx: 50, ny: 53.02 },
  { ax: 20.33, ay: 49.66, as: 16, nx: 20, ny: 63.5 },
  { ax: 80.43, ay: 51.83, as: 18.5, nx: 80.43, ny: 66.28 },
];

const RANK_COLOR = ["#F5B417", "#E23B3B", "#3B82F6"];
const RANK_LABEL = ["第1名", "第2名", "第3名"];

type Part = "av" | "nm";

/**
 * 领奖台版式编辑器(照证书设计器思路的轻量版):在领奖台图上**拖拽**调整
 * 前 3 名头像圈(位置+大小)与名字位置,确认后存进节目配置(frames),
 * 换任何领奖台图都能自己对位 —— 做同类游戏零代码。
 */
export function PodiumFrameEditor({
  podiumUrl,
  value,
  avatarBehind: avatarBehindInit,
  onConfirm,
  onCancel,
}: {
  podiumUrl: string;
  value?: NumFrame[];
  avatarBehind?: boolean;
  onConfirm: (frames: NumFrame[], avatarBehind: boolean) => void;
  onCancel: () => void;
}) {
  const [frames, setFrames] = useState<NumFrame[]>(() =>
    value && value.length === 3 ? value.map((f) => ({ ...f })) : DEFAULT_NUM_FRAMES.map((f) => ({ ...f })),
  );
  const [avatarBehind, setAvatarBehind] = useState(avatarBehindInit !== false);
  const [sel, setSel] = useState<{ i: number; part: Part }>({ i: 0, part: "av" });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ i: number; part: Part } | null>(null);

  const posOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const startDrag = (e: React.PointerEvent, i: number, part: Part) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { i, part };
    setSel({ i, part });
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = posOf(e);
    if (!p) return;
    setFrames((fs) =>
      fs.map((f, i) => (i !== d.i ? f : d.part === "av" ? { ...f, ax: p.x, ay: p.y } : { ...f, nx: p.x, ny: p.y })),
    );
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold">领奖台版式编辑</div>
          <div className="text-xs text-gray-400">拖拽头像圈/名字对位;头像应完全藏进相框圆圈里</div>
        </div>

        <div
          ref={boxRef}
          className="relative w-full select-none touch-none rounded-lg overflow-hidden bg-gray-900"
          style={{ aspectRatio: "823 / 452" }}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {/* 头像填充预览:按图层走(台后=z-0 垫在台图下,从相框透明洞露出) */}
          {frames.map((f, i) => (
            <div
              key={`fill-${i}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-white font-black pointer-events-none ${avatarBehind ? "z-0" : "z-20"}`}
              style={{
                left: `${f.ax}%`,
                top: `${f.ay}%`,
                width: `${f.as}%`,
                aspectRatio: "1",
                background: RANK_COLOR[i],
                fontSize: "clamp(10px, 1.6vw, 22px)",
              }}
            >
              {i + 1}
            </div>
          ))}
          <img src={podiumUrl} alt="" className="relative z-10 w-full h-full object-contain pointer-events-none" />
          {frames.map((f, i) => {
            const selAv = sel.i === i && sel.part === "av";
            const selNm = sel.i === i && sel.part === "nm";
            return (
              <div key={i}>
                {/* 头像圈拖拽手柄(恒在最上,虚线圈;拖=移动,选中后下方滑块调大小) */}
                <div
                  onPointerDown={(e) => startDrag(e, i, "av")}
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-move"
                  style={{
                    left: `${f.ax}%`,
                    top: `${f.ay}%`,
                    width: `${f.as}%`,
                    aspectRatio: "1",
                    border: `3px ${selAv ? "solid" : "dashed"} ${RANK_COLOR[i]}`,
                    boxShadow: selAv ? `0 0 0 3px ${RANK_COLOR[i]}66` : undefined,
                  }}
                />
                {/* 名字位置(拖=移动;恒在台前) */}
                <div
                  onPointerDown={(e) => startDrag(e, i, "nm")}
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-move rounded px-2 py-0.5 text-white font-bold whitespace-nowrap"
                  style={{
                    left: `${f.nx}%`,
                    top: `${f.ny}%`,
                    background: `${RANK_COLOR[i]}cc`,
                    outline: selNm ? `3px solid ${RANK_COLOR[i]}` : `1px dashed rgba(255,255,255,.7)`,
                    fontSize: "clamp(9px, 1.3vw, 18px)",
                  }}
                >
                  {RANK_LABEL[i]}名字
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 shrink-0">
            选中:{RANK_LABEL[sel.i]}
            {sel.part === "av" ? "头像圈" : "名字"}
          </span>
          {sel.part === "av" && (
            <label className="flex items-center gap-2 flex-1">
              大小
              <input
                type="range"
                min={4}
                max={40}
                step={0.5}
                value={frames[sel.i].as}
                onChange={(e) =>
                  setFrames((fs) => fs.map((f, i) => (i === sel.i ? { ...f, as: Number(e.target.value) } : f)))
                }
                className="flex-1"
              />
              <span className="w-12 text-right tabular-nums text-gray-500">{frames[sel.i].as.toFixed(1)}%</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => setFrames(DEFAULT_NUM_FRAMES.map((f) => ({ ...f })))}
            className="rounded-md border border-gray-300 px-3 py-1 text-gray-600 hover:bg-gray-50 shrink-0"
          >
            恢复默认
          </button>
        </div>

        {/* 图层:头像默认藏在颁奖台后面(相框圆圈处透明才露出;名字恒在台前名牌上) */}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={avatarBehind} onChange={(e) => setAvatarBehind(e.target.checked)} />
          头像藏在颁奖台后面(从相框圆圈露出;自定义领奖台图需圆圈处透明)
        </label>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => onConfirm(frames, avatarBehind)}
            className="rounded-md px-5 py-1.5 text-white font-semibold"
            style={{ background: "var(--party-primary)" }}
          >
            确认
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-5 py-1.5">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
