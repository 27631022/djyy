import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { RoleService } from '../role';
import { UserService } from '../user';
import { OrganizationService } from '../organization';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { TrialScoreDto } from './dto/trial-score.dto';
import { flattenLeaves, normalizeIndicatorTree } from './indicator-tree';
import { getDataSourceSpec } from './data-sources';
import { getScoringSpec, isInputCompatible, type ScoreCtx } from './scoring-strategies';
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

  async findOne(id: string) {
    const s = await this.prisma.assessmentScheme.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('考核体系不存在');
    return s;
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
    await this.findOne(id);
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
        if (!isInputCompatible(ss.inputType, ds.outputType)) {
          throw new BadRequestException(
            `指标 "${leaf.label}":数据源产出(${ds.outputType})与计分工具输入(${ss.inputType})不匹配`,
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
    await this.findOne(id);
    await this.prisma.assessmentScheme.delete({ where: { id } });
    await this.audit.log({ ...ctx, action: 'assessment.scheme.delete', target: id });
    return { ok: true };
  }

  /** 整体复制一张考核表(复用方式:复制改年度/完善指标)。新表草稿态。 */
  async duplicate(id: string, ctx: ActorCtx) {
    const src = await this.findOne(id);
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
}
