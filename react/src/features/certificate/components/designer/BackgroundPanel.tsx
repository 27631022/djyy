import { useRef } from "react";
import { ImageIcon, TrashIcon, UploadIcon } from "lucide-react";
import type { CanvasBackground } from "../../lib/designerTypes";
import { EXPORT_SCALE } from "../../lib/certificatePdf";
import { toast } from "sonner";

interface BackgroundPanelProps {
  background: CanvasBackground;
  canvasWidth: number;
  canvasHeight: number;
  onBackgroundChange: (bg: CanvasBackground) => void;
  onCanvasSizeChange: (w: number, h: number) => void;
}

// 底图按 ×EXPORT_SCALE 超采样导出,需要较高分辨率才清晰,故放宽到 8MB。
// (base64 进 designJson 存库,过大模板会臃肿 —— 8MB 是清晰度与体积的平衡)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/**
 * V3+:上传背景底图时画布尺寸自动适配。
 * 若图片任一边 > MAX 像素,长边按 MAX 缩放,短边等比;
 * 都 ≤ MAX 直接按原图尺寸。
 */
const CANVAS_AUTO_FIT_MAX = 1100;

export function BackgroundPanel({
  background,
  canvasWidth,
  canvasHeight,
  onBackgroundChange,
  onCanvasSizeChange,
}: BackgroundPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB,请压缩后再上传`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      // V3+:先读图片真实尺寸,按等比规则算目标画布大小,再一并提交
      const img = new Image();
      img.onload = () => {
        const { width: w0, height: h0 } = img;
        const longest = Math.max(w0, h0);
        let targetW = w0;
        let targetH = h0;
        if (longest > CANVAS_AUTO_FIT_MAX) {
          const scale = CANVAS_AUTO_FIT_MAX / longest;
          targetW = Math.round(w0 * scale);
          targetH = Math.round(h0 * scale);
          toast.info(
            `图片 ${w0}×${h0},自动按等比缩到 ${targetW}×${targetH} 适配画布(长边 ${CANVAS_AUTO_FIT_MAX}px 上限)`,
          );
        }
        onBackgroundChange({
          ...background,
          type: "image",
          imageUrl: dataUrl,
          fillMode: background.fillMode ?? "cover",
        });
        // 画布尺寸跟图变化 → 只当尺寸真的不同才触发,避免无意义历史项
        if (targetW !== canvasWidth || targetH !== canvasHeight) {
          onCanvasSizeChange(targetW, targetH);
        }
        // 采样匹配:导出按 ×EXPORT_SCALE 超采样,底图原生分辨率需 ≥ 画布逻辑长边 × EXPORT_SCALE 才清晰
        const recommendedLong = Math.max(targetW, targetH) * EXPORT_SCALE;
        if (longest < recommendedLong) {
          toast.warning(
            `底图 ${w0}×${h0} 分辨率偏低:×${EXPORT_SCALE} 导出建议底图长边 ≥ ${recommendedLong}px,否则下载/打印可能发虚。建议换更高清底图。`,
          );
        }
      };
      img.onerror = () => {
        // 解码失败也至少把图先放上,画布尺寸保持原样
        toast.warning("图片解码失败,画布尺寸未自动调整");
        onBackgroundChange({
          ...background,
          type: "image",
          imageUrl: dataUrl,
          fillMode: background.fillMode ?? "cover",
        });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => toast.error("读取图片失败");
    reader.readAsDataURL(file);
    // 清掉 input 以便重传同一张
    e.target.value = "";
  }

  function clearImage() {
    onBackgroundChange({ ...background, type: "color", imageUrl: undefined });
  }

  const hasImage = background.type === "image" && background.imageUrl;

  return (
    <div className="flex flex-col gap-3">
      <Section title="画布尺寸">
        <div className="grid grid-cols-2 gap-2">
          <Field label="宽 px">
            <NumberInput
              value={canvasWidth}
              onChange={(v) => onCanvasSizeChange(v, canvasHeight)}
            />
          </Field>
          <Field label="高 px">
            <NumberInput
              value={canvasHeight}
              onChange={(v) => onCanvasSizeChange(canvasWidth, v)}
            />
          </Field>
        </div>
      </Section>

      <Section title="底色">
        <Field label="纯色">
          <ColorInput
            value={background.color ?? "#FFFFFF"}
            onChange={(c) => onBackgroundChange({ ...background, color: c })}
          />
        </Field>
        <p className="text-[10px] text-[#9CA3AF] mt-1">
          底色总是绘制 —— 即使叠了图片,图片透明区域也会透出来
        </p>
      </Section>

      <Section title="底图">
        {!hasImage ? (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-1 py-6 rounded border border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors"
            >
              <UploadIcon className="w-5 h-5" />
              <span className="text-xs">点击上传底图</span>
              <span className="text-[10px]">JPG/PNG · &lt; 8MB · 建议 ≥ 画布 3 倍分辨率</span>
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded border border-[#E9E9E9] overflow-hidden bg-[#F7F8FA]">
              <img
                src={background.imageUrl}
                alt="底图预览"
                className="w-full h-32 object-contain"
              />
              <button
                onClick={clearImage}
                className="absolute top-1 right-1 p-1.5 rounded bg-white/90 border border-[#E9E9E9] hover:bg-[#FEE2E2] hover:border-[#EF4444] text-[#6B7280] hover:text-[#EF4444]"
                title="移除底图"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <Field label="填充方式">
              <select
                value={background.fillMode ?? "cover"}
                onChange={(e) =>
                  onBackgroundChange({
                    ...background,
                    fillMode: e.target.value as CanvasBackground["fillMode"],
                  })
                }
                className={inputCls}
              >
                <option value="cover">cover 铺满(可能裁切)</option>
                <option value="contain">contain 完整显示(可能留白)</option>
                <option value="center">center 原始大小居中</option>
              </select>
            </Field>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-xs text-[#6B7280] hover:text-[var(--party-primary)] transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              更换图片
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </Section>
    </div>
  );
}

/* ─── 公用片段(暂复制自 PropertiesPanel,后续可统一到 shared) ─── */

const inputCls =
  "w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9CA3AF]">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={Math.round(value)}
      min={100}
      max={4000}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={inputCls}
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-[#E9E9E9] cursor-pointer flex-shrink-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}
