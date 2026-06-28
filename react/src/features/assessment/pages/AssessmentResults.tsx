import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, ChevronDown, ChevronRight, PenLine, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useAuth } from "@/stores/auth";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseRoundIndicators,
  parseSnapshotResults,
  type AssessmentRound,
  type ResultSnapshot,
  type RoundResults,
  type RoundTargetResult,
} from "../api";
import { barPct, leafMetaMap, medalStyle, type LeafMeta } from "../lib/ranking";

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
  // 一表一轮:取该考核表的轮次(排名实时,不再依赖「已计算」状态)
  const round = list.find((r) => r.status === "done") ?? list[0];
  const back = () => navigate("/admin/assessment/schemes");
  if (!round) {
    return (
      <Shell onBack={back}>
        <Empty text="这张考核表还没发起考核。回考核表点「考核打分」开始录分,排名实时显示。" />
      </Shell>
    );
  }
  return <ResultsInner key={round.id} round={round} onBack={back} />;
}

function ResultsInner({ round, onBack }: { round: AssessmentRound; onBack: () => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();

  const indicators = useMemo(() => parseRoundIndicators(round), [round]);
  const leafMeta = useMemo(() => leafMetaMap(indicators), [indicators]);
  // 「当前」时点 = 实时榜(读已保存录入即时算,不依赖手动计算)。快照时点仍读冻结副本。
  const liveQuery = useQuery({
    queryKey: ["assess-live", round.id],
    queryFn: () => assessmentApi.liveResults(round.id),
    staleTime: 2000,
  });
  const currentResults = useMemo<RoundResults>(() => liveQuery.data ?? {}, [liveQuery.data]);
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
    <Shell onBack={onBack} title={round.name} sub={`${round.year} 年`}>
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
              : "本轮还没有录入,暂无排名。回打分页给各单位录入分数后,这里实时显示;也可在上方「生成季度快照」定格留档。"
          }
        />
      ) : (
        <RankingTab round={round} targets={targets} leafMeta={leafMeta} readOnly={!!activeSnap} />
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
  children,
}: {
  onBack: () => void;
  title?: string;
  sub?: string;
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

function bar(rank: number): CSSProperties {
  const m = medalStyle(rank);
  return m ? { backgroundImage: m.badge } : { backgroundColor: "var(--party-primary)", opacity: 0.55 };
}

// ─── ② 考核排名(全表官方总分:计权 + 加分 − 减分,逐级封顶后按总分排名/定级)───
function RankingTab({
  round,
  targets,
  leafMeta,
  readOnly,
}: {
  round: AssessmentRound;
  targets: RoundTargetResult[];
  leafMeta: Map<string, LeafMeta>;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const r2 = (x: number) => Math.round(x * 100) / 100;
  // 满分基准 = 计权(normal)叶子分值之和(加分=额外、减分=扣减,不计入满分)
  const fullScore = useMemo(
    () => r2([...leafMeta.values()].filter((m) => m.kind === "normal").reduce((s, m) => s + (m.weight || 0), 0)),
    [leafMeta],
  );
  const leafList = useMemo(() => [...leafMeta.keys()], [leafMeta]);
  const rows = useMemo(() => [...targets].sort((a, b) => a.rank - b.rank), [targets]);
  const maxTotal = rows[0]?.total ?? 0;
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[#eef2f7] bg-white">
      <div className="px-4 py-2.5 border-b border-[#eef2f7] text-[12px] text-[#6B7280]">
        全表总分排名(计权 + 加分 − 减分,逐级封顶后定级)· 点单位展开看每项得分
        {readOnly ? "(历史定格,只读)" : ""}
      </div>
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
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {r.grade && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-party-soft text-[var(--party-primary)]">{r.grade}</span>}
                      <span className="text-[14px] font-bold text-[#172033]">
                        {r.total}
                        <span className="text-[11px] font-normal text-[#9CA3AF]"> / {fullScore}</span>
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#9CA3AF]">
                    计权 {r.normalScore}
                    {r.bonus ? <span className="text-emerald-600"> + 加分 {r.bonus}</span> : null}
                    {r.deduct ? <span className="text-red-500"> − 减分 {r.deduct}</span> : null}
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barPct(r.total, maxTotal)}%`, ...bar(r.rank) }} />
                  </div>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />}
              </button>
              {open && (
                <div className="px-4 pb-3 pl-14 space-y-1">
                  {leafList.map((c) => {
                    const meta = leafMeta.get(c);
                    const sc = r.leafScores[c] ?? 0;
                    const isDed = meta?.kind === "deduction";
                    return (
                      <div key={c} className="flex items-center gap-2 text-[12px]">
                        <span className="flex-1 text-[#475467] truncate" title={meta?.groupLabel}>
                          {meta?.label ?? c}
                          {isDed && <span className="ml-1 text-[10px] text-red-500">减</span>}
                          {meta?.kind === "bonus" && <span className="ml-1 text-[10px] text-emerald-600">加</span>}
                        </span>
                        <span className={`font-medium w-16 text-right ${isDed && sc > 0 ? "text-red-500" : "text-[#172033]"}`}>
                          {isDed ? (sc > 0 ? `-${r2(sc)}` : 0) : r2(sc)}
                          <span className="text-[10px] text-[#9CA3AF]"> / {isDed ? `上限${meta?.weight ?? 0}` : meta?.weight ?? 0}</span>
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
