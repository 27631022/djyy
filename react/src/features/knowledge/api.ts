import { api, apiOrigin } from "@/shared/api/client";

/* ─── 类型(镜像后端契约) ─── */

export interface KnowledgeCategory {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  articleCount: number;
  children: KnowledgeCategory[];
}

export interface KnowledgeType {
  code: string;
  name: string;
  requireReview: boolean;
  sortOrder: number;
}

export type ArticleStatus = "draft" | "pending" | "published" | "rejected" | "archived";

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "已发布",
  rejected: "已驳回",
  archived: "已归档",
};

export const ARTICLE_STATUS_CHIP: Record<ArticleStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
  archived: "bg-slate-200 text-slate-500",
};

export interface ArticleListItem {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  typeCode: string;
  typeName: string;
  tags: string[];
  excerpt: string;
  status: ArticleStatus;
  rejectReason: string | null;
  source: "manual" | "import" | "ai_archive";
  authorId: string;
  authorName: string;
  versionLabel: string | null;
  pinned: boolean;
  coverFileId: string | null;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleVersion {
  id: string;
  title: string;
  versionLabel: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
}

export interface ArticleAttachment {
  id: string;
  fileId: string;
  name: string;
  size: number;
  downloadCount: number;
  sortOrder: number;
}

export interface ArticleDetail {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  typeCode: string;
  typeName: string;
  requireReview: boolean;
  contentMd: string;
  summary: string | null;
  faqs: Array<{ q: string; a: string }>;
  tags: string[];
  versionGroupId: string | null;
  versionLabel: string | null;
  status: ArticleStatus;
  rejectReason: string | null;
  source: string;
  sourceUrl: string | null;
  authorId: string;
  authorName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  pinned: boolean;
  coverFileId: string | null;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  attachments: ArticleAttachment[];
  versions: ArticleVersion[];
}

export interface ArticleListResult {
  total: number;
  page: number;
  pageSize: number;
  items: ArticleListItem[];
}

export interface ArticleListParams {
  q?: string;
  categoryId?: string;
  typeCode?: string;
  tag?: string;
  mine?: boolean;
  favorite?: boolean;
  status?: string;
  sort?: "latest" | "hot";
  page?: number;
  pageSize?: number;
}

export interface SaveArticleInput {
  title: string;
  categoryId: string;
  typeCode: string;
  contentMd: string;
  summary?: string;
  tags?: string[];
  revisionOfId?: string;
  versionLabel?: string;
  coverFileId?: string;
  sourceUrl?: string;
}

/* ─── 公开文件 URL ─── */

/**
 * 知识库文件的公开访问 URL(正文图片 <img>、附件下载)。
 * markdown 里存相对路径 `/api/public/knowledge/files/<id>`,渲染时经本函数拼后端 origin
 * (治局域网 IP 变动,与头像 resolveAvatarUrl 同一策略)。
 */
export function knowledgeFileUrl(fileId: string): string {
  return `${apiOrigin}/api/public/knowledge/files/${fileId}`;
}

/** 烤进 markdown 的相对引用(不带 origin,跨部署环境可移植) */
export function knowledgeFileRef(fileId: string): string {
  return `/api/public/knowledge/files/${fileId}`;
}

/* ─── API ─── */

export const knowledgeApi = {
  /* 分类 */
  listCategories: () =>
    api.get<KnowledgeCategory[]>("/knowledge/categories").then((r) => r.data),
  createCategory: (data: { name: string; parentId?: string; description?: string; icon?: string; sortOrder?: number }) =>
    api.post<KnowledgeCategory>("/knowledge/categories", data).then((r) => r.data),
  updateCategory: (id: string, data: { name?: string; description?: string; icon?: string; sortOrder?: number }) =>
    api.patch<KnowledgeCategory>(`/knowledge/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) =>
    api.delete<{ ok: true }>(`/knowledge/categories/${id}`).then((r) => r.data),

  /* 内容类型 */
  listTypes: () => api.get<KnowledgeType[]>("/knowledge/types").then((r) => r.data),
  createType: (data: { code: string; name: string; requireReview?: boolean; sortOrder?: number }) =>
    api.post<KnowledgeType>("/knowledge/types", data).then((r) => r.data),
  updateType: (code: string, data: { name?: string; requireReview?: boolean; sortOrder?: number }) =>
    api.patch<KnowledgeType>(`/knowledge/types/${code}`, data).then((r) => r.data),
  deleteType: (code: string) =>
    api.delete<{ ok: true }>(`/knowledge/types/${code}`).then((r) => r.data),

  /* 文章 */
  listArticles: (params: ArticleListParams = {}) =>
    api
      .get<ArticleListResult>("/knowledge/articles", {
        params: {
          ...params,
          mine: params.mine ? 1 : undefined,
          favorite: params.favorite ? 1 : undefined,
        },
      })
      .then((r) => r.data),
  getArticle: (id: string) =>
    api.get<ArticleDetail>(`/knowledge/articles/${id}`).then((r) => r.data),
  recordView: (id: string) =>
    api.post<{ viewLogId: string; counted: boolean }>(`/knowledge/articles/${id}/view`).then((r) => r.data),
  createArticle: (data: SaveArticleInput) =>
    api.post<ArticleDetail>("/knowledge/articles", data).then((r) => r.data),
  updateArticle: (id: string, data: Partial<SaveArticleInput> & { pinned?: boolean }) =>
    api.patch<ArticleDetail>(`/knowledge/articles/${id}`, data).then((r) => r.data),
  submitArticle: (id: string) =>
    api.post<ArticleDetail>(`/knowledge/articles/${id}/submit`).then((r) => r.data),
  reviewArticle: (id: string, data: { approve: boolean; reason?: string }) =>
    api.post<ArticleDetail>(`/knowledge/articles/${id}/review`, data).then((r) => r.data),
  unpublishArticle: (id: string) =>
    api.post<ArticleDetail>(`/knowledge/articles/${id}/unpublish`).then((r) => r.data),
  deleteArticle: (id: string) =>
    api.delete<{ ok: true }>(`/knowledge/articles/${id}`).then((r) => r.data),

  /* 附件 */
  addAttachment: (articleId: string, data: { fileId: string; name?: string }) =>
    api.post<ArticleAttachment>(`/knowledge/articles/${articleId}/attachments`, data).then((r) => r.data),
  removeAttachment: (attachmentId: string) =>
    api.delete<{ ok: true }>(`/knowledge/attachments/${attachmentId}`).then((r) => r.data),
  attachmentDownloaded: (attachmentId: string) =>
    api.post<{ fileId: string; name: string }>(`/knowledge/attachments/${attachmentId}/download`).then((r) => r.data),
};

/** 从 axios 错误里提取后端 message(表单校验/409/403 的中文提示) */
export function knowledgeErrMsg(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } } };
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(";");
  return m || fallback;
}
