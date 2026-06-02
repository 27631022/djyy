import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ImageIcon,
  UploadIcon,
  Loader2Icon,
  Trash2Icon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppIcon } from "@/shared/components/AppIcon";
import { BRAND_ICONS } from "@/shared/components/iconBrands";
import { iconAssetsApi } from "../api";

const PARTY = "var(--party-primary)";

/**
 * 中央图标库(系统设置)。
 * - 内置品牌:只读展示(monogram),点一下复制 `brand:<key>` 引用
 * - 自定义图标:上传 / 删除,点一下复制 `asset:<id>` 引用
 * 全站(AI 模型卡片、未来导航等)通过这些引用 + <AppIcon> 调用同一套图标。
 */
export default function IconLibraryPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: icons = [], isLoading } = useQuery({
    queryKey: ["icon-assets"],
    queryFn: () => iconAssetsApi.list(),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => iconAssetsApi.upload(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["icon-assets"] });
      toast.success("已上传");
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

  function copyRef(ref: string) {
    navigator.clipboard.writeText(ref).catch(() => {});
    setCopied(ref);
    toast.success(`已复制引用 ${ref}`);
    setTimeout(() => setCopied((c) => (c === ref ? null : c)), 1500);
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <ImageIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">图标库</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            全站统一的图标来源。内置品牌简标 + 自定义上传图标;各处通过引用(brand: / asset:)调用。
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {uploadMut.isPending ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <UploadIcon className="w-4 h-4" />
          )}
          上传图标
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
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* 内置品牌 */}
        <section className="bg-white rounded-lg border border-[#E9E9E9] p-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">内置品牌</h2>
            <span className="text-[11px] text-[#9CA3AF]">
              品牌色简标(内置,只读)。点一下复制 <code>brand:</code> 引用
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
            {BRAND_ICONS.map((b) => {
              const ref = `brand:${b.key}`;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => copyRef(ref)}
                  title={`${b.label} — 点击复制 ${ref}`}
                  className="flex flex-col items-center gap-1 p-2 rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
                >
                  <AppIcon icon={ref} size={30} />
                  <span className="text-[10px] text-[#4B5563] truncate w-full text-center">
                    {b.label}
                  </span>
                  <span className="text-[9px] font-mono text-[#9CA3AF] flex items-center gap-0.5">
                    {copied === ref ? (
                      <CheckIcon className="w-2.5 h-2.5 text-green-600" />
                    ) : (
                      <CopyIcon className="w-2.5 h-2.5" />
                    )}
                    {b.key}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 自定义 */}
        <section className="bg-white rounded-lg border border-[#E9E9E9] p-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">自定义图标</h2>
            <span className="text-[11px] text-[#9CA3AF]">
              上传真实 logo(SVG / PNG / WebP,≤512KB)。点一下复制 <code>asset:</code> 引用
            </span>
          </div>
          {isLoading ? (
            <div className="text-xs text-[#9CA3AF] py-6 text-center">加载中…</div>
          ) : icons.length === 0 ? (
            <div className="text-xs text-[#9CA3AF] py-8 text-center border-2 border-dashed border-[#E9E9E9] rounded-md">
              还没有自定义图标 —— 点右上「上传图标」,或把官方 logo(如 DeepSeek/豆包的 SVG)传上来
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
              {icons.map((ic) => {
                const ref = `asset:${ic.id}`;
                return (
                  <div
                    key={ic.id}
                    className="relative group flex flex-col items-center gap-1 p-2 rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
                  >
                    <button
                      type="button"
                      onClick={() => copyRef(ref)}
                      title={`${ic.name} — 点击复制 ${ref}`}
                      className="flex flex-col items-center gap-1 w-full"
                    >
                      <img
                        src={ic.dataUrl}
                        alt={ic.name}
                        className="w-8 h-8 object-contain"
                      />
                      <span className="text-[10px] text-[#4B5563] truncate w-full text-center">
                        {ic.name}
                      </span>
                      <span className="text-[9px] font-mono text-[#9CA3AF] flex items-center gap-0.5">
                        {copied === ref ? (
                          <CheckIcon className="w-2.5 h-2.5 text-green-600" />
                        ) : (
                          <CopyIcon className="w-2.5 h-2.5" />
                        )}
                        {(ic.size / 1024).toFixed(0)}KB
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `删除图标「${ic.name}」?引用它(asset:${ic.id})的地方会回退到默认。`,
                          )
                        )
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
        </section>
      </div>
    </div>
  );
}
