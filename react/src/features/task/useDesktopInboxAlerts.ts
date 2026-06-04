import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { isDesktop, desktopNotify } from "@/shared/lib/desktop";
import { taskApi } from "./api";

/**
 * 桌面端待办提醒:运行在 Tauri 瘦壳里时,后台每 90s 轮询「我的待办」,出现新的「待接收」任务 →
 * 弹原生桌面通知。普通浏览器里整体 no-op(isDesktop=false → 不轮询、不通知)。
 *
 * ⚠ webview 最小化到托盘后台时,WebView2 会节流定时器,通知可能延迟;要绝对实时需改 Rust 侧
 *   轮询(P5 后续打磨,绕开浏览器后台节流)。
 *
 * @param enabled 仅在已登录时为 true(未登录不轮询)。
 */
export function useDesktopInboxAlerts(enabled: boolean): void {
  const active = enabled && isDesktop();
  const q = useQuery({
    queryKey: ["desktop-inbox-alerts"],
    queryFn: () => taskApi.inbox(),
    enabled: active,
    refetchInterval: active ? 90_000 : false,
    refetchIntervalInBackground: true,
  });

  // 已「见过」的待接收 targetId 基线(用 ref,不触发渲染)。
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!active || !q.data) return;
    const claimable = q.data.filter((i) => i.claimable).map((i) => i.targetId);
    if (seen.current === null) {
      seen.current = new Set(claimable); // 首次进入只记基线,不弹(避免一进来就轰炸)
      return;
    }
    const fresh = claimable.filter((id) => !seen.current?.has(id));
    seen.current = new Set(claimable);
    if (fresh.length > 0) {
      void desktopNotify(
        "党建益友 · 新任务待办",
        fresh.length === 1 ? "你有 1 项新任务待接收" : `你有 ${fresh.length} 项新任务待接收`,
      );
    }
  }, [active, q.data]);
}
