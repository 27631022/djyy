import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckIcon, ExternalLinkIcon, ReplyIcon, SendIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { showcaseApi, showcaseErrMsg, type ShowcaseFeedbackItem } from "../api";

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
 * 单条吐槽卡片(可回复/关闭)—— 后台「吐槽处理」页用(照 knowledge FeedbackCard)。
 * 回复/关闭权限后端判(台主/作者/管理员),前端只管展示与提交。
 */
export function FeedbackCard({ fb }: { fb: ShowcaseFeedbackItem }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reply, setReply] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["showcase", "feedback"] });
  const doReply = useMutation({
    mutationFn: () => showcaseApi.replyFeedback(fb.id, reply.trim()),
    onSuccess: () => {
      setReply("");
      toast.success("已回复");
      invalidate();
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "回复失败")),
  });
  const close = useMutation({
    mutationFn: () => showcaseApi.closeFeedback(fb.id),
    onSuccess: () => {
      toast.success("已关闭");
      invalidate();
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "操作失败")),
  });

  const targetPath =
    fb.targetType === "stage" ? `/showcase/stages/${fb.targetId}` : `/showcase/entries/${fb.targetId}`;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-400">
        <span className={`rounded px-1.5 py-0.5 ${FEEDBACK_STATUS_CHIP[fb.status]}`}>
          {FEEDBACK_STATUS_LABEL[fb.status]}
        </span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">
          {fb.targetType === "stage" ? "晒台" : "作品"}
        </span>
        <span>{fb.userName}</span>
        <span>{new Date(fb.createdAt).toLocaleString("zh-CN")}</span>
        <button
          type="button"
          className="ml-auto flex min-w-0 items-center gap-0.5 hover:text-[var(--party-primary)]"
          onClick={() => navigate(targetPath)}
        >
          <ExternalLinkIcon className="h-3 w-3 shrink-0" /> <span className="truncate">{fb.targetTitle}</span>
        </button>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm text-gray-700">{fb.content}</div>

      {fb.replies.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
          {fb.replies.map((r) => (
            <div key={r.id} className="text-sm">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <ReplyIcon className="h-3 w-3" /> {r.userName} · {new Date(r.createdAt).toLocaleString("zh-CN")}
              </span>
              <div className="whitespace-pre-wrap break-words text-gray-700">{r.content}</div>
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
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && reply.trim()) doReply.mutate();
            }}
          />
          <Button size="sm" disabled={!reply.trim() || doReply.isPending} onClick={() => doReply.mutate()}>
            <SendIcon className="mr-1 h-3.5 w-3.5" /> 回复
          </Button>
          <Button size="sm" variant="ghost" className="text-gray-400" disabled={close.isPending} onClick={() => close.mutate()}>
            <CheckIcon className="mr-1 h-3.5 w-3.5" /> 关闭
          </Button>
        </div>
      )}
    </div>
  );
}
