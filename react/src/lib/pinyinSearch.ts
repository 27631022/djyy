import { pinyin } from "pinyin-pro";

/**
 * 中文 + 拼音 (全拼/首字母) 综合匹配。
 *
 * 示例:对于 "第一党支部·机关综合处"
 *   "党支部"     → 中文子串命中
 *   "dangzhibu"  → 全拼命中
 *   "dzb"        → 首字母命中
 *   "dyDzb"      → 大小写不敏感命中 (de yi Dang zhi bu)
 *   "一党"       → 中文子串命中
 */

interface PinyinIndex {
  raw: string;       // 原始小写
  full: string;      // 全拼无声调,如 "diyidangzhibujiguanzonghechu"
  initials: string;  // 首字母,如 "dydzbjgzhc"
}

const indexCache = new Map<string, PinyinIndex>();

function buildIndex(name: string): PinyinIndex {
  const cached = indexCache.get(name);
  if (cached) return cached;

  const full = pinyin(name, { toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  const initials = pinyin(name, { pattern: "first", toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  const idx: PinyinIndex = {
    raw: name.toLowerCase(),
    full,
    initials,
  };
  indexCache.set(name, idx);
  return idx;
}

export function matchesPinyin(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const idx = buildIndex(name);

  // 中文/原文子串
  if (idx.raw.includes(q)) return true;

  // 全英文/拼音类查询才走拼音匹配,避免中文查询命中拼音造成误判
  if (/^[a-z]+$/.test(q)) {
    if (idx.full.includes(q)) return true;
    if (idx.initials.includes(q)) return true;
  }

  return false;
}

/**
 * 高亮匹配片段。
 *   - 中文/原文匹配:精确包裹命中子串
 *   - 拼音匹配:整名加底色 (无法精确反推中文位置)
 *   - 无匹配:原样返回
 *
 * 返回:[{ text, highlight }, ...]
 */
export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export function highlightMatch(name: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text: name, highlight: false }];

  const qLower = q.toLowerCase();
  const nameLower = name.toLowerCase();
  const pos = nameLower.indexOf(qLower);
  if (pos >= 0) {
    const before = name.slice(0, pos);
    const hit = name.slice(pos, pos + q.length);
    const after = name.slice(pos + q.length);
    return [
      ...(before ? [{ text: before, highlight: false }] : []),
      { text: hit, highlight: true },
      ...(after ? [{ text: after, highlight: false }] : []),
    ];
  }

  // 拼音匹配的兜底:整名底色
  if (/^[a-z]+$/.test(qLower) && matchesPinyin(name, query)) {
    return [{ text: name, highlight: true }];
  }
  return [{ text: name, highlight: false }];
}
