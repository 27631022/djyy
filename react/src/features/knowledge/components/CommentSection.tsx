import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareIcon, ReplyIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAuth } from "@/stores/auth";
import { knowledgeApi, knowledgeErrMsg, type KnowledgeComment } from "../api";

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 评论区:单层 + @回复,纯文本渲染;删自己的或管理员删任意。 */
export function CommentSection({ articleId }: { articleId: string }) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<KnowledgeComment | null>(null);

  const canManage = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("knowledge:manage");
  const list = useQuery({
    queryKey: ["knowledge", "comments", articleId],
    queryFn: () => knowledgeApi.listComments(articleId, 1),
  });

  const add = useMutation({
    mutationFn: () => knowledgeApi.addComment(articleId, { content: content.trim(), replyToId: replyTo?.id }),
    onSuccess: () => {
      setContent("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["knowledge", "comments", articleId] });
      qc.invalidateQueries({ queryKey: ["knowledge", "article", articleId] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "评论失败")),
  });

  const del = useMutation({
    mutationFn: (id: string) => knowledgeApi.removeComment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge", "comments", articleId] });
      qc.invalidateQueries({ queryKey: ["knowledge", "article", articleId] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  const items = list.data?.items ?? [];

  return (
    <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm px-6 py-4">
      <div className="flex items-center gap-1.5 font-medium text-gray-800 mb-3">
        <MessageSquareIcon className="w-4 h-4 text-[var(--party-primary)]" /> 评论 {list.data?.total ? `(${list.data.total})` : ""}
      </div>

      {/* 输入 */}
      <div className="mb-4">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            回复 @{replyTo.userName}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="取消回复">
              <XIcon className="w-3 h-3 hover:text-gray-700" />
            </button>
          </div>
        )}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder={replyTo ? `回复 ${replyTo.userName}…` : "说点什么…"}
          className="text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="bg-[var(--party-primary)] hover:opacity-90 text-white"
            disabled={!content.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <SendIcon className="w-3.5 h-3.5 mr-1" /> 发表
          </Button>
        </div>
      </div>

      {/* 列表 */}
      {list.isLoading ? (
        <div className="py-6 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-300">还没有评论,来说第一句</div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="flex items-start gap-3 group">
              <div className="w-8 h-8 rounded-full bg-party-soft text-[var(--party-primary)] text-sm flex items-center justify-center shrink-0">
                {c.userName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium text-gray-800">{c.userName}</span>
                  {c.replyToUserName && <span className="text-gray-400"> ▸ @{c.replyToUserName}</span>}
                  <span className="ml-2 text-xs text-gray-400">{fmt(c.createdAt)}</span>
                </div>
                <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{c.content}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" className="flex items-center gap-0.5 hover:text-gray-600" onClick={() => setReplyTo(c)}>
                    <ReplyIcon className="w-3 h-3" /> 回复
                  </button>
                  {(me?.id === c.userId || canManage) && (
                    <button
                      type="button"
                      className="flex items-center gap-0.5 hover:text-red-500"
                      onClick={() => del.mutate(c.id)}
                    >
                      <Trash2Icon className="w-3 h-3" /> 删除
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(list.data?.total ?? 0) > items.length && (
            <div className="text-center text-xs text-gray-400 pt-2">
              仅显示前 {items.length} 条(共 {list.data?.total})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
