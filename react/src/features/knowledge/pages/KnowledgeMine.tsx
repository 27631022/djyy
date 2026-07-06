import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeftIcon, PencilLineIcon, SendIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  ARTICLE_STATUS_CHIP,
  ARTICLE_STATUS_LABEL,
  knowledgeApi,
  knowledgeErrMsg,
  type ArticleListItem,
} from "../api";

/**
 * 我的发布(全状态,可编辑/提交/删除)+ 我的收藏(favorite reaction,P3 起有数据)。
 */
export default function KnowledgeMine() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"mine" | "favorite">("mine");

  const list = useQuery({
    queryKey: ["knowledge", "mine", tab],
    queryFn: () =>
      tab === "mine"
        ? knowledgeApi.listArticles({ mine: true, pageSize: 50 })
        : knowledgeApi.listArticles({ favorite: true, pageSize: 50 }),
  });

  const submit = useMutation({
    mutationFn: (id: string) => knowledgeApi.submitArticle(id),
    onSuccess: (a) => {
      toast.success(a.status === "published" ? "已发布" : "已提交,等待管理员审核");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "提交失败")),
  });

  const del = useMutation({
    mutationFn: (id: string) => knowledgeApi.deleteArticle(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  function rowActions(a: ArticleListItem) {
    const editable = a.status !== "archived"; // 作者可编辑自己任意状态(含已发布,直接生效)
    const submittable = ["draft", "rejected"].includes(a.status);
    return (
      <span className="flex items-center gap-1.5 shrink-0">
        {editable && (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/knowledge/edit/${a.id}`); }}>
            <PencilLineIcon className="w-3.5 h-3.5 mr-1" /> 编辑
          </Button>
        )}
        {submittable && (
          <>
            <Button
              size="sm"
              className="bg-[var(--party-primary)] hover:opacity-90 text-white"
              disabled={submit.isPending}
              onClick={(e) => {
                e.stopPropagation();
                submit.mutate(a.id);
              }}
            >
              <SendIcon className="w-3.5 h-3.5 mr-1" /> 提交
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-red-500"
              disabled={del.isPending}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`确定删除「${a.title}」?正文图片与附件将一并删除。`)) del.mutate(a.id);
              }}
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/knowledge")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeftIcon className="w-4 h-4" /> 知识园地
          </button>
          <div className="font-bold text-gray-900">我的知识</div>
          <div className="ml-auto">
            <Button
              size="sm"
              className="bg-[var(--party-primary)] hover:opacity-90 text-white"
              onClick={() => navigate("/knowledge/edit")}
            >
              <PencilLineIcon className="w-4 h-4 mr-1" /> 发布知识
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "favorite")}>
          <TabsList>
            <TabsTrigger value="mine">我的发布</TabsTrigger>
            <TabsTrigger value="favorite">我的收藏</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 rounded-xl border border-gray-100 bg-white/90 shadow-sm divide-y divide-gray-50">
          {list.isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {tab === "mine" ? (
                "还没有发布过知识,点右上角「发布知识」开始"
              ) : (
                <span className="inline-flex items-center gap-1">
                  <StarIcon className="w-4 h-4" /> 还没有收藏(收藏功能下一期上线)
                </span>
              )}
            </div>
          ) : (
            list.data!.items.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/knowledge/articles/${a.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors cursor-pointer"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-gray-800">
                    {a.title}
                    {a.versionLabel && <span className="ml-1.5 text-xs font-normal text-amber-600">({a.versionLabel})</span>}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {a.categoryName} · {a.typeName} · {new Date(a.updatedAt).toLocaleString("zh-CN")}
                    {a.status === "rejected" && a.rejectReason && (
                      <span className="text-red-400"> · 驳回:{a.rejectReason}</span>
                    )}
                  </span>
                </span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] ${ARTICLE_STATUS_CHIP[a.status]}`}>
                  {ARTICLE_STATUS_LABEL[a.status]}
                </span>
                {tab === "mine" && rowActions(a)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
