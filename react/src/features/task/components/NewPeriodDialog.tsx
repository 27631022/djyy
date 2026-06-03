import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { XIcon, CalendarPlusIcon, Loader2Icon, InfoIcon } from "lucide-react";
import { taskApi, taskApiErrorMessage } from "../api";

/** 当月默认期次标签,如「2026年6月」 */
function defaultPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
}

/**
 * 发起新一期(周期报表):填期次标签 + 可选新截止日期 →
 * 克隆任务为新一期(上期值预填、同责任人接力)→ 跳到新一期详情。
 */
export function NewPeriodDialog({
  taskId,
  taskTitle,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel());
  const [dueAt, setDueAt] = useState("");

  const create = useMutation({
    mutationFn: () =>
      taskApi.startNewPeriod(taskId, {
        periodLabel: periodLabel.trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: (newTask) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success(`已发起新一期${newTask.periodLabel ? `「${newTask.periodLabel}」` : ""}`);
      onClose();
      navigate(`/admin/tasks/${newTask.id}`);
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "发起新一期失败"), { duration: 8000 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E9E9E9]">
          <CalendarPlusIcon className="w-5 h-5 text-[var(--party-primary)]" />
          <div className="text-[15px] font-bold text-[#1A1A1A] flex-1">发起新一期</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          <div className="text-[12px] text-[#6B7280] truncate">
            基于:<span className="text-[#1A1A1A] font-medium">{taskTitle}</span>
          </div>

          <label className="block">
            <div className="text-[12px] font-medium text-[#4B5563] mb-1">期次标签</div>
            <input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="如:2026年6月 / 2026年第二季度"
              className="w-full text-[14px] rounded-md border border-[#dce4ef] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-party-primary-20"
            />
          </label>

          <label className="block">
            <div className="text-[12px] font-medium text-[#4B5563] mb-1">
              报送截止 <span className="text-[#9CA3AF] font-normal">(可空 = 不限)</span>
            </div>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full text-[14px] rounded-md border border-[#dce4ef] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-party-primary-20"
            />
          </label>

          <div className="flex items-start gap-1.5 text-[12px] text-[#475467] bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
            <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#1A6BC8]" />
            <span>
              将克隆同一批派发对象,<b>上期已提交的内容自动预填为本期草稿</b>,原责任人无需重新认领即可在「我的待办」更新;上期记录原样留存。
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E9E9E9]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
          >
            取消
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {create.isPending ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarPlusIcon className="w-4 h-4" />
            )}
            发起新一期
          </button>
        </div>
      </div>
    </div>
  );
}
