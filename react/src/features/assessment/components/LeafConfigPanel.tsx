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
import { NodeAdminField } from "./UserMultiPicker";

/** 叶子指标配置:数据源 + 计分工具(各带 ⓘ 说明)+ 参数 + 难易系数 + 责任部门/责任人 + 评分标准 + 试算预览。 */
export function LeafConfigPanel({
  node,
  onChange,
  scopeOrgId,
  targets = [],
  settings = {},
  onSettings = () => {},
  nameMap = {},
  onResolveNames,
  lockDifficultyTables = false,
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
  /** 人员 id→姓名 映射(节点管理员展示用) */
  nameMap?: Record<string, string>;
  onResolveNames?: (entries: Record<string, string>) => void;
  /** 节点管理员维护场景:测算表/员工数是考核表级(本页 updateSubtree 不保存设置),弹窗里锁为只读,只允许改本节点各单位系数。 */
  lockDifficultyTables?: boolean;
}) {
  const ownerIds = node.ownerUserIds ?? (node.ownerUserId ? [node.ownerUserId] : []);
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
        <div className="text-[13px] font-semibold text-[#172033] mb-2">考核责任人(具体谁填报,可多人)</div>
        <MemberMultiPicker
          orgId={node.ownerOrgId}
          value={ownerIds}
          onChange={(ids) => onChange({ ownerUserIds: ids.length ? ids : undefined, ownerUserId: undefined })}
        />
        <div className="mt-1 text-[11px] text-[#9CA3AF]">不选 = 整个责任部门;责任人可见并填报自己负责的指标(P2 填报闭环用)。</div>
      </div>

      <NodeAdminField
        value={node.adminUserIds}
        onChange={(ids) => onChange({ adminUserIds: ids })}
        nameMap={nameMap}
        onResolveNames={onResolveNames}
        hasChildren={false}
      />

      <div>
        <div className="text-[13px] font-semibold text-[#172033] mb-2">考核内容(详细)</div>
        <textarea
          value={node.content ?? ""}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={3}
          placeholder="该指标考核的详细内容(可从考核办法原文粘贴)。指标标题只放简要描述,详情写这里 —— 指标行鼠标悬停即可看到;可据此凝练标题。"
          className={`${PROP_INPUT} resize-y`}
        />
        <div className="mt-1 text-[11px] text-[#9CA3AF]">标题简要、内容详细:列表只显示标题(短),hover 指标行看这里的完整考核内容。</div>
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
        lockTables={lockDifficultyTables}
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

/** 考核责任人多选:责任人 ∈ 责任部门,故按 ownerOrgId 拉部门成员(含下级),勾选多人;不选=整个部门。 */
function MemberMultiPicker({
  orgId,
  value,
  onChange,
}: {
  orgId: string | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useQuery({
    queryKey: ["org-members", orgId, "recursive"],
    queryFn: () => organizationsApi.members(orgId as string, true),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  if (!orgId) {
    return (
      <div className="px-2.5 py-1.5 rounded-md border border-[#dce4ef] bg-[#f8fafc] text-[12px] text-[#9CA3AF]">
        先选责任部门
      </div>
    );
  }
  const members = data ?? [];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="max-h-44 overflow-auto rounded-md border border-[#dce4ef] divide-y divide-[#f1f5f9]">
      {members.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-[#9CA3AF]">该部门暂无成员</div>
      ) : (
        members.map((m) => (
          <label
            key={m.userId}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-party-soft"
          >
            <input
              type="checkbox"
              checked={value.includes(m.userId)}
              onChange={() => toggle(m.userId)}
              className="accent-[var(--party-primary)]"
            />
            <span className="text-[#172033]">{m.name}</span>
            <span className="text-[11px] text-[#9CA3AF]">{m.username}</span>
          </label>
        ))
      )}
    </div>
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
