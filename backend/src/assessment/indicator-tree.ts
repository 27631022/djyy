import { BadRequestException } from '@nestjs/common';

/**
 * 指标树(IndicatorNode[])—— 存为 AssessmentScheme.indicatorsJson 快照,不拆表(同 Task.fields 范式)。
 *
 * kind:
 *   normal           普通计权指标(强党建六大工程 / 八维示范企业…),分支权重=子节点累加,计入 baseFullScore
 *   bonus/deduction  特殊块:加分项 / 减分项(只在第一层选,下级继承);不计入 normal 权重和;
 *                    分支权重=该块「上限/封顶」(可编辑,非累加);P2 引擎按块上限封顶归集
 *
 * weight = 分值(绝对分,对齐 Excel 的 E 列「权重」7/25/12/4…):
 *   - 分支节点 weight ≈ 其 normal 子节点 weight 之和(一致性由 weightIssues 软提示,不阻断)
 *   - 叶子 weight = 该指标满分(fullScoreOf)
 *   - 顶层 normal 节点之和 ≈ settings.baseFullScore(默认 100)
 *
 * 叶子额外携带:dataSource(数据源 code)+ scoringType(计分工具 type)+ strategyParams(参数)
 *             + ownerOrgId(责任部门 行政机构)+ ownerUserId(考核负责人)+ rubric(评分标准文本,Excel H 列)
 */
export type IndicatorKind = 'normal' | 'bonus' | 'deduction';
export const INDICATOR_KINDS: IndicatorKind[] = ['normal', 'bonus', 'deduction'];

export interface IndicatorNode {
  code: string;
  label: string;
  weight: number;
  kind: IndicatorKind;
  children?: IndicatorNode[];
  // 叶子专属
  dataSource?: string;
  /** 数据源专属参数(如 report.query 的 { reportTaskId, goalKey, field })。区别于计分工具的 strategyParams。 */
  sourceParams?: Record<string, unknown>;
  scoringType?: string;
  strategyParams?: Record<string, unknown>;
  ownerOrgId?: string;
  /** @deprecated 旧单值责任人;normalize 时并入 ownerUserIds。读取时兼容。 */
  ownerUserId?: string;
  /** 考核责任人(可多人;空=整个责任部门)。叶子专属。 */
  ownerUserIds?: string[];
  /** 节点管理员(可多人):可见并维护本节点及其下全部子指标。任意层级可设。 */
  adminUserIds?: string[];
  /** 考核内容(详细):标题只放简要描述,详情放这里(指标行 hover 可见)。 */
  content?: string;
  rubric?: string;
  /** 本指标是否启用难易系数(默认否=各对象系数 1) */
  difficultyOn?: boolean;
  /** 各考核对象在本指标的难易系数(targetRef→系数;缺省=1)。P2:本指标得分 × 该对象系数,再排名/汇总 */
  difficultyCoefs?: Record<string, number>;
}

export function isLeaf(n: IndicatorNode): boolean {
  return !n.children || n.children.length === 0;
}

/** 深度优先收集所有叶子节点 */
export function flattenLeaves(tree: IndicatorNode[]): IndicatorNode[] {
  const out: IndicatorNode[] = [];
  const walk = (nodes: IndicatorNode[]) => {
    for (const n of nodes) {
      if (isLeaf(n)) out.push(n);
      else walk(n.children as IndicatorNode[]);
    }
  };
  walk(tree);
  return out;
}

/** 叶子满分 = 其分值(绝对分)。P1 口径。 */
export function fullScoreOf(node: IndicatorNode): number {
  return Number.isFinite(node.weight) ? node.weight : 0;
}

const CODE_RE = /^[A-Za-z0-9_]+$/;

/** 规整字符串 id 数组(去空、去重、trim)。用于 adminUserIds / ownerUserIds。 */
function strIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * 结构校验 + 规整:code 唯一/合法、label 必填、weight 数值、kind 合法、children 递归;
 * 叶子必须有 dataSource + scoringType(具体 type 是否已知 / 参数 / 兼容性由 service 用注册表再校验)。
 * 不强制权重和(权重和一致性由 weightIssues 给 UI 软提示),允许保存草稿。
 */
export function normalizeIndicatorTree(raw: unknown): IndicatorNode[] {
  if (!Array.isArray(raw)) throw new BadRequestException('indicators 必须是数组');
  const seen = new Set<string>();

  const walk = (nodes: unknown[], depth: number): IndicatorNode[] => {
    if (depth > 6) throw new BadRequestException('指标层级过深(上限 6 层)');
    return nodes.map((item, idx) => {
      if (typeof item !== 'object' || item === null) {
        throw new BadRequestException(`第 ${idx + 1} 个指标格式错误`);
      }
      const o = item as Record<string, unknown>;
      const code = typeof o.code === 'string' ? o.code.trim() : '';
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!CODE_RE.test(code)) {
        throw new BadRequestException(`指标 code "${code || '(空)'}" 不合法(仅字母/数字/下划线)`);
      }
      if (seen.has(code)) throw new BadRequestException(`指标 code "${code}" 重复`);
      seen.add(code);
      if (!label) throw new BadRequestException(`指标 "${code}" 缺少名称`);

      const kind: IndicatorKind = INDICATOR_KINDS.includes(o.kind as IndicatorKind)
        ? (o.kind as IndicatorKind)
        : 'normal';
      const weight = typeof o.weight === 'number' && Number.isFinite(o.weight) ? o.weight : 0;

      const node: IndicatorNode = { code, label, weight, kind };

      // 节点管理员(任意层级:可见并维护本节点子树)
      const adminIds = strIdArray(o.adminUserIds);
      if (adminIds.length) node.adminUserIds = adminIds;

      const rawChildren = o.children;
      if (Array.isArray(rawChildren) && rawChildren.length > 0) {
        node.children = walk(rawChildren, depth + 1);
        return node;
      }

      // 叶子
      const dataSource = typeof o.dataSource === 'string' ? o.dataSource.trim() : '';
      const scoringType = typeof o.scoringType === 'string' ? o.scoringType.trim() : '';
      if (!dataSource) throw new BadRequestException(`叶子指标 "${label}" 未选数据源`);
      if (!scoringType) throw new BadRequestException(`叶子指标 "${label}" 未选计分工具`);
      node.dataSource = dataSource;
      node.scoringType = scoringType;
      if (o.sourceParams && typeof o.sourceParams === 'object' && !Array.isArray(o.sourceParams)) {
        node.sourceParams = o.sourceParams as Record<string, unknown>;
      }
      if (o.strategyParams && typeof o.strategyParams === 'object') {
        node.strategyParams = o.strategyParams as Record<string, unknown>;
      }
      if (typeof o.ownerOrgId === 'string' && o.ownerOrgId.trim()) node.ownerOrgId = o.ownerOrgId.trim();
      // 责任人(多人;兼容旧单值 ownerUserId → 并入 ownerUserIds,统一只输出 ownerUserIds)
      const ownerIds = strIdArray(o.ownerUserIds);
      if (!ownerIds.length && typeof o.ownerUserId === 'string' && o.ownerUserId.trim()) {
        ownerIds.push(o.ownerUserId.trim());
      }
      if (ownerIds.length) node.ownerUserIds = ownerIds;
      if (typeof o.content === 'string' && o.content.trim()) node.content = o.content.trim();
      if (typeof o.rubric === 'string' && o.rubric.trim()) node.rubric = o.rubric.trim();
      if (o.difficultyOn === true) node.difficultyOn = true;
      if (o.difficultyCoefs && typeof o.difficultyCoefs === 'object' && !Array.isArray(o.difficultyCoefs)) {
        const coefs: Record<string, number> = {};
        for (const [k, v] of Object.entries(o.difficultyCoefs as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) coefs[k] = v;
        }
        if (Object.keys(coefs).length) node.difficultyCoefs = coefs;
      }
      return node;
    });
  };

  return walk(raw, 1);
}

export interface WeightIssue {
  code: string;
  label: string;
  declared: number;
  childrenSum: number;
}

/**
 * 权重一致性软提示:分支 weight 应 = 其 normal 子节点之和;顶层 normal 之和应 = baseFullScore。
 * 返回不一致项(供 UI 提示,不阻断保存)。
 */
export function weightIssues(tree: IndicatorNode[], baseFullScore = 100): WeightIssue[] {
  const issues: WeightIssue[] = [];
  const sumNormal = (nodes: IndicatorNode[]) =>
    nodes.filter((n) => n.kind === 'normal').reduce((s, n) => s + (n.weight || 0), 0);

  const rootSum = sumNormal(tree);
  if (tree.length > 0 && Math.abs(rootSum - baseFullScore) > 0.01) {
    issues.push({ code: '__root__', label: '顶层指标', declared: baseFullScore, childrenSum: rootSum });
  }

  const walk = (nodes: IndicatorNode[]) => {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        if (n.kind === 'normal') {
          const cs = sumNormal(n.children);
          if (Math.abs(cs - (n.weight || 0)) > 0.01) {
            issues.push({ code: n.code, label: n.label, declared: n.weight || 0, childrenSum: cs });
          }
        }
        walk(n.children);
      }
    }
  };
  walk(tree);
  return issues;
}
