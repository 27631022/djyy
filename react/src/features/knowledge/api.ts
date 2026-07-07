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
  liked: boolean;
  favorited: boolean;
}

export interface ReactionState {
  liked: boolean;
  favorited: boolean;
  likeCount: number;
  favoriteCount: number;
}

export interface KnowledgeComment {
  id: string;
  articleId: string;
  userId: string;
  userName: string;
  content: string;
  replyToId: string | null;
  replyToUserName: string | null;
  createdAt: string;
}

export interface FeedbackReply {
  id: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface FeedbackItem {
  id: string;
  articleId: string;
  articleTitle: string;
  userName: string;
  anonymous: boolean;
  content: string;
  status: "open" | "replied" | "closed";
  createdAt: string;
  replies: FeedbackReply[];
}

export interface KnowledgeStats {
  articleCount: number;
  totalViews: number;
  totalLikes: number;
  totalFavorites: number;
  totalComments: number;
  totalViewLogs: number;
  totalDurationSec: number;
  feedbackOpen: number;
  topViewed: Array<{ id: string; title: string; viewCount: number; likeCount: number; commentCount: number }>;
  topLiked: Array<{ id: string; title: string; likeCount: number; favoriteCount: number; commentCount: number }>;
  topFavorited: Array<{ id: string; title: string; favoriteCount: number }>;
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
  reorderCategories: (items: Array<{ id: string; sortOrder: number }>) =>
    api.post<{ ok: true }>("/knowledge/categories/reorder", { items }).then((r) => r.data),

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

  /* 资源上传(规范命名「标题-序号」,集中 article-<id>)—— 图片/视频/附件共用 */
  uploadResource: (articleId: string, file: File | Blob, filename?: string) => {
    const form = new FormData();
    const name = filename ?? (file instanceof File ? file.name : "upload.bin");
    form.append("file", file, name);
    return api
      .post<{ fileId: string; url: string; name: string }>(`/knowledge/articles/${articleId}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300_000,
      })
      .then((r) => r.data);
  },

  /* 附件 */
  addAttachment: (articleId: string, data: { fileId: string; name?: string }) =>
    api.post<ArticleAttachment>(`/knowledge/articles/${articleId}/attachments`, data).then((r) => r.data),
  removeAttachment: (attachmentId: string) =>
    api.delete<{ ok: true }>(`/knowledge/attachments/${attachmentId}`).then((r) => r.data),
  attachmentDownloaded: (attachmentId: string) =>
    api.post<{ fileId: string; name: string }>(`/knowledge/attachments/${attachmentId}/download`).then((r) => r.data),

  /* ─── 互动(P3) ─── */
  setReaction: (articleId: string, type: "like" | "favorite", on: boolean) =>
    (on
      ? api.post<ReactionState>(`/knowledge/articles/${articleId}/reactions/${type}`)
      : api.delete<ReactionState>(`/knowledge/articles/${articleId}/reactions/${type}`)
    ).then((r) => r.data),
  listComments: (articleId: string, page = 1) =>
    api
      .get<{ total: number; page: number; pageSize: number; items: KnowledgeComment[] }>(
        `/knowledge/articles/${articleId}/comments`,
        { params: { page } },
      )
      .then((r) => r.data),
  addComment: (articleId: string, data: { content: string; replyToId?: string }) =>
    api.post<KnowledgeComment>(`/knowledge/articles/${articleId}/comments`, data).then((r) => r.data),
  removeComment: (commentId: string) =>
    api.delete<{ ok: true }>(`/knowledge/comments/${commentId}`).then((r) => r.data),
  addFeedback: (articleId: string, data: { content: string; anonymous?: boolean }) =>
    api.post<{ ok: true }>(`/knowledge/articles/${articleId}/feedback`, data).then((r) => r.data),
  listFeedback: (scope: "mine" | "all" = "mine", status?: string) =>
    api.get<FeedbackItem[]>("/knowledge/feedback", { params: { scope, status } }).then((r) => r.data),
  replyFeedback: (feedbackId: string, content: string) =>
    api.post<FeedbackReply>(`/knowledge/feedback/${feedbackId}/replies`, { content }).then((r) => r.data),
  closeFeedback: (feedbackId: string) =>
    api.patch<{ ok: true }>(`/knowledge/feedback/${feedbackId}/close`).then((r) => r.data),
  stats: () => api.get<KnowledgeStats>("/knowledge/stats").then((r) => r.data),

  /* ─── 文章模板(正文框架复用) ─── */
  listTemplates: () => api.get<KnowledgeTemplate[]>("/knowledge/templates").then((r) => r.data),
  createTemplate: (data: { name: string; description?: string; contentMd: string }) =>
    api.post<KnowledgeTemplate>("/knowledge/templates", data).then((r) => r.data),
  deleteTemplate: (id: string) =>
    api.delete<{ ok: true }>(`/knowledge/templates/${id}`).then((r) => r.data),
};

export interface KnowledgeTemplate {
  id: string;
  name: string;
  description: string | null;
  contentMd: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

/* ─── AI(P4) ─── */
export interface CleanResult {
  title: string;
  contentMd: string;
  categoryHint: string;
}
export const knowledgeAiApi = {
  capabilities: () => api.get<{ webSearch: boolean }>("/knowledge/ai/capabilities").then((r) => r.data),
  fetchUrl: (url: string) =>
    api.post<{ title: string; text: string }>("/knowledge/ai/fetch-url", { url }, { timeout: 30_000 }).then((r) => r.data),
  clean: (name: string, text: string) =>
    api.post<CleanResult>("/knowledge/ai/clean", { name, text }, { timeout: 180_000 }).then((r) => r.data),
  search: (name: string, hint?: string) =>
    api.post<CleanResult>("/knowledge/ai/search", { name, hint }, { timeout: 200_000 }).then((r) => r.data),
  guide: (articleId: string) =>
    api.post<{ summary: string; tags: string[] }>(`/knowledge/ai/articles/${articleId}/guide`, {}, { timeout: 120_000 }).then((r) => r.data),
  faq: (articleId: string) =>
    api.post<{ faqs: Array<{ q: string; a: string }> }>(`/knowledge/ai/articles/${articleId}/faq`, {}, { timeout: 120_000 }).then((r) => r.data),
};

/** 浏览时长上报 URL(useViewTracking 用 navigator.sendBeacon 发,公开口) */
export function knowledgeViewBeaconUrl(): string {
  return `${apiOrigin}/api/public/knowledge/view-beacon`;
}

/* ─── 批量导入(P2) ─── */

export interface ImportItem {
  path: string;
  title: string;
  dirSegments: string[];
  assetsFound: number;
  assetsMissing: number;
  dup: boolean;
}

export interface ImportAnalysis {
  importFileId: string;
  items: ImportItem[];
  sidebarIgnored: boolean;
  skippedNonMd: number;
}

export interface ImportExecuteItem {
  path: string;
  title: string;
  categoryPath: string[];
  typeCode: string;
  action: "create" | "skip";
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export const knowledgeImportApi = {
  analyze: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api
      .post<ImportAnalysis>("/knowledge/import/analyze", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },
  execute: (importFileId: string, items: ImportExecuteItem[]) =>
    api
      .post<ImportResult>("/knowledge/import/execute", { importFileId, items }, { timeout: 300_000 })
      .then((r) => r.data),
};

/** 从 axios 错误里提取后端 message(表单校验/409/403 的中文提示) */
export function knowledgeErrMsg(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } } };
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(";");
  return m || fallback;
}
