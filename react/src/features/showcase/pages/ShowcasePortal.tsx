import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FlameIcon, HomeIcon, PencilLineIcon, SearchIcon, SparklesIcon, Trophy, UserIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/stores/auth";
import { showcaseApi } from "../api";
import { StageCard } from "../components/StageCard";

const PAGE_SIZE = 12;

/**
 * 先锋晒场门户(/showcase):六榜分类 tab + 搜索 + 最新/最热 + 晒台卡流(无限滚动)。
 * 「发起晒台」按钮仅 showcase:publish 可见(投稿参晒人人可以,在晒台详情页)。
 */
export default function ShowcasePortal() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState<"latest" | "hot">("latest");

  const categories = useQuery({ queryKey: ["showcase", "categories"], queryFn: showcaseApi.listCategories });
  const list = useInfiniteQuery({
    queryKey: ["showcase", "stages", { q, categoryId, sort }],
    queryFn: ({ pageParam }) =>
      showcaseApi.listStages({
        q: q || undefined,
        categoryId: categoryId || undefined,
        sort,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const perms = me?.permissions ?? [];
  const canPublish = !!me?.isPlatformAdmin || perms.includes("showcase:publish");
  const canManage = !!me?.isPlatformAdmin || perms.includes("showcase:manage");

  // 底部哨兵 → 自动加载下一页
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
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <HomeIcon className="h-4 w-4" /> 首页
          </button>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <Trophy className="h-5 w-5 text-[var(--party-primary)]" />
            先锋晒场
          </div>
          <span className="hidden text-xs text-gray-400 md:inline">人人争先进 · 个个晒实绩</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/showcase/mine")}>
              <UserIcon className="mr-1 h-4 w-4" /> 我的参晒 / 晒台
            </Button>
            {canPublish && (
              <Button
                size="sm"
                className="bg-[var(--party-primary)] text-white hover:opacity-90"
                onClick={() => navigate("/showcase/stages/new")}
              >
                <PencilLineIcon className="mr-1 h-4 w-4" /> 发起晒台
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/showcase/stages")}>
                管理
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 搜索 */}
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
          }}
          className="relative mx-auto max-w-2xl"
        >
          <SearchIcon className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索晒台(标题 / 简介 / 台主)…"
            className="h-12 rounded-full border-gray-200 pl-11 pr-24 text-[15px] shadow-sm"
          />
          <Button
            type="submit"
            className="absolute right-1.5 top-1.5 h-9 rounded-full bg-[var(--party-primary)] px-5 text-white hover:opacity-90"
          >
            搜索
          </Button>
        </form>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16">
        {/* 六榜分类 tab */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryId("")}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              categoryId === ""
                ? "border-[var(--party-primary)] bg-[var(--party-primary)] text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            全部晒场
          </button>
          {(categories.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId((cur) => (cur === c.id ? "" : c.id))}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                categoryId === c.id
                  ? "border-[var(--party-primary)] bg-[var(--party-primary)] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
              title={c.description ?? undefined}
            >
              {c.name}
              <span className={`ml-1 text-xs ${categoryId === c.id ? "text-white/70" : "text-gray-400"}`}>
                {c.stageCount}
              </span>
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 text-[13px]">
            <span className="mr-1 text-gray-400">共 {total} 个晒台</span>
            <button
              type="button"
              onClick={() => setSort("latest")}
              className={`flex items-center gap-1 rounded-full px-3 py-1 transition-colors ${
                sort === "latest" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <SparklesIcon className="h-3.5 w-3.5" /> 最新
            </button>
            <button
              type="button"
              onClick={() => setSort("hot")}
              className={`flex items-center gap-1 rounded-full px-3 py-1 transition-colors ${
                sort === "hot" ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <FlameIcon className="h-3.5 w-3.5" /> 最热
            </button>
          </span>
        </div>

        {/* 晒台卡流 */}
        {list.isLoading ? (
          <div className="py-24 text-center text-sm text-gray-400">加载中…</div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center">
            <Trophy className="mx-auto h-10 w-10 text-gray-200" />
            <div className="mt-3 text-sm text-gray-400">
              {q || categoryId
                ? "没有找到匹配的晒台,换个条件试试"
                : canPublish
                  ? "还没有晒台,点右上角「发起晒台」摆第一个擂台"
                  : "还没有晒台,等台主们发起后就能来参晒了"}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <StageCard key={s.id} stage={s} onOpen={(id) => navigate(`/showcase/stages/${id}`)} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-4" />
            {isFetchingNextPage && <div className="py-4 text-center text-sm text-gray-400">加载中…</div>}
            {!hasNextPage && items.length > 0 && (
              <div className="py-4 text-center text-xs text-gray-300">已到底 · 共 {total} 个晒台</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
