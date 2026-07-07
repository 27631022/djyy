import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ClipboardCheck,
  Lock,
  LockOpen,
  PencilLine,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { MarkdownView } from "@/features/knowledge";
import {
  showcaseApi,
  showcaseErrMsg,
  showcaseFileUrl,
  STAGE_STATUS_CHIP,
  STAGE_STATUS_LABEL,
  type StageDetail,
} from "../api";
import { BlocksRenderer } from "../components/BlocksRenderer";
import { EntryCard } from "../components/EntryCard";
import { RankingBoard } from "../components/RankingBoard";
import { ReviewBar } from "../components/ReviewBar";
import { fmtNumber } from "../tools/shared";

/** 晒台详情(/showcase/stages/:id):台头 + 排位榜 + 作品流 + 台主待审区。外壳取数 + key 重挂载内层。 */
export default function ShowcaseStage() {
  const { id = "" } = useParams();
  const stage = useQuery({
    queryKey: ["showcase", "stage", id],
    queryFn: () => showcaseApi.getStage(id),
    enabled: !!id,
  });

  if (stage.isLoading) return <PageShell><div className="py-24 text-center text-sm text-gray-400">加载中…</div></PageShell>;
  if (stage.isError || !stage.data)
    return (
      <PageShell>
        <div className="py-24 text-center text-sm text-gray-400">
          {showcaseErrMsg(stage.error, "晒台不存在或无权查看")}
        </div>
      </PageShell>
    );
  return <StageView key={stage.data.id} stage={stage.data} />;
}

function PageShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/showcase")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 先锋晒场
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pb-16">{children}</div>
    </div>
  );
}

function StageView({ stage: s }: { stage: StageDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ranking" | "entries">("ranking");
  const [entrySort, setEntrySort] = useState<"rank" | "latest">("rank");

  const ranking = useQuery({
    queryKey: ["showcase", "ranking", s.id],
    queryFn: () => showcaseApi.getRanking(s.id),
    enabled: ["published", "closed"].includes(s.status) || s.canReview,
  });
  const entries = useQuery({
    queryKey: ["showcase", "entries", s.id, entrySort],
    queryFn: () => showcaseApi.listEntries(s.id, { sort: entrySort, pageSize: 50 }),
    enabled: tab === "entries",
  });
  const pendingEntries = useQuery({
    queryKey: ["showcase", "entries", s.id, "pending"],
    queryFn: () => showcaseApi.listEntries(s.id, { status: "pending", pageSize: 50 }),
    enabled: s.canReview && s.pendingEntryCount > 0,
  });

  const closeMut = useMutation({
    mutationFn: () => (s.status === "closed" ? showcaseApi.reopenStage(s.id) : showcaseApi.closeStage(s.id)),
    onSuccess: () => {
      toast.success(s.status === "closed" ? "晒台已重开" : "晒台已收官(停止收稿,榜单定格)");
      qc.invalidateQueries({ queryKey: ["showcase"] });
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "操作失败")),
  });

  const openEntry = (entryId: string) => navigate(`/showcase/entries/${entryId}`);
  const canJoin = s.status === "published";
  const rankHint =
    s.rankBy === "metric" ? `比拼「${s.metricLabel ?? "数值"}」${s.metricUnit ? `(${s.metricUnit})` : ""}` : "按作品获赞数排位";

  return (
    <PageShell>
      {/* 状态横幅(非公开态给台主/管理员看) */}
      {s.status !== "published" && (
        <div
          className={`mt-4 rounded-lg px-4 py-2.5 text-sm ${
            s.status === "closed"
              ? "bg-slate-100 text-slate-600"
              : s.status === "rejected"
                ? "bg-red-50 text-red-600"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {s.status === "closed" && "本晒台已收官:榜单定格,不再接收新的参晒作品。"}
          {s.status === "pending" && "晒台正在等待管理员审核,通过后对全员可见。"}
          {s.status === "draft" && "晒台还是草稿,完善后提交审核即可上架。"}
          {s.status === "rejected" && `晒台被驳回:${s.rejectReason ?? ""}`}
        </div>
      )}

      {/* 台头 */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white/90 shadow-sm">
        {s.coverFileId && (
          <div className="h-44 w-full overflow-hidden bg-muted">
            <img src={showcaseFileUrl(s.coverFileId)} alt={s.title} className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[var(--party-primary)] px-2 py-0.5 text-xs text-white">
              {s.categoryName}
            </span>
            <h1 className="text-xl font-bold text-gray-900">{s.title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs ${STAGE_STATUS_CHIP[s.status]}`}>
              {STAGE_STATUS_LABEL[s.status]}
            </span>
            <span className="ml-auto flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {s.entryCount} 人参晒
              </span>
              <span className="flex items-center gap-1 text-[var(--party-primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                {rankHint}
              </span>
            </span>
          </div>
          <div className="mt-1.5 text-xs text-gray-400">
            台主 {s.ownerName}
            {s.publishedAt && ` · ${new Date(s.publishedAt).toLocaleDateString("zh-CN")} 开擂`}
          </div>
          {s.intro && <p className="mt-3 text-sm leading-relaxed text-gray-600">{s.intro}</p>}

          {/* 操作区 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canJoin && (
              <Button
                className="bg-[var(--party-primary)] text-white hover:opacity-90"
                onClick={() => navigate(`/showcase/entries/new?stageId=${s.id}`)}
              >
                <Trophy className="mr-1.5 h-4 w-4" />
                我要参晒
              </Button>
            )}
            {s.myEntries.length > 0 && (
              <Button variant="outline" onClick={() => openEntry(s.myEntries[0].id)}>
                我的作品({s.myEntries.length})
              </Button>
            )}
            {(s.isOwner || s.canManage) && (
              <>
                <Button variant="outline" onClick={() => navigate(`/showcase/stages/${s.id}/edit`)}>
                  <PencilLine className="mr-1 h-4 w-4" />
                  编辑晒台
                </Button>
                {["published", "closed"].includes(s.status) && (
                  <Button variant="outline" disabled={closeMut.isPending} onClick={() => closeMut.mutate()}>
                    {s.status === "closed" ? (
                      <>
                        <LockOpen className="mr-1 h-4 w-4" />
                        重开晒台
                      </>
                    ) : (
                      <>
                        <Lock className="mr-1 h-4 w-4" />
                        收官(停止收稿)
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
            {s.canManage && s.status === "pending" && <ReviewBar kind="stage" id={s.id} />}
          </div>
        </div>
      </div>

      {/* 比拼规则 + 台头介绍 */}
      {(s.rulesMd || s.introBlocks.length > 0) && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
          {s.rulesMd && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">比拼规则</h2>
              <MarkdownView md={s.rulesMd} className="text-sm" />
            </>
          )}
          {s.introBlocks.length > 0 && (
            <div className={s.rulesMd ? "mt-5" : ""}>
              <BlocksRenderer blocks={s.introBlocks} />
            </div>
          )}
        </div>
      )}

      {/* 台主/管理员:待审作品区 */}
      {s.canReview && (pendingEntries.data?.items.length ?? 0) > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <ClipboardCheck className="h-4 w-4" />
            待审作品({pendingEntries.data?.items.length})
          </h2>
          <div className="space-y-2">
            {(pendingEntries.data?.items ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <EntryCard entry={e} onOpen={openEntry} showStatus />
                </div>
                <ReviewBar kind="entry" id={e.id} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 排位榜 / 作品流 */}
      <div className="mt-4 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("ranking")}
            className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === "ranking" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Trophy className="h-4 w-4" />
            排位榜
          </button>
          <button
            type="button"
            onClick={() => setTab("entries")}
            className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === "entries" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Users className="h-4 w-4" />
            参晒作品
          </button>
          {tab === "entries" && (
            <select
              className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={entrySort}
              onChange={(e) => setEntrySort(e.target.value as "rank" | "latest")}
            >
              <option value="rank">按名次</option>
              <option value="latest">按最新</option>
            </select>
          )}
        </div>

        {tab === "ranking" ? (
          ranking.isLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">榜单加载中…</div>
          ) : ranking.data ? (
            <RankingBoard ranking={ranking.data} onOpen={openEntry} />
          ) : null
        ) : entries.isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
        ) : (entries.data?.items.length ?? 0) === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">还没有公开的参晒作品</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(entries.data?.items ?? []).map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                onOpen={openEntry}
                metricDisplay={
                  s.rankBy === "metric" && e.metricValue !== null
                    ? fmtNumber(e.metricValue, s.metricDecimals, s.metricUnit)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
