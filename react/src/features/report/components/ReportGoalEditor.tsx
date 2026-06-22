import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon, TargetIcon, XIcon } from "lucide-react";
import {
  reportApi,
  deriveGoalColumns,
  GOAL_AGG_LABEL,
  GOAL_GRAIN_LABEL,
  type ReportGoal,
  type GoalCondition,
  type GoalColumn,
  type GoalAgg,
  type GoalGrain,
  type GoalBool,
  type ReportField,
} from "../api";

function nextKey(goals: ReportGoal[]): string {
  const used = new Set(goals.map((g) => g.key));
  let n = goals.length + 1;
  while (used.has(`goal_${n}`)) n++;
  return `goal_${n}`;
}

const selCls =
  "rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-[var(--party-primary)] focus:outline-none";

/** 取值编辑:精确列(有选项)下拉加值,文本/无选项用输入框(回车=加一项)。 */
function ValueEditor({
  match,
  label,
  options,
  values,
  onChange,
}: {
  match: "exact" | "text";
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
  };
  const remaining = options.filter((o) => !values.includes(o));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-0.5 rounded bg-party-soft px-1.5 py-0.5 text-xs text-[var(--party-primary)]">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} className="hover:text-red-600">
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      {match === "exact" && options.length > 0 ? (
        <select value="" onChange={(e) => e.target.value && add(e.target.value)} className={`${selCls} text-xs`}>
          <option value="">＋ 选{label}…</option>
          {remaining.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
              setText("");
            }
          }}
          placeholder={match === "exact" ? `输入${label},回车` : `含…回车`}
          className={`${selCls} w-28 text-xs`}
        />
      )}
    </div>
  );
}

function ConditionRow({
  cond,
  dimCols,
  optionsFor,
  onChange,
  onRemove,
}: {
  cond: GoalCondition;
  dimCols: GoalColumn[];
  optionsFor: (key: string) => string[];
  onChange: (c: GoalCondition) => void;
  onRemove: () => void;
}) {
  const def = dimCols.find((c) => c.key === cond.col) ?? dimCols[0];
  return (
    <div className="flex items-start gap-2">
      <select value={cond.col} onChange={(e) => onChange({ col: e.target.value, values: [] })} className={`${selCls} flex-shrink-0`}>
        {dimCols.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1 pt-0.5">
        <ValueEditor match={def?.match ?? "text"} label={def?.label ?? "值"} options={optionsFor(cond.col)} values={cond.values} onChange={(vs) => onChange({ ...cond, values: vs })} />
      </div>
      <button onClick={onRemove} title="删除条件" className="flex-shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600">
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 且/或 小开关。 */
function BoolToggle({ value, onChange, title }: { value: GoalBool; onChange: (v: GoalBool) => void; title?: string }) {
  return (
    <button
      onClick={() => onChange(value === "and" ? "or" : "and")}
      title={title ?? "切换 且/或"}
      className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
    >
      {value === "and" ? "且" : "或"}
    </button>
  );
}

/**
 * 报送目标编辑器(通用「报送明细查询工具」)。三栏:左筛选(单层分组)→ 中统计 → 右目标。
 * 受控 value/onChange(接受函数式更新器)。列由 deriveGoalColumns(任务字段)派生 —— 换报送类型零改。
 */
export function ReportGoalEditor({
  value,
  onChange,
  fields,
  catalogTag,
}: {
  value: ReportGoal[];
  onChange: (goals: ReportGoal[] | ((prev: ReportGoal[]) => ReportGoal[])) => void;
  fields: ReportField[];
  catalogTag?: string;
}) {
  const columns = useMemo(() => deriveGoalColumns(fields), [fields]);
  const dimCols = columns.filter((c) => c.role === "dim");
  const metricCols = columns.filter((c) => c.role === "metric");
  const dateCols = columns.filter((c) => c.role === "date");
  const groupByCols = [...dateCols, ...dimCols]; // 可作分组依据
  const dataCols = [...metricCols, ...dimCols]; // 可统计列(metric→求和/平均/计数;dim→计数)
  const col = (key?: string) => columns.find((c) => c.key === key);
  const defaultMetricKey = (metricCols.find((m) => m.source === "amount") ?? metricCols[0])?.key;

  const catQ = useQuery({
    queryKey: ["report", "catalog-categories", catalogTag],
    queryFn: () => reportApi.catalog.categories(catalogTag!),
    enabled: !!catalogTag,
  });
  const categoryOptions = useMemo(() => (catQ.data ?? []).map((c) => c.category), [catQ.data]);
  const optionsFor = (key: string) => col(key)?.options ?? (key === "category" ? categoryOptions : []);

  const patch = (i: number, p: Partial<ReportGoal>) => onChange((prev) => prev.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const remove = (i: number) => onChange((prev) => prev.filter((_, j) => j !== i));
  const add = () =>
    onChange((prev) => [
      ...prev,
      {
        key: nextKey(prev),
        label: "",
        groupOp: "and",
        groups: [{ op: "and", conditions: [] }],
        agg: metricCols.length ? "sum" : "count",
        metricCol: metricCols.length ? defaultMetricKey : undefined,
      },
    ]);

  // 分组列表操作(单层分组)
  const mapGroups = (i: number, fn: (gs: ReportGoal["groups"]) => ReportGoal["groups"]) =>
    onChange((prev) => prev.map((g, j) => (j === i ? { ...g, groups: fn(g.groups ?? []) } : g)));
  const mapConds = (i: number, gi: number, fn: (cs: GoalCondition[]) => GoalCondition[]) =>
    mapGroups(i, (gs) => gs.map((grp, k) => (k === gi ? { ...grp, conditions: fn(grp.conditions ?? []) } : grp)));

  // 中栏:选数据列(metric→保留聚合;dim/命中行数→强制计数)
  const setDataCol = (i: number, key: string) => {
    const c = col(key);
    if (!key) return patch(i, { metricCol: undefined, agg: "count" });
    if (c?.role === "metric") {
      // 选数值列默认求和:从「计数/命中行数」切到金额列时切回求和,避免「金额」却在计数(仍可手动改回计数)
      const g = value[i];
      patch(i, { metricCol: key, agg: g.agg === "avg" ? "avg" : "sum" });
    } else patch(i, { metricCol: key, agg: "count" }); // 文本/维度列只能计数
  };
  // 中栏:选分组依据
  const setGroupBy = (i: number, key: string) => {
    if (!key) return patch(i, { groupBy: undefined, grain: undefined });
    const c = col(key);
    const g = value[i];
    patch(i, { groupBy: key, grain: c?.role === "date" ? g.grain ?? "quarter" : undefined });
  };

  function describe(g: ReportGoal): string {
    const grps = (g.groups ?? [])
      .map((grp) => {
        const cs = (grp.conditions ?? []).filter((c) => c.values?.length);
        if (!cs.length) return null;
        const inner = cs
          .map((c) => {
            const cd = col(c.col);
            return `${cd?.label ?? c.col}${cd?.match === "text" ? "含" : "∈"}{${c.values.join("/")}}`;
          })
          .join(grp.op === "or" ? " 或 " : " 且 ");
        return cs.length > 1 ? `(${inner})` : inner;
      })
      .filter(Boolean) as string[];
    const filterText = grps.length === 0 ? "全部明细" : grps.join(g.groupOp === "or" ? " 或 " : " 且 ");

    const m = col(g.metricCol);
    const colL = g.agg === "count" ? (m ? `${m.label}非空数` : "命中行数") : m?.label ?? "金额";
    const gb = col(g.groupBy);
    const grpL = gb ? ` · 按${gb.role === "date" ? GOAL_GRAIN_LABEL[g.grain ?? "quarter"].replace("按", "") : gb.label}分组` : "";
    const statText = `${GOAL_AGG_LABEL[g.agg]}(${colL})${grpL}`;

    return `${filterText} 的 ${statText}(实际值);达标判断在考核工具`;
  }

  const numericMetric = (g: ReportGoal) => !!col(g.metricCol) && col(g.metricCol)!.role === "metric";

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-400">
          还没有目标。点下方「添加目标」——左栏按明细列筛选(可分组、且/或),中栏选统计方式(求和/平均/计数,可按季度等分组)。只产出「目标值 + 实际值」,达标判断和给分在考核工具里做。列随报送类型自动变,可加多个。
        </div>
      )}

      {value.map((g, i) => {
        const gb = col(g.groupBy);
        return (
          <div key={g.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <TargetIcon className="h-4 w-4 flex-shrink-0 text-[var(--party-primary)]" />
              <input
                value={g.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="目标名称(如:福利费第一部分采购额 / 每季度报送≥2条)"
                className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[var(--party-primary)] focus:outline-none"
              />
              <button onClick={() => remove(i)} title="删除目标" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                <Trash2Icon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              {/* 左:筛选(单层分组) */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5">
                <div className="mb-1.5 text-xs font-medium text-gray-500">筛选 · 挑出明细行(不加=全部)</div>
                <div className="space-y-2">
                  {(g.groups ?? []).map((grp, gi) => (
                    <div key={gi}>
                      {gi > 0 && (
                        <div className="my-1 flex justify-center">
                          <BoolToggle value={g.groupOp} onChange={(v) => patch(i, { groupOp: v })} title="切换 组间 且/或" />
                        </div>
                      )}
                      <div className="rounded-lg border border-gray-200 bg-white p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            组内
                            {(grp.conditions ?? []).length > 1 && (
                              <BoolToggle value={grp.op} onChange={(v) => mapGroups(i, (gs) => gs.map((x, k) => (k === gi ? { ...x, op: v } : x)))} title="切换 组内 且/或" />
                            )}
                          </span>
                          {(g.groups ?? []).length > 1 && (
                            <button onClick={() => mapGroups(i, (gs) => gs.filter((_, k) => k !== gi))} title="删除该组" className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600">
                              <XIcon className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {(grp.conditions ?? []).map((c, ci) => (
                            <ConditionRow
                              key={ci}
                              cond={c}
                              dimCols={dimCols}
                              optionsFor={optionsFor}
                              onChange={(nc) => mapConds(i, gi, (cs) => cs.map((x, k) => (k === ci ? nc : x)))}
                              onRemove={() => mapConds(i, gi, (cs) => cs.filter((_, k) => k !== ci))}
                            />
                          ))}
                        </div>
                        {dimCols.length > 0 ? (
                          <button onClick={() => mapConds(i, gi, (cs) => [...cs, { col: dimCols[0].key, values: [] }])} className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--party-primary)]">
                            <PlusIcon className="h-3.5 w-3.5" />
                            条件
                          </button>
                        ) : (
                          <p className="text-xs text-gray-400">本任务暂无可筛选的明细列</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => mapGroups(i, (gs) => [...gs, { op: "and", conditions: [] }])} className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[var(--party-primary)]">
                  <PlusIcon className="h-3.5 w-3.5" />
                  添加分组
                </button>
              </div>

              {/* 中:统计 */}
              <div className="rounded-lg border border-gray-100 p-2.5">
                <div className="mb-1.5 text-xs font-medium text-gray-500">统计 · 算一个数</div>
                <label className="block text-[11px] text-gray-400">
                  数据列
                  <select value={g.metricCol ?? ""} onChange={(e) => setDataCol(i, e.target.value)} className={`${selCls} mt-0.5 w-full`}>
                    <option value="">(命中行数)</option>
                    {dataCols.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                        {c.role === "dim" ? "(计数)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-1.5 block text-[11px] text-gray-400">
                  统计方式
                  <select value={g.agg} onChange={(e) => patch(i, { agg: e.target.value as GoalAgg })} disabled={!numericMetric(g)} className={`${selCls} mt-0.5 w-full disabled:bg-gray-50 disabled:text-gray-400`}>
                    {(numericMetric(g) ? (["sum", "avg", "count"] as GoalAgg[]) : (["count"] as GoalAgg[])).map((a) => (
                      <option key={a} value={a}>
                        {GOAL_AGG_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </label>
                {groupByCols.length > 0 && (
                  <label className="mt-1.5 block text-[11px] text-gray-400">
                    分组依据
                    <select value={g.groupBy ?? ""} onChange={(e) => setGroupBy(i, e.target.value)} className={`${selCls} mt-0.5 w-full`}>
                      <option value="">不分组</option>
                      {groupByCols.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                          {c.role === "date" ? "(日期)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {gb?.role === "date" && (
                  <label className="mt-1.5 block text-[11px] text-gray-400">
                    粒度
                    <select value={g.grain ?? "quarter"} onChange={(e) => patch(i, { grain: e.target.value as GoalGrain })} className={`${selCls} mt-0.5 w-full`}>
                      {(["year", "quarter", "month"] as GoalGrain[]).map((gr) => (
                        <option key={gr} value={gr}>
                          {GOAL_GRAIN_LABEL[gr]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="mt-2 text-[11px] text-gray-400">目标值(可选)在「派发对象」后逐单位录入(下方表格 / 粘贴导入),仅作展示参考。达标判断和给分在考核工具里做。</p>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-400">口径:{describe(g)}</p>
          </div>
        );
      })}

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
