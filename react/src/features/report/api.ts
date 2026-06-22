import { api } from "@/shared/api/client";

/* ─── 后端 report 契约镜像。详见 docs/specs/2026-06-16-report-platform.md ─── */

export type ReportTaskStatus = "draft" | "open" | "closed" | "archived";

/* ─── 报送字段定义(存于 ReportTask.fields / ReportTemplate.fields 的 JSON)─── */

export type ReportFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "file"
  | "image"
  | "richtext"
  | "doclink"
  | "catalog_pick"
  | "detail_table";

/** 与 task 的 TaskField 同构,额外:catalog_pick(目录点选带出)+ detail_table(明细子表)。 */
export interface ReportField {
  code: string;
  label: string;
  type: ReportFieldType;
  group?: string;
  groupLabel?: string;
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  description?: string;
  /** select:自定义下拉选项 */
  options?: string[];
  /** doclink:链接地址 */
  link?: string;
  /** number 约束 */
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  /** file / image 约束 */
  maxFiles?: number;
  accept?: string;
  /** file / image:上传后可调 AI 识别(发票)并自动填表(扶贫发票上传开启) */
  aiExtract?: boolean;
  /** catalog_pick:绑定的目录批次 + 点选后带出哪些快照列(productName 始终带出) */
  catalogTag?: string;
  bringOut?: string[];
  /** detail_table:明细列(P1 限 catalog_pick / number / select / text / date) */
  columns?: ReportField[];
  /** detail_table 列 → ReportLine 结构化字段的语义角色(Step 5 持久化时消费) */
  role?: "product" | "amount" | "feeSource" | "qty" | string;
}

/** catalog_pick 点选后可带出的快照列(productName 始终带出,不在此列)。 */
export const CATALOG_BRING_OUT: { key: string; label: string }[] = [
  { key: "category", label: "分类" },
  { key: "categoryDesc", label: "分类描述" },
  { key: "recommendOrg", label: "推荐单位" },
  { key: "origin", label: "产地" },
  { key: "unitPriceCents", label: "采购价" },
];

/** catalog_pick 字段的填报值 = 点选商品后落库的清单快照(完整保留清单信息,年度调整不污染历史)。 */
export interface CatalogPickValue {
  catalogItemId?: string;
  productName: string;
  spec?: string | null;
  category?: string | null;
  categoryDesc?: string | null;
  supplier?: string | null; // 清单供应商(落 ReportLine.catalogSupplier;区别于发票销售方)
  recommendOrg?: string | null;
  origin?: string | null;
  taxRate?: string | null;
  minOrderQty?: string | null;
  contact?: string | null;
  unitPriceCents?: number | null;
}

/** 报送任务(= 后端 ReportTask)。一次发布,fan-out 到多对象,每对象可多次提交。 */
/* ─── 目标(goal)契约:两栏「报送明细查询工具」(镜像后端 report-goals.ts;只产目标+实际,不判断达标)─── */
export type GoalAgg = "sum" | "avg" | "count";
export type GoalBool = "and" | "or";
export type GoalGrain = "year" | "quarter" | "month";
export type GoalColMatch = "exact" | "text";
/** 一个筛选条件:某明细列 ∈/包含 一组值(values 内=或;空=不限)。 */
export interface GoalCondition {
  col: string;
  values: string[];
}
/** 条件分组:组内多条 condition 用 op(且/或)连。 */
export interface GoalGroup {
  op: GoalBool;
  conditions: GoalCondition[];
}
/** 报送目标定义(通用,可多个):左筛选(单层分组)→ 中统计。只产「目标值 + 实际值」,达标判断归考核。 */
export interface ReportGoal {
  key: string;
  label: string;
  // 左·筛选
  groupOp: GoalBool; // 组与组之间(且/或)
  groups: GoalGroup[];
  // 中·统计
  agg: GoalAgg;
  metricCol?: string; // sum/avg 对哪列;count 可选(该列非空数,空=命中行数)
  groupBy?: string; // 分组依据列 key;空=不分组
  grain?: GoalGrain; // groupBy 为日期列时的粒度
  // 目标值(逐单位 goalTargetsJson)仅作展示参考;达标判断 + 给分由考核工具处理
}
export const GOAL_AGG_LABEL: Record<GoalAgg, string> = { sum: "求和", avg: "平均", count: "计数" };
export const GOAL_GRAIN_LABEL: Record<GoalGrain, string> = { year: "按年", quarter: "按季度", month: "按月" };

/** 从任务字段派生的「可筛选/可聚合/可分组列」(镜像后端 deriveGoalColumns)。 */
export interface GoalColumn {
  key: string;
  label: string;
  role: "dim" | "metric" | "date";
  match?: GoalColMatch;
  options?: string[];
  source: string;
  isCents?: boolean;
}
const CATALOG_SUBCOLS: Omit<GoalColumn, "role">[] = [
  { key: "category", label: "分部分", match: "exact", source: "col:category" },
  { key: "recommendOrg", label: "推荐单位", match: "text", source: "col:recommendOrg" },
  { key: "origin", label: "产地", match: "text", source: "col:origin" },
  { key: "catalogSupplier", label: "清单供应商", match: "text", source: "col:catalogSupplier" },
  { key: "supplier", label: "销售方", match: "text", source: "col:supplier" },
  { key: "productName", label: "产品名称", match: "text", source: "col:productName" },
  { key: "spec", label: "规格", match: "text", source: "col:spec" },
];
/** 按任务字段派生目标的可筛选列(dim)+ 可聚合列(metric)+ 可分组日期列(date)。换报送类型按它自己的字段出列。 */
export function deriveGoalColumns(fields: ReportField[]): GoalColumn[] {
  const cols: GoalColumn[] = [];
  const seen = new Set<string>();
  const push = (c: GoalColumn) => {
    if (!seen.has(c.key)) {
      seen.add(c.key);
      cols.push(c);
    }
  };
  const feeField = fields.find((f) => f.role === "feeSource");
  if (feeField)
    push({ key: "feeSource", label: feeField.label || "费用来源", role: "dim", match: "exact", options: feeField.options ?? [], source: "col:feeSource" });
  const dateHead = fields.find((f) => f.role === "purchaseDate");
  if (dateHead) push({ key: dateHead.code, label: dateHead.label || "日期", role: "date", source: "col:purchaseDate" });
  const dt = fields.find((f) => f.type === "detail_table");
  for (const c of dt?.columns ?? []) {
    if (c.type === "catalog_pick") {
      for (const sub of CATALOG_SUBCOLS) push({ ...sub, role: "dim" });
    } else if (c.type === "number") {
      if (c.role === "amount") push({ key: c.code, label: c.label || "金额", role: "metric", source: "amount", isCents: true });
      else push({ key: c.code, label: c.label, role: "metric", source: `extra:${c.code}` });
    } else if (c.type === "select" && c.role !== "feeSource") {
      push({ key: c.code, label: c.label, role: "dim", match: "exact", options: c.options ?? [], source: `extra:${c.code}` });
    } else if (c.type === "text") {
      push({ key: c.code, label: c.label, role: "dim", match: "text", source: `extra:${c.code}` });
    } else if (c.type === "date") {
      push({ key: c.code, label: c.label, role: "date", source: `extra:${c.code}` });
    }
  }
  return cols;
}
/** 分组明细:一堆(季度/月/维度值)的统计值(无达标判断)。 */
export interface GoalGroupStat {
  label: string;
  value: number;
}
/** 一个目标对一个单位的完成情况(只给目标 + 实际 + 中性完成率;不判断达标)。 */
export interface GoalProgressItem {
  key: string;
  label: string;
  grouped: boolean;
  money: boolean; // 金额类(显示 ¥)
  actual: number | null; // 实际值(分组=各堆之和总计)
  target: number | null; // 逐单位目标值(参考;无则 null)
  rate: number | null; // 完成率 % = 实际/目标(中性,无达标判断)
  groups?: GoalGroupStat[]; // 分组明细(每季度的数…)
}
export interface GoalProgressRow {
  targetId: string;
  targetOrgName: string | null;
  ownerUserName: string | null;
  submissionCount: number;
  goalTargets: Record<string, number>; // 逐单位目标值
  progress: GoalProgressItem[];
}
export interface GoalProgressResult {
  goals: ReportGoal[];
  rows: GoalProgressRow[];
}

export interface ReportTask {
  id: string;
  templateId: string | null;
  title: string;
  notes: string | null;
  fieldsJson: string;
  catalogTag: string | null;
  dispatchUserId: string;
  dispatchOrgId: string | null;
  dueAt: string | null;
  noticeFileId: string | null;
  noticeFileName: string | null;
  seriesId: string | null;
  periodLabel: string | null;
  status: ReportTaskStatus;
  createdAt: string;
  updatedAt: string;
}

/** 派发对象(= 后端 ReportTarget)。无提交唯一约束 → 一对象可多次提交。 */
export interface ReportTarget {
  id: string;
  taskId: string;
  targetType: "org" | "user";
  targetOrgId: string | null;
  targetUserId: string | null;
  handlerOrgId: string | null;
  ownerUserId: string | null;
  status: string;
  assignedById: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 详情接口里的派发对象(带解析名 + 提交数)。 */
export interface ReportTargetDetail extends ReportTarget {
  targetOrgName: string | null;
  handlerOrgName: string | null;
  ownerUserName: string | null;
  submissionCount: number;
}

export type ReportTaskDetail = ReportTask & { goals: ReportGoal[]; targets: ReportTargetDetail[] };

/** 我派发列表项(带对象数 / 已提交数)。 */
export interface ReportTaskListItem extends ReportTask {
  targetCount: number;
  submittedCount: number;
}

/** 报送待办项(接收侧)。 */
export interface ReportInboxItem {
  targetId: string;
  taskId: string;
  title: string;
  dueAt: string | null;
  status: string;
  isOwner: boolean;
  claimable: boolean;
  submissionCount: number;
  dispatchOrgName: string | null;
  dispatchUserName: string | null;
  dispatchUserPhone: string | null;
  targetOrgName: string | null;
  handlerOrgName: string | null;
  canAssign: boolean;
  assignOrgId: string | null;
  assignOrgName: string | null;
  createdAt: string;
}

/** 一条明细行(= 后端 ReportLine)。amountCents=不含税、taxCents=税额、价税合计=两者之和;单位=分。 */
export interface ReportLineRow {
  id: string;
  lineNo: number;
  productName: string;
  /** 规格(清单快照,如「5L」) */
  spec: string | null;
  category: string | null;
  categoryDesc: string | null;
  recommendOrg: string | null;
  origin: string | null;
  /** 清单供应商(扶贫目录里该产品的供货商,快照) */
  catalogSupplier: string | null;
  unitPriceCents: number | null;
  catalogItemId: string | null;
  amountCents: number;
  taxCents: number;
  feeSource: string;
  /** 销售方(发票识别的实际销售单位,一票一个;冗余到每行便于按销售方统计) */
  supplier: string | null;
  qty: number | null;
  /** 清单完整快照:税率 / 起订量 / 联系方式 */
  taxRate: string | null;
  minOrderQty: string | null;
  contact: string | null;
}

/** 一张发票(= 后端 ReportSubmission)+ 明细行。totalAmountCents=不含税合计、totalTaxCents=税额合计。 */
export interface ReportSubmissionRow {
  id: string;
  seq: number;
  invoiceNo: string;
  purchaseDate: string;
  unitName: string | null;
  totalAmountCents: number;
  totalTaxCents: number;
  /** 发票销售方(AI 识别带入,供审核核对;一张发票一个销售方)。 */
  supplier: string | null;
  /** 提交人确认过的「与发票差异」备注(有则审核页高亮);无差异为 null。 */
  discrepancyNote: string | null;
  /** 系统自动审核通过(明细金额与发票一致且均在扶贫目录);非人工审核。 */
  autoApproved: boolean;
  invoiceFileId: string | null;
  contractFileId: string | null;
  status: string;
  reviewNote: string | null;
  submittedAt: string | null;
  returnCount: number;
  lines: ReportLineRow[];
}

/** 录入页数据(承办人侧)。 */
export interface ReportFillData {
  targetId: string;
  taskId: string;
  taskTitle: string;
  notes: string | null;
  dueAt: string | null;
  noticeFileId: string | null;
  noticeFileName: string | null;
  catalogTag: string | null;
  fields: ReportField[];
  targetStatus: string;
  unitOrgName: string | null;
  dispatchOrgName: string | null;
  dispatchUserName: string | null;
  dispatchUserPhone: string | null;
  submissions: ReportSubmissionRow[];
}

/** 单个派发对象输入。 */
export interface ReportTargetInput {
  targetType: "org" | "user";
  targetOrgId?: string;
  targetUserId?: string;
  /** 逐单位目标值 { goalKey: 元 }(perUnit 金额目标,发布时随对象一起带入) */
  goalTargets?: Record<string, number>;
}

/** 发布报送任务的载荷。 */
export interface PublishReportInput {
  templateId?: string;
  title: string;
  notes?: string;
  catalogTag?: string;
  dispatchOrgId?: string;
  dueAt?: string;
  noticeFileId?: string;
  noticeFileName?: string;
  periodLabel?: string;
  fields: ReportField[];
  goals?: ReportGoal[];
  targets: ReportTargetInput[];
  status?: "draft" | "open";
}

/* ─── 清单(目录)契约 ─── */

export interface ReportCatalog {
  id: string;
  catalogTag: string;
  name: string;
  year: number | null;
  columnsJson: string;
  active: boolean;
  createdAt: string;
  itemCount: number;
}

/** 清单条目(= 后端 ReportCatalogItem)。purchasePriceCents 单位=分,显示时 ÷100。 */
export interface ReportCatalogItem {
  id: string;
  catalogTag: string;
  catalogId: string;
  totalSeq: number | null;
  subSeq: number | null;
  productName: string;
  spec: string | null;
  purchasePriceCents: number | null;
  taxRate: string | null;
  minOrderQty: string | null;
  contact: string | null;
  category: string;
  categoryDesc: string | null;
  supplier: string | null;
  recommendOrg: string | null;
  origin: string | null;
  dataJson: string;
}

export interface CatalogSearchResult {
  total: number;
  page: number;
  pageSize: number;
  items: ReportCatalogItem[];
}

export interface CatalogCategory {
  category: string;
  count: number;
}

export interface CatalogSearchParams {
  catalogTag: string;
  q?: string;
  category?: string;
  recommendOrg?: string;
  origin?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogFacetValue {
  value: string;
  count: number;
}
export interface CatalogFacets {
  categories: CatalogFacetValue[];
  recommendOrgs: CatalogFacetValue[];
  origins: CatalogFacetValue[];
}

/* ─── 发票 AI 识别 ─── */

/** 识别出的一条明细;match 命中清单时即一份可直接填入目录点选的快照,否则只有名称。 */
export interface InvoiceExtractLine {
  productName: string;
  spec: string | null;
  /** 不含税金额(元) */
  amountYuan: number | null;
  /** 税额(元) */
  taxYuan: number | null;
  match: CatalogPickValue | null;
  /** 命中了但规格尺寸对不上(已取最接近项,需重点核对) */
  specMismatch?: boolean;
}
export interface InvoiceExtractResult {
  invoiceNo: string;
  purchaseDate: string;
  supplier: string | null;
  /** 不含税合计(元) */
  totalAmountYuan: number | null;
  /** 税额合计(元) */
  totalTaxYuan: number | null;
  /** 价税合计(元) */
  totalWithTaxYuan: number | null;
  lines: InvoiceExtractLine[];
  /** 自检提示(需重点审查项) */
  warnings: string[];
  source: {
    fileName: string;
    pipeline: "vision" | "text";
    usedProvider: string;
    usedModel: string;
    matchedCount: number;
  };
}

/** 派发对象快捷组(每人自己,服务端持久化)。 */
export interface ReportUnitGroup {
  id: string;
  name: string;
  orgIds: string[];
}

/** 分 → 元(显示)。 */
export const centsToYuan = (cents: number | null | undefined): string =>
  cents == null ? "" : (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 扶贫采买报送的默认字段(发布向导「用扶贫采买模板」一键加载)。role 供 Step 5 持久化映射。 */
export const FUPIN_CATALOG_TAG = "fupin-2026";
export const FUPIN_TEMPLATE_FIELDS: ReportField[] = [
  // 发票上传放第一个 + 开启 AI 识别:上传发票照片/PDF → 一键识别自动填发票号/日期/明细
  {
    code: "invoice_file",
    label: "上传发票",
    type: "file",
    required: true,
    sortOrder: 0,
    role: "invoiceFile",
    accept: ".pdf,.jpg,.jpeg,.png",
    maxFiles: 1,
    aiExtract: true,
    description: "上传后点「AI 识别发票」可自动填写下方发票号/日期/采买明细",
  },
  { code: "invoice_no", label: "发票号", type: "text", required: true, sortOrder: 1, role: "invoiceNo" },
  { code: "purchase_date", label: "购买日期", type: "date", required: true, sortOrder: 2, role: "purchaseDate" },
  // 费用来源是「一张发票一个」→ 头层字段(不在明细行);持久化时套用到该发票的每条明细,供考核按费用来源汇总
  {
    code: "fee_source",
    label: "费用来源",
    type: "select",
    required: true,
    sortOrder: 3,
    role: "feeSource",
    options: ["福利费", "工会经费"],
  },
  {
    code: "contract_file",
    label: "上传合同",
    type: "file",
    required: false,
    sortOrder: 4,
    role: "contractFile",
    accept: ".pdf,.jpg,.jpeg,.png",
    maxFiles: 1,
  },
  {
    code: "lines",
    label: "采买明细",
    type: "detail_table",
    required: true,
    sortOrder: 5,
    columns: [
      {
        code: "product",
        label: "帮扶产品",
        type: "catalog_pick",
        required: true,
        sortOrder: 0,
        role: "product",
        catalogTag: FUPIN_CATALOG_TAG,
        bringOut: CATALOG_BRING_OUT.map((c) => c.key),
      },
      // 一格搞定:每种商品的「含税金额」(价税合计);AI 识别时自动按 不含税+税额 合并填入
      { code: "amount", label: "含税金额", type: "number", required: true, sortOrder: 1, role: "amount", unit: "元" },
    ],
  },
];

export const reportApi = {
  /** 报送任务列表(mine=true 只看我派发的)。 */
  async listTasks(mine = false): Promise<ReportTaskListItem[]> {
    const { data } = await api.get<ReportTaskListItem[]>("/reports", { params: mine ? { mine: 1 } : {} });
    return data;
  },
  async getTask(id: string): Promise<ReportTaskDetail> {
    const { data } = await api.get<ReportTaskDetail>(`/reports/${id}`);
    return data;
  },
  /** 发布报送任务。 */
  async publish(input: PublishReportInput): Promise<ReportTaskDetail> {
    const { data } = await api.post<ReportTaskDetail>("/reports", input);
    return data;
  },
  /** 编辑报送任务(标题 / 填报要求 / 截止 / 目标定义)。 */
  async updateTask(
    id: string,
    patch: { title?: string; notes?: string; dueAt?: string; goals?: ReportGoal[] },
  ): Promise<ReportTask> {
    const { data } = await api.patch<ReportTask>(`/reports/${id}`, patch);
    return data;
  },
  /** 目标完成情况(逐单位×逐目标)。 */
  async goalProgress(taskId: string): Promise<GoalProgressResult> {
    const { data } = await api.get<GoalProgressResult>(`/reports/${taskId}/goal-progress`);
    return data;
  },
  /** 保存逐单位目标值(perUnit 金额目标)。 */
  async saveGoalTargets(
    taskId: string,
    rows: { targetId: string; values: Record<string, number> }[],
  ): Promise<{ ok: boolean; saved: number }> {
    const { data } = await api.post(`/reports/${taskId}/goal-targets`, { rows });
    return data;
  },
  /** 删除报送任务(连同其下派发对象 / 发票 / 明细 / 附件一并清理)。 */
  async deleteTask(id: string): Promise<{ ok: boolean; deletedSubmissions: number; deletedFiles: number }> {
    const { data } = await api.delete(`/reports/${id}`);
    return data;
  },

  /** 报送待办(接收侧)。 */
  async inbox(): Promise<ReportInboxItem[]> {
    const { data } = await api.get<ReportInboxItem[]>("/reports/inbox");
    return data;
  },
  async claim(targetId: string): Promise<{ ok: boolean; status: string }> {
    const { data } = await api.post(`/reports/targets/${targetId}/claim`);
    return data;
  },
  async assign(targetId: string, userId: string): Promise<{ ok: boolean; status: string }> {
    const { data } = await api.post(`/reports/targets/${targetId}/assign`, { userId });
    return data;
  },

  /** 派发对象快捷组(每人自己):列出 / 新建 / 删除。 */
  async listUnitGroups(): Promise<ReportUnitGroup[]> {
    const { data } = await api.get<ReportUnitGroup[]>("/reports/unit-groups");
    return data;
  },
  async createUnitGroup(name: string, orgIds: string[]): Promise<ReportUnitGroup> {
    const { data } = await api.post<ReportUnitGroup>("/reports/unit-groups", { name, orgIds });
    return data;
  },
  async deleteUnitGroup(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/reports/unit-groups/${id}`);
    return data;
  },

  /** 录入(承办人):取数 / 录一张发票 / 删 / 审核。 */
  async getFill(targetId: string): Promise<ReportFillData> {
    const { data } = await api.get<ReportFillData>(`/reports/targets/${targetId}/fill`);
    return data;
  },
  /** AI 识别发票:传已上传的发票 fileId(+ 清单 tag 用于匹配明细)→ 结构化结果供自动填表。本地视觉模型较慢,留长超时。 */
  async extractInvoice(fileId: string, catalogTag?: string): Promise<InvoiceExtractResult> {
    const { data } = await api.post<InvoiceExtractResult>(
      "/reports/extract-invoice",
      { fileId, catalogTag },
      { timeout: 200000 },
    );
    return data;
  },
  async saveSubmission(
    targetId: string,
    formData: Record<string, unknown>,
    opts?: { discrepancyNote?: string; supplier?: string | null; invoiceLines?: number[] },
  ): Promise<ReportSubmissionRow> {
    const { data } = await api.post<ReportSubmissionRow>(`/reports/targets/${targetId}/submissions`, {
      formData,
      ...(opts?.discrepancyNote ? { discrepancyNote: opts.discrepancyNote } : {}),
      ...(opts?.supplier ? { supplier: opts.supplier } : {}),
      ...(opts?.invoiceLines ? { invoiceLines: opts.invoiceLines } : {}),
    });
    return data;
  },
  async deleteSubmission(submissionId: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/reports/submissions/${submissionId}`);
    return data;
  },
  /** 某对象已录发票(派发人/管理员审核用)。 */
  async listSubmissions(targetId: string): Promise<ReportSubmissionRow[]> {
    const { data } = await api.get<ReportSubmissionRow[]>(`/reports/targets/${targetId}/submissions`);
    return data;
  },
  async reviewSubmission(
    submissionId: string,
    decision: "approve" | "return",
    note?: string,
  ): Promise<{ ok: boolean; status: string }> {
    const { data } = await api.post(`/reports/submissions/${submissionId}/review`, { decision, note });
    return data;
  },

  /** 清单(目录)。 */
  catalog: {
    async listCatalogs(): Promise<ReportCatalog[]> {
      const { data } = await api.get<ReportCatalog[]>("/reports/catalogs");
      return data;
    },
    async search(params: CatalogSearchParams): Promise<CatalogSearchResult> {
      const { data } = await api.get<CatalogSearchResult>("/reports/catalog", { params });
      return data;
    },
    async categories(catalogTag: string): Promise<CatalogCategory[]> {
      const { data } = await api.get<CatalogCategory[]>("/reports/catalog/categories", {
        params: { catalogTag },
      });
      return data;
    },
    async filters(catalogTag: string): Promise<CatalogFacets> {
      const { data } = await api.get<CatalogFacets>("/reports/catalog/filters", { params: { catalogTag } });
      return data;
    },
    async import(
      file: File,
      meta: { catalogTag: string; name: string; year?: number | null },
    ): Promise<{ catalogId: string; count: number }> {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("catalogTag", meta.catalogTag);
      fd.append("name", meta.name);
      if (meta.year != null) fd.append("year", String(meta.year));
      const { data } = await api.post<{ catalogId: string; count: number }>(
        "/reports/catalog/import",
        fd,
      );
      return data;
    },
  },
};
