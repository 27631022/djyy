import type { HallSummary, ResolvedHall, TypefaceFontSubset } from '../types';

/** 相对路径走 vite proxy(dev)/ 同域反代(生产),零 CORS 配置 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败 ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * 平面图 → 3D 世界的手性归一化(修「2D 和 3D 左右镜像」)。
 *
 * 根因:2D 平面图是屏幕坐标(x→右,y→下);Babylon 左手系直接取 z=+y 时,
 * 从上往下俯视 3D 世界,+z 在视觉上指向「上」—— 与平面图 y 向下相反,
 * 整个世界相对平面图发生左右镜像(站在出生点,平面图里在左边的东西跑到右边)。
 *
 * 修法:取数后一次性变换,后续 builder(z=+y、root rotation.y=-rot、相机 π-rot)零改动:
 *   y → -y(墙端点 / 组件 / 出生点)
 *   rot → (180 - rot) mod 360(组件 / 出生点;推导:要求变换后世界里
 *     rot=0 仍面向平面图“上方”、且左右与平面图一致)
 * 数学校验:spawn rot=0 → 相机 yaw=π-π=0 → forward=+z=平面图上方 ✓,
 * 相机右手边 = +x = 平面图右侧 ✓(修复前为 -x,即镜像)。
 */
function normalizePlanOrientation(hall: ResolvedHall): ResolvedHall {
  const flipRot = (rot: number | undefined): number => (((180 - (rot ?? 0)) % 360) + 360) % 360;
  for (const w of hall.walls) {
    w.y1 = -w.y1;
    w.y2 = -w.y2;
  }
  for (const f of hall.fixtures) {
    f.y = -f.y;
    f.rot = flipRot(f.rot);
  }
  if (hall.meta.spawn) {
    hall.meta.spawn.y = -hall.meta.spawn.y;
    hall.meta.spawn.rot = flipRot(hall.meta.spawn.rot);
  }
  return hall;
}

export const hallApi = {
  list: () => getJson<HallSummary[]>('/api/halls'),
  get: (id: string) =>
    getJson<ResolvedHall>(`/api/halls/${encodeURIComponent(id)}`).then(normalizePlanOrientation),
  /** 中文 3D 文字字体子集(typeface 格式,只含传入字符;font=sans/sans-bold/serif/serif-bold) */
  font: (chars: string, font = 'sans') =>
    getJson<TypefaceFontSubset>(
      `/api/public/exhibition/font?chars=${encodeURIComponent(chars)}&font=${encodeURIComponent(font)}`,
    ),
};
