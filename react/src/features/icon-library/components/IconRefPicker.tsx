import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon, UploadIcon, Loader2Icon, Trash2Icon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { AppIcon } from "@/shared/components/AppIcon";
import { BRAND_ICONS } from "@/shared/components/iconBrands";
import { iconAssetsApi } from "../api";

type Tab = "default" | "brand" | "custom";

/**
 * 图标引用选择器 —— 给「需要选品牌/自定义图标」的地方用(如 AI 模型卡片图标)。
 * value/onChange 是引用串:'' = 默认(按品牌自动) / 'brand:<key>' / 'asset:<id>'。
 * 自定义 tab 直接从中央图标库读 + 支持现场上传。
 */
export function IconRefPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 border border-[#E9E9E9] rounded-md px-3 py-2 text-sm hover:border-[var(--party-primary)] bg-white transition-colors"
      >
        <span className="w-7 h-7 rounded-md flex items-center justify-center bg-[#F7F8FA] flex-shrink-0">
          <AppIcon icon={value} size={18} />
        </span>
        <span className="flex-1 text-left truncate text-xs text-[#4B5563]">
          {value ? (
            <span className="font-mono">{value}</span>
          ) : (
            "默认(按品牌名自动)"
          )}
        </span>
        <span className="text-[#9CA3AF] text-xs">▾</span>
      </button>
      {open && (
        <PickerDialog
          value={value}
          onPick={(r) => {
            onChange(r);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function PickerDialog({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (ref: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(
    value.startsWith("asset:") ? "custom" : value.startsWith("brand:") ? "brand" : "default",
  );
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0F0]">
          <h3 className="text-sm font-semibold text-[#1A1A1A]">选择图标</h3>
          <button onClick={onClose} type="button" className="p-1 rounded hover:bg-[#F7F8FA] text-[#6B7280]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {/* tabs */}
        <div className="flex border-b border-[#F0F0F0] text-xs">
          {(
            [
              ["default", "默认"],
              ["brand", "品牌"],
              ["custom", "自定义"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 border-b-2 -mb-px ${
                tab === t
                  ? "border-[var(--party-primary)] text-[var(--party-primary)] font-medium"
                  : "border-transparent text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === "default" && (
            <button
              type="button"
              onClick={() => onPick("")}
              className={`w-full flex items-center gap-2 p-3 rounded-md border text-left ${
                !value
                  ? "border-[var(--party-primary)] bg-party-soft"
                  : "border-[#E9E9E9] hover:bg-[#F7F8FA]"
              }`}
            >
              <span className="w-8 h-8 rounded-md bg-[#F7F8FA] flex items-center justify-center">
                <AppIcon icon="" size={18} />
              </span>
              <div className="text-xs">
                <div className="font-medium text-[#1A1A1A]">默认(按品牌名自动)</div>
                <div className="text-[10px] text-[#9CA3AF]">
                  provider 名含 deepseek/qwen 等会自动套用对应品牌色简标
                </div>
              </div>
              {!value && <CheckIcon className="w-4 h-4 ml-auto text-[var(--party-primary)]" />}
            </button>
          )}

          {tab === "brand" && (
            <div className="grid grid-cols-4 gap-2">
              {BRAND_ICONS.map((b) => {
                const ref = `brand:${b.key}`;
                const on = value === ref;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onPick(ref)}
                    title={`${b.label} · ${ref}`}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md border ${
                      on
                        ? "border-[var(--party-primary)] bg-party-soft"
                        : "border-[#E9E9E9] hover:bg-[#F7F8FA]"
                    }`}
                  >
                    <AppIcon icon={ref} size={28} />
                    <span className="text-[10px] text-[#4B5563] truncate w-full text-center">
                      {b.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "custom" && <CustomTab value={value} onPick={onPick} />}
        </div>
      </div>
    </div>
  );
}

function CustomTab({
  value,
  onPick,
}: {
  value: string;
  onPick: (ref: string) => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { data: icons = [], isLoading } = useQuery({
    queryKey: ["icon-assets"],
    queryFn: () => iconAssetsApi.list(),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => iconAssetsApi.upload(file),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["icon-assets"] });
      toast.success("已上传");
      onPick(`asset:${created.id}`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "上传失败"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => iconAssetsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["icon-assets"] });
      toast.success("已删除");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploadMut.isPending}
        className="w-full mb-3 rounded-md border-2 border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] py-4 flex flex-col items-center gap-1 text-xs text-[#6B7280] disabled:opacity-50"
      >
        {uploadMut.isPending ? (
          <Loader2Icon className="w-5 h-5 animate-spin" />
        ) : (
          <UploadIcon className="w-5 h-5" />
        )}
        点击上传图标(SVG / PNG / WebP,≤512KB)
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,.png,.webp,.jpg,.jpeg,.gif,image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadMut.mutate(f);
          e.target.value = "";
        }}
      />
      {isLoading ? (
        <div className="text-xs text-[#9CA3AF] py-6 text-center">加载中…</div>
      ) : icons.length === 0 ? (
        <div className="text-xs text-[#9CA3AF] py-6 text-center">
          还没有自定义图标 —— 上传一个(可在「系统设置 → 图标库」统一管理)
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {icons.map((ic) => {
            const ref = `asset:${ic.id}`;
            const on = value === ref;
            return (
              <div
                key={ic.id}
                className={`relative group flex flex-col items-center gap-1 p-2 rounded-md border ${
                  on
                    ? "border-[var(--party-primary)] bg-party-soft"
                    : "border-[#E9E9E9] hover:bg-[#F7F8FA]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPick(ref)}
                  title={ic.name}
                  className="flex flex-col items-center gap-1 w-full"
                >
                  <img
                    src={ic.dataUrl}
                    alt={ic.name}
                    className="w-7 h-7 object-contain"
                  />
                  <span className="text-[10px] text-[#4B5563] truncate w-full text-center">
                    {ic.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`删除图标「${ic.name}」?引用它的地方会回退到默认。`))
                      delMut.mutate(ic.id);
                  }}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded text-[#9CA3AF] opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50"
                  title="删除"
                >
                  <Trash2Icon className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
