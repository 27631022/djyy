import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileTextIcon, Loader2, Upload } from "lucide-react";
import { docFormatApi, type AnalyzeResult } from "../api";
import { WB_CARD } from "./DocFormatShell";

/** 支持的输入。md 是「草稿转公文」,doc/docx 是「重排已定稿的公文」—— 两条管线判据不同,见后端 README */
const ACCEPT = ".doc,.docx,.md";
const ACCEPT_RE = /\.(doc|docx|md)$/i;

export function UploadPanel({ onDone }: { onDone: (r: AnalyzeResult) => void }) {
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyze = useMutation({
    mutationFn: docFormatApi.analyze,
    onSuccess: onDone,
    onError: (e: unknown) =>
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "解析失败,请确认是 Word 公文或 Markdown",
      ),
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!ACCEPT_RE.test(f.name)) {
      setErr("只支持 .doc / .docx / .md");
      return;
    }
    analyze.mutate(f);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition ${
          dragging
            ? "border-[var(--party-primary)] bg-white/70"
            : "border-white/70 bg-white/45 backdrop-blur-xl hover:border-[var(--party-primary)]/50"
        }`}
      >
        {analyze.isPending ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--party-primary)]" />
            <p className="text-[#667085]">正在解析结构…</p>
          </>
        ) : (
          <>
            <Upload className="mx-auto mb-4 h-10 w-10 text-[#9CA3AF]" />
            <p className="text-lg text-[#172033]">把文件拖进来,或点击选择</p>
            <p className="mt-2 text-sm text-[#9CA3AF]">支持 Word(.doc / .docx)和 Markdown(.md)</p>
          </>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      {err && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}

      <div className={`mt-6 ${WB_CARD} p-5 text-sm text-[#667085]`}>
        <p className="mb-2 flex items-center gap-1.5 font-medium text-[#172033]">
          <FileTextIcon className="h-4 w-4 text-[var(--party-primary)]" />
          说明
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <b className="text-[#172033]">Word 公文</b>:只换版式,正文一个字都不改(直引号会规范成弯引号)。
          </li>
          <li>
            <b className="text-[#172033]">Markdown</b>:按 <code>#</code> 的层级转成公文 ——
            <code>##</code> 自动补「一、」、<code>###</code> 补「（一）」,自带序号的不重复加。
          </li>
          <li>只排正文。版头(红头)与版记(抄送/印发)不在范围,请在 OA 里套红或用现成模板。</li>
          <li>
            孤行/寡行由 Word 自己避;「孤字」会给出<b className="text-[#172033]">疑似</b>提示并在预览里标黄。
          </li>
        </ul>
      </div>
    </div>
  );
}
