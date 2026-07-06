import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArchiveIcon,
  BookOpenIcon,
  CheckIcon,
  EyeIcon,
  PinIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  ARTICLE_STATUS_CHIP,
  ARTICLE_STATUS_LABEL,
  knowledgeApi,
  knowledgeErrMsg,
  type ArticleListItem,
} from "../../api";
import { MarkdownView } from "../../components/MarkdownView";

/**
 * 知识文章管理:待审核(审核弹窗预览 + 通过/驳回)+ 全部文章(筛选/置顶/下架/删除)。
 */
export default function KnowledgeManage() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const pendingCount = useQuery({
    queryKey: ["knowledge", "manage", "pending-count"],
    queryFn: () => knowledgeApi.listArticles({ status: "pending", pageSize: 1 }),
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <BookOpenIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">知识文章管理</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">审核待发布文章;管理全部知识内容(置顶/下架/删除)。</p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending">
            待审核
            {(pendingCount.data?.total ?? 0) > 0 && (
              <span className="ml-1.5 px-1.5 py-0 rounded-full bg-[var(--party-primary)] text-white text-[11px]">
                {pendingCount.data!.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">全部文章</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4">{tab === "pending" ? <PendingTab /> : <AllTab />}</div>
    </div>
  );
}

/* ─── 待审核 ─── */

function PendingTab() {
  const list = useQuery({
    queryKey: ["knowledge", "manage", "pending"],
    queryFn: () => knowledgeApi.listArticles({ status: "pending", pageSize: 50 }),
  });
  const [reviewId, setReviewId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      {list.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">没有待审核的文章</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.data!.items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-gray-800">
                  {a.title}
                  {a.versionLabel && <span className="ml-1.5 text-xs font-normal text-amber-600">({a.versionLabel})</span>}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {a.categoryName} · {a.typeName} · {a.authorName} · {new Date(a.updatedAt).toLocaleString("zh-CN")}
                </span>
              </span>
              <Button size="sm" onClick={() => setReviewId(a.id)}>审核</Button>
            </div>
          ))}
        </div>
      )}
      {reviewId && <ReviewDialog key={reviewId} articleId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
}

function ReviewDialog({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["knowledge", "manage", "review", articleId],
    queryFn: () => knowledgeApi.getArticle(articleId),
  });
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: (approve: boolean) => knowledgeApi.reviewArticle(articleId, { approve, reason: reason.trim() || undefined }),
    onSuccess: (a) => {
      toast.success(a.status === "published" ? "已通过并发布" : "已驳回");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onClose();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "操作失败")),
  });

  const a = detail.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>审核:{a?.title ?? "…"}</DialogTitle>
        </DialogHeader>
        {a && (
          <div className="text-xs text-gray-400 -mt-2">
            {a.categoryName} · {a.typeName} · {a.authorName}
            {a.versions.length > 0 && <span className="text-amber-600"> · 修订版(发布后旧版自动归档)</span>}
          </div>
        )}
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg p-4 bg-gray-50/40">
          {detail.isLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          ) : a ? (
            <>
              {a.summary && <p className="mb-3 text-sm text-gray-600 bg-amber-50 rounded p-2">导读:{a.summary}</p>}
              <MarkdownView md={a.contentMd} />
            </>
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">加载失败</div>
          )}
        </div>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="驳回原因(点「驳回」时必填;通过可不填)"
          className="text-sm"
        />
        <DialogFooter>
          <Button
            variant="outline"
            className="text-red-500 border-red-200 hover:bg-red-50"
            disabled={review.isPending}
            onClick={() => {
              if (!reason.trim()) {
                toast.error("驳回必须填写原因");
                return;
              }
              review.mutate(false);
            }}
          >
            <XIcon className="w-4 h-4 mr-1" /> 驳回
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={review.isPending || !a}
            onClick={() => review.mutate(true)}
          >
            <CheckIcon className="w-4 h-4 mr-1" /> 通过并发布
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 全部文章 ─── */

function AllTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState("published");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");

  const list = useQuery({
    queryKey: ["knowledge", "manage", "all", status, applied],
    queryFn: () =>
      knowledgeApi.listArticles({
        status,
        q: applied || undefined,
        pageSize: 50,
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge"] });

  const pin = useMutation({
    mutationFn: (a: ArticleListItem) => knowledgeApi.updateArticle(a.id, { pinned: !a.pinned }),
    onSuccess: invalidate,
    onError: (e) => toast.error(knowledgeErrMsg(e, "操作失败")),
  });
  const unpublish = useMutation({
    mutationFn: (id: string) => knowledgeApi.unpublishArticle(id),
    onSuccess: () => {
      toast.success("已下架(转为草稿)");
      invalidate();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "下架失败")),
  });
  const del = useMutation({
    mutationFn: (id: string) => knowledgeApi.deleteArticle(id),
    onSuccess: () => {
      toast.success("已删除");
      invalidate();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">全部状态</SelectItem>
            <SelectItem value="published">已发布</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="archived">已归档</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="relative flex-1 max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(q.trim());
          }}
        >
          <SearchIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题/全文/标签,回车" className="pl-8" />
        </form>
        <span className="ml-auto text-xs text-gray-400">共 {list.data?.total ?? 0} 篇</span>
      </div>
      {list.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">没有匹配的文章</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.data!.items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-2 py-3">
              {a.pinned && <PinIcon className="w-3.5 h-3.5 text-[var(--party-primary)] shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium text-gray-800">
                  {a.title}
                  {a.versionLabel && <span className="ml-1.5 text-xs font-normal text-amber-600">({a.versionLabel})</span>}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {a.categoryName} · {a.typeName} · {a.authorName} · 浏览 {a.viewCount}
                </span>
              </span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] ${ARTICLE_STATUS_CHIP[a.status]}`}>
                {ARTICLE_STATUS_LABEL[a.status]}
              </span>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/knowledge/articles/${a.id}`)} title="查看">
                <EyeIcon className="w-4 h-4" />
              </Button>
              {a.status === "published" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={a.pinned ? "text-[var(--party-primary)]" : "text-gray-400"}
                    onClick={() => pin.mutate(a)}
                    title={a.pinned ? "取消置顶" : "置顶"}
                  >
                    <PinIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-400"
                    onClick={() => {
                      if (window.confirm(`确定下架「${a.title}」?将转为草稿。`)) unpublish.mutate(a.id);
                    }}
                    title="下架"
                  >
                    <ArchiveIcon className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-300 hover:text-red-500"
                onClick={() => {
                  if (window.confirm(`确定删除「${a.title}」?正文图片与附件将一并删除,不可恢复。`)) del.mutate(a.id);
                }}
                title="删除"
              >
                <Trash2Icon className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
