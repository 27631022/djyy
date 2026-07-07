import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Medal, MessageSquareText, PencilLine, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  ENTRY_STATUS_CHIP,
  ENTRY_STATUS_LABEL,
  showcaseApi,
  showcaseErrMsg,
  type EntryDetail,
} from "../api";
import { BlocksRenderer } from "../components/BlocksRenderer";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { LikeButton } from "../components/LikeButton";
import { ReviewBar } from "../components/ReviewBar";
import { MEDAL_COLORS } from "../tools/shared";
import { useShowcaseViewTracking } from "../useViewTracking";

/** 参晒作品详情(/showcase/entries/:id):申报值 + 当前名次 + 区块内容;作者/台主操作区。 */
export default function ShowcaseEntry() {
  const { id = "" } = useParams();
  const entry = useQuery({
    queryKey: ["showcase", "entry", id],
    queryFn: () => showcaseApi.getEntry(id),
    enabled: !!id,
  });

  if (entry.isLoading) return <Shell><div className="py-24 text-center text-sm text-gray-400">加载中…</div></Shell>;
  if (entry.isError || !entry.data)
    return (
      <Shell>
        <div className="py-24 text-center text-sm text-gray-400">
          {showcaseErrMsg(entry.error, "作品不存在或无权查看")}
        </div>
      </Shell>
    );
  return <EntryView key={entry.data.id} entry={entry.data} />;
}

function Shell({ children, backTo }: { children: React.ReactNode; backTo?: { id: string; title: string } }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate(backTo ? `/showcase/stages/${backTo.id}` : "/showcase")}
            className="flex min-w-0 items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{backTo ? backTo.title : "先锋晒场"}</span>
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 pb-16">{children}</div>
    </div>
  );
}

function EntryView({ entry: e }: { entry: EntryDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useShowcaseViewTracking("entry", e.id);

  const submit = useMutation({
    mutationFn: () => showcaseApi.submitEntry(e.id),
    onSuccess: (r) => {
      toast.success(r.status === "published" ? "已直接公开(台主/管理员免审)" : "已提交,等待台主审核");
      qc.invalidateQueries({ queryKey: ["showcase"] });
    },
    onError: (err) => toast.error(showcaseErrMsg(err, "提交失败")),
  });

  const remove = useMutation({
    mutationFn: () => showcaseApi.deleteEntry(e.id),
    onSuccess: () => {
      toast.success("作品已删除");
      qc.invalidateQueries({ queryKey: ["showcase"] });
      navigate(`/showcase/stages/${e.stageId}`);
    },
    onError: (err) => toast.error(showcaseErrMsg(err, "删除失败")),
  });

  return (
    <Shell backTo={{ id: e.stage.id, title: e.stage.title }}>
      {/* 状态横幅 */}
      {e.status !== "published" && (
        <div
          className={`mt-4 rounded-lg px-4 py-2.5 text-sm ${
            e.status === "rejected" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          {e.status === "pending" && "作品正在等待台主/管理员审核,通过后公开进榜。"}
          {e.status === "draft" && "作品还是草稿,完善后提交即可参晒。"}
          {e.status === "rejected" && `作品被驳回:${e.rejectReason ?? ""}(修改后可重新提交)`}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{e.title}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${ENTRY_STATUS_CHIP[e.status]}`}>
            {ENTRY_STATUS_LABEL[e.status]}
          </span>
          {e.rank !== null && (
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: e.rank <= 3 ? MEDAL_COLORS[e.rank - 1] : "#9ca3af" }}
            >
              <Medal className="h-3.5 w-3.5" />
              当前第 {e.rank} 名
            </span>
          )}
        </div>
        <div className="mt-1.5 text-xs text-gray-400">
          {e.authorName}
          {e.publishedAt && ` · ${new Date(e.publishedAt).toLocaleDateString("zh-CN")} 公开`}
        </div>
        {e.summary && <p className="mt-2 text-sm text-gray-600">{e.summary}</p>}
        {e.stage.rankBy === "metric" && e.stage.metricDisplay && (
          <div className="mt-3 inline-flex items-baseline gap-2 rounded-lg bg-party-soft px-3 py-1.5">
            <span className="text-xs text-gray-500">{e.stage.metricLabel ?? "申报数值"}</span>
            <span className="text-lg font-bold text-[var(--party-primary)]">{e.stage.metricDisplay}</span>
          </div>
        )}

        {/* 操作区 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <LikeButton kind="entry" id={e.id} liked={e.liked} likeCount={e.likeCount} />
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquareText className="h-4 w-4" />
            吐槽
          </button>
          {e.canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/showcase/entries/${e.id}/edit`)}>
              <PencilLine className="mr-1 h-4 w-4" />
              编辑
            </Button>
          )}
          {e.isAuthor && ["draft", "rejected"].includes(e.status) && (
            <>
              <Button
                size="sm"
                className="bg-[var(--party-primary)] text-white hover:opacity-90"
                disabled={submit.isPending}
                onClick={() => submit.mutate()}
              >
                <Send className="mr-1 h-4 w-4" />
                提交参晒
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("确定删除这件作品?删除后不可恢复。")) remove.mutate();
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                删除
              </Button>
            </>
          )}
          {e.canReview && e.status === "pending" && <ReviewBar kind="entry" id={e.id} />}
        </div>
      </div>

      {feedbackOpen && (
        <FeedbackDialog targetType="entry" targetId={e.id} onClose={() => setFeedbackOpen(false)} />
      )}

      {/* 展示内容 */}
      <div className="mt-4 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
        {e.blocks.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">还没有展示内容</div>
        ) : (
          <BlocksRenderer blocks={e.blocks} />
        )}
      </div>
    </Shell>
  );
}
