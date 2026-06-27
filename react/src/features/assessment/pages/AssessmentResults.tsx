import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Camera, ChevronDown, ChevronRight, Minus, PenLine, Trash2, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useAuth } from "@/stores/auth";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseRoundIndicators,
  parseRoundResults,
  parseSnapshotResults,
  type AssessmentRound,
  type IndicatorNode,
  type ResultSnapshot,
  type RoundResults,
  type RoundTargetResult,
} from "../api";
import { barPct, leafMetaMap, medalStyle, rankBySubtotal, responsibleLeafCodes, type LeafMeta } from "../lib/ranking";

const INPUT =
  "w-full px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/** ISO 时间 → 「yyyy-mm-dd hh:mm」(与项目其它处一致的 slice 口径)。 */
function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

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
        <Empty text="这张考核表还没发起考核。回考核表点「考核打分」开始录分、计算后再看排名。" />
      </Shell>
    );
  }
  return <ResultsInner key={round.id} round={round} onBack={back} />;
}

function ResultsInner({ round, onBack }: { round: AssessmentRound; onBack: () => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: "ranking" | "board" = params.get("tab") === "board" ? "board" : "ranking";
  const setTab = (t: "ranking" | "board") => setParams({ tab: t }, { replace: true });

  const indicators = useMemo(() => parseRoundIndicators(round), [round]);
  const leafMeta = useMemo(() => leafMetaMap(indicators), [indicators]);
  const currentResults = useMemo(() => parseRoundResults(round), [round]);
  const isManager = (me?.isPlatformAdmin || me?.permissions?.includes("assessment:manage")) ?? false;

  // 结果快照(季度定格):按时间正序
  const snapsQuery = useQuery({
    queryKey: ["assessment", "round", round.id, "snapshots"],
    queryFn: () => assessmentApi.listSnapshots(round.id),
  });
  const snaps = useMemo(() => snapsQuery.data ?? [], [snapsQuery.data]);

  // 时点:"current"(实时)或某快照 id
  const [viewId, setViewId] = useState<string>("current");
  const activeSnap = viewId === "current" ? null : snaps.find((s) => s.id === viewId) ?? null;
  const viewResults = activeSnap ? parseSnapshotResults(activeSnap) : currentResults;
  const targets = viewResults.targets ?? [];

  // 对比基准 = 选中时点的「上一个时点」(快照按时间 asc,其后接「当前」)
  const prevLabel = useMemo(() => {
    if (viewId === "current") return snaps[snaps.length - 1]?.label ?? null;
    const i = snaps.findIndex((s) => s.id === viewId);
    return i > 0 ? snaps[i - 1].label : null;
  }, [viewId, snaps]);
  const prevRankByRef = useMemo(() => {
    let prev: RoundResults | null = null;
    if (viewId === "current") {
      const last = snaps[snaps.length - 1];
      prev = last ? parseSnapshotResults(last) : null;
    } else {
      const i = snaps.findIndex((s) => s.id === viewId);
      prev = i > 0 ? parseSnapshotResults(snaps[i - 1]) : null;
    }
    const m = new Map<string, number>();
    for (const t of prev?.targets ?? []) m.set(t.ref, t.rank);
    return m;
  }, [viewId, snaps]);

  const genSnapshot = useMutation({
    mutationFn: (input: { label: string; note?: string }) => assessmentApi.createSnapshot(round.id, input),
    onSuccess: (snap) => {
      toast.success(`已生成结果快照「${snap.label}」`);
      qc.invalidateQueries({ queryKey: ["assessment", "round", round.id, "snapshots"] });
      qc.invalidateQueries({ queryKey: ["assessment", "rounds", round.schemeId] });
      setViewId(snap.id);
      setGenOpen(false);
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "生成快照失败")),
  });
  const delSnapshot = useMutation({
    mutationFn: (id: string) => assessmentApi.deleteSnapshot(id),
    onSuccess: (_r, id) => {
      toast.success("已删除该结果快照");
      if (viewId === id) setViewId("current");
      qc.invalidateQueries({ queryKey: ["assessment", "round", round.id, "snapshots"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "删除失败")),
  });
  const [genOpen, setGenOpen] = useState(false);

  return (
    <Shell onBack={onBack} title={round.name} sub={`${round.year} 年`} tab={tab} setTab={setTab}>
      <SnapshotBar
        snaps={snaps}
        viewId={viewId}
        onView={setViewId}
        isManager={isManager}
        onGenerate={() => setGenOpen(true)}
        onDelete={(id) => {
          if (window.confirm("删除这份结果快照?\n只删这份历史定格,不影响打分与当前结果。")) delSnapshot.mutate(id);
        }}
        activeSnap={activeSnap}
      />
      {targets.length === 0 ? (
        <Empty
          text={
            activeSnap
              ? "这份快照没有数据。"
              : "本轮还没有结果。回打分页点「计算 ★ 总分」,或在上方点「生成季度快照」定格当前结果后查看。"
          }
        />
      ) : tab === "ranking" ? (
        <RankingTab
          round={round}
          indicators={indicators}
          targets={targets}
          leafMeta={leafMeta}
          meId={me?.id}
          isManager={isManager}
          readOnly={!!activeSnap}
        />
      ) : (
        <BoardTab targets={targets} prevRankByRef={prevRankByRef} prevLabel={prevLabel} />
      )}

      {genOpen && (
        <GenerateSnapshotDialog
          defaultLabel={`${snaps.length + 1}季度结果`}
          pending={genSnapshot.isPending}
          onSubmit={(label, note) => genSnapshot.mutate({ label, note })}
          onClose={() => setGenOpen(false)}
        />
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

/** 时点切换条:当前(实时)+ 历次快照 chips;管理员可生成 / 删除快照。 */
function SnapshotBar({
  snaps,
  viewId,
  onView,
  isManager,
  onGenerate,
  onDelete,
  activeSnap,
}: {
  snaps: ResultSnapshot[];
  viewId: string;
  onView: (id: string) => void;
  isManager: boolean;
  onGenerate: () => void;
  onDelete: (id: string) => void;
  activeSnap: ResultSnapshot | null;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-[#6B7280] mr-0.5">查看时点</span>
        <TimeChip active={viewId === "current"} onClick={() => onView("current")} label="当前(实时)" />
        {snaps.map((s) => (
          <div key={s.id} className="relative group">
            <TimeChip active={viewId === s.id} onClick={() => onView(s.id)} label={s.label} />
            {isManager && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-[#e2e8f0] text-[#94a3b8] hover:text-red-600 hover:border-red-300 hidden group-hover:flex items-center justify-center shadow-sm"
                title="删除该快照"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex-1" />
        {isManager && (
          <button
            type="button"
            onClick={onGenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-sm font-medium flex-shrink-0"
            style={{ backgroundColor: "var(--party-primary)" }}
            title="用当前最新录入算一次,定格成一份只读结果(打分继续在同一轮累积)"
          >
            <Camera className="w-4 h-4" /> 生成季度快照
          </button>
        )}
      </div>
      {activeSnap && (
        <div className="mt-2 text-[12px] rounded-md px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-800">
          <span className="font-semibold">📌 {activeSnap.label}</span>
          <span className="text-amber-700">
            {" "}
            · 定格于 {fmtTime(activeSnap.createdAt)}
            {activeSnap.note ? ` · ${activeSnap.note}` : ""};这是只读历史结果,打分仍在「当前」继续累积。
          </span>
        </div>
      )}
    </div>
  );
}

function TimeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
        active ? "text-white border-transparent" : "text-[#475467] bg-white border-[#dce4ef] hover:border-[var(--party-primary)]/50"
      }`}
      style={active ? { backgroundColor: "var(--party-primary)" } : undefined}
    >
      {label}
    </button>
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

/** 较上一时点的名次升降(正=上升)。prevRank 缺失=该对象上期不存在(新)。 */
function DeltaBadge({ rank, prevRank }: { rank: number; prevRank: number | undefined }) {
  if (prevRank === undefined) return <span className="text-[10px] text-[#94a3b8] flex-shrink-0">新</span>;
  const d = prevRank - rank;
  if (d === 0)
    return (
      <span className="inline-flex items-center text-[10px] text-[#94a3b8] flex-shrink-0" title="名次未变">
        <Minus className="w-3 h-3" />
      </span>
    );
  if (d > 0)
    return (
      <span className="inline-flex items-center text-[10px] text-emerald-600 font-medium flex-shrink-0" title={`较上一时点上升 ${d} 名`}>
        <ArrowUp className="w-3 h-3" />
        {d}
      </span>
    );
  return (
    <span className="inline-flex items-center text-[10px] text-red-500 font-medium flex-shrink-0" title={`较上一时点下降 ${-d} 名`}>
      <ArrowDown className="w-3 h-3" />
      {-d}
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
  readOnly,
}: {
  round: AssessmentRound;
  indicators: IndicatorNode[];
  targets: RoundTargetResult[];
  leafMeta: Map<string, LeafMeta>;
  meId: string | undefined;
  isManager: boolean;
  readOnly: boolean;
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
          {scopeMine ? `按你负责的 ${codes.size} 项指标` : `按全部 ${codes.size} 项指标`}合计排名 · 点单位展开看每项得分
          {readOnly ? "(历史定格,只读)" : ",分数不对点「去完善」"}
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
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/assessment/rounds/${round.id}?leaf=${encodeURIComponent(c)}`)}
                              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--party-primary)] hover:underline flex-shrink-0"
                              title="去打分页完善该指标"
                            >
                              <PenLine className="w-3 h-3" /> 去完善
                            </button>
                          )}
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

// ─── ③ 各单位排名(全量总分 + 邻近 + 历次升降) ───
function BoardTab({
  targets,
  prevRankByRef,
  prevLabel,
}: {
  targets: RoundTargetResult[];
  prevRankByRef: Map<string, number>;
  prevLabel: string | null;
}) {
  const sorted = useMemo(() => [...targets].sort((a, b) => a.rank - b.rank), [targets]);
  const maxTotal = useMemo(() => Math.max(1, ...sorted.map((t) => t.total)), [sorted]);
  const [sel, setSel] = useState<string>("");
  const idx = sorted.findIndex((t) => t.ref === sel);
  const selRow = idx >= 0 ? sorted[idx] : null;
  const showDelta = prevRankByRef.size > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-xl border border-[#eef2f7] bg-white">
        {showDelta && prevLabel && (
          <div className="px-4 py-2 border-b border-[#eef2f7] text-[11px] text-[#6B7280]">
            <span className="inline-flex items-center gap-0.5 text-emerald-600">
              <ArrowUp className="w-3 h-3" />升
            </span>{" "}
            /{" "}
            <span className="inline-flex items-center gap-0.5 text-red-500">
              <ArrowDown className="w-3 h-3" />降
            </span>{" "}
            = 较「{prevLabel}」的名次变化
          </div>
        )}
        <div className="divide-y divide-[#f1f5f9]">
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
                    {showDelta && <DeltaBadge rank={t.rank} prevRank={prevRankByRef.get(t.ref)} />}
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

/** 生成季度快照对话框:命名 + 可选备注。 */
function GenerateSnapshotDialog({
  defaultLabel,
  pending,
  onSubmit,
  onClose,
}: {
  defaultLabel: string;
  pending: boolean;
  onSubmit: (label: string, note?: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>生成季度结果快照</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-[12px] text-[#6B7280]">
            用当前最新录入算一次,定格成一份<b>只读结果</b>(如「1季度结果」)。打分继续在同一轮累积,随时可再生成下一份对比。
          </p>
          <label className="block">
            <div className="text-[13px] font-medium text-[#374151] mb-1">快照名称</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如:1季度结果 / 上半年结果" className={INPUT} />
          </label>
          <label className="block">
            <div className="text-[13px] font-medium text-[#374151] mb-1">备注(选填)</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如:截至 3 月底数据" className={INPUT} />
          </label>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-sm text-[#475467] border border-[#dce4ef] hover:bg-[#f8fafc]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!label.trim() || pending}
            onClick={() => onSubmit(label.trim(), note.trim() || undefined)}
            className="px-3 py-2 rounded-md text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            {pending ? "生成中…" : "生成快照"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
