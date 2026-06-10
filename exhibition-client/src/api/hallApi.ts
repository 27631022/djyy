import type { HallSummary, ResolvedHall, TypefaceFontSubset } from '../types';

/** 相对路径走 vite proxy(dev)/ 同域反代(生产),零 CORS 配置 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败 ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const hallApi = {
  list: () => getJson<HallSummary[]>('/api/halls'),
  get: (id: string) => getJson<ResolvedHall>(`/api/halls/${encodeURIComponent(id)}`),
  /** 中文 3D 文字字体子集(typeface 格式,只含传入字符) */
  font: (chars: string) =>
    getJson<TypefaceFontSubset>(
      `/api/public/exhibition/font?chars=${encodeURIComponent(chars)}`,
    ),
};
