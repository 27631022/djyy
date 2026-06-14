import { Plus, Sparkles, X } from "lucide-react";
import type { GradeRules, GradeThreshold, GradeTier } from "../api";
import { cloneRules, GRADE_PRESETS, presetForRelation } from "../gradePresets";

const INPUT =
  "px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/**
 * 定级规则编辑器:套用预设(党委/党支部/党员综合考核定级)或自定义。
 * mode='rank' 名次划档(预设);mode='score' 总分阈值(自定义)。计算在 P2,这里只配置。
 */
export function GradeRulesEditor({
  grade,
  onGrade,
  relationKey,
}: {
  grade: GradeRules;
  onGrade: (g: GradeRules) => void;
  relationKey?: string;
}) {
  const mode = grade.mode ?? (grade.tiers && grade.tiers.length ? "rank" : "score");
  const tiers = grade.tiers ?? [];
  const thresholds = grade.thresholds ?? [];
  const isEmpty = tiers.length === 0 && thresholds.length === 0;
  const recommend = presetForRelation(relationKey);

  function applyPreset(key: string) {
    if (!key) return;
    if (key === "__score__") {
      onGrade({ mode: "score", thresholds: thresholds.length ? thresholds : [] });
      return;
    }
    const p = GRADE_PRESETS.find((x) => x.key === key);
    if (p) onGrade(cloneRules(p.rules));
  }

  const patchTier = (i: number, patch: Partial<GradeTier>) =>
    onGrade({ ...grade, mode: "rank", tiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const setThreshold = (i: number, patch: Partial<GradeThreshold>) =>
    onGrade({ ...grade, mode: "score", thresholds: thresholds.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addThreshold = () =>
    onGrade({ ...grade, mode: "score", thresholds: [...thresholds, { grade: "", min: 0 }] });
  const delThreshold = (i: number) =>
    onGrade({ ...grade, mode: "score", thresholds: thresholds.filter((_, j) => j !== i) });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-semibold text-[#172033]">定级规则</div>
        <select
          value=""
          onChange={(e) => applyPreset(e.target.value)}
          className="text-[12px] border border-[#dce4ef] rounded-md px-1.5 py-1 bg-white text-[#475467]"
          title="套用预设的定级规则,或切换为自定义总分阈值"
        >
          <option value="">套用预设 / 切换…</option>
          {GRADE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="__score__">自定义(总分阈值)</option>
        </select>
      </div>

      {/* 按当前考核关系推荐 */}
      {recommend && (
        <button
          type="button"
          onClick={() => onGrade(cloneRules(recommend.rules))}
          className="w-full mb-2 flex items-start gap-1.5 text-left px-2 py-1.5 rounded-md bg-party-soft text-[12px] text-[var(--party-primary)] hover:brightness-95"
          title={recommend.note}
        >
          <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>建议套用:{recommend.label}</span>
        </button>
      )}

      {isEmpty && !recommend && (
        <div className="text-[12px] text-[#9CA3AF]">从上方「套用预设」选党委/党支部/党员定级,或选「自定义」按总分设阈值。</div>
      )}

      {/* 名次划档(预设) */}
      {mode === "rank" && tiers.length > 0 && (
        <div className="space-y-1.5">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={t.grade}
                onChange={(e) => patchTier(i, { grade: e.target.value })}
                className={`${INPUT} w-28 !py-1 font-medium`}
              />
              <div className="flex-1 text-[12px] text-[#64748b] flex items-center flex-wrap gap-1">
                {t.band === "top" && (
                  <>
                    排名前
                    <PctInput value={t.pct} onChange={(v) => patchTier(i, { pct: v })} />%
                    {t.requireNoLoss && <span>、且未亏损</span>}
                  </>
                )}
                {t.band === "bottom" && (
                  <>
                    排名后
                    <PctInput value={t.pct} onChange={(v) => patchTier(i, { pct: v })} />%
                  </>
                )}
                {t.band === "rest" && <span>其余对象</span>}
                {t.band === "downgrade" && (
                  <>
                    连续
                    <PctInput value={t.years} onChange={(v) => patchTier(i, { years: v })} />年「{t.fromGrade}」
                    {t.onMajorIncident && <span>,或当年发生重大不良影响</span>}
                  </>
                )}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            名次划档在 P2 评分排名后计算;档次名与比例可改,「未亏损 / 重大不良影响」等条件随预设。
          </p>
        </div>
      )}

      {/* 自定义总分阈值 */}
      {mode === "score" && (
        <>
          <div className="flex gap-1.5 mb-1">
            <span className="flex-1 text-[10px] text-[#9CA3AF]">等级名</span>
            <span className="w-24 text-[10px] text-[#9CA3AF]">总分 ≥</span>
            <span className="w-6" />
          </div>
          {thresholds.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 mb-1.5">
              <input
                value={t.grade}
                placeholder="优秀"
                onChange={(e) => setThreshold(i, { grade: e.target.value })}
                className={`${INPUT} flex-1 !py-1`}
              />
              <input
                type="number"
                value={t.min}
                onChange={(e) => setThreshold(i, { min: Number(e.target.value) || 0 })}
                className={`${INPUT} w-24 !py-1`}
              />
              <button
                type="button"
                onClick={() => delThreshold(i)}
                className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addThreshold}
            className="flex items-center gap-1 text-[12px] text-[var(--party-primary)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> 加一档
          </button>
          {thresholds.length === 0 && (
            <div className="text-[12px] text-[#9CA3AF] mt-1">未设阈值(如:优秀≥90、良好≥80、合格≥60)</div>
          )}
        </>
      )}
    </div>
  );
}

function PctInput({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-12 text-right text-[12px] border border-[#e5e7eb] rounded px-1 py-0.5 mx-0.5"
    />
  );
}
