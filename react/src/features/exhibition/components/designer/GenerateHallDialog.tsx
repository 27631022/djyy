import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { storageApi } from "@/features/storage";
import { hallApi, type GeneratedHall } from "../../api";
import { exhibitionAssetUrl, type HallThemePreset } from "../../lib/hallTypes";

const SIZE_OPTIONS = [
  { label: "小型(16×10m)", w: 16, d: 10 },
  { label: "中型(24×14m)", w: 24, d: 14 },
  { label: "大型(32×18m)", w: 32, d: 18 },
];
const PRESET_OPTIONS: { value: HallThemePreset; label: string }[] = [
  { value: "modern_light", label: "现代浅色" },
  { value: "party_red", label: "党建红" },
  { value: "dark_tech", label: "深色科技" },
  { value: "future_tech", label: "未来科技" },
];
const FEATURE_OPTIONS = ["荣誉展示", "视频展播", "产品/模型展示", "图片展廊", "党建文化", "发展历程"];

interface GenerateHallDialogProps {
  hallId: string;
  open: boolean;
  onClose: () => void;
  /** 应用生成结果(整体替换画布,父级走可撤销 update) */
  onGenerate: (g: GeneratedHall) => void;
}

/** AI 生成展厅:文字描述 + 选项(尺寸/色调/功能)+ 可选参考图 → 平面布置应用进画布 */
export function GenerateHallDialog({ hallId, open, onClose, onGenerate }: GenerateHallDialogProps) {
  const [description, setDescription] = useState("");
  const [sizeIdx, setSizeIdx] = useState(1);
  const [preset, setPreset] = useState<HallThemePreset>("modern_light");
  const [features, setFeatures] = useState<string[]>(["荣誉展示", "党建文化"]);
  const [imageFileId, setImageFileId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const genMut = useMutation({
    mutationFn: () =>
      hallApi.aiGenerate({
        description: description.trim() || undefined,
        imageFileId,
        widthM: SIZE_OPTIONS[sizeIdx].w,
        depthM: SIZE_OPTIONS[sizeIdx].d,
        preset,
        features,
      }),
    onSuccess: (g) => {
      onGenerate(g);
      onClose();
      toast.success(`已生成「${g.name}」:${g.walls.length} 段墙 · ${g.fixtures.length} 个组件(可 Ctrl+Z 撤销)`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "生成失败"),
  });

  const toggleFeature = (f: string) =>
    setFeatures((arr) => (arr.includes(f) ? arr.filter((x) => x !== f) : [...arr, f]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !genMut.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI 生成展厅布置</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs text-[#6B7280] mb-1 block">想要什么样的展厅?(可空,选项足够也行)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="如:序厅放企业 LOGO 立体字,主展区一面荣誉墙、一个产品模型台,角落放绿植,动线上加引导箭头…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5E5E5] focus:border-[var(--party-primary)] focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7280] mb-1 block">展厅大小</label>
              <select value={sizeIdx} onChange={(e) => setSizeIdx(Number(e.target.value))} className="w-full px-2 py-1.5 text-sm rounded-lg border border-[#E5E5E5] bg-white">
                {SIZE_OPTIONS.map((s, i) => (
                  <option key={s.label} value={i}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7280] mb-1 block">色调风格</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value as HallThemePreset)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-[#E5E5E5] bg-white">
                {PRESET_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#6B7280] mb-1.5 block">需要的功能(多选)</label>
            <div className="flex flex-wrap gap-1.5">
              {FEATURE_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFeature(f)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    features.includes(f)
                      ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5"
                      : "border-[#E5E5E5] text-[#6B7280] hover:border-[#D4D4D4]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#6B7280] mb-1 block">参考图(可选:展厅照片 / 效果图 / 手绘平面)</label>
            {imageFileId ? (
              <div className="flex items-center gap-2">
                <img src={exhibitionAssetUrl(imageFileId)} alt="参考图" className="h-16 rounded border border-[#E9E9E9] object-cover" />
                <button type="button" className="p-1 text-[#9CA3AF] hover:text-red-500" onClick={() => setImageFileId(undefined)} title="移除参考图">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-dashed border-[#D4D4D4] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
              >
                {uploading ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ImagePlusIcon className="w-3.5 h-3.5" />}
                {uploading ? "上传中…" : "上传参考图"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setUploading(true);
                try {
                  const meta = await storageApi.upload(f, { ownerModule: "exhibition", folder: `${hallId}/_ref` });
                  setImageFileId(meta.id);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "上传失败");
                } finally {
                  setUploading(false);
                }
              }}
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1">带参考图需要后台配好多模态(vision)模型;没配就用文字+选项。</p>
          </div>

          <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1.5">
            生成结果会<b>整体替换</b>当前画布(墙体/组件/主题),不满意 Ctrl+Z 即可撤销;确认满意再点「保存」。
          </p>
        </div>
        <DialogFooter>
          <button onClick={onClose} disabled={genMut.isPending} className="px-3 py-1.5 text-sm rounded-lg border border-[#E5E5E5] text-[#6B7280] hover:bg-[#F7F8FA] disabled:opacity-50">
            取消
          </button>
          <button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending || uploading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {genMut.isPending && <Loader2Icon className="w-4 h-4 animate-spin" />}
            {genMut.isPending ? "AI 生成中(约 10-30 秒)…" : "生成"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
