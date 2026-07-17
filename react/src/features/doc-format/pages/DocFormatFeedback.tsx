import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, MessageSquare, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { downloadBlob } from "@/shared/lib/download";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  docInteractionApi,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_TONE,
  type DocFeedback,
} from "../api";

const TABS: { k: string; label: string }[] = [
  { k: "open", label: "待处理" },
  { k: "replied", label: "已回复" },
  { k: "closed", label: "已关闭" },
  { k: "all", label: "全部" },
];

function FeedbackCard({ f, onChanged }: { f: DocFeedback; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const doReply = useMutation({
    mutationFn: () => docInteractionApi.replyFeedback(f.id, reply),
    onSuccess: () => {
      setReply("");
      toast.success("已回复");
      onChanged();
    },
  });
  const doClose = useMutation({
    mutationFn: () => docInteractionApi.closeFeedback(f.id),
    onSuccess: () => {
      toast.success("已关闭");
      onChanged();
    },
  });

  /** 失败样本走鉴权口取 blob 再下载(私有文件带不了 token 到 <a href>) */
  const download = async (id: string, name: string) => {
    try {
      downloadBlob(await storageApi.fetchBlob(id), name);
    } catch {
      toast.error("文件已不在(可能已被清理)");
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-medium text-gray-700">{f.userName}</span>
        <span className={`rounded px-1.5 py-0.5 ${FEEDBACK_STATUS_TONE[f.status] ?? ""}`}>
          {FEEDBACK_STATUS_LABEL[f.status] ?? f.status}
        </span>
        <span className="text-gray-400">{new Date(f.createdAt).toLocaleString()}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-gray-800">{f.content}</p>

      {f.files.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-2 ring-1 ring-amber-200">
          <p className="mb-1 text-[11px] text-amber-900">转换失败的原始文件 —— 用它复现问题:</p>
          <div className="flex flex-wrap gap-2">
            {f.files.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => download(x.id, x.name)}
                className="flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-amber-200 hover:ring-[var(--party-primary)]"
              >
                <Paperclip className="h-3 w-3" />
                {x.name}
                <Download className="h-3 w-3 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {f.replies.map((r) => (
        <div key={r.id} className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">
          <span className="text-xs text-gray-500">
            {r.userName} · {new Date(r.createdAt).toLocaleString()}
          </span>
          <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{r.content}</p>
        </div>
      ))}

      {f.status !== "closed" && (
        <div className="mt-3 flex items-start gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="回复…"
            className="min-h-9 flex-1 text-sm"
            maxLength={2000}
          />
          <Button
            size="sm"
            disabled={!reply.trim() || doReply.isPending}
            onClick={() => doReply.mutate()}
            className="bg-[var(--party-primary)] text-white hover:opacity-90"
          >
            {doReply.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            回复
          </Button>
          <Button size="sm" variant="outline" disabled={doClose.isPending} onClick={() => doClose.mutate()}>
            关闭
          </Button>
        </div>
      )}
    </div>
  );
}

/** 公文排版·转换问题反馈(/admin/doc-format/feedback,doc-format:manage) */
export default function DocFormatFeedbackPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("open");
  const list = useQuery({
    queryKey: ["doc-format", "feedback", tab],
    queryFn: () => docInteractionApi.listFeedback("all", tab),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["doc-format"] });

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">转换问题反馈</h1>
        <p className="mt-1 text-sm text-slate-500">
          用户报的转换不成功的问题。带了原始文件的可以直接下载复现 —— 这些样本是完善识别规则的依据。
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-100">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm ${
              tab === t.k
                ? "border-b-2 border-[var(--party-primary)] font-medium text-[var(--party-primary)]"
                : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.isPending && <p className="py-10 text-center text-sm text-slate-400">加载中…</p>}
        {list.data?.length === 0 && (
          <p className="flex flex-col items-center gap-2 py-16 text-sm text-slate-400">
            <MessageSquare className="h-8 w-8 text-slate-300" />
            这里还没有反馈
          </p>
        )}
        {list.data?.map((f) => <FeedbackCard key={f.id} f={f} onChanged={invalidate} />)}
      </div>
    </div>
  );
}
