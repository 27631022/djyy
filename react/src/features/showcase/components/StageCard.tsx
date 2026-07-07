import { Flame, Pin, ThumbsUp, Trophy, Users } from "lucide-react";
import {
  STAGE_STATUS_CHIP,
  STAGE_STATUS_LABEL,
  showcaseFileUrl,
  type StageListItem,
} from "../api";

/** 晒台卡:封面 + 分类章 + 比拼方式 + 台主 + N 人参晒 + 点赞;mine 视角带状态 chip 与驳回原因 */
export function StageCard({
  stage,
  onOpen,
  showStatus = false,
}: {
  stage: StageListItem;
  onOpen: (id: string) => void;
  showStatus?: boolean;
}) {
  const s = stage;
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white/90 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-red-50 to-amber-50">
        {s.coverFileId ? (
          <img
            src={showcaseFileUrl(s.coverFileId)}
            alt={s.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Trophy className="h-10 w-10 text-[var(--party-primary)]/20" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-[var(--party-primary)] px-2 py-0.5 text-xs text-white">
          {s.categoryName}
        </span>
        {s.pinned && (
          <span className="absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-xs text-white">
            <Pin className="mr-0.5 inline h-3 w-3" />
            置顶
          </span>
        )}
        {s.status === "closed" && (
          <span className="absolute bottom-2 right-2 rounded-md bg-slate-700/80 px-2 py-0.5 text-xs text-white">
            已收官
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-1 flex-1 font-semibold text-gray-900 group-hover:text-[var(--party-primary)]">
            {s.title}
          </h3>
          {showStatus && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STAGE_STATUS_CHIP[s.status]}`}>
              {STAGE_STATUS_LABEL[s.status]}
            </span>
          )}
        </div>
        {s.intro && <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{s.intro}</p>}
        {showStatus && s.status === "rejected" && s.rejectReason && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">驳回:{s.rejectReason}</p>
        )}
        <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-gray-400">
          <span className="truncate">台主 · {s.ownerName}</span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <Users className="h-3.5 w-3.5" />
            {s.entryCount} 人参晒
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <ThumbsUp className="h-3.5 w-3.5" />
            {s.likeCount}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[var(--party-primary)]">
            <Flame className="h-3.5 w-3.5" />
            {s.rankBy === "metric" ? `比拼${s.metricLabel ?? "数值"}` : "点赞排位"}
          </span>
        </div>
      </div>
    </button>
  );
}
