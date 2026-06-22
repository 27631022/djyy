import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { assessmentApi, type AssessmentTarget } from "../api";
import { PROP_INPUT } from "../scoring/shared";

const FIELD_LABEL: Record<"actual" | "rate", string> = { actual: "实际值", rate: "完成率%" };

/**
 * 报送取数(report.query)叶子配置:选 报送任务 + 目标 + 取值(实际值/完成率),并实时预览各考核对象将取到的值。
 * 写入 node.sourceParams = { reportTaskId, goalKey, field }。取数/换算(党组织→行政)在后端。
 */
export function ReportQueryEditor({
  sourceParams,
  onChange,
  targets,
}: {
  sourceParams: Record<string, unknown> | undefined;
  onChange: (sp: Record<string, unknown>) => void;
  targets: AssessmentTarget[];
}) {
  const sp = (sourceParams ?? {}) as { reportTaskId?: string; goalKey?: string; field?: string };
  const reportTaskId = sp.reportTaskId ?? "";
  const goalKey = sp.goalKey ?? "";
  const field: "actual" | "rate" = sp.field === "rate" ? "rate" : "actual";

  const { data: sources = [] } = useQuery({
    queryKey: ["assess-report-sources"],
    queryFn: () => assessmentApi.reportQuerySources(),
    staleTime: 30_000,
  });
  const task = sources.find((s) => s.taskId === reportTaskId);
  const goals = task?.goals ?? [];

  const previewTargets = useMemo(
    () => targets.map((t) => ({ orgId: t.orgId, userId: t.userId, name: t.name })),
    [targets],
  );
  const canPreview = !!reportTaskId && !!goalKey && previewTargets.length > 0;
  const { data: preview, isFetching } = useQuery({
    queryKey: ["assess-report-preview", reportTaskId, goalKey, field, JSON.stringify(previewTargets)],
    queryFn: () => assessmentApi.reportQueryPreview({ reportTaskId, goalKey, field, targets: previewTargets }),
    enabled: canPreview,
    staleTime: 10_000,
  });

  const set = (patch: Partial<{ reportTaskId: string; goalKey: string; field: string }>) => onChange({ ...sp, ...patch });

  return (
    <div className="rounded-lg border border-[#eef2f7] bg-[#FBFBFC] p-3 space-y-2.5">
      <div className="text-[12px] font-medium text-[#4B5563]">报送取数</div>
      <label className="block">
        <span className="text-[11px] text-[#6B7280]">报送任务</span>
        <select value={reportTaskId} onChange={(e) => set({ reportTaskId: e.target.value, goalKey: "" })} className={PROP_INPUT}>
          <option value="">— 选报送任务 —</option>
          {sources.map((s) => (
            <option key={s.taskId} value={s.taskId}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] text-[#6B7280]">目标</span>
        <select value={goalKey} onChange={(e) => set({ goalKey: e.target.value })} className={PROP_INPUT} disabled={!reportTaskId}>
          <option value="">{reportTaskId ? "— 选目标 —" : "先选任务"}</option>
          {goals.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label || g.key}
              {g.grouped ? "(分组)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="text-[11px] text-[#6B7280]">取值</span>
        <div className="flex gap-2 mt-1">
          {(["actual", "rate"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ field: f })}
              className={`px-3 py-1 rounded-md text-[13px] border ${
                field === f
                  ? "border-[var(--party-primary)] bg-white text-[var(--party-primary)] font-bold"
                  : "border-[#dce4ef] bg-white text-[#475467]"
              }`}
            >
              {FIELD_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[#9CA3AF] mt-1">
          {field === "rate" ? "完成率% → 配 比例/达标 类工具" : "实际值 → 配 排名/标准化 类工具"}
        </div>
      </div>

      {canPreview && (
        <div className="rounded-md border border-[#eef2f7] bg-white p-2">
          <div className="text-[11px] text-[#6B7280] mb-1">各对象将取到的值{isFetching ? "(刷新中…)" : ""}</div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {(preview?.rows ?? []).map((r) => (
              <div key={r.ref} className="flex justify-between gap-2 text-[12px]">
                <span className="text-[#475467] truncate">{r.name}</span>
                <span className={r.value == null ? "text-[#9CA3AF]" : "text-[#172033] font-medium"}>
                  {r.value == null ? "无数据/未关联" : r.value}
                </span>
              </div>
            ))}
            {(preview?.rows ?? []).length === 0 && <div className="text-[12px] text-[#9CA3AF]">先在「考核对象」里选对象</div>}
          </div>
        </div>
      )}
    </div>
  );
}
