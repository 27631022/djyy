import { EyeIcon, MessageSquareIcon, PinIcon, ThumbsUpIcon } from "lucide-react";
import type { ArticleListItem } from "../api";
import { ARTICLE_STATUS_CHIP, ARTICLE_STATUS_LABEL, KNOWLEDGE_LEVEL_LABEL, knowledgeFileUrl } from "../api";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 门户/列表通用文章卡片。showStatus 用于「我的发布」/后台管理(门户只有 published 不显)。
 */
export function ArticleCard({
  article,
  onOpen,
  showStatus = false,
}: {
  article: ArticleListItem;
  onOpen: (id: string) => void;
  showStatus?: boolean;
}) {
  const a = article;
  return (
    <button
      type="button"
      onClick={() => onOpen(a.id)}
      className="group text-left w-full rounded-xl border border-gray-100 bg-white/90 shadow-sm hover:shadow-md hover:border-[var(--party-primary)]/30 transition-all overflow-hidden flex flex-col"
    >
      {a.coverFileId && (
        <img
          src={knowledgeFileUrl(a.coverFileId)}
          alt=""
          loading="lazy"
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          {a.pinned && <PinIcon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--party-primary)]" />}
          <h3 className="flex-1 font-semibold text-[15px] leading-snug text-gray-900 group-hover:text-[var(--party-primary)] transition-colors line-clamp-2">
            {a.title}
            {a.versionLabel && (
              <span className="ml-1.5 text-xs font-normal text-amber-600">({a.versionLabel})</span>
            )}
          </h3>
          {showStatus && (
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] ${ARTICLE_STATUS_CHIP[a.status]}`}>
              {ARTICLE_STATUS_LABEL[a.status]}
            </span>
          )}
        </div>
        {a.excerpt && <p className="text-[13px] text-gray-500 leading-5 line-clamp-2">{a.excerpt}</p>}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-party-soft text-[var(--party-primary)]">
            {a.categoryName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-blue-50 text-blue-600">{a.typeName}</span>
          {a.level && (
            <span className="px-1.5 py-0.5 rounded text-[11px] bg-purple-50 text-purple-600">
              {KNOWLEDGE_LEVEL_LABEL[a.level] ?? a.level}
            </span>
          )}
          {a.tags.slice(0, 3).map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500">
              #{t}
            </span>
          ))}
        </div>
        <div className="mt-auto pt-1 flex items-center gap-3 text-[12px] text-gray-400">
          <span className="truncate">{a.authorName}</span>
          <span>{fmtDate(a.publishedAt ?? a.createdAt)}</span>
          <span className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-0.5"><EyeIcon className="w-3.5 h-3.5" />{a.viewCount}</span>
            <span className="flex items-center gap-0.5"><ThumbsUpIcon className="w-3.5 h-3.5" />{a.likeCount}</span>
            <span className="flex items-center gap-0.5"><MessageSquareIcon className="w-3.5 h-3.5" />{a.commentCount}</span>
          </span>
        </div>
      </div>
    </button>
  );
}
