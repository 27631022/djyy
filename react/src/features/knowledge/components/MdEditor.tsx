import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BoldIcon, HeadingIcon, ImageIcon, LinkIcon, ListIcon, Loader2Icon, TableIcon, EyeIcon, PencilLineIcon, ColumnsIcon } from "lucide-react";
import { storageApi } from "@/features/storage";
import { knowledgeFileRef } from "../api";
import { MarkdownView } from "./MarkdownView";

type ViewMode = "split" | "edit" | "preview";

/**
 * Markdown 编辑器:textarea + 实时预览分栏 + 最小工具栏 + 粘贴/选择图片直传 storage。
 * 图片以相对路径 `/api/public/knowledge/files/<id>` 插入正文(渲染时拼 origin)。
 * 受控 value/onChange;上传归属 `{ownerModule:'knowledge', folder}`。
 */
export function MdEditor({
  value,
  onChange,
  folder,
  minHeight = 420,
}: {
  value: string;
  onChange: (v: string) => void;
  /** storage 业务子文件夹(有文章 id 用 article-<id>,新建未保存用 drafts) */
  folder: string;
  minHeight?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ViewMode>("split");
  const [uploading, setUploading] = useState(false);
  // 最新 value 的 ref —— 异步循环(多图上传)里读它,避免闭包捕获旧 value 互相覆盖
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /** 在光标处插入文本(选中文本时包裹);基于 valueRef.current 取最新值 */
  function insert(before: string, after = "", placeholder = "") {
    const cur = valueRef.current;
    const ta = taRef.current;
    if (!ta) {
      const next = cur + before + placeholder + after;
      valueRef.current = next;
      onChange(next);
      return;
    }
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = cur.slice(s, e) || placeholder;
    const next = cur.slice(0, s) + before + sel + after + cur.slice(e);
    valueRef.current = next; // 立即前移,供同一异步循环的下一次 insert 读到
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + before.length + sel.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  /** 追加到末尾(批量图片场景,顺序稳定不依赖光标);基于 valueRef 取最新值 */
  function append(text: string) {
    const next = valueRef.current + text;
    valueRef.current = next;
    onChange(next);
  }

  async function uploadImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    try {
      for (const f of images) {
        const meta = await storageApi.upload(f, { ownerModule: "knowledge", folder });
        append(`\n![${f.name.replace(/\.[^.]+$/, "")}](${knowledgeFileRef(meta.id)})\n`);
      }
    } catch {
      toast.error("图片上传失败,请重试");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      void uploadImages(files);
    }
  }

  const toolBtn =
    "inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors";
  const modeBtn = (m: ViewMode) =>
    `inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
      mode === m ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
    }`;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50/70 flex-wrap">
        <button type="button" className={toolBtn} onClick={() => insert("## ", "", "标题")} title="插入标题">
          <HeadingIcon className="w-3.5 h-3.5" /> 标题
        </button>
        <button type="button" className={toolBtn} onClick={() => insert("**", "**", "加粗文字")} title="加粗">
          <BoldIcon className="w-3.5 h-3.5" /> 加粗
        </button>
        <button type="button" className={toolBtn} onClick={() => insert("\n- ", "", "列表项")} title="无序列表">
          <ListIcon className="w-3.5 h-3.5" /> 列表
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => insert("\n| 列1 | 列2 |\n| --- | --- |\n| ", " |  |\n", "内容")}
          title="插入表格"
        >
          <TableIcon className="w-3.5 h-3.5" /> 表格
        </button>
        <button type="button" className={toolBtn} onClick={() => insert("[", "](https://)", "链接文字")} title="插入链接">
          <LinkIcon className="w-3.5 h-3.5" /> 链接
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="上传图片(也可直接粘贴截图)"
        >
          {uploading ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          图片
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadImages(files);
          }}
        />
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={modeBtn("edit")} onClick={() => setMode("edit")}>
            <PencilLineIcon className="w-3.5 h-3.5" /> 编辑
          </button>
          <button type="button" className={modeBtn("split")} onClick={() => setMode("split")}>
            <ColumnsIcon className="w-3.5 h-3.5" /> 分栏
          </button>
          <button type="button" className={modeBtn("preview")} onClick={() => setMode("preview")}>
            <EyeIcon className="w-3.5 h-3.5" /> 预览
          </button>
        </span>
      </div>

      {/* 编辑/预览区 */}
      <div className={mode === "split" ? "grid grid-cols-2 divide-x divide-gray-100" : ""} style={{ minHeight }}>
        {mode !== "preview" && (
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            placeholder={"用 Markdown 书写正文…\n\n支持:# 标题、**加粗**、- 列表、表格、图片(直接粘贴截图即可上传)"}
            className="w-full h-full p-4 text-sm font-mono leading-6 resize-none outline-none"
            style={{ minHeight }}
            spellCheck={false}
          />
        )}
        {mode !== "edit" && (
          <div className="p-4 overflow-y-auto bg-white" style={{ minHeight, maxHeight: 720 }}>
            {value.trim() ? (
              <MarkdownView md={value} />
            ) : (
              <div className="text-sm text-gray-300 pt-8 text-center">预览区 —— 左侧输入后实时渲染</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
