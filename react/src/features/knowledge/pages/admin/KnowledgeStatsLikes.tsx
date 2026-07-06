import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ThumbsUpIcon, StarIcon, MessageSquareIcon } from "lucide-react";
import { knowledgeApi } from "../../api";

/** 点赞统计:点赞/收藏/评论总量 + 最受欢迎 Top10 */
export default function KnowledgeStatsLikes() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["knowledge", "stats"], queryFn: knowledgeApi.stats });
  const s = q.data;
  const maxLike = Math.max(1, ...(s?.topLiked ?? []).map((a) => a.likeCount));

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <ThumbsUpIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">点赞统计</h1>
      </div>

      {q.isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : !s ? (
        <div className="py-16 text-center text-sm text-gray-400">暂无数据</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card icon={<ThumbsUpIcon className="w-4 h-4" />} label="总点赞" value={s.totalLikes} />
            <Card icon={<StarIcon className="w-4 h-4" />} label="总收藏" value={s.totalFavorites} />
            <Card icon={<MessageSquareIcon className="w-4 h-4" />} label="总评论" value={s.totalComments} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-3">点赞 Top 10</div>
              {s.topLiked.filter((a) => a.likeCount > 0).length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-300">暂无点赞</div>
              ) : (
                <div className="space-y-2">
                  {s.topLiked
                    .filter((a) => a.likeCount > 0)
                    .map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => navigate(`/knowledge/articles/${a.id}`)}
                        className="w-full flex items-center gap-2 text-left group"
                      >
                        <span className="w-4 text-xs text-gray-400 shrink-0">{i + 1}</span>
                        <span className="flex-1 truncate text-sm text-gray-700 group-hover:text-[var(--party-primary)]">
                          {a.title}
                        </span>
                        <span className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden shrink-0">
                          <span className="block h-full bg-[var(--party-primary)]/70" style={{ width: `${(a.likeCount / maxLike) * 100}%` }} />
                        </span>
                        <span className="w-10 text-right text-xs text-gray-400 shrink-0">{a.likeCount}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-3">收藏 Top 10</div>
              {s.topFavorited.filter((a) => a.favoriteCount > 0).length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-300">暂无收藏</div>
              ) : (
                <div className="space-y-2">
                  {s.topFavorited
                    .filter((a) => a.favoriteCount > 0)
                    .map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => navigate(`/knowledge/articles/${a.id}`)}
                        className="w-full flex items-center gap-2 text-left group"
                      >
                        <span className="w-4 text-xs text-gray-400 shrink-0">{i + 1}</span>
                        <span className="flex-1 truncate text-sm text-gray-700 group-hover:text-[var(--party-primary)]">{a.title}</span>
                        <span className="flex items-center gap-0.5 text-xs text-amber-500 shrink-0">
                          <StarIcon className="w-3 h-3 fill-current" />
                          {a.favoriteCount}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
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
