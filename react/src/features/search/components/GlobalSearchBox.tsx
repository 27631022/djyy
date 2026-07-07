import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  AwardIcon,
  BookOpenIcon,
  ClockIcon,
  HelpCircleIcon,
  ImageIcon,
  LayoutGridIcon,
  LockIcon,
  SearchIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/stores/auth";
import { navApi } from "@/features/nav-category";
import { knowledgeApi } from "@/features/knowledge";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { highlightText } from "@/shared/lib/highlight";
import { highlightMatch, matchesPinyin } from "@/shared/lib/pinyinSearch";
import { searchApi, SEARCH_TYPE_LABEL, type SearchHit, type SearchHitType } from "../api";

const TYPE_ICON: Record<SearchHitType, typeof SearchIcon> = {
  nav: LayoutGridIcon,
  knowledge: BookOpenIcon,
  faq: HelpCircleIcon,
  "showcase-stage": TrophyIcon,
  "showcase-entry": ImageIcon,
  certificate: AwardIcon,
};

/** 静态兜底热门词(未登录 / 热点问答暂无数据时) */
const FALLBACK_HOT_WORDS = [`党章学习`, `两学一做`, `主题教育`, `党费缴纳`, `廉洁自律`, `组织生活`];

const RECENT_KEY = "nav-recent-search";

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(words: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(words));
  } catch {
    /* 隐私模式写不了忽略 */
  }
}

/** 命中行(登录态联想下拉 / 分组内) */
function HitRow({ hit, q, onOpen }: { hit: SearchHit; q: string; onOpen: (hit: SearchHit) => void }) {
  const Icon = TYPE_ICON[hit.type];
  return (
    <button
      // onMouseDown 抢在输入框 blur 前触发,否则面板先关点击落空
      onMouseDown={(e) => {
        e.preventDefault();
        onOpen(hit);
      }}
      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-party-soft transition-colors group"
    >
      <Icon className="w-4 h-4 mt-1 text-[#9CA3AF] group-hover:text-[var(--party-primary)] flex-shrink-0 transition-colors" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-[#1A1A1A] truncate">{highlightText(hit.title, q)}</span>
        {(hit.extra || hit.snippet) && (
          <span className="block text-xs text-[#6B7280] truncate">
            {hit.extra && <span className="text-[#9CA3AF]">{hit.extra}</span>}
            {hit.extra && hit.snippet && <span className="text-[#D1D5DB]"> · </span>}
            {highlightText(hit.snippet, q)}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * 首页全站搜索框(Hero 区):
 * - 登录:防抖联想 GET /search/suggest,分组预览(应用/知识/问答/晒场/证书),点击带 ?q= 跳详情定位;
 * - 未登录:纯前端过滤公开的导航应用项(拼音可搜),提示登录后可搜全站 —— 绝不发受保护请求(401 拦截器会踢走访客);
 * - 回车 → /search?q= 全站搜索结果页(访客经 ProtectedRoute 自然落登录页并回跳)。
 */
export function GlobalSearchBox() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const isLoggedIn = !!me;

  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recentWords, setRecentWords] = useState<string[]>(loadRecent);
  const wrapRef = useRef<HTMLDivElement>(null);

  const deb = useDebouncedValue(input.trim(), 220);

  // 登录态联想(enabled 硬门:未登录/未聚焦/空词都不发)
  const suggest = useQuery({
    queryKey: ["search", "suggest", deb],
    queryFn: () => searchApi.suggest(deb, 3),
    enabled: isLoggedIn && panelOpen && deb.length >= 1,
    staleTime: 30 * 1000,
  });

  // 导航目录(公开接口;与首页目录同 queryKey 缓存共享)—— 未登录联想的数据源
  const navCats = useQuery({
    queryKey: ["nav-categories", "portal"],
    queryFn: () => navApi.listForPortal(),
    staleTime: 60 * 1000,
  });

  // 热门词:登录后用热点问答(与首页热点卡同 queryKey 零成本),没有数据回退静态词
  const hotFaqs = useQuery({
    queryKey: ["knowledge", "hot-faqs", "portal"],
    queryFn: () => knowledgeApi.hotFaqs(8),
    enabled: isLoggedIn,
    staleTime: 60 * 1000,
  });
  const hotWords =
    isLoggedIn && (hotFaqs.data?.length ?? 0) > 0
      ? hotFaqs.data!.slice(0, 6).map((f) => f.q)
      : FALLBACK_HOT_WORDS;

  // 未登录:前端过滤导航应用项(中文子串 + 拼音全拼/首字母)
  const guestHits =
    !isLoggedIn && deb
      ? (navCats.data ?? [])
          .flatMap((c) =>
            c.items
              .filter(
                (it) =>
                  it.url &&
                  it.url !== "#" &&
                  (matchesPinyin(it.label, deb) ||
                    (it.desc ?? "").toLowerCase().includes(deb.toLowerCase())),
              )
              .map((it) => ({ category: c.label, item: it })),
          )
          .slice(0, 8)
      : [];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function recordRecent(word: string) {
    if (!word) return;
    setRecentWords((prev) => {
      const next = [word, ...prev.filter((w) => w !== word)].slice(0, 6);
      saveRecent(next);
      return next;
    });
  }

  function openUrl(url: string) {
    if (/^https?:\/\//.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
  }

  function openHit(hit: SearchHit) {
    recordRecent(deb || input.trim());
    setPanelOpen(false);
    openUrl(hit.url);
  }

  function goLogin(redirectTo?: string) {
    const target = redirectTo ?? window.location.pathname + window.location.search;
    navigate(`/login?redirect=${encodeURIComponent(target)}`);
  }

  /** 回车 / 点「搜索」:进全站搜索结果页(访客经 ProtectedRoute 落登录页并回跳) */
  function goSearchAll() {
    const w = input.trim();
    if (!w) {
      setPanelOpen(true);
      return;
    }
    recordRecent(w);
    setPanelOpen(false);
    navigate(`/search?q=${encodeURIComponent(w)}`);
  }

  function handleSelectWord(word: string) {
    setInput(word);
    setPanelOpen(true);
  }

  const groups = suggest.data?.groups ?? [];
  const totalHits = groups.reduce((n, g) => n + g.total, 0);
  const showHistory = panelOpen && !input.trim() && recentWords.length > 0;
  const showResults = panelOpen && deb.length >= 1;
  const panelVisible = showHistory || showResults;

  return (
    <div className="w-full max-w-xl relative" ref={wrapRef}>
      <div
        className={`flex bg-white rounded-xl overflow-hidden shadow-xl transition-all duration-200 ${focused ? "ring-2 ring-party-accent-40" : ""}`}
      >
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPanelOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setPanelOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") goSearchAll();
            if (e.key === "Escape") {
              setPanelOpen(false);
              setFocused(false);
            }
          }}
          placeholder={
            isLoggedIn
              ? "搜索知识、应用、晒场、证书…"
              : "搜索应用入口,登录后可搜索全站内容…"
          }
          className="flex-1 border-0 focus-visible:ring-0 text-base h-12 px-4 text-[#1A1A1A] placeholder:text-[#9CA3AF] rounded-none"
        />
        <button
          onClick={goSearchAll}
          className="px-6 h-12 text-white font-semibold text-base flex items-center gap-2 flex-shrink-0 transition-colors"
          style={{
            backgroundColor: focused
              ? "color-mix(in srgb, var(--party-primary) 80%, black)"
              : "var(--party-primary)",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.backgroundColor =
              "color-mix(in srgb, var(--party-primary) 80%, black)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.backgroundColor = focused
              ? "color-mix(in srgb, var(--party-primary) 80%, black)"
              : "var(--party-primary)")
          }
        >
          <SearchIcon className="w-4 h-4" />
          搜索
        </button>
      </div>

      {/* 下拉面板:历史(空输入)/ 联想结果(有输入) */}
      <div
        className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top ${panelVisible ? "opacity-100 scale-y-100 pointer-events-auto" : "opacity-0 scale-y-95 pointer-events-none"}`}
      >
        {showHistory && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-[#9CA3AF] font-semibold flex items-center gap-1">
                <ClockIcon className="w-3 h-3" /> 最近搜索
              </p>
              <button
                onMouseDown={() => {
                  setRecentWords([]);
                  saveRecent([]);
                }}
                className="text-[12px] text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors"
              >
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentWords.map((word) => (
                <button
                  key={word}
                  onMouseDown={() => handleSelectWord(word)}
                  className="group flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-[#F7F8FA] text-[#4B5563] border border-[#E9E9E9] hover:bg-party-soft hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] transition-all"
                >
                  {word}
                  <XIcon
                    className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setRecentWords((p) => {
                        const next = p.filter((w) => w !== word);
                        saveRecent(next);
                        return next;
                      });
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {showResults && isLoggedIn && (
          <>
            <div className="max-h-[420px] overflow-y-auto py-1">
              {suggest.isPending && (
                <p className="px-4 py-3 text-sm text-[#9CA3AF]">正在搜索…</p>
              )}
              {suggest.isSuccess && groups.length === 0 && (
                <p className="px-4 py-3 text-sm text-[#9CA3AF]">
                  没有找到「{deb}」相关内容,换个关键词试试
                </p>
              )}
              {groups.map((g) => (
                <div key={g.type}>
                  <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                    <span className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide">
                      {SEARCH_TYPE_LABEL[g.type]}
                    </span>
                    <span className="text-[11px] text-[#C4C8CE]">共 {g.total} 条</span>
                  </div>
                  {g.items.map((hit) => (
                    <HitRow key={`${hit.type}-${hit.id}`} hit={hit} q={deb} onOpen={openHit} />
                  ))}
                </div>
              ))}
            </div>
            {groups.length > 0 && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  goSearchAll();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[var(--party-primary)] border-t border-[#F0F0F0] hover:bg-party-soft transition-colors"
              >
                回车查看全部 {totalHits} 条结果
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}

        {showResults && !isLoggedIn && (
          <>
            <div className="max-h-[420px] overflow-y-auto py-1">
              {guestHits.length === 0 && (
                <p className="px-4 py-3 text-sm text-[#9CA3AF]">
                  没有找到「{deb}」相关应用
                </p>
              )}
              {guestHits.map(({ category, item }) => (
                <button
                  key={item.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    recordRecent(deb);
                    setPanelOpen(false);
                    // 与首页应用卡同一门禁:公共项直接开,非公共项引导登录
                    if (item.common || isLoggedIn) openUrl(item.url!);
                    else goLogin();
                  }}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-party-soft transition-colors group"
                >
                  <LayoutGridIcon className="w-4 h-4 mt-1 text-[#9CA3AF] group-hover:text-[var(--party-primary)] flex-shrink-0 transition-colors" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-[#1A1A1A] truncate">
                      {highlightMatch(item.label, deb).map((seg, i) =>
                        seg.highlight ? (
                          <mark key={i} className="rounded bg-yellow-200/70 px-0.5 text-inherit">
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </span>
                    <span className="block text-xs text-[#6B7280] truncate">
                      <span className="text-[#9CA3AF]">{category}</span>
                      {item.desc && <span className="text-[#D1D5DB]"> · </span>}
                      {item.desc ?? ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                goLogin(`/search?q=${encodeURIComponent(deb)}`);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[var(--party-primary)] border-t border-[#F0F0F0] hover:bg-party-soft transition-colors"
            >
              <LockIcon className="w-3.5 h-3.5" />
              登录后可搜索知识库、晒场等全站内容
            </button>
          </>
        )}
      </div>

      {/* 热门词 */}
      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        <span className="text-white/75 text-sm mr-1">热门搜索：</span>
        {hotWords.map((word) => (
          <button
            key={word}
            onClick={() => handleSelectWord(word)}
            className={`text-sm px-3 py-1 rounded-full transition-all border max-w-[220px] truncate ${
              input === word
                ? "bg-[var(--party-accent)] text-white border-[var(--party-accent)]"
                : "bg-white/20 text-white border-white/30 hover:bg-[var(--party-accent)] hover:text-white hover:border-[var(--party-accent)]"
            }`}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}
