/**
 * 模型「大/中/小」档位 + 归组 —— 模型库页与模型台「从模型库选择」选择器共用。
 * 优化产物按文件名后缀(-中/-小)定档;原始上传文件按体积定档(源=「原大小」)。
 * 归组仅按基名(去 -中/-小 后缀),忽略来源:AI 生成模型的优化版落在 upload 夹,
 * 来源不同但仍是同一个模型,必须归到一起。
 */
import type { LibraryModel } from "../api";

export type Tier = "大" | "中" | "小";
export const TIER_ORDER: Tier[] = ["大", "中", "小"];
export const BIG_BYTES = 30 * 1024 * 1024; // ≥30MB → 大(上传时自动生成 中/小)
export const MID_BYTES = 6 * 1024 * 1024; // ≥6MB → 中;更小 → 小

export const TIER_BADGE: Record<Tier, string> = {
  大: "bg-rose-50 text-rose-600 border-rose-200",
  中: "bg-amber-50 text-amber-600 border-amber-200",
  小: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

/** 文件名后缀定档(-中/-小);无后缀返回 null(= 原始文件,按体积定档) */
export function variantTier(name: string): "中" | "小" | null {
  if (/-小\.(glb|gltf)$/i.test(name)) return "小";
  if (/-中\.(glb|gltf)$/i.test(name)) return "中";
  return null;
}
export function sizeTier(size: number): Tier {
  return size >= BIG_BYTES ? "大" : size >= MID_BYTES ? "中" : "小";
}
export function tierOf(m: LibraryModel): Tier {
  return variantTier(m.name) ?? sizeTier(m.size);
}
/** 归组键:去掉 -中/-小 后缀与扩展名(同一模型的几个版本归一组) */
export function baseNameOf(name: string): string {
  return name.replace(/-(中|小)\.(glb|gltf)$/i, "").replace(/\.(glb|gltf)$/i, "");
}

export interface ModelGroup {
  key: string;
  base: string;
  source: "upload" | "ai";
  createdAt: string | Date;
  /** 各档位对应的文件(可能只有其中一档) */
  tiers: Partial<Record<Tier, LibraryModel>>;
  /** 代表文件:无后缀的原始文件;没有则取任一档 */
  rep: LibraryModel;
  tags: string[];
}

export function groupModels(models: LibraryModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const m of models) {
    const base = baseNameOf(m.name);
    let g = map.get(base);
    if (!g) {
      g = { key: base, base, source: m.source, createdAt: m.createdAt, tiers: {}, rep: m, tags: m.tags };
      map.set(base, g);
    }
    g.tiers[tierOf(m)] = m;
    // 代表文件 = 无后缀原始件(决定卡片名/标签/缩略图/创建时间)
    if (!variantTier(m.name)) {
      g.rep = m;
      g.tags = m.tags;
      g.createdAt = m.createdAt;
    }
  }
  return [...map.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
