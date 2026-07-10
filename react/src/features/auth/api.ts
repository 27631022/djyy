import { api, apiOrigin } from "@/shared/api/client";

export interface AuthMembership {
  userId: string;
  orgId: string;
  isPrimary: boolean;
  position: string | null;
  joinedAt: string;
  org: {
    id: string;
    name: string;
    code: string;
    kind: "party" | "admin";
    type: string;
    isVirtual: boolean;
    isDept: boolean;
    parentId: string | null;
  };
}

export interface AuthRoleAssignment {
  code: string;
  name: string;
  scope: "self" | "own" | "subtree" | "all" | "custom";
  /** scope=custom 时可能有多个组织,其它 scope 该数组为空 */
  scopeOrgs: { id: string; name: string; kind: "party" | "admin" }[];
  grantedAt: string;
}

export interface AuthMe {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  active: boolean;
  /** 统一账号(Casdoor/SSO)是否已绑定 —— 个人设置「账号安全」展示用 */
  externalBound: boolean;
  /** platform_admin 超管 = 看全部菜单(直通) */
  isPlatformAdmin: boolean;
  /** 有效权限点(供前端按权限隐藏菜单) */
  permissions: string[];
  memberships: {
    admin: AuthMembership[];
    party: AuthMembership[];
  };
  roles: AuthRoleAssignment[];
}

export interface DevLoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
}

export const TOKEN_STORAGE_KEY = "djyy_auth_token_v1";

export const authApi = {
  devLogin: (username: string) =>
    api.post<DevLoginResponse>("/auth/dev-login", { username }).then((r) => r.data),

  me: () => api.get<AuthMe>("/auth/me").then((r) => r.data),

  /** 后端登录模式:mock=开发演示账号面板,oidc=统一账号登录(Casdoor / 单位 SSO) */
  mode: () => api.get<{ mode: "mock" | "oidc" }>("/auth/mode").then((r) => r.data),

  /** 修改密码(仅 oidc 模式;旧密码由统一登录服务校验,mock 模式后端返回明确提示) */
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post<{ ok: boolean }>("/auth/change-password", { oldPassword, newPassword }).then((r) => r.data),
};

/**
 * 统一登录入口 URL(整页跳转,非 XHR)。
 * returnTo = 登录成功后回跳的前端完整地址(后端按 CORS 白名单校验,防 open redirect);
 * 回跳时 token 挂在 URL fragment:<returnTo>#djyy_token=<token>,由登录页解析入库。
 */
export function oidcLoginUrl(returnTo: string): string {
  return `${apiOrigin}/api/auth/oidc/login?return=${encodeURIComponent(returnTo)}`;
}

export function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
