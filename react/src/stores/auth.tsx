import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [me, setMe] = useState<AuthMe | null | undefined>(undefined);

  async function refresh() {
    const token = readStoredToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const data = await authApi.me();
      setMe(data);
    } catch {
      // 401 已被 client interceptor 处理(清 token + 跳转),这里兜底标记未登录
      setMe(null);
    }
  }

  async function login(username: string) {
    const resp = await authApi.devLogin(username);
    storeToken(resp.token);
    await refresh();
  }

  function logout() {
    storeToken(null);
    setMe(null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ me, login, logout, refresh }), [me]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
