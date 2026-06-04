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
  /** 周期系列 id(null = 一次性任务) */
  seriesId: string | null;
  /** 期次标签(如「2026年6月」) */
  periodLabel: string | null;
  createdAt: string;
  targetCount: number;
  statusCounts: TaskStatusCounts;
  fieldCount: number;
}

/** 周期系列里的一期(期次切换用) */
export interface TaskSeriesSibling {
  id: string;
  periodLabel: string | null;
  createdAt: string;
  dueAt: string | null;
  current: boolean;
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
  /** 平级确认(机关↔机关互派):none=无需 | pending=待双方确认 | approved=已通过 | rejected=被驳回 */
  confirmStatus: string;
  /** 发方(派发部门)负责人决定:null=未决 | approved | rejected */
  senderConfirm: string | null;
  /** 收方(目标部门)负责人决定:null=未决 | approved | rejected */
  receiverConfirm: string | null;
  /** 驳回原因 */
  confirmNote: string | null;
  /** 发方部门负责人姓名 */
  senderOwnerName: string | null;
  /** 收方部门负责人姓名 */
  receiverOwnerName: string | null;
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
  /** 派发部门名(配置对口弹窗展示用) */
  dispatchOrgName: string | null;
  dueAt: string | null;
  noticeFileId: string | null;
  noticeFileName: string | null;
  status: string;
  seriesId: string | null;
  periodLabel: string | null;
  /** 同系列各期(含本期,createdAt 倒序),供期次切换 */
  siblings: TaskSeriesSibling[];
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
  const m = e?.response?.data?.message;
  const msg = Array.isArray(m) ? m.join("; ") : typeof m === "string" ? m : "";
  if (e?.response?.status === 403) {
    // 后端有具体说明(如「超出派发范围」)就显示它;否则给「缺少派发权限」的通用提示
    if (msg) return msg;
    return "当前账号没有「任务派发(task:manage)」权限,无法操作。请让管理员在「角色管理」给你授予「任务派发」角色,或改用系统管理员账号。";
  }
  return msg || e?.message || fallback;
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
  /** 我是否是该任务承办部门的负责人(可「指派」给本部门成员) */
  canAssign: boolean;
  /** 可指派的承办部门 id(canAssign=true 时;给成员选择器拉人用) */
  assignOrgId: string | null;
  /** 承办部门名 */
  assignOrgName: string | null;
  fieldCount: number;
  createdAt: string;
}

/* ─── 平级确认(机关↔机关互派,部门负责人侧)─── */
export interface TaskConfirmQueueItem {
  targetId: string;
  taskId: string;
  title: string;
  dueAt: string | null;
  /** 派发人姓名 */
  dispatchUserName: string | null;
  /** 发方部门名 */
  dispatchOrgName: string | null;
  /** 收方(目标)部门名 */
  targetOrgName: string | null;
  /** 我以哪一方身份待确认(receiver 优先显示) */
  side: "sender" | "receiver";
  asSender: boolean;
  asReceiver: boolean;
  /** 对方进度(null=未决 | approved | rejected) */
  senderConfirm: string | null;
  receiverConfirm: string | null;
  fieldCount: number;
  createdAt: string;
}

/** 平级确认状态 → 文案 + 配色(用于派发详情对象行) */
export const CONFIRM_STATUS_LABEL: Record<string, string> = {
  pending: "待平级确认",
  approved: "确认通过",
  rejected: "已驳回",
};
export function confirmStatusChip(st: string): CSSProperties {
  switch (st) {
    case "pending":
      return { backgroundColor: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" };
    case "approved":
      return { backgroundColor: "#ECFDF5", color: "#047857", borderColor: "#A7F3D0" };
    case "rejected":
      return { backgroundColor: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" };
    default:
      return { backgroundColor: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" };
  }
}

/* ─── 填报(P2.2)─── */
/** 往期填报(同系列同单位的一期历史,只读回看) */
export interface TaskFillHistoryEntry {
  taskId: string;
  periodLabel: string | null;
  submittedAt: string | null;
  formData: Record<string, unknown>;
}

export interface TaskFillDetail {
  targetId: string;
  taskId: string;
  taskTitle: string;
  notes: string | null;
  dueAt: string | null;
  /** 期次标签(周期任务) */
  periodLabel: string | null;
  seriesId: string | null;
  fields: TaskField[];
  targetStatus: string;
  /** 是否可编辑(已提交 / 已通过 = false,锁定;退回后恢复 true) */
  editable: boolean;
  /** 派发来源(标题下展示,便于基层咨询):派发部门 / 派发人 / 派发人电话 */
  dispatchOrgName: string | null;
  dispatchUserName: string | null;
  dispatchUserPhone: string | null;
  submission: {
    /** { [fieldCode]: value };file/image 值为 {id,name}[] */
    formData: Record<string, unknown>;
    status: string;
    reviewNote: string | null;
    submittedAt: string | null;
    /** 累计被退回次数 */
    returnCount: number;
  };
  /** 往期填报(近 6 期,最近在前) */
  history: TaskFillHistoryEntry[];
}

/* ─── 审核(P2.3:派发人看回执 + 通过/退回)─── */
export interface TaskSubmissionDetail {
  targetId: string;
  taskId: string;
  taskTitle: string;
  fields: TaskField[];
  targetType: string;
  targetName: string;
  ownerName: string | null;
  ownerPhone: string | null;
  handlerOrgName: string | null;
  /** 派发对象状态:submitted=待审 / returned=已退回 / done=已通过 */
  targetStatus: string;
  submission: {
    /** { [fieldCode]: value };file/image 值为 {id,name}[] */
    formData: Record<string, unknown>;
    status: string;
    reviewNote: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    returnCount: number;
  } | null;
}

/* ─── 汇总(P3:一行一对象 + 数字合计 + 附件)─── */
export interface TaskSummaryRow {
  targetId: string;
  targetType: "org" | "user";
  targetName: string;
  ownerName: string | null;
  ownerPhone: string | null;
  /** 派发对象状态(pending/…/done) */
  status: string;
  /** 回执状态(draft/submitted/returned/approved)或 null(无回执) */
  submissionStatus: string | null;
  submittedAt: string | null;
  /** { [fieldCode]: value };file/image 值为 {id,name}[] */
  values: Record<string, unknown>;
}

export interface TaskSummary {
  taskId: string;
  title: string;
  dueAt: string | null;
  periodLabel: string | null;
  seriesId: string | null;
  fields: TaskField[];
  rows: TaskSummaryRow[];
  /** number 字段合计(只统计已提交/已通过) */
  numberTotals: Record<
    string,
    { sum: number; count: number; decimals: number; unit: string | null }
  >;
  counts: { total: number; filled: number; unfilled: number };
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

  /** 我的派发范围(对象选择器过滤用;unrestricted=true 不限)。selfOrgIds=本单位子树(个人 tab 过滤用) */
  dispatchScope: () =>
    api
      .get<{ unrestricted: boolean; orgIds: string[]; selfOrgIds: string[] }>("/tasks/dispatch-scope")
      .then((r) => r.data),

  /** 接收(认领)一个派发对象 → 成为责任人 */
  claim: (targetId: string) =>
    api
      .post<{ ok: boolean; status: string }>(`/tasks/targets/${targetId}/claim`, {})
      .then((r) => r.data),

  /** 指派承办人(承办部门负责人侧):把待接收对象指定给本部门某成员 */
  assign: (targetId: string, userId: string) =>
    api
      .post<{ ok: boolean; status: string }>(`/tasks/targets/${targetId}/assign`, { userId })
      .then((r) => r.data),

  /** 平级确认队列(部门负责人侧):待我确认的跨机关部门派发对象 */
  confirmQueue: () =>
    api.get<TaskConfirmQueueItem[]>("/tasks/confirm-queue").then((r) => r.data),

  /** 平级确认决定:approve / reject(note 在 reject 时必填) */
  confirmTarget: (targetId: string, decision: "approve" | "reject", note?: string) =>
    api
      .post<{ ok: boolean; confirmStatus: string }>(`/tasks/targets/${targetId}/confirm`, {
        decision,
        note,
      })
      .then((r) => r.data),

  /** 重新发起(派发人侧):被驳回的跨部门对象重置回「待确认」,返回更新后的任务详情 */
  reinitiateConfirm: (targetId: string) =>
    api.post<TaskDetail>(`/tasks/targets/${targetId}/reinitiate`, {}).then((r) => r.data),

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

  /** 审核:查看某派发对象的回执(派发人侧) */
  getSubmission: (targetId: string) =>
    api.get<TaskSubmissionDetail>(`/tasks/targets/${targetId}/submission`).then((r) => r.data),

  /** 审核:通过(approve)/ 退回重填(return,note 必填) */
  review: (targetId: string, decision: "approve" | "return", note?: string) =>
    api
      .post<{ ok: boolean; status: string }>(`/tasks/targets/${targetId}/review`, {
        decision,
        note,
      })
      .then((r) => r.data),

  /** 汇总(派发人侧):一行一对象 + 数字合计 + 附件 */
  summary: (taskId: string) =>
    api.get<TaskSummary>(`/tasks/${taskId}/summary`).then((r) => r.data),

  /** 发起新一期(周期报表):克隆 + 上期值预填 + 同责任人接力,返回新一期任务 */
  startNewPeriod: (taskId: string, input: { periodLabel?: string; dueAt?: string }) =>
    api.post<TaskDetail>(`/tasks/${taskId}/new-period`, input).then((r) => r.data),

  /** 配置对口:把某责任部门的「对口上级」设为本任务派发部门(实时生效) */
  configureCounterpart: (taskId: string, handlerOrgId: string) =>
    api
      .post<TaskDetail>(`/tasks/${taskId}/configure-counterpart`, { handlerOrgId })
      .then((r) => r.data),

  /** 设置 / 补派发部门(历史任务没派发部门时) */
  setDispatchOrg: (taskId: string, dispatchOrgId: string) =>
    api.post<TaskDetail>(`/tasks/${taskId}/dispatch-org`, { dispatchOrgId }).then((r) => r.data),

  /** 附件批量打包下载(ZIP,按单位分文件夹);用 POST 避免被下载管理器拦截,返回 Blob */
  attachmentsZip: (taskId: string) =>
    api
      .post<Blob>(`/tasks/${taskId}/attachments-zip`, null, {
        responseType: "blob",
        timeout: 120_000,
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

/* ─── 截止提醒 / 完成时效(画像考核)─── */
export type DueTone = "normal" | "soon" | "overdue" | "doneOnTime" | "doneLate";
export interface DueInfo {
  text: string;
  tone: DueTone;
  /** 未提交:剩余天数(负=逾期);已提交:负=提前/按期、正=逾期天数 */
  days: number;
  /** 是否完成态(用 submittedAt 判定按期/逾期) */
  done: boolean;
}

const MS_DAY = 86_400_000;
/** 逾期超过这个天数(约 2 年)就只显示「逾期很久」,不再报具体天数(避开坏数据如 1111 年的天文数字) */
const LONG_OVERDUE_DAYS = 730;
/** 按本地「日历日」取整的差值(到 / 从,忽略时分,更符合「还有几天」的直觉) */
function calendarDayDiff(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_DAY);
}

/**
 * 截止信息:
 * - 传 submittedAt(已提交/已通过)→ 判「按期完成 / 逾期 N 天完成」(画像考核)
 * - 否则按当前时间算「还有 N 天 / 今天截止 / 已逾期 N 天」(≤3 天或逾期为醒目态)
 * 逾期 / 逾期完成超过 2 年只显示「逾期很久」,不报天文数字(坏数据兜底)。
 * 返回 null = 无截止日期。
 */
export function dueInfo(dueAt: string | null, submittedAt?: string | null): DueInfo | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  if (submittedAt) {
    const sub = new Date(submittedAt);
    const over = calendarDayDiff(due, sub); // 正 = 逾期天数
    if (over <= 0) return { text: "按期完成", tone: "doneOnTime", days: over, done: true };
    if (over > LONG_OVERDUE_DAYS)
      return { text: "逾期很久完成", tone: "doneLate", days: over, done: true };
    return { text: `逾期 ${over} 天完成`, tone: "doneLate", days: over, done: true };
  }

  const left = calendarDayDiff(new Date(), due); // 正 = 还剩天数
  if (left < 0) {
    const over = -left;
    if (over > LONG_OVERDUE_DAYS)
      return { text: "逾期很久了", tone: "overdue", days: left, done: false };
    return { text: `已逾期 ${over} 天`, tone: "overdue", days: left, done: false };
  }
  if (left === 0) return { text: "今天截止", tone: "soon", days: 0, done: false };
  if (left <= 3) return { text: `还有 ${left} 天`, tone: "soon", days: left, done: false };
  return { text: `还有 ${left} 天`, tone: "normal", days: left, done: false };
}

/** DueTone → chip 配色 */
export function dueToneStyle(tone: DueTone): CSSProperties {
  switch (tone) {
    case "overdue":
      return { backgroundColor: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" };
    case "soon":
      return { backgroundColor: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" };
    case "doneOnTime":
      return { backgroundColor: "#ECFDF5", color: "#047857", borderColor: "#A7F3D0" };
    case "doneLate":
      return { backgroundColor: "#FFF7ED", color: "#B45309", borderColor: "#FED7AA" };
    default:
      return { backgroundColor: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" };
  }
}

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
