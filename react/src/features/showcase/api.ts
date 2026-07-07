import { api, apiOrigin } from "@/shared/api/client";

/* ─── 类型(镜像后端契约) ─── */

export type StageStatus = "draft" | "pending" | "published" | "rejected" | "closed";
export type EntryStatus = "draft" | "pending" | "published" | "rejected";
export type RankBy = "likes" | "metric";
export type ShowcaseTargetType = "stage" | "entry";

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "比拼中",
  rejected: "已驳回",
  closed: "已收官",
};

export const STAGE_STATUS_CHIP: Record<StageStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
  closed: "bg-slate-200 text-slate-600",
};

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "已公开",
  rejected: "已驳回",
};

export const ENTRY_STATUS_CHIP: Record<EntryStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

/** 展示工具区块(contentJson 结构见各工具 tools/<type>.tsx) */
export type ShowcaseBlockType =
  | "compare"
  | "spot"
  | "pano360"
  | "ranking"
  | "video"
  | "metric"
  | "trend"
  | "timeline"
  | "story";

export interface ShowcaseBlock {
  id: string;
  type: ShowcaseBlockType;
  content: Record<string, unknown>;
}

/** 填报规则的模板块:台主定「工具类型+块标题+填报要求」,参晒人逐块照填(不能增删) */
export interface TemplateBlock {
  id: string;
  type: ShowcaseBlockType;
  title: string;
  requirement?: string;
}

export interface ShowcaseCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  stageCount: number;
}

export interface StageListItem {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  intro: string | null;
  coverFileId: string | null;
  rankBy: RankBy;
  metricLabel: string | null;
  metricUnit: string | null;
  status: StageStatus;
  rejectReason: string | null;
  ownerId: string;
  ownerName: string;
  pinned: boolean;
  viewCount: number;
  likeCount: number;
  entryCount: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface StageDetail extends Omit<StageListItem, "intro"> {
  intro: string | null;
  rulesMd: string | null;
  introBlocks: ShowcaseBlock[];
  /** 填报规则(区块模板);空数组=旧数据/未配置(自由创作兜底) */
  template: TemplateBlock[];
  metricDecimals: number;
  metricOrder: "desc" | "asc";
  reviewedByName: string | null;
  reviewedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  liked: boolean;
  isOwner: boolean;
  canManage: boolean;
  canReview: boolean;
  pendingEntryCount: number;
  myEntries: Array<{ id: string; title: string; status: EntryStatus }>;
}

export interface EntryListItem {
  id: string;
  stageId: string;
  title: string;
  summary: string | null;
  coverFileId: string | null;
  metricValue: number | null;
  status: EntryStatus;
  rejectReason: string | null;
  authorId: string;
  authorName: string;
  viewCount: number;
  likeCount: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface MyEntryItem extends EntryListItem {
  stageTitle: string;
  stageStatus: StageStatus;
}

export interface EntryDetail extends EntryListItem {
  blocks: ShowcaseBlock[];
  reviewedByName: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  stage: {
    id: string;
    title: string;
    status: StageStatus;
    ownerId: string;
    ownerName: string;
    rankBy: RankBy;
    metricLabel: string | null;
    metricUnit: string | null;
    metricDecimals: number;
    metricOrder: "desc" | "asc";
    metricDisplay: string | null;
    template: TemplateBlock[];
  };
  rank: number | null;
  liked: boolean;
  isAuthor: boolean;
  canReview: boolean;
  canEdit: boolean;
}

export interface RankingItem {
  rank: number;
  entryId: string;
  title: string;
  authorId: string;
  authorName: string;
  coverFileId: string | null;
  value: number;
  display: string;
}

export interface StageRanking {
  rankBy: RankBy;
  metricLabel: string | null;
  metricUnit: string | null;
  metricDecimals: number;
  metricOrder: "desc" | "asc";
  items: RankingItem[];
  unranked: Array<{ entryId: string; title: string; authorName: string }>;
  myEntryIds: string[];
}

export interface ReactionState {
  liked: boolean;
  likeCount: number;
}

export interface ShowcaseFeedbackReply {
  id: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface ShowcaseFeedbackItem {
  id: string;
  targetType: ShowcaseTargetType;
  targetId: string;
  targetTitle: string;
  userName: string;
  anonymous: boolean;
  content: string;
  status: "open" | "replied" | "closed";
  createdAt: string;
  replies: ShowcaseFeedbackReply[];
}

export interface StageListResult {
  total: number;
  page: number;
  pageSize: number;
  items: StageListItem[];
}

export interface EntryListResult {
  total: number;
  page: number;
  pageSize: number;
  items: EntryListItem[];
}

export interface StageListParams {
  q?: string;
  categoryId?: string;
  mine?: boolean;
  status?: string;
  sort?: "latest" | "hot";
  page?: number;
  pageSize?: number;
}

export interface SaveStageInput {
  title: string;
  categoryId: string;
  intro?: string;
  rulesMd?: string;
  introBlocks?: ShowcaseBlock[];
  template?: TemplateBlock[];
  coverFileId?: string;
  rankBy?: RankBy;
  metricLabel?: string;
  metricUnit?: string;
  metricDecimals?: number;
  metricOrder?: "desc" | "asc";
}

export interface SaveEntryInput {
  title: string;
  summary?: string;
  coverFileId?: string;
  blocks?: ShowcaseBlock[];
  metricValue?: number;
}

/* ─── 公开文件 URL(区块 <img>/<video> 带不了 auth 头,走公开口;带 HTTP Range) ─── */

export function showcaseFileUrl(fileId: string): string {
  return `${apiOrigin}/api/public/showcase/files/${fileId}`;
}

/** 浏览时长上报 URL(useViewTracking 用 navigator.sendBeacon 发,公开口) */
export function showcaseViewBeaconUrl(): string {
  return `${apiOrigin}/api/public/showcase/view-beacon`;
}

/** 从 axios 错误里提取后端 message(校验/409/403 的中文提示) */
export function showcaseErrMsg(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } } };
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(";");
  return m || fallback;
}

/* ─── API ─── */

export const showcaseApi = {
  /* 分类(六榜) */
  listCategories: () => api.get<ShowcaseCategory[]>("/showcase/categories").then((r) => r.data),
  createCategory: (data: { name: string; description?: string; icon?: string; sortOrder?: number }) =>
    api.post<ShowcaseCategory>("/showcase/categories", data).then((r) => r.data),
  updateCategory: (id: string, data: { name?: string; description?: string; icon?: string; sortOrder?: number }) =>
    api.patch<ShowcaseCategory>(`/showcase/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) =>
    api.delete<{ ok: true }>(`/showcase/categories/${id}`).then((r) => r.data),
  reorderCategories: (items: Array<{ id: string; sortOrder: number }>) =>
    api.post<{ ok: true }>("/showcase/categories/reorder", { items }).then((r) => r.data),

  /* 晒台 */
  listStages: (params: StageListParams = {}) =>
    api
      .get<StageListResult>("/showcase/stages", {
        params: { ...params, mine: params.mine ? 1 : undefined },
      })
      .then((r) => r.data),
  getStage: (id: string) => api.get<StageDetail>(`/showcase/stages/${id}`).then((r) => r.data),
  getRanking: (id: string) =>
    api.get<StageRanking>(`/showcase/stages/${id}/ranking`).then((r) => r.data),
  createStage: (data: SaveStageInput) =>
    api.post<StageDetail>("/showcase/stages", data).then((r) => r.data),
  updateStage: (id: string, data: Partial<SaveStageInput> & { pinned?: boolean }) =>
    api.patch<StageDetail>(`/showcase/stages/${id}`, data).then((r) => r.data),
  submitStage: (id: string) =>
    api.post<StageDetail>(`/showcase/stages/${id}/submit`).then((r) => r.data),
  reviewStage: (id: string, data: { approve: boolean; reason?: string }) =>
    api.post<StageDetail>(`/showcase/stages/${id}/review`, data).then((r) => r.data),
  closeStage: (id: string) => api.post<StageDetail>(`/showcase/stages/${id}/close`).then((r) => r.data),
  reopenStage: (id: string) =>
    api.post<StageDetail>(`/showcase/stages/${id}/reopen`).then((r) => r.data),
  unpublishStage: (id: string) =>
    api.post<StageDetail>(`/showcase/stages/${id}/unpublish`).then((r) => r.data),
  deleteStage: (id: string) => api.delete<{ ok: true }>(`/showcase/stages/${id}`).then((r) => r.data),

  /* 参晒作品 */
  listEntries: (
    stageId: string,
    params: { status?: string; sort?: "rank" | "latest"; page?: number; pageSize?: number } = {},
  ) => api.get<EntryListResult>(`/showcase/stages/${stageId}/entries`, { params }).then((r) => r.data),
  listMyEntries: () => api.get<MyEntryItem[]>("/showcase/entries/mine").then((r) => r.data),
  listAllEntries: (params: { status?: string; page?: number; pageSize?: number } = {}) =>
    api
      .get<{ total: number; page: number; pageSize: number; items: MyEntryItem[] }>("/showcase/entries", { params })
      .then((r) => r.data),
  entriesBoard: (sort: "hot" | "latest", limit = 8) =>
    api.get<MyEntryItem[]>("/showcase/entries/board", { params: { sort, limit } }).then((r) => r.data),
  createEntry: (stageId: string, data: SaveEntryInput) =>
    api.post<EntryDetail>(`/showcase/stages/${stageId}/entries`, data).then((r) => r.data),
  getEntry: (id: string) => api.get<EntryDetail>(`/showcase/entries/${id}`).then((r) => r.data),
  updateEntry: (id: string, data: Partial<SaveEntryInput>) =>
    api.patch<EntryDetail>(`/showcase/entries/${id}`, data).then((r) => r.data),
  submitEntry: (id: string) =>
    api.post<EntryDetail>(`/showcase/entries/${id}/submit`).then((r) => r.data),
  reviewEntry: (id: string, data: { approve: boolean; reason?: string }) =>
    api.post<EntryDetail>(`/showcase/entries/${id}/review`, data).then((r) => r.data),
  deleteEntry: (id: string) => api.delete<{ ok: true }>(`/showcase/entries/${id}`).then((r) => r.data),

  /* 资源上传(规范命名「标题-序号」,集中 stage-<id> / entry-<id>) */
  uploadStageFile: (stageId: string, file: File | Blob, filename?: string) =>
    uploadTo(`/showcase/stages/${stageId}/upload`, file, filename),
  uploadEntryFile: (entryId: string, file: File | Blob, filename?: string) =>
    uploadTo(`/showcase/entries/${entryId}/upload`, file, filename),

  /* ─── 互动(批次 3 接入 UI) ─── */
  reactionState: (kind: ShowcaseTargetType, id: string) =>
    api.get<ReactionState>(`/showcase/${kindPath(kind)}/${id}/reactions/mine`).then((r) => r.data),
  setReaction: (kind: ShowcaseTargetType, id: string, on: boolean) =>
    (on
      ? api.post<ReactionState>(`/showcase/${kindPath(kind)}/${id}/reactions/like`)
      : api.delete<ReactionState>(`/showcase/${kindPath(kind)}/${id}/reactions/like`)
    ).then((r) => r.data),
  addFeedback: (kind: ShowcaseTargetType, id: string, data: { content: string; anonymous?: boolean }) =>
    api.post<{ ok: true }>(`/showcase/${kindPath(kind)}/${id}/feedback`, data).then((r) => r.data),
  listFeedback: (scope: "mine" | "all" = "mine", status?: string) =>
    api.get<ShowcaseFeedbackItem[]>("/showcase/feedback", { params: { scope, status } }).then((r) => r.data),
  replyFeedback: (feedbackId: string, content: string) =>
    api.post<ShowcaseFeedbackReply>(`/showcase/feedback/${feedbackId}/replies`, { content }).then((r) => r.data),
  closeFeedback: (feedbackId: string) =>
    api.patch<{ ok: true }>(`/showcase/feedback/${feedbackId}/close`).then((r) => r.data),
  recordView: (kind: ShowcaseTargetType, id: string) =>
    api.post<{ viewLogId: string; counted: boolean }>(`/showcase/${kindPath(kind)}/${id}/view`).then((r) => r.data),
};

function kindPath(kind: ShowcaseTargetType): string {
  return kind === "stage" ? "stages" : "entries";
}

function uploadTo(url: string, file: File | Blob, filename?: string) {
  const form = new FormData();
  const name = filename ?? (file instanceof File ? file.name : "upload.bin");
  form.append("file", file, name);
  return api
    .post<{ fileId: string; url: string; name: string }>(url, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600_000, // 视频最大 500MB,给足上传时间
    })
    .then((r) => r.data);
}
