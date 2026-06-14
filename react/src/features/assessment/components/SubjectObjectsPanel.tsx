import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, FlipHorizontal2, X } from "lucide-react";
import {
  assessmentApi,
  targetRef,
  type AssessmentTarget,
  type AssessmentTrack,
  type RelationObject,
  type ScopeRelation,
} from "../api";

const INPUT =
  "px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

const LEVEL_LABEL: Record<string, string> = {
  company: "公司级",
  unit2: "二级单位级",
  unit3: "三级/支部级",
};

function toTarget(c: RelationObject): AssessmentTarget {
  return c.kind === "org" ? { orgId: c.orgId, name: c.name } : { userId: c.userId, name: c.name };
}

/**
 * 考核主体 + 考核对象 面板。
 * 主体按「我的考核区域」(后端按登录账号收敛)选;选定主体 → 考核对象自动带出该主体下级 + 批量全选/反选。
 */
export function SubjectObjectsPanel({
  relationKey,
  subjectOrgId,
  onSubject,
  targets,
  onTargets,
}: {
  relationKey?: string;
  subjectOrgId?: string;
  onSubject: (p: {
    relationKey: string;
    subjectOrgId: string;
    subjectName: string;
    deptScopeOrgId?: string;
    track: AssessmentTrack;
  }) => void;
  targets: AssessmentTarget[];
  onTargets: (v: AssessmentTarget[]) => void;
}) {
  const { data: scope, isLoading } = useQuery({
    queryKey: ["assessment", "my-scope"],
    queryFn: () => assessmentApi.myScope(),
    staleTime: 60_000,
  });

  const relations = scope?.relations ?? [];
  const relation = relations.find((r) => r.key === relationKey);
  const subject = relation?.subjects.find((s) => s.orgId === subjectOrgId);

  function pickRelation(key: string) {
    const rel = relations.find((r) => r.key === key);
    if (!rel) return;
    onTargets([]);
    // 唯一主体(公司级)直接定;多主体先清空待选
    if (rel.subjects.length === 1) {
      const s = rel.subjects[0];
      onSubject({
        relationKey: rel.key,
        subjectOrgId: s.orgId,
        subjectName: s.name,
        deptScopeOrgId: s.deptScopeOrgId,
        track: rel.track,
      });
    } else {
      onSubject({ relationKey: rel.key, subjectOrgId: "", subjectName: "", track: rel.track });
    }
  }

  function pickSubject(rel: ScopeRelation, orgId: string) {
    const s = rel.subjects.find((x) => x.orgId === orgId);
    if (!s) return;
    onTargets([]);
    onSubject({
      relationKey: rel.key,
      subjectOrgId: s.orgId,
      subjectName: s.name,
      deptScopeOrgId: s.deptScopeOrgId,
      track: rel.track,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold text-[#172033] mb-1">考核关系</div>
        <select value={relationKey ?? ""} onChange={(e) => pickRelation(e.target.value)} className={`${INPUT} w-full`}>
          <option value="">选择「谁考核谁」…</option>
          {relations.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}（{LEVEL_LABEL[r.level] ?? r.level}）
            </option>
          ))}
        </select>
        {isLoading && <div className="text-[11px] text-[#9CA3AF] mt-1">加载考核区域…</div>}
        {!isLoading && relations.length === 0 && (
          <div className="text-[11px] text-[#d97706] mt-1">当前账号无可用考核关系(需考核管理权限)。</div>
        )}
      </div>

      {relation && relation.subjects.length > 1 && (
        <div>
          <div className="text-[13px] font-semibold text-[#172033] mb-1">
            考核主体 <span className="text-[#9CA3AF] font-normal">（{relation.subjectLabel}）</span>
          </div>
          <select
            value={subjectOrgId ?? ""}
            onChange={(e) => pickSubject(relation, e.target.value)}
            className={`${INPUT} w-full`}
          >
            <option value="">选择{relation.subjectLabel}…</option>
            {relation.subjects.map((s) => (
              <option key={s.orgId} value={s.orgId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {relation && subject && (
        <ObjectsPicker
          relationKey={relation.key}
          subjectOrgId={subject.orgId}
          objectLabel={relation.objectLabel}
          targets={targets}
          onTargets={onTargets}
        />
      )}
    </div>
  );
}

/** 考核对象批量选择器:按主体自动带出候选 + 搜索 + 全选/反选/清空。 */
function ObjectsPicker({
  relationKey,
  subjectOrgId,
  objectLabel,
  targets,
  onTargets,
}: {
  relationKey: string;
  subjectOrgId: string;
  objectLabel: string;
  targets: AssessmentTarget[];
  onTargets: (v: AssessmentTarget[]) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "relation-objects", relationKey, subjectOrgId],
    queryFn: () => assessmentApi.relationObjects(relationKey, subjectOrgId),
    staleTime: 30_000,
  });
  const [q, setQ] = useState("");

  const candidates = useMemo(() => data ?? [], [data]);
  const selected = new Set(targets.map(targetRef));
  const kw = q.trim();
  const filtered = kw ? candidates.filter((c) => c.name.includes(kw)) : candidates;
  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(targetRef(c)));

  function toggle(c: RelationObject) {
    const ref = targetRef(c);
    if (selected.has(ref)) onTargets(targets.filter((t) => targetRef(t) !== ref));
    else onTargets([...targets, toTarget(c)]);
  }
  function selectAll() {
    onTargets(candidates.map(toTarget));
  }
  function invert() {
    onTargets(candidates.filter((c) => !selected.has(targetRef(c))).map(toTarget));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] font-semibold text-[#172033]">
          考核对象 <span className="text-[#9CA3AF] font-normal">（{objectLabel}·已选 {targets.length}）</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={allSelected ? () => onTargets([]) : selectAll}
            className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-[var(--party-primary)] hover:bg-party-soft"
          >
            <CheckCheck className="w-3.5 h-3.5" /> {allSelected ? "全不选" : "全选"}
          </button>
          <button
            type="button"
            onClick={invert}
            className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-[#475467] hover:bg-[#eef2f7]"
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" /> 反选
          </button>
        </div>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`搜索${objectLabel}…`}
        className={`${INPUT} w-full mb-1.5`}
      />
      <div className="max-h-[260px] overflow-auto border border-[#eef2f7] rounded-md">
        {isLoading ? (
          <div className="text-center text-[12px] text-[#9CA3AF] py-6">加载候选…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-[12px] text-[#9CA3AF] py-6">{kw ? "无匹配" : "该主体下暂无可选对象"}</div>
        ) : (
          filtered.map((c) => {
            const ref = targetRef(c);
            return (
              <label key={ref} className="flex items-center gap-2 px-2.5 py-1 hover:bg-[#f6f8fb] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(ref)}
                  onChange={() => toggle(c)}
                  className="accent-[var(--party-primary)]"
                />
                <span className="text-[13px] text-[#374151]">{c.name}</span>
              </label>
            );
          })
        )}
      </div>
      {targets.length > 0 && (
        <button
          type="button"
          onClick={() => onTargets([])}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-red-600"
        >
          <X className="w-3 h-3" /> 清空已选
        </button>
      )}
      <div className="text-[11px] text-[#9CA3AF] mt-1">选定后冻结为快照,与日后组织调整解耦。</div>
    </div>
  );
}
