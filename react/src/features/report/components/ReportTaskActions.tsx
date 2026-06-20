import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon, Loader2Icon, AlertTriangleIcon } from "lucide-react";
import { reportApi } from "../api";

function errMsg(e: unknown, fb: string): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fb;
}
/** ISO → datetime-local 本地值(yyyy-MM-ddTHH:mm) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TaskLite {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
}

/** 报送任务的「编辑 / 删除」按钮 + 弹窗。compact=列表行(图标);否则=详情头(带文字)。 */
export function ReportTaskActions({
  task,
  compact = false,
  onDeleted,
}: {
  task: TaskLite;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const del = useMutation({
    mutationFn: () => reportApi.deleteTask(task.id),
    onSuccess: (r) => {
      toast.success(
        `已删除报送任务${r.deletedSubmissions ? `,清理 ${r.deletedSubmissions} 张发票` : ""}${
          r.deletedFiles ? ` + ${r.deletedFiles} 个附件` : ""
        }`,
      );
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["report", "tasks"] });
      onDeleted?.();
    },
    onError: (e) => toast.error(errMsg(e, "删除失败")),
  });

  const iconBtn = "rounded-md p-1.5 text-gray-400 hover:bg-gray-100";
  const textBtn = "inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50";

  return (
    <>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setEditing(true)} title="编辑" className={compact ? iconBtn : textBtn}>
          <PencilIcon className="h-4 w-4" />
          {!compact && "编辑"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="删除"
          className={
            compact
              ? "rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              : "inline-flex items-center gap-1 rounded-lg border border-[#FCA5A5] px-3 py-1.5 text-sm text-[#DC2626] hover:bg-red-50"
          }
        >
          <Trash2Icon className="h-4 w-4" />
          {!compact && "删除"}
        </button>
      </div>

      {editing && <EditDialog task={task} onClose={() => setEditing(false)} />}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-[#DC2626]">
              <AlertTriangleIcon className="h-5 w-5" />
              删除报送任务
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              确认删除「<span className="font-medium">{task.title}</span>」?
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              将<b className="text-[#DC2626]">一并彻底清除</b>该报送下所有派发对象、已录发票、采买明细及上传的发票/合同/通知附件,<b>不可恢复</b>。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={() => del.mutate()}
                disabled={del.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {del.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Trash2Icon className="h-4 w-4" />}
                确认删除并清理
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditDialog({ task, onClose }: { task: TaskLite; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt));

  const save = useMutation({
    mutationFn: () => reportApi.updateTask(task.id, { title: title.trim(), notes, dueAt }),
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["report", "tasks"] });
      qc.invalidateQueries({ queryKey: ["report", "task", task.id] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, "保存失败")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-800">编辑报送任务</h3>
        <p className="mt-0.5 text-xs text-gray-400">填报字段结构在发布后不在此修改(避免与已录数据冲突)。</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <div className="mb-1.5 text-sm font-medium text-gray-700">任务名称</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none" />
          </label>
          <label className="block">
            <div className="mb-1.5 text-sm font-medium text-gray-700">填报要求</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none" />
          </label>
          <label className="block">
            <div className="mb-1.5 text-sm font-medium text-gray-700">报送截止时间</div>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {save.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
