import { api } from "@/shared/api/client";

/** 与后端 search 模块的 SearchHitType 一致(backend/src/search/README.md 有 url↔路由对照表) */
export type SearchHitType =
  | "knowledge"
  | "faq"
  | "nav"
  | "showcase-stage"
  | "showcase-entry"
  | "certificate";

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  /** 纯文本摘要(后端已剥 markdown,前端做关键词高亮) */
  snippet: string;
  /** 补充信息(分类名/晒台名/年度等) */
  extra: string;
  /** 落地路由;nav 命中为配置的跳转地址,可能是外链(按 ^https?:// 分流) */
  url: string;
}

export interface SearchGroup {
  type: SearchHitType;
  total: number;
  items: SearchHit[];
}

export interface SearchGroupsResult {
  q: string;
  groups: SearchGroup[];
}

export interface SearchTypeResult {
  q: string;
  type: SearchHitType;
  total: number;
  page: number;
  pageSize: number;
  items: SearchHit[];
}

export const SEARCH_TYPE_LABEL: Record<SearchHitType, string> = {
  nav: "应用",
  knowledge: "知识",
  faq: "热点问答",
  "showcase-stage": "晒台",
  "showcase-entry": "参晒作品",
  certificate: "我的证书",
};

export const searchApi = {
  /** 联想:各组前 N(1..5)条 + 组 total,空组不返回 */
  suggest: (q: string, limit = 3) =>
    api.get<SearchGroupsResult>("/search/suggest", { params: { q, limit } }).then((r) => r.data),
  /** 结果页「全部」:每组前 10 条 + 组 total */
  searchAll: (q: string) =>
    api.get<SearchGroupsResult>("/search", { params: { q } }).then((r) => r.data),
  /** 结果页单类型分页(pageSize ≤ 50) */
  searchType: (q: string, type: SearchHitType, page = 1, pageSize = 10) =>
    api
      .get<SearchTypeResult>("/search", { params: { q, type, page, pageSize } })
      .then((r) => r.data),
};
