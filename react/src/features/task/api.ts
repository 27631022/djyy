import type { CSSProperties } from "react";
import { api } from "@/shared/api/client";

/* ─── 任务表单字段(后端 TaskField 镜像;定义存模板/任务的 fields JSON)─── */

export type TaskFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "file"
  | "image"
  | "richtext"
  | "doclink";

export interface TaskField {
  code: string;
  label: string;
  type: TaskFieldType;
  /** 分组代码 + 分组名(如「报送党员数据」大组套「男党员数 / 女党员数」) */
  group?: string;
  groupLabel?: string;
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  description?: string;
  /** select:自定义下拉选项(直接填内容,不关联字典) */
  options?: string[];
  /** doclink:在线文档链接地址 */
  link?: string;
  /** number 约束 */
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  /** file / image 约束 */
  maxFiles?: number;
  accept?: string;
}

/* ─── 任务对象状态 ─── */
export const TASK_TARGET_STATUS_LABEL: Record<string, string> = {
  pending: "待分派",
  assigned: "已分派",
  in_progress: "填报中",
  submitted: "已提交",
  returned: "已退回",
  done: "已完成",
};

/* ─── 任务模板 ─── */
export interface TaskTemplateDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  fields: TaskField[];
  builtin: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskTemplateInput {
  code: string;
  name: string;
  description?: string;
  category?: string;
  fields: TaskField[];
  active?: boolean;
}

export type UpdateTaskTemplateInput = Partial<Omit<CreateTaskTemplateInput, "code">>;

/* ─── 派发 ─── */
export interface TaskTargetInput {
  targetType: "org" | "user";
  targetOrgId?: string;
  targetUserId?: string;
}

export interface DispatchTaskInput {
  /** 来源模板(可空 = 临时任务) */
  templateId?: string;
  title: string;
  description?: string;
  /** 注意事项(可空) */
  notes?: string;
  /** 派发部门 org id(对口路由匹配键);默认传派发人主行政归属 */
  dispatchOrgId?: string;
  /** ISO 串 */
  dueAt?: string;
  /** 通知文件(先经 storageApi.upload 拿 fileId) */
  noticeFileId?: string;
  noticeFileName?: string;
  fields: TaskField[];
  targets: TaskTargetInput[];
  status?: "draft" | "open";
}

/* ─── AI 识别通知文件(POST /tasks/extract)─── */
export interface TaskExtractResponse {
  title: string;
  /** 填报要求 */
  requirements: string;
  /** YYYY-MM-DD 或空串 */
  dueDate: string;
  /** 按填报要求初步生成的字段 */
  fields: TaskField[];
  /** 建议范围层级 level1..level4 或空串 */
  scopeHint: string;
  /** 建议填报单位名(前端做名称匹配预选) */
  suggestedUnits: string[];
  source: {
    fileName: string;
    bytes: number;
    textLength: number;
    promptTokens?: number;
    completionTokens?: number;
    usedProvider?: string;
    usedModel?: string;
  };
}

/* ─── 按填报要求生成字段(POST /tasks/suggest-fields)─── */
export interface SuggestFieldsResponse {
  fields: TaskField[];
  source: {
    usedProvider?: string;
    usedModel?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}

/* ─── 任务视图 ─── */
export type TaskStatusCounts = Record<string, number>;

export interface TaskListItem {
  id: string;
  title: string;
  templateId: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
  targetCount: number;
  statusCounts: TaskStatusCounts;
  fieldCount: number;
}

export interface TaskTargetView {
  id: string;
  targetType: "org" | "user";
  targetOrgId: string | null;
  targetUserId: string | null;
  targetName: string;
  ownerUserId: string | null;
  ownerName: string | null;
  /** 责任人电话(已接收时,从员工信息抽取,便于上级对接) */
  ownerPhone: string | null;
  /** 对口责任部门(承揽部门) */
  handlerOrgId: string | null;
  handlerOrgName: string | null;
  status: string;
  assignedAt: string | null;
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  templateId: string | null;
  fields: TaskField[];
  dispatchUserId: string;
  dispatchOrgId: string | null;
  dueAt: string | null;
  noticeFileId: string | null;
  noticeFileName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  targets: TaskTargetView[];
  statusCounts: TaskStatusCounts;
}

/* ─── 字段分组(渲染用:把扁平 fields 按 group 聚合,无 group 归「基本信息」)─── */
export interface TaskFieldGroup {
  key: string;
  label: string;
  fields: TaskField[];
}

export function groupTaskFields(fields: TaskField[]): TaskFieldGroup[] {
  const order: string[] = [];
  const map = new Map<string, TaskFieldGroup>();
  for (const f of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = f.group || "__default__";
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: f.groupLabel || (f.group ? f.group : "基本信息"),
        fields: [],
      });
      order.push(key);
    }
    map.get(key)!.fields.push(f);
  }
  return order.map((k) => map.get(k)!);
}

/* ─── 错误信息友好化(403 无权限最常见)─── */
export function taskApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    response?: { status?: number; data?: { message?: string | string[] } };
    message?: string;
  };
  if (e?.response?.status === 403) {
    return "当前账号没有「任务管理(task:manage)」权限,无法操作。请改用系统管理员账号,或让管理员在「角色管理」给你的角色勾上该权限。";
  }
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join("; ");
  return m ?? e?.message ?? fallback;
}

/* ─── API ─── */
export const taskTemplateApi = {
  list: (active?: boolean) =>
    api
      .get<TaskTemplateDto[]>("/task-templates", {
        params: active === undefined ? undefined : { active },
      })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<TaskTemplateDto>(`/task-templates/${id}`).then((r) => r.data),

  create: (input: CreateTaskTemplateInput) =>
    api.post<TaskTemplateDto>("/task-templates", input).then((r) => r.data),

  update: (id: string, input: UpdateTaskTemplateInput) =>
    api.patch<TaskTemplateDto>(`/task-templates/${id}`, input).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/task-templates/${id}`).then((r) => r.data),
};

/* ─── 我的待办(接收侧)─── */
export interface TaskInboxItem {
  targetId: string;
  taskId: string;
  title: string;
  dueAt: string | null;
  status: string;
  /** 我是否已是责任人 */
  isOwner: boolean;
  /** 是否可接收(未被认领) */
  claimable: boolean;
  dispatchOrgName: string | null;
  targetOrgName: string | null;
  handlerOrgName: string | null;
  fieldCount: number;
  createdAt: string;
}

/* ─── 填报(P2.2)─── */
export interface TaskFillDetail {
  targetId: string;
  taskId: string;
  taskTitle: string;
  notes: string | null;
  dueAt: string | null;
  fields: TaskField[];
  targetStatus: string;
  submission: {
    /** { [fieldCode]: value };file/image 值为 {id,name}[] */
    formData: Record<string, unknown>;
    status: string;
    reviewNote: string | null;
    submittedAt: string | null;
  };
}

export const taskApi = {
  dispatch: (input: DispatchTaskInput) =>
    api.post<TaskDetail>("/tasks", input).then((r) => r.data),

  list: () => api.get<TaskListItem[]>("/tasks").then((r) => r.data),

  get: (id: string) => api.get<TaskDetail>(`/tasks/${id}`).then((r) => r.data),

  /** AI 识别通知文件 → 预填任务草稿。AI 较慢,覆盖默认超时给 120s。 */
  extract: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<TaskExtractResponse>("/tasks/extract", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },

  /** 按填报要求文本生成填报字段(第二步「按填报要求生成字段」)。 */
  suggestFields: (requirements: string, title?: string) =>
    api
      .post<SuggestFieldsResponse>(
        "/tasks/suggest-fields",
        { requirements, title },
        { timeout: 120_000 },
      )
      .then((r) => r.data),

  /** 我的待办(接收侧) */
  inbox: () => api.get<TaskInboxItem[]>("/tasks/inbox").then((r) => r.data),

  /** 接收(认领)一个派发对象 → 成为责任人 */
  claim: (targetId: string) =>
    api
      .post<{ ok: boolean; status: string }>(`/tasks/targets/${targetId}/claim`, {})
      .then((r) => r.data),

  /** 填报页数据(责任人):任务字段 + 我的回执 */
  getFill: (targetId: string) =>
    api.get<TaskFillDetail>(`/tasks/targets/${targetId}/fill`).then((r) => r.data),

  /** 保存填报:submit=false 存草稿 / true 提交(后端校验必填) */
  saveFill: (targetId: string, formData: Record<string, unknown>, submit: boolean) =>
    api
      .post<{ ok: boolean; status: string }>(`/tasks/targets/${targetId}/fill`, {
        formData,
        submit,
      })
      .then((r) => r.data),
};

/* ─── 状态展示(任务级 + 对象级) ─── */
export const TASK_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  open: "进行中",
  closed: "已结束",
  archived: "已归档",
};

/** 对象状态(pending/assigned/…)对应的小标配色 */
export function taskStatusChip(st: string): CSSProperties {
  switch (st) {
    case "done":
      return { backgroundColor: "#ECFDF5", color: "#047857" };
    case "returned":
      return { backgroundColor: "#FEF2F2", color: "#DC2626" };
    case "submitted":
      return { backgroundColor: "#EEF2FF", color: "#4F46E5" };
    case "pending":
      return { backgroundColor: "#FFFBEB", color: "#B45309" };
    case "assigned":
    case "in_progress":
      return { backgroundColor: "#EFF6FF", color: "#1D4ED8" };
    default:
      return { backgroundColor: "#F3F4F6", color: "#4B5563" };
  }
}
