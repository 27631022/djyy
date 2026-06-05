import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../stores/auth";
import { SiteLogo } from "@/features/site-setting";

/* Mock 阶段:用户从下拉选一个 demo 账号,后端发 token。
   Casdoor 接入后此页面改为"跳转到 IdP 授权端点 + 处理回调"。 */
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

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* 已登录则直接跳到 redirect 或首页 */
  useEffect(() => {
    if (me) {
      const redirect = params.get("redirect");
      navigate(redirect && redirect.startsWith("/") ? redirect : "/", { replace: true });
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
            <span className="text-xs opacity-80">企业应用底座 · 开发模式登录</span>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-8">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-[#1A1A1A]">选择一个演示账号登录</h2>
            <span className="text-xs text-[#9CA3AF]">Mock 模式 · Casdoor 接入后将替换为标准 OIDC 登录</span>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {error}
            </div>
          )}

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
            生产环境将由 Casdoor 接管,支持企业微信 / 钉钉 / OA 等 SSO。
          </div>
        </div>
      </div>
    </div>
  );
}
