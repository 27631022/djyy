import { type ReportGoal } from "../api";

/**
 * 逐单位目标值录入网格(纯展示,受控)。单位 × perUnit 金额目标,每格一个数值输入。
 * value: { 单位id: { goalKey: 元 } };发布向导按「派发对象 id」键,详情页按「targetId」键。
 */
export function GoalPerUnitTable({
  goals,
  units,
  value,
  onChange,
}: {
  goals: ReportGoal[]; // perUnit 金额目标
  units: { id: string; name: string }[];
  value: Record<string, Record<string, number>>;
  onChange: (v: Record<string, Record<string, number>>) => void;
}) {
  if (goals.length === 0) return null;
  const set = (uid: string, key: string, n: number) =>
    onChange({ ...value, [uid]: { ...(value[uid] ?? {}), [key]: n } });
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
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
          {units.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-1.5 text-gray-700">{u.name}</td>
              {goals.map((g) => (
                <td key={g.key} className="px-3 py-1.5">
                  <input
                    type="number"
                    min={0}
                    value={value[u.id]?.[g.key] ?? ""}
                    onChange={(e) => set(u.id, g.key, Number(e.target.value))}
                    className="w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-[var(--party-primary)] focus:outline-none"
                  />
                </td>
              ))}
            </tr>
          ))}
          {units.length === 0 && (
            <tr>
              <td colSpan={goals.length + 1} className="px-3 py-4 text-center text-xs text-gray-400">
                请先在上一步选择派发对象
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
