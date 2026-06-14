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
  scoringType?: string;
  strategyParams?: Record<string, unknown>;
  ownerOrgId?: string;
  ownerUserId?: string;
  rubric?: string;
}

export interface GradeThreshold {
  grade: string;
  min: number;
}
export interface GradeRules {
  thresholds?: GradeThreshold[];
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
  raw?: number | boolean | null;
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
};
