import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  ENTRY_STATUS_CHIP,
  ENTRY_STATUS_LABEL,
  showcaseApi,
  type EntryStatus,
} from "../../api";
import { ReviewBar } from "../../components/ReviewBar";

const TABS: Array<{ key: EntryStatus | "any"; label: string }> = [
  { key: "pending", label: "待审核" },
  { key: "published", label: "已公开" },
  { key: "rejected", label: "已驳回" },
  { key: "any", label: "全部" },
];

/** 后台 · 作品审核(管理员跨台视角;台主在晒台页有自己的待审区) */
export default function ShowcaseEntryReview() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<EntryStatus | "any">("pending");

  const list = useQuery({
    queryKey: ["showcase", "admin", "entries", tab],
    queryFn: () => showcaseApi.listAllEntries({ status: tab, pageSize: 50 }),
  });
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">作品审核</h1>
        <p className="text-sm text-muted-foreground">
          跨晒台查看参晒作品;台主也可在自己晒台页的「待审作品」区审核
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
        <span className="ml-auto text-xs text-gray-400">共 {list.data?.total ?? 0} 件</span>
      </div>

      {list.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">该状态下没有作品</div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="line-clamp-1 text-left text-sm font-medium hover:text-[var(--party-primary)]"
                    onClick={() => navigate(`/showcase/entries/${e.id}`)}
                  >
                    {e.title}
                  </button>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ENTRY_STATUS_CHIP[e.status]}`}>
                    {ENTRY_STATUS_LABEL[e.status]}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                  <span>晒台:{e.stageTitle}</span>
                  <span>{e.authorName}</span>
                  {e.metricValue !== null && <span>申报值 {e.metricValue}</span>}
                  <span>{new Date(e.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                {e.status === "rejected" && e.rejectReason && (
                  <div className="mt-1 text-xs text-red-500">驳回:{e.rejectReason}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/showcase/entries/${e.id}`)}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  查看
                </Button>
                {e.status === "pending" && <ReviewBar kind="entry" id={e.id} compact />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
