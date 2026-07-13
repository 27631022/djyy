import { useRef, useState } from "react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { interactiveFileUrl } from "../api";
import {
  newId,
  type Checkpoint,
  type CheckpointEditorProps,
  type CheckpointPlayProps,
  type CheckpointUiDef,
  type SpotPuzzle,
  type SpotRegion,
} from "./types";

const MIN_SIZE = 2; // 热区最小边(%),与后端 normalize 对齐

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** 单张找错图的热区编辑器:空白处拖出矩形 / 拖矩形移动 / 右下角柄缩放 / ✕ 删除(% 坐标,照 raceFrameEditor 模式) */
function RegionEditor({ puzzle, onRegions }: { puzzle: SpotPuzzle; onRegions: (regions: SpotRegion[]) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | { mode: "create"; sx: number; sy: number }
    | { mode: "move"; idx: number; sx: number; sy: number; orig: SpotRegion }
    | { mode: "resize"; idx: number; orig: SpotRegion }
    | null
  >(null);
  // 拖拽中间态放本地(不进 onChange/历史),pointerup 一次性提交
  const [draft, setDraft] = useState<SpotRegion[] | null>(null);
  const regions = draft ?? puzzle.regions;

  const posOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return { x: clampPct(((e.clientX - r.left) / r.width) * 100), y: clampPct(((e.clientY - r.top) / r.height) * 100) };
  };

  const startCreate = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // 只有点在空白处才画新热区
    const p = posOf(e);
    if (!p) return;
    e.preventDefault();
    dragRef.current = { mode: "create", sx: p.x, sy: p.y };
    setDraft([...puzzle.regions, { x: p.x, y: p.y, w: 0, h: 0 }]);
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };
  const startMove = (e: React.PointerEvent, idx: number) => {
    const p = posOf(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode: "move", idx, sx: p.x, sy: p.y, orig: puzzle.regions[idx] };
    setDraft(puzzle.regions.slice());
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };
  const startResize = (e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode: "resize", idx, orig: puzzle.regions[idx] };
    setDraft(puzzle.regions.slice());
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = posOf(e);
    if (!p) return;
    setDraft((rs) => {
      if (!rs) return rs;
      const next = rs.slice();
      if (d.mode === "create") {
        next[next.length - 1] = {
          x: Math.min(d.sx, p.x),
          y: Math.min(d.sy, p.y),
          w: Math.abs(p.x - d.sx),
          h: Math.abs(p.y - d.sy),
        };
      } else if (d.mode === "move") {
        const nx = clampPct(d.orig.x + (p.x - d.sx));
        const ny = clampPct(d.orig.y + (p.y - d.sy));
        next[d.idx] = { ...d.orig, x: Math.min(nx, 100 - d.orig.w), y: Math.min(ny, 100 - d.orig.h) };
      } else {
        next[d.idx] = { ...d.orig, w: Math.max(MIN_SIZE, p.x - d.orig.x), h: Math.max(MIN_SIZE, p.y - d.orig.y) };
      }
      return next;
    });
  };
  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    setDraft((rs) => {
      if (rs) {
        // 过小的新建热区丢弃(误触);其余一次性提交给父级(进一步历史)
        const done = d.mode === "create" ? rs.filter((r, i) => i !== rs.length - 1 || (r.w >= MIN_SIZE && r.h >= MIN_SIZE)) : rs;
        const next = done.map((r) => ({ x: r.x, y: r.y, w: Math.max(MIN_SIZE, r.w), h: Math.max(MIN_SIZE, r.h) })).slice(0, 8);
        // 无实际变化(误触/原地松手)不提交 —— 否则空条目挤占撤销历史
        if (JSON.stringify(next) !== JSON.stringify(puzzle.regions)) onRegions(next);
      }
      return null;
    });
  };

  return (
    <div className="space-y-1">
      <div
        ref={boxRef}
        className="relative w-full select-none touch-none cursor-crosshair rounded overflow-hidden"
        onPointerDown={startCreate}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img src={interactiveFileUrl(puzzle.imageFileId!)} alt="" className="w-full h-auto pointer-events-none" draggable={false} />
        {regions.map((r, i) => (
          <div
            key={i}
            onPointerDown={(e) => startMove(e, i)}
            className="absolute border-2 border-red-500 bg-red-500/20 cursor-move"
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRegions(puzzle.regions.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center"
              title="删除热区"
            >
              ✕
            </button>
            <div
              onPointerDown={(e) => startResize(e, i)}
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-sm bg-white border-2 border-red-500 cursor-nwse-resize"
              title="拖拽调整大小"
            />
          </div>
        ))}
      </div>
      <div className="text-[11px] text-gray-400">在图上拖出「错误位置」热区(可多个);玩家点中任一热区算答对</div>
    </div>
  );
}

/** 编辑器右栏:多图列表(答错轮换下一图)+ 每图 热区编辑 + 提示语 */
function SpotEditor({ value, onChange, designId }: CheckpointEditorProps) {
  const puzzles = value.spot?.puzzles ?? [];
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const setPuzzles = (ps: SpotPuzzle[]) => onChange({ ...value, spot: { puzzles: ps } });
  const patchP = (id: string, patch: Partial<SpotPuzzle>) => setPuzzles(puzzles.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const uploadImage = async (p: SpotPuzzle, file: File) => {
    setUploadingId(p.id);
    try {
      const meta = await storageApi.upload(file, { ownerModule: "interactive", folder: `design-${designId}` });
      patchP(p.id, { imageFileId: meta.id });
    } catch {
      toast.error("找错图上传失败");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {puzzles.map((p, pi) => (
        <div key={p.id} className="rounded-md border border-gray-200 p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">第 {pi + 1} 图</span>
            <div className="flex-1" />
            <label className="text-xs text-gray-500 cursor-pointer hover:text-[var(--party-primary)]">
              {uploadingId === p.id ? "上传中…" : p.imageFileId ? "换图" : "上传找错图"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(p, f);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" onClick={() => setPuzzles(puzzles.filter((x) => x.id !== p.id))} className="text-xs text-gray-400 hover:text-red-500">
              删图
            </button>
          </div>
          {p.imageFileId ? (
            <RegionEditor puzzle={p} onRegions={(regions) => patchP(p.id, { regions })} />
          ) : (
            <div className="rounded border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">先上传一张「有错误的图」</div>
          )}
          <input
            value={p.prompt ?? ""}
            onChange={(e) => patchP(p.id, { prompt: e.target.value })}
            placeholder="提示语(选填,如:找出图中不符合安全规范的地方)"
            maxLength={200}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      ))}
      {puzzles.length < 20 && (
        <button
          type="button"
          onClick={() => setPuzzles([...puzzles, { id: newId(), regions: [] }])}
          className="w-full rounded-md border border-dashed border-gray-300 py-1.5 text-sm text-gray-500 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
        >
          + 添加找错图(答错自动换下一图,最多 20 图)
        </button>
      )}
    </div>
  );
}

/** 手机作答卡:点图上报 % 坐标(热区在服务端判定,不下发) */
function SpotPlay({ challenge, submit, disabled }: CheckpointPlayProps) {
  const s = challenge.spot;
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  if (!s) return null;
  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const x = clampPct(((e.clientX - r.left) / r.width) * 100);
    const y = clampPct(((e.clientY - r.top) / r.height) * 100);
    setMark({ x, y });
    submit({ px: x, py: y });
  };
  return (
    <div className="w-full space-y-2">
      <div className="text-white text-lg font-bold leading-snug">🔍 {s.prompt || "找出图中的错误,点它!"}</div>
      <div className="relative w-full rounded-lg overflow-hidden select-none touch-none" onPointerDown={onTap}>
        <img src={interactiveFileUrl(s.imageFileId)} alt="" className="w-full h-auto pointer-events-none" draggable={false} />
        {mark && (
          <div
            className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-yellow-400 pointer-events-none"
            style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
          />
        )}
      </div>
    </div>
  );
}

export const spotCheckpoint: CheckpointUiDef = {
  kind: "spot",
  label: "找错关",
  icon: "🔍",
  makeDefault(t: number): Checkpoint {
    return { id: newId(), kind: "spot", t, penaltySteps: 10, spot: { puzzles: [{ id: newId(), regions: [] }] } };
  },
  EditorPanel: SpotEditor,
  Play: SpotPlay,
  validate(cp) {
    // 与后端 normalize 同口径:有图 + ≥1 热区,不完整的图会被逐张剔除(不只在全空时才告警)
    const all = cp.spot?.puzzles ?? [];
    const valid = all.filter((p) => p.imageFileId && p.regions.length >= 1);
    if (!valid.length) return "没有有效找错图(需上传图片 + 至少 1 个热区),保存后该关将被忽略";
    const bad = all.length - valid.length;
    if (bad > 0) return `有 ${bad} 张找错图不完整(缺图或没画热区),保存后这些图将被忽略`;
    return null;
  },
};
