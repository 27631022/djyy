import { useQuery } from "@tanstack/react-query";
import { assessmentApi } from "./api";

/**
 * 「我的考核」实时角标:待我确认的指标项数(轮询)。
 * 挂在 AdminLayout 的「我的考核」菜单上,登录后每 90s 刷新一次 —— 打分人的实时提醒。
 */
export function useMyAssessmentBadge(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: ["assessment", "my-assessments"],
    queryFn: () => assessmentApi.myAssessments(),
    enabled,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });
  return (data?.items ?? []).reduce((s, it) => s + it.myPending, 0);
}
