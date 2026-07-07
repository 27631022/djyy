import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArchiveIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  GitBranchIcon,
  HelpCircleIcon,
  HomeIcon,
  LinkIcon,
  ListIcon,
  MessageCircleWarningIcon,
  MessageSquareIcon,
  PencilLineIcon,
  PinIcon,
  SparklesIcon,
  TypeIcon,
  StarIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { api } from "@/shared/api/client";
import { downloadBlob } from "@/shared/lib/download";
import { flashHighlight, useLocateQuery } from "@/shared/hooks/useLocateQuery";
import { Button } from "@/shared/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";
import {
  ARTICLE_STATUS_CHIP,
  ARTICLE_STATUS_LABEL,
  knowledgeApi,
  knowledgeErrMsg,
  type ArticleDetail,
} from "../api";
import { FONT_OPTIONS, initialFontPx, storeFontPx } from "../readingFont";
import { MarkdownView } from "../components/MarkdownView";
import { extractToc } from "../components/markdownToc";
import { CommentSection } from "../components/CommentSection";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { useViewTracking } from "../useViewTracking";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 仅放行 http(s) 链接;其余(javascript:/data: 等)一律不作为可点链接 —— 纵深防御,后端也已校验 */
function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url : null;
}

// 阅读字号档位/存取抽到 ../readingFont —— 与「个人设置 · 阅读偏好」共用同一 localStorage key

/** 外壳:取数 → key 重挂载内层(零 effect 同步范式) */
export default function KnowledgeArticlePage() {
  const { id = "" } = useParams();
  const detail = useQuery({
    queryKey: ["knowledge", "article", id],
    queryFn: () => knowledgeApi.getArticle(id),
    enabled: !!id,
  });

  if (detail.isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">加载中…</div>;
  }
  if (!detail.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-gray-400">
        文章不存在或无权查看
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>返回</Button>
      </div>
    );
  }
  return <ArticleView key={detail.data.id} article={detail.data} />;
}

function ArticleView({ article: a }: { article: ArticleDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toc = extractToc(a.contentMd);
  const latestPublished = a.versions.find((v) => v.status === "published");
  const safeSource = safeHttpUrl(a.sourceUrl);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 阅读字号(读者可选,localStorage 记住;驱动正文/导读/问答缩放)
  const [fontPx, setFontPx] = useState<number>(initialFontPx);
  function pickFont(px: number) {
    setFontPx(px);
    storeFontPx(px);
  }

  // 从搜索联想带来的关键词 → 进文章后定位并高亮「相关行」(逻辑抽到 shared/hooks/useLocateQuery,全站搜索共用)
  const [searchParams] = useSearchParams();
  const highlightQ = (searchParams.get("q") ?? "").trim();
  const faqParam = (searchParams.get("faq") ?? "").trim();
  const mainRef = useRef<HTMLElement>(null);
  // ?faq= 深链优先(FAQ 折叠在 Radix 里 TreeWalker 扫不到,且双滚动打架),此时跳过正文定位
  useLocateQuery(mainRef, faqParam ? "" : highlightQ, a.id);

  // FAQ 展开即计一次点击热度(每次进入每条只计一次,避免反复开合刷量)
  const clickedFaqs = useRef(new Set<string>());
  const onFaqOpen = useCallback(
    (faqId: string) => {
      if (!faqId || clickedFaqs.current.has(faqId)) return;
      clickedFaqs.current.add(faqId);
      knowledgeApi.recordFaqClick(a.id, faqId).catch(() => {});
    },
    [a.id],
  );

  // FAQ 手风琴受控:?faq= 深链(全站搜索 FAQ 命中)初始展开;用户操作后以用户为准
  const [userFaq, setUserFaq] = useState<string | null>(null);
  const openFaq = userFaq ?? faqParam;

  // ?faq= 深链:滚动定位到该问答 + 金黄闪烁 + 计一次点击(视为点开)
  useEffect(() => {
    if (!faqParam) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`faq-${faqParam}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        flashHighlight(el);
      }
    });
    onFaqOpen(faqParam);
    return () => cancelAnimationFrame(raf);
  }, [a.id, faqParam, onFaqOpen]);

  // 浏览埋点(进入记一次 + 累计可见时长,离开 beacon 回填)
  useViewTracking(a.id);

  const react = useMutation({
    mutationFn: ({ type, on }: { type: "like" | "favorite"; on: boolean }) =>
      knowledgeApi.setReaction(a.id, type, on),
    onSuccess: (state) => {
      // 用返回的最新状态就地更新详情缓存,避免整篇重取
      qc.setQueryData<ArticleDetail>(["knowledge", "article", a.id], (cur) =>
        cur ? { ...cur, ...state } : cur,
      );
      qc.invalidateQueries({ queryKey: ["knowledge", "side"] });
      qc.invalidateQueries({ queryKey: ["knowledge", "mine"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "操作失败")),
  });

  async function downloadAttachment(attId: string, fileId: string, name: string) {
    try {
      await knowledgeApi.attachmentDownloaded(attId).catch(() => {});
      const blob = await api
        .get<Blob>(`/public/knowledge/files/${fileId}`, { responseType: "blob", timeout: 120_000 })
        .then((r) => r.data);
      downloadBlob(blob, name);
    } catch (e) {
      toast.error(knowledgeErrMsg(e, "下载失败,请重试"));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/knowledge")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeftIcon className="w-4 h-4" /> 知识园地
          </button>
          <span className="text-gray-200">|</span>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)] shrink-0"
          >
            <HomeIcon className="w-4 h-4" /> 首页
          </button>
          {/* 文章名固定在顶端(随标题栏常驻,正文在其下滚动) */}
          <div className="hidden sm:block flex-1 min-w-0 px-2">
            <span className="block truncate font-semibold text-gray-800" title={a.title}>
              {a.title}
              {a.versionLabel && <span className="ml-1.5 text-xs font-normal text-amber-600">({a.versionLabel})</span>}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* 阅读字号选择 */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <span className="hidden sm:flex items-center gap-1 pl-2 pr-1 text-gray-400" title="阅读字号">
                <TypeIcon className="w-3.5 h-3.5" />
              </span>
              {FONT_OPTIONS.map((o) => (
                <button
                  key={o.px}
                  type="button"
                  onClick={() => pickFont(o.px)}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    fontPx === o.px
                      ? "bg-party-soft text-[var(--party-primary)] font-medium"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {a.canEdit && a.status !== "archived" && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/knowledge/edit/${a.id}`)}>
                <PencilLineIcon className="w-4 h-4 mr-1" /> 编辑
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-[1fr_240px] gap-8 items-start">
        <main ref={mainRef} className="min-w-0">
          {/* 已归档横幅 */}
          {a.status === "archived" && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <ArchiveIcon className="w-4 h-4 shrink-0" />
              此版本已归档{a.versionLabel ? `(${a.versionLabel})` : ""},内容可能已被新版本取代。
              {latestPublished && (
                <button
                  type="button"
                  onClick={() => navigate(`/knowledge/articles/${latestPublished.id}`)}
                  className="ml-auto shrink-0 text-[var(--party-primary)] font-medium hover:underline"
                >
                  查看最新版 →
                </button>
              )}
            </div>
          )}
          {a.status !== "published" && a.status !== "archived" && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded ${ARTICLE_STATUS_CHIP[a.status]}`}>
                {ARTICLE_STATUS_LABEL[a.status]}
              </span>
              {a.status === "rejected" && a.rejectReason && (
                <span className="text-red-500">驳回原因:{a.rejectReason}</span>
              )}
            </div>
          )}

          {/* 标题与元信息 */}
          <h1 className="text-3xl font-bold text-gray-900 leading-snug">
            {a.title}
            {a.versionLabel && <span className="ml-2 text-base font-normal text-amber-600">({a.versionLabel})</span>}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-[13px] text-gray-400 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-party-soft text-[var(--party-primary)]">{a.categoryName}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{a.typeName}</span>
            <span>{a.authorName}</span>
            <span>{fmtDateTime(a.publishedAt ?? a.createdAt)}</span>
            {safeSource && (
              <a
                href={safeSource}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-[var(--party-primary)]"
              >
                <LinkIcon className="w-3.5 h-3.5" /> 原文
              </a>
            )}
            <span className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1"><EyeIcon className="w-4 h-4" />{a.viewCount}</span>
              <span className="flex items-center gap-1"><ThumbsUpIcon className="w-4 h-4" />{a.likeCount}</span>
              <span className="flex items-center gap-1"><StarIcon className="w-4 h-4" />{a.favoriteCount}</span>
              <span className="flex items-center gap-1"><MessageSquareIcon className="w-4 h-4" />{a.commentCount}</span>
            </span>
          </div>

          {/* 导读 */}
          {a.summary && (
            <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 mb-1.5">
                <SparklesIcon className="w-4 h-4" /> 导读
              </div>
              <p
                className="leading-[1.85] text-gray-700 whitespace-pre-wrap"
                style={{ fontSize: `${fontPx}px` }}
              >
                {a.summary}
              </p>
            </div>
          )}

          {/* 正文 */}
          <article className="mt-4 rounded-xl border border-gray-100 bg-white/90 shadow-sm px-6 py-5">
            <MarkdownView md={a.contentMd} fontPx={fontPx} />
          </article>

          {/* 标签 */}
          {a.tags.length > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {a.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => navigate(`/knowledge?tag=${encodeURIComponent(t)}`)}
                  className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs hover:bg-party-soft hover:text-[var(--party-primary)] transition-colors"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {/* 常见问题答疑(P4 AI 生成后展示) */}
          {a.faqs.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-100 bg-white/90 shadow-sm px-6 py-4">
              <div className="flex items-center gap-1.5 font-medium text-gray-800 mb-1">
                <HelpCircleIcon className="w-4 h-4 text-[var(--party-primary)]" /> 常见问题答疑
              </div>
              <Accordion
                type="single"
                collapsible
                value={openFaq}
                onValueChange={(v) => {
                  setUserFaq(v);
                  onFaqOpen(v);
                }}
              >
                {a.faqs.map((f) => (
                  <AccordionItem key={f.id} value={f.id} id={`faq-${f.id}`}>
                    <AccordionTrigger className="text-left" style={{ fontSize: `${fontPx}px` }}>
                      {f.pinned && <PinIcon className="w-3.5 h-3.5 mr-1 shrink-0 text-[var(--party-primary)] fill-current" />}
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent
                      className="leading-[1.85] text-gray-600 whitespace-pre-wrap"
                      style={{ fontSize: `${fontPx}px` }}
                    >
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* 附件(模板下载) */}
          {a.attachments.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-100 bg-white/90 shadow-sm px-6 py-4">
              <div className="flex items-center gap-1.5 font-medium text-gray-800 mb-2">
                <FileTextIcon className="w-4 h-4 text-[var(--party-primary)]" /> 附件与模板下载
              </div>
              <div className="divide-y divide-gray-50">
                {a.attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 py-2.5">
                    <FileTextIcon className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="flex-1 truncate text-sm text-gray-700">{att.name}</span>
                    <span className="text-xs text-gray-400">{fmtSize(att.size)}</span>
                    <span className="text-xs text-gray-300">已下载 {att.downloadCount}</span>
                    <Button size="sm" variant="outline" onClick={() => void downloadAttachment(att.id, att.fileId, att.name)}>
                      <DownloadIcon className="w-3.5 h-3.5 mr-1" /> 下载
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 历史版本 */}
          {a.versions.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-100 bg-white/90 shadow-sm px-6 py-4">
              <div className="flex items-center gap-1.5 font-medium text-gray-800 mb-2">
                <GitBranchIcon className="w-4 h-4 text-[var(--party-primary)]" /> 历史版本
              </div>
              <div className="divide-y divide-gray-50">
                {a.versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => navigate(`/knowledge/articles/${v.id}`)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50/60 rounded px-1 transition-colors"
                  >
                    <span className="flex-1 truncate text-sm text-gray-700">
                      {v.title}
                      {v.versionLabel && <span className="ml-1.5 text-xs text-amber-600">({v.versionLabel})</span>}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${ARTICLE_STATUS_CHIP[v.status]}`}>
                      {ARTICLE_STATUS_LABEL[v.status]}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDateTime(v.publishedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 操作栏:点赞 / 收藏 / 吐槽 */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={react.isPending}
              onClick={() => react.mutate({ type: "like", on: !a.liked })}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full border text-sm transition-colors ${
                a.liked
                  ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <ThumbsUpIcon className={`w-4 h-4 ${a.liked ? "fill-current" : ""}`} /> 点赞 {a.likeCount || ""}
            </button>
            <button
              type="button"
              disabled={react.isPending}
              onClick={() => react.mutate({ type: "favorite", on: !a.favorited })}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full border text-sm transition-colors ${
                a.favorited
                  ? "border-amber-400 bg-amber-50 text-amber-600"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              <StarIcon className={`w-4 h-4 ${a.favorited ? "fill-current" : ""}`} /> 收藏 {a.favoriteCount || ""}
            </button>
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-gray-200 text-sm text-gray-500 hover:border-gray-300 transition-colors"
            >
              <MessageCircleWarningIcon className="w-4 h-4" /> 吐槽
            </button>
          </div>

          {/* 评论 */}
          <div className="mt-6">
            <CommentSection articleId={a.id} />
          </div>
          {feedbackOpen && <FeedbackDialog articleId={a.id} onClose={() => setFeedbackOpen(false)} />}
        </main>

        {/* 右:目录 */}
        <aside className="sticky top-20 hidden lg:block">
          {toc.length >= 2 && (
            <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
                <ListIcon className="w-3.5 h-3.5" /> 本文目录
              </div>
              <nav className="space-y-1 max-h-[60vh] overflow-y-auto">
                {toc.map((t, i) => (
                  <a
                    key={`${t.id}-${i}`}
                    href={`#${t.id}`}
                    className={`block text-[13px] leading-5 text-gray-500 hover:text-[var(--party-primary)] truncate ${
                      t.level === 1 ? "" : t.level === 2 ? "pl-3" : "pl-6"
                    }`}
                  >
                    {t.text}
                  </a>
                ))}
              </nav>
            </div>
          )}
          <div className="mt-4 rounded-xl border border-gray-100 bg-white/90 shadow-sm p-4 text-xs text-gray-400 leading-5">
            <BookOpenIcon className="w-4 h-4 text-gray-300 mb-1" />
            知识由 {a.authorName} 分享
            {a.reviewedByName && <div>审核:{a.reviewedByName}</div>}
            {a.maintainers.length > 0 && <div>维护:{a.maintainers.map((m) => m.userName).join("、")}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
