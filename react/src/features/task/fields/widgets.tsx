import { useRef, useState } from "react";
import { PlusIcon, XIcon, UploadIcon, Loader2Icon, FileTextIcon, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import type { TaskField } from "../api";
import { PROP_INPUT, FILE_ACCEPT_PRESETS } from "./shared";

/** 已上传文件项(存进 formData:{id,name}[]) */
interface FilledFile {
  id: string;
  name: string;
}

/**
 * 文件 / 图片填报控件:点选 → 走 storage 上传 → 存 {id,name}[]。
 * 受 maxFiles / accept 约束;file/image 共用,image 只是默认 accept=image/*。
 */
export function FileFillInput({
  field,
  value,
  onChange,
  accept,
  image,
}: {
  field: TaskField;
  value: unknown;
  onChange: (v: unknown) => void;
  accept?: string;
  image?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const files: FilledFile[] = Array.isArray(value) ? (value as FilledFile[]) : [];
  const maxFiles = field.maxFiles;
  const full = !!maxFiles && files.length >= maxFiles;

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const uploaded: FilledFile[] = [];
      for (const file of Array.from(list)) {
        const meta = await storageApi.upload(file, {
          ownerModule: "task",
          folder: `填报-${field.label || field.code}`,
        });
        uploaded.push({ id: meta.id, name: meta.originalName });
      }
      let next = [...files, ...uploaded];
      if (maxFiles && next.length > maxFiles) next = next.slice(0, maxFiles);
      onChange(next);
    } catch {
      toast.error("上传失败,请重试");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((fl, i) => (
            <span
              key={fl.id + i}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border border-[#dce4ef] bg-white text-xs max-w-[240px]"
            >
              {image ? (
                <ImageIcon className="w-3.5 h-3.5 text-[#1A6BC8] flex-shrink-0" />
              ) : (
                <FileTextIcon className="w-3.5 h-3.5 text-[#1A6BC8] flex-shrink-0" />
              )}
              <span className="truncate text-[#172033]" title={fl.name}>
                {fl.name}
              </span>
              <button
                type="button"
                title="移除"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed border-[#dce4ef] text-[13px] text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
        >
          {busy ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
          {busy ? "上传中…" : image ? "上传图片" : "上传文件"}
          {maxFiles ? <span className="text-[11px] text-[#9CA3AF]">{files.length}/{maxFiles}</span> : null}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!maxFiles || maxFiles > 1}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}

/**
 * 字段属性编辑器之间共享的 React 控件。
 * (本文件只导出组件 —— 满足 react-refresh;纯常量 / 函数在 shared.ts。)
 */

/** 属性行:标签 + 说明 + 控件 */
export function PropRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[12px] font-medium text-[#4B5563]">{label}</span>
        {hint && <span className="text-[10px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/** 数字输入(空 → undefined) */
export function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={PROP_INPUT}
    />
  );
}

/** 下拉「自定义选项」编辑器(增删行) */
export function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`选项 ${i + 1}`}
            className={PROP_INPUT}
          />
          <button
            type="button"
            title="删除选项"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-[#dce4ef] text-[12px] text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        添加选项
      </button>
    </div>
  );
}

/** 文件「允许类型」多选 chips */
export function AcceptChips({
  accept,
  onChange,
}: {
  accept: string;
  onChange: (a: string) => void;
}) {
  const set = new Set(
    accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  function toggle(exts: string[]) {
    const all = exts.every((e) => set.has(e));
    const next = new Set(set);
    if (all) exts.forEach((e) => next.delete(e));
    else exts.forEach((e) => next.add(e));
    onChange([...next].join(","));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILE_ACCEPT_PRESETS.map((p) => {
        const on = p.exts.every((e) => set.has(e));
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => toggle(p.exts)}
            className={`px-2 py-1 rounded-full text-[12px] border transition-colors ${
              on
                ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-bold"
                : "border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      {set.size === 0 && (
        <span className="text-[11px] text-[#9CA3AF] self-center">未选 = 任意类型</span>
      )}
    </div>
  );
}
