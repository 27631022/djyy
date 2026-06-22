import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { RoleService } from '../role';
import { StorageService } from '../storage';
import { normalizeFieldDefs, parseFields } from './report-fields';
import {
  normalizeGoals,
  parseGoals,
  computeGoalProgress,
  deriveGoalColumns,
  type GoalLine,
} from './report-goals';
import { PublishReportDto, type ReportTargetInput } from './dto/publish-report.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { UpdateReportTaskDto } from './dto/update-report-task.dto';
import { SaveGoalTargetsDto } from './dto/save-goal-targets.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** 安全解析 orgIdsJson → string[] */
function parseIdArray(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 解析 goalTargetsJson → { goalKey: 数值 }(逐单位目标值) */
function parseNumMap(json: string): Record<string, number> {
  try {
    const v: unknown = JSON.parse(json);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o: Record<string, number> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const n = Number(val);
        if (Number.isFinite(n)) o[k] = n;
      }
      return o;
    }
  } catch {
    /* noop */
  }
  return {};
}

/** 从 ReportLine.extraJson 取税额(分);无则 0 */
function taxCentsOfExtra(json: string): number {
  try {
    return Number((JSON.parse(json) as { taxCents?: unknown }).taxCents) || 0;
  } catch {
    return 0;
  }
}

/** 安全解析 headData JSON → 对象 */
function parseHeadObj(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 行政机构索引(父子 + meta + 部门/虚拟标记 + 名称)。对口走 org-meta,照搬 task。 */
interface OrgIndex {
  childrenOf: Map<string, string[]>;
  parentOf: Map<string, string | null>;
  metaById: Map<string, string | null>;
  isDeptById: Map<string, boolean>;
  isVirtualById: Map<string, boolean>;
  nameById: Map<string, string>;
}

/**
 * 通用报送平台(report)。「一次发布 · 多次提交」底座 —— 与 task 的本质区别 = 提交无 @unique。
 * 派发模型 = 类任务管理,**去掉部门互派/平级确认**:上级派发到单位 → 对口责任部门(读 org meta
 * `counterpartParentOrgIds`,与 task 完全一致,**在「组织机构」里配置**)→ 该部门成员 inbox 看到 →
 * 认领/指派承办。不再维护独立的对口配置表。详见 docs/specs/2026-06-16-report-platform.md。
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
    private readonly roles: RoleService,
    private readonly storage: StorageService,
  ) {}

  /* ─── 编辑 / 删除报送任务(派发人本人或管理员)─── */
  async updateTask(id: string, dto: UpdateReportTaskDto, actor: ActorContext) {
    const task = await this.prisma.reportTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('报送任务不存在');
    await this.assertCanManageTask(actor.actorId, task.dispatchUserId);
    const data: { title?: string; notes?: string | null; dueAt?: Date | null; goalsJson?: string } = {};
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('任务名称不能为空');
      data.title = t;
    }
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    // 目标定义可发布后修改(只是度量口径,不与已录数据冲突)
    if (dto.goals !== undefined) data.goalsJson = JSON.stringify(normalizeGoals(dto.goals));
    const updated = await this.prisma.reportTask.update({ where: { id }, data });
    await this.audit.log({ ...actor, action: 'report.task.update', target: id, detail: { title: updated.title } });
    return updated;
  }

  /**
   * 删除报送任务,并**彻底清理其下所有内容**:明细行 → 发票 → 派发对象 → 任务本身,
   * 再软删关联的 storage 文件(通知文件 + 各发票/合同附件,不可逆,best-effort)。
   */
  async deleteTask(id: string, actor: ActorContext) {
    const task = await this.prisma.reportTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('报送任务不存在');
    await this.assertCanManageTask(actor.actorId, task.dispatchUserId);
    // 收集待清理的 storage 文件:通知文件 + 所有发票 / 合同附件
    const subs = await this.prisma.reportSubmission.findMany({
      where: { taskId: id },
      select: { invoiceFileId: true, contractFileId: true },
    });
    const fileIds = new Set<string>();
    if (task.noticeFileId) fileIds.add(task.noticeFileId);
    for (const s of subs) {
      if (s.invoiceFileId) fileIds.add(s.invoiceFileId);
      if (s.contractFileId) fileIds.add(s.contractFileId);
    }
    // 清库(ReportTarget/Submission 与 Task 无外键级联 → 显式按 taskId 逐表删)
    await this.prisma.$transaction([
      this.prisma.reportLine.deleteMany({ where: { taskId: id } }),
      this.prisma.reportSubmission.deleteMany({ where: { taskId: id } }),
      this.prisma.reportTarget.deleteMany({ where: { taskId: id } }),
      this.prisma.reportTask.delete({ where: { id } }),
    ]);
    // 清文件(不可逆,失败不阻断;漏删的由孤儿 GC 兜底)
    for (const fid of fileIds) await this.storage.softDelete(fid, actor).catch(() => {});
    await this.audit.log({
      ...actor,
      action: 'report.task.delete',
      target: id,
      detail: { title: task.title, submissions: subs.length, files: fileIds.size },
    });
    return { ok: true, deletedSubmissions: subs.length, deletedFiles: fileIds.size };
  }

  private async assertCanManageTask(actorId: string | undefined, dispatchUserId: string) {
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    if (actorId === dispatchUserId) return;
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'report:manage');
    if (!isPlatformAdmin) throw new ForbiddenException('只有派发人或管理员可以编辑 / 删除该报送任务');
  }

  /* ─── 派发对象「快捷组」(每人自己,服务端持久化,跟账号走)─── */
  // 走 raw SQL(ReportUnitGroup 表已由迁移建好):列全 TEXT,避开 SQLite DateTime 写入坑。
  async listUnitGroups(actorId: string) {
    const rows = await this.prisma.$queryRawUnsafe<
      { id: string; name: string; orgIdsJson: string }[]
    >(
      'SELECT "id", "name", "orgIdsJson" FROM "ReportUnitGroup" WHERE "userId" = ? ORDER BY "createdAt" ASC, "name" ASC',
      actorId,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, orgIds: parseIdArray(r.orgIdsJson) }));
  }

  async createUnitGroup(actorId: string, name: string, orgIds: string[]) {
    const nm = (name || '').trim().slice(0, 40);
    if (!nm) throw new BadRequestException('快捷组需要名称');
    const ids = [...new Set((orgIds || []).filter((x) => typeof x === 'string' && x))].slice(0, 500);
    if (ids.length === 0) throw new BadRequestException('请先选中若干单位再存为快捷组');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO "ReportUnitGroup" ("id","userId","name","orgIdsJson","createdAt") VALUES (?,?,?,?,?)',
      id,
      actorId,
      nm,
      JSON.stringify(ids),
      new Date().toISOString(),
    );
    return { id, name: nm, orgIds: ids };
  }

  async deleteUnitGroup(actorId: string, id: string) {
    await this.prisma.$executeRawUnsafe(
      'DELETE FROM "ReportUnitGroup" WHERE "id" = ? AND "userId" = ?',
      id,
      actorId,
    );
    return { ok: true };
  }

  /* ─── 组织索引 + 对口(org-meta)+ 层级 helper(镜像 task)─── */

  private async loadOrgIndex(): Promise<OrgIndex> {
    const rows = await this.orgs.findAll({ kind: 'admin', includeInactive: true });
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string | null>();
    const metaById = new Map<string, string | null>();
    const isDeptById = new Map<string, boolean>();
    const isVirtualById = new Map<string, boolean>();
    const nameById = new Map<string, string>();
    for (const o of rows) {
      parentOf.set(o.id, o.parentId ?? null);
      metaById.set(o.id, o.meta ?? null);
      isDeptById.set(o.id, !!o.isDept);
      isVirtualById.set(o.id, !!o.isVirtual);
      nameById.set(o.id, o.name);
      if (o.parentId) {
        const arr = childrenOf.get(o.parentId) ?? [];
        arr.push(o.id);
        childrenOf.set(o.parentId, arr);
      }
    }
    return { childrenOf, parentOf, metaById, isDeptById, isVirtualById, nameById };
  }

  /**
   * 在某单位子树里找「对口 sourceId 的责任部门」:遍历单位下属,谁的 meta.counterpartParentOrgIds
   * 含 sourceId(派发部门),谁就是责任部门。照搬 task.findHandlerDept —— 对口在「组织机构」里配。
   */
  private findHandlerDept(index: OrgIndex, unitId: string, sourceId: string): string | null {
    const stack = [unitId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const meta = index.metaById.get(id);
      if (meta) {
        try {
          const parsed = JSON.parse(meta) as {
            counterpartParentOrgIds?: unknown;
            counterpartParentOrgId?: unknown;
          };
          const cp = parsed.counterpartParentOrgIds;
          if (Array.isArray(cp) && cp.includes(sourceId)) return id;
          if (typeof parsed.counterpartParentOrgId === 'string' && parsed.counterpartParentOrgId === sourceId)
            return id;
        } catch {
          /* 忽略坏 meta */
        }
      }
      for (const c of index.childrenOf.get(id) ?? []) stack.push(c);
    }
    return null;
  }

  /** 从某机构往上找「所在单位」= 最近的非部门、非虚拟祖先(含自身);找不到兜底自身。 */
  private owningUnitOf(index: OrgIndex, orgId: string): string {
    let cur: string | null = orgId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (!index.isDeptById.get(cur) && !index.isVirtualById.get(cur)) return cur;
      cur = index.parentOf.get(cur) ?? null;
    }
    return orgId;
  }

  /** 某机构的所有祖先 id(自下而上)。 */
  private ancestorsOf(index: OrgIndex, id: string): string[] {
    const out: string[] = [];
    let cur = index.parentOf.get(id) ?? null;
    while (cur) {
      out.push(cur);
      cur = index.parentOf.get(cur) ?? null;
    }
    return out;
  }

  /** orgId 是否落在 actor 任一 membership 的子树内(含自身)。 */
  private orgInActorArea(index: OrgIndex, membershipOrgIds: Iterable<string>, orgId: string): boolean {
    const roots = new Set(membershipOrgIds);
    let cur: string | null = orgId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (roots.has(cur)) return true;
      cur = index.parentOf.get(cur) ?? null;
    }
    return false;
  }

  /** 用户姓名/电话(供展示);小批量 dedupe 循环 users.findOne。 */
  private async infoForUsers(ids: string[]): Promise<Map<string, { name: string; phone: string | null }>> {
    const out = new Map<string, { name: string; phone: string | null }>();
    for (const id of [...new Set(ids.filter(Boolean))]) {
      try {
        const u = await this.users.findOne(id);
        out.set(id, { name: u.name, phone: u.phone ?? null });
      } catch {
        /* 用户已删:跳过 */
      }
    }
    return out;
  }

  /* ─── 发布 + fan-out ─── */

  /**
   * 发布报送任务:建 ReportTask(快照 fields)+ fan-out ReportTarget(对口责任部门走 org-meta)。
   * 派发部门(dispatchOrgId)缺省 = 派发人主行政归属。单位派发 → 命中对口写 handlerOrgId(否则 pending 待认领);
   * 个人直派 → 该人即承办人(in_progress)。P1 不做派发范围限制(有 report:manage 即可)。
   */
  async publish(dto: PublishReportDto, ctx: ActorContext) {
    if (!ctx.actorId) throw new BadRequestException('缺少操作者身份');
    const fields = normalizeFieldDefs(dto.fields);
    const goals = normalizeGoals(dto.goals);
    // 逐单位目标值对所有目标可设(仅作参考展示)
    const perUnitKeys = new Set(goals.map((g) => g.key));
    const targets = (dto.targets ?? []).filter(
      (t): t is ReportTargetInput =>
        t && (t.targetType === 'org' ? !!t.targetOrgId : t.targetType === 'user' ? !!t.targetUserId : false),
    );
    if (!targets.length) throw new BadRequestException('请至少选择一个有效派发对象');

    // 派发部门:缺省取派发人主行政归属(对口解析的 source）
    let dispatchOrgId = dto.dispatchOrgId?.trim() || null;
    if (!dispatchOrgId) {
      const me = await this.users.findOne(ctx.actorId);
      const primary = me.memberships.admin.find((m) => m.isPrimary) ?? me.memberships.admin[0];
      dispatchOrgId = primary?.orgId ?? null;
    }
    if (dispatchOrgId) await this.orgs.findOne(dispatchOrgId);

    let dueAt: Date | null = null;
    if (dto.dueAt) {
      const d = new Date(dto.dueAt);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('截止时间格式不正确');
      dueAt = d;
    }

    const index = await this.loadOrgIndex();

    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.reportTask.create({
        data: {
          templateId: dto.templateId ?? null,
          title: dto.title,
          notes: dto.notes ?? null,
          fieldsJson: JSON.stringify(fields),
          goalsJson: JSON.stringify(goals),
          catalogTag: dto.catalogTag ?? null,
          dispatchUserId: ctx.actorId as string,
          dispatchOrgId,
          dueAt,
          noticeFileId: dto.noticeFileId ?? null,
          noticeFileName: dto.noticeFileName ?? null,
          periodLabel: dto.periodLabel ?? null,
          status: dto.status ?? 'open',
        },
      });
      for (const tg of targets) {
        let handlerOrgId: string | null = null;
        let ownerUserId: string | null = null;
        let status = 'pending';
        if (tg.targetType === 'user') {
          ownerUserId = tg.targetUserId ?? null; // 直派个人即承办人
          status = 'in_progress';
        } else if (tg.targetOrgId && dispatchOrgId) {
          // 单位派发:按 org-meta 对口找责任部门(存一份快照;读取时实时重算)
          handlerOrgId = this.findHandlerDept(index, tg.targetOrgId, dispatchOrgId);
        }
        // 逐单位目标值:只取 perUnit 金额目标的键,非负数值
        const gt: Record<string, number> = {};
        for (const [k, v] of Object.entries(tg.goalTargets ?? {})) {
          const n = Number(v);
          if (perUnitKeys.has(k) && Number.isFinite(n) && n >= 0) gt[k] = n;
        }
        await tx.reportTarget.create({
          data: {
            taskId: t.id,
            targetType: tg.targetType,
            targetOrgId: tg.targetOrgId ?? null,
            targetUserId: tg.targetUserId ?? null,
            handlerOrgId,
            ownerUserId,
            goalTargetsJson: JSON.stringify(gt),
            status,
            assignedById: null,
            assignedAt: ownerUserId ? new Date() : null,
          },
        });
      }
      return t;
    });

    await this.log(
      'report.publish',
      { title: task.title, targetCount: targets.length, fieldCount: fields.length, dispatchOrgId },
      ctx,
    );
    return this.getTask(task.id);
  }

  /* ─── 读取 ─── */

  /** 我派发的报送任务列表(不传 = 全部,管理员用)。带对象数 + 已提交对象数。 */
  async listTasks(dispatchUserId?: string) {
    const tasks = await this.prisma.reportTask.findMany({
      where: dispatchUserId ? { dispatchUserId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    const ids = tasks.map((t) => t.id);
    const targets = ids.length
      ? await this.prisma.reportTarget.findMany({ where: { taskId: { in: ids } }, select: { taskId: true, status: true } })
      : [];
    return tasks.map((t) => {
      const ts = targets.filter((x) => x.taskId === t.id);
      return {
        ...t,
        targetCount: ts.length,
        submittedCount: ts.filter((x) => x.status === 'submitted' || x.status === 'closed').length,
      };
    });
  }

  /** 报送任务详情 + 派发对象(带 单位/责任部门/承办人 名称 + 提交数)。责任部门实时重算 org-meta 对口。 */
  async getTask(id: string) {
    const task = await this.prisma.reportTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('报送任务不存在');
    const targets = await this.prisma.reportTarget.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });
    const index = await this.loadOrgIndex();
    const ownerInfo = await this.infoForUsers(targets.map((t) => t.ownerUserId).filter((x): x is string => !!x));
    const subCounts = targets.length
      ? await this.prisma.reportSubmission.groupBy({
          by: ['targetId'],
          where: { targetId: { in: targets.map((t) => t.id) } },
          _count: { _all: true },
        })
      : [];
    const subByTarget = new Map(subCounts.map((s) => [s.targetId, s._count._all]));
    return {
      ...task,
      goals: parseGoals(task.goalsJson),
      targets: targets.map((t) => {
        const handlerOrgId =
          t.targetType === 'org' && t.targetOrgId && task.dispatchOrgId
            ? this.findHandlerDept(index, t.targetOrgId, task.dispatchOrgId)
            : t.handlerOrgId;
        return {
          ...t,
          handlerOrgId,
          targetOrgName: t.targetOrgId ? index.nameById.get(t.targetOrgId) ?? null : null,
          handlerOrgName: handlerOrgId ? index.nameById.get(handlerOrgId) ?? null : null,
          ownerUserName: t.ownerUserId ? ownerInfo.get(t.ownerUserId)?.name ?? null : null,
          submissionCount: subByTarget.get(t.id) ?? 0,
        };
      }),
    };
  }

  /** 目标完成情况(逐单位 × 逐目标):按明细算实际值/完成率/是否达标。纯业务内,不依赖考核。 */
  async goalProgress(taskId: string) {
    const { goals, rows } = await this.loadGoalRows(taskId);
    return {
      goals,
      rows: rows.map((r) => ({
        targetId: r.targetId,
        targetOrgName: r.targetOrgName,
        ownerUserName: r.ownerUserName,
        submissionCount: r.submissionCount,
        goalTargets: r.goalTargets,
        progress: r.progress,
      })),
    };
  }

  /**
   * report.query 取数口:取**一个目标**的各单位值(供考核侧 DI 消费 / 预览)。
   * 目标之间不耦合 —— 一次只出一个 goalKey 的各派发对象 { actual, rate, met, 分组明细 };
   * 复合/加权一律在考核指标树做,report 只提供独立的数。
   */
  async queryGoal(taskId: string, goalKey: string) {
    const { goals, rows } = await this.loadGoalRows(taskId);
    const goal = goals.find((g) => g.key === goalKey);
    if (!goal) throw new NotFoundException(`目标 "${goalKey}" 不存在`);
    const units = rows.map((r) => {
      const p = r.progress.find((x) => x.key === goalKey);
      return {
        orgId: r.targetOrgId,
        userId: r.targetUserId,
        name: r.targetOrgName ?? r.ownerUserName ?? null,
        submissionCount: r.submissionCount,
        actual: p?.actual ?? null,
        rate: p?.rate ?? null, // 中性完成率(实际/目标);达标判断归考核
        target: p?.target ?? null,
        grouped: p?.grouped ?? false,
        money: p?.money ?? false,
        groups: p?.groups ?? null,
      };
    });
    return { taskId, goalKey, label: goal.label, grouped: !!goal.groupBy, money: units.some((u) => u.money), units };
  }

  /** 逐单位 × 逐目标完成情况的底层计算(goalProgress / queryGoal 共用)。 */
  private async loadGoalRows(taskId: string) {
    const task = await this.prisma.reportTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');
    const goals = parseGoals(task.goalsJson);
    const fields = parseFields(task.fieldsJson);
    const targets = await this.prisma.reportTarget.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
    const subs = await this.prisma.reportSubmission.findMany({ where: { taskId }, include: { lines: true } });
    const byTarget = new Map<string, typeof subs>();
    for (const s of subs) {
      const arr = byTarget.get(s.targetId) ?? [];
      arr.push(s);
      byTarget.set(s.targetId, arr);
    }
    const index = await this.loadOrgIndex();
    const ownerInfo = await this.infoForUsers(targets.map((t) => t.ownerUserId).filter((x): x is string => !!x));
    const columns = deriveGoalColumns(fields); // 按任务字段派生可筛选/可聚合列(通用)
    const rows = targets.map((t) => {
      const tsubs = byTarget.get(t.id) ?? [];
      const lines: GoalLine[] = tsubs.flatMap((s) => {
        // 把发票头的购买日期注入每行(供「按季度/月分组」取 date 列)
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate).toISOString() : null;
        return s.lines.map((l) => ({
          amountCents: l.amountCents,
          taxCents: taxCentsOfExtra(l.extraJson),
          // 结构化列(catalog 快照 + feeSource + 头层购买日期);其余动态列读 extraJson
          structured: {
            category: l.category,
            feeSource: l.feeSource,
            recommendOrg: l.recommendOrg,
            origin: l.origin,
            catalogSupplier: l.catalogSupplier,
            supplier: l.supplier,
            productName: l.productName,
            spec: l.spec,
            purchaseDate,
          },
          extra: parseHeadObj(l.extraJson),
        }));
      });
      const perUnit = parseNumMap(t.goalTargetsJson);
      return {
        targetId: t.id,
        targetOrgId: t.targetOrgId,
        targetUserId: t.targetUserId,
        targetOrgName: t.targetOrgId ? index.nameById.get(t.targetOrgId) ?? null : null,
        ownerUserName: t.ownerUserId ? ownerInfo.get(t.ownerUserId)?.name ?? null : null,
        submissionCount: tsubs.length,
        goalTargets: perUnit,
        progress: computeGoalProgress(goals, columns, lines, perUnit),
      };
    });
    return { goals, columns, rows };
  }

  /** 保存逐单位目标值(targetMode=perUnit 的金额目标)。派发人 / 管理员。 */
  async saveGoalTargets(taskId: string, dto: SaveGoalTargetsDto, actor: ActorContext) {
    const task = await this.prisma.reportTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');
    await this.assertCanManageTask(actor.actorId, task.dispatchUserId);
    const goals = parseGoals(task.goalsJson);
    // 逐单位目标值对所有目标可设(仅作参考展示)
    const perUnitKeys = new Set(goals.map((g) => g.key));
    const validTargets = new Set(
      (await this.prisma.reportTarget.findMany({ where: { taskId }, select: { id: true } })).map((t) => t.id),
    );
    let saved = 0;
    for (const row of dto.rows ?? []) {
      if (!row || !validTargets.has(row.targetId)) continue;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(row.values ?? {})) {
        if (!perUnitKeys.has(k)) continue; // 只接受 perUnit 金额目标的值
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) clean[k] = n;
      }
      await this.prisma.reportTarget.update({ where: { id: row.targetId }, data: { goalTargetsJson: JSON.stringify(clean) } });
      saved++;
    }
    await this.audit.log({ ...actor, action: 'report.goal-targets.save', target: taskId, detail: { rows: saved } });
    return { ok: true, saved };
  }

  /* ─── 接收侧:inbox / claim / assign ─── */

  /**
   * 我的报送待办:我承办的(ownerUserId==我)+ 我可接收的「待接收」:
   * - 命中对口 → 责任部门(实时算)∈我行政归属(仅责任部门成员可见)
   * - 未命中对口 → handler 空 + targetOrgId == 我「所属单位」(本单位全员可见可认领)
   */
  async inbox(actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const me = await this.users.findOne(actorId);
    const myOrgIds = me.memberships.admin.map((m) => m.orgId);
    const myOrgSet = new Set(myOrgIds);
    const index = await this.loadOrgIndex();
    const reception = await this.roles.getScopesForPermission(actorId, 'report:reception');
    const hasReception = reception.isPlatformAdmin || reception.entries.length > 0;
    const assignAnywhere = reception.isPlatformAdmin;
    // 候选范围:我所在节点 + 各自祖先(任务可能派到上级单位、我是其下对口责任部门)
    const myUnits = new Set<string>(myOrgIds);
    for (const d of myOrgIds) for (const a of this.ancestorsOf(index, d)) myUnits.add(a);
    const myOwnUnits = new Set<string>(myOrgIds);
    for (const d of myOrgIds) myOwnUnits.add(this.owningUnitOf(index, d));

    const candidates = await this.prisma.reportTarget.findMany({
      where: { OR: [{ ownerUserId: actorId }, { ownerUserId: null, targetOrgId: { in: [...myUnits] } }] },
      orderBy: { createdAt: 'desc' },
    });
    if (candidates.length === 0) return [];

    const tasksList = await this.prisma.reportTask.findMany({
      where: { id: { in: [...new Set(candidates.map((t) => t.taskId))] }, status: { not: 'archived' } },
    });
    const taskById = new Map(tasksList.map((t) => [t.id, t]));

    const rows: { t: (typeof candidates)[number]; handlerOrgId: string | null }[] = [];
    for (const t of candidates) {
      const task = taskById.get(t.taskId);
      if (!task) continue;
      const handlerOrgId =
        t.targetType === 'org' && t.targetOrgId && task.dispatchOrgId
          ? this.findHandlerDept(index, t.targetOrgId, task.dispatchOrgId)
          : null;
      if (t.ownerUserId !== actorId) {
        if (handlerOrgId) {
          if (!myOrgSet.has(handlerOrgId)) continue; // 配了对口、责任部门不是我 → 不可见
        } else if (!t.targetOrgId || !myOwnUnits.has(t.targetOrgId)) {
          continue; // 未配对口:只有派到我所属单位才可见
        }
      }
      rows.push({ t, handlerOrgId });
    }
    if (rows.length === 0) return [];

    const [dispatchInfo, subCounts] = await Promise.all([
      this.infoForUsers(rows.map((r) => taskById.get(r.t.taskId)!.dispatchUserId)),
      this.prisma.reportSubmission.groupBy({
        by: ['targetId'],
        where: { targetId: { in: rows.map((r) => r.t.id) } },
        _count: { _all: true },
      }),
    ]);
    const subByTarget = new Map(subCounts.map((s) => [s.targetId, s._count._all]));

    return rows.map(({ t, handlerOrgId }) => {
      const task = taskById.get(t.taskId)!;
      const claimable = !t.ownerUserId && t.status !== 'closed';
      const responsibleDept = handlerOrgId ?? t.targetOrgId ?? null;
      const canAssign =
        claimable &&
        !!responsibleDept &&
        hasReception &&
        (assignAnywhere || this.orgInActorArea(index, myOrgIds, responsibleDept));
      return {
        targetId: t.id,
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        status: t.status,
        isOwner: t.ownerUserId === actorId,
        claimable,
        submissionCount: subByTarget.get(t.id) ?? 0,
        dispatchOrgName: task.dispatchOrgId ? index.nameById.get(task.dispatchOrgId) ?? null : null,
        dispatchUserName: dispatchInfo.get(task.dispatchUserId)?.name ?? null,
        dispatchUserPhone: dispatchInfo.get(task.dispatchUserId)?.phone ?? null,
        targetOrgName: t.targetOrgId ? index.nameById.get(t.targetOrgId) ?? null : null,
        handlerOrgName: handlerOrgId ? index.nameById.get(handlerOrgId) ?? null : null,
        canAssign,
        assignOrgId: canAssign ? responsibleDept : null,
        assignOrgName: canAssign && responsibleDept ? index.nameById.get(responsibleDept) ?? null : null,
        createdAt: task.createdAt,
      };
    });
  }

  /** 接收(认领):未被接收 + 我是对口责任部门 / 所属单位成员 → 我成为承办人(转填报中)。 */
  async claim(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId) throw new BadRequestException('该报送已被接收');

    const me = await this.users.findOne(actorId);
    const myOrgIds = new Set(me.memberships.admin.map((m) => m.orgId));
    const index = await this.loadOrgIndex();
    const task = await this.prisma.reportTask.findUnique({ where: { id: target.taskId } });
    const deptHandler =
      task?.dispatchOrgId && target.targetOrgId
        ? this.findHandlerDept(index, target.targetOrgId, task.dispatchOrgId)
        : null;
    let handlerOrgId: string | null;
    if (deptHandler) {
      if (!myOrgIds.has(deptHandler)) throw new ForbiddenException('你不在该报送的责任部门,无法接收');
      handlerOrgId = deptHandler;
    } else {
      const myOwnUnits = new Set<string>([...myOrgIds]);
      for (const d of myOrgIds) myOwnUnits.add(this.owningUnitOf(index, d));
      if (!target.targetOrgId || !myOwnUnits.has(target.targetOrgId))
        throw new ForbiddenException('该报送不是派给你所属单位的,无法接收');
      handlerOrgId =
        [...myOrgIds].find((d) => d === target.targetOrgId || this.owningUnitOf(index, d) === target.targetOrgId) ??
        null;
    }

    const updated = await this.prisma.reportTarget.update({
      where: { id: targetId },
      data: { ownerUserId: actorId, handlerOrgId, status: 'in_progress', assignedById: actorId, assignedAt: new Date() },
    });
    await this.log('report.claim', { taskId: target.taskId }, actor);
    return { ok: true, status: updated.status };
  }

  /**
   * 指派承办人:有 report:reception 权限者把某「待接收」对象指定给承办部门成员。
   * 承办部门 = 对口责任部门(实时算)/ 否则目标单位本身。授权 = report:reception(+ 承办部门在我区域)或 platform_admin。
   */
  async assign(targetId: string, dto: AssignReportDto, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const userId = dto.userId?.trim();
    if (!userId) throw new BadRequestException('请选择承办人');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId) throw new BadRequestException('该报送已被接收或指派');

    const index = await this.loadOrgIndex();
    const task = await this.prisma.reportTask.findUnique({ where: { id: target.taskId } });
    const handler =
      task?.dispatchOrgId && target.targetOrgId
        ? this.findHandlerDept(index, target.targetOrgId, task.dispatchOrgId)
        : null;
    const responsibleDept = handler ?? target.targetOrgId ?? null;
    if (!responsibleDept) throw new BadRequestException('该报送无法定位承办部门');

    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(actorId, 'report:reception');
    if (!isPlatformAdmin && entries.length === 0)
      throw new ForbiddenException('你没有「报送接收管理(指派)」权限,无法指派承办人');
    if (!isPlatformAdmin) {
      const actor2 = await this.users.findOne(actorId);
      const myOrgIds = actor2.memberships.admin.map((m) => m.orgId);
      if (!this.orgInActorArea(index, myOrgIds, responsibleDept))
        throw new ForbiddenException('只能指派你所在部门(及其下级)的报送');
    }
    const assignee = await this.users.findOne(userId);
    if (!assignee.memberships.admin.some((m) => m.orgId === responsibleDept))
      throw new BadRequestException('承办人必须是该承办部门的成员');

    const updated = await this.prisma.reportTarget.update({
      where: { id: targetId },
      data: {
        ownerUserId: userId,
        handlerOrgId: responsibleDept,
        status: 'in_progress',
        assignedById: actorId,
        assignedAt: new Date(),
      },
    });
    await this.log('report.assign', { taskId: target.taskId, assigneeId: userId, responsibleDept }, actor);
    return { ok: true, status: updated.status };
  }

  /* ─── 杂项 ─── */

  /**
   * 本模块在用的 storage fileId —— 供孤儿文件 GC 聚合(MaintenanceService.inUseFileIds)。
   * 头层共享:通知文件 + 发票文件 + 合同文件。明细行不带文件指针。
   * ⚠ 新增任何引用 storage 文件的字段,务必在此登记,否则会被 GC 误删。
   */
  async collectInUseFileIds(): Promise<string[]> {
    const [tasks, subs] = await Promise.all([
      this.prisma.reportTask.findMany({ where: { noticeFileId: { not: null } }, select: { noticeFileId: true } }),
      this.prisma.reportSubmission.findMany({
        where: { OR: [{ invoiceFileId: { not: null } }, { contractFileId: { not: null } }] },
        select: { invoiceFileId: true, contractFileId: true },
      }),
    ]);
    const out: string[] = [];
    for (const t of tasks) if (t.noticeFileId) out.push(t.noticeFileId);
    for (const s of subs) {
      if (s.invoiceFileId) out.push(s.invoiceFileId);
      if (s.contractFileId) out.push(s.contractFileId);
    }
    return out;
  }

  /** 写审计便捷封装(领域前缀 report.<verb>)。detail 传原始对象 —— audit.log 内部已 stringify。 */
  protected log(action: string, detail: unknown, ctx: ActorContext) {
    return this.audit.log({ action, detail, actorId: ctx.actorId, actorName: ctx.actorName, ip: ctx.ip });
  }
}
