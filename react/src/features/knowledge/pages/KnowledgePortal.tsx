import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  BookOpenIcon,
  ClockIcon,
  EyeIcon,
  FlameIcon,
  HomeIcon,
  PencilLineIcon,
  SearchIcon,
  SparklesIcon,
  StarIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/stores/auth";
import { knowledgeApi, type ArticleListItem } from "../api";
import { ArticleCard } from "./../components/ArticleCard";

const PAGE_SIZE = 12;

/**
 * 知识门户(/knowledge):左侧领域分类树 + 顶部搜索 + 类型/标签筛选 + 最新/最热 + 分页。
 * 搜索词走 URL ?q=(NavPage 首页搜索框 P2 起跳转到这里)。
 */
export default function KnowledgePortal() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const [input, setInput] = useState(q);
  const [categoryId, setCategoryId] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [sort, setSort] = useState<"latest" | "hot">("latest");

  const categories = useQuery({ queryKey: ["knowledge", "categories"], queryFn: knowledgeApi.listCategories });
  const types = useQuery({ queryKey: ["knowledge", "types"], queryFn: knowledgeApi.listTypes });
  // 无限滚动:筛选条件进 queryKey,变了自动重置到第一页
  const list = useInfiniteQuery({
    queryKey: ["knowledge", "articles", { q, tag, categoryId, typeCode, sort }],
    queryFn: ({ pageParam }) =>
      knowledgeApi.listArticles({
        q: q || undefined,
        tag: tag || undefined,
        categoryId: categoryId || undefined,
        typeCode: typeCode || undefined,
        sort,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  // 右侧栏三块榜单(独立于中间筛选,展示全局)
  const fav = useQuery({
    queryKey: ["knowledge", "side", "fav"],
    queryFn: () => knowledgeApi.listArticles({ favorite: true, pageSize: 6 }),
    enabled: !!me,
  });
  const hot = useQuery({
    queryKey: ["knowledge", "side", "hot"],
    queryFn: () => knowledgeApi.listArticles({ sort: "hot", pageSize: 6 }),
  });
  const latest = useQuery({
    queryKey: ["knowledge", "side", "latest"],
    queryFn: () => knowledgeApi.listArticles({ sort: "latest", pageSize: 6 }),
  });

  const canManage = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("knowledge:manage");
  const openArticle = (id: string) => navigate(`/knowledge/articles/${id}`);

  function applySearch(next: string) {
    setSearchParams(next.trim() ? { q: next.trim() } : {}, { replace: true });
  }

  function pickCategory(id: string) {
    setCategoryId((cur) => (cur === id ? "" : id));
  }

  const total = list.data?.pages[0]?.total ?? 0;

  // 底部哨兵进入视口 → 自动加载下一页(无限滚动)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <HomeIcon className="w-4 h-4" /> 首页
          </button>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <BookOpenIcon className="w-5 h-5 text-[var(--party-primary)]" />
            知识园地
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/knowledge/mine")}>
              <UserIcon className="w-4 h-4 mr-1" /> 我的发布 / 收藏
            </Button>
            <Button
              size="sm"
              className="bg-[var(--party-primary)] hover:opacity-90 text-white"
              onClick={() => navigate("/knowledge/edit")}
            >
              <PencilLineIcon className="w-4 h-4 mr-1" /> 发布知识
            </Button>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/knowledge")}>
                管理
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 搜索区 */}
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applySearch(input);
          }}
          className="relative max-w-2xl mx-auto"
        >
          <SearchIcon className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索条例、制度、经验、操作指南…(标题 / 全文 / 标签)"
            className="pl-11 pr-24 h-12 rounded-full text-[15px] shadow-sm border-gray-200"
          />
          <Button
            type="submit"
            className="absolute right-1.5 top-1.5 h-9 rounded-full px-5 bg-[var(--party-primary)] hover:opacity-90 text-white"
          >
            搜索
          </Button>
        </form>
        {(q || tag) && (
          <div className="max-w-2xl mx-auto mt-2 flex items-center gap-2 text-sm text-gray-500">
            {q && (
              <span className="flex items-center gap-1">
                关键词「{q}」
                <button type="button" onClick={() => { setInput(""); applySearch(""); }} aria-label="清除关键词">
                  <XIcon className="w-3.5 h-3.5 hover:text-gray-700" />
                </button>
              </span>
            )}
            {tag && (
              <span className="flex items-center gap-1">
                标签 #{tag}
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("tag");
                    setSearchParams(next, { replace: true });
                  }}
                  aria-label="清除标签"
                >
                  <XIcon className="w-3.5 h-3.5 hover:text-gray-700" />
                </button>
              </span>
            )}
            <span className="ml-auto">共 {total} 篇</span>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-16 grid gap-6 items-start grid-cols-1 lg:grid-cols-[200px_1fr] xl:grid-cols-[200px_1fr_280px]">
        {/* 左:领域分类树 */}
        <aside className="hidden lg:block sticky top-20 rounded-xl border border-gray-100 bg-white/90 shadow-sm p-3">
          <div className="px-2 pb-2 text-xs font-medium text-gray-400">领域分类</div>
          <button
            type="button"
            onClick={() => pickCategory("")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              categoryId === "" ? "bg-party-soft text-[var(--party-primary)] font-medium" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            全部知识
          </button>
          {(categories.data ?? []).map((root) => (
            <div key={root.id}>
              <button
                type="button"
                onClick={() => pickCategory(root.id)}
                className={`w-full flex items-center text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  categoryId === root.id
                    ? "bg-party-soft text-[var(--party-primary)] font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex-1 truncate">{root.name}</span>
                <span className="text-[11px] text-gray-400">{root.articleCount}</span>
              </button>
              {root.children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  className={`w-full flex items-center text-left pl-7 pr-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                    categoryId === c.id
                      ? "bg-party-soft text-[var(--party-primary)] font-medium"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-gray-400">{c.articleCount}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* 右:筛选 + 列表 */}
        <main>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <button
              type="button"
              onClick={() => setTypeCode("")}
              className={`px-3 py-1 rounded-full text-[13px] border transition-colors ${
                typeCode === ""
                  ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              全部类型
            </button>
            {(types.data ?? []).map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setTypeCode((cur) => (cur === t.code ? "" : t.code))}
                className={`px-3 py-1 rounded-full text-[13px] border transition-colors ${
                  typeCode === t.code
                    ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t.name}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-[13px]">
              <span className="text-gray-400">共 {total} 篇</span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSort("latest")}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${
                    sort === "latest" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <SparklesIcon className="w-3.5 h-3.5" /> 最新
                </button>
                <button
                  type="button"
                  onClick={() => setSort("hot")}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full transition-colors ${
                    sort === "hot" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <FlameIcon className="w-3.5 h-3.5" /> 最热
                </button>
              </span>
            </span>
          </div>

          {list.isLoading ? (
            <div className="py-24 text-center text-sm text-gray-400">加载中…</div>
          ) : items.length === 0 ? (
            <div className="py-24 text-center">
              <BookOpenIcon className="w-10 h-10 mx-auto text-gray-200" />
              <div className="mt-3 text-sm text-gray-400">
                {q || tag || categoryId || typeCode ? "没有找到匹配的知识,换个条件试试" : "还没有知识内容,点右上角「发布知识」写第一篇"}
              </div>
            </div>
          ) : (
            /* 单列信息流,下滑自动加载(哨兵进视口触发 fetchNextPage) */
            <>
              <div className="space-y-4">
                {items.map((a) => (
                  <ArticleCard key={a.id} article={a} onOpen={openArticle} />
                ))}
              </div>
              <div ref={sentinelRef} className="h-4" />
              {isFetchingNextPage && (
                <div className="py-4 text-center text-sm text-gray-400">加载中…</div>
              )}
              {!hasNextPage && (
                <div className="py-4 text-center text-xs text-gray-300">已到底 · 共 {total} 篇</div>
              )}
            </>
          )}
        </main>

        {/* 右:收藏 / 热点 / 最新 */}
        <aside className="hidden xl:block sticky top-20 space-y-4">
          <SideCard
            title="我的收藏"
            icon={<StarIcon className="w-3.5 h-3.5 text-amber-500" />}
            items={me ? fav.data?.items ?? [] : []}
            emptyText={me ? "还没有收藏,阅读时点收藏即可(功能上线中)" : "登录后可收藏"}
            onOpen={openArticle}
          />
          <SideCard
            title="热点"
            icon={<FlameIcon className="w-3.5 h-3.5 text-red-500" />}
            items={hot.data?.items ?? []}
            emptyText="暂无数据"
            onOpen={openArticle}
            rank
          />
          <SideCard
            title="最新"
            icon={<ClockIcon className="w-3.5 h-3.5 text-[var(--party-primary)]" />}
            items={latest.data?.items ?? []}
            emptyText="暂无数据"
            onOpen={openArticle}
          />
        </aside>
      </div>
    </div>
  );
}

/** 右侧栏卡片:紧凑标题列表(热点带名次色标) */
function SideCard({
  title,
  icon,
  items,
  emptyText,
  onOpen,
  rank = false,
}: {
  title: string;
  icon: ReactNode;
  items: ArticleListItem[];
  emptyText: string;
  onOpen: (id: string) => void;
  rank?: boolean;
}) {
  const rankColor = (i: number) =>
    i === 0 ? "bg-[#F5A623] text-white" : i === 1 ? "bg-[#C0C0C0] text-white" : i === 2 ? "bg-[#CD7F32] text-white" : "bg-gray-100 text-gray-400";
  return (
    <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-3">
      <div className="flex items-center gap-1.5 px-1 pb-2 text-xs font-medium text-gray-500">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-1 py-3 text-xs text-gray-300">{emptyText}</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(a.id)}
              className="w-full text-left px-1.5 py-1.5 rounded-lg hover:bg-gray-50 flex items-start gap-2 transition-colors"
            >
              <span
                className={`shrink-0 mt-0.5 w-4 h-4 rounded text-[11px] flex items-center justify-center ${
                  rank ? rankColor(i) : "text-gray-300"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] leading-tight text-gray-700 line-clamp-2 group-hover:text-[var(--party-primary)]">
                  {a.title}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="truncate">{a.categoryName}</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    <EyeIcon className="w-3 h-3" />
                    {a.viewCount}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
