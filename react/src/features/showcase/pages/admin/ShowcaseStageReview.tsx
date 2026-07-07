import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  showcaseApi,
  showcaseErrMsg,
  STAGE_STATUS_CHIP,
  STAGE_STATUS_LABEL,
} from "../../api";
import { ReviewBar } from "../../components/ReviewBar";

const TABS = [
  { key: "pending", label: "待审核" },
  { key: "published", label: "已上架" },
  { key: "rejected", label: "已驳回" },
  { key: "closed", label: "已收官" },
  { key: "draft", label: "草稿" },
] as const;

/** 后台 · 晒台审核/管理:按状态 tab 列表;待审 → 通过/驳回;已上架 → 下架;任意 → 删除 */
export default function ShowcaseStageReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");

  const list = useQuery({
    queryKey: ["showcase", "admin", "stages", tab],
    queryFn: () => showcaseApi.listStages({ status: tab, pageSize: 50 }),
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => showcaseApi.unpublishStage(id),
    onSuccess: () => {
      toast.success("已下架(转回草稿,台主可改后重新提交)");
      qc.invalidateQueries({ queryKey: ["showcase"] });
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "下架失败")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => showcaseApi.deleteStage(id),
    onSuccess: () => {
      toast.success("晒台已删除(含全部参晒作品与文件)");
      qc.invalidateQueries({ queryKey: ["showcase"] });
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "删除失败")),
  });

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">晒台审核</h1>
        <p className="text-sm text-muted-foreground">
          台主发起的晒台需管理员审核后上架;上架后全员可投稿参晒(作品由台主或管理员审)
        </p>
      </div>

      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              tab === t.key ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">共 {list.data?.total ?? 0} 个</span>
      </div>

      {list.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">该状态下没有晒台</div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="line-clamp-1 text-left text-sm font-medium hover:text-[var(--party-primary)]"
                    onClick={() => navigate(`/showcase/stages/${s.id}`)}
                  >
                    {s.title}
                  </button>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STAGE_STATUS_CHIP[s.status]}`}>
                    {STAGE_STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                  <span>{s.categoryName}</span>
                  <span>台主 {s.ownerName}</span>
                  <span>{s.entryCount} 人参晒</span>
                  <span>
                    {s.rankBy === "metric" ? `比拼「${s.metricLabel ?? "数值"}」` : "点赞排位"}
                  </span>
                  <span>{new Date(s.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                {s.status === "rejected" && s.rejectReason && (
                  <div className="mt-1 text-xs text-red-500">驳回:{s.rejectReason}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/showcase/stages/${s.id}`)}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  查看
                </Button>
                {s.status === "pending" && <ReviewBar kind="stage" id={s.id} compact />}
                {["published", "closed"].includes(s.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unpublish.isPending}
                    onClick={() => {
                      if (window.confirm(`确定下架「${s.title}」?下架后转回草稿,前台不可见。`))
                        unpublish.mutate(s.id);
                    }}
                  >
                    下架
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:bg-red-50"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `确定删除「${s.title}」?将连同 ${s.entryCount} 件公开作品与全部文件一起删除,不可恢复。`,
                      )
                    )
                      remove.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
