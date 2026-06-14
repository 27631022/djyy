import { Plus, Scale, Trash2, X } from "lucide-react";
import type { DifficultyTable, DifficultyTier } from "../api";
import { BASIS_LABELS, DEFAULT_HEADCOUNT_TABLE, newTableId, sortedTiers } from "../difficulty";

const INPUT =
  "px-2 py-1 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/**
 * 难易系数(积分系数)编辑器:按规模(员工人数)给不同倍率,拉平大小单位。
 * 可做多套;叶子用 difficultyId 引用。计算在 P2 汇总(度量 × 系数)。
 */
export function DifficultyEditor({
  tables,
  onChange,
}: {
  tables: DifficultyTable[];
  onChange: (tables: DifficultyTable[]) => void;
}) {
  const setTable = (id: string, patch: Partial<DifficultyTable>) =>
    onChange(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const setTier = (id: string, i: number, patch: Partial<DifficultyTier>) =>
    setTable(
      id,
      { tiers: (tables.find((t) => t.id === id)?.tiers ?? []).map((t, j) => (j === i ? { ...t, ...patch } : t)) },
    );
  const addTier = (id: string) =>
    setTable(id, { tiers: [...(tables.find((t) => t.id === id)?.tiers ?? []), { maxCount: 0, coef: 1 }] });
  const delTier = (id: string, i: number) =>
    setTable(id, { tiers: (tables.find((t) => t.id === id)?.tiers ?? []).filter((_, j) => j !== i) });

  const addTable = () =>
    onChange([
      ...tables,
      { ...DEFAULT_HEADCOUNT_TABLE, id: newTableId(), label: `难易系数 ${tables.length + 1}` },
    ]);
  const enable = () => onChange([{ ...DEFAULT_HEADCOUNT_TABLE, id: newTableId() }]);
  const removeTable = (id: string) => onChange(tables.filter((t) => t.id !== id));

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Scale className="w-4 h-4 text-[#475467]" />
        <div className="text-[13px] font-semibold text-[#172033]">难易系数(积分系数)</div>
      </div>

      {tables.length === 0 ? (
        <div>
          <p className="text-[12px] text-[#9CA3AF] mb-2">
            大单位人多、积分天然占优,可按规模给倍率拉平。配好后在**个别指标**上选用(指标默认系数 1);
            如宣传积分:得分 × 系数,再排名。
          </p>
          <button
            type="button"
            onClick={enable}
            className="flex items-center gap-1 text-[12px] text-[var(--party-primary)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> 启用难易系数(按员工人数)
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tables.map((tbl) => (
            <div key={tbl.id} className="rounded-lg border border-[#eef2f7] bg-[#FBFBFC] p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <input
                  value={tbl.label}
                  onChange={(e) => setTable(tbl.id, { label: e.target.value })}
                  className={`${INPUT} flex-1 font-medium`}
                />
                <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{BASIS_LABELS[tbl.basis]}</span>
                <button
                  type="button"
                  title="删除这套"
                  onClick={() => removeTable(tbl.id)}
                  className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {sortedTiers(tbl.tiers).map((tier) => {
                  const i = tbl.tiers.indexOf(tier);
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#6B7280] w-12 flex-shrink-0">人数 ≤</span>
                      <input
                        type="number"
                        placeholder="不封顶"
                        value={tier.maxCount ?? ""}
                        onChange={(e) =>
                          setTier(tbl.id, i, { maxCount: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        className={`${INPUT} w-20`}
                      />
                      <span className="text-[11px] text-[#6B7280] flex-shrink-0">→ 系数</span>
                      <input
                        type="number"
                        step="0.1"
                        value={tier.coef}
                        onChange={(e) => setTier(tbl.id, i, { coef: Number(e.target.value) || 0 })}
                        className={`${INPUT} w-16`}
                      />
                      <button
                        type="button"
                        onClick={() => delTier(tbl.id, i)}
                        className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addTier(tbl.id)}
                  className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
                >
                  <Plus className="w-3 h-3" /> 加一档
                </button>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1.5">人数上限留空 = 该档及以上(最大单位)。</div>
            </div>
          ))}
          <button
            type="button"
            onClick={addTable}
            className="flex items-center gap-1 text-[12px] text-[#475467] hover:text-[var(--party-primary)]"
          >
            <Plus className="w-3.5 h-3.5" /> 再加一套难易系数
          </button>
        </div>
      )}
    </div>
  );
}
