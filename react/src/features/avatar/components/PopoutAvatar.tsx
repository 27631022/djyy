import { useQuery } from "@tanstack/react-query";
import { resolveAvatarUrl } from "../api";

/**
 * 平台头像 URL(/api/public/avatars/<fileId>)→ 弹出抠像探测 URL。
 * 外链 / data: / blob: 等非平台头像不探测(直接走回退效果)。
 */
function popUrlOf(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl || !/^\/api\/public\/avatars\/[a-z0-9]+$/i.test(avatarUrl)) return null;
  return resolveAvatarUrl(`${avatarUrl}/pop`) ?? null;
}

/**
 * fetch 预载探测抠像是否存在:200=可弹出(字节进 HTTP 缓存,后端带 Cache-Control,<img> 零流量复用)、
 * 404=确认无抠像走回退;网络层失败 throw 交给 react-query 重试 —— 不能用 <img> onerror 探测,
 * 它分不清 404 与瞬断,瞬断会被 staleTime:Infinity 固化成整个会话的永久降级。
 */
async function probePop(url: string): Promise<boolean> {
  const res = await fetch(url);
  if (res.ok) return true;
  if (res.status === 404) return false;
  throw new Error(`探测失败 ${res.status}`);
}

/** 背景圆圈配色:男=蓝 / 女=粉 / 未知=品牌色;都取「基色 mix 白」的淡渐变,保持同一质感 */
const CIRCLE_BG: Record<"male" | "female" | "default", string> = {
  male: "linear-gradient(180deg, color-mix(in srgb, #3B82F6 22%, white), color-mix(in srgb, #3B82F6 9%, white))",
  female:
    "linear-gradient(180deg, color-mix(in srgb, #F0629C 22%, white), color-mix(in srgb, #F0629C 9%, white))",
  default:
    "linear-gradient(180deg, color-mix(in srgb, var(--party-primary) 16%, white), color-mix(in srgb, var(--party-primary) 6%, white))",
};

/**
 * 会"弹出圆圈"的头像(Peeps 式立体效果):
 * 人物透明抠像立在淡色背景圆圈上(男蓝/女粉/未知=品牌色),**祖先带 `group` class 的容器**
 * (通常是整张卡片)悬浮时人物从圆圈里"长出来"(自底部放大 + 回弹缓动 + 投影),圆圈同步微放大。
 * 分层结构:背景圆圈(纯 CSS)在下,人物图在「底部沿圆弧裁剪、顶部开放」的裁剪框里 ——
 * 头顶可越过圆圈上缘,肩部仍收在圆弧内。
 *
 * 头像没有抠像(AI 照片/外链/探测中)→ 回退为传统圆形裁剪 + 悬浮圈内放大上浮;
 * 无头像 → 姓名首字圆徽。字号/尺寸由 className 传入(如 "h-12 w-12 text-lg")。
 */
export function PopoutAvatar({
  avatarUrl,
  name,
  gender,
  className = "",
}: {
  avatarUrl: string | null | undefined;
  name: string;
  /** 背景圆圈配色依据(男蓝/女粉);不传或 null 用品牌色 */
  gender?: "male" | "female" | null;
  className?: string;
}) {
  const src = resolveAvatarUrl(avatarUrl);
  const popUrl = popUrlOf(avatarUrl);
  const popQ = useQuery({
    queryKey: ["avatar-pop", popUrl],
    queryFn: () => probePop(popUrl!),
    enabled: !!popUrl,
    staleTime: Infinity,
    retry: 1,
  });

  if (!src) {
    return (
      <div
        className={`grid flex-shrink-0 select-none place-items-center rounded-full bg-[var(--party-primary)] font-bold text-white transition-transform duration-300 group-hover:-translate-y-0.5 ${className}`}
      >
        {name.charAt(0)}
      </div>
    );
  }

  if (popUrl && (popQ.data === true || popQ.isPending)) {
    return (
      <div className={`relative flex-shrink-0 ${className}`}>
        {/* 背景圆圈:淡色渐变(男蓝/女粉/未知=品牌色),悬浮微放大(不加阴影/投影——
            模糊晕圈会被用户读成"虚背景") */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-gray-100 transition-transform duration-300 group-hover:scale-105"
          style={{ background: CIRCLE_BG[gender ?? "default"] }}
        />
        {/* 裁剪壳:clip-path 负 inset = 底部沿圆弧裁、左右收在圆的最宽处、顶部开放(向上留半圆余量)——
            人物放大时头顶越出圆圈上缘,肩部仍被圆弧裁住。
            ⚠ 不能用「绝对定位 -top-1/2 + overflow-hidden」的裁剪框:盒子越出卡片顶会把
            CSS 多栏容器(通讯录瀑布流 columns-2)的内容全部挤进第一列;clip-path 只作用于
            绘制不影响布局,分栏不受影响(2026-07-16 通讯录变单列的根因)。
            探测未决时只出背景圆圈占位(不挂原图):库头像占绝对多数,先挂原图会白下载一次
            且探测归来时"照片圆→人物"结构闪变;落定 false 才转回退分支挂原图 */}
        <div className="pointer-events-none h-full w-full [clip-path:inset(-50%_0_0_0_round_0_0_9999px_9999px)]">
          {popQ.data === true && (
            <img
              src={popUrl}
              alt=""
              draggable={false}
              className="h-full w-full origin-bottom object-cover object-bottom transition-transform duration-300 [transition-timing-function:cubic-bezier(.3,1.4,.5,1)] group-hover:scale-[1.32]"
            />
          )}
        </div>
      </div>
    );
  }

  // 回退:确认无抠像(照片/外链/探测重试后仍失败)—— 圆形裁剪 + 悬浮圈内放大上浮
  return (
    <div
      className={`flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-100 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md ${className}`}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
      />
    </div>
  );
}
