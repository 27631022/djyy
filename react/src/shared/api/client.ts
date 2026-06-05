import axios from "axios";

/**
 * 平台 API 基址。
 *
 * 优先级:
 *  1. Vite 环境变量 VITE_API_BASE_URL(production / 显式部署场景)
 *  2. 否则根据当前页面 hostname 自动推导,后端固定 3001 端口
 *
 * 这样在开发机访问 http://localhost:5173 时,API 自动是 http://localhost:3001/api;
 * 局域网另一台访问 http://10.10.10.195:5173 时,API 自动变成 http://10.10.10.195:3001/api,
 * 不需要任何配置改动。
 */
function inferApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (envBase) return envBase;
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3001/api`;
  }
  return "http://localhost:3001/api";
}

const BASE_URL = inferApiBase();

const TOKEN_KEY = "djyy_auth_token_v1";

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 15000,
});

/* 请求拦截:自动携带 Bearer token */
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      // axios v1 AxiosHeaders 实例支持 set 方法
      config.headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore localStorage failures */
  }
  return config;
});

/* 响应拦截:401 自动清 token + 跳登录页 */
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
      // 不在 /login 时跳转,避免死循环;/widget(桌面挂件)自行处理登录,401 只清 token 不跳整页
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (path && !path.startsWith("/login") && !path.startsWith("/widget")) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/login?redirect=${redirect}`);
      }
    } else if (err?.response?.data) {
      console.warn("[djyy api]", status, err.response.data);
    } else {
      console.warn("[djyy api]", err.message);
    }
    return Promise.reject(err);
  },
);
