import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Scale, Sparkles, Loader2 } from "lucide-react";
import { organizationsApi } from "@/features/organization";
import { assessmentApi, type AssessmentTarget, type IndicatorNode, type SchemeSettings } from "../api";
import { buildRubric, criteriaInput } from "../rubric";
import { DATA_SOURCES, OUTPUT_LABELS, getDataSource, effectiveOutputType } from "../data-sources/registry";
import { SCORING_STRATEGY_LIST, getStrategy, isInputCompatible } from "../scoring/registry";
import { PROP_INPUT } from "../scoring/shared";
import { DATA_SOURCE_HELP, SCORING_HELP, type HelpText } from "../help";
import { DifficultyCoefDialog } from "./DifficultyCoefDialog";
import { ReportQueryEditor } from "./ReportQueryEditor";
import { OrgPicker } from "./OrgPicker";

/** 叶子指标配置:数据源 + 计分工具(各带 ⓘ 说明)+ 参数 + 难易系数 + 责任部门/责任人 + 评分标准 + 试算预览。 */
export function LeafConfigPanel({
  node,
  onChange,
  scopeOrgId,
  targets = [],
  settings = {},
  onSettings = () => {},
}: {
  node: IndicatorNode;
  onChange: (patch: Partial<IndicatorNode>) => void;
  /** 考核主体单位:责任部门候选限定到其下属部门(按考核层级精确显示) */
  scopeOrgId?: string;
  /** 考核对象(难易系数按对象逐个配)*/
  targets?: AssessmentTarget[];
  /** 考核表设置(难易系数测算表 + 员工数,弹窗读写)*/
  settings?: SchemeSettings;
  onSettings?: (patch: Partial<SchemeSettings>) => void;
}) {
  const ds = getDataSource(node.dataSource);
  const strat = getStrategy(node.scoringType);
  const [diffOpen, setDiffOpen] = useState(false);
  const coefCount = Object.keys(node.difficultyCoefs ?? {}).length;
  const [dsHelp, setDsHelp] = useState(false);
  const [stratHelp, setStratHelp] = useState(false);

  const compatStrategies = useMemo(() => {
    if (!node.dataSource) return SCORING_STRATEGY_LIST;
    const out = effectiveOutputType(node.dataSource, node.sourceParams);
    return SCORING_STRATEGY_LIST.filter((s) => isInputCompatible(s.inputType, out));
  }, [node.dataSource, node.sourceParams]);

  function pickDataSource(id: string) {
    const patch: Partial<IndicatorNode> = { dataSource: id || undefined };
    if (id !== "report.query") patch.sourceParams = undefined; // 切走 report.query 清专属参数
    const out = effectiveOutputType(id, id === "report.query" ? node.sourceParams : undefined);
    if (strat && id && !isInputCompatible(strat.inputType, out)) {
      patch.scoringType = undefined;
      patch.strategyParams = undefined;
    }
    onChange(patch);
  }
  /** report.query 参数变(field 可能改 outputType → 与当前计分工具不兼容则清掉) */
  function setSourceParams(spNew: Record<string, unknown>) {
    const patch: Partial<IndicatorNode> = { sourceParams: spNew };
    const out = effectiveOutputType(node.dataSource, spNew);
    if (strat && !isInputCompatible(strat.inputType, out)) {
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

  // AI 生成评分标准
  const aiCriteria = useMutation({
    mutationFn: () => assessmentApi.generateCriteria(criteriaInput(node)),
    onSuccess: (r) => onChange({ rubric: r.criteria }),
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof m === "string" ? m : "AI 生成失败,请重试或手动填写");
    },
  });

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

      {node.dataSource === "report.query" && (
        <ReportQueryEditor sourceParams={node.sourceParams} onChange={setSourceParams} targets={targets} />
      )}

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
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[13px] font-semibold text-[#172033]">难易系数(默认系数 1)</div>
            <label className="flex items-center gap-1.5 text-[12px] text-[#475467] cursor-pointer">
              <input
                type="checkbox"
                checked={!!node.difficultyOn}
                onChange={(e) => onChange({ difficultyOn: e.target.checked || undefined })}
                className="accent-[var(--party-primary)]"
              />
              本指标启用
            </label>
          </div>
          {node.difficultyOn ? (
            <>
              <button
                type="button"
                onClick={() => setDiffOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] border border-[var(--party-primary)] text-[var(--party-primary)] bg-white hover:bg-party-soft"
              >
                <Scale className="w-4 h-4" /> 配置各单位难易系数{coefCount ? `(已设 ${coefCount} 个)` : ""}
              </button>
              <div className="text-[11px] text-[#9CA3AF] mt-1">导出单位 → 填员工数 → 导入测算 → 微调;得分 × 系数,再排名/汇总。</div>
            </>
          ) : (
            <div className="text-[11px] text-[#9CA3AF]">仅个别指标需要(如宣传积分、荣誉积分);默认各单位系数 1。</div>
          )}
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
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold text-[#172033]">评分标准 / 说明</div>
          {strat && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onChange({ rubric: buildRubric(node) })}
                className="text-[12px] text-[var(--party-primary)] hover:underline"
                title="按 数据源 + 计分工具 + 参数 + 分值 + 指标名 自动生成"
              >
                按配置生成
              </button>
              <button
                type="button"
                onClick={() => aiCriteria.mutate()}
                disabled={aiCriteria.isPending}
                className="inline-flex items-center gap-1 text-[12px] text-[#1A56A8] hover:underline disabled:opacity-50"
              >
                {aiCriteria.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI 生成
              </button>
            </div>
          )}
        </div>
        <textarea
          value={node.rubric ?? ""}
          onChange={(e) => onChange({ rubric: e.target.value })}
          rows={4}
          placeholder="如:中心组学习每月≥1次、台账完整得满分;缺项按比例扣…(可点右上「按配置生成」或「AI 生成」)"
          className={`${PROP_INPUT} resize-y`}
        />
      </div>

      <DifficultyCoefDialog
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        indicatorLabel={node.label}
        targets={targets}
        tables={settings.difficultyTables ?? []}
        onTables={(t) => onSettings({ difficultyTables: t })}
        headcounts={settings.headcounts ?? {}}
        onHeadcounts={(h) => onSettings({ headcounts: h })}
        coefs={node.difficultyCoefs ?? {}}
        onCoefs={(c) => onChange({ difficultyCoefs: c })}
      />
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
  const [labelVal, setLabelVal] = useState("");

  const optLabels = (Array.isArray(params.options) ? params.options : [])
    .map((o) =>
      o && typeof o === "object" && typeof (o as { label?: unknown }).label === "string"
        ? (o as { label: string }).label.trim()
        : "",
    )
    .filter(Boolean);
  const effLabel = labelVal || optLabels[0] || "";
  const thisVal = numVal === "" ? null : Number(numVal);
  const otherVals = others
    .split(/[,，\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  const raw: number | boolean | string | null =
    inputType === "bool" ? boolVal : inputType === "label" ? effLabel || null : thisVal;
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
      ) : inputType === "label" ? (
        <label className="block">
          <span className="text-[11px] text-[#6B7280]">样例评价名次</span>
          {optLabels.length > 0 ? (
            <select value={effLabel} onChange={(e) => setLabelVal(e.target.value)} className={PROP_INPUT}>
              {optLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-[12px] text-[#9CA3AF]">先在上方对照表加「名次→分」</div>
          )}
        </label>
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
