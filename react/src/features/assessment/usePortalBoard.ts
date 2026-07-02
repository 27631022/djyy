import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth";
import { assessmentApi } from "./api";

/**
 * 门户首页「考核排行榜」数据源:最新考核轮次的实时结果(替换原 ranking-demo 演示数据)。
 *
 * - 未登录不发任何请求(loggedOut=true 显示登录引导)—— 首页是公开页,
 *   而考核接口登录态才可见;冒然调用会被 401 拦截器踢去登录页。
 * - 轮次取「最新」(year desc, createdAt desc 第一条 = 当前进行中的考核)。
 * - liveResults 与考核排名页共用 queryKey("assess-live")与后端按轮次缓存,
 *   60s 轮询成本 ~2ms/次(命中缓存),别人保存录入后榜单自动跟上。
 */
export interface PortalBoardRow {
  rank: number;
  name: string;
  score: number;
  grade: string;
}

export interface PortalBoard {
  /** 未登录(显示登录引导,不发请求) */
  loggedOut: boolean;
  loading: boolean;
  /** 轮次名(如「2026年公司党建考核」);无进行中考核为 null */
  roundName: string | null;
  /** 完整排名页链接用 */
  schemeId: string | null;
  /** 全量排名(已按总分降序、带名次/定级);调用方自行 slice */
  rows: PortalBoardRow[];
  /** 榜内最高分(进度条按相对宽度画;实分可能是小数,不能按满分 100 画) */
  maxScore: number;
}

export function usePortalAssessmentBoard(): PortalBoard {
  const { me } = useAuth();
  const loggedIn = !!me;

  const rounds = useQuery({
    queryKey: ["assessment", "rounds", "portal"],
    queryFn: () => assessmentApi.listRounds(),
    enabled: loggedIn,
    staleTime: 60_000,
  });
  const round = rounds.data?.[0];

  const live = useQuery({
    queryKey: ["assess-live", round?.id],
    queryFn: () => assessmentApi.liveResults(round!.id),
    enabled: loggedIn && !!round,
    staleTime: 2000,
    refetchInterval: 60_000,
  });

  const targets = live.data?.targets ?? [];
  const rows: PortalBoardRow[] = targets.map((t) => ({
    rank: t.rank,
    name: t.name,
    score: t.total,
    grade: t.grade,
  }));
  return {
    loggedOut: !loggedIn,
    loading: loggedIn && (rounds.isLoading || (!!round && live.isLoading)),
    roundName: round?.name ?? null,
    schemeId: round?.schemeId ?? null,
    rows,
    maxScore: rows.reduce((m, r) => Math.max(m, r.score), 0),
  };
}
