import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { normalizeFieldDefs, parseFields } from './task-fields';
import { DispatchTaskDto, type TaskTargetInput } from './dto/dispatch-task.dto';
import { SaveFillDto } from './dto/save-fill.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface TaskTargetRow {
  id: string;
  taskId: string;
  targetType: string;
  targetOrgId: string | null;
  targetUserId: string | null;
  ownerUserId: string | null;
  handlerOrgId: string | null;
  status: string;
  assignedAt: Date | null;
}

/** 行政机构索引(父子 + meta),供「对口实时解析」复用 */
interface OrgIndex {
  childrenOf: Map<string, string[]>;
  metaById: Map<string, string | null>;
  parentOf: Map<string, string | null>;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
  ) {}

  /**
   * 派发任务:建 Task(快照 fields)+ fan-out TaskTarget + 对口路由定责任人。
   * - 个人直派 → 该人即责任人(status=assigned)
   * - 单位派发 → 查 UnitTaskRouting(本单位 + 派发部门):命中自动定责任人(assigned),否则待分派(pending)
   */
  async dispatch(dto: DispatchTaskDto, actor: ActorContext) {
    if (!actor.actorId) throw new BadRequestException('缺少操作者身份');
    const fields = normalizeFieldDefs(dto.fields);
    const targets = await this.resolveTargets(dto.targets);
    const dispatchOrgId = dto.dispatchOrgId?.trim() || null;
    if (dispatchOrgId) await this.orgs.findOne(dispatchOrgId); // 校验派发部门存在

    let dueAt: Date | null = null;
    if (dto.dueAt) {
      const d = new Date(dto.dueAt);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('截止时间格式不正确');
      dueAt = d;
    }

    // 对口实时解析:加载行政机构索引(责任部门按「组织对口上级」属性现算;派发时存一份快照,读取时仍会实时重算)
    const orgIndex = dispatchOrgId ? await this.loadAdminOrgIndex() : null;

    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          notes: dto.notes ?? null,
          templateId: dto.templateId ?? null,
          fields: JSON.stringify(fields),
          dispatchUserId: actor.actorId as string,
          dispatchOrgId,
          dueAt,
          noticeFileId: dto.noticeFileId ?? null,
          noticeFileName: dto.noticeFileName ?? null,
          status: dto.status ?? 'open',
        },
      });

      for (const tg of targets) {
        let ownerUserId: string | null = null;
        let handlerOrgId: string | null = null;
        let status = 'pending';
        if (tg.targetType === 'user') {
          // 直派个人:该人即责任人
          ownerUserId = tg.targetUserId ?? null;
          status = 'assigned';
        } else if (dispatchOrgId && tg.targetOrgId && orgIndex) {
          // 单位派发:按「组织对口上级」属性定责任部门(存一份快照;读取时实时重算)
          handlerOrgId = this.findHandlerDept(orgIndex, tg.targetOrgId, dispatchOrgId);
        }
        await tx.taskTarget.create({
          data: {
            taskId: t.id,
            targetType: tg.targetType,
            targetOrgId: tg.targetOrgId ?? null,
            targetUserId: tg.targetUserId ?? null,
            ownerUserId,
            handlerOrgId,
            status,
            assignedById: null, // null = 个人直派;手动分派(P2)才写分派人
            assignedAt: ownerUserId ? new Date() : null,
          },
        });
      }
      return t;
    });

    await this.audit.log({
      ...actor,
      action: 'task.dispatch',
      target: task.id,
      detail: {
        title: task.title,
        templateId: task.templateId,
        dispatchOrgId,
        targetCount: targets.length,
        fieldCount: fields.length,
      },
    });

    return this.get(task.id);
  }

  /** 加载行政机构索引(父子 + meta),供「对口实时解析」复用。 */
  private async loadAdminOrgIndex(): Promise<OrgIndex> {
    const orgRows = await this.orgs.findAll({ kind: 'admin', includeInactive: true });
    const childrenOf = new Map<string, string[]>();
    const metaById = new Map<string, string | null>();
    const parentOf = new Map<string, string | null>();
    for (const o of orgRows) {
      metaById.set(o.id, o.meta ?? null);
      parentOf.set(o.id, o.parentId ?? null);
      if (o.parentId) {
        const arr = childrenOf.get(o.parentId) ?? [];
        arr.push(o.id);
        childrenOf.set(o.parentId, arr);
      }
    }
    return { childrenOf, metaById, parentOf };
  }

  /** 目标单位子树里「对口上级」含 sourceId 的部门 = 责任部门;无 = null(未配置对口 → 谁都不可见)。 */
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
          const cp = (JSON.parse(meta) as { counterpartParentOrgIds?: unknown })
            .counterpartParentOrgIds;
          if (Array.isArray(cp) && cp.includes(sourceId)) return id;
        } catch {
          /* 忽略坏 meta */
        }
      }
      for (const c of index.childrenOf.get(id) ?? []) stack.push(c);
    }
    return null;
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

  /** 我派发的任务列表(含派发对象状态汇总) */
  async list(actor: ActorContext) {
    const tasks = await this.prisma.task.findMany({
      where: { dispatchUserId: actor.actorId || '__none__' },
      orderBy: { createdAt: 'desc' },
    });
    const ids = tasks.map((t) => t.id);
    const targets = ids.length
      ? await this.prisma.taskTarget.findMany({ where: { taskId: { in: ids } } })
      : [];
    return tasks.map((t) => {
      const ts = targets.filter((x) => x.taskId === t.id);
      return {
        id: t.id,
        title: t.title,
        templateId: t.templateId,
        dueAt: t.dueAt,
        status: t.status,
        createdAt: t.createdAt,
        targetCount: ts.length,
        statusCounts: countByStatus(ts),
        fieldCount: parseFields(t.fields).length,
      };
    });
  }

  /** 任务详情 + 派发对象(含单位/责任人名,前端/客户端直接显示) */
  async get(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    const targets: TaskTargetRow[] = await this.prisma.taskTarget.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    // 责任部门实时解析(组织对口属性是唯一真相;派发后改对口也即时生效)
    const orgIndex = await this.loadAdminOrgIndex();
    const liveHandler = new Map<string, string | null>();
    for (const t of targets) {
      liveHandler.set(
        t.id,
        t.targetType === 'org' && t.targetOrgId && task.dispatchOrgId
          ? this.findHandlerDept(orgIndex, t.targetOrgId, task.dispatchOrgId)
          : null,
      );
    }

    const orgIds = [
      ...targets
        .filter((t) => t.targetType === 'org' && t.targetOrgId)
        .map((t) => t.targetOrgId as string),
      ...[...liveHandler.values()].filter((x): x is string => !!x),
    ];
    const userIds = [
      ...targets.filter((t) => t.targetUserId).map((t) => t.targetUserId as string),
      ...targets.filter((t) => t.ownerUserId).map((t) => t.ownerUserId as string),
    ];
    const [orgNames, userInfo] = await Promise.all([
      this.namesForOrgs(orgIds),
      this.infoForUsers(userIds),
    ]);

    const enriched = targets.map((t) => {
      const h = liveHandler.get(t.id) ?? null;
      return {
        id: t.id,
        targetType: t.targetType,
        targetOrgId: t.targetOrgId,
        targetUserId: t.targetUserId,
        targetName:
          t.targetType === 'org'
            ? t.targetOrgId
              ? orgNames[t.targetOrgId]
              : ''
            : t.targetUserId
              ? userInfo[t.targetUserId]?.name ?? ''
              : '',
        ownerUserId: t.ownerUserId,
        ownerName: t.ownerUserId ? userInfo[t.ownerUserId]?.name ?? null : null,
        ownerPhone: t.ownerUserId ? userInfo[t.ownerUserId]?.phone ?? null : null,
        handlerOrgId: h,
        handlerOrgName: h ? orgNames[h] : null,
        status: t.status,
        assignedAt: t.assignedAt,
      };
    });

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      notes: task.notes,
      templateId: task.templateId,
      fields: parseFields(task.fields),
      dispatchUserId: task.dispatchUserId,
      dispatchOrgId: task.dispatchOrgId,
      dueAt: task.dueAt,
      noticeFileId: task.noticeFileId,
      noticeFileName: task.noticeFileName,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      targets: enriched,
      statusCounts: countByStatus(targets),
    };
  }

  /**
   * 我的待办(接收侧)：我负责的(ownerUserId==我)+ 我所在责任部门「待接收」的
   * (handlerOrgId∈我的行政归属;或未配对口 handlerOrgId 空但 targetOrgId∈我的行政归属=整单位可见)。
   */
  async inbox(actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const me = await this.users.findOne(actorId);
    const myOrgIds = me.memberships.admin.map((m) => m.orgId);
    const myOrgSet = new Set(myOrgIds);
    const index = await this.loadAdminOrgIndex();
    // 我可能成为责任部门的单位 = 我所在部门 + 它们的所有祖先(任务派到这些单位时,我的部门可能是其下责任部门)
    const myUnits = new Set<string>(myOrgIds);
    for (const d of myOrgIds) for (const a of this.ancestorsOf(index, d)) myUnits.add(a);

    const candidates = await this.prisma.taskTarget.findMany({
      where: {
        OR: [
          { ownerUserId: actorId },
          { ownerUserId: null, targetOrgId: { in: [...myUnits] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (candidates.length === 0) return [];

    const tasksList = await this.prisma.task.findMany({
      where: { id: { in: [...new Set(candidates.map((t) => t.taskId))] } },
    });
    const taskById = new Map(tasksList.map((t) => [t.id, t]));

    // 实时解析每个候选的责任部门;待接收的只有「责任部门是我所在部门」才可见(未配置对口=谁都不可见)
    const rows: {
      t: (typeof candidates)[number];
      task: (typeof tasksList)[number];
      handlerOrgId: string | null;
    }[] = [];
    for (const t of candidates) {
      const task = taskById.get(t.taskId);
      if (!task) continue;
      const handlerOrgId =
        t.targetType === 'org' && t.targetOrgId && task.dispatchOrgId
          ? this.findHandlerDept(index, t.targetOrgId, task.dispatchOrgId)
          : null;
      if (t.ownerUserId !== actorId && (!handlerOrgId || !myOrgSet.has(handlerOrgId))) {
        continue; // 待接收但责任部门不是我 / 未配置对口 → 不可见
      }
      rows.push({ t, task, handlerOrgId });
    }
    if (rows.length === 0) return [];

    const orgNames = await this.namesForOrgs(
      [
        ...rows.flatMap((r) => [r.t.targetOrgId, r.handlerOrgId]),
        ...rows.map((r) => r.task.dispatchOrgId),
      ].filter((x): x is string => !!x),
    );

    return rows.map(({ t, task, handlerOrgId }) => ({
      targetId: t.id,
      taskId: task.id,
      title: task.title,
      dueAt: task.dueAt,
      status: t.status,
      isOwner: t.ownerUserId === actorId,
      claimable: !t.ownerUserId && t.status !== 'done',
      dispatchOrgName: task.dispatchOrgId ? orgNames[task.dispatchOrgId] ?? null : null,
      targetOrgName: t.targetOrgId ? orgNames[t.targetOrgId] ?? null : null,
      handlerOrgName: handlerOrgId ? orgNames[handlerOrgId] ?? null : null,
      fieldCount: parseFields(task.fields).length,
      createdAt: task.createdAt,
    }));
  }

  /** 接收(认领):未被接收 + 我是责任部门成员 → 成为责任人(转填报中)。 */
  async claim(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId) throw new BadRequestException('该任务已被接收');

    const me = await this.users.findOne(actorId);
    const myOrgIds = new Set(me.memberships.admin.map((m) => m.orgId));
    // 实时解析责任部门:未配置对口 / 我不在该部门 → 不能接收
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    const index = await this.loadAdminOrgIndex();
    const handlerOrgId =
      task?.dispatchOrgId && target.targetOrgId
        ? this.findHandlerDept(index, target.targetOrgId, task.dispatchOrgId)
        : null;
    if (!handlerOrgId || !myOrgIds.has(handlerOrgId)) {
      throw new ForbiddenException('你不在该任务的责任部门(或该单位尚未配置对口),无法接收');
    }

    const updated = await this.prisma.taskTarget.update({
      where: { id: targetId },
      data: {
        ownerUserId: actorId,
        handlerOrgId,
        status: 'in_progress',
        assignedById: actorId,
        assignedAt: new Date(),
      },
    });
    await this.audit.log({
      ...actor,
      action: 'task.claim',
      target: targetId,
      detail: { taskId: target.taskId },
    });
    return { ok: true, status: updated.status };
  }

  /** 填报页数据:任务字段 + 我(责任人)的回执(草稿/已提交)。 */
  async getFill(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId !== actorId) {
      throw new ForbiddenException('只有该任务的责任人可以填报(请先在「我的待办」接收)');
    }
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    const submission = await this.prisma.taskSubmission.findUnique({ where: { targetId } });
    return {
      targetId,
      taskId: task.id,
      taskTitle: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      fields: parseFields(task.fields),
      targetStatus: target.status,
      submission: {
        formData: submission ? safeJson(submission.formData) : {},
        status: submission?.status ?? 'draft',
        reviewNote: submission?.reviewNote ?? null,
        submittedAt: submission?.submittedAt ?? null,
      },
    };
  }

  /** 保存填报:草稿 / 提交(提交时校验必填 + 转「已提交」)。 */
  async saveFill(targetId: string, dto: SaveFillDto, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId !== actorId) {
      throw new ForbiddenException('只有该任务的责任人可以填报');
    }
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    const fields = parseFields(task.fields);
    const formData = (dto.formData ?? {}) as Record<string, unknown>;

    if (dto.submit) {
      const missing = fields.filter((f) => f.required && isEmptyValue(formData[f.code]));
      if (missing.length) {
        throw new BadRequestException(
          `请先填写必填项:${missing.map((m) => m.label).join('、')}`,
        );
      }
    }

    const fileIds = collectFileIds(fields, formData);
    const status = dto.submit ? 'submitted' : 'draft';
    const data = {
      formData: JSON.stringify(formData),
      fileIds: JSON.stringify(fileIds),
      status,
      submittedById: dto.submit ? actorId : null,
      submittedAt: dto.submit ? new Date() : null,
    };
    await this.prisma.taskSubmission.upsert({
      where: { targetId },
      create: { taskId: target.taskId, targetId, ...data },
      update: data,
    });
    if (dto.submit) {
      await this.prisma.taskTarget.update({
        where: { id: targetId },
        data: { status: 'submitted' },
      });
    }
    await this.audit.log({
      ...actor,
      action: dto.submit ? 'task.submit' : 'task.fill.draft',
      target: targetId,
      detail: { taskId: target.taskId, fileCount: fileIds.length },
    });
    return { ok: true, status };
  }

  /** 规整 + 校验派发对象(去重、存在性) */
  private async resolveTargets(raw: TaskTargetInput[]): Promise<TaskTargetInput[]> {
    if (!Array.isArray(raw) || raw.length === 0)
      throw new BadRequestException('请至少选择一个派发对象');
    const seen = new Set<string>();
    const out: TaskTargetInput[] = [];
    for (const t of raw) {
      if (t.targetType === 'org') {
        const id = (t.targetOrgId ?? '').trim();
        if (!id) throw new BadRequestException('派发对象(单位)缺少 orgId');
        if (seen.has(`org:${id}`)) continue;
        seen.add(`org:${id}`);
        await this.orgs.findOne(id);
        out.push({ targetType: 'org', targetOrgId: id });
      } else if (t.targetType === 'user') {
        const id = (t.targetUserId ?? '').trim();
        if (!id) throw new BadRequestException('派发对象(个人)缺少 userId');
        if (seen.has(`user:${id}`)) continue;
        seen.add(`user:${id}`);
        await this.users.findOne(id);
        out.push({ targetType: 'user', targetUserId: id });
      } else {
        throw new BadRequestException(`不支持的派发对象类型 "${String(t.targetType)}"`);
      }
    }
    if (out.length === 0) throw new BadRequestException('请至少选择一个派发对象');
    return out;
  }

  private async namesForOrgs(ids: string[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const id of [...new Set(ids)]) {
      try {
        const o = await this.orgs.findOne(id);
        map[id] = (o as { name?: string }).name ?? id;
      } catch {
        map[id] = '(已删除单位)';
      }
    }
    return map;
  }

  private async infoForUsers(
    ids: string[],
  ): Promise<Record<string, { name: string; phone: string | null }>> {
    const map: Record<string, { name: string; phone: string | null }> = {};
    for (const id of [...new Set(ids)]) {
      try {
        const u = (await this.users.findOne(id)) as { name?: string; phone?: string | null };
        map[id] = { name: u.name ?? id, phone: u.phone ?? null };
      } catch {
        map[id] = { name: '(已删除用户)', phone: null };
      }
    }
    return map;
  }
}

/** 安全解析 formData JSON → 对象 */
function safeJson(s: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 填报值是否为空(必填校验用):null/空串/空数组 = 空 */
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** 从 formData 收集所有 file/image 字段引用的 storage fileId(冗余存 TaskSubmission.fileIds,便于汇总/下载/回收) */
function collectFileIds(
  fields: { code: string; type: string }[],
  formData: Record<string, unknown>,
): string[] {
  const ids: string[] = [];
  for (const f of fields) {
    if (f.type !== 'file' && f.type !== 'image') continue;
    const v = formData[f.code];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        ids.push((item as { id: string }).id);
      } else if (typeof item === 'string') {
        ids.push(item);
      }
    }
  }
  return ids;
}

function countByStatus(targets: { status: string }[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of targets) c[t.status] = (c[t.status] ?? 0) + 1;
  return c;
}
