import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClockIcon,
  FlameIcon,
  HomeIcon,
  PencilLineIcon,
  SearchIcon,
  ThumbsUpIcon,
  Trophy,
  UserIcon,
  Users,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAuth } from "@/stores/auth";
import { showcaseApi, type MyEntryItem, type StageListItem } from "../api";
import { StagePanel } from "../components/StagePanel";

/**
 * 先锋晒场门户(/showcase)—— 照知识园地的左中右三栏:
 * 左=六榜分组的晒台列表(点选);中=选中晒台的报送情况(StagePanel,与详情页共用);
 * 右=热点晒台 + 最新报送。选中晒台走 URL ?stage=(可直链/后退)。
 */
export default function ShowcasePortal() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState("");

  const categories = useQuery({ queryKey: ["showcase", "categories"], queryFn: showcaseApi.listCategories });
  // 晒台量级几十个,一次取全(published+closed),左栏客户端分组/过滤
  const stages = useQuery({
    queryKey: ["showcase", "stages", "portal"],
    queryFn: () => showcaseApi.listStages({ pageSize: 100 }),
  });
  const hot = useQuery({
    queryKey: ["showcase", "side", "hot"],
    queryFn: () => showcaseApi.listStages({ sort: "hot", pageSize: 6 }),
  });
  const latestEntries = useQuery({
    queryKey: ["showcase", "side", "board"],
    queryFn: () => showcaseApi.entriesBoard("latest", 8),
  });

  const all = stages.data?.items ?? [];
  const kw = q.trim().toLowerCase();
  const filtered = kw
    ? all.filter(
        (s) => s.title.toLowerCase().includes(kw) || s.ownerName.toLowerCase().includes(kw),
      )
    : all;

  // 选中晒台:URL ?stage= 优先,缺省第一个(渲染期派生,无 effect)
  const stageParam = searchParams.get("stage") ?? "";
  const selectedId = filtered.some((s) => s.id === stageParam)
    ? stageParam
    : stageParam && all.some((s) => s.id === stageParam)
      ? stageParam
      : filtered[0]?.id ?? "";

  const pick = (id: string) => setSearchParams({ stage: id }, { replace: true });

  const perms = me?.permissions ?? [];
  const canPublish = !!me?.isPlatformAdmin || perms.includes("showcase:publish");
  const canManage = !!me?.isPlatformAdmin || perms.includes("showcase:manage");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
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

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 px-4 pb-16 pt-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_280px]">
        {/* 左:六榜分组的晒台列表 */}
        <aside className="sticky top-20 hidden rounded-xl border border-gray-100 bg-white/90 p-3 shadow-sm lg:block">
          <div className="relative mb-2">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜晒台 / 台主…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          {stages.isLoading ? (
            <div className="px-2 py-6 text-center text-xs text-gray-400">加载中…</div>
          ) : (
            (categories.data ?? []).map((cat) => {
              const group = filtered.filter((s) => s.categoryId === cat.id);
              if (kw && group.length === 0) return null; // 搜索时空组不占位
              return (
                <div key={cat.id} className="mb-1.5">
                  <div className="flex items-center px-2 pb-1 pt-2 text-xs font-medium text-gray-400">
                    <span className="flex-1">{cat.name}</span>
                    <span>{group.length}</span>
                  </div>
                  {group.length === 0 ? (
                    <div className="px-3 py-1 text-xs text-gray-300">暂无晒台</div>
                  ) : (
                    group.map((s) => <StageNavItem key={s.id} stage={s} active={s.id === selectedId} onPick={pick} />)
                  )}
                </div>
              );
            })
          )}
          {!stages.isLoading && filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-gray-400">
              {kw ? "没有匹配的晒台" : "还没有上架的晒台"}
            </div>
          )}
        </aside>

        {/* 中:选中晒台的报送情况 */}
        <main className="min-w-0">
          {selectedId ? (
            <StagePanel stageId={selectedId} />
          ) : stages.isLoading ? (
            <div className="py-24 text-center text-sm text-gray-400">加载中…</div>
          ) : (
            <div className="py-24 text-center">
              <Trophy className="mx-auto h-10 w-10 text-gray-200" />
              <div className="mt-3 text-sm text-gray-400">
                {canPublish ? "还没有晒台,点右上角「发起晒台」摆第一个擂台" : "还没有晒台,等台主们发起后就能来参晒了"}
              </div>
            </div>
          )}
        </main>

        {/* 右:热点 */}
        <aside className="sticky top-20 hidden space-y-4 xl:block">
          <SideCard title="热点晒台" icon={<FlameIcon className="h-3.5 w-3.5 text-red-500" />}>
            {(hot.data?.items ?? []).length === 0 ? (
              <Empty>暂无数据</Empty>
            ) : (
              (hot.data?.items ?? []).map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] ${
                      i === 0
                        ? "bg-[#F5A623] text-white"
                        : i === 1
                          ? "bg-[#C0C0C0] text-white"
                          : i === 2
                            ? "bg-[#CD7F32] text-white"
                            : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[13px] leading-tight text-gray-700">{s.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="flex items-center gap-0.5">
                        <Users className="h-3 w-3" />
                        {s.entryCount}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUpIcon className="h-3 w-3" />
                        {s.likeCount}
                      </span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </SideCard>

          <SideCard title="最新报送" icon={<ClockIcon className="h-3.5 w-3.5 text-[var(--party-primary)]" />}>
            {(latestEntries.data ?? []).length === 0 ? (
              <Empty>还没有公开的报送</Empty>
            ) : (
              (latestEntries.data ?? []).map((e: MyEntryItem) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => navigate(`/showcase/entries/${e.id}`)}
                  className="w-full rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="line-clamp-1 block text-[13px] text-gray-700">{e.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                    <span className="min-w-0 flex-1 truncate">{e.stageTitle}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <ThumbsUpIcon className="h-3 w-3" />
                      {e.likeCount}
                    </span>
                  </span>
                </button>
              ))
            )}
          </SideCard>
        </aside>
      </div>
    </div>
  );
}

function StageNavItem({
  stage: s,
  active,
  onPick,
}: {
  stage: StageListItem;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(s.id)}
      className={`flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-party-soft font-medium text-[var(--party-primary)]" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{s.title}</span>
      {s.status === "closed" && <span className="shrink-0 text-[10px] text-gray-400">已收官</span>}
      <span className={`shrink-0 text-[11px] ${active ? "text-[var(--party-primary)]/70" : "text-gray-400"}`}>
        {s.entryCount}
      </span>
    </button>
  );
}

function SideCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white/90 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 px-1 pb-2 text-xs font-medium text-gray-500">
        {icon}
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="px-1 py-3 text-xs text-gray-300">{children}</div>;
}
