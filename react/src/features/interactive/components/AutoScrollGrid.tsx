import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * 自动滚动容器 —— 大屏花名册/头像墙人多时(内容超过容器高度)自动上下缓慢滚动展示全部,
 * 不裁切;人少不溢出则静止。用 Web Animations API 驱动(无 setState、无 CSS 变量,避开
 * set-state-in-effect 警告)。
 *
 * 测量对账不走 ResizeObserver(它的回调绑定渲染帧循环,隐藏/后台页里可能不交付),改为
 * 「每次渲染后测一次 + 监听 window resize」—— 花名册增减本就触发父组件重渲染,故内容变化必被捕获;
 * transform 不改布局尺寸,dist 稳定后不再重建动画(distRef 去抖)。
 */
function reconcile(
  outer: HTMLDivElement | null,
  inner: HTMLDivElement | null,
  animRef: { current: Animation | null },
  distRef: { current: number },
) {
  if (!outer || !inner) return;
  const dist = Math.max(0, inner.scrollHeight - outer.clientHeight);
  if (dist === distRef.current) return; // 尺寸没变,保留当前动画不重启(去抖,避免每渲染跳回顶部)
  distRef.current = dist;
  if (animRef.current) {
    animRef.current.cancel();
    animRef.current = null;
  }
  if (dist > 4) {
    // 缓慢下滑露出底部人员,再滑回顶部(往复);速度 ~ dist/45ms,至少 6s 一个方向
    animRef.current = inner.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(-${dist}px)` }],
      { duration: Math.max(6000, dist * 45), iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
    );
  }
}

export function AutoScrollGrid({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const distRef = useRef(-1);

  // 每次渲染后测量对账(花名册增减 → 父组件重渲染 → 内容高度变化被捕获);无依赖数组=每渲染跑
  useEffect(() => {
    reconcile(outerRef.current, innerRef.current, animRef, distRef);
  });

  // 视口尺寸变化(大屏分辨率/横竖屏切换)也重算
  // (卸载时不显式 cancel 动画:inner 节点随组件移除,其 WAAPI 动画自动被 GC,无泄漏)
  useEffect(() => {
    const onResize = () => reconcile(outerRef.current, innerRef.current, animRef, distRef);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div ref={outerRef} className={`overflow-hidden ${className ?? ""}`} style={style}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
