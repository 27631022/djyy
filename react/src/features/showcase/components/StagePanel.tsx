import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  ClipboardList,
  Lock,
  LockOpen,
  MessageSquareText,
  PencilLine,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { useLocateQuery } from "@/shared/hooks/useLocateQuery";
import { MarkdownView } from "@/features/knowledge";
import {
  showcaseApi,
  showcaseErrMsg,
  showcaseFileUrl,
  STAGE_STATUS_CHIP,
  STAGE_STATUS_LABEL,
  type StageDetail,
} from "../api";
import { getTool } from "../tools/registry";
import { fmtNumber } from "../tools/shared";
import { BlocksRenderer } from "./BlocksRenderer";
import { EntryCard } from "./EntryCard";
import { FeedbackDialog } from "./FeedbackDialog";
import { LikeButton } from "./LikeButton";
import { RankingBoard } from "./RankingBoard";
import { ReviewBar } from "./ReviewBar";

/**
 * 晒台面板 = 一个晒台的完整「报送情况」:台头 + 报送要求 + 排位榜 + 作品流 + 台主待审区。
 * 门户中栏(左中右三栏)与 /showcase/stages/:id 详情页共用;自带取数与 key 重挂载。
 */
export function StagePanel({ stageId }: { stageId: string }) {
  const stage = useQuery({
    queryKey: ["showcase", "stage", stageId],
    queryFn: () => showcaseApi.getStage(stageId),
    enabled: !!stageId,
  });

  if (stage.isLoading) {
    return <div className="py-24 text-center text-sm text-gray-400">加载中…</div>;
  }
  if (stage.isError || !stage.data) {
    return (
      <div className="py-24 text-center text-sm text-gray-400">
        {showcaseErrMsg(stage.error, "晒台不存在或无权查看")}
      </div>
    );
  }
  return <StageView key={stage.data.id} stage={stage.data} />;
}

function StageView({ stage: s }: { stage: StageDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ranking" | "entries">("ranking");
  const [entrySort, setEntrySort] = useState<"rank" | "latest">("rank");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 全站搜索带 ?q= 进来 → 台头/报送要求里定位并高亮相关行(本组件在数据就绪后才挂载,rAF 定位可靠)
  const [searchParams] = useSearchParams();
  const highlightQ = (searchParams.get("q") ?? "").trim();
  const rootRef = useRef<HTMLDivElement>(null);
  useLocateQuery(rootRef, highlightQ, s.id);

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
    <div ref={rootRef}>
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
            <LikeButton kind="stage" id={s.id} liked={s.liked} likeCount={s.likeCount} />
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
              onClick={() => setFeedbackOpen(true)}
            >
              <MessageSquareText className="h-4 w-4" />
              吐槽
            </button>
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
                我的报送({s.myEntries.length})
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

      {feedbackOpen && (
        <FeedbackDialog targetType="stage" targetId={s.id} onClose={() => setFeedbackOpen(false)} />
      )}

      {/* 报送要求(填报规则)+ 比拼规则 + 台头介绍 */}
      {(s.template.length > 0 || s.rulesMd || s.introBlocks.length > 0) && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
          {s.template.length > 0 && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <ClipboardList className="h-4 w-4 text-[var(--party-primary)]" />
                报送要求(点「我要参晒」按此逐块填报)
              </h2>
              <ol className="space-y-1.5">
                {s.template.map((tb, i) => {
                  const def = getTool(tb.type);
                  return (
                    <li key={tb.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-party-soft text-xs font-bold text-[var(--party-primary)]">
                        {i + 1}
                      </span>
                      <span>
                        <span className="font-medium">{tb.title}</span>
                        <span className="ml-1.5 text-xs text-gray-400">({def?.label ?? tb.type})</span>
                        {tb.requirement && (
                          <span className="block text-xs leading-relaxed text-gray-500">{tb.requirement}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {s.rulesMd && (
            <div className={s.template.length > 0 ? "mt-4" : ""}>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">比拼规则</h2>
              <MarkdownView md={s.rulesMd} fontPx={14} />
            </div>
          )}
          {s.introBlocks.length > 0 && (
            <div className={s.rulesMd || s.template.length > 0 ? "mt-5" : ""}>
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
    </div>
  );
}
