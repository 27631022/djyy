import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../stores/auth";
import { SiteLogo } from "@/features/site-setting";
import { authApi, oidcLoginUrl, storeToken } from "@/features/auth";

/* 登录页双模式(后端 GET /auth/mode 决定):
   - mock:开发期演示账号面板(点账号直进,无密码)
   - oidc:统一账号登录(Casdoor / 单位 SSO)—— 整页跳 IdP,回跳时 token 挂在
     URL fragment(#djyy_token=...),本页挂载时解析入库。 */
interface DemoAccount {
  username: string;
  name: string;
  description: string;
  badge?: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: "admin",    name: "系统管理员", description: "平台全权限",                   badge: "管理员" },
  { username: "80545411", name: "朱海君",     description: "党群工作部 经理 · 党支部书记",  badge: "干部" },
  { username: "81243632", name: "张明",       description: "党群工作部 · 党建管理岗",       badge: "员工" },
  { username: "80543400", name: "杨一凡",     description: "党群工作部 · 副经理",           badge: "干部" },
  { username: "50267848", name: "李月",       description: "党群工作部 · 共青团管理岗",     badge: "员工" },
  { username: "80523865", name: "王金雨",     description: "党委组织部 · 组织部部长",       badge: "干部" },
  { username: "86293664", name: "安丽",       description: "党委组织部 · 党建管理岗",       badge: "员工" },
  { username: "80523911", name: "李峰",       description: "塔运司领导班子 · 书记",         badge: "干部" },
  { username: "80523419", name: "孙彩霞",     description: "塔运司综合办公室 · 党建管理岗", badge: "员工" },
  { username: "80530489", name: "李桂红",     description: "塔运司特车运输大队 · 书记",     badge: "干部" },
];

/** 从 URL fragment 提取统一登录回传的 token(#djyy_token=...) */
function readTokenFromHash(): string | null {
  const m = /(?:^#|&)djyy_token=([^&]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, login, refresh } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => params.get("sso_error"));

  const modeQuery = useQuery({ queryKey: ["auth", "mode"], queryFn: authApi.mode, staleTime: 60_000 });
  // 后端不可达时回落 mock 面板(dev 常态);加载中显示占位
  const mode = modeQuery.data?.mode ?? (modeQuery.isError ? "mock" : null);

  /* 统一登录回跳:fragment 里带 token → 入库 + 清理地址栏 + 拉 /auth/me(下方 effect 负责跳转) */
  useEffect(() => {
    const token = readTokenFromHash();
    if (!token) return;
    storeToken(token);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void refresh();
  }, [refresh]);

  /* 已登录则直接跳到 redirect 或首页 */
  useEffect(() => {
    if (me) {
      const redirect = params.get("redirect");
      // 只认站内绝对路径;排除协议相对地址 //evil.com(也以 '/' 开头,会被当跨源跳转)
      const safe = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
      navigate(safe, { replace: true });
    }
  }, [me, navigate, params]);

  async function handleLogin(account: DemoAccount) {
    setBusy(account.username);
    setError(null);
    try {
      await login(account.username);
    } catch (e) {
      setError(`登录失败:${(e as Error).message || "未知错误"}`);
      setBusy(null);
    }
  }

  /** 跳统一登录;成功后回到本页(保留 ?redirect= 以便登录后回原页面) */
  function handleSsoLogin() {
    setError(null);
    const redirect = params.get("redirect");
    const returnTo =
      window.location.origin + "/login" + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : "");
    window.location.assign(oidcLoginUrl(returnTo));
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: "linear-gradient(to bottom right, color-mix(in srgb, var(--party-accent) 12%, white), white, color-mix(in srgb, var(--party-primary) 8%, white))",
      }}
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden border border-[#F0F0F0]">
        {/* 头部 */}
        <div
          className="px-8 py-6 flex items-center gap-4"
          style={{
            background: "linear-gradient(to right, var(--party-primary), color-mix(in srgb, var(--party-primary) 78%, black))",
          }}
        >
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center p-2 flex-shrink-0">
            <SiteLogo className="w-full h-full" />
          </div>
          <div className="flex flex-col text-white">
            <span className="text-2xl font-bold tracking-wide">党建益友</span>
            <span className="text-xs opacity-80">
              {mode === "oidc" ? "企业应用底座 · 统一身份认证" : "企业应用底座 · 开发模式登录"}
            </span>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-8">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {error}
            </div>
          )}

          {mode === null && (
            <div className="py-12 text-center text-sm text-[#9CA3AF]">正在检测登录方式…</div>
          )}

          {mode === "oidc" && (
            <div className="py-8 flex flex-col items-center gap-5">
              <p className="text-sm text-[#4B5563]">请使用企业统一账号登录本平台</p>
              <button
                onClick={handleSsoLogin}
                className="px-10 py-3 rounded-lg text-white text-base font-semibold shadow-md hover:shadow-lg transition-all"
                style={{ backgroundColor: "var(--party-primary)" }}
              >
                统一账号登录
              </button>
              <p className="text-[11px] text-[#9CA3AF] leading-relaxed text-center max-w-md">
                点击后将跳转到企业统一身份认证平台完成登录,成功后自动返回。
                <br />
                账号未开通或被禁用时请联系系统管理员。
              </p>
            </div>
          )}

          {mode === "mock" && (
            <>
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-[#1A1A1A]">选择一个演示账号登录</h2>
                <span className="text-xs text-[#9CA3AF]">Mock 模式 · 生产环境为统一账号登录</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {DEMO_ACCOUNTS.map((acc) => {
                  const loading = busy === acc.username;
                  return (
                    <button
                      key={acc.username}
                      onClick={() => handleLogin(acc)}
                      disabled={busy !== null}
                      className="group text-left p-3 rounded-lg border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-[#1A1A1A] group-hover:text-[var(--party-primary)]">
                          {acc.name}
                        </span>
                        {acc.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-party-soft text-[var(--party-primary)]">
                            {acc.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B7280] mb-1">员工编号 {acc.username}</div>
                      <div className="text-xs text-[#4B5563] leading-snug">{acc.description}</div>
                      {loading && (
                        <div className="mt-1.5 text-[10px] text-[var(--party-primary)] font-medium">登录中…</div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-[#F0F0F0] text-[11px] text-[#9CA3AF] leading-relaxed">
                <strong>说明</strong>:这是开发期 Mock 登录,任何人都可以直接选账号进入,无需密码。
                生产环境由统一身份认证(Casdoor / 单位 SSO)接管,此面板自动隐藏。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
