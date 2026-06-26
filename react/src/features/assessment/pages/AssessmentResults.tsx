import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, ChevronDown, ChevronRight, PenLine, Trophy } from "lucide-react";
import { useAuth } from "@/stores/auth";
import { assessmentApi, parseRoundIndicators, parseRoundResults, type AssessmentRound, type IndicatorNode, type RoundTargetResult } from "../api";
import { barPct, leafMetaMap, medalStyle, rankBySubtotal, responsibleLeafCodes, type LeafMeta } from "../lib/ranking";

export default function AssessmentResults() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["assessment", "rounds", id],
    queryFn: () => assessmentApi.listRounds(id as string),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-12 text-center text-[#9CA3AF]">加载中…</div>;
  const list = data ?? [];
  // 取最新「已计算」轮次;没有 done 的退而取最新一轮(会提示未计算)
  const round = list.find((r) => r.status === "done") ?? list[0];
  const back = () => navigate("/admin/assessment/schemes");
  if (!round) {
    return (
      <Shell onBack={back}>
        <Empty text="这张考核表还没发起考核。回考核表点「发起考核」开一轮、录分、计算后再看排名。" />
      </Shell>
    );
  }
  return <ResultsInner key={round.id} round={round} onBack={back} />;
}

function ResultsInner({ round, onBack }: { round: AssessmentRound; onBack: () => void }) {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: "ranking" | "board" = params.get("tab") === "board" ? "board" : "ranking";
  const setTab = (t: "ranking" | "board") => setParams({ tab: t }, { replace: true });

  const indicators = useMemo(() => parseRoundIndicators(round), [round]);
  const results = useMemo(() => parseRoundResults(round), [round]);
  const targets = results.targets ?? [];
  const leafMeta = useMemo(() => leafMetaMap(indicators), [indicators]);
  const computed = targets.length > 0;

  return (
    <Shell onBack={onBack} title={round.name} sub={`${round.year} 年`} tab={tab} setTab={setTab}>
      {!computed ? (
        <Empty text="本轮还没计算分数。回打分页点「计算 ★ 总分」后再看排名。" />
      ) : tab === "ranking" ? (
        <RankingTab
          round={round}
          indicators={indicators}
          targets={targets}
          leafMeta={leafMeta}
          meId={me?.id}
          isManager={(me?.isPlatformAdmin || me?.permissions?.includes("assessment:manage")) ?? false}
        />
      ) : (
        <BoardTab targets={targets} />
      )}
    </Shell>
  );
}

function Shell({
  onBack,
  title,
  sub,
  tab,
  setTab,
  children,
}: {
  onBack: () => void;
  title?: string;
  sub?: string;
  tab?: "ranking" | "board";
  setTab?: (t: "ranking" | "board") => void;
  children: ReactNode;
}) {
  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={onBack} className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]" title="返回考核表">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-[#172033] truncate">{title ?? "考核结果"}</div>
          {sub && <div className="text-[12px] text-[#6B7280]">{sub}</div>}
        </div>
        {tab && setTab && (
          <div className="flex rounded-md border border-[#dce4ef] overflow-hidden text-sm flex-shrink-0">
            <button
              type="button"
              onClick={() => setTab("ranking")}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${tab === "ranking" ? "text-white" : "text-[#475467] bg-white"}`}
              style={tab === "ranking" ? { backgroundColor: "var(--party-primary)" } : undefined}
            >
              <Trophy className="w-4 h-4" /> 考核排名
            </button>
            <button
              type="button"
              onClick={() => setTab("board")}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${tab === "board" ? "text-white" : "text-[#475467] bg-white"}`}
              style={tab === "board" ? { backgroundColor: "var(--party-primary)" } : undefined}
            >
              <BarChart3 className="w-4 h-4" /> 各单位排名
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center text-[#9CA3AF] rounded-xl border border-[#eef2f7] bg-white">{text}</div>;
}

/** 名次徽标(金/银/铜 圆牌,其余灰底数字)。 */
function RankBadge({ rank }: { rank: number }) {
  const m = medalStyle(rank);
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-bold flex-shrink-0"
      style={m ? { backgroundImage: m.badge, color: "#fff" } : { backgroundColor: "#f1f5f9", color: "#64748b" }}
    >
      {rank}
    </span>
  );
}

function bar(rank: number): CSSProperties {
  const m = medalStyle(rank);
  return m ? { backgroundImage: m.badge } : { backgroundColor: "var(--party-primary)", opacity: 0.55 };
}

// ─── ② 考核排名(按我负责的指标合计) ───
function RankingTab({
  round,
  indicators,
  targets,
  leafMeta,
  meId,
  isManager,
}: {
  round: AssessmentRound;
  indicators: IndicatorNode[];
  targets: RoundTargetResult[];
  leafMeta: Map<string, LeafMeta>;
  meId: string | undefined;
  isManager: boolean;
}) {
  const navigate = useNavigate();
  const myCodes = useMemo(() => responsibleLeafCodes(indicators, meId), [indicators, meId]);
  const hasMine = myCodes.size > 0;
  const [scopeMineRaw, setScopeMineRaw] = useState<boolean | null>(null);
  const scopeMine = scopeMineRaw ?? (hasMine && !isManager);
  const codes = useMemo(() => (scopeMine ? myCodes : new Set(leafMeta.keys())), [scopeMine, myCodes, leafMeta]);
  const codeList = useMemo(() => [...codes], [codes]);
  const rows = useMemo(() => rankBySubtotal(targets, codes, leafMeta), [targets, codes, leafMeta]);
  const maxScore = rows[0]?.subtotal ?? 0;
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[#eef2f7] bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#eef2f7] flex-wrap">
        <div className="text-[12px] text-[#6B7280]">
          {scopeMine ? `按你负责的 ${codes.size} 项指标` : `按全部 ${codes.size} 项指标`}合计排名 · 点单位展开看每项得分,分数不对点「去完善」
        </div>
        {hasMine && (
          <div className="flex rounded-md border border-[#dce4ef] overflow-hidden text-[12px] flex-shrink-0">
            <button
              type="button"
              onClick={() => setScopeMineRaw(true)}
              className={`px-2.5 py-1 ${scopeMine ? "text-white" : "text-[#475467] bg-white"}`}
              style={scopeMine ? { backgroundColor: "var(--party-primary)" } : undefined}
            >
              我负责的
            </button>
            <button
              type="button"
              onClick={() => setScopeMineRaw(false)}
              className={`px-2.5 py-1 ${!scopeMine ? "text-white" : "text-[#475467] bg-white"}`}
              style={!scopeMine ? { backgroundColor: "var(--party-primary)" } : undefined}
            >
              全部指标
            </button>
          </div>
        )}
      </div>

      {codes.size === 0 ? (
        <div className="py-12 text-center text-[#9CA3AF] text-[13px]">你在本轮没有负责的指标。切到「全部指标」查看。</div>
      ) : (
        <div className="divide-y divide-[#f1f5f9]">
          {rows.map((r) => {
            const open = expanded === r.ref;
            return (
              <div key={r.ref}>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === r.ref ? null : r.ref))}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8fafc] text-left"
                >
                  <RankBadge rank={r.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] text-[#172033] truncate">{r.name}</span>
                      <span className="text-[14px] font-bold text-[#172033] flex-shrink-0">
                        {r.subtotal}
                        <span className="text-[11px] font-normal text-[#9CA3AF]"> / {r.fullScore}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${barPct(r.subtotal, maxScore)}%`, ...bar(r.rank) }} />
                    </div>
                  </div>
                  {open ? <ChevronDown className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />}
                </button>
                {open && (
                  <div className="px-4 pb-3 pl-14 space-y-1">
                    {codeList.map((c) => {
                      const meta = leafMeta.get(c);
                      const sc = r.leafScores[c] ?? 0;
                      return (
                        <div key={c} className="flex items-center gap-2 text-[12px]">
                          <span className="flex-1 text-[#475467] truncate" title={meta?.groupLabel}>
                            {meta?.label ?? c}
                          </span>
                          <span className="text-[#172033] font-medium w-16 text-right">
                            {Math.round(sc * 100) / 100}
                            <span className="text-[10px] text-[#9CA3AF]"> / {meta?.weight ?? 0}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/assessment/rounds/${round.id}?leaf=${encodeURIComponent(c)}`)}
                            className="inline-flex items-center gap-0.5 text-[11px] text-[var(--party-primary)] hover:underline flex-shrink-0"
                            title="去打分页完善该指标"
                          >
                            <PenLine className="w-3 h-3" /> 去完善
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ③ 各单位排名(全量总分 + 邻近) ───
function BoardTab({ targets }: { targets: RoundTargetResult[] }) {
  const sorted = useMemo(() => [...targets].sort((a, b) => a.rank - b.rank), [targets]);
  const maxTotal = useMemo(() => Math.max(1, ...sorted.map((t) => t.total)), [sorted]);
  const [sel, setSel] = useState<string>("");
  const idx = sorted.findIndex((t) => t.ref === sel);
  const selRow = idx >= 0 ? sorted[idx] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-xl border border-[#eef2f7] bg-white divide-y divide-[#f1f5f9]">
        {sorted.map((t) => (
          <button
            key={t.ref}
            type="button"
            onClick={() => setSel(t.ref)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f8fafc] ${t.ref === sel ? "bg-party-soft" : ""}`}
          >
            <RankBadge rank={t.rank} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] text-[#172033] truncate">{t.name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {t.grade && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-party-soft text-[var(--party-primary)]">{t.grade}</span>}
                  <span className="text-[14px] font-bold text-[#172033]">{t.total}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${barPct(t.total, maxTotal)}%`, ...bar(t.rank) }} />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#eef2f7] bg-white p-4 h-fit">
        <div className="text-[13px] font-semibold text-[#172033] mb-2">邻近排名</div>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[13px] border border-[#dce4ef] rounded-md bg-white mb-3"
        >
          <option value="">选一个单位看它的邻近名次…</option>
          {sorted.map((t) => (
            <option key={t.ref} value={t.ref}>
              {t.rank}. {t.name}
            </option>
          ))}
        </select>
        {!selRow ? (
          <div className="text-[12px] text-[#9CA3AF] text-center py-6">选单位后,这里显示「前三名 + 高它一名 / 它 / 低它一名」。</div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-[#9CA3AF] mb-1">前三名</div>
              <div className="space-y-1">
                {sorted.slice(0, 3).map((t) => (
                  <NeighborRow key={t.ref} t={t} highlight={t.ref === selRow.ref} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#9CA3AF] mb-1">它的位置</div>
              <div className="space-y-1">
                {idx > 0 && <NeighborRow t={sorted[idx - 1]} label="高它一名" />}
                <NeighborRow t={selRow} highlight label="它" />
                {idx < sorted.length - 1 && <NeighborRow t={sorted[idx + 1]} label="低它一名" />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NeighborRow({ t, highlight, label }: { t: RoundTargetResult; highlight?: boolean; label?: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${highlight ? "bg-party-soft ring-1 ring-[var(--party-primary)]/30" : "bg-[#f8fafc]"}`}>
      <RankBadge rank={t.rank} />
      <span className="min-w-0 flex-1 text-[13px] text-[#172033] truncate">{t.name}</span>
      {label && <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">{label}</span>}
      <span className="text-[13px] font-bold text-[#172033] flex-shrink-0">{t.total}</span>
    </div>
  );
}
