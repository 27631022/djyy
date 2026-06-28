import { api } from "@/shared/api/client";

/* ─── 后端 assessment 契约镜像 ─── */

export type AssessmentTrack = "party" | "admin";
export type IndicatorKind = "normal" | "bonus" | "deduction";

/** 指标树节点(= 后端 IndicatorNode)。weight=分值(绝对分);叶子带 dataSource/scoringType/params/责任部门/评分标准 */
export interface IndicatorNode {
  code: string;
  label: string;
  weight: number;
  kind: IndicatorKind;
  children?: IndicatorNode[];
  dataSource?: string;
  /** 数据源专属参数(如 report.query 的 { reportTaskId, goalKey, field });区别于计分工具 strategyParams。 */
  sourceParams?: Record<string, unknown>;
  scoringType?: string;
  strategyParams?: Record<string, unknown>;
  ownerOrgId?: string;
  /** @deprecated 旧单值责任人;保存时后端并入 ownerUserIds。读取时兼容。 */
  ownerUserId?: string;
  /** 考核责任人(可多人;空=整个责任部门)。叶子专属。 */
  ownerUserIds?: string[];
  /** 节点管理员(可多人):可见并维护本节点及其下全部子指标。任意层级可设。 */
  adminUserIds?: string[];
  /** 考核内容(详细):标题只放简要描述,详情放这里;指标行鼠标悬停可见。可据此凝练标题。 */
  content?: string;
  rubric?: string;
  /** 本指标是否启用难易系数(默认否=各对象系数 1) */
  difficultyOn?: boolean;
  /** 各考核对象在本指标的难易系数(targetRef→系数;缺省=1)。手填或按员工数测算表生成。P2:本指标得分 × 该对象系数,再排名/汇总 */
  difficultyCoefs?: Record<string, number>;
}

/** 难易系数(积分系数):按对象规模(如员工人数)给不同倍率,拉平大小单位。可做多套(basis 区分)。 */
export type DifficultyBasis = "headcount";
export interface DifficultyTier {
  /** 人数上限(含);null = 该档及以上(最大单位,上不封顶) */
  maxCount: number | null;
  /** 积分系数(倍率) */
  coef: number;
}
export interface DifficultyTable {
  id: string;
  label: string;
  basis: DifficultyBasis;
  tiers: DifficultyTier[];
}

export interface GradeThreshold {
  grade: string;
  min: number;
}

/** 名次划档:top=排名前 pct%,bottom=排名后 pct%,rest=其余(默认档),downgrade=触底档(条件触发) */
export type GradeBand = "top" | "bottom" | "rest" | "downgrade";
export interface GradeTier {
  grade: string;
  band: GradeBand;
  /** top/bottom 的百分比 */
  pct?: number;
  /** 仅 top:需未亏损,否则降为「其余」档 */
  requireNoLoss?: boolean;
  /** downgrade:连续 years 年处于 fromGrade 档 → 落本档 */
  fromGrade?: string;
  years?: number;
  /** downgrade:当年发生对单位重大不良影响 → 落本档 */
  onMajorIncident?: boolean;
}

/**
 * 定级规则。两种口径:
 *   mode='score' 按总分阈值划档(thresholds:[{grade,min}]);
 *   mode='rank'  按名次划档(tiers:[GradeTier]),支持「前/后 N%」「未亏损」「连续N年同档/当年重大不良影响触底」。
 * 计算在 P2 引擎(需全体名次);P1 只配置 + 预设 + 可读展示。
 */
export interface GradeRules {
  mode?: "score" | "rank";
  thresholds?: GradeThreshold[];
  tiers?: GradeTier[];
  vetoGrade?: string;
}
export interface SchemeSettings {
  baseFullScore?: number;
  bonusCap?: number;
  deductionCap?: number;
  vetoZero?: boolean;
  /** 考核主体单位 org id —— 其下属「部门」(isDept)即责任部门候选。决定责任部门按层级精确显示 */
  scopeOrgId?: string;
  /** 考核关系 key(见后端 assess-relations,如 admin.unit2.unit3)*/
  relationKey?: string;
  /** 考核主体 org id(谁来考核,如 塔运司 / 塔运司党委 / 公司党委)*/
  subjectOrgId?: string;
  /** 考核主体名称(冻结,免重查 myScope 也能渲染徽标)*/
  subjectName?: string;
  /** 难易系数测算表(人数→系数;可多套,各指标的弹窗里选用) */
  difficultyTables?: DifficultyTable[];
  /** 各考核对象员工数(targetRef→人数;导出单位→填→导入,供难易系数测算,全表共享) */
  headcounts?: Record<string, number>;
  /** 协同维护人 userId[] —— 与总管理员(createdById)一起维护本考核表。 */
  managerUserIds?: string[];
}

/** 考核对象快照(一次性从组织树读出后冻结,与组织机构解耦)。单位用 orgId、人员(党员/员工)用 userId。 */
export interface AssessmentTarget {
  orgId?: string;
  userId?: string;
  name: string;
}

/* ─── 考核关系 / 我的考核区域(后端 assess-relations 镜像)─── */

export type RelationLevel = "company" | "unit2" | "unit3";
export type ObjectKind = "org" | "user";

export interface ScopeSubject {
  orgId: string;
  name: string;
  /** 责任部门归属行政机构 id(选定主体后写入 settings.scopeOrgId)*/
  deptScopeOrgId?: string;
}
export interface ScopeRelation {
  key: string;
  track: AssessmentTrack;
  level: RelationLevel;
  label: string;
  subjectLabel: string;
  objectLabel: string;
  objectKind: ObjectKind;
  subjects: ScopeSubject[];
}
export interface MyScope {
  relations: ScopeRelation[];
}
/** 主体 → 考核对象候选(单位 orgId / 人员 userId)*/
export interface RelationObject {
  orgId?: string;
  userId?: string;
  name: string;
  kind: ObjectKind;
}

/** 考核对象引用键(orgId 或 userId)*/
export function targetRef(t: { orgId?: string; userId?: string }): string {
  return t.orgId ?? t.userId ?? "";
}

/** AI 生成指标(导入考核办法文件)结果 —— 不落库,前端应用到设计器供人工确认 */
export interface ExtractIndicatorsResult {
  indicators: IndicatorNode[];
  source: {
    fileName: string;
    leafCount: number;
    usedProvider: string;
    usedModel: string;
  };
}

export interface AssessmentScheme {
  id: string;
  name: string;
  year: number;
  track: AssessmentTrack;
  targetLevel: string;
  indicatorsJson: string;
  targetsJson: string;
  gradeRulesJson: string;
  settingsJson: string;
  status: string;
  createdById: string | null;
  /** 总管理员姓名(findOne enrich;新建者,可配置全部指标)。 */
  createdByName?: string | null;
  /** 相关人员 id→姓名 映射(总管理员/协同维护人/节点管理员/责任人 展示用,findOne enrich)。 */
  userNames?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemeInput {
  name: string;
  year: number;
  track?: AssessmentTrack;
  targetLevel?: string;
}

export interface UpdateSchemeInput {
  name?: string;
  year?: number;
  track?: AssessmentTrack;
  targetLevel?: string;
  status?: string;
  indicators?: IndicatorNode[];
  targets?: AssessmentTarget[];
  gradeRules?: GradeRules;
  settings?: SchemeSettings;
}

export interface TrialResult {
  score: number;
  fullScore: number;
  inputType: string;
  crossTarget: boolean;
}
export interface TrialInput {
  scoringType: string;
  params?: Record<string, unknown>;
  fullScore?: number;
  raw?: number | boolean | string | null;
  rawValues?: number[];
}

export const TRACK_LABELS: Record<AssessmentTrack, string> = {
  party: "党建考核",
  admin: "行政/业绩考核",
};

/** 考核关系 key → 全名(后端 assess-relations 镜像,徽标/列表展示用)*/
export const RELATION_LABELS: Record<string, string> = {
  "party.company.committee": "公司党委考核基层党委",
  "party.agency.branch": "机关党委考核党支部",
  "party.grassroots.branch": "基层党委考核党支部",
  "party.branch.member": "党支部考核党员",
  "admin.company.unit2": "公司考核二级单位",
  "admin.unit2.unit3": "二级单位考核三级单位",
  "admin.unit3.employee": "三级单位考核员工",
};

export const TARGET_LEVEL_LABELS: Record<string, string> = {
  committee: "党委",
  branch: "党支部",
  member: "党员",
  unit: "单位",
  dept: "部门",
  employee: "员工",
};

/** 某 track 下可选的考核层级 */
export const TARGET_LEVELS_BY_TRACK: Record<AssessmentTrack, { value: string; label: string }[]> = {
  party: [
    { value: "committee", label: "党委(1:1 二级单位)" },
    { value: "branch", label: "党支部" },
    { value: "member", label: "党员" },
  ],
  admin: [
    { value: "unit", label: "单位" },
    { value: "dept", label: "部门" },
    { value: "employee", label: "员工" },
  ],
};

export function parseIndicators(s: AssessmentScheme): IndicatorNode[] {
  try {
    const v: unknown = JSON.parse(s.indicatorsJson);
    return Array.isArray(v) ? (v as IndicatorNode[]) : [];
  } catch {
    return [];
  }
}
export function parseTargets(s: AssessmentScheme): AssessmentTarget[] {
  try {
    const v: unknown = JSON.parse(s.targetsJson);
    return Array.isArray(v) ? (v as AssessmentTarget[]) : [];
  } catch {
    return [];
  }
}
export function parseGradeRules(s: AssessmentScheme): GradeRules {
  try {
    const v: unknown = JSON.parse(s.gradeRulesJson);
    return v && typeof v === "object" ? (v as GradeRules) : {};
  } catch {
    return {};
  }
}
export function parseSettings(s: AssessmentScheme): SchemeSettings {
  try {
    const v: unknown = JSON.parse(s.settingsJson);
    return v && typeof v === "object" ? (v as SchemeSettings) : {};
  } catch {
    return {};
  }
}

/** 从 axios 错误里提取后端的中文报错(BadRequestException message),否则回退 */
export function assessmentErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "response" in e) {
    const data = (e as { response?: { data?: { message?: unknown } } }).response?.data;
    const m = data?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.filter((x) => typeof x === "string").join("；");
  }
  return e instanceof Error ? e.message : fallback;
}

/* ─── P2 打分闭环:考核轮次 ─── */

export interface AssessmentRound {
  id: string;
  schemeId: string;
  name: string;
  year: number;
  track: AssessmentTrack;
  indicatorsJson: string;
  targetsJson: string;
  settingsJson: string;
  gradeRulesJson: string;
  resultsJson: string;
  status: string; // open(填报中) | done(已计算)
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface IndicatorScoreRow {
  id: string;
  roundId: string;
  targetRef: string;
  leafCode: string;
  rawValue: string | null;
  note: string | null;
  evidenceFileIds: string | null;
}
/** 考核责任人档案(打分页:责任人 hover 显示联系方式)。userId → 档案。phone 仅管理员/责任人本人可见,余者为 null。 */
export interface OwnerProfile {
  name: string;
  phone: string | null;
}
/** getRound 响应:轮次 + 已录原始值 + 责任人档案(userId→档案)+ 责任部门名(orgId→名)。 */
export interface RoundDetailData {
  round: AssessmentRound;
  scores: IndicatorScoreRow[];
  ownerProfiles: Record<string, OwnerProfile>;
  orgNames: Record<string, string>;
}
export interface RoundTargetResult {
  ref: string;
  name: string;
  leafScores: Record<string, number>;
  normalScore: number;
  bonus: number;
  deduct: number;
  total: number;
  rank: number;
  grade: string;
}
export interface RoundResults {
  computedAt?: string;
  targets?: RoundTargetResult[];
}
/** 扣分明细(人工扣分制):逐条「存在问题 → 扣分」,引擎归约成总扣分 */
export interface DeductItem {
  issue?: string;
  points?: number;
}
export interface DeductRaw {
  items: DeductItem[];
}
export type ScoreRaw = number | boolean | string | null | DeductRaw;
export interface ScoreEntry {
  targetRef: string;
  leafCode: string;
  rawValue?: ScoreRaw;
  note?: string;
}

/** 单指标实时预览(录入页右栏 ●# 单项排名) */
export interface PreviewRow {
  ref: string;
  name: string;
  score: number;
  rank: number;
}
export interface PreviewIndicatorInput {
  scoringType: string;
  kind?: IndicatorKind;
  params?: Record<string, unknown>;
  fullScore?: number;
  difficultyOn?: boolean;
  difficultyCoefs?: Record<string, number>;
  units: { ref: string; name: string; raw: ScoreRaw }[];
}

/* ─── 多指标合计实时预览(打分人侧:我负责的几项 单项 + 合计排名)─── */
export interface SubtotalLeafInput {
  code: string;
  scoringType?: string;
  kind?: IndicatorKind;
  weight?: number;
  label?: string;
  strategyParams?: Record<string, unknown>;
  difficultyOn?: boolean;
  difficultyCoefs?: Record<string, number>;
}
export interface SubtotalUnitInput {
  ref: string;
  name: string;
  /** 该对象在各指标的当前录入值 { leafCode: raw } */
  valuesByLeaf: Record<string, ScoreRaw>;
}
export interface PreviewSubtotalInput {
  leaves: SubtotalLeafInput[];
  units: SubtotalUnitInput[];
}
export interface SubtotalPreview {
  /** leafCode → 该指标各对象 ●# 单项排名 */
  perLeaf: Record<string, PreviewRow[]>;
  /** 各对象合计得分 + 合计排名(score=Σ各项得分) */
  subtotal: PreviewRow[];
  /** 这组指标满分之和 */
  fullScore: number;
}

/* ─── 分数确认会签(轮次 × 叶子指标 × 责任人)─── */
export type ConfirmStatus = "pending" | "confirmed";
/** 确认进度项(管理员视角:哪个指标、谁、状态、电话)*/
export interface ConfirmItem {
  leafCode: string;
  leafLabel: string;
  groupLabel: string;
  userId: string;
  userName: string;
  userPhone: string | null;
  status: ConfirmStatus;
  confirmedAt: string | null;
}
export interface ConfirmProgress {
  initiated: boolean;
  summary: { total: number; confirmed: number; pending: number };
  items: ConfirmItem[];
  noOwnerLeaves: string[];
}
/** 我的考核确认项(责任人视角,跨轮次)*/
export interface MyConfirmItem {
  roundId: string;
  roundName: string;
  year: number | null;
  leafCode: string;
  leafLabel: string;
  groupLabel: string;
  status: ConfirmStatus;
  confirmedAt: string | null;
}

export function parseRoundIndicators(r: AssessmentRound): IndicatorNode[] {
  try {
    const v: unknown = JSON.parse(r.indicatorsJson);
    return Array.isArray(v) ? (v as IndicatorNode[]) : [];
  } catch {
    return [];
  }
}
export function parseRoundTargets(r: AssessmentRound): AssessmentTarget[] {
  try {
    const v: unknown = JSON.parse(r.targetsJson);
    return Array.isArray(v) ? (v as AssessmentTarget[]) : [];
  } catch {
    return [];
  }
}
export function parseRoundResults(r: AssessmentRound): RoundResults {
  try {
    const v: unknown = JSON.parse(r.resultsJson);
    return v && typeof v === "object" ? (v as RoundResults) : {};
  } catch {
    return {};
  }
}

/* ─── 季度结果快照(一轮制下手动定格 + 历次对比)─── */

/** 一份只读结果快照:label 命名 + 生成那一刻的 resultsJson(同 RoundResults 形状)*/
export interface ResultSnapshot {
  id: string;
  roundId: string;
  label: string;
  resultsJson: string;
  note: string | null;
  createdById: string | null;
  createdAt: string;
}
export function parseSnapshotResults(s: ResultSnapshot): RoundResults {
  try {
    const v: unknown = JSON.parse(s.resultsJson);
    return v && typeof v === "object" ? (v as RoundResults) : {};
  } catch {
    return {};
  }
}

export const assessmentApi = {
  listSchemes: () => api.get<AssessmentScheme[]>("/assessment/schemes").then((r) => r.data),
  getScheme: (id: string) => api.get<AssessmentScheme>(`/assessment/schemes/${id}`).then((r) => r.data),
  createScheme: (input: CreateSchemeInput) =>
    api.post<AssessmentScheme>("/assessment/schemes", input).then((r) => r.data),
  updateScheme: (id: string, input: UpdateSchemeInput) =>
    api.patch<AssessmentScheme>(`/assessment/schemes/${id}`, input).then((r) => r.data),
  deleteScheme: (id: string) =>
    api.delete<{ ok: boolean }>(`/assessment/schemes/${id}`).then((r) => r.data),
  duplicateScheme: (id: string) =>
    api.post<AssessmentScheme>(`/assessment/schemes/${id}/duplicate`, {}).then((r) => r.data),
  trial: (input: TrialInput) =>
    api.post<TrialResult>("/assessment/scoring/trial", input).then((r) => r.data),
  /** 我的考核区域(按登录账号收敛的考核关系 + 主体)*/
  myScope: () => api.get<MyScope>("/assessment/my-scope").then((r) => r.data),
  /** 主体 → 考核对象候选(批量选用)*/
  relationObjects: (relationKey: string, subjectOrgId: string) =>
    api
      .get<RelationObject[]>(`/assessment/relations/${encodeURIComponent(relationKey)}/objects`, {
        params: { subjectOrgId },
      })
      .then((r) => r.data),
  /** AI 生成指标:上传考核办法 Word/PDF → 指标树草稿(预留接口,需配 AI 模型)*/
  extractIndicators: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ExtractIndicatorsResult>("/assessment/extract", fd).then((r) => r.data);
  },
  /** ── P2 考核轮次:发起 / 列表 / 详情 / 录入 / 计算 / 删除 ── */
  createRound: (schemeId: string, input: { name?: string; year?: number }) =>
    api.post<AssessmentRound>(`/assessment/schemes/${schemeId}/rounds`, input).then((r) => r.data),
  listRounds: (schemeId?: string) =>
    api
      .get<AssessmentRound[]>("/assessment/rounds", { params: schemeId ? { schemeId } : undefined })
      .then((r) => r.data),
  getRound: (id: string) =>
    api.get<RoundDetailData>(`/assessment/rounds/${id}`).then((r) => r.data),
  saveRoundScores: (id: string, scores: ScoreEntry[]) =>
    api.post<{ ok: boolean; count: number }>(`/assessment/rounds/${id}/scores`, { scores }).then((r) => r.data),
  deleteRound: (id: string) => api.delete<{ ok: boolean }>(`/assessment/rounds/${id}`).then((r) => r.data),
  /** ── 季度结果快照:列表(含 resultsJson)/ 生成 / 删除 ── */
  listSnapshots: (roundId: string) =>
    api.get<ResultSnapshot[]>(`/assessment/rounds/${roundId}/snapshots`).then((r) => r.data),
  createSnapshot: (roundId: string, input: { label: string; note?: string }) =>
    api.post<ResultSnapshot>(`/assessment/rounds/${roundId}/snapshots`, input).then((r) => r.data),
  deleteSnapshot: (snapshotId: string) =>
    api.delete<{ ok: boolean }>(`/assessment/snapshots/${snapshotId}`).then((r) => r.data),
  /** 单指标实时预览:各对象 ●得分 + ●# 单项排名(无状态,录入页右栏用)*/
  previewIndicator: (input: PreviewIndicatorInput) =>
    api.post<{ results: PreviewRow[] }>("/assessment/scoring/preview", input).then((r) => r.data),
  /** 多指标合计实时预览:我负责的几项 单项 + 合计排名(打分人侧)*/
  previewSubtotal: (input: PreviewSubtotalInput) =>
    api.post<SubtotalPreview>("/assessment/scoring/preview-subtotal", input).then((r) => r.data),
  /** 实时全表结果(读当前录入实时算,不落库;不依赖手动「计算」)*/
  liveResults: (roundId: string) =>
    api.get<RoundResults>(`/assessment/rounds/${roundId}/live-results`).then((r) => r.data),
  /** ── report.query 报送取数源 ── */
  reportQuerySources: () =>
    api.get<ReportQuerySource[]>("/assessment/report-query/sources").then((r) => r.data),
  reportQueryPreview: (input: ReportQueryPreviewInput) =>
    api.post<ReportQueryPreviewResult>("/assessment/report-query/preview", input).then((r) => r.data),
  /** AI 生成评分标准/说明(据 指标名+数据源+计分工具+规则+分值)*/
  generateCriteria: (input: { label?: string; dataSourceDesc?: string; tool?: string; rule?: string; weight?: number }) =>
    api.post<{ criteria: string }>("/assessment/criteria/generate", input).then((r) => r.data),
  /** ── 分数确认会签 ── */
  /** 总管理员发起 / 重新发起分数确认(reset=true 把已确认也重置)*/
  requestConfirm: (roundId: string, reset = false) =>
    api.post<ConfirmProgress>(`/assessment/rounds/${roundId}/confirm-request`, { reset }).then((r) => r.data),
  /** 确认进度(管理员看谁还没确认 + 电话)*/
  confirmProgress: (roundId: string) =>
    api.get<ConfirmProgress>(`/assessment/rounds/${roundId}/confirm`).then((r) => r.data),
  /** 我的考核确认(待我确认 / 已确认,跨轮次)*/
  myConfirmations: () => api.get<{ items: MyConfirmItem[] }>("/assessment/confirm/mine").then((r) => r.data),
  /** 责任人确认某指标分数无误 */
  confirmIndicator: (roundId: string, leafCode: string, note?: string) =>
    api
      .post<{ ok: boolean; status: string }>(
        `/assessment/rounds/${roundId}/confirm/${encodeURIComponent(leafCode)}`,
        { note },
      )
      .then((r) => r.data),
  /** 我在本轮负责指标的确认状态(打分页「确认完成」按钮用)*/
  myRoundConfirm: (roundId: string) =>
    api.get<MyRoundConfirm>(`/assessment/rounds/${roundId}/confirm-mine`).then((r) => r.data),
  /** 确认完成:把我本轮负责的全部指标标记已确认 */
  confirmMineInRound: (roundId: string) =>
    api.post<{ confirmed: number }>(`/assessment/rounds/${roundId}/confirm-mine`, {}).then((r) => r.data),
  /** 「我的考核」:我有负责指标的轮次 + 确认进度(打分人入口 + 实时角标)*/
  myAssessments: () => api.get<{ items: MyAssessmentItem[] }>("/assessment/my-assessments").then((r) => r.data),
};

/** 「我的本轮确认」状态(打分页「确认完成」按钮)*/
export interface MyRoundConfirm {
  total: number;
  confirmed: number;
  pending: number;
  leaves: { leafCode: string; leafLabel: string; status: ConfirmStatus }[];
}

/** 「我的考核」一项(打分人入口列表)*/
export interface MyAssessmentItem {
  roundId: string;
  name: string;
  year: number;
  status: string;
  myLeaves: number;
  myConfirmed: number;
  myPending: number;
}

/** 报送取数:可选源(有目标的报送任务 + 目标)*/
export interface ReportQuerySource {
  taskId: string;
  title: string;
  goals: { key: string; label: string; grouped: boolean }[];
}
export interface ReportQueryPreviewInput {
  reportTaskId: string;
  goalKey: string;
  field: "actual" | "rate";
  targets: { orgId?: string; userId?: string; name: string }[];
}
export interface ReportQueryPreviewResult {
  field: "actual" | "rate";
  rows: { ref: string; name: string; value: number | null }[];
}
