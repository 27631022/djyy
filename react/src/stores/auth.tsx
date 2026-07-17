import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, readStoredToken, storeToken, type AuthMe } from "@/features/auth";

interface AuthContextValue {
  /** undefined = 加载中,null = 未登录,对象 = 已登录 */
  me: AuthMe | null | undefined;
  /** dev-login 简捷封装 */
  login: (username: string) => Promise<void>;
  /** 清 token + me */
  logout: () => void;
  /** 主动刷新 /auth/me */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // 无 token 直接以「未登录」起步(不闪加载态);有 token 的由挂载 effect 拉 /auth/me
  const [me, setMe] = useState<AuthMe | null | undefined>(() => (readStoredToken() ? undefined : null));

  const refresh = useCallback(async () => {
    const token = readStoredToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      setMe(await authApi.me());
    } catch {
      // 401 已被 client interceptor 处理(清 token + 跳转),这里兜底标记未登录
      setMe(null);
    }
  }, []);

  const login = useCallback(
    async (username: string) => {
      const resp = await authApi.devLogin(username);
      storeToken(resp.token);
      // 换账号先清缓存,再拉新用户 —— 否则上一个用户的 react-query 缓存(角色/用户/组织树等)
      // 在同浏览器切换时会残留(SPA 内切换不 reload),新用户可能瞬间看到旧用户的数据
      qc.clear();
      await refresh();
    },
    [refresh, qc],
  );

  const logout = useCallback(() => {
    storeToken(null);
    setMe(null);
    qc.clear(); // 登出即清缓存,不把上一个用户的敏感数据留在内存
  }, [qc]);

  // 启动时有 token 才拉一次 /auth/me;setState 全在请求回调里(不在 effect 体内同步调)
  useEffect(() => {
    if (!readStoredToken()) return; // 初始态已是 null
    let alive = true;
    authApi
      .me()
      .then((data) => {
        if (alive) setMe(data);
      })
      .catch(() => {
        if (alive) setMe(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ me, login, logout, refresh }), [me, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
