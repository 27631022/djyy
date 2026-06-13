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
}

/** 考核对象快照(一次性从组织树读出后冻结,与组织机构解耦) */
export interface AssessmentTarget {
  orgId: string;
  name: string;
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
};
