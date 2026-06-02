import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { DictionaryService } from '../dictionary';
import { normalizeFieldDefs, parseFields, selectDictCodes } from './task-fields';
import { DispatchTaskDto, type TaskTargetInput } from './dto/dispatch-task.dto';

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
  status: string;
  assignedAt: Date | null;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
    private readonly dictionary: DictionaryService,
  ) {}

  /**
   * 派发任务:建 Task(快照 fields)+ fan-out TaskTarget + 对口路由定责任人。
   * - 个人直派 → 该人即责任人(status=assigned)
   * - 单位派发 → 查 UnitTaskRouting(本单位 + 派发部门):命中自动定责任人(assigned),否则待分派(pending)
   */
  async dispatch(dto: DispatchTaskDto, actor: ActorContext) {
    if (!actor.actorId) throw new BadRequestException('缺少操作者身份');
    const fields = normalizeFieldDefs(dto.fields);
    for (const code of selectDictCodes(fields)) {
      await this.dictionary.findByIdOrCode(code);
    }

    const targets = await this.resolveTargets(dto.targets);
    const dispatchOrgId = dto.dispatchOrgId?.trim() || null;
    if (dispatchOrgId) await this.orgs.findOne(dispatchOrgId); // 校验派发部门存在

    let dueAt: Date | null = null;
    if (dto.dueAt) {
      const d = new Date(dto.dueAt);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('截止时间格式不正确');
      dueAt = d;
    }

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
        let status = 'pending';
        if (tg.targetType === 'user') {
          ownerUserId = tg.targetUserId ?? null;
          status = 'assigned';
        } else if (dispatchOrgId && tg.targetOrgId) {
          const route = await tx.unitTaskRouting.findUnique({
            where: {
              unitOrgId_sourceOrgId: {
                unitOrgId: tg.targetOrgId,
                sourceOrgId: dispatchOrgId,
              },
            },
          });
          if (route) {
            ownerUserId = route.handlerUserId; // 对口命中:系统自动划转
            status = 'assigned';
          }
        }
        await tx.taskTarget.create({
          data: {
            taskId: t.id,
            targetType: tg.targetType,
            targetOrgId: tg.targetOrgId ?? null,
            targetUserId: tg.targetUserId ?? null,
            ownerUserId,
            status,
            assignedById: null, // null = 系统对口自动 / 个人直派;手动分派(P2)才写分派人
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

    const orgIds = targets
      .filter((t) => t.targetType === 'org' && t.targetOrgId)
      .map((t) => t.targetOrgId as string);
    const userIds = [
      ...targets.filter((t) => t.targetUserId).map((t) => t.targetUserId as string),
      ...targets.filter((t) => t.ownerUserId).map((t) => t.ownerUserId as string),
    ];
    const [orgNames, userNames] = await Promise.all([
      this.namesForOrgs(orgIds),
      this.namesForUsers(userIds),
    ]);

    const enriched = targets.map((t) => ({
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
            ? userNames[t.targetUserId]
            : '',
      ownerUserId: t.ownerUserId,
      ownerName: t.ownerUserId ? userNames[t.ownerUserId] : null,
      status: t.status,
      assignedAt: t.assignedAt,
    }));

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

  private async namesForUsers(ids: string[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const id of [...new Set(ids)]) {
      try {
        const u = await this.users.findOne(id);
        map[id] = (u as { name?: string }).name ?? id;
      } catch {
        map[id] = '(已删除用户)';
      }
    }
    return map;
  }
}

function countByStatus(targets: { status: string }[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of targets) c[t.status] = (c[t.status] ?? 0) + 1;
  return c;
}
