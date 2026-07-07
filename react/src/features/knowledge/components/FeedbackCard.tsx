import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckIcon, ExternalLinkIcon, ReplyIcon, SendIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { knowledgeApi, knowledgeErrMsg, type FeedbackItem } from "../api";

const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  replied: "已回复",
  closed: "已关闭",
};
const FEEDBACK_STATUS_CHIP: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  replied: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};

/**
 * 单条吐槽/反馈卡片(可回复/关闭)—— 管理端「用户反馈」页与作者「我的知识·收到反馈」共用。
 * 回复/关闭权限后端判(作者 / 维护人员 / 管理员),前端只管展示与提交。
 */
export function FeedbackCard({ fb }: { fb: FeedbackItem }) {
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
        <span className={`px-1.5 py-0.5 rounded ${FEEDBACK_STATUS_CHIP[fb.status]}`}>
          {FEEDBACK_STATUS_LABEL[fb.status]}
        </span>
        <span>{fb.userName}</span>
        <span>{new Date(fb.createdAt).toLocaleString("zh-CN")}</span>
        <button
          type="button"
          className="ml-auto flex items-center gap-0.5 hover:text-[var(--party-primary)] min-w-0"
          onClick={() => navigate(`/knowledge/articles/${fb.articleId}`)}
        >
          <ExternalLinkIcon className="w-3 h-3 shrink-0" /> <span className="truncate">{fb.articleTitle}</span>
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
