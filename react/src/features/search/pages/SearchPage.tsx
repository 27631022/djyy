import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AwardIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  HelpCircleIcon,
  ImageIcon,
  LayoutGridIcon,
  SearchIcon,
  TrophyIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { highlightText } from "@/shared/lib/highlight";
import { searchApi, SEARCH_TYPE_LABEL, type SearchHit, type SearchHitType } from "../api";

const TYPE_ICON: Record<SearchHitType, typeof SearchIcon> = {
  nav: LayoutGridIcon,
  knowledge: BookOpenIcon,
  faq: HelpCircleIcon,
  "showcase-stage": TrophyIcon,
  "showcase-entry": ImageIcon,
  certificate: AwardIcon,
};

/** 展示 tab:知识(文章+FAQ)、晒场(晒台+作品)各合并为一个 tab */
type TabKey = "all" | "nav" | "knowledge" | "showcase" | "certificate";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "nav", label: "应用" },
  { key: "knowledge", label: "知识" },
  { key: "showcase", label: "先锋晒场" },
  { key: "certificate", label: "我的证书" },
];

/** 命中类型 → 所属展示 tab(「全部」分组卡的「查看全部」跳转用) */
const TYPE_TO_TAB: Record<SearchHitType, TabKey> = {
  nav: "nav",
  knowledge: "knowledge",
  faq: "knowledge",
  "showcase-stage": "showcase",
  "showcase-entry": "showcase",
  certificate: "certificate",
};

/** 「全部」tab 的分组展示顺序 */
const GROUP_ORDER: SearchHitType[] = [
  "nav",
  "knowledge",
  "faq",
  "showcase-stage",
  "showcase-entry",
  "certificate",
];

function useOpenHit() {
  const navigate = useNavigate();
  return (hit: SearchHit) => {
    if (/^https?:\/\//.test(hit.url)) {
      window.open(hit.url, "_blank", "noopener,noreferrer");
    } else {
      navigate(hit.url);
    }
  };
}

/** 结果行:图标 + 标题(高亮)+ 补充信息/摘要(高亮) */
function ResultRow({ hit, q, onOpen }: { hit: SearchHit; q: string; onOpen: (hit: SearchHit) => void }) {
  const Icon = TYPE_ICON[hit.type];
  return (
    <button
      onClick={() => onOpen(hit)}
      className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-party-soft transition-colors group border-b border-[#F3F4F6] last:border-b-0"
    >
      <Icon className="w-4.5 h-4.5 mt-1 text-[#9CA3AF] group-hover:text-[var(--party-primary)] flex-shrink-0 transition-colors" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-[#1A1A1A]">{highlightText(hit.title, q)}</span>
        {hit.snippet && (
          <span className="block text-sm text-[#6B7280] mt-0.5 line-clamp-2">
            {highlightText(hit.snippet, q)}
          </span>
        )}
        {hit.extra && <span className="block text-xs text-[#9CA3AF] mt-1">{hit.extra}</span>}
      </span>
    </button>
  );
}

/** 单类型区块:分页搜索 + 「加载更多」 */
function TypeSection({ q, type }: { q: string; type: SearchHitType }) {
  const openHit = useOpenHit();
  const list = useInfiniteQuery({
    queryKey: ["search", "type", type, q],
    queryFn: ({ pageParam }) => searchApi.searchType(q, type, pageParam, 10),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: !!q,
    staleTime: 30 * 1000,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  if (list.isPending) {
    return <p className="px-5 py-4 text-sm text-[#9CA3AF]">正在搜索{SEARCH_TYPE_LABEL[type]}…</p>;
  }
  if (total === 0) {
    return (
      <p className="px-5 py-4 text-sm text-[#9CA3AF]">
        暂无「{SEARCH_TYPE_LABEL[type]}」相关结果
      </p>
    );
  }
  return (
    <section className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden mb-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFB]">
        <span className="text-sm font-semibold text-[#374151]">{SEARCH_TYPE_LABEL[type]}</span>
        <span className="text-xs text-[#9CA3AF]">共 {total} 条</span>
      </div>
      {items.map((hit) => (
        <ResultRow key={`${hit.type}-${hit.id}`} hit={hit} q={q} onOpen={openHit} />
      ))}
      {list.hasNextPage && (
        <button
          onClick={() => list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className="w-full py-2.5 text-sm text-[var(--party-primary)] font-medium hover:bg-party-soft transition-colors border-t border-[#F0F0F0] disabled:opacity-50"
        >
          {list.isFetchingNextPage ? "加载中…" : "加载更多"}
        </button>
      )}
    </section>
  );
}

/** 「全部」tab:每组前 10 条的分组卡 + 「查看全部」切对应 tab */
function AllGroups({ q, onPickTab }: { q: string; onPickTab: (t: TabKey) => void }) {
  const openHit = useOpenHit();
  const all = useQuery({
    queryKey: ["search", "all", q],
    queryFn: () => searchApi.searchAll(q),
    enabled: !!q,
    staleTime: 30 * 1000,
  });
  if (all.isPending) return <p className="py-10 text-center text-sm text-[#9CA3AF]">正在全站搜索…</p>;
  const groups = [...(all.data?.groups ?? [])].sort(
    (a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type),
  );
  if (groups.length === 0) {
    return (
      <div className="py-16 text-center">
        <SearchIcon className="w-10 h-10 mx-auto text-[#D1D5DB] mb-3" />
        <p className="text-[#6B7280]">没有找到「{q}」相关内容</p>
        <p className="text-sm text-[#9CA3AF] mt-1">换个关键词,或检查是否有错别字</p>
      </div>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.type} className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0F0] bg-[#FAFAFB]">
            <span className="text-sm font-semibold text-[#374151]">{SEARCH_TYPE_LABEL[g.type]}</span>
            {g.total > g.items.length ? (
              <button
                onClick={() => onPickTab(TYPE_TO_TAB[g.type])}
                className="text-xs text-[var(--party-primary)] hover:underline"
              >
                查看全部 {g.total} 条 →
              </button>
            ) : (
              <span className="text-xs text-[#9CA3AF]">共 {g.total} 条</span>
            )}
          </div>
          {g.items.map((hit) => (
            <ResultRow key={`${hit.type}-${hit.id}`} hit={hit} q={q} onOpen={openHit} />
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * 全站搜索结果页(/search?q=&type=):首页/知识门户搜索框回车落地。
 * tab 状态进 URL(可链接可回退);「全部」=分组卡,单 tab=分页加载更多。
 */
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const rawTab = searchParams.get("type") ?? "all";
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "all";
  const [input, setInput] = useState(q);

  function apply(nextQ: string, nextTab: TabKey) {
    const params: Record<string, string> = {};
    if (nextQ.trim()) params.q = nextQ.trim();
    if (nextTab !== "all") params.type = nextTab;
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* 顶栏:返回 + 搜索框 */}
      <header className="bg-white border-b border-[#E9E9E9] sticky top-0 z-30">
        <div className="max-w-[860px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[var(--party-primary)] transition-colors flex-shrink-0"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            首页
          </Link>
          <form
            className="flex-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              apply(input, tab);
            }}
          >
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="搜索知识、应用、晒场、证书…"
                className="pl-9 h-10"
              />
            </div>
            <Button
              type="submit"
              className="h-10 px-5 text-white"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              搜索
            </Button>
          </form>
        </div>
        {/* tab 行 */}
        <div className="max-w-[860px] mx-auto px-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => apply(q, t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-[var(--party-primary)] text-[var(--party-primary)]"
                  : "border-transparent text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 py-6">
        {!q ? (
          <div className="py-16 text-center">
            <SearchIcon className="w-10 h-10 mx-auto text-[#D1D5DB] mb-3" />
            <p className="text-[#6B7280]">输入关键词,搜索全站内容</p>
            <p className="text-sm text-[#9CA3AF] mt-1">知识文章、热点问答、应用入口、先锋晒场、我的证书</p>
          </div>
        ) : tab === "all" ? (
          <AllGroups q={q} onPickTab={(t) => apply(q, t)} />
        ) : tab === "nav" ? (
          <TypeSection q={q} type="nav" />
        ) : tab === "knowledge" ? (
          <>
            <TypeSection q={q} type="knowledge" />
            <TypeSection q={q} type="faq" />
          </>
        ) : tab === "showcase" ? (
          <>
            <TypeSection q={q} type="showcase-stage" />
            <TypeSection q={q} type="showcase-entry" />
          </>
        ) : (
          <TypeSection q={q} type="certificate" />
        )}
      </main>
    </div>
  );
}
