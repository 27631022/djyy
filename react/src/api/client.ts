import axios from "axios";

/** 平台 API 基址。优先读取 Vite 环境变量,缺省指向本地后端。 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";

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
      // 仅当当前不在 /login 时跳转,避免重定向死循环
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
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
