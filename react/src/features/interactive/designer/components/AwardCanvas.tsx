import { useState } from "react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { interactiveFileUrl } from "../../api";
import { PodiumFrameEditor, DEFAULT_NUM_FRAMES, type NumFrame } from "../../games/raceFrameEditor";
import { type RouteRaceDesign } from "../designTypes";

const RANK_COLOR = ["#F5B417", "#C0C0C0", "#CD7F32"];

/**
 * 场景③「颁奖」画布:领奖台图上传 + 版式预览 + 「编辑版式」弹 PodiumFrameEditor(原样复用,
 * 拖拽调前 3 名头像圈/名字位);无图时显示 CSS 金银铜台阶兜底说明。
 */
export function AwardCanvas({
  design,
  designId,
  commit,
}: {
  design: RouteRaceDesign;
  designId: string;
  commit: (fn: (d: RouteRaceDesign) => RouteRaceDesign) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const podiumUrl = design.award.podiumFileId ? interactiveFileUrl(design.award.podiumFileId) : null;
  const frames: NumFrame[] = design.award.frames && design.award.frames.length >= 3 ? design.award.frames : DEFAULT_NUM_FRAMES;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const meta = await storageApi.upload(file, { ownerModule: "interactive", folder: `design-${designId}` });
      commit((d) => ({ ...d, award: { ...d.award, podiumFileId: meta.id } }));
    } catch {
      toast.error("领奖台图上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-[960px]">
        <div className="flex items-center gap-2 mb-2">
          <label className="rounded-md px-3 py-1 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer">
            {uploading ? "上传中…" : podiumUrl ? "更换领奖台图" : "上传领奖台图"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
          {podiumUrl && (
            <>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                className="rounded-md px-3 py-1 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                编辑版式(拖拽对位){design.award.frames ? "(已自定义)" : ""}
              </button>
              <button
                type="button"
                onClick={() => commit((d) => ({ ...d, award: { avatarBehind: d.award.avatarBehind } }))}
                className="rounded-md px-3 py-1 text-sm border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300"
              >
                去掉图(用内置台阶)
              </button>
            </>
          )}
          <span className="text-xs text-gray-400">前 3 名头像/名字会按版式落在领奖台图上</span>
        </div>

        <div className="relative w-full rounded-lg overflow-hidden shadow ring-1 ring-black/10 bg-[#20242e]" style={{ aspectRatio: "823 / 452" }}>
          {podiumUrl ? (
            <>
              {/* 头像占位:按图层走(藏台后=垫在台图下,从相框透明洞露出) */}
              {frames.map((f, i) => (
                <div
                  key={`av-${i}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-white font-black pointer-events-none ${design.award.avatarBehind ? "z-0" : "z-20"}`}
                  style={{ left: `${f.ax}%`, top: `${f.ay}%`, width: `${f.as}%`, aspectRatio: "1", background: RANK_COLOR[i], fontSize: "clamp(12px,2vw,28px)" }}
                >
                  {i + 1}
                </div>
              ))}
              <img src={podiumUrl} alt="" className="relative z-10 w-full h-full object-contain pointer-events-none" />
              {frames.map((f, i) => (
                <div
                  key={`nm-${i}`}
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2 text-white font-black whitespace-nowrap pointer-events-none"
                  style={{ left: `${f.nx}%`, top: `${f.ny}%`, fontSize: "clamp(10px,1.4vw,22px)", textShadow: "0 1px 4px rgba(0,0,0,.7)" }}
                >
                  第{i + 1}名名字 · 步数
                </div>
              ))}
            </>
          ) : (
            <div className="absolute inset-0 flex items-end justify-center gap-3 p-8">
              {[1, 0, 2].map((rank, idx) => (
                <div key={rank} className="flex flex-col items-center justify-end" style={{ width: "24%", height: ["55%", "75%", "45%"][idx] }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black ring-2 ring-white/70 mb-2" style={{ background: RANK_COLOR[rank] }}>
                    {rank + 1}
                  </div>
                  <div className="w-full flex-1 rounded-t-lg flex items-center justify-center text-white font-black text-3xl" style={{ background: `linear-gradient(180deg, ${RANK_COLOR[rank]}, color-mix(in srgb, ${RANK_COLOR[rank]} 60%, #333))` }}>
                    {rank + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1.5 text-xs text-gray-400">
          {podiumUrl ? "点「编辑版式」在图上拖拽前 3 名头像圈与名字位置" : "未上传领奖台图时,用内置金银铜台阶(也很好看)"}
        </div>

        {editorOpen && podiumUrl && (
          <PodiumFrameEditor
            podiumUrl={podiumUrl}
            value={design.award.frames}
            avatarBehind={design.award.avatarBehind}
            onConfirm={(f, behind) => {
              commit((d) => ({ ...d, award: { ...d.award, frames: f, avatarBehind: behind } }));
              setEditorOpen(false);
            }}
            onCancel={() => setEditorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
