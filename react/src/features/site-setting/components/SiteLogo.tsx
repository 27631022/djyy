import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/lib/utils";
import { siteSettingApi } from "../api";

/** 内置默认站标(放在 react/public/,任意页面以 /logo.svg 访问)。 */
const DEFAULT_LOGO_URL = "/logo.svg";

/**
 * 全站统一站标 —— 读站点设置 `brand.logoUrl`(留空回退内置 /logo.svg)。
 * 一处设置(后台「站点设置」→ LOGO 图片 URL),所有用到的地方同步更新。
 * object-contain 完整显示不裁切;加载失败回退内置 logo。尺寸/形状由调用方 className 控制。
 */
export function SiteLogo({ className, alt = "党建益友" }: { className?: string; alt?: string }) {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const url = data?.brand?.logoUrl?.trim() || DEFAULT_LOGO_URL;
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      className={cn("object-contain", className)}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.endsWith(DEFAULT_LOGO_URL)) img.src = DEFAULT_LOGO_URL;
      }}
    />
  );
}
