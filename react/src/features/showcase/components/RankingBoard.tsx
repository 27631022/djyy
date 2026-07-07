import { Crown, Medal, Trophy } from "lucide-react";
import { showcaseFileUrl, type StageRanking } from "../api";
import { MEDAL_COLORS } from "../tools/shared";

/**
 * 台内排位榜:前三名勋章位 + 4 名起进度条列表(金银铜=语义色不跟主题,照 NavPage 榜单风格)。
 * value/display 由后端算好(竞争排名 1,2,2,4),前端只渲染。
 */
export function RankingBoard({
  ranking,
  onOpen,
}: {
  ranking: StageRanking;
  onOpen: (entryId: string) => void;
}) {
  const { items, unranked, myEntryIds } = ranking;
  const mySet = new Set(myEntryIds);
  if (items.length === 0 && unranked.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">
        还没有公开的参晒作品,快来抢头名!
      </div>
    );
  }

  const top3 = items.filter((it) => it.rank <= 3);
  const rest = items.filter((it) => it.rank > 3);
  const maxValue = Math.max(...items.map((it) => Math.abs(it.value)), 1);

  return (
    <div className="space-y-4">
      {/* 前三:勋章位(2-1-3 领奖台排布;并列名次顺排) */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-4">
          {reorderPodium(top3).map((it) => {
            const color = MEDAL_COLORS[it.rank - 1];
            const first = it.rank === 1;
            return (
              <button
                key={it.entryId}
                type="button"
                onClick={() => onOpen(it.entryId)}
                className={`group flex w-32 flex-col items-center gap-1.5 rounded-xl border bg-white/90 p-3 shadow-sm transition-shadow hover:shadow-md ${
                  first ? "-translate-y-2 border-[#F5A623]/50" : ""
                } ${mySet.has(it.entryId) ? "ring-2 ring-[var(--party-primary)]/30" : ""}`}
              >
                <div className="relative">
                  {first && <Crown className="absolute -top-4 left-1/2 h-5 w-5 -translate-x-1/2 text-[#F5A623]" />}
                  <div
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-muted"
                    style={{ borderColor: color }}
                  >
                    {it.coverFileId ? (
                      <img src={showcaseFileUrl(it.coverFileId)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Medal className="h-6 w-6" style={{ color }} />
                    )}
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {it.rank}
                  </span>
                </div>
                <div className="w-full truncate text-center text-sm font-medium group-hover:text-[var(--party-primary)]">
                  {it.title}
                </div>
                <div className="w-full truncate text-center text-xs text-gray-400">{it.authorName}</div>
                <div className="text-sm font-bold tabular-nums" style={{ color }}>
                  {it.display}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 4 名起:进度条列表 */}
      {rest.length > 0 && (
        <ol className="space-y-1.5">
          {rest.map((it) => (
            <li key={it.entryId}>
              <button
                type="button"
                onClick={() => onOpen(it.entryId)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                  mySet.has(it.entryId) ? "bg-party-soft" : ""
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-500">
                  {it.rank}
                </span>
                <span className="w-40 shrink-0 truncate text-sm">{it.title}</span>
                <span className="w-20 shrink-0 truncate text-xs text-gray-400">{it.authorName}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((Math.abs(it.value) / maxValue) * 100, 3)}%`,
                      background:
                        it.rank <= 6
                          ? "linear-gradient(90deg, color-mix(in srgb, var(--party-primary) 55%, white), var(--party-primary))"
                          : "#d1d5db",
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-500">{it.display}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* 未申报(metric 台且作品没填数值 —— 正常流程提交时强制必填,这里兜历史数据) */}
      {unranked.length > 0 && (
        <div className="text-xs text-gray-400">
          未申报数值:
          {unranked.map((u, i) => (
            <button
              key={u.entryId}
              type="button"
              className="ml-1 underline-offset-2 hover:text-[var(--party-primary)] hover:underline"
              onClick={() => onOpen(u.entryId)}
            >
              {u.title}
              {i < unranked.length - 1 ? "、" : ""}
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-gray-300">
          <Trophy className="h-3 w-3" />
          同值同名次(并列时先公开者列前);
          {ranking.rankBy === "metric"
            ? `按「${ranking.metricLabel ?? "申报数值"}」${ranking.metricOrder === "asc" ? "升序" : "降序"}排位`
            : "按作品获赞数排位"}
        </p>
      )}
    </div>
  );
}

/** 领奖台排布:第 2 名 - 第 1 名 - 第 3 名(不足 3 个按序排) */
function reorderPodium<T extends { rank: number }>(top3: T[]): T[] {
  if (top3.length < 3) return top3;
  const byRank = (r: number) => top3.filter((t) => t.rank === r);
  const ordered = [...byRank(2), ...byRank(1), ...byRank(3)];
  return ordered.length === top3.length ? ordered : top3;
}
