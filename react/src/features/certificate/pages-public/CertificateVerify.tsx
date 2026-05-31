import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheckIcon,
  ArrowLeftIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { siteSettingApi } from "@/features/site-setting";
import {
  CertificateSearchBox,
  CertificateDetailCard,
} from "../components/public-search/CertificateSearchBox";
import { certificatePublicApi } from "../api";

/**
 * 公开证书验证页(不在 AdminLayout 下,无侧栏 / Tabs / 后台菜单)。
 *
 * 两种入口,同一个页面:
 *   /verify             — 通用查询:输入证书编号,搜出来再看详情(给"首页综合查询"复用同款 SearchBox)
 *   /verify/:token      — 单证验证:扫码 / 后台「打开公开验证页」带 publicToken 进来,
 *                          直接验证并展示该证书。每张证书 token 唯一 → 每个链接展示各自的证书。
 *
 * 之前的 bug:/verify/:token 只是把 token 塞进搜索框 placeholder,没有真正验证,
 * 所以"点进去看不到对应证书"。现在 token 存在时直接走 verifyByToken。
 */
export default function CertificateVerifyPage() {
  const { token } = useParams<{ token?: string }>();

  // 站点设置 — 标题/LOGO
  const settingsQuery = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingApi.get(),
    staleTime: 5 * 60 * 1000,
  });

  const siteName = settingsQuery.data?.brand?.title ?? "党建益友";

  useEffect(() => {
    document.title = `证书查询验证 - ${siteName}`;
  }, [siteName]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F8FA] to-white">
      {/* 顶栏 */}
      <header className="bg-white border-b border-[#E9E9E9]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            返回首页
          </Link>
          <div className="w-px h-5 bg-[#E9E9E9]" />
          <div className="w-8 h-8 rounded-full bg-[var(--party-primary)] flex items-center justify-center">
            <ShieldCheckIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[#1A1A1A]">证书查询验证</div>
            <div className="text-[11px] text-[#9CA3AF]">{siteName}</div>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-party-soft mb-3">
            <ShieldCheckIcon className="w-7 h-7 text-[var(--party-primary)]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">证书查询验证</h1>
          <p className="text-sm text-[#6B7280] mt-2 max-w-lg mx-auto">
            {token ? (
              "以下为该证书的验证结果,扫描证书二维码或访问此链接均可查看。"
            ) : (
              <>
                输入完整证书编号查询真伪,扫描证书上二维码亦可自动验证。
                <br className="hidden sm:inline" />
                查询结果不会泄露持证人敏感信息。
              </>
            )}
          </p>
        </div>

        {token ? <TokenVerifyResult token={token} /> : <CertificateSearchBox />}

        {/* 说明卡片 — 仅在通用查询页显示(单证结果页已自带完整信息) */}
        {!token && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs text-[#6B7280]">
            <Tip title="编号格式">
              年份-荣誉代码-总数-序号
              <br />
              如 <span className="font-mono">2024-QDJL-100-001</span>
            </Tip>
            <Tip title="状态标识">
              绿色 = 有效
              <br />
              红色 = 已撤销
            </Tip>
            <Tip title="隐私保护">
              身份证号 / 手机号 / 外部原文件
              <br />
              均不外露,仅显示证书基础信息
            </Tip>
          </div>
        )}
      </main>

      <footer className="mt-12 py-6 text-center text-[11px] text-[#9CA3AF]">
        © {new Date().getFullYear()} {siteName}
      </footer>
    </div>
  );
}

/* ─── 单证验证结果(带 publicToken 进来时)─── */
function TokenVerifyResult({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["public-verify", token],
    queryFn: () => certificatePublicApi.verifyByToken(token),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#9CA3AF]">
        <Loader2Icon className="w-5 h-5 animate-spin" />
        正在验证证书…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 text-center">
        <AlertCircleIcon className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm font-semibold text-amber-900">证书不存在或链接无效</p>
        <p className="text-xs text-amber-700 mt-1">
          该验证链接可能已失效或被删除。你也可以手动输入证书编号重新查询。
        </p>
        <Link
          to="/verify"
          className="inline-block mt-3 text-xs text-[var(--party-primary)] underline underline-offset-2"
        >
          手动输入证书编号查询 →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <CertificateDetailCard detail={query.data} />
      <div className="mt-4 text-center">
        <Link
          to="/verify"
          className="text-xs text-[var(--party-primary)] hover:underline underline-offset-2"
        >
          查询其他证书 →
        </Link>
      </div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white border border-[#E9E9E9] p-3">
      <div className="font-semibold text-[#1A1A1A] mb-1">{title}</div>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
