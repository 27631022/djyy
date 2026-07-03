import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, HeartPulse, Loader2, Sparkles } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from "recharts";
import { useAuth } from "@/stores/auth";
import { organizationsApi } from "@/features/organization";
import { ASSESSMENT_YEARS, rankingForYearIndex, resolveUnitName } from "@/shared/lib/ranking-demo";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseRoundIndicators,
  parseSnapshotResults,
  type AssessmentRound,
  type ResultSnapshot,
  type RoundTargetResult,
} from "../api";
import { leafMetaMap, medalStyle, type LeafMeta } from "../lib/ranking";
import {
  buildIssues,
  checkupSummaryForAi,
  computeDimRows,
  leafRanks,
  pickDimensions,
  resolveMyTargetRefs,
  type IssueSection,
} from "../lib/checkup";

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * 单位体检单(诊断清单):某个被考核单位的可解释考核画像 ——
 * 总览(★总分/名次/定级)+ 雷达图(各维度得分率 vs 全体平均,recharts)+
 * 分组体检报告表(●得分 + ●#单项排名)+ 短板诊断(规则版 + AI 生成)+ 季度快照趋势。
 * 管理员任选单位;单位账号按党组织归属自动锁定自己单位(登录路由,不匿名公开)。
 */
export default function UnitCheckup() {
  const { id } = useParams<{ id: string }>();
  const { data: rounds, isLoading } = useQuery({
    queryKey: ["assessment", "rounds", id],
    queryFn: () => assessmentApi.listRounds(id as string),
    enabled: !!id,
  });
  const round = rounds?.[0];
  if (isLoading) return <div className="p-12 text-center text-[#9CA3AF]">加载中…</div>;
  if (!round) return <EmptyShell msg="该考核表还没有发起考核(没有打分轮次),先去「考核打分」开始。" />;
  return <CheckupInner key={round.id} round={round} />;
}

function EmptyShell({ msg }: { msg: string }) {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]" title="返回">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="mt-6 py-16 text-center text-[#9CA3AF] rounded-xl border border-[#eef2f7] bg-white">{msg}</div>
    </div>
  );
}

function CheckupInner({ round }: { round: AssessmentRound }) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();

  const live = useQuery({
    queryKey: ["assess-live", round.id],
    queryFn: () => assessmentApi.liveResults(round.id),
    staleTime: 2000,
    refetchInterval: 60_000,
  });
  const snapshots = useQuery({
    queryKey: ["assessment", "snapshots", round.id],
    queryFn: () => assessmentApi.listSnapshots(round.id),
    staleTime: 60_000,
  });

  const isManager = (me?.isPlatformAdmin || me?.permissions?.includes("assessment:manage")) ?? false;
  // 非管理员:按组织归属解析「我的单位」—— 党组织+行政机构都爬(党建考核对象是党委、行政考核对象是行政单位),
  // 含停用组织(归属链中间可能有已撤销的层级,不拉进来爬链会静默中断);按人考核(ref=userId)直接比对本人 id。
  const allOrgs = useQuery({
    queryKey: ["organizations", "all", "flat", "inactive"],
    queryFn: () => organizationsApi.list(undefined, true),
    enabled: !isManager,
    staleTime: 5 * 60_000,
  });

  const targets = useMemo(() => live.data?.targets ?? [], [live.data]);
  const targetRefSet = useMemo(() => new Set(targets.map((t) => t.ref)), [targets]);
  const myRefs = useMemo(() => {
    if (isManager || !me) return [];
    const parentOf = new Map<string, string | null>((allOrgs.data ?? []).map((o) => [o.id, o.parentId]));
    const startIds = [...(me.memberships?.party ?? []), ...(me.memberships?.admin ?? [])].map((m) => m.orgId);
    const hits = resolveMyTargetRefs(startIds, parentOf, targetRefSet);
    if (targetRefSet.has(me.id) && !hits.includes(me.id)) hits.push(me.id); // 按人考核:本人即考核对象
    return hits;
  }, [isManager, allOrgs.data, me, targetRefSet]);

  // 选中单位:URL ?ref= 优先(非管理员只认自己单位的 ref)→ 我的单位第一个 → 管理员默认第一名
  const urlRef = params.get("ref");
  const allowedRefs = isManager ? null : new Set(myRefs); // null = 不限
  const selectedRef =
    (urlRef && (!allowedRefs || allowedRefs.has(urlRef)) && targetRefSet.has(urlRef) ? urlRef : null) ??
    myRefs[0] ??
    (isManager ? targets[0]?.ref ?? null : null);
  const mine = targets.find((t) => t.ref === selectedRef) ?? null;

  const indicators = useMemo(() => parseRoundIndicators(round), [round]);
  const meta = useMemo(() => leafMetaMap(indicators), [indicators]);
  const dims = useMemo(() => pickDimensions(indicators), [indicators]);

  if (live.isLoading || (!isManager && allOrgs.isLoading)) {
    return <div className="p-12 text-center text-[#9CA3AF]">加载中…</div>;
  }
  if (!mine) {
    return (
      <EmptyShell
        msg={
          isManager
            ? "该考核还没有考核对象。"
            : "未能识别你所属的被考核单位(按你的组织归属向上匹配考核对象)。请联系考核管理员确认你的组织归属。"
        }
      />
    );
  }

  const switchable = isManager ? targets : targets.filter((t) => myRefs.includes(t.ref));
  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      {/* 页头 */}
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]" title="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <HeartPulse className="w-5 h-5 text-[var(--party-primary)] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-[#172033] truncate">单位体检单 · {mine.name}</div>
          <div className="text-[12px] text-[#6B7280] truncate">{round.name} · 实时(录入更新后自动跟新)</div>
        </div>
        {switchable.length > 1 && (
          <select
            value={mine.ref}
            onChange={(e) => setParams({ ref: e.target.value }, { replace: true })}
            className="px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)] max-w-[240px]"
          >
            {switchable.map((t) => (
              <option key={t.ref} value={t.ref}>
                #{t.rank} {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <CheckupBody mine={mine} targets={targets} meta={meta} dims={dims} snapshots={snapshots.data ?? []} />
    </div>
  );
}

function CheckupBody({
  mine,
  targets,
  meta,
  dims,
  snapshots,
}: {
  mine: RoundTargetResult;
  targets: RoundTargetResult[];
  meta: Map<string, LeafMeta>;
  dims: ReturnType<typeof pickDimensions>;
  snapshots: ResultSnapshot[];
}) {
  const fullScore = useMemo(
    () => r2([...meta.values()].filter((m) => m.kind === "normal").reduce((s, m) => s + (m.weight || 0), 0)),
    [meta],
  );
  const dimRows = useMemo(() => computeDimRows(dims, mine, targets), [dims, mine, targets]);
  const ranks = useMemo(() => leafRanks(mine, targets, meta), [mine, targets, meta]);
  const issueInput = useMemo(
    () => ({ mine, total: fullScore, dimRows, meta, ranks, unitCount: targets.length }),
    [mine, fullScore, dimRows, meta, ranks, targets.length],
  );
  const issues = useMemo(() => buildIssues(issueInput), [issueInput]);

  // 与相邻名次的分差(名次不确定性提示:分差小别过度解读名次)
  const sorted = useMemo(() => [...targets].sort((a, b) => a.rank - b.rank), [targets]);
  const prev = sorted.find((t) => t.rank === mine.rank - 1);
  const next = sorted.find((t) => t.rank === mine.rank + 1);

  return (
    <div className="space-y-4">
      {/* ① 总览 */}
      <div className="rounded-xl border border-[#eef2f7] bg-white p-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="★ 总分" value={`${mine.total}`} sub={`/ ${fullScore}`} />
          <Stat label="★# 名次" value={`第 ${mine.rank} 名`} sub={`/ ${targets.length}`} medal={mine.rank} />
          {mine.grade && (
            <div>
              <div className="text-[11px] text-[#9CA3AF] mb-0.5">定级</div>
              <span className="px-2 py-0.5 rounded-full text-[12px] bg-party-soft text-[var(--party-primary)] font-medium">{mine.grade}</span>
            </div>
          )}
          <Stat label="计权" value={`${mine.normalScore}`} />
          <Stat label="加分" value={mine.bonus ? `+${mine.bonus}` : "0"} tone={mine.bonus ? "good" : undefined} />
          <Stat label="减分" value={mine.deduct ? `-${mine.deduct}` : "0"} tone={mine.deduct ? "bad" : undefined} />
        </div>
        {(prev || next) && (
          <div className="mt-2.5 text-[11px] text-[#9CA3AF]">
            {prev ? `距上一名(${prev.name})${r2(prev.total - mine.total)} 分` : ""}
            {prev && next ? " · " : ""}
            {next ? `领先下一名(${next.name})${r2(mine.total - next.total)} 分` : ""}
            {" —— 相邻名次分差小时排名波动属正常,重点看分数结构。"}
          </div>
        )}
      </div>

      {/* ② 雷达(维度 ≥3)/ 横条(维度不足) */}
      <div className="rounded-xl border border-[#eef2f7] bg-white">
        <div className="px-4 py-2.5 border-b border-[#eef2f7] text-[12px] text-[#6B7280]">
          维度得分率画像(本单位 vs 全体平均)· 指标扩展后维度自动细分
        </div>
        {dimRows.length >= 3 ? (
          <div className="h-[320px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={dimRows.map((d) => ({ dim: d.label, 本单位: d.rate, 全体平均: d.avgRate }))}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12, fill: "#475467" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Radar name="本单位" dataKey="本单位" stroke="#C8001E" fill="#C8001E" fillOpacity={0.28} />
                <Radar name="全体平均" dataKey="全体平均" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.12} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {dimRows.map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <span className="text-[#172033]">{d.label}</span>
                  <span className="text-[#475467]">
                    {d.score} / {d.full}
                    <span className="text-[11px] text-[#9CA3AF]">(得分率 {d.rate}% · 平均 {d.avgRate}%)</span>
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${d.rate}%`, backgroundColor: "var(--party-primary)", opacity: 0.85 }} />
                  {/* 平均线 */}
                  <div className="absolute top-0 h-full w-0.5 bg-[#64748b]" style={{ left: `${d.avgRate}%` }} title={`全体平均 ${d.avgRate}%`} />
                </div>
              </div>
            ))}
            {dimRows.length > 0 && <div className="text-[11px] text-[#9CA3AF]">竖线 = 全体平均;维度 ≥3 个时自动切换雷达图。</div>}
          </div>
        )}
      </div>

      {/* ③ 体检报告表:分组 + ●得分 + ●# 单项排名 */}
      <ReportTable mine={mine} meta={meta} ranks={ranks} unitCount={targets.length} />

      {/* ④ 短板诊断:规则版 + AI 生成 */}
      <IssuesCard key={mine.ref} sections={issues} unitName={mine.name} summary={checkupSummaryForAi(issueInput)} />

      {/* ⑤ 历次结果对比:历年导入(2023-2025)+ 季度快照 + 当前,名次折线 */}
      <TrendCard unitName={mine.name} mineRef={mine.ref} current={mine} snapshots={snapshots} unitCount={targets.length} />
    </div>
  );
}

function Stat({ label, value, sub, tone, medal }: { label: string; value: string; sub?: string; tone?: "good" | "bad"; medal?: number }) {
  const m = medal ? medalStyle(medal) : null;
  return (
    <div>
      <div className="text-[11px] text-[#9CA3AF] mb-0.5">{label}</div>
      <div
        className={`text-xl font-extrabold leading-tight ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-[#172033]"}`}
        style={m ? { color: m.text } : undefined}
      >
        {value}
        {sub && <span className="text-[12px] font-normal text-[#9CA3AF] ml-0.5">{sub}</span>}
      </div>
    </div>
  );
}

/** 分组体检报告表(结构同排名页展开,多一列 ●# 单项排名)。 */
function ReportTable({
  mine,
  meta,
  ranks,
  unitCount,
}: {
  mine: RoundTargetResult;
  meta: Map<string, LeafMeta>;
  ranks: Map<string, number>;
  unitCount: number;
}) {
  const grouped = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, LeafMeta[]>();
    for (const m of meta.values()) {
      if (!byGroup.has(m.groupLabel)) {
        byGroup.set(m.groupLabel, []);
        order.push(m.groupLabel);
      }
      byGroup.get(m.groupLabel)!.push(m);
    }
    return order.map((label) => ({ label, leaves: byGroup.get(label)! }));
  }, [meta]);

  return (
    <div className="rounded-xl border border-[#eef2f7] bg-white">
      <div className="px-4 py-2.5 border-b border-[#eef2f7] text-[12px] text-[#6B7280]">
        体检报告表 · ● 每项得分 + ●# 单项名次(减分项名次=扣分多者靠前,与打分页一致;并列同名次)
      </div>
      <div className="p-4 space-y-3">
        {grouped.map((grp) => {
          const isDedGroup = grp.leaves.every((l) => l.kind === "deduction");
          const isBonusGroup = grp.leaves.every((l) => l.kind === "bonus");
          const subtotal = r2(grp.leaves.reduce((a, l) => a + (mine.leafScores[l.code] ?? 0), 0));
          const groupFull = r2(grp.leaves.reduce((a, l) => a + (l.weight || 0), 0));
          return (
            <div key={grp.label}>
              <div className="flex items-center gap-2 text-[12px] font-medium text-[#172033] border-b border-[#f1f5f9] pb-1 mb-1">
                <span className="flex-1 truncate">{grp.label}</span>
                <span className={isDedGroup && subtotal > 0 ? "text-red-500" : isBonusGroup && subtotal > 0 ? "text-emerald-600" : ""}>
                  Σ {isDedGroup ? (subtotal > 0 ? `-${subtotal}` : 0) : isBonusGroup ? `+${subtotal}` : subtotal}
                  {!isDedGroup && !isBonusGroup && <span className="text-[10px] font-normal text-[#9CA3AF]"> / {groupFull}</span>}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
                {grp.leaves.map((m) => {
                  const sc = mine.leafScores[m.code] ?? 0;
                  const isDed = m.kind === "deduction";
                  const lostBad = !isDed && m.kind === "normal" && (m.weight || 0) > 0 && sc / m.weight < 0.6;
                  return (
                    <div key={m.code} className="flex items-center gap-2 text-[12px]">
                      <span className="flex-1 text-[#475467] truncate" title={m.label}>
                        {m.label}
                        {isDed && <span className="ml-1 text-[10px] text-red-500">减</span>}
                        {m.kind === "bonus" && <span className="ml-1 text-[10px] text-emerald-600">加</span>}
                      </span>
                      <span className={`font-medium w-16 text-right ${isDed && sc > 0 ? "text-red-500" : lostBad ? "text-amber-600" : "text-[#172033]"}`}>
                        {isDed ? (sc > 0 ? `-${r2(sc)}` : 0) : r2(sc)}
                        <span className="text-[10px] text-[#9CA3AF]"> / {isDed ? `上限${m.weight}` : m.weight}</span>
                      </span>
                      <span className="w-14 text-right text-[11px] text-[#9CA3AF] flex-shrink-0">#{ranks.get(m.code) ?? "-"}/{unitCount}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 短板诊断:左=系统规则建议(常驻)/ 右=AI 生成建议(明显标识;AI 挂了左栏不受影响)。 */
function IssuesCard({ sections, unitName, summary }: { sections: IssueSection[]; unitName: string; summary: string }) {
  const [aiText, setAiText] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => assessmentApi.generateCheckupIssues({ unitName, summary }),
    onSuccess: (r) => setAiText(r.issues),
    onError: (e) => toast.error(assessmentErrorMessage(e, "AI 生成失败,左侧系统建议不受影响,可稍后重试")),
  });
  const TONE: Record<IssueSection["tone"], string> = {
    bad: "text-red-500",
    warn: "text-amber-600",
    good: "text-emerald-600",
  };
  return (
    <div className="rounded-xl border border-[#eef2f7] bg-white">
      <div className="px-4 py-2.5 border-b border-[#eef2f7] text-[12px] text-[#6B7280]">短板诊断与建议</div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 左:系统建议(规则版,按当前录入自动生成,常驻) */}
        <div className="space-y-3">
          <div className="text-[12px] font-medium text-[#475467]">系统建议(按当前录入自动生成)</div>
          {sections.length === 0 && <div className="text-[13px] text-[#9CA3AF]">暂无明显短板(或还没有录入数据)。</div>}
          {sections.map((s) => (
            <div key={s.title}>
              <div className={`text-[13px] font-medium mb-1 ${TONE[s.tone]}`}>{s.title}</div>
              <ul className="space-y-0.5">
                {s.items.map((it) => (
                  <li key={it} className="text-[12px] text-[#475467] pl-3 relative">
                    <span className="absolute left-0 top-[7px] w-1 h-1 rounded-full bg-[#c4cbd6]" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 右:AI 生成建议(明显标识 AI 产出;不落库,随点随生成) */}
        <div className="rounded-lg border border-[#D6E6FB] bg-[#F6FAFF] p-3 min-h-[160px] flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#1A56A8] text-white">
              <Sparkles className="w-2.5 h-2.5" /> AI 生成
            </span>
            <span className="text-[12px] font-medium text-[#1A56A8]">AI 诊断建议</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
              className="px-2.5 py-1 rounded-md text-[12px] text-white font-medium disabled:opacity-60"
              style={{ backgroundColor: "#1A56A8" }}
              title="按本单位体检数据(总分/名次/维度得分率/失分点)让 AI 撰写「主要短板 + 改进建议」"
            >
              {gen.isPending ? "生成中…" : aiText ? "重新生成" : "生成"}
            </button>
          </div>
          {gen.isPending ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-[12px] text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin text-[#1A56A8]" /> AI 撰写中(约 10~30 秒)…
            </div>
          ) : aiText ? (
            <>
              <div className="text-[12px] text-[#374151] whitespace-pre-wrap leading-relaxed">{aiText}</div>
              <div className="mt-2 pt-2 border-t border-[#E3EEFB] text-[10px] text-[#9CA3AF]">
                内容由 AI 按体检数据生成,仅供参考,请结合实际研判。
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[12px] text-[#9CA3AF] text-center px-4">
              点右上「生成」,AI 会按本单位的体检数据撰写「主要短板 + 改进建议」。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TrendRow {
  key: string;
  label: string;
  total: number;
  rank: number;
  count: number;
  /** 历年导入数据(2023-2025,《3年考核结果.xlsx》,总分为百分制口径) */
  hist?: boolean;
}

/** 折线图 tooltip:名次 + 总分 + 历年标记。 */
function TrendTip({ active, payload, label }: { active?: boolean; payload?: { payload: TrendRow }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[12px] shadow-sm">
      <div className="font-medium text-[#172033]">{label}</div>
      <div className="text-[#475467]">
        ★# 第 {p.rank} 名 / {p.count} · 总分 {p.total}
      </div>
      {p.hist && <div className="text-[10px] text-[#9CA3AF]">历年考核导入数据(百分制)</div>}
    </div>
  );
}

/**
 * 历次结果对比:历年导入(2023-2025 真实考核,单位按名称匹配)+ 季度快照 + 当前实时,
 * 名次折线图(Y 轴反转,第 1 名在顶,越高越好)。总分口径跨年不同(百分制 vs 本表满分),
 * 名次可比 —— 折线画名次,总分放 tooltip。
 */
function TrendCard({
  unitName,
  mineRef,
  current,
  snapshots,
  unitCount,
}: {
  unitName: string;
  mineRef: string;
  current: RoundTargetResult;
  snapshots: ResultSnapshot[];
  unitCount: number;
}) {
  const rows = useMemo<TrendRow[]>(() => {
    // ① 历年导入(shared/lib/ranking-demo,来自《3年考核结果.xlsx》):只用 2023-2025 真实年份(2026 为模拟,不用);
    //    体检单单位名(党委/党总支)与导入单位名(行政简称)按包含关系匹配,匹配不到则不显示历年段。
    const years: TrendRow[] = [];
    const { name, matched } = resolveUnitName([unitName]);
    if (matched) {
      for (let yi = 0; yi < 3; yi++) {
        const ranking = rankingForYearIndex(yi);
        const hit = ranking.find((u) => u.name === name);
        if (hit) {
          years.push({
            key: `y${ASSESSMENT_YEARS[yi]}`,
            label: `${ASSESSMENT_YEARS[yi]}年`,
            total: hit.score,
            rank: hit.rank,
            count: ranking.length,
            hist: true,
          });
        }
      }
    }
    // ② 季度快照(名次分母用快照当时的单位数,不拿当前数歪曲历史相对位置)
    const snaps = [...snapshots]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => {
        const all = parseSnapshotResults(s).targets ?? [];
        const t = all.find((x) => x.ref === mineRef);
        return t ? { key: s.id, label: s.label, total: t.total, rank: t.rank, count: all.length } : null;
      })
      .filter((x): x is TrendRow => !!x);
    // ③ 当前实时
    return [...years, ...snaps, { key: "__now__", label: "当前", total: current.total, rank: current.rank, count: unitCount }];
  }, [unitName, snapshots, mineRef, current, unitCount]);

  if (rows.length < 2) return null; // 只有「当前」一个点,画不成趋势
  const maxCount = Math.max(...rows.map((r) => r.count), 2);

  return (
    <div className="rounded-xl border border-[#eef2f7] bg-white">
      <div className="px-4 py-2.5 border-b border-[#eef2f7] text-[12px] text-[#6B7280]">
        历次结果对比(历年 → 季度快照 → 当前)· 折线为名次,第 1 名在顶
      </div>
      <div className="h-[230px] px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 14, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval={0} />
            <YAxis
              reversed
              domain={[1, maxCount]}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <ChartTooltip content={<TrendTip />} />
            <Line
              type="monotone"
              dataKey="rank"
              stroke="var(--party-primary)"
              strokeWidth={2}
              dot={{ r: 3.5, fill: "var(--party-primary)", strokeWidth: 0 }}
              label={{ position: "top", fontSize: 10, fill: "#475467", formatter: (v: number) => `#${v}` }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="px-4 pb-3 text-[11px] text-[#9CA3AF]">
        {rows.some((r) => r.hist) ? "2023–2025 为历年考核导入数据(总分为百分制口径,名次跨年可比);" : ""}
        悬停看各时点总分与名次。
      </div>
    </div>
  );
}
