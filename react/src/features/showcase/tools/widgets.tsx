import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { showcaseFileUrl, showcaseErrMsg } from "../api";
import { TOOL_INPUT, UPLOAD_BOX } from "./shared";

/** 共享编辑小件(JSX)—— 各工具 Editor 复用 */

export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
  maxLength,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      className={`${TOOL_INPUT} ${className}`}
      value={value ?? ""}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

/** 数字输入:空 → undefined */
export function NumInput({
  value,
  onChange,
  placeholder,
  className = "",
  step,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  className?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      className={`${TOOL_INPUT} ${className}`}
      value={value ?? ""}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        const s = e.target.value;
        if (s === "") return onChange(undefined);
        const n = Number(s);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
    />
  );
}

/**
 * 图片选择:未选=虚线上传框;已选=缩略图 + 悬浮「换图/移除」。
 * 上传经外部注入的 upload(绑定 晒台/作品 上传口),存 fileId。
 */
export function ImagePick({
  fileId,
  onPick,
  upload,
  label = "点击上传图片",
  accept = "image/*",
  className = "h-36",
  removable = false,
}: {
  fileId: string | undefined;
  onPick: (fileId: string | undefined) => void;
  upload: (file: File) => Promise<{ fileId: string; name: string }>;
  label?: string;
  accept?: string;
  className?: string;
  removable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doUpload = async (file: File) => {
    setBusy(true);
    try {
      const r = await upload(file);
      onPick(r.fileId);
    } catch (e) {
      toast.error(showcaseErrMsg(e, "上传失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void doUpload(f);
        }}
      />
      {fileId ? (
        <div className="group relative h-full w-full overflow-hidden rounded-lg border bg-muted">
          <img src={showcaseFileUrl(fileId)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 hidden items-center justify-center gap-2 bg-black/40 group-hover:flex">
            <button
              type="button"
              className="rounded-md bg-white/90 px-2 py-1 text-xs text-gray-800 hover:bg-white"
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCw className="mr-1 inline h-3 w-3" />
              换图
            </button>
            {removable && (
              <button
                type="button"
                className="rounded-md bg-white/90 px-2 py-1 text-xs text-red-600 hover:bg-white"
                onClick={() => onPick(undefined)}
              >
                <X className="mr-1 inline h-3 w-3" />
                移除
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${UPLOAD_BOX} h-full w-full text-xs`}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {busy ? "上传中…" : label}
        </button>
      )}
    </div>
  );
}

/** 区块图注(展示态,居中灰字) */
export function Caption({ text }: { text: string | undefined }) {
  if (!text) return null;
  return <p className="mt-1.5 text-center text-xs text-muted-foreground">{text}</p>;
}
