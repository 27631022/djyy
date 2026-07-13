import { useState } from "react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import {
  DEFAULT_SOUND_URL,
  SOUND_SLOTS,
  defaultGameSound,
  interactiveFileUrl,
  type EventSound,
  type SoundEffect,
  type SoundKey,
} from "../../api";
import { SoundEffectEditor } from "../../components/SoundEffectEditor";
import { checkpointLabel, getCheckpointUi } from "../../checkpoints/registry";
import { type RouteRaceDesign } from "../designTypes";
import { CHECKPOINT_PLACE_TOOLS, type CanvasTool, type DesignSelection } from "./BoardCanvas";

type BgTarget = "board" | "lobby" | "remote";
const BG_ROWS: { key: BgTarget; label: string; hint: string }[] = [
  { key: "board", label: "游戏中背景", hint: "路线画在这张图上(必传)" },
  { key: "lobby", label: "报名页背景", hint: "不传=游戏背景虚化" },
  { key: "remote", label: "手机端背景", hint: "选传" },
];

/**
 * 编辑器左栏(照用户要求四区):场景背景 / 关卡 / 人物 / 音乐。
 * 所有素材上传走 storage folder=design-<id>(GC 由 collectDesignFileIds 计入在用)。
 */
export function LeftPanel({
  design,
  designId,
  tool,
  setTool,
  selection,
  setSelection,
  commit,
}: {
  design: RouteRaceDesign;
  designId: string;
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  selection: DesignSelection;
  setSelection: (s: DesignSelection) => void;
  commit: (fn: (d: RouteRaceDesign) => RouteRaceDesign) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const sound: EventSound = design.sound ?? defaultGameSound();

  const uploadTo = async (file: File): Promise<string | null> => {
    const meta = await storageApi.upload(file, { ownerModule: "interactive", folder: `design-${designId}` });
    return meta.id;
  };

  const uploadBg = async (file: File, target: BgTarget) => {
    setUploading(target);
    try {
      const fileId = await uploadTo(file);
      if (!fileId) return;
      if (target === "board") {
        // 读背景天然像素尺寸 → bgSize(编辑器/大屏同一 aspect-ratio 容器的依据)
        const img = new Image();
        img.onload = () => {
          const bgSize = img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : undefined;
          commit((d) => ({ ...d, board: { ...d.board, backgroundFileId: fileId, bgSize } }));
        };
        img.onerror = () => commit((d) => ({ ...d, board: { ...d.board, backgroundFileId: fileId } }));
        img.src = interactiveFileUrl(fileId);
      } else if (target === "lobby") {
        commit((d) => ({ ...d, lobby: { ...d.lobby, backgroundFileId: fileId } }));
      } else {
        commit((d) => ({ ...d, remoteBgFileId: fileId }));
      }
    } catch {
      toast.error("背景上传失败");
    } finally {
      setUploading(null);
    }
  };
  const clearBg = (target: BgTarget) => {
    if (target === "board") commit((d) => ({ ...d, board: { ...d.board, backgroundFileId: undefined, bgSize: undefined } }));
    else if (target === "lobby") commit((d) => ({ ...d, lobby: { ...d.lobby, backgroundFileId: undefined } }));
    else commit((d) => ({ ...d, remoteBgFileId: undefined }));
  };
  const bgIdOf = (target: BgTarget): string | undefined =>
    target === "board" ? design.board.backgroundFileId : target === "lobby" ? design.lobby.backgroundFileId : design.remoteBgFileId;

  const uploadSprite = async (file: File) => {
    if (design.board.sprites.length >= 8) {
      toast.warning("人物最多 8 个");
      return;
    }
    setUploading("sprite");
    try {
      const fileId = await uploadTo(file);
      if (fileId) commit((d) => ({ ...d, board: { ...d.board, sprites: [...d.board.sprites, fileId] } }));
    } catch {
      toast.error("人物上传失败");
    } finally {
      setUploading(null);
    }
  };

  const uploadEffect = async (file: File, key: SoundKey) => {
    setUploading(`snd-${key}`);
    try {
      const fileId = await uploadTo(file);
      if (fileId) {
        commit((d) => {
          const s = d.sound ?? defaultGameSound();
          return { ...d, sound: { ...s, effects: { ...s.effects, [key]: { ...s.effects[key], fileId, name: file.name } } } };
        });
      }
    } catch {
      toast.error("音效上传失败");
    } finally {
      setUploading(null);
    }
  };
  const setEffect = (key: SoundKey, e: SoundEffect) =>
    commit((d) => {
      const s = d.sound ?? defaultGameSound();
      return { ...d, sound: { ...s, effects: { ...s.effects, [key]: e } } };
    });
  const clearEffectFile = (key: SoundKey) =>
    commit((d) => {
      const s = d.sound ?? defaultGameSound();
      const e = s.effects[key];
      const next: SoundEffect = { loop: e.loop, playCount: e.playCount, delayMs: e.delayMs, volume: e.volume, clipStart: e.clipStart, clipEnd: e.clipEnd };
      return { ...d, sound: { ...s, effects: { ...s.effects, [key]: next } } };
    });

  const sortedCps = [...design.board.checkpoints].sort((a, b) => a.t - b.t);

  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
      <div className="p-3 space-y-4">
        {/* ── 场景背景 ── */}
        <section>
          <div className="text-xs font-bold text-gray-500 mb-2">场景背景</div>
          <div className="space-y-1.5">
            {BG_ROWS.map((row) => {
              const fid = bgIdOf(row.key);
              return (
                <div key={row.key} className="flex items-center gap-2">
                  {fid ? (
                    <img src={interactiveFileUrl(fid)} alt="" className="w-9 h-9 rounded object-cover ring-1 ring-gray-200 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-gray-100 ring-1 ring-gray-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700">{row.label}</div>
                    <div className="text-[11px] text-gray-400 truncate">{row.hint}</div>
                  </div>
                  <label className="text-xs text-[var(--party-primary)] cursor-pointer hover:underline shrink-0">
                    {uploading === row.key ? "上传中…" : fid ? "更换" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadBg(f, row.key);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {fid && (
                    <button type="button" onClick={() => clearBg(row.key)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">
                      移除
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 关卡 ── */}
        <section>
          <div className="text-xs font-bold text-gray-500 mb-2">关卡(设在路线上)</div>
          <div className="flex gap-2 mb-2">
            {CHECKPOINT_PLACE_TOOLS.map((t) => (
              <button
                key={t.tool}
                type="button"
                onClick={() => setTool(tool === t.tool ? "select" : t.tool)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${tool === t.tool ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                {t.icon} +{t.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {sortedCps.map((cp) => {
              const sel = selection?.type === "checkpoint" && selection.id === cp.id;
              const ui = getCheckpointUi(cp.kind);
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => setSelection({ type: "checkpoint", id: cp.id })}
                  className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm ${sel ? "border-[var(--party-primary)] bg-party-soft" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <span>{ui?.icon}</span>
                  <span className="flex-1 truncate">{checkpointLabel(cp)}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{Math.round(cp.t * 100)}%处</span>
                </button>
              );
            })}
            {sortedCps.length === 0 && <div className="text-xs text-gray-400">点上方按钮,再点画布上的路线位置放置关卡</div>}
          </div>
        </section>

        {/* ── 人物 ── */}
        <section>
          <div className="text-xs font-bold text-gray-500 mb-2">人物(沿路线行进的角色)</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {design.board.sprites.map((fid, i) => (
              <div key={fid} className="relative">
                <img src={interactiveFileUrl(fid)} alt="" className="w-12 h-12 rounded object-contain ring-1 ring-gray-200 bg-gray-50" />
                <button
                  type="button"
                  onClick={() => commit((d) => ({ ...d, board: { ...d.board, sprites: d.board.sprites.filter((_, j) => j !== i) } }))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-600 text-white text-[10px] leading-4"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]">
              {uploading === "sprite" ? "…" : "+"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadSprite(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            大小
            <input
              type="range"
              min={2}
              max={30}
              step={0.5}
              value={design.board.spriteSizePct}
              onChange={(e) => commit((d) => ({ ...d, board: { ...d.board, spriteSizePct: Number(e.target.value) } }))}
              className="flex-1"
            />
            <span className="w-10 text-right tabular-nums">{design.board.spriteSizePct}%</span>
          </label>
          <div className="text-[11px] text-gray-400 mt-1">
            建议透明底 PNG(多人时循环分配;团队赛每队一个);不传用 🏃 兜底
          </div>
        </section>

        {/* ── 音乐(5 段音效,与其他游戏同一套机制) ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-500">音乐(按游戏阶段触发)</div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={sound.enabled}
                onChange={(e) =>
                  commit((d) => ({ ...d, sound: { ...(d.sound ?? defaultGameSound()), enabled: e.target.checked } }))
                }
              />
              启用
            </label>
          </div>
          <div className="space-y-2">
            {SOUND_SLOTS.map((s) => (
              <SoundEffectEditor
                key={s.key}
                label={s.label}
                value={sound.effects[s.key]}
                defaultUrl={DEFAULT_SOUND_URL[s.key]}
                uploading={uploading === `snd-${s.key}`}
                onChange={(e) => setEffect(s.key, e)}
                onUpload={(f) => uploadEffect(f, s.key)}
                onClearFile={() => clearEffectFile(s.key)}
              />
            ))}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">添加为活动节目后,还可在节目设置里单独微调(互不影响)</div>
        </section>
      </div>
    </aside>
  );
}
