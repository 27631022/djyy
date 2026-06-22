import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon, SaveIcon, Loader2Icon, TargetIcon } from "lucide-react";
import { reportApi, type ReportGoal, type ReportField } from "../api";
import { ReportGoalEditor } from "./ReportGoalEditor";

function errMsg(e: unknown, fb: string): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fb;
}

/**
 * 详情页「目标设定(可调整)」—— 发布后也能改目标定义,保存即重算完成情况。
 * 编辑态 useState 初始化器读 props(key 重挂载即重置);per-unit 目标值在下方 ReportGoalProgress 录入。
 */
export function ReportGoalEdit({
  taskId,
  fields,
  catalogTag,
  goals,
}: {
  taskId: string;
  fields: ReportField[];
  catalogTag?: string;
  goals: ReportGoal[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(goals.length === 0);
  const [draft, setDraft] = useState<ReportGoal[]>(goals);

  const save = useMutation({
    mutationFn: () => reportApi.updateTask(taskId, { goals: draft }),
    onSuccess: () => {
      toast.success("目标已保存,完成情况已重算");
      qc.invalidateQueries({ queryKey: ["report", "task", taskId] });
      qc.invalidateQueries({ queryKey: ["report", "goal-progress", taskId] });
    },
    onError: (e) => toast.error(errMsg(e, "保存失败")),
  });

  return (
    <section className="mb-5 rounded-xl border border-gray-100 bg-white shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDownIcon className="h-4 w-4 text-gray-400" /> : <ChevronRightIcon className="h-4 w-4 text-gray-400" />}
        <TargetIcon className="h-4 w-4 text-[var(--party-primary)]" />
        <span className="text-base font-semibold text-gray-800">目标设定</span>
        <span className="text-xs text-gray-400">{goals.length} 个 · 可调整</span>
      </button>
      {open && (
        <div className="border-t border-gray-50 p-4">
          <ReportGoalEditor value={draft} onChange={setDraft} fields={fields} catalogTag={catalogTag} />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--party-primary)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {save.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
              保存目标
            </button>
            <span className="text-xs text-gray-400">改完保存即重算完成情况;逐单位目标值在下方录入。</span>
          </div>
        </div>
      )}
    </section>
  );
}
