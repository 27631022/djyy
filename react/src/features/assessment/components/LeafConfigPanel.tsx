import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { organizationsApi } from "@/features/organization";
import { assessmentApi, type IndicatorNode } from "../api";
import { DATA_SOURCES, OUTPUT_LABELS, getDataSource } from "../data-sources/registry";
import { SCORING_STRATEGY_LIST, getStrategy, isInputCompatible } from "../scoring/registry";
import { PROP_INPUT } from "../scoring/shared";
import { DATA_SOURCE_HELP, SCORING_HELP, type HelpText } from "../help";
import { OrgPicker } from "./OrgPicker";

/** 叶子指标配置:数据源 + 计分工具(各带 ⓘ 说明)+ 参数 + 责任部门/责任人 + 评分标准 + 试算预览。 */
export function LeafConfigPanel({
  node,
  onChange,
  scopeOrgId,
}: {
  node: IndicatorNode;
  onChange: (patch: Partial<IndicatorNode>) => void;
  /** 考核主体单位:责任部门候选限定到其下属部门(按考核层级精确显示) */
  scopeOrgId?: string;
}) {
  const ds = getDataSource(node.dataSource);
  const strat = getStrategy(node.scoringType);
  const [dsHelp, setDsHelp] = useState(false);
  const [stratHelp, setStratHelp] = useState(false);

  const compatStrategies = useMemo(() => {
    const out = ds?.outputType;
    return SCORING_STRATEGY_LIST.filter((s) => (out ? isInputCompatible(s.inputType, out) : true));
  }, [ds]);

  function pickDataSource(id: string) {
    const newDs = getDataSource(id);
    const patch: Partial<IndicatorNode> = { dataSource: id || undefined };
    if (strat && newDs && !isInputCompatible(strat.inputType, newDs.outputType)) {
      patch.scoringType = undefined;
      patch.strategyParams = undefined;
    }
    onChange(patch);
  }
  function pickStrategy(type: string) {
    if (!type) {
      onChange({ scoringType: undefined, strategyParams: undefined });
      return;
    }
    const def = getStrategy(type);
    onChange({ scoringType: type, strategyParams: def?.makeDefaults?.() ?? {} });
  }
  function patchParams(partial: Record<string, unknown>) {
    onChange({ strategyParams: { ...(node.strategyParams ?? {}), ...partial } });
  }

  const paramIssue = strat?.validate?.(node.strategyParams ?? {}) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[13px] font-semibold text-[#172033]">数据源(完成情况从哪来)</span>
          {ds && DATA_SOURCE_HELP[ds.id] && (
            <button
              type="button"
              onClick={() => setDsHelp((v) => !v)}
              className={`p-0.5 rounded hover:text-[var(--party-primary)] ${dsHelp ? "text-[var(--party-primary)]" : "text-[#9CA3AF]"}`}
              title="应用场景与案例"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select value={node.dataSource ?? ""} onChange={(e) => pickDataSource(e.target.value)} className={PROP_INPUT}>
          <option value="">— 请选择 —</option>
          {DATA_SOURCES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}（{OUTPUT_LABELS[d.outputType]}）{d.ready ? "" : " · 待接入"}
            </option>
          ))}
        </select>
        {ds && <div className="mt-1 text-[11px] text-[#9CA3AF]">{ds.description}</div>}
        {dsHelp && ds && DATA_SOURCE_HELP[ds.id] && <HelpBox help={DATA_SOURCE_HELP[ds.id]} />}
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[13px] font-semibold text-[#172033]">计分工具(度量→得分)</span>
          {strat && SCORING_HELP[strat.type] && (
            <button
              type="button"
              onClick={() => setStratHelp((v) => !v)}
              className={`p-0.5 rounded hover:text-[var(--party-primary)] ${stratHelp ? "text-[var(--party-primary)]" : "text-[#9CA3AF]"}`}
              title="应用场景与案例"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          value={node.scoringType ?? ""}
          onChange={(e) => pickStrategy(e.target.value)}
          className={PROP_INPUT}
          disabled={!node.dataSource}
        >
          <option value="">{node.dataSource ? "— 请选择 —" : "请先选数据源"}</option>
          {compatStrategies.map((s) => (
            <option key={s.type} value={s.type}>
              {s.label}
            </option>
          ))}
        </select>
        {strat?.summary && <div className="mt-1 text-[11px] text-[#9CA3AF]">{strat.summary(node.strategyParams ?? {})}</div>}
        {stratHelp && strat && SCORING_HELP[strat.type] && <HelpBox help={SCORING_HELP[strat.type]} />}
      </div>

      {strat?.Properties && (
        <div className="rounded-lg border border-[#eef2f7] bg-[#FBFBFC] p-3 space-y-2">
          <div className="text-[12px] font-medium text-[#4B5563]">参数</div>
          <strat.Properties params={node.strategyParams ?? {}} patch={patchParams} />
          {paramIssue && <div className="text-[11px] text-red-600">⚠ {paramIssue}</div>}
        </div>
      )}

      {strat && (
        <TrialPreview
          scoringType={strat.type}
          params={node.strategyParams ?? {}}
          fullScore={node.weight || 0}
          inputType={strat.inputType}
          crossTarget={strat.crossTarget}
        />
      )}

      <div>
        <div className="text-[13px] font-semibold text-[#172033] mb-2">责任部门(哪个部门负责)</div>
        <OrgPicker
          kind="admin"
          deptOnly
          scopeOrgId={scopeOrgId}
          value={node.ownerOrgId}
          onChange={(v) => onChange({ ownerOrgId: v, ownerUserId: undefined })}
          placeholder={scopeOrgId ? "未指定" : "未指定(建议先设考核主体)"}
        />
      </div>

      <div>
        <div className="text-[13px] font-semibold text-[#172033] mb-2">考核责任人(具体谁填报)</div>
        <MemberPicker orgId={node.ownerOrgId} value={node.ownerUserId} onChange={(v) => onChange({ ownerUserId: v })} />
        <div className="mt-1 text-[11px] text-[#9CA3AF]">责任人可见并填报自己负责的指标;部门考核管理员可见本部门全部(P2 填报闭环用)。</div>
      </div>

      <div>
        <div className="text-[13px] font-semibold text-[#172033] mb-2">评分标准 / 说明</div>
        <textarea
          value={node.rubric ?? ""}
          onChange={(e) => onChange({ rubric: e.target.value })}
          rows={4}
          placeholder="如:中心组学习每月≥1次、台账完整得满分;缺项按比例扣…(人工打分时同屏显示)"
          className={`${PROP_INPUT} resize-y`}
        />
      </div>
    </div>
  );
}

function HelpBox({ help }: { help: HelpText }) {
  return (
    <div className="mt-2 rounded-md bg-[#F0F7FF] border border-[#D6E6FB] p-2.5 text-[12px] leading-relaxed">
      <div className="text-[#1A56A8]">
        <span className="font-semibold">应用场景:</span>
        {help.scenario}
      </div>
      <div className="text-[#475467] mt-1">
        <span className="font-semibold">使用案例:</span>
        {help.example}
      </div>
    </div>
  );
}

/** 考核责任人选择:责任人 ∈ 责任部门,故按 ownerOrgId 拉部门成员(含下级)。 */
function MemberPicker({
  orgId,
  value,
  onChange,
}: {
  orgId: string | undefined;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const { data } = useQuery({
    queryKey: ["org-members", orgId, "recursive"],
    queryFn: () => organizationsApi.members(orgId as string, true),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  if (!orgId) {
    return (
      <select disabled className={PROP_INPUT}>
        <option>先选责任部门</option>
      </select>
    );
  }
  const members = data ?? [];
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={PROP_INPUT}>
      <option value="">未指定</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}（{m.username}）
        </option>
      ))}
    </select>
  );
}

function TrialPreview({
  scoringType,
  params,
  fullScore,
  inputType,
  crossTarget,
}: {
  scoringType: string;
  params: Record<string, unknown>;
  fullScore: number;
  inputType: string;
  crossTarget: boolean;
}) {
  const [boolVal, setBoolVal] = useState(true);
  const [numVal, setNumVal] = useState("85");
  const [others, setOthers] = useState("90, 80, 70");

  const thisVal = numVal === "" ? null : Number(numVal);
  const otherVals = others
    .split(/[,，\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  const raw: number | boolean | null = inputType === "bool" ? boolVal : thisVal;
  const rawValues =
    crossTarget && typeof thisVal === "number" ? [thisVal, ...otherVals] : crossTarget ? otherVals : undefined;

  const { data, isFetching } = useQuery({
    queryKey: ["assess-trial", scoringType, JSON.stringify(params), String(raw), JSON.stringify(rawValues), fullScore],
    queryFn: () => assessmentApi.trial({ scoringType, params, fullScore, raw, rawValues }),
    staleTime: 10_000,
    retry: false,
  });

  return (
    <div className="rounded-lg border border-[var(--party-primary)]/30 bg-party-soft p-3 space-y-2">
      <div className="text-[12px] font-semibold text-[var(--party-primary)]">试算预览（满分 {fullScore || 0}）</div>
      {inputType === "bool" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBoolVal(true)}
            className={`px-3 py-1 rounded-md text-[13px] border ${boolVal ? "border-[var(--party-primary)] bg-white text-[var(--party-primary)] font-bold" : "border-[#dce4ef] bg-white text-[#475467]"}`}
          >
            完成
          </button>
          <button
            type="button"
            onClick={() => setBoolVal(false)}
            className={`px-3 py-1 rounded-md text-[13px] border ${!boolVal ? "border-[var(--party-primary)] bg-white text-[var(--party-primary)] font-bold" : "border-[#dce4ef] bg-white text-[#475467]"}`}
          >
            未完成
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="block">
            <span className="text-[11px] text-[#6B7280]">{crossTarget ? "本对象值" : "样例原始值"}</span>
            <input type="number" value={numVal} onChange={(e) => setNumVal(e.target.value)} className={PROP_INPUT} />
          </label>
          {crossTarget && (
            <label className="block">
              <span className="text-[11px] text-[#6B7280]">其他对象值(逗号分隔,用于排名/标准化)</span>
              <input value={others} onChange={(e) => setOthers(e.target.value)} className={PROP_INPUT} />
            </label>
          )}
        </div>
      )}
      <div className="text-[15px] font-bold text-[#172033]">
        得分:{isFetching ? "…" : data ? data.score : "—"}
        <span className="text-[12px] font-normal text-[#9CA3AF]"> / {fullScore || 0}</span>
      </div>
    </div>
  );
}
