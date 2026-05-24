import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheckIcon, ArrowLeftIcon } from "lucide-react";
import { siteSettingApi } from "@/features/site-setting";
import { CertificateSearchBox } from "../components/public-search/CertificateSearchBox";

/**
 * 公开证书验证页。
 *
 * 路由形态:
 *   /verify              输入证书编号查询
 *   /verify/:token       已经持有 publicToken(扫码进来)— 此页可直接展示
 *                        (本 MVP 阶段:把 token 自动塞到 SearchBox 也行,
 *                         但更友好的是直接走 verify API。Phase B 先做基础版本。)
 *
 * 不在 AdminLayout 下,没有侧栏 / Tabs / 后台菜单。
 */
export default function CertificateVerifyPage() {
  const { token } = useParams<{ token?: string }>();
  const [search] = useSearchParams();
  const q = search.get("q") ?? token ?? "";

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
            输入完整证书编号查询真伪,扫描证书上二维码亦可自动验证。
            <br className="hidden sm:inline" />
            查询结果不会泄露持证人敏感信息。
          </p>
        </div>

        <CertificateSearchBox key={q || "default"} placeholder={q || undefined} />

        {/* 简单说明 */}
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
      </main>

      <footer className="mt-12 py-6 text-center text-[11px] text-[#9CA3AF]">
        © {new Date().getFullYear()} {siteName}
      </footer>
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
