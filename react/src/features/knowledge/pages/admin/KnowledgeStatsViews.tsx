import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { EyeIcon, ClockIcon, FileTextIcon, TrendingUpIcon } from "lucide-react";
import { knowledgeApi } from "../../api";

function fmtDuration(sec: number): string {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)} 小时`;
  if (sec >= 60) return `${Math.round(sec / 60)} 分钟`;
  return `${sec} 秒`;
}

/** 浏览统计:总量卡片 + 平均阅读时长 + 最多浏览 Top10 */
export default function KnowledgeStatsViews() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["knowledge", "stats"], queryFn: knowledgeApi.stats });
  const s = q.data;
  const avg = s && s.totalViewLogs > 0 ? Math.round(s.totalDurationSec / s.totalViewLogs) : 0;
  const maxView = Math.max(1, ...(s?.topViewed ?? []).map((a) => a.viewCount));

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <EyeIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">浏览统计</h1>
      </div>

      {q.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : !s ? (
        <div className="py-16 text-center text-sm text-gray-400">暂无数据</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Card icon={<FileTextIcon className="w-4 h-4" />} label="已发布文章" value={s.articleCount} />
            <Card icon={<EyeIcon className="w-4 h-4" />} label="总浏览量" value={s.totalViews} />
            <Card icon={<ClockIcon className="w-4 h-4" />} label="平均阅读时长" value={fmtDuration(avg)} />
            <Card icon={<TrendingUpIcon className="w-4 h-4" />} label="浏览记录数" value={s.totalViewLogs} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
            <div className="text-sm font-medium text-gray-700 mb-3">浏览量 Top 10</div>
            {s.topViewed.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-300">暂无浏览</div>
            ) : (
              <div className="space-y-2">
                {s.topViewed.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/knowledge/articles/${a.id}`)}
                    className="w-full flex items-center gap-3 text-left group"
                  >
                    <span className="w-5 text-xs text-gray-400 shrink-0">{i + 1}</span>
                    <span className="w-48 truncate text-sm text-gray-700 group-hover:text-[var(--party-primary)] shrink-0">
                      {a.title}
                    </span>
                    <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <span
                        className="block h-full bg-[var(--party-primary)]/70"
                        style={{ width: `${(a.viewCount / maxView) * 100}%` }}
                      />
                    </span>
                    <span className="w-24 text-right text-xs text-gray-400 shrink-0">
                      {a.viewCount} 浏览 · {a.commentCount} 评论
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-400">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
