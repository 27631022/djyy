import { useEffect, useRef } from "react";
import { docInteractionApi, docViewBeaconUrl, VIEW_DURATION_MAX_SEC } from "./api";

/**
 * 页面浏览埋点(照 knowledge/useViewTracking 范式):
 * 挂载时 POST view 拿 viewLogId;累计**可见时长**(切到后台暂停);离开时
 * (visibilitychange→hidden / pagehide / 卸载)用 navigator.sendBeacon 回填。
 * 后端取 max 幂等、封顶 4h;beacon 走公开口(带不了 auth 头)。
 */
export function useViewTracking(enabled = true): void {
  const logIdRef = useRef<string | null>(null);
  /** 已累计的可见秒数 */
  const accumRef = useRef(0);
  /** 本段可见的起点;不可见时为 null */
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    docInteractionApi
      .recordView()
      .then((r) => {
        if (alive) logIdRef.current = r.viewLogId;
      })
      .catch(() => {
        /* 打点失败不该影响用户用工具 */
      });

    startRef.current = performance.now();

    const flushAccum = () => {
      if (startRef.current !== null) {
        accumRef.current += (performance.now() - startRef.current) / 1000;
        startRef.current = null;
      }
    };

    const sendBeacon = () => {
      flushAccum();
      const id = logIdRef.current;
      // 客户端封顶对齐后端 DTO 的 @Max —— 否则超 4h 的会话 beacon 被 400 拒收、时长全丢
      const durationSec = Math.min(Math.round(accumRef.current), VIEW_DURATION_MAX_SEC);
      if (!id || durationSec <= 0) return;
      try {
        const blob = new Blob([JSON.stringify({ viewLogId: id, durationSec })], {
          type: "application/json",
        });
        navigator.sendBeacon(docViewBeaconUrl(), blob);
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // 移动端切走可能不再回来,先报一次
        sendBeacon();
      } else {
        startRef.current = performance.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendBeacon);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendBeacon);
      sendBeacon();
    };
  }, [enabled]);
}
