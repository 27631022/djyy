import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckIcon, ExternalLinkIcon, MessageCircleWarningIcon, ReplyIcon, SendIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { knowledgeApi, knowledgeErrMsg, type FeedbackItem } from "../../api";

const STATUS_LABEL: Record<string, string> = { open: "待处理", replied: "已回复", closed: "已关闭" };
const STATUS_CHIP: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  replied: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};

/** 用户反馈(吐槽)处理:管理员看全部,回复 / 关闭。 */
export default function KnowledgeFeedback() {
  const [status, setStatus] = useState("open");
  const list = useQuery({
    queryKey: ["knowledge", "feedback", "all", status],
    queryFn: () => knowledgeApi.listFeedback("all", status === "all" ? undefined : status),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircleWarningIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">用户反馈</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">读者对文章的意见/吐槽(不公开)。回复后作者与反馈人可见。</p>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="open">待处理</TabsTrigger>
          <TabsTrigger value="replied">已回复</TabsTrigger>
          <TabsTrigger value="closed">已关闭</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3">
        {list.isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">没有反馈</div>
        ) : (
          list.data!.map((f) => <FeedbackCard key={f.id} fb={f} />)
        )}
      </div>
    </div>
  );
}

function FeedbackCard({ fb }: { fb: FeedbackItem }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reply, setReply] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge", "feedback"] });
  const doReply = useMutation({
    mutationFn: () => knowledgeApi.replyFeedback(fb.id, reply.trim()),
    onSuccess: () => {
      setReply("");
      toast.success("已回复");
      invalidate();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "回复失败")),
  });
  const close = useMutation({
    mutationFn: () => knowledgeApi.closeFeedback(fb.id),
    onSuccess: () => {
      toast.success("已关闭");
      invalidate();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "操作失败")),
  });

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
        <span className={`px-1.5 py-0.5 rounded ${STATUS_CHIP[fb.status]}`}>{STATUS_LABEL[fb.status]}</span>
        <span>{fb.userName}</span>
        <span>{new Date(fb.createdAt).toLocaleString("zh-CN")}</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-0.5 hover:text-[var(--party-primary)]"
          onClick={() => navigate(`/knowledge/articles/${fb.articleId}`)}
        >
          <ExternalLinkIcon className="w-3 h-3" /> {fb.articleTitle}
        </button>
      </div>
      <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{fb.content}</div>

      {fb.replies.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
          {fb.replies.map((r) => (
            <div key={r.id} className="text-sm">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <ReplyIcon className="w-3 h-3" /> {r.userName} · {new Date(r.createdAt).toLocaleString("zh-CN")}
              </span>
              <div className="text-gray-700 whitespace-pre-wrap break-words">{r.content}</div>
            </div>
          ))}
        </div>
      )}

      {fb.status !== "closed" && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="回复…"
            className="flex-1 h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && reply.trim()) doReply.mutate();
            }}
          />
          <Button size="sm" disabled={!reply.trim() || doReply.isPending} onClick={() => doReply.mutate()}>
            <SendIcon className="w-3.5 h-3.5 mr-1" /> 回复
          </Button>
          <Button size="sm" variant="ghost" className="text-gray-400" disabled={close.isPending} onClick={() => close.mutate()}>
            <CheckIcon className="w-3.5 h-3.5 mr-1" /> 关闭
          </Button>
        </div>
      )}
    </div>
  );
}
