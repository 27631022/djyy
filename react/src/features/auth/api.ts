import { api } from "@/shared/api/client";

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
  avatarUrl: string | null;
  active: boolean;
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
};

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
