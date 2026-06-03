/**
 * 新建任务 · 第一步 —— AI 上传识别 + 基本信息。
 *
 * 上传通知 / 红头文件(Word/PDF)→ AI 自动识别「任务名称 / 填报要求 / 报送截止日期」预填,
 * 并按填报要求初步生成填报字段 + 建议填报范围(上抛父组件,供第二/三步使用);
 * 同一份文件同时存为「通知文件」随任务下发。也可不传文件,直接手动填。
 *
 * 受控:字段值与 noticeFile 由父组件(TaskCreate)持有。
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  UploadIcon,
  XIcon,
  Building2Icon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import { taskApi, taskApiErrorMessage, type TaskExtractResponse } from "../api";

/** 机关部门候选(公司机关虚拟机构下的部门);确保当前选中值始终在列表里。 */
function buildDeptOptions(
  tree: OrgTreeNode[],
  currentId: string,
  currentName?: string,
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (n: OrgTreeNode) => {
    if (n.isVirtual && /机关/.test(n.name)) {
      n.children.filter((c) => !c.isVirtual).forEach((c) => out.push({ id: c.id, name: c.name }));
    }
    n.children.forEach(walk);
  };
  tree.forEach(walk);
  if (currentId && !out.some((o) => o.id === currentId)) {
    out.unshift({ id: currentId, name: currentName || "(当前部门)" });
  }
  return out;
}

const inputCls =
  "w-full px-3.5 py-2.5 text-[14px] text-[#172033] border border-[#dce4ef] rounded-lg bg-white focus:outline-none focus:border-[var(--party-primary)] focus:ring-2 focus:ring-party-primary-10 placeholder:text-[#9CA3AF]";

export function TaskStep1Upload({
  title,
  setTitle,
  requirements,
  setRequirements,
  dueAt,
  setDueAt,
  noticeFileName,
  setNoticeFile,
  clearNoticeFile,
  dispatchOrgId,
  setDispatchOrgId,
  defaultOrgName,
  onExtracted,
}: {
  title: string;
  setTitle: (v: string) => void;
  requirements: string;
  setRequirements: (v: string) => void;
  dueAt: string;
  setDueAt: (v: string) => void;
  noticeFileName: string | null;
  setNoticeFile: (id: string, name: string) => void;
  clearNoticeFile: () => void;
  /** 派发部门(机关部门)—— 可改选,接收单位按此匹配对口责任部门 */
  dispatchOrgId: string;
  setDispatchOrgId: (id: string) => void;
  defaultOrgName?: string;
  /** AI 识别完成 → 父组件据此载入建议字段(第二步)+ 建议范围(第三步) */
  onExtracted: (r: TaskExtractResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [source, setSource] = useState<TaskExtractResponse["source"] | null>(null);
  const busy = aiBusy || fileBusy;
  const treeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
  });
  const deptOptions = buildDeptOptions(treeQuery.data ?? [], dispatchOrgId, defaultOrgName);

  async function handleFile(f: File) {
    if (!/\.(docx|pdf)$/i.test(f.name)) {
      toast.error("仅支持 .docx 或 .pdf 文件");
      return;
    }
    // 1. AI 识别(慢)→ 预填表单 + 上抛建议字段/范围
    setAiBusy(true);
    let extracted: TaskExtractResponse | null = null;
    try {
      extracted = await taskApi.extract(f);
      if (extracted.title) setTitle(extracted.title);
      if (extracted.requirements) setRequirements(extracted.requirements);
      if (extracted.dueDate) setDueAt(`${extracted.dueDate}T18:00`);
      setSource(extracted.source);
      onExtracted(extracted);
      const fc = extracted.fields.length;
      toast.success(
        `AI 识别完成:${extracted.title || "(未取到任务名)"}${fc ? ` · 生成 ${fc} 个填报字段` : ""}`,
      );
    } catch (e: unknown) {
      toast.error(taskApiErrorMessage(e, "AI 识别失败,可在下方手动填写"), { duration: 8000 });
    } finally {
      setAiBusy(false);
    }
    // 2. 同一份文件存为通知文件(快)→ 随任务下发
    setFileBusy(true);
    try {
      const meta = await storageApi.upload(f, {
        ownerModule: "task",
        folder: extracted?.title || title || "通知文件",
      });
      setNoticeFile(meta.id, meta.originalName);
    } catch {
      toast.warning("通知文件保存失败,可重新上传");
    } finally {
      setFileBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-5">
      {/* AI 上传面板 */}
      {noticeFileName ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(28,42,68,0.05)]">
          <div className="w-10 h-10 rounded-lg grid place-items-center bg-party-soft flex-shrink-0">
            {busy ? (
              <Loader2Icon className="w-5 h-5 animate-spin text-[var(--party-primary)]" />
            ) : (
              <FileTextIcon className="w-5 h-5 text-[var(--party-primary)]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-[#172033] truncate">{noticeFileName}</div>
            <div className="text-[12px] text-[#667085] truncate">
              {busy
                ? aiBusy
                  ? "AI 识别中…"
                  : "保存通知文件中…"
                : source
                  ? `已作为通知文件 · 由 ${source.usedProvider ?? "AI"}(${source.usedModel ?? ""})识别`
                  : "已作为通知文件随任务下发"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[13px] border border-[#dce4ef] bg-white hover:border-[var(--party-primary)] text-[#344054] disabled:opacity-50"
          >
            重新上传
          </button>
          <button
            type="button"
            onClick={() => {
              clearNoticeFile();
              setSource(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            disabled={busy}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="移除通知文件"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !busy && inputRef.current?.click()}
          disabled={busy}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`w-full text-left rounded-xl border-2 p-6 transition-all flex items-center gap-5 disabled:cursor-not-allowed ${
            dragOver
              ? "border-purple-400 bg-purple-50 ring-2 ring-purple-200"
              : "border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 hover:border-purple-400 hover:shadow-md"
          }`}
        >
          <div className="w-14 h-14 rounded-xl bg-white/85 grid place-items-center flex-shrink-0">
            {busy ? (
              <Loader2Icon className="w-7 h-7 animate-spin text-purple-600" />
            ) : (
              <SparklesIcon className="w-7 h-7 text-purple-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-[#172033] mb-1">
              {busy ? "AI 识别中,请稍候…" : dragOver ? "松开鼠标即可上传" : "上传通知文件,AI 自动识别"}
            </div>
            <div className="text-[12px] text-[#667085] leading-relaxed">
              支持 .docx / .pdf · AI 自动抽取「任务名称 / 填报要求 / 截止日期」,并按要求生成填报字段、建议填报范围
              <span className="text-[#9CA3AF]"> ·  也可跳过、直接手动填写</span>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/80 text-[13px] font-bold text-purple-700 flex-shrink-0">
            <UploadIcon className="w-4 h-4" />
            选择文件
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {/* 基本信息表单(AI 预填,可编辑) */}
      <div className="space-y-4">
        <Field label="任务名称" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如 报送2024年度学习教育开展情况"
            className={inputCls}
          />
        </Field>
        <Field label="填报要求" hint="要报什么 / 口径 / 格式 / 时间节点 —— 下一步会据此生成填报字段">
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            rows={5}
            placeholder={"如:\n· 上传学习教育开展情况通知扫描件\n· 填写参学党员数、专题党课次数\n· 报送一张活动现场照片"}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="报送截止日期" required hint="填报人需在此前提交">
            <input
              type="datetime-local"
              value={dueAt}
              min="2024-01-01T00:00"
              max="2099-12-31T23:59"
              onChange={(e) => setDueAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="派发部门" hint="机关部门 —— 接收单位按此匹配对口责任部门">
            <div className="relative">
              <Building2Icon className="w-4 h-4 text-[#246BFE] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={dispatchOrgId}
                onChange={(e) => setDispatchOrgId(e.target.value)}
                className={`${inputCls} pl-9 appearance-none cursor-pointer`}
              >
                {deptOptions.length === 0 && <option value="">(无可选机关部门)</option>}
                {deptOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[13px] font-bold text-[#344054]">
          {label}
          {required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[11px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
