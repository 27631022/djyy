/**
 * 内置大模型品牌图标注册表(中央图标库的「品牌」部分)。
 *
 * 按用户决策:内置 = 品牌色 monogram(简标),不存真实 logo(准确性/商标风险);
 * 要精确官方 logo → 走「自定义上传」(IconAsset)。
 *
 * 单一事实来源:AI 模型卡片头像、图标库页、图标选择器都从这里取。
 *
 * 注:本文件是「图标引用」的工具集中地(非组件),把 assetIconUrl 等放这里,
 * 让 AppIcon.tsx 只导出组件(满足 react-refresh/only-export-components)。
 */
import { api } from "@/shared/api/client";

export interface BrandDef {
  /** 品牌 key(也用于 provider 名模糊匹配 + `brand:<key>` 引用) */
  key: string;
  label: string;
  /** 品牌主色(monogram 底色) */
  color: string;
  /** 简标(1-2 字) */
  short: string;
}

export const BRAND_ICONS: BrandDef[] = [
  { key: "deepseek", label: "DeepSeek", color: "#4D6BFE", short: "DS" },
  { key: "doubao", label: "豆包 / 火山方舟", color: "#1664FF", short: "豆" },
  { key: "qwen", label: "通义千问", color: "#615CED", short: "通" },
  { key: "openai", label: "OpenAI", color: "#10A37F", short: "AI" },
  { key: "ernie", label: "文心一言", color: "#2932E1", short: "文" },
  { key: "claude", label: "Claude", color: "#D97757", short: "Cl" },
  { key: "gemini", label: "Gemini", color: "#1C7DFF", short: "G" },
  { key: "moonshot", label: "Kimi / Moonshot", color: "#16191E", short: "Ki" },
  { key: "zhipu", label: "智谱 GLM", color: "#3859FF", short: "智" },
  { key: "hunyuan", label: "腾讯混元", color: "#0052D9", short: "混" },
  { key: "minimax", label: "MiniMax", color: "#E1373F", short: "MM" },
  { key: "spark", label: "讯飞星火", color: "#0070F0", short: "星" },
  { key: "stepfun", label: "阶跃星辰", color: "#005CFF", short: "阶" },
];

const BY_KEY = new Map(BRAND_ICONS.map((b) => [b.key, b]));

export function getBrand(key: string): BrandDef | undefined {
  return BY_KEY.get(key.toLowerCase());
}

/** 按 provider 名模糊匹配品牌(provider 含品牌 key 即命中,如 qwen-internal → 通义) */
export function matchBrand(provider: string): BrandDef | undefined {
  const p = provider.toLowerCase();
  return BRAND_ICONS.find((b) => p.includes(b.key));
}

/** 自定义图标的公开取字节 URL(任意页面 / 公开首页 <img> 都能用) */
export function assetIconUrl(id: string): string {
  return `${api.defaults.baseURL}/public/icons/${id}`;
}
