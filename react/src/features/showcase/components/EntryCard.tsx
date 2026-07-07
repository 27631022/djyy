import { ImageIcon, ThumbsUp } from "lucide-react";
import {
  ENTRY_STATUS_CHIP,
  ENTRY_STATUS_LABEL,
  showcaseFileUrl,
  type EntryListItem,
} from "../api";
import { MEDAL_COLORS } from "../tools/shared";

/** 参晒作品卡:封面 + 标题 + 作者 + 点赞;可带名次徽章(榜单序)/状态 chip(我的/审核视角) */
export function EntryCard({
  entry,
  onOpen,
  rank,
  metricDisplay,
  showStatus = false,
}: {
  entry: EntryListItem;
  onOpen: (id: string) => void;
  rank?: number;
  /** 后端格式化好的申报值(metric 台) */
  metricDisplay?: string;
  showStatus?: boolean;
}) {
  const e = entry;
  return (
    <button
      type="button"
      onClick={() => onOpen(e.id)}
      className="group flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white/90 p-2.5 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
        {e.coverFileId ? (
          <img src={showcaseFileUrl(e.coverFileId)} alt={e.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        {rank !== undefined && (
          <span
            className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            style={{ backgroundColor: rank <= 3 ? MEDAL_COLORS[rank - 1] : "#9ca3af" }}
          >
            {rank}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="line-clamp-1 flex-1 text-sm font-medium text-gray-900 group-hover:text-[var(--party-primary)]">
            {e.title}
          </h4>
          {showStatus && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ENTRY_STATUS_CHIP[e.status]}`}>
              {ENTRY_STATUS_LABEL[e.status]}
            </span>
          )}
        </div>
        {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{e.summary}</p>}
        {showStatus && e.status === "rejected" && e.rejectReason && (
          <p className="mt-1 line-clamp-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">
            驳回:{e.rejectReason}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
          <span className="truncate">{e.authorName}</span>
          {metricDisplay && (
            <span className="shrink-0 font-medium text-[var(--party-primary)]">{metricDisplay}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <ThumbsUp className="h-3.5 w-3.5" />
            {e.likeCount}
          </span>
        </div>
      </div>
    </button>
  );
}
