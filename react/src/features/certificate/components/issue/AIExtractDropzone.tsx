import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  SparklesIcon,
  FileTextIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateIssueApi,
  type ExtractHonorResponse,
} from "../../api";

interface AIExtractDropzoneProps {
  /** 提取成功后回调,父组件拿来预填表单 */
  onExtracted: (result: ExtractHonorResponse) => void;
}

/**
 * AI 表彰文件提取上传区。
 *
 * 拖拽或选择 .docx / .pdf → 后端 mammoth/pdf-parse 解析 → DeepSeek 抽取 →
 * 返回 { honorName, yearLabel, recipients[] } → 用户点「应用到表单」预填。
 *
 * 提取后用户可以编辑结果,确认无误后应用,再点「发证」走标准流程。
 */
export function AIExtractDropzone({ onExtracted }: AIExtractDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ExtractHonorResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractHonorResponse | null>(null);

  const extractMut = useMutation({
    mutationFn: (file: File) => certificateIssueApi.extract(file),
    onSuccess: (data) => {
      setResult(data);
      setDraft(structuredClone(data));
      setEditing(false);
      toast.success(`提取完成:${data.recipients.length} 位收件人`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "提取失败"),
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    extractMut.mutate(f);
  }

  function handleApply() {
    if (!draft) return;
    onExtracted(draft);
    toast.success("已应用到表单");
    setResult(null);
    setDraft(null);
    setEditing(false);
  }

  function handleDismiss() {
    setResult(null);
    setDraft(null);
    setEditing(false);
  }

  return (
    <section className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <SparklesIcon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">AI 助手 · 一键提取表彰文件</h3>
        <span className="ml-auto text-[10px] text-[#9CA3AF]">支持 .docx / .pdf · 最大 10MB</span>
      </div>

      {!result ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            dragOver
              ? "border-purple-500 bg-white"
              : "border-purple-300 bg-white/60 hover:bg-white"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
            {extractMut.isPending ? (
              <>
                <Loader2Icon className="w-7 h-7 text-purple-500 animate-spin mb-2" />
                <p className="text-sm text-[#6B7280]">AI 解析中,通常 10-30 秒…</p>
              </>
            ) : (
              <>
                <FileTextIcon className="w-7 h-7 text-purple-400 mb-2" />
                <p className="text-sm text-[#1A1A1A] font-medium">
                  拖拽表彰文件到这里,或点击选择
                </p>
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  AI 自动识别荣誉名称、年份、受表彰人员名单
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <ResultCard
          result={draft ?? result}
          editing={editing}
          onEditToggle={() => setEditing((v) => !v)}
          onChange={setDraft}
          onApply={handleApply}
          onDismiss={handleDismiss}
        />
      )}
    </section>
  );
}

/* ─── 提取结果展示 + 可编辑 ─── */

function ResultCard({
  result,
  editing,
  onEditToggle,
  onChange,
  onApply,
  onDismiss,
}: {
  result: ExtractHonorResponse;
  editing: boolean;
  onEditToggle: () => void;
  onChange: (r: ExtractHonorResponse) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  function patch(p: Partial<ExtractHonorResponse>) {
    onChange({ ...result, ...p });
  }
  function patchRecipient(idx: number, p: Partial<{ name: string; empNo?: string; dept?: string }>) {
    const next = [...result.recipients];
    next[idx] = { ...next[idx], ...p };
    onChange({ ...result, recipients: next });
  }
  function removeRecipient(idx: number) {
    const next = result.recipients.filter((_, i) => i !== idx);
    onChange({ ...result, recipients: next });
  }
  function addRecipient() {
    onChange({
      ...result,
      recipients: [...result.recipients, { name: "" }],
    });
  }

  return (
    <div className="bg-white rounded-lg border border-purple-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckIcon className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium text-[#1A1A1A]">提取完成</span>
        <span className="text-[10px] text-[#9CA3AF] ml-2">
          源:{result.source.fileName} ·{" "}
          {result.source.textLength} 字
          {result.source.completionTokens
            ? ` · ${result.source.promptTokens ?? "?"}+${result.source.completionTokens} tokens`
            : ""}
        </span>
        <button
          type="button"
          onClick={onEditToggle}
          className="ml-auto text-[11px] text-[var(--party-primary)] hover:underline"
        >
          {editing ? "完成编辑" : "编辑"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded text-[#9CA3AF] hover:text-red-600"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field
          label="荣誉名称"
          value={result.honorName}
          editing={editing}
          onChange={(v) => patch({ honorName: v })}
        />
        <Field
          label="年份段"
          value={result.yearLabel}
          editing={editing}
          onChange={(v) => patch({ yearLabel: v })}
          mono
        />
      </div>

      {/* 收件人列表 */}
      <div className="text-[11px] font-medium text-[#6B7280] mb-1 flex items-center justify-between">
        <span>受表彰人员({result.recipients.length} 位)</span>
        {editing && (
          <button
            type="button"
            onClick={addRecipient}
            className="text-[var(--party-primary)] hover:underline"
          >
            + 加一行
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-auto rounded border border-[#E9E9E9] bg-white">
        {result.recipients.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#9CA3AF] text-center flex items-center justify-center gap-1">
            <AlertCircleIcon className="w-3.5 h-3.5" />
            未提取到收件人,请人工补填或重新上传
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#F7F8FA]">
              <tr className="text-[10px] text-[#6B7280]">
                <th className="text-left px-2 py-1 w-10">#</th>
                <th className="text-left px-2 py-1">姓名</th>
                <th className="text-left px-2 py-1">员工编号</th>
                <th className="text-left px-2 py-1">部门</th>
                {editing && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {result.recipients.map((r, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-1 text-[#9CA3AF] font-mono">{idx + 1}</td>
                  <td className="px-2 py-1">
                    {editing ? (
                      <CompactInput
                        value={r.name}
                        onChange={(v) => patchRecipient(idx, { name: v })}
                      />
                    ) : (
                      r.name || <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono">
                    {editing ? (
                      <CompactInput
                        value={r.empNo ?? ""}
                        onChange={(v) => patchRecipient(idx, { empNo: v || undefined })}
                      />
                    ) : (
                      r.empNo || <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {editing ? (
                      <CompactInput
                        value={r.dept ?? ""}
                        onChange={(v) => patchRecipient(idx, { dept: v || undefined })}
                      />
                    ) : (
                      r.dept || <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  {editing && (
                    <td className="px-1">
                      <button
                        type="button"
                        onClick={() => removeRecipient(idx)}
                        className="text-[#9CA3AF] hover:text-red-600"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1.5 rounded text-xs border border-[#E9E9E9] hover:bg-[#F7F8FA]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={result.recipients.length === 0}
          className="px-3 py-1.5 rounded text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 disabled:opacity-50"
        >
          应用到表单 →
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">{label}</span>
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none ${
            mono ? "font-mono" : ""
          }`}
        />
      ) : (
        <div className={`px-2 py-1.5 text-xs ${mono ? "font-mono" : ""}`}>
          {value || <span className="text-[#9CA3AF]">未提取到</span>}
        </div>
      )}
    </label>
  );
}

function CompactInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-1.5 py-0.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
    />
  );
}
