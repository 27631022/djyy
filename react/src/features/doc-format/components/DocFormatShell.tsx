import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileStackIcon,
  FileTextIcon,
  HomeIcon,
  EyeIcon,
  MessageSquareIcon,
  StarIcon,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { Button } from "@/shared/components/ui/button";
import { docInteractionApi } from "../api";

/**
 * 公文排版的页壳:**工作台的底 + 知识园地的头**(用户 2026-07-17 指定)。
 *
 * 两套风格本来不兼容 —— 工作台是冷灰蓝渐变 + 三光斑 + 磨砂玻璃卡片,知识园地是暖米色 + 实心白 header。
 * 这里的取法:底/卡片走工作台(令牌抄自 WorkbenchHome + WbCardFrame,值保持同步),
 * header 走知识园地的**结构**(首页 | 图标+名 | 右侧动作),它的 bg-white/85 backdrop-blur 恰好
 * 和磨砂玻璃是一路的,不冲突。
 */

/** 与 WorkbenchHome.tsx 的 PAGE_BG 保持同步 */
const PAGE_BG = "linear-gradient(135deg, #eef2f9 0%, #f6f7fb 52%, #fef1f2 100%)";
/** 与 WbCardFrame.tsx 的 CARD 令牌保持同步 */
export const WB_CARD =
  "rounded-2xl border border-white/60 bg-white/55 backdrop-blur-xl shadow-[0_8px_30px_rgba(28,42,68,0.10)]";

/** 工作台的三个背景光斑 —— 没有它磨砂玻璃虚化的是白底,等于没效果 */
function Spots() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-28 -left-20 h-[440px] w-[440px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(200,0,30,0.20), transparent 70%)" }}
      />
      <div
        className="absolute top-40 -right-16 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(36,107,254,0.18), transparent 70%)" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.16), transparent 70%)" }}
      />
    </div>
  );
}

/** 大数字卡。用工作台的磨砂令牌,不是后台那套实心白 */
function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={`${WB_CARD} px-4 py-3`}>
      <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#172033]">{value}</div>
      {hint && <div className="text-[11px] text-[#9CA3AF]">{hint}</div>}
    </div>
  );
}

export function DocFormatShell({
  children,
  onFeedback,
}: {
  children: ReactNode;
  onFeedback: () => void;
}) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const qc = useQueryClient();
  const canManage = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("doc-format:manage");

  const stats = useQuery({ queryKey: ["doc-format", "stats"], queryFn: docInteractionApi.stats });
  const fav = useMutation({
    mutationFn: (on: boolean) => docInteractionApi.setFavorite(on),
    onSuccess: (s) =>
      qc.setQueryData(["doc-format", "stats"], (old: typeof stats.data) =>
        old ? { ...old, ...s } : old,
      ),
  });
  const s = stats.data;

  return (
    <div className="relative min-h-screen" style={{ background: PAGE_BG }}>
      <Spots />

      {/* 头:知识园地的结构 */}
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-3 px-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <HomeIcon className="h-4 w-4" /> 首页
          </button>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <FileTextIcon className="h-5 w-5 text-[var(--party-primary)]" />
            公文排版
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onFeedback}>
              <MessageSquareIcon className="mr-1 h-4 w-4" /> 反馈问题
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fav.mutate(!s?.favorited)}
              disabled={!s || fav.isPending}
              className={s?.favorited ? "border-[var(--party-primary)] text-[var(--party-primary)]" : ""}
            >
              <StarIcon className={`mr-1 h-4 w-4 ${s?.favorited ? "fill-current" : ""}`} />
              {s?.favorited ? "已收藏" : "收藏"}
              {!!s?.favoriteCount && <span className="ml-1 text-xs opacity-70">{s.favoriteCount}</span>}
            </Button>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/doc-format/templates")}>
                管理
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-5">
        {/* 显眼处的转换量 */}
        <div className="mb-4 grid grid-cols-2 gap-[14px] sm:grid-cols-4">
          <StatCard
            icon={<FileStackIcon className="h-4 w-4" />}
            label="累计排版文档"
            value={s ? s.converted.toLocaleString() : "—"}
            hint="份"
          />
          <StatCard icon={<EyeIcon className="h-4 w-4" />} label="浏览量" value={s ? s.viewCount.toLocaleString() : "—"} />
          <StatCard icon={<StarIcon className="h-4 w-4" />} label="收藏" value={s ? s.favoriteCount : "—"} />
          <StatCard
            icon={<MessageSquareIcon className="h-4 w-4" />}
            label={canManage ? "待处理反馈" : "转换有问题?"}
            value={
              canManage ? (
                s?.feedbackOpen ?? "—"
              ) : (
                <button
                  type="button"
                  onClick={onFeedback}
                  className="text-base font-medium text-[var(--party-primary)] hover:underline"
                >
                  告诉我们
                </button>
              )
            }
            hint={canManage ? "条" : "带上转不了的文件"}
          />
        </div>

        {children}
      </div>
    </div>
  );
}
