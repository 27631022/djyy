import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { TrialScoreDto } from './dto/trial-score.dto';
import { flattenLeaves, normalizeIndicatorTree } from './indicator-tree';
import { getDataSourceSpec } from './data-sources';
import { getScoringSpec, isInputCompatible, type ScoreCtx } from './scoring-strategies';

interface ActorCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 规整考核对象快照 [{orgId,name}](去重、过滤空 orgId) */
function normalizeTargets(raw: unknown): { orgId: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { orgId: string; name: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const orgId = typeof o.orgId === 'string' ? o.orgId.trim() : '';
    if (!orgId || seen.has(orgId)) continue;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    seen.add(orgId);
    out.push({ orgId, name: name || orgId });
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
  ) {}

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
    const raw = toRaw(input.raw);
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
