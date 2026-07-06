import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BoldIcon, HeadingIcon, ImageIcon, LinkIcon, ListIcon, Loader2Icon, TableIcon, EyeIcon, PencilLineIcon, ColumnsIcon, VideoIcon, LightbulbIcon, Undo2Icon, Redo2Icon } from "lucide-react";
import { MarkdownView } from "./MarkdownView";

type ViewMode = "split" | "edit" | "preview";

/**
 * Markdown 编辑器:textarea + 实时预览分栏 + 最小工具栏 + 图片/视频上传(粘贴/选择)。
 * 上传由外部 `uploadFile` 回调完成(知识库走规范命名端点:标题-序号、集中 article-<id>),
 * 返回可访问 url;图片插 `![]()`、视频插 `<video controls>`(MarkdownView 已支持渲染)。
 * 无 uploadFile(草稿未保存)时上传按钮禁用并提示先保存。受控 value/onChange。
 */
export function MdEditor({
  value,
  onChange,
  uploadFile,
  minHeight = 420,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 上传一个文件返回 { url }(无则禁用图片/视频上传,提示先保存草稿) */
  uploadFile?: (file: File) => Promise<{ url: string }>;
  minHeight?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const imgRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ViewMode>("split");
  const [uploading, setUploading] = useState(false);
  // 最新 value 的 ref —— 异步循环(多图上传)里读它,避免闭包捕获旧 value 互相覆盖
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 撤销/重做历史栈:输入按 700ms 停顿合并成一个快照(撤销以「停顿」为粒度,不逐字回退)。
  // canUndo/canRedo 用 state(不在 render 期读 ref,避开 React Compiler 报错)。
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastSnap = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHist = () => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  };

  /** 提交一次内容变更:记历史(合并快速输入)+ 上抛 onChange */
  function commit(next: string, discrete = false) {
    const now = Date.now();
    const prev = valueRef.current;
    if (prev !== next && (discrete || now - lastSnap.current > 700)) {
      past.current.push(prev);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      lastSnap.current = now;
      syncHist();
    }
    valueRef.current = next;
    onChange(next);
  }

  function undo() {
    if (!past.current.length) return;
    future.current.push(valueRef.current);
    const prev = past.current.pop()!;
    lastSnap.current = 0;
    valueRef.current = prev;
    onChange(prev);
    syncHist();
  }
  function redo() {
    if (!future.current.length) return;
    past.current.push(valueRef.current);
    const nxt = future.current.pop()!;
    lastSnap.current = 0;
    valueRef.current = nxt;
    onChange(nxt);
    syncHist();
  }

  /** 在光标处插入文本(选中文本时包裹);基于 valueRef.current 取最新值 */
  function insert(before: string, after = "", placeholder = "") {
    const cur = valueRef.current;
    const ta = taRef.current;
    if (!ta) {
      commit(cur + before + placeholder + after, true);
      return;
    }
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = cur.slice(s, e) || placeholder;
    const next = cur.slice(0, s) + before + sel + after + cur.slice(e);
    commit(next, true); // 工具栏插入=离散快照(单独一步可撤销)
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + before.length + sel.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  /** 追加到末尾(批量上传场景,顺序稳定不依赖光标);基于 valueRef 取最新值 */
  function append(text: string) {
    commit(valueRef.current + text, true);
  }

  async function uploadMedia(files: File[], kind: "image" | "video") {
    if (!uploadFile) {
      toast.error("请先「保存草稿」,之后即可上传图片/视频");
      return;
    }
    const picked = files.filter((f) => f.type.startsWith(kind + "/"));
    if (!picked.length) return;
    setUploading(true);
    try {
      for (const f of picked) {
        const { url } = await uploadFile(f);
        if (kind === "image") append(`\n![${f.name.replace(/\.[^.]+$/, "")}](${url})\n`);
        else append(`\n<video src="${url}" controls preload="metadata"></video>\n`);
      }
    } catch {
      toast.error(`${kind === "image" ? "图片" : "视频"}上传失败,请重试`);
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      void uploadMedia(files, "image");
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
        <button
          type="button"
          className={`${toolBtn} disabled:opacity-30`}
          onClick={undo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2Icon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={`${toolBtn} disabled:opacity-30`}
          onClick={redo}
          disabled={!canRedo}
          title="重做 (Ctrl+Y)"
        >
          <Redo2Icon className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-gray-200 mx-0.5" />
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
          onClick={() => insert("\n?> ", "", "提示内容")}
          title="插入提示框(?> 提示 / !> 警告)"
        >
          <LightbulbIcon className="w-3.5 h-3.5" /> 提示框
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
          onClick={() => imgRef.current?.click()}
          disabled={uploading}
          title={uploadFile ? "上传图片(也可直接粘贴截图)" : "先保存草稿后可上传"}
        >
          {uploading ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          图片
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => videoRef.current?.click()}
          disabled={uploading}
          title={uploadFile ? "上传视频(mp4/webm),正文内嵌播放" : "先保存草稿后可上传"}
        >
          <VideoIcon className="w-3.5 h-3.5" /> 视频
        </button>
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadMedia(files, "image");
          }}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadMedia(files, "video");
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
            onChange={(e) => commit(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                undo();
              } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
                e.preventDefault();
                redo();
              }
            }}
            placeholder={"用 Markdown 书写正文…\n\n支持:# 标题、**加粗**、- 列表、表格、图片(直接粘贴截图即可上传)、?> 提示框"}
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
