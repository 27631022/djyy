import { LucideIcon } from "./IconPicker";
import { assetIconUrl, getBrand, type BrandDef } from "./iconBrands";

/**
 * 统一图标渲染器 —— 把「图标引用」解析成对应图标。全站任何要显示图标的地方都用它。
 *
 * 引用格式(存在各业务字段里,如 NavItem.icon / ExternalApi.iconRef):
 *   - `lucide:Award` 或裸 `Award`(兼容旧导航数据)→ lucide 图标
 *   - `brand:deepseek` → 内置品牌 monogram(iconBrands.ts)
 *   - `asset:<id>`     → 自定义上传图标(后端 IconAsset,经公开口取字节)
 *
 * asset 走 <img>(SVG 在 img 上下文不执行脚本,安全);brand 是纯 CSS monogram;lucide 按名渲染。
 */
export function AppIcon({
  icon,
  size = 18,
  color = "#4B5563",
  title,
  className,
}: {
  icon?: string | null;
  /** 方形像素尺寸 */
  size?: number;
  /** lucide 图标颜色(brand/asset 不受影响) */
  color?: string;
  title?: string;
  className?: string;
}) {
  const ref = (icon ?? "").trim();
  if (!ref) {
    return (
      <LucideIcon
        name="HelpCircleIcon"
        className={className}
        style={{ width: size, height: size, color }}
      />
    );
  }
  if (ref.startsWith("asset:")) {
    return (
      <img
        src={assetIconUrl(ref.slice(6))}
        alt={title ?? ""}
        title={title}
        className={className}
        style={{ width: size, height: size, objectFit: "contain", borderRadius: 4 }}
      />
    );
  }
  if (ref.startsWith("brand:")) {
    return (
      <BrandMonogram brand={getBrand(ref.slice(6))} fallback={ref.slice(6)} size={size} />
    );
  }
  const name = ref.startsWith("lucide:") ? ref.slice(7) : ref;
  return (
    <LucideIcon name={name} className={className} style={{ width: size, height: size, color }} />
  );
}

/** 品牌色简标方块 */
export function BrandMonogram({
  brand,
  fallback,
  size = 18,
}: {
  brand?: BrandDef;
  fallback?: string;
  size?: number;
}) {
  const color = brand?.color ?? "#6B7280";
  const short = brand?.short ?? (fallback ?? "?").slice(0, 2).toUpperCase();
  const fontSize =
    short.length > 1 ? Math.round(size * 0.38) : Math.round(size * 0.52);
  return (
    <span
      className="inline-flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: Math.max(3, Math.round(size * 0.18)),
        fontSize,
      }}
      title={brand?.label}
    >
      {short}
    </span>
  );
}
