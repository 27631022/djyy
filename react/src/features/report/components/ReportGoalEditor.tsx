import { PlusIcon, Trash2Icon, TargetIcon } from "lucide-react";
import {
  type ReportGoal,
  type GoalKind,
  type GoalDim,
  type ReportField,
  GOAL_KIND_LABEL,
} from "../api";

/** 生成下一个未占用的 goal_N。 */
function nextKey(goals: ReportGoal[]): string {
  const used = new Set(goals.map((g) => g.key));
  let n = goals.length + 1;
  while (used.has(`goal_${n}`)) n++;
  return `goal_${n}`;
}

/** 一句话描述目标口径(给用户即时反馈)。 */
function describe(g: ReportGoal): string {
  const scope =
    g.dim === "all"
      ? "全部明细"
      : g.dim === "feeSource"
        ? `费用来源 = ${g.dimValue || "?"}`
        : g.dim === "category"
          ? `分部分 = ${g.dimValue || "?"}`
          : `字段「${g.dimValue || "?"}」`;
  if (g.kind === "amount") {
    const t =
      g.targetMode === "perUnit" ? "逐单位目标值(发布后在详情录入)" : `目标 ≥ ${g.target ?? 0} 元`;
    return `${scope} 的价税合计金额,${t}`;
  }
  return g.dim === "field" ? `${scope} 有内容即达标` : `${scope} 有任意一条即达标`;
}

const selCls =
  "rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[var(--party-primary)] focus:outline-none";

/**
 * 报送目标编辑器(通用,可多个)。受控 value/onChange。
 * 覆盖:总额/分项/分部分金额目标(统一或逐单位)+ 某部分/某字段是否有内容。
 */
export function ReportGoalEditor({
  value,
  onChange,
  fields,
}: {
  value: ReportGoal[];
  onChange: (goals: ReportGoal[]) => void;
  fields: ReportField[];
}) {
  const feeOptions = fields.find((f) => f.role === "feeSource")?.options ?? [];
  const headFields = fields.filter((f) => f.type !== "detail_table");

  const patch = (i: number, p: Partial<ReportGoal>) =>
    onChange(value.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const add = () =>
    onChange([
      ...value,
      { key: nextKey(value), label: "", kind: "amount", dim: "all", targetMode: "uniform", target: 0 },
    ]);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  const setKind = (i: number, kind: GoalKind) => {
    const g = value[i];
    const dim: GoalDim = kind === "amount" && g.dim === "field" ? "all" : g.dim;
    patch(i, {
      kind,
      dim,
      ...(kind === "amount"
        ? { targetMode: g.targetMode ?? "uniform", target: g.target ?? 0 }
        : { targetMode: undefined, target: undefined }),
    });
  };
  const setDim = (i: number, dim: GoalDim) =>
    patch(i, { dim, dimValue: dim === "all" ? undefined : (value[i].dimValue ?? "") });

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-400">
          还没有目标。点下方「添加目标」—— 可设总额 / 分项(费用来源)/ 分部分(第一部分…)金额目标,或「某部分 / 某字段是否有内容」检查。可加多个。
        </div>
      )}

      {value.map((g, i) => (
        <div key={g.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <TargetIcon className="h-4 w-4 flex-shrink-0 text-[var(--party-primary)]" />
            <input
              value={g.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="目标名称(如:福利费采购目标 / 第一部分采购额)"
              className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[var(--party-primary)] focus:outline-none"
            />
            <button
              onClick={() => remove(i)}
              title="删除目标"
              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2Icon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {/* 类型 */}
            <label className="inline-flex items-center gap-1.5 text-gray-500">
              类型
              <select value={g.kind} onChange={(e) => setKind(i, e.target.value as GoalKind)} className={selCls}>
                {(["amount", "presence"] as GoalKind[]).map((k) => (
                  <option key={k} value={k}>
                    {GOAL_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>

            {/* 范围 */}
            <label className="inline-flex items-center gap-1.5 text-gray-500">
              范围
              <select value={g.dim} onChange={(e) => setDim(i, e.target.value as GoalDim)} className={selCls}>
                <option value="all">全部明细</option>
                <option value="feeSource">按费用来源</option>
                <option value="category">按分部分</option>
                {g.kind === "presence" && <option value="field">按字段</option>}
              </select>
            </label>

            {/* 范围取值 */}
            {g.dim === "feeSource" &&
              (feeOptions.length > 0 ? (
                <select
                  value={g.dimValue ?? ""}
                  onChange={(e) => patch(i, { dimValue: e.target.value })}
                  className={selCls}
                >
                  <option value="">选费用来源…</option>
                  {feeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={g.dimValue ?? ""}
                  onChange={(e) => patch(i, { dimValue: e.target.value })}
                  placeholder="如 福利费"
                  className={`${selCls} w-32`}
                />
              ))}
            {g.dim === "category" && (
              <input
                value={g.dimValue ?? ""}
                onChange={(e) => patch(i, { dimValue: e.target.value })}
                placeholder="如 第一部分"
                className={`${selCls} w-32`}
              />
            )}
            {g.dim === "field" && (
              <select
                value={g.dimValue ?? ""}
                onChange={(e) => patch(i, { dimValue: e.target.value })}
                className={selCls}
              >
                <option value="">选字段…</option>
                {headFields.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}

            {/* 金额目标值 */}
            {g.kind === "amount" && (
              <>
                <label className="inline-flex items-center gap-1.5 text-gray-500">
                  目标值
                  <select
                    value={g.targetMode ?? "uniform"}
                    onChange={(e) => patch(i, { targetMode: e.target.value as "uniform" | "perUnit" })}
                    className={selCls}
                  >
                    <option value="uniform">全单位统一</option>
                    <option value="perUnit">逐单位不同</option>
                  </select>
                </label>
                {g.targetMode === "perUnit" ? (
                  <span className="text-xs text-gray-400">发布后在任务详情逐单位录入</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    value={g.target ?? 0}
                    onChange={(e) => patch(i, { target: Number(e.target.value) })}
                    placeholder="目标金额(元)"
                    className={`${selCls} w-32`}
                  />
                )}
              </>
            )}
          </div>

          <p className="mt-2 text-xs text-gray-400">口径:{describe(g)}</p>
        </div>
      ))}

      <button
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--party-primary)] bg-party-soft px-3 py-1.5 text-sm text-[var(--party-primary)]"
      >
        <PlusIcon className="h-4 w-4" />
        添加目标
      </button>
    </div>
  );
}
