import { useMemo, useState } from "react";
import { SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_LAYOUT_SPEC,
  generateRowLayout,
  previewLayout,
  type VenueLayoutSpec,
} from "../../lib/venueAutoLayout";
import type { VenueDesignerState } from "../../lib/venueTypes";
import { venueAiApi } from "../../api";
import { AiButton } from "@/shared/components/AiButton";

const PARTY = "var(--party-primary)";
const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

/**
 * 智能生成排式布局对话框。
 * 表单为主(参数 → venueAutoLayout 确定性排布);可选「AI 帮填」把一段描述解析成参数。
 */
export function GenerateLayoutDialog({
  onClose,
  onGenerate,
  defaultMeetingName,
}: {
  onClose: () => void;
  onGenerate: (state: VenueDesignerState) => void;
  defaultMeetingName?: string;
}) {
  const [spec, setSpec] = useState<VenueLayoutSpec>({
    ...DEFAULT_LAYOUT_SPEC,
    meetingName: defaultMeetingName?.trim() || DEFAULT_LAYOUT_SPEC.meetingName,
  });
  const [description, setDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const patch = (p: Partial<VenueLayoutSpec>) => setSpec((s) => ({ ...s, ...p }));
  const preview = useMemo(() => previewLayout(spec), [spec]);

  async function handleAiFill() {
    const desc = description.trim();
    if (desc.length < 4) {
      toast.error("先写一句描述,比如「全厂大会,参会260人,主席台坐7位领导,要发言席,每排20」");
      return;
    }
    setAiLoading(true);
    try {
      const r = await venueAiApi.extractLayout(desc);
      setSpec((s) => ({ ...s, ...r }));
      toast.success("AI 已填好参数,可再微调后生成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 帮填失败");
    } finally {
      setAiLoading(false);
    }
  }

  function handleGenerate() {
    onGenerate(generateRowLayout(spec));
    toast.success(`已生成 ${preview.total} 个座位`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
          <SparklesIcon className="w-4 h-4" style={{ color: "#7C3AED" }} />
          <h2 className="text-base font-bold text-[#1A1A1A] flex-1">智能生成排式布局</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* AI 帮填 */}
          <div className="rounded-lg border border-[#E9E9E9] bg-[#FAFAFA] p-3">
            <div className="text-xs font-semibold text-[#6B7280] mb-1.5 flex items-center gap-1">
              <SparklesIcon className="w-3.5 h-3.5" style={{ color: "#7C3AED" }} />
              用一句话描述(可选,AI 帮你填下面的参数)
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="例:全厂职工大会,参会约 260 人,主席台坐 7 位领导,要发言席,每排 20 个,中间留 1 条过道"
              className={`${INPUT} resize-none`}
            />
            <AiButton onClick={() => void handleAiFill()} disabled={aiLoading} className="mt-2 px-3 py-1.5 text-xs">
              {aiLoading ? "AI 解析中…" : "AI 帮填参数"}
            </AiButton>
          </div>

          {/* 参数表单 */}
          <div className="grid grid-cols-2 gap-3">
            <L label="会议名称(横幅文字)" full>
              <input
                value={spec.meetingName}
                onChange={(e) => patch({ meetingName: e.target.value })}
                className={INPUT}
                placeholder="如:2026年度工作会议"
              />
            </L>
            <L label="参会人数(台下)">
              <input
                type="number"
                min={0}
                value={spec.attendeeCount}
                onChange={(e) => patch({ attendeeCount: parseInt(e.target.value, 10) || 0 })}
                className={INPUT}
              />
            </L>
            <L label="每排座位数">
              <input
                type="number"
                min={1}
                value={spec.seatsPerRow}
                onChange={(e) => patch({ seatsPerRow: parseInt(e.target.value, 10) || 1 })}
                className={INPUT}
              />
            </L>
            <L label="中间过道">
              <select
                value={spec.aisles}
                onChange={(e) => patch({ aisles: parseInt(e.target.value, 10) })}
                className={INPUT}
              >
                <option value={0}>不留过道</option>
                <option value={1}>1 条(分两块)</option>
                <option value={2}>2 条(分三块)</option>
              </select>
            </L>
            <L label="主席台人数(台上领导)">
              <input
                type="number"
                min={0}
                value={spec.presidiumCount}
                onChange={(e) => patch({ presidiumCount: parseInt(e.target.value, 10) || 0 })}
                className={INPUT}
              />
            </L>
            <L label="发言席">
              <select
                value={spec.podium}
                onChange={(e) => patch({ podium: e.target.value as VenueLayoutSpec["podium"] })}
                className={INPUT}
              >
                <option value="none">不要</option>
                <option value="left">主席台左侧</option>
                <option value="right">主席台右侧</option>
              </select>
            </L>
            <L label="顶部横幅">
              <label className="flex items-center gap-2 text-sm h-[38px] cursor-pointer">
                <input type="checkbox" checked={spec.banner} onChange={(e) => patch({ banner: e.target.checked })} />
                显示横幅
              </label>
            </L>
            <L label="主席台背景墙">
              <label className="flex items-center gap-2 text-sm h-[38px] cursor-pointer">
                <input type="checkbox" checked={spec.backWall} onChange={(e) => patch({ backWall: e.target.checked })} />
                显示背景墙
              </label>
            </L>
          </div>

          {/* 预览 */}
          <div className="rounded-lg bg-party-soft px-3 py-2 text-xs text-[#6B7280]">
            将生成:台下 <b className="text-[var(--party-primary)]">{preview.audienceSeats}</b> 座(约 {preview.rows} 排)
            {preview.presidiumSeats > 0 && (
              <>
                {" "}
                + 主席台 <b className="text-[var(--party-primary)]">{preview.presidiumSeats}</b> 座
              </>
            )}
            ,共 <b className="text-[var(--party-primary)]">{preview.total}</b> 个座位。
          </div>
          <p className="text-[11px] text-[#9CA3AF]">
            生成会<b>替换当前画布全部内容</b>(可按 Ctrl+Z 撤销)。生成后仍可手动拖动微调。
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#F0F0F0] sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg text-white font-medium"
            style={{ backgroundColor: PARTY }}
          >
            <SparklesIcon className="w-4 h-4" />
            生成并替换画布
          </button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="block text-xs text-[#6B7280] mb-1">{label}</span>
      {children}
    </label>
  );
}
