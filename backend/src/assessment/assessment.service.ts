import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import { UserService } from '../user';
import { OrganizationService } from '../organization';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { TrialScoreDto } from './dto/trial-score.dto';
import { PreviewIndicatorDto } from './dto/preview-indicator.dto';
import { ReportService } from '../report';
import { flattenLeaves, normalizeIndicatorTree, type IndicatorNode } from './indicator-tree';
import { getDataSourceSpec, effectiveOutputType } from './data-sources';
import { getScoringSpec, isInputCompatible, type ScoreCtx } from './scoring-strategies';
import { computeRoundResults, previewIndicator } from './round-engine';
import {
  RELATIONS,
  adminSubjectsOf,
  buildOrgIndex,
  getRelation,
  partySubjectsOf,
} from './assess-relations';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 规整考核对象快照 [{orgId|userId,name}](去重、过滤空引用;支持单位 orgId 与人员 userId) */
function normalizeTargets(raw: unknown): { orgId?: string; userId?: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { orgId?: string; userId?: string; name: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const orgId = typeof o.orgId === 'string' ? o.orgId.trim() : '';
    const userId = typeof o.userId === 'string' ? o.userId.trim() : '';
    const ref = orgId || userId;
    if (!ref || seen.has(ref)) continue;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    seen.add(ref);
    const t: { orgId?: string; userId?: string; name: string } = { name: name || ref };
    if (orgId) t.orgId = orgId;
    if (userId) t.userId = userId;
    out.push(t);
  }
  return out;
}

/** 安全 JSON.parse(坏串回退) */
function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 递归收集指标树里出现的所有人员 id(节点管理员 + 叶子责任人,兼容旧单值)。 */
function collectNodeUserIds(nodes: IndicatorNode[], out: Set<string>) {
  for (const n of nodes) {
    for (const a of n.adminUserIds ?? []) if (a) out.add(a);
    for (const o of n.ownerUserIds ?? []) if (o) out.add(o);
    if (n.ownerUserId) out.add(n.ownerUserId);
    if (n.children?.length) collectNodeUserIds(n.children, out);
  }
}

/** 把试算入参的 raw(unknown)转成原始度量 number|boolean|null */
function toRaw(v: unknown): number | boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * 考核体系(AssessmentScheme)CRUD —— P1 配置层。
 * 指标树存 indicatorsJson 快照;保存时 normalizeIndicatorTree 结构校验 + 逐叶子校验
 * (数据源/计分工具已知 + outputType↔inputType 兼容 + 规整参数)。
 * 发起考核/打分/汇总(Round/Target/IndicatorScore)留 P2。
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
    private readonly users: UserService,
    private readonly org: OrganizationService,
    private readonly report: ReportService,
  ) {}

  /**
   * 「我的考核区域」:按登录账号收敛出可建的考核关系 + 各关系下可担任的主体。
   * platform_admin / scope=all → 全部关系全部主体;否则按 membership 所在层级收敛(见 assess-relations)。
   * 每个主体附带 deptScopeOrgId(责任部门归属行政机构)供叶子配置过滤。
   */
  async myScope(actorId: string) {
    const allOrgs = await this.org.findAll({});
    const links = await this.org.getAllLinks();
    const idx = buildOrgIndex(allOrgs, links);

    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      actorId,
      'assessment:manage',
    );
    const unrestricted = isPlatformAdmin || entries.some((e) => e.scope === 'all');

    // allowed=null 表示不限;否则 key → 可担任主体 orgId 集合
    let allowed: Map<string, Set<string>> | null = null;
    if (!unrestricted) {
      allowed = new Map();
      const add = (key: string, id: string) => {
        if (!allowed!.has(key)) allowed!.set(key, new Set());
        allowed!.get(key)!.add(id);
      };
      const me = await this.users.findOne(actorId);
      for (const m of me.memberships.admin) {
        const s = adminSubjectsOf(idx, m.orgId);
        if (s.company && idx.adminRoot) add('admin.company.unit2', idx.adminRoot.id);
        if (s.unit2) add('admin.unit2.unit3', s.unit2);
        if (s.unit3) add('admin.unit3.employee', s.unit3);
      }
      for (const m of me.memberships.party) {
        const s = partySubjectsOf(idx, m.orgId);
        if (s.company && idx.partyRoot) add('party.company.committee', idx.partyRoot.id);
        if (s.agency) add('party.agency.branch', s.agency);
        if (s.grassroots) add('party.grassroots.branch', s.grassroots);
        if (s.branch) add('party.branch.member', s.branch);
      }
    }

    const relations: {
      key: string;
      track: string;
      level: string;
      label: string;
      subjectLabel: string;
      objectLabel: string;
      objectKind: string;
      subjects: { orgId: string; name: string; deptScopeOrgId?: string }[];
    }[] = [];
    for (const rel of RELATIONS) {
      let subs = rel.subjects(idx);
      if (allowed) {
        const set = allowed.get(rel.key);
        if (!set || set.size === 0) continue;
        subs = subs.filter((o) => set.has(o.id));
      }
      if (subs.length === 0) continue;
      relations.push({
        key: rel.key,
        track: rel.track,
        level: rel.level,
        label: rel.label,
        subjectLabel: rel.subjectLabel,
        objectLabel: rel.objectLabel,
        objectKind: rel.objectKind,
        subjects: subs.map((o) => ({
          orgId: o.id,
          name: o.name,
          deptScopeOrgId: rel.deptScope(o, idx),
        })),
      });
    }
    return { relations };
  }

  /** 主体 → 考核对象候选(单位走结构,党员/员工走成员)。供考核对象批量选择。 */
  async relationObjects(key: string, subjectOrgId: string) {
    const rel = getRelation(key);
    if (!rel) throw new BadRequestException(`未知考核关系 "${key}"`);
    if (!subjectOrgId) throw new BadRequestException('缺少考核主体');
    const allOrgs = await this.org.findAll({});
    const links = await this.org.getAllLinks();
    const idx = buildOrgIndex(allOrgs, links);
    const subject = idx.byId.get(subjectOrgId);
    if (!subject) throw new BadRequestException('考核主体不存在');

    const orgs = rel.objectOrgs(subject, idx);
    if (rel.objectKind === 'org') {
      return orgs.map((o) => ({ orgId: o.id, name: o.name, kind: 'org' as const }));
    }
    // 人员对象:取这些组织的直接成员(去重)
    const seen = new Set<string>();
    const out: { userId: string; name: string; kind: 'user' }[] = [];
    for (const o of orgs) {
      const members = await this.org.listMembers(o.id, false);
      for (const m of members) {
        if (seen.has(m.userId)) continue;
        seen.add(m.userId);
        out.push({ userId: m.userId, name: m.name, kind: 'user' });
      }
    }
    return out;
  }

  list() {
    return this.prisma.assessmentScheme.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** 纯查(内部用,不 enrich)。 */
  private async loadScheme(id: string) {
    const s = await this.prisma.assessmentScheme.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('考核体系不存在');
    return s;
  }

  /**
   * 对外详情:补总管理员名(createdByName)+ 所有相关人员 id→name 映射(userNames)。
   * 覆盖 总管理员 / 协同维护人(settings.managerUserIds)/ 节点管理员 / 叶子责任人 —— 前端展示直接查表。
   */
  async findOne(id: string) {
    const s = await this.loadScheme(id);
    const ids = new Set<string>();
    if (s.createdById) ids.add(s.createdById);
    const settings = safeJson<{ managerUserIds?: unknown }>(s.settingsJson, {});
    if (Array.isArray(settings.managerUserIds)) {
      for (const m of settings.managerUserIds) if (typeof m === 'string' && m) ids.add(m);
    }
    collectNodeUserIds(safeJson<IndicatorNode[]>(s.indicatorsJson, []), ids);
    const userNames = await this.users.namesByIds([...ids]);
    return {
      ...s,
      createdByName: s.createdById ? (userNames[s.createdById] ?? null) : null,
      userNames,
    };
  }

  async create(dto: CreateSchemeDto, ctx: ActorCtx) {
    const scheme = await this.prisma.assessmentScheme.create({
      data: {
        name: dto.name.trim(),
        year: dto.year,
        track: dto.track ?? 'party',
        targetLevel: dto.targetLevel ?? (dto.track === 'admin' ? 'unit' : 'committee'),
        createdById: ctx.actorId ?? null,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.create',
      target: scheme.id,
      detail: { name: scheme.name, track: scheme.track, year: scheme.year },
    });
    return scheme;
  }

  async update(id: string, dto: UpdateSchemeDto, ctx: ActorCtx) {
    await this.loadScheme(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.track !== undefined) data.track = dto.track;
    if (dto.targetLevel !== undefined) data.targetLevel = dto.targetLevel;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.indicators !== undefined) {
      const tree = normalizeIndicatorTree(dto.indicators);
      for (const leaf of flattenLeaves(tree)) {
        const ds = getDataSourceSpec(leaf.dataSource as string);
        if (!ds) {
          throw new BadRequestException(`指标 "${leaf.label}" 的数据源 "${leaf.dataSource}" 未知`);
        }
        const ss = getScoringSpec(leaf.scoringType as string);
        if (!ss) {
          throw new BadRequestException(`指标 "${leaf.label}" 的计分工具 "${leaf.scoringType}" 未知`);
        }
        // report.query 的产出类型随取值(field)变 → 用 effectiveOutputType(集中一处)
        const outType = effectiveOutputType(leaf.dataSource, leaf.sourceParams);
        if (!isInputCompatible(ss.inputType, outType)) {
          throw new BadRequestException(
            `指标 "${leaf.label}":数据源产出(${outType})与计分工具输入(${ss.inputType})不匹配`,
          );
        }
        leaf.strategyParams = ss.normalizeParams(leaf.strategyParams ?? {});
      }
      data.indicatorsJson = JSON.stringify(tree);
    }
    if (dto.targets !== undefined) data.targetsJson = JSON.stringify(normalizeTargets(dto.targets));
    if (dto.gradeRules !== undefined) data.gradeRulesJson = JSON.stringify(dto.gradeRules);
    if (dto.settings !== undefined) data.settingsJson = JSON.stringify(dto.settings);

    const scheme = await this.prisma.assessmentScheme.update({ where: { id }, data });
    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.update',
      target: id,
      detail: { keys: Object.keys(data) },
    });
    return scheme;
  }

  async remove(id: string, ctx: ActorCtx) {
    await this.loadScheme(id);
    await this.prisma.assessmentScheme.delete({ where: { id } });
    await this.audit.log({ ...ctx, action: 'assessment.scheme.delete', target: id });
    return { ok: true };
  }

  /** 整体复制一张考核表(复用方式:复制改年度/完善指标)。新表草稿态。 */
  async duplicate(id: string, ctx: ActorCtx) {
    const src = await this.loadScheme(id);
    const copy = await this.prisma.assessmentScheme.create({
      data: {
        name: `${src.name}(复制)`,
        year: src.year,
        track: src.track,
        targetLevel: src.targetLevel,
        indicatorsJson: src.indicatorsJson,
        targetsJson: src.targetsJson,
        gradeRulesJson: src.gradeRulesJson,
        settingsJson: src.settingsJson,
        status: 'draft',
        createdById: ctx.actorId ?? null,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.duplicate',
      target: copy.id,
      detail: { from: id, name: copy.name },
    });
    return copy;
  }

  // ─── P2 打分闭环:考核轮次 ───

  private async getRoundOrThrow(id: string) {
    const round = await this.prisma.assessmentRound.findUnique({ where: { id } });
    if (!round) throw new NotFoundException('考核轮次不存在');
    return round;
  }

  /** 发起考核:把考核表(指标/对象/设置/定级)快照进一个新轮次。 */
  async createRound(schemeId: string, dto: { name?: string; year?: number }, ctx: ActorCtx) {
    const s = await this.loadScheme(schemeId);
    const round = await this.prisma.assessmentRound.create({
      data: {
        schemeId: s.id,
        name: dto.name?.trim() || `${s.name} · ${dto.year ?? s.year}`,
        year: dto.year ?? s.year,
        track: s.track,
        indicatorsJson: s.indicatorsJson,
        targetsJson: s.targetsJson,
        settingsJson: s.settingsJson,
        gradeRulesJson: s.gradeRulesJson,
        createdById: ctx.actorId ?? null,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'assessment.round.create',
      target: round.id,
      detail: { schemeId, name: round.name },
    });
    return round;
  }

  listRounds(schemeId?: string) {
    return this.prisma.assessmentRound.findMany({
      where: schemeId ? { schemeId } : undefined,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getRound(id: string) {
    const round = await this.getRoundOrThrow(id);
    const scores = await this.prisma.indicatorScore.findMany({ where: { roundId: id } });
    return { round, scores };
  }

  async removeRound(id: string, ctx: ActorCtx) {
    await this.getRoundOrThrow(id);
    await this.prisma.assessmentRound.delete({ where: { id } }); // cascade scores
    await this.audit.log({ ...ctx, action: 'assessment.round.delete', target: id });
    return { ok: true };
  }

  /** 录入/更新一批指标原始值(责任部门打分)。rawValue 存 JSON 串(number/bool/label)。 */
  async saveScores(roundId: string, entries: unknown, ctx: ActorCtx) {
    await this.getRoundOrThrow(roundId);
    if (!Array.isArray(entries)) throw new BadRequestException('scores 必须是数组');
    const norm: { targetRef: string; leafCode: string; data: { rawValue?: string | null; note?: string | null } }[] =
      [];
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const targetRef = typeof o.targetRef === 'string' ? o.targetRef.trim() : '';
      const leafCode = typeof o.leafCode === 'string' ? o.leafCode.trim() : '';
      if (!targetRef || !leafCode) continue;
      const data: { rawValue?: string | null; note?: string | null } = {};
      if ('rawValue' in o)
        data.rawValue = o.rawValue === undefined || o.rawValue === null ? null : JSON.stringify(o.rawValue);
      if (typeof o.note === 'string') data.note = o.note;
      norm.push({ targetRef, leafCode, data });
    }
    const ops = norm.map((n) =>
      this.prisma.indicatorScore.upsert({
        where: { roundId_targetRef_leafCode: { roundId, targetRef: n.targetRef, leafCode: n.leafCode } },
        create: { roundId, targetRef: n.targetRef, leafCode: n.leafCode, ...n.data },
        update: n.data,
      }),
    );
    await this.prisma.$transaction(ops);
    await this.audit.log({ ...ctx, action: 'assessment.round.save_scores', target: roundId, detail: { count: ops.length } });
    return { ok: true, count: ops.length };
  }

  /** 计算轮次:取数→计分→×难易系数→排名→加权汇总→定级,产出写 resultsJson。 */
  async computeRound(roundId: string, ctx: ActorCtx) {
    const round = await this.getRoundOrThrow(roundId);
    const indicators = safeJson<IndicatorNode[]>(round.indicatorsJson, []);
    const targetsRaw = safeJson<{ orgId?: string; userId?: string; name: string }[]>(round.targetsJson, []);
    const targets = targetsRaw
      .map((t) => ({ ref: (t.orgId ?? t.userId ?? '').toString(), name: t.name }))
      .filter((t) => t.ref);
    const gradeRules = safeJson<Record<string, unknown>>(round.gradeRulesJson, {});

    const scores = await this.prisma.indicatorScore.findMany({ where: { roundId } });
    const raw: Record<string, Record<string, unknown>> = {};
    for (const sc of scores) {
      if (!raw[sc.targetRef]) raw[sc.targetRef] = {};
      raw[sc.targetRef][sc.leafCode] = sc.rawValue == null ? null : safeJson<unknown>(sc.rawValue, null);
    }

    // report.query 叶子:从报送任务自动取数,覆盖到 raw(自动源不依赖手工录入)
    const refs = targets.map((t) => t.ref);
    for (const leaf of flattenLeaves(indicators)) {
      if (leaf.dataSource !== 'report.query') continue;
      const sp = (leaf.sourceParams ?? {}) as { reportTaskId?: string; goalKey?: string; field?: string };
      const field = sp.field === 'rate' ? 'rate' : 'actual';
      const vals = await this.resolveReportQuery(sp.reportTaskId ?? '', sp.goalKey ?? '', field, refs);
      for (const ref of refs) {
        if (!raw[ref]) raw[ref] = {};
        raw[ref][leaf.code] = vals[ref];
      }
    }

    const results = computeRoundResults(indicators, targets, gradeRules, raw, new Date().toISOString());
    await this.prisma.assessmentRound.update({
      where: { id: roundId },
      data: { resultsJson: JSON.stringify(results), status: 'done' },
    });
    await this.audit.log({ ...ctx, action: 'assessment.round.compute', target: roundId, detail: { targets: targets.length } });
    return results;
  }

  // ─── 分数确认会签(轮次 × 叶子指标 × 责任人) ───

  /** 收集轮次快照里「有责任人的叶子」(确认单元)+ 无责任人叶子名单(发起时提示)。groupLabel=顶层分组名。 */
  private confirmLeavesOfRound(round: { indicatorsJson: string }) {
    const indicators = safeJson<IndicatorNode[]>(round.indicatorsJson, []);
    const leaves: { leafCode: string; leafLabel: string; groupLabel: string; ownerUserIds: string[] }[] = [];
    const noOwner: string[] = [];
    const walk = (nodes: IndicatorNode[], groupLabel: string) => {
      for (const n of nodes) {
        const g = groupLabel || n.label; // 顶层分组名(顶层叶子取自身)
        if (n.children?.length) {
          walk(n.children, g);
          continue;
        }
        const owners = (n.ownerUserIds ?? []).filter((x) => typeof x === 'string' && x);
        if (owners.length) leaves.push({ leafCode: n.code, leafLabel: n.label, groupLabel: g, ownerUserIds: owners });
        else noOwner.push(n.label);
      }
    };
    walk(indicators, '');
    return { leaves, noOwner };
  }

  /** 发起 / 重新发起分数确认:给「有责任人的叶子 × 每个责任人」生成 pending(reset=true 把已确认也重置)。 */
  async requestConfirm(roundId: string, reset: boolean, ctx: ActorCtx) {
    const round = await this.getRoundOrThrow(roundId);
    const { leaves } = this.confirmLeavesOfRound(round);
    const desired = new Set<string>();
    for (const lf of leaves) for (const uid of lf.ownerUserIds) desired.add(`${lf.leafCode} ${uid}`);

    const existing = await this.prisma.assessmentScoreConfirm.findMany({ where: { roundId } });
    const existKey = new Set(existing.map((e) => `${e.leafCode} ${e.userId}`));
    // 清理已失效项(指标删了 / 责任人换了)
    const staleIds = existing.filter((e) => !desired.has(`${e.leafCode} ${e.userId}`)).map((e) => e.id);
    if (staleIds.length) await this.prisma.assessmentScoreConfirm.deleteMany({ where: { id: { in: staleIds } } });

    const ops: Promise<unknown>[] = [];
    for (const lf of leaves)
      for (const uid of lf.ownerUserIds) {
        const has = existKey.has(`${lf.leafCode} ${uid}`);
        if (reset) {
          ops.push(
            this.prisma.assessmentScoreConfirm.upsert({
              where: { roundId_leafCode_userId: { roundId, leafCode: lf.leafCode, userId: uid } },
              create: { roundId, leafCode: lf.leafCode, userId: uid, status: 'pending' },
              update: { status: 'pending', confirmedAt: null, note: null },
            }),
          );
        } else if (!has) {
          ops.push(
            this.prisma.assessmentScoreConfirm.create({
              data: { roundId, leafCode: lf.leafCode, userId: uid, status: 'pending' },
            }),
          );
        }
      }
    if (ops.length) await this.prisma.$transaction(ops as never);
    await this.audit.log({
      ...ctx,
      action: 'assessment.round.confirm_request',
      target: roundId,
      detail: { reset, leaves: leaves.length },
    });
    return this.confirmProgress(roundId);
  }

  /** 确认进度(管理员看「哪个指标、谁还没确认」+ 电话)。 */
  async confirmProgress(roundId: string) {
    const round = await this.getRoundOrThrow(roundId);
    const { leaves, noOwner } = this.confirmLeavesOfRound(round);
    const leafMeta = new Map(leaves.map((l) => [l.leafCode, l]));
    const rows = await this.prisma.assessmentScoreConfirm.findMany({ where: { roundId } });
    const profiles = await this.users.profilesByIds([...new Set(rows.map((r) => r.userId))]);
    const items = rows
      .map((r) => {
        const lf = leafMeta.get(r.leafCode);
        const u = profiles[r.userId];
        return {
          leafCode: r.leafCode,
          leafLabel: lf?.leafLabel ?? r.leafCode,
          groupLabel: lf?.groupLabel ?? '',
          userId: r.userId,
          userName: u?.name ?? r.userId,
          userPhone: u?.phone ?? null,
          status: r.status,
          confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
        };
      })
      .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel) || a.leafLabel.localeCompare(b.leafLabel));
    const confirmed = items.filter((i) => i.status === 'confirmed').length;
    return {
      initiated: rows.length > 0,
      summary: { total: items.length, confirmed, pending: items.length - confirmed },
      items,
      noOwnerLeaves: noOwner,
    };
  }

  /** 「我的考核确认」:当前用户名下待确认/已确认项(跨轮次)。 */
  async myConfirmations(actorId: string) {
    const rows = await this.prisma.assessmentScoreConfirm.findMany({
      where: { userId: actorId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    if (!rows.length) return { items: [] };
    const rounds = await this.prisma.assessmentRound.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.roundId))] } },
    });
    const roundMap = new Map(rounds.map((r) => [r.id, r]));
    const leavesCache = new Map<string, ReturnType<AssessmentService['confirmLeavesOfRound']>['leaves']>();
    const items = rows.map((r) => {
      const round = roundMap.get(r.roundId);
      if (round && !leavesCache.has(r.roundId)) leavesCache.set(r.roundId, this.confirmLeavesOfRound(round).leaves);
      const lf = leavesCache.get(r.roundId)?.find((l) => l.leafCode === r.leafCode);
      return {
        roundId: r.roundId,
        roundName: round?.name ?? r.roundId,
        year: round?.year ?? null,
        leafCode: r.leafCode,
        leafLabel: lf?.leafLabel ?? r.leafCode,
        groupLabel: lf?.groupLabel ?? '',
        status: r.status,
        confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      };
    });
    return { items };
  }

  /** 责任人确认某指标分数无误(= 声明已完成该指标打分)。仅该指标责任人可确认自己那项。 */
  async confirmIndicator(roundId: string, leafCode: string, ctx: ActorCtx, note?: string) {
    const round = await this.getRoundOrThrow(roundId);
    const actorId = ctx.actorId ?? '';
    const { leaves } = this.confirmLeavesOfRound(round);
    const lf = leaves.find((l) => l.leafCode === leafCode);
    if (!lf || !lf.ownerUserIds.includes(actorId)) {
      throw new ForbiddenException('只有该指标的考核责任人可以确认');
    }
    const existing = await this.prisma.assessmentScoreConfirm.findUnique({
      where: { roundId_leafCode_userId: { roundId, leafCode, userId: actorId } },
    });
    if (!existing) throw new BadRequestException('该指标尚未发起确认');
    await this.prisma.assessmentScoreConfirm.update({
      where: { id: existing.id },
      data: { status: 'confirmed', confirmedAt: new Date(), note: typeof note === 'string' ? note : existing.note },
    });
    await this.audit.log({ ...ctx, action: 'assessment.round.confirm', target: roundId, detail: { leafCode } });
    return { ok: true, status: 'confirmed' as const };
  }

  /** 试算:用一个计分工具 + 参数 + 样例原始值算得分(配置时即时预览;权威,前端不重复实现公式)。 */
  trial(input: TrialScoreDto) {
    const spec = getScoringSpec(input.scoringType);
    if (!spec) throw new BadRequestException(`未知计分工具 "${input.scoringType}"`);
    const params = spec.normalizeParams(input.params ?? {});
    const fullScore =
      typeof input.fullScore === 'number' && input.fullScore >= 0 ? input.fullScore : 100;
    // label 工具(评价定分)吃字符串名次;其余转 number|boolean|null
    const raw =
      spec.inputType === 'label'
        ? typeof input.raw === 'string'
          ? input.raw
          : null
        : toRaw(input.raw);
    const ctx: ScoreCtx = { fullScore, params };
    if (spec.crossTarget) {
      const all = (input.rawValues ?? []).filter(
        (x): x is number => typeof x === 'number' && Number.isFinite(x),
      );
      const order = params.order === 'asc' ? 'asc' : 'desc';
      const v = typeof raw === 'number' ? raw : 0;
      const ahead = all.filter((x) => (order === 'asc' ? x < v : x > v)).length;
      ctx.allValues = all;
      ctx.count = all.length || 1;
      ctx.rank = 1 + ahead;
    }
    const score = spec.compute(raw, ctx);
    return {
      score: Math.round(score * 100) / 100,
      fullScore,
      inputType: spec.inputType,
      crossTarget: spec.crossTarget,
    };
  }

  /**
   * 单指标实时预览(录入页右栏):给一个计分工具 + 参数 + 难易系数 + 各对象实际值
   * → 返回按 ●得分 降序的 ●# 单项排名。无状态(不落库),复用引擎,前端不重复实现公式。
   */
  previewIndicator(dto: PreviewIndicatorDto) {
    const spec = getScoringSpec(dto.scoringType);
    if (!spec) throw new BadRequestException(`未知计分工具 "${dto.scoringType}"`);
    const leaf: IndicatorNode = {
      code: '_preview',
      label: '',
      kind: 'normal',
      weight: typeof dto.fullScore === 'number' && dto.fullScore >= 0 ? dto.fullScore : 0,
      scoringType: dto.scoringType,
      strategyParams: spec.normalizeParams(dto.params ?? {}),
      difficultyOn: dto.difficultyOn === true,
      difficultyCoefs:
        dto.difficultyCoefs && typeof dto.difficultyCoefs === 'object' ? dto.difficultyCoefs : undefined,
    };
    const units = (Array.isArray(dto.units) ? dto.units : [])
      .map((u) => (u && typeof u === 'object' ? (u as Record<string, unknown>) : null))
      .filter((u): u is Record<string, unknown> => !!u && typeof u.ref === 'string')
      .map((u) => ({
        ref: u.ref as string,
        name: typeof u.name === 'string' ? u.name : (u.ref as string),
        raw: u.raw,
      }));
    return { results: previewIndicator(leaf, units) };
  }

  /* ─── report.query 接入(报送任务取数 → 考核数据源)─── */

  /** 考核选数据源:列出有目标的报送任务 + 目标(供 report.query 编辑器)。 */
  reportQuerySources() {
    return this.report.listGoalSources();
  }

  /** report.query 预览:给 任务+目标+取值+对象,返回各对象将取到的值(配置时即时看,不落库)。 */
  async reportQueryPreview(dto: { reportTaskId?: string; goalKey?: string; field?: string; targets?: unknown }) {
    const targets = normalizeTargets(dto.targets);
    const refs = targets.map((t) => (t.orgId ?? t.userId ?? '')).filter(Boolean);
    const field = dto.field === 'rate' ? 'rate' : 'actual';
    const vals = await this.resolveReportQuery(dto.reportTaskId ?? '', dto.goalKey ?? '', field, refs);
    return {
      field,
      rows: targets.map((t) => {
        const ref = t.orgId ?? t.userId ?? '';
        return { ref, name: t.name, value: vals[ref] ?? null };
      }),
    };
  }

  /**
   * 报送取数解析:把某报送任务某目标的各单位值映射到考核对象(ref=orgId/userId)。
   * field='actual' 取实际值、'rate' 取完成率%。考核对象是党组织时经 PartyAdminLink 换算到行政单位匹配
   * (直接匹配优先;1:1 直取 / 1:N actual 求和、rate 平均)。无数据/未关联 → null。
   */
  private async resolveReportQuery(
    taskId: string,
    goalKey: string,
    field: 'actual' | 'rate',
    targetRefs: string[],
  ): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    for (const ref of targetRefs) out[ref] = null;
    if (!taskId || !goalKey) return out;
    let q: Awaited<ReturnType<ReportService['queryGoal']>>;
    try {
      q = await this.report.queryGoal(taskId, goalKey);
    } catch {
      return out; // 任务/目标不存在
    }
    const valByOrg = new Map<string, number>();
    for (const u of q.units) {
      if (!u.orgId) continue;
      const v = field === 'rate' ? u.rate : u.actual;
      if (typeof v === 'number' && Number.isFinite(v)) valByOrg.set(u.orgId, v);
    }
    for (const ref of targetRefs) {
      if (valByOrg.has(ref)) {
        out[ref] = valByOrg.get(ref)!;
        continue;
      }
      const linked = await this.org.getLinkedAdminOrgs(ref);
      const vals = linked.map((o) => valByOrg.get(o.id)).filter((v): v is number => typeof v === 'number');
      if (vals.length) {
        const sum = vals.reduce((a, b) => a + b, 0);
        out[ref] = field === 'rate' ? round2(sum / vals.length) : round2(sum);
      }
    }
    return out;
  }
}
