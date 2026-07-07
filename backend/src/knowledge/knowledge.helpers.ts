/**
 * 知识分享:FAQ(点击热度/置顶)+ 维护人员 的纯函数(跨 service 复用,不 import 任何 service,守 DAG)。
 * FAQ 存 faqJson 为 [{id,q,a,clicks,pinned}];clicks 服务端按 id 递增/保留,pinned 人工置顶。
 */

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  clicks: number;
  pinned: boolean;
}

const FAQ_MAX = 20;
const Q_MAX = 300;
const A_MAX = 3000;

/** 解析 faqJson 为完整条目(回填 id、默认值),**保持存储顺序不排序**。 */
export function parseFaqsRaw(faqJson: string | null): FaqItem[] {
  if (!faqJson) return [];
  let v: unknown;
  try {
    v = JSON.parse(faqJson);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((x, i): FaqItem => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        // 旧数据无 id → 按位置回填 f{n}(一旦写回即固化,后续编辑/点击都带真 id)
        id: typeof o.id === 'string' && o.id ? o.id : `f${i + 1}`,
        q: typeof o.q === 'string' ? o.q : '',
        a: typeof o.a === 'string' ? o.a : '',
        clicks: typeof o.clicks === 'number' && o.clicks > 0 ? Math.floor(o.clicks) : 0,
        pinned: o.pinned === true,
      };
    })
    .filter((f) => f.q && f.a);
}

/** 展示排序:人工置顶优先 → 点击热度降序 → 原存储顺序(稳定)。 */
export function sortFaqsForDisplay(items: FaqItem[]): FaqItem[] {
  return items
    .map((f, idx) => ({ f, idx }))
    .sort((A, B) => {
      if (A.f.pinned !== B.f.pinned) return A.f.pinned ? -1 : 1;
      if (B.f.clicks !== A.f.clicks) return B.f.clicks - A.f.clicks;
      return A.idx - B.idx;
    })
    .map((x) => x.f);
}

/**
 * 合并编辑提交的 faqs 与既有存储:**按 id 保留 clicks**(编辑不清热度),新条目分配 id、clicks=0;
 * 去空、限量。返回 JSON 串(空→null)。incoming 不传(undefined)→ 返回既有(调用方用 dto.faqs!==undefined 决定是否调用)。
 */
export function mergeFaqs(
  existingJson: string | null,
  incoming?: Array<{ id?: string; q: string; a: string; pinned?: boolean }>,
): string | null {
  if (!incoming) return existingJson;
  const existing = parseFaqsRaw(existingJson);
  const clicksById = new Map(existing.map((f) => [f.id, f.clicks]));
  let max = 0;
  const bump = (id?: string) => {
    const m = /^f(\d+)$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  };
  existing.forEach((f) => bump(f.id));
  incoming.forEach((it) => bump(it.id));
  const out: FaqItem[] = [];
  for (const it of incoming) {
    const q = (it.q ?? '').trim().slice(0, Q_MAX);
    const a = (it.a ?? '').trim().slice(0, A_MAX);
    if (!q || !a) continue;
    // 已有 id(编辑回传)→ 沿用并保留 clicks;新条目 → 分配 f{max+1},clicks 从 0 起
    const id = it.id && /^f\d+$/.test(it.id) ? it.id : `f${++max}`;
    out.push({ id, q, a, clicks: clicksById.get(id) ?? 0, pinned: it.pinned === true });
    if (out.length >= FAQ_MAX) break;
  }
  return out.length ? JSON.stringify(out) : null;
}

export interface MaintainerRef {
  userId: string;
  userName: string;
}

export function parseMaintainers(json: string | null): MaintainerRef[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is MaintainerRef =>
          !!x && typeof x.userId === 'string' && typeof x.userName === 'string' && !!x.userId,
      )
      .map((x) => ({ userId: x.userId, userName: x.userName }));
  } catch {
    return [];
  }
}

export function isMaintainerOf(maintainersJson: string | null, userId: string): boolean {
  return parseMaintainers(maintainersJson).some((m) => m.userId === userId);
}
