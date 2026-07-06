import { useEffect, useRef } from "react";
import { knowledgeApi, knowledgeViewBeaconUrl } from "./api";

/**
 * 阅读页浏览埋点:挂载时 POST view 拿 viewLogId;累计**可见时长**(hidden 暂停),
 * 离开(visibilitychange→hidden / pagehide / 卸载)时 navigator.sendBeacon 回填时长。
 * 后端取 max 幂等、封顶 4h;beacon 走公开口(带不了 auth 头)。
 */
export function useViewTracking(articleId: string | undefined) {
  const logIdRef = useRef<string | null>(null);
  const accumRef = useRef(0); // 已累计可见秒数
  const startRef = useRef<number | null>(null); // 本段可见起点(performance.now ms),不可见时 null

  useEffect(() => {
    if (!articleId) return;
    let alive = true;
    logIdRef.current = null;
    accumRef.current = 0;
    startRef.current = typeof document !== "undefined" && document.visibilityState === "visible" ? performance.now() : null;

    knowledgeApi
      .recordView(articleId)
      .then((r) => {
        if (alive) logIdRef.current = r.viewLogId;
      })
      .catch(() => {});

    const flushAccum = () => {
      if (startRef.current != null) {
        accumRef.current += (performance.now() - startRef.current) / 1000;
        startRef.current = null;
      }
    };

    const sendBeacon = () => {
      flushAccum();
      const id = logIdRef.current;
      // 客户端封顶对齐后端 @Max(14400) —— 否则超 4h 单次会话的 beacon 被 ValidationPipe 400 拒收、时长丢失
      const durationSec = Math.min(Math.round(accumRef.current), 14400);
      if (!id || durationSec <= 0) return;
      try {
        const blob = new Blob([JSON.stringify({ viewLogId: id, durationSec })], { type: "application/json" });
        navigator.sendBeacon(knowledgeViewBeaconUrl(), blob);
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendBeacon(); // 切后台即上报一次(移动端切走可能不再回来)
      } else {
        startRef.current = performance.now(); // 回到前台重新计时
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendBeacon);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendBeacon);
      sendBeacon(); // 组件卸载(路由离开)也上报
    };
  }, [articleId]);
}
