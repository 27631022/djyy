import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon, SaveIcon, TargetIcon } from "lucide-react";
import { reportApi, type GoalProgressResult, type GoalProgressItem } from "../api";
import { GoalPerUnitTable } from "./GoalPerUnitTable";
import { GoalTargetPasteBox } from "./GoalTargetPasteBox";

const yuan = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
function errMsg(e: unknown, fb: string): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fb;
}

/** 任务详情里的「目标完成情况」:逐单位×逐目标 + perUnit 目标值录入。无目标则不渲染。 */
export function ReportGoalProgress({ taskId }: { taskId: string }) {
  const q = useQuery({ queryKey: ["report", "goal-progress", taskId], queryFn: () => reportApi.goalProgress(taskId) });
  if (q.isLoading) return <div className="py-4 text-sm text-gray-400">加载目标完成情况…</div>;
  if (!q.data || q.data.goals.length === 0) return null;
  return <Inner key={q.dataUpdatedAt} data={q.data} taskId={taskId} />;
}

function Inner({ data, taskId }: { data: GoalProgressResult; taskId: string }) {
  const qc = useQueryClient();
  const { goals, rows } = data;
  const perUnitGoals = goals.filter((g) => g.kind === "amount" && g.targetMode === "perUnit");
  // 逐单位目标值编辑态(seeded from server;key=dataUpdatedAt 重挂载即重置)
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of rows) m[r.targetId] = { ...r.goalTargets };
    return m;
  });

  const save = useMutation({
    mutationFn: () =>
      reportApi.saveGoalTargets(
        taskId,
        rows.map((r) => ({ targetId: r.targetId, values: edits[r.targetId] ?? {} })),
      ),
    onSuccess: () => {
      toast.success("逐单位目标值已保存");
      qc.invalidateQueries({ queryKey: ["report", "goal-progress", taskId] });
    },
    onError: (e) => toast.error(errMsg(e, "保存失败")),
  });

  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-gray-800">
        <TargetIcon className="h-4 w-4 text-[var(--party-primary)]" />
        目标完成情况
      </h2>

      {/* 逐单位目标值录入(仅当有 perUnit 金额目标) */}
      {perUnitGoals.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-amber-800">逐单位目标值录入</span>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--party-primary)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {save.isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <SaveIcon className="h-3.5 w-3.5" />}
              保存目标值
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <GoalPerUnitTable
                goals={perUnitGoals}
                units={rows.map((r) => ({ id: r.targetId, name: r.targetOrgName ?? r.ownerUserName ?? "(对象)" }))}
                value={edits}
                onChange={setEdits}
              />
            </div>
            <GoalTargetPasteBox
              goals={perUnitGoals}
              units={rows.map((r) => ({ id: r.targetId, name: r.targetOrgName ?? r.ownerUserName ?? "(对象)" }))}
              onApply={(patch) =>
                setEdits((prev) => {
                  const next = { ...prev };
                  for (const [uid, vals] of Object.entries(patch)) next[uid] = { ...(next[uid] ?? {}), ...vals };
                  return next;
                })
              }
            />
          </div>
        </div>
      )}

      {/* 完成情况矩阵 */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">单位</th>
              {goals.map((g) => (
                <th key={g.key} className="px-3 py-2 font-medium">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.targetId}>
                <td className="px-3 py-2 text-gray-800">
                  {r.targetOrgName ?? r.ownerUserName ?? "(对象)"}
                  {r.submissionCount === 0 && <span className="ml-1 text-[11px] text-gray-400">未录</span>}
                </td>
                {r.progress.map((p) => (
                  <td key={p.key} className="px-3 py-2">
                    <GoalCell p={p} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={goals.length + 1} className="px-3 py-6 text-center text-sm text-gray-400">
                  无派发对象
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GoalCell({ p }: { p: GoalProgressItem }) {
  if (p.kind === "presence") {
    return p.met ? (
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">✓ 有</span>
    ) : (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">✗ 无</span>
    );
  }
  // amount
  const hasTarget = p.target != null && p.target > 0;
  return (
    <div className="space-y-0.5">
      <div className="text-gray-700">
        ¥{yuan(p.actualAmount ?? 0)}
        {hasTarget && <span className="text-gray-400"> / ¥{yuan(p.target as number)}</span>}
      </div>
      {hasTarget ? (
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
            p.met ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {p.rate}% {p.met ? "达标" : "未达"}
        </span>
      ) : (
        <span className="text-[11px] text-gray-400">未设目标</span>
      )}
    </div>
  );
}
