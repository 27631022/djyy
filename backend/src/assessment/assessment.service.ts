import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { computeRoundResults, previewIndicator, previewSubtotal, type RoundResults } from './round-engine';
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

/** 按 code 在指标树里查找节点。 */
function findNodeInTree(nodes: IndicatorNode[], code: string): IndicatorNode | null {
  for (const n of nodes) {
    if (n.code === code) return n;
    if (n.children?.length) {
      const f = findNodeInTree(n.children, code);
      if (f) return f;
    }
  }
  return null;
}

/** 按 code 用 repl 替换指标树里的节点(返回新树,不改原)。 */
function replaceNodeInTree(nodes: IndicatorNode[], code: string, repl: IndicatorNode): IndicatorNode[] {
  return nodes.map((n) => {
    if (n.code === code) return repl;
    if (n.children?.length) return { ...n, children: replaceNodeInTree(n.children, code, repl) };
    return n;
  });
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
   * 实时结果内存缓存(按轮次):排名只在「保存录入 / 改表」时变,通报洪峰/大屏轮询下
   * 不必每次重算(实测未缓存单次 ~130ms、吞吐 ~28 次/秒;命中后 ~1ms)。
   * 写路径主动失效;TTL 30s 兜底 report.query 的报送数据在报送模块侧变化(无失效钩子)。
   * ⚠ 单进程内存缓存(与 @nestjs/schedule 同一前提);上多副本需换 Redis 或去缓存。
   */
  private readonly liveCache = new Map<string, { at: number; results: RoundResults }>();
  private static readonly LIVE_TTL_MS = 30_000;

  /** 写路径调用:失效某轮次的实时结果缓存;不传 = 全清(改表影响哪些轮次不确定时用) */
  private invalidateLive(roundId?: string) {
    if (roundId) this.liveCache.delete(roundId);
    else this.liveCache.clear();
  }

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
    const existing = await this.loadScheme(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.track !== undefined) data.track = dto.track;
    if (dto.targetLevel !== undefined) data.targetLevel = dto.targetLevel;
    if (dto.status !== undefined) data.status = dto.status;

    let newTree: IndicatorNode[] | null = null;
    if (dto.indicators !== undefined) {
      newTree = this.normalizeAndValidateTree(dto.indicators);
      data.indicatorsJson = JSON.stringify(newTree);
    }
    if (dto.targets !== undefined) data.targetsJson = JSON.stringify(normalizeTargets(dto.targets));
    if (dto.gradeRules !== undefined) data.gradeRulesJson = JSON.stringify(dto.gradeRules);
    if (dto.settings !== undefined) data.settingsJson = JSON.stringify(dto.settings);

    // B6 防丢分守卫:删除/更换取数计分工具「已有录入」的指标 → 首次 409 要求确认;确认后连带清理这些录入
    // (防止旧录入隐形残留、code 复用时"复活"套在新指标上、换工具后被新工具错误重解释)。
    const guard = newTree
      ? await this.guardScoredLeafChanges(
          id,
          safeJson<IndicatorNode[]>(existing.indicatorsJson, []),
          newTree,
          dto.confirmDataLoss === true,
        )
      : { roundIds: [], cleanCodes: [] };

    const scheme = await this.prisma.assessmentScheme.update({ where: { id }, data });

    // 一轮制(一表一轮、不重开):把考核内容/对象/设置/定级的改动同步到该考核表「进行中的轮次」。
    // 否则「考核已发起后换人 / 加打分人」时,新责任人看不到 —— myAssessments / 打分页 / 打分权限
    // 都读 round 创建时冻结的 indicatorsJson 快照。历史成绩由「季度结果快照」单独留档,不受此同步影响。
    const roundData: {
      indicatorsJson?: string;
      targetsJson?: string;
      settingsJson?: string;
      gradeRulesJson?: string;
    } = {};
    if (typeof data.indicatorsJson === 'string') roundData.indicatorsJson = data.indicatorsJson;
    if (typeof data.targetsJson === 'string') roundData.targetsJson = data.targetsJson;
    if (typeof data.settingsJson === 'string') roundData.settingsJson = data.settingsJson;
    if (typeof data.gradeRulesJson === 'string') roundData.gradeRulesJson = data.gradeRulesJson;
    const synced = Object.keys(roundData).length > 0;
    if (synced || guard.cleanCodes.length) {
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      if (synced) ops.push(this.prisma.assessmentRound.updateMany({ where: { schemeId: id }, data: roundData }));
      if (guard.cleanCodes.length) {
        // 确认后的连带清理:被删/被换工具指标的录入 + 分数确认,随快照同步一并生效(同事务)
        ops.push(
          this.prisma.indicatorScore.deleteMany({
            where: { roundId: { in: guard.roundIds }, leafCode: { in: guard.cleanCodes } },
          }),
          this.prisma.assessmentScoreConfirm.deleteMany({
            where: { roundId: { in: guard.roundIds }, leafCode: { in: guard.cleanCodes } },
          }),
        );
      }
      await this.prisma.$transaction(ops);
    }
    this.invalidateLive(); // 指标/对象/设置/定级 任一变化都影响结果 → 全清实时缓存

    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.update',
      target: id,
      detail: { keys: Object.keys(data), syncedToRounds: synced, cleanedScoredLeaves: guard.cleanCodes },
    });
    return scheme;
  }

  /**
   * B6 防丢分守卫:比对新旧指标树,找出「已有录入」却被 删除 / 更换数据源或计分工具 的叶子。
   * 未带 confirmDataLoss → 409(带明细,前端弹确认后重试);已确认 → 返回需连带清理的 leafCode。
   * 为什么确认后要"删"而不是留着:留着会 ① 隐形残留(code 对不上谁也看不见)② 将来 code 复用时
   * "复活"套在不相干的新指标上 ③ 换工具后旧值被新工具错误重解释(如 得分8 被扣分制当成 扣8分)。
   */
  private async guardScoredLeafChanges(
    schemeId: string,
    oldTree: IndicatorNode[],
    newTree: IndicatorNode[],
    confirmed: boolean,
  ): Promise<{ roundIds: string[]; cleanCodes: string[] }> {
    const rounds = await this.prisma.assessmentRound.findMany({
      where: { schemeId },
      select: { id: true },
    });
    const roundIds = rounds.map((r) => r.id);
    if (!roundIds.length) return { roundIds, cleanCodes: [] };
    const rows = await this.prisma.indicatorScore.findMany({
      where: { roundId: { in: roundIds } },
      select: { leafCode: true, rawValue: true },
    });
    const enteredCount = new Map<string, number>();
    for (const r of rows) {
      if (r.rawValue == null || r.rawValue === 'null') continue; // 未真正录入的占位行不算
      enteredCount.set(r.leafCode, (enteredCount.get(r.leafCode) ?? 0) + 1);
    }
    if (!enteredCount.size) return { roundIds, cleanCodes: [] };

    const oldLeaves = new Map(flattenLeaves(oldTree).map((l) => [l.code, l] as const));
    const newLeaves = new Map(flattenLeaves(newTree).map((l) => [l.code, l] as const));
    const removed: { code: string; label: string; count: number }[] = [];
    const retooled: { code: string; label: string; count: number }[] = [];
    for (const [code, count] of enteredCount) {
      const oldLeaf = oldLeaves.get(code);
      if (!oldLeaf) continue; // 历史孤儿(旧树里已不存在),不归本次改动管
      const newLeaf = newLeaves.get(code);
      if (!newLeaf) removed.push({ code, label: oldLeaf.label, count });
      else if (
        (newLeaf.scoringType ?? '') !== (oldLeaf.scoringType ?? '') ||
        (newLeaf.dataSource ?? '') !== (oldLeaf.dataSource ?? '')
      ) {
        retooled.push({ code, label: oldLeaf.label, count });
      }
    }
    if (!removed.length && !retooled.length) return { roundIds, cleanCodes: [] };

    if (!confirmed) {
      const fmt = (arr: { label: string; count: number }[], verb: string) =>
        arr.length ? `【${verb}】` + arr.map((x) => `「${x.label}」(已录 ${x.count} 条)`).join('、') : '';
      throw new ConflictException({
        code: 'ASSESSMENT_SCORED_CHANGE',
        message: [fmt(removed, '删除'), fmt(retooled, '更换取数/计分工具')].filter(Boolean).join(';'),
        removed,
        retooled,
      });
    }
    return { roundIds, cleanCodes: [...removed, ...retooled].map((x) => x.code) };
  }

  /** 规整 + 校验指标树:每叶 数据源/计分工具 存在且产出↔输入兼容,并 normalizeParams。返回规整后的树。 */
  private normalizeAndValidateTree(rawIndicators: unknown): IndicatorNode[] {
    const tree = normalizeIndicatorTree(rawIndicators);
    for (const leaf of flattenLeaves(tree)) {
      const ds = getDataSourceSpec(leaf.dataSource as string);
      if (!ds) throw new BadRequestException(`指标 "${leaf.label}" 的数据源 "${leaf.dataSource}" 未知`);
      const ss = getScoringSpec(leaf.scoringType as string);
      if (!ss) throw new BadRequestException(`指标 "${leaf.label}" 的计分工具 "${leaf.scoringType}" 未知`);
      const outType = effectiveOutputType(leaf.dataSource, leaf.sourceParams);
      if (!isInputCompatible(ss.inputType, outType)) {
        throw new BadRequestException(
          `指标 "${leaf.label}":数据源产出(${outType})与计分工具输入(${ss.inputType})不匹配`,
        );
      }
      leaf.strategyParams = ss.normalizeParams(leaf.strategyParams ?? {});
    }
    return tree;
  }

  /** 「我维护的考核」:列出我作为「节点管理员」(adminUserIds)可维护的考核表 + 我管的最顶层节点。 */
  async managedSchemes(actorId: string) {
    if (!actorId) return { items: [] };
    const schemes = await this.prisma.assessmentScheme.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
    const items: { id: string; name: string; year: number; track: string; nodes: { code: string; label: string }[] }[] = [];
    for (const s of schemes) {
      const tree = safeJson<IndicatorNode[]>(s.indicatorsJson, []);
      const nodes: { code: string; label: string }[] = [];
      const walk = (ns: IndicatorNode[], ancestorAdmin: boolean) => {
        for (const n of ns) {
          const mine = (n.adminUserIds ?? []).includes(actorId);
          if (mine && !ancestorAdmin) nodes.push({ code: n.code, label: n.label }); // 只列最顶层(含子树)
          if (n.children?.length) walk(n.children, ancestorAdmin || mine);
        }
      };
      walk(tree, false);
      if (nodes.length) items.push({ id: s.id, name: s.name, year: s.year, track: s.track, nodes });
    }
    return { items };
  }

  /**
   * 节点管理员「维护本节点子树」:只替换 code=nodeCode 的子树,树其余部分原样保留。
   * 权限:平台管理员 / assessment:manage / 该节点(现有)adminUserIds 含本人。改动同步到进行中轮次。
   */
  async updateSubtree(
    schemeId: string,
    nodeCode: string,
    rawSubtree: unknown,
    ctx: ActorCtx,
    confirmDataLoss = false,
  ) {
    const s = await this.loadScheme(schemeId);
    const tree = safeJson<IndicatorNode[]>(s.indicatorsJson, []);
    const existing = findNodeInTree(tree, nodeCode);
    if (!existing) throw new NotFoundException('节点不存在');

    const actorId = ctx.actorId ?? '';
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(actorId, 'assessment:manage');
    const isManager = isPlatformAdmin || entries.length > 0;
    const isNodeAdmin = (existing.adminUserIds ?? []).includes(actorId);
    if (!isManager && !isNodeAdmin) throw new ForbiddenException('你不是该节点的管理员,不能维护本节点');

    // 规整+校验提交的子树(单根),根 code 不可变(防越权改别的节点)
    const sub = this.normalizeAndValidateTree([rawSubtree])[0];
    if (!sub || sub.code !== nodeCode) throw new BadRequestException('子树根节点与目标节点不一致');

    const merged = replaceNodeInTree(tree, nodeCode, sub);
    // B6 防丢分守卫(同 update()):删/换工具「已有录入」的指标先 409 确认,确认后连带清理
    const guard = await this.guardScoredLeafChanges(schemeId, tree, merged, confirmDataLoss);
    const indicatorsJson = JSON.stringify(merged);
    // 一表一轮:同步到进行中的轮次(打分页/排名读轮次快照);确认后的录入清理同事务
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.assessmentScheme.update({ where: { id: schemeId }, data: { indicatorsJson } }),
      this.prisma.assessmentRound.updateMany({ where: { schemeId }, data: { indicatorsJson } }),
    ];
    if (guard.cleanCodes.length) {
      ops.push(
        this.prisma.indicatorScore.deleteMany({
          where: { roundId: { in: guard.roundIds }, leafCode: { in: guard.cleanCodes } },
        }),
        this.prisma.assessmentScoreConfirm.deleteMany({
          where: { roundId: { in: guard.roundIds }, leafCode: { in: guard.cleanCodes } },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    this.invalidateLive(); // 子树改动同步进轮次快照 → 实时结果缓存失效
    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.update_subtree',
      target: schemeId,
      detail: { nodeCode, cleanedScoredLeaves: guard.cleanCodes },
    });
    return { ok: true };
  }

  async remove(id: string, ctx: ActorCtx) {
    await this.loadScheme(id);
    // 一表一轮:删考核表时连带删除它的考核打分轮次(schemeId 是松引用、无外键级联,
    // 不删轮次会残留在「考核打分」列表里)。删轮次会按外键级联清掉它的
    // 手动打分(IndicatorScore)/ 分数确认 / 季度结果快照;生成的排名(resultsJson)
    // 随轮次一并删除。report.query「引用数据源」的数据存在 report 模块,不受影响。
    const [delRounds] = await this.prisma.$transaction([
      this.prisma.assessmentRound.deleteMany({ where: { schemeId: id } }),
      this.prisma.assessmentScheme.delete({ where: { id } }),
    ]);
    this.invalidateLive(); // 删表连带删轮次 → 全清
    await this.audit.log({
      ...ctx,
      action: 'assessment.scheme.delete',
      target: id,
      detail: { deletedRounds: delRounds.count },
    });
    return { ok: true, deletedRounds: delRounds.count };
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

  async getRound(id: string, actorId?: string) {
    const round = await this.getRoundOrThrow(id);
    const scores = await this.prisma.indicatorScore.findMany({ where: { roundId: id } });
    // 解析叶子的「考核责任人」+「责任部门」,供打分页中间栏展示(责任人 hover 看责任部门 + 联系方式)。
    // 兼容旧快照的单值 ownerUserId;读快照 indicatorsJson(轮次发起时冻结)。
    const indicators = safeJson<IndicatorNode[]>(round.indicatorsJson, []);
    const userIds = new Set<string>();
    const orgIds = new Set<string>();
    for (const leaf of flattenLeaves(indicators)) {
      for (const u of leaf.ownerUserIds ?? []) userIds.add(u);
      if (leaf.ownerUserId) userIds.add(leaf.ownerUserId);
      if (leaf.ownerOrgId) orgIds.add(leaf.ownerOrgId);
    }
    // 责任人电话是 PII:仅「管理员」或「本轮责任人本人」可见(打分页他们要据此联系责任人);
    // 其余登录用户只给姓名/责任部门、不给手机号,避免无关账号凭 round id 拖走全部联系方式。
    let canSeePhone = false;
    if (actorId) {
      const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(actorId, 'assessment:manage');
      canSeePhone = isPlatformAdmin || entries.length > 0 || userIds.has(actorId);
    }
    const full = await this.users.profilesByIds([...userIds]);
    const ownerProfiles: Record<string, { name: string; phone: string | null }> = {};
    for (const [uid, p] of Object.entries(full)) {
      ownerProfiles[uid] = { name: p.name, phone: canSeePhone ? p.phone : null };
    }
    const orgNames = await this.org.namesByIds([...orgIds]);
    return { round, scores, ownerProfiles, orgNames };
  }

  async removeRound(id: string, ctx: ActorCtx) {
    await this.getRoundOrThrow(id);
    await this.prisma.assessmentRound.delete({ where: { id } }); // cascade scores
    this.invalidateLive(id);
    await this.audit.log({ ...ctx, action: 'assessment.round.delete', target: id });
    return { ok: true };
  }

  /** 录入/更新一批指标原始值(责任部门打分)。rawValue 存 JSON 串(number/bool/label)。 */
  async saveScores(roundId: string, entries: unknown, ctx: ActorCtx) {
    const round = await this.getRoundOrThrow(roundId);
    if (!Array.isArray(entries)) throw new BadRequestException('scores 必须是数组');

    // 权限:有 assessment:manage / platform_admin → 录全部;否则只能录自己负责的指标(责任人身份即授权)
    const actorId = ctx.actorId ?? '';
    const { isPlatformAdmin, entries: mgrScopes } = await this.roles.getScopesForPermission(
      actorId,
      'assessment:manage',
    );
    let allowed: Set<string> | null = null; // null = 不限(管理员)
    if (!isPlatformAdmin && mgrScopes.length === 0) {
      const { leaves } = this.confirmLeavesOfRound(round);
      allowed = new Set(leaves.filter((l) => l.ownerUserIds.includes(actorId)).map((l) => l.leafCode));
      if (!allowed.size) throw new ForbiddenException('你在本轮没有负责的考核指标,不能录入打分');
    }

    const norm: { targetRef: string; leafCode: string; data: { rawValue?: string | null; note?: string | null } }[] =
      [];
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const targetRef = typeof o.targetRef === 'string' ? o.targetRef.trim() : '';
      const leafCode = typeof o.leafCode === 'string' ? o.leafCode.trim() : '';
      if (!targetRef || !leafCode) continue;
      if (allowed && !allowed.has(leafCode)) throw new ForbiddenException('只能录入你负责的考核指标');
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
    this.invalidateLive(roundId); // 录入变了 → 实时结果缓存立刻失效(排名秒级跟上)
    await this.audit.log({ ...ctx, action: 'assessment.round.save_scores', target: roundId, detail: { count: ops.length } });
    return { ok: true, count: ops.length };
  }

  /**
   * 纯计算一轮结果(取数→计分→×难易系数→排名→加权汇总→定级),不回写。
   * computeRound(回写轮次)与 createSnapshot(冻结快照)共用,避免计算口径漂移。
   */
  private async runCompute(round: {
    id: string;
    indicatorsJson: string;
    targetsJson: string;
    gradeRulesJson: string;
  }): Promise<RoundResults> {
    const indicators = safeJson<IndicatorNode[]>(round.indicatorsJson, []);
    const targetsRaw = safeJson<{ orgId?: string; userId?: string; name: string }[]>(round.targetsJson, []);
    const targets = targetsRaw
      .map((t) => ({ ref: (t.orgId ?? t.userId ?? '').toString(), name: t.name }))
      .filter((t) => t.ref);
    const gradeRules = safeJson<Record<string, unknown>>(round.gradeRulesJson, {});

    const scores = await this.prisma.indicatorScore.findMany({ where: { roundId: round.id } });
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

    return computeRoundResults(indicators, targets, gradeRules, raw, new Date().toISOString());
  }

  // ─── 季度结果快照(一轮制下「不重开轮」,到季度/截止日手动定格 + 历次对比)───

  /**
   * 生成一份只读结果快照:用当前最新录入算一次 → 冻结并命名(打分继续在同一轮累积)。
   * 快照那一刻即「当前最新」,顺带把轮次当前结果同步(让「当前」与刚生成的快照一致)。
   */
  async createSnapshot(roundId: string, dto: { label: string; note?: string }, ctx: ActorCtx) {
    const round = await this.getRoundOrThrow(roundId);
    const label = (dto.label ?? '').trim();
    if (!label) throw new BadRequestException('请填写快照名称(如「1季度结果」)');
    const results = await this.runCompute(round);
    const resultsJson = JSON.stringify(results);
    await this.prisma.assessmentRound.update({
      where: { id: roundId },
      data: { resultsJson, status: 'done' },
    });
    const snap = await this.prisma.assessmentResultSnapshot.create({
      data: {
        roundId,
        label,
        note: typeof dto.note === 'string' && dto.note.trim() ? dto.note.trim() : null,
        resultsJson,
        createdById: ctx.actorId ?? null,
      },
    });
    await this.audit.log({
      ...ctx,
      action: 'assessment.snapshot.create',
      target: snap.id,
      detail: { roundId, label, targets: results.targets.length },
    });
    return snap;
  }

  /** 列某轮次的结果快照(按时间正序;含 resultsJson —— 量小,供切换/对比直接用)。 */
  async listSnapshots(roundId: string) {
    await this.getRoundOrThrow(roundId);
    return this.prisma.assessmentResultSnapshot.findMany({
      where: { roundId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 删除一份结果快照(管理员清理误建)。 */
  async removeSnapshot(snapshotId: string, ctx: ActorCtx) {
    const snap = await this.prisma.assessmentResultSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snap) throw new NotFoundException('结果快照不存在');
    await this.prisma.assessmentResultSnapshot.delete({ where: { id: snapshotId } });
    await this.audit.log({
      ...ctx,
      action: 'assessment.snapshot.delete',
      target: snapshotId,
      detail: { roundId: snap.roundId, label: snap.label },
    });
    return { ok: true };
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
    // 单签:某指标任一责任人确认即视同该指标确认完成 → 进度按「指标(叶子)」计,不按人头计。
    const settledLeaves = new Set(rows.filter((r) => r.status === 'confirmed').map((r) => r.leafCode));
    const leafCodesWithRows = new Set(rows.map((r) => r.leafCode));
    return {
      initiated: rows.length > 0,
      summary: {
        total: leafCodesWithRows.size,
        confirmed: settledLeaves.size,
        pending: leafCodesWithRows.size - settledLeaves.size,
      },
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
    // 单签:某指标任一责任人确认即视同确认完成 → 我名下的项,只要该指标已被任一人确认,就算「已确认」(不再提醒我)。
    const settledRows = await this.prisma.assessmentScoreConfirm.findMany({
      where: { roundId: { in: [...roundMap.keys()] }, status: 'confirmed' },
      select: { roundId: true, leafCode: true },
    });
    const settledByRound = new Map<string, Set<string>>();
    for (const r of settledRows) {
      if (!settledByRound.has(r.roundId)) settledByRound.set(r.roundId, new Set());
      settledByRound.get(r.roundId)!.add(r.leafCode);
    }
    const leavesCache = new Map<string, ReturnType<AssessmentService['confirmLeavesOfRound']>['leaves']>();
    const items = rows.map((r) => {
      const round = roundMap.get(r.roundId);
      if (round && !leavesCache.has(r.roundId)) leavesCache.set(r.roundId, this.confirmLeavesOfRound(round).leaves);
      const lf = leavesCache.get(r.roundId)?.find((l) => l.leafCode === r.leafCode);
      const settled = settledByRound.get(r.roundId)?.has(r.leafCode) ?? false;
      return {
        roundId: r.roundId,
        roundName: round?.name ?? r.roundId,
        year: round?.year ?? null,
        leafCode: r.leafCode,
        leafLabel: lf?.leafLabel ?? r.leafCode,
        groupLabel: lf?.groupLabel ?? '',
        status: settled ? ('confirmed' as const) : r.status,
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

  /** 「我的本轮确认」状态:我负责的各指标确认了没(打分页「确认完成」按钮用)。 */
  async myRoundConfirm(roundId: string, actorId: string) {
    const round = await this.getRoundOrThrow(roundId);
    const { leaves } = this.confirmLeavesOfRound(round);
    const mine = leaves.filter((l) => l.ownerUserIds.includes(actorId));
    if (!mine.length) return { total: 0, confirmed: 0, pending: 0, leaves: [] };
    // 单签:某指标任一责任人确认即视同确认完成(不限本人)→ 我负责的指标已被任一人确认就算已确认。
    const confirmedRows = await this.prisma.assessmentScoreConfirm.findMany({
      where: { roundId, status: 'confirmed' },
      select: { leafCode: true },
    });
    const settled = new Set(confirmedRows.map((r) => r.leafCode));
    const items = mine.map((l) => ({
      leafCode: l.leafCode,
      leafLabel: l.leafLabel,
      status: settled.has(l.leafCode) ? ('confirmed' as const) : ('pending' as const),
    }));
    const confirmed = items.filter((i) => i.status === 'confirmed').length;
    return { total: items.length, confirmed, pending: items.length - confirmed, leaves: items };
  }

  /** 「确认完成」:把我在本轮负责的所有指标标记为已确认(= 声明我已完成打分)。打分人在打分页点。 */
  async confirmMineInRound(roundId: string, ctx: ActorCtx) {
    const round = await this.getRoundOrThrow(roundId);
    const actorId = ctx.actorId ?? '';
    const { leaves } = this.confirmLeavesOfRound(round);
    const mine = leaves.filter((l) => l.ownerUserIds.includes(actorId));
    if (!mine.length) throw new BadRequestException('你在本轮没有负责的指标,无需确认');
    const now = new Date();
    const ops = mine.map((l) =>
      this.prisma.assessmentScoreConfirm.upsert({
        where: { roundId_leafCode_userId: { roundId, leafCode: l.leafCode, userId: actorId } },
        create: { roundId, leafCode: l.leafCode, userId: actorId, status: 'confirmed', confirmedAt: now },
        update: { status: 'confirmed', confirmedAt: now },
      }),
    );
    await this.prisma.$transaction(ops);
    await this.audit.log({ ...ctx, action: 'assessment.round.confirm_mine', target: roundId, detail: { count: mine.length } });
    return { confirmed: mine.length };
  }

  /**
   * 「我的考核」:打分人入口 —— 列出我有负责指标的各轮次 + 我的确认进度。
   * 跨考核表 / 轮次扫描(轮次量级小);用于人人可见的「我的考核」页 + 实时角标。
   */
  async myAssessments(actorId: string) {
    const rounds = await this.prisma.assessmentRound.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
    // 单签:某指标任一责任人确认即视同确认完成 → 我负责的指标只要被任一人确认就算已确认(不再提醒我)。
    const confirmedRows = await this.prisma.assessmentScoreConfirm.findMany({
      where: { status: 'confirmed' },
      select: { roundId: true, leafCode: true },
    });
    const confirmedByRound = new Map<string, Set<string>>();
    for (const r of confirmedRows) {
      if (!confirmedByRound.has(r.roundId)) confirmedByRound.set(r.roundId, new Set());
      confirmedByRound.get(r.roundId)!.add(r.leafCode);
    }
    const items: {
      roundId: string;
      name: string;
      year: number;
      status: string;
      myLeaves: number;
      myConfirmed: number;
      myPending: number;
    }[] = [];
    for (const round of rounds) {
      const { leaves } = this.confirmLeavesOfRound(round);
      const mine = leaves.filter((l) => l.ownerUserIds.includes(actorId));
      if (!mine.length) continue;
      const confirmedSet = confirmedByRound.get(round.id) ?? new Set<string>();
      const myConfirmed = mine.filter((l) => confirmedSet.has(l.leafCode)).length;
      items.push({
        roundId: round.id,
        name: round.name,
        year: round.year,
        status: round.status,
        myLeaves: mine.length,
        myConfirmed,
        myPending: mine.length - myConfirmed,
      });
    }
    return { items };
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
      kind: dto.kind === 'deduction' || dto.kind === 'bonus' ? dto.kind : 'normal',
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

  /**
   * 多指标合计实时预览(打分人侧):给「我负责的几项指标」+ 各对象当前录入 →
   * 各项单项排名 + 合计得分/排名。无状态(不落库),前端传当前值即时出结果。
   */
  async previewSubtotal(dto: { leaves?: unknown; units?: unknown; deductBlocks?: unknown }) {
    const rawLeaves = Array.isArray(dto.leaves) ? dto.leaves : [];
    const leaves: IndicatorNode[] = rawLeaves
      .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : null))
      .filter((l): l is Record<string, unknown> => !!l && typeof l.code === 'string' && typeof l.scoringType === 'string')
      .map((l) => {
        const spec = getScoringSpec(l.scoringType as string);
        return {
          code: l.code as string,
          label: typeof l.label === 'string' ? l.label : (l.code as string),
          kind: (l.kind === 'deduction' || l.kind === 'bonus' ? l.kind : 'normal') as IndicatorNode['kind'],
          weight: typeof l.weight === 'number' && l.weight >= 0 ? l.weight : 0,
          // dataSource/sourceParams 仅用于服务端解析 report.query(自动取数),与考核排名页同口径
          dataSource: typeof l.dataSource === 'string' ? l.dataSource : undefined,
          sourceParams:
            l.sourceParams && typeof l.sourceParams === 'object'
              ? (l.sourceParams as Record<string, unknown>)
              : undefined,
          scoringType: l.scoringType as string,
          strategyParams: spec ? spec.normalizeParams((l.strategyParams as Record<string, unknown>) ?? {}) : {},
          difficultyOn: l.difficultyOn === true,
          difficultyCoefs:
            l.difficultyCoefs && typeof l.difficultyCoefs === 'object'
              ? (l.difficultyCoefs as Record<string, number>)
              : undefined,
        };
      });
    const rawUnits = Array.isArray(dto.units) ? dto.units : [];
    const units = rawUnits
      .map((u) => (u && typeof u === 'object' ? (u as Record<string, unknown>) : null))
      .filter((u): u is Record<string, unknown> => !!u && typeof u.ref === 'string')
      .map((u) => ({
        ref: u.ref as string,
        name: typeof u.name === 'string' ? u.name : (u.ref as string),
        valuesByLeaf:
          u.valuesByLeaf && typeof u.valuesByLeaf === 'object'
            ? (u.valuesByLeaf as Record<string, unknown>)
            : {},
      }));
    // 减分块子树:轻量结构化解析(只取引擎逐级封顶需要的 结构 + 叶子计分配置)。
    // 不走 normalizeIndicatorTree —— 那会强校验 dataSource/label,而预览要容忍「半配置中」的叶子;
    // 叶子参数由引擎 scoreOneLeaf 内部归一化(与考核排名页同口径)。
    const parseBlock = (raw: unknown): IndicatorNode | null => {
      if (!raw || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      const code = typeof o.code === 'string' ? o.code : '';
      if (!code) return null;
      const node: IndicatorNode = {
        code,
        label: typeof o.label === 'string' ? o.label : code,
        weight: typeof o.weight === 'number' && Number.isFinite(o.weight) ? o.weight : 0,
        kind: o.kind === 'deduction' || o.kind === 'bonus' ? o.kind : 'normal',
      };
      const kids = Array.isArray(o.children)
        ? o.children.map(parseBlock).filter((n): n is IndicatorNode => !!n)
        : [];
      if (kids.length) {
        node.children = kids;
        return node;
      }
      if (typeof o.scoringType === 'string') node.scoringType = o.scoringType;
      if (o.strategyParams && typeof o.strategyParams === 'object') {
        node.strategyParams = o.strategyParams as Record<string, unknown>;
      }
      if (o.difficultyOn === true) node.difficultyOn = true;
      if (o.difficultyCoefs && typeof o.difficultyCoefs === 'object' && !Array.isArray(o.difficultyCoefs)) {
        node.difficultyCoefs = o.difficultyCoefs as Record<string, number>;
      }
      return node;
    };
    const deductBlocks = Array.isArray(dto.deductBlocks)
      ? dto.deductBlocks.map(parseBlock).filter((n): n is IndicatorNode => !!n && n.kind === 'deduction')
      : [];

    // report.query 叶子:服务端按报送任务实时取数,覆盖到各对象 valuesByLeaf —— 与考核排名页(runCompute)同一份口径,
    // 避免「打分页用前端传的值、排名页重新拉报送值」两个数。
    const refs = units.map((u) => u.ref);
    for (const leaf of leaves) {
      if (leaf.dataSource !== 'report.query') continue;
      const sp = (leaf.sourceParams ?? {}) as { reportTaskId?: string; goalKey?: string; field?: string };
      const field = sp.field === 'rate' ? 'rate' : 'actual';
      const vals = await this.resolveReportQuery(sp.reportTaskId ?? '', sp.goalKey ?? '', field, refs);
      for (const u of units) u.valuesByLeaf[leaf.code] = vals[u.ref];
    }

    return previewSubtotal(leaves, units, deductBlocks);
  }

  /**
   * 实时全表结果(读当前已录入 → 引擎实时算,不落库)。
   * 公开总分榜 / 单位体检报告 / 管理员实时排名共用;让排名不依赖管理员手动「计算」。
   * 带内存缓存(见 liveCache):保存录入/改表主动失效 + TTL 30s 兜底报送数据变化。
   */
  async liveResults(roundId: string) {
    const hit = this.liveCache.get(roundId);
    if (hit && Date.now() - hit.at < AssessmentService.LIVE_TTL_MS) return hit.results;
    const round = await this.getRoundOrThrow(roundId);
    const results = await this.runCompute(round);
    this.liveCache.set(roundId, { at: Date.now(), results });
    return results;
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
    // 批量建「党组织→行政机构」索引:一次 getAllLinks 代替逐对象 getLinkedAdminOrgs
    // (原来每对象 2 条查询 × 34 对象 × 每个 report.query 指标 ≈ 200+ 条串行 SQLite 往返,
    //  是实时结果 130ms 里的九成时间;只用到关联 id,与 getLinkedAdminOrgs 行为等价)
    const linksByParty = new Map<string, string[]>();
    if (targetRefs.some((ref) => !valByOrg.has(ref))) {
      for (const l of await this.org.getAllLinks()) {
        const arr = linksByParty.get(l.partyOrgId);
        if (arr) arr.push(l.adminOrgId);
        else linksByParty.set(l.partyOrgId, [l.adminOrgId]);
      }
    }
    for (const ref of targetRefs) {
      if (valByOrg.has(ref)) {
        out[ref] = valByOrg.get(ref)!;
        continue;
      }
      const vals = (linksByParty.get(ref) ?? [])
        .map((id) => valByOrg.get(id))
        .filter((v): v is number => typeof v === 'number');
      if (vals.length) {
        const sum = vals.reduce((a, b) => a + b, 0);
        out[ref] = field === 'rate' ? round2(sum / vals.length) : round2(sum);
      }
    }
    return out;
  }
}
