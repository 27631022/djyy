import type { CanvasBackground } from "../../lib/venueTypes";

const INPUT =
  "w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

/** 画布设置:尺寸 / 网格 / 背景色 / 平面图底图 */
export function BackgroundPanel({
  background,
  canvasWidth,
  canvasHeight,
  gridSize,
  showGrid,
  onBackgroundChange,
  onCanvasSizeChange,
  onGridSizeChange,
  onShowGridChange,
}: {
  background: CanvasBackground;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  showGrid: boolean;
  onBackgroundChange: (bg: CanvasBackground) => void;
  onCanvasSizeChange: (w: number, h: number) => void;
  onGridSizeChange: (n: number) => void;
  onShowGridChange: (b: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {/* 画布尺寸 */}
      <div>
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">画布尺寸(px)</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] text-[#6B7280] mb-1">宽</span>
            <input
              type="number"
              value={canvasWidth}
              onChange={(e) => {
                const w = parseInt(e.target.value, 10);
                if (!Number.isNaN(w) && w >= 100) onCanvasSizeChange(w, canvasHeight);
              }}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-[#6B7280] mb-1">高</span>
            <input
              type="number"
              value={canvasHeight}
              onChange={(e) => {
                const h = parseInt(e.target.value, 10);
                if (!Number.isNaN(h) && h >= 100) onCanvasSizeChange(canvasWidth, h);
              }}
              className={INPUT}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { label: "宽屏 1200×800", w: 1200, h: 800 },
            { label: "方厅 1000×1000", w: 1000, h: 1000 },
            { label: "礼堂 1600×900", w: 1600, h: 900 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => onCanvasSizeChange(p.w, p.h)}
              className="px-2 py-1 text-[10px] rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] text-[#6B7280] hover:text-[var(--party-primary)]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 网格 */}
      <div className="pt-3 border-t border-[#F0F0F0]">
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">网格</div>
        <label className="flex items-center gap-2 text-xs text-[#4B5563] mb-2 cursor-pointer">
          <input type="checkbox" checked={showGrid} onChange={(e) => onShowGridChange(e.target.checked)} />
          显示网格线
        </label>
        <label className="block">
          <span className="block text-[11px] text-[#6B7280] mb-1">网格间距 / 吸附步长(px)</span>
          <input
            type="number"
            value={gridSize}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n) && n >= 4) onGridSizeChange(n);
            }}
            className={INPUT}
          />
        </label>
      </div>

      {/* 背景色 */}
      <div className="pt-3 border-t border-[#F0F0F0]">
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">背景色</div>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(background.color ?? "") ? background.color : "#FFFFFF"}
          onChange={(e) => onBackgroundChange({ ...background, color: e.target.value })}
          className="w-10 h-8 rounded border border-[#E9E9E9] cursor-pointer p-0.5"
        />
      </div>

      {/* 平面图底图 */}
      <div className="pt-3 border-t border-[#F0F0F0]">
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">平面图底图(可选)</div>
        <div className="flex items-center gap-2">
          <label className="px-2 py-1.5 text-[11px] rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] cursor-pointer">
            上传底图
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () =>
                  onBackgroundChange({
                    type: "image",
                    color: background.color ?? "#FFFFFF",
                    imageUrl: String(reader.result),
                    fillMode: background.fillMode ?? "contain",
                  });
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
          </label>
          {background.type === "image" && background.imageUrl && (
            <button
              onClick={() => onBackgroundChange({ type: "color", color: background.color ?? "#FFFFFF" })}
              className="text-[11px] text-[#EF4444] hover:underline"
            >
              移除底图
            </button>
          )}
        </div>
        {background.type === "image" && background.imageUrl && (
          <label className="block mt-2">
            <span className="block text-[11px] text-[#6B7280] mb-1">铺图方式</span>
            <select
              value={background.fillMode ?? "contain"}
              onChange={(e) => onBackgroundChange({ ...background, fillMode: e.target.value as "cover" | "contain" | "center" })}
              className={INPUT}
            >
              <option value="contain">完整显示(contain)</option>
              <option value="cover">铺满(cover)</option>
              <option value="center">居中原始大小</option>
            </select>
          </label>
        )}
        <p className="mt-2 text-[10px] text-[#9CA3AF] leading-relaxed">
          V1 底图以 base64 内嵌保存。大图建议先压缩;后续版本改走文件存储。
        </p>
      </div>
    </div>
  );
}
