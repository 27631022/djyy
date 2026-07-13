/**
 * 路线(polyline)弧长参数化 —— 编辑器吸附与大屏/手机人物定位**共用**,保证两端算出同一个点。
 * 坐标空间 = % of 背景图(x∈0..100, y∈0..100)。注意这是「百分比空间」的弧长:横向 1% 与纵向 1%
 * 的物理长度随背景纵横比不同,但编辑器与运行时用同一空间,吸附/定位自洽(取舍,不做纵横比加权)。
 */

export interface RoutePoint {
  x: number;
  y: number;
}

function segLen(a: RoutePoint, b: RoutePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 路线总弧长(<2 点返回 0) */
export function routeLength(route: RoutePoint[]): number {
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += segLen(route[i - 1], route[i]);
  return sum;
}

/** 弧长参数 t(0..1)→ 路线上的点(<2 点回退第一个点或原点) */
export function pointAtT(route: RoutePoint[], t: number): RoutePoint {
  if (route.length === 0) return { x: 50, y: 50 };
  if (route.length === 1) return route[0];
  const total = routeLength(route);
  if (total <= 0) return route[0];
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < route.length; i++) {
    const len = segLen(route[i - 1], route[i]);
    if (target <= len || i === route.length - 1) {
      const f = len > 0 ? Math.min(1, target / len) : 0;
      return {
        x: route[i - 1].x + (route[i].x - route[i - 1].x) * f,
        y: route[i - 1].y + (route[i].y - route[i - 1].y) * f,
      };
    }
    target -= len;
  }
  return route[route.length - 1];
}

/** 点到路线的最近投影:返回弧长参数 t 与距离(编辑器放置/拖动关卡吸附用) */
export function projectToRoute(route: RoutePoint[], x: number, y: number): { t: number; dist: number } {
  if (route.length < 2) return { t: 0.5, dist: Infinity };
  const total = routeLength(route);
  if (total <= 0) return { t: 0.5, dist: segLen(route[0], { x, y }) };
  let best = { t: 0, dist: Infinity };
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const len = segLen(a, b);
    if (len > 0) {
      // 投影到线段 ab,夹到 [0,1]
      const f = Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len)));
      const px = a.x + (b.x - a.x) * f;
      const py = a.y + (b.y - a.y) * f;
      const d = Math.hypot(x - px, y - py);
      if (d < best.dist) best = { t: (acc + len * f) / total, dist: d };
    }
    acc += len;
  }
  return best;
}
