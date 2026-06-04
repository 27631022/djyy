import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import JSZip from 'jszip';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { StorageService } from '../storage';
import { RoleService } from '../role';
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
  confirmStatus: string;
  senderConfirm: string | null;
  receiverConfirm: string | null;
  confirmNote: string | null;
}

/** 行政机构索引(父子 + meta + 部门/虚拟标记),供「对口实时解析」「范围锚定」复用 */
interface OrgIndex {
  childrenOf: Map<string, string[]>;
  metaById: Map<string, string | null>;
  parentOf: Map<string, string | null>;
  isDeptById: Map<string, boolean>;
  isVirtualById: Map<string, boolean>;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
    private readonly storage: StorageService,
    private readonly roles: RoleService,
  ) {}

  /** 启动 20s 后跑一次「超期自动通过」(部署/重启后的补扫)。@nestjs/schedule。 */
  @Timeout(20_000)
  sweepOverdueOnBoot(): void {
    void this.autoCompleteOverdue().catch(() => undefined);
  }

  /** 每天凌晨 3 点定时跑「超期自动通过」(避开高峰)。@nestjs/schedule @Cron。 */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  sweepOverdueDaily(): void {
    void this.autoCompleteOverdue().catch(() => undefined);
  }

  /**
   * 超期自动通过:任务截止满 1 个月(dueAt + 1 月 < 现在)、回执仍停在「已提交」待审 →
   * 自动转「已通过」(回执 approved)+「已完成」(对象 done)。派发人长期未审的旧回执到期自动结案。
   * 幂等:只动 status=submitted 的回执;无截止(dueAt 空)的任务不参与。返回本次自动通过的条数。
   */
  async autoCompleteOverdue(): Promise<number> {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setMonth(threshold.getMonth() - 1); // 截止早于(现在 - 1 个月)= 超期满 1 个月
    const overdueTasks = await this.prisma.task.findMany({
      where: { dueAt: { not: null, lt: threshold } },
      select: { id: true },
    });
    if (overdueTasks.length === 0) return 0;
    const subs = await this.prisma.taskSubmission.findMany({
      where: { taskId: { in: overdueTasks.map((t) => t.id) }, status: 'submitted' },
      select: { id: true, targetId: true },
    });
    if (subs.length === 0) return 0;
    await this.prisma.taskSubmission.updateMany({
      where: { id: { in: subs.map((s) => s.id) } },
      data: {
        status: 'approved',
        reviewedAt: now,
        reviewNote: '(超过截止满 1 个月,系统自动通过)',
      },
    });
    await this.prisma.taskTarget.updateMany({
      where: { id: { in: subs.map((s) => s.targetId) }, status: 'submitted' },
      data: { status: 'done' },
    });
    await this.audit.log({ action: 'task.auto-approve.sweep', detail: { count: subs.length } });
    return subs.length;
  }

  /** 手动触发「超期自动通过」扫描(仅平台管理员);返回本次自动通过的条数。 */
  async triggerOverdueSweep(actorId: string): Promise<{ count: number }> {
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'task:manage');
    if (!isPlatformAdmin) {
      throw new ForbiddenException('仅系统管理员可手动触发超期自动通过');
    }
    const count = await this.autoCompleteOverdue();
    return { count };
  }

  /** 本模块在用的 storage fileId(通知文件 + 回执附件)—— 供孤儿文件 GC 聚合「在用集合」。 */
  async collectInUseFileIds(): Promise<string[]> {
    const [tasks, subs] = await Promise.all([
      this.prisma.task.findMany({ where: { noticeFileId: { not: null } }, select: { noticeFileId: true } }),
      this.prisma.taskSubmission.findMany({ where: { fileIds: { not: null } }, select: { fileIds: true } }),
    ]);
    const out: string[] = [];
    for (const t of tasks) if (t.noticeFileId) out.push(t.noticeFileId);
    for (const s of subs) {
      try {
        const arr: unknown = JSON.parse(s.fileIds ?? '[]');
        if (Array.isArray(arr)) for (const id of arr) if (typeof id === 'string') out.push(id);
      } catch {
        /* 坏 JSON 跳过 */
      }
    }
    return out;
  }

  /**
   * 派发任务:建 Task(快照 fields)+ fan-out TaskTarget + 对口路由定责任人。
   * - 个人直派 → 该人即责任人(status=assigned)
   * - 单位派发 → 查 UnitTaskRouting(本单位 + 派发部门):命中自动定责任人(assigned),否则待分派(pending)
   */
  async dispatch(dto: DispatchTaskDto, actor: ActorContext) {
    if (!actor.actorId) throw new BadRequestException('缺少操作者身份');
    const fields = normalizeFieldDefs(dto.fields);
    const targets = await this.resolveTargets(dto.targets);

    // 派发范围校验:非超管 / 非全平台范围时,所有对象必须落在派发人范围内(管辖单位及其下级)
    const scope = await this.resolveDispatchScope(actor.actorId);
    if (!scope.unrestricted) {
      const orgNameMap = await this.namesForOrgs(
        targets.filter((t) => t.targetType === 'org').map((t) => t.targetOrgId as string),
      );
      const outNames: string[] = [];
      for (const t of targets) {
        if (t.targetType === 'org') {
          if (!t.targetOrgId || !scope.orgIds.has(t.targetOrgId)) {
            outNames.push(orgNameMap[t.targetOrgId as string] ?? '(单位)');
          }
        } else {
          const u = await this.users.findOne(t.targetUserId as string);
          if (!u.memberships.admin.some((m) => scope.orgIds.has(m.orgId))) outNames.push(u.name);
        }
      }
      if (outNames.length) {
        throw new ForbiddenException(
          `以下派发对象超出你的派发范围(只能派给你管辖单位及其下级):${outNames.slice(0, 8).join('、')}${outNames.length > 8 ? ' 等' : ''}`,
        );
      }
    }

    const dispatchOrgId = dto.dispatchOrgId?.trim() || null;
    if (dispatchOrgId) await this.orgs.findOne(dispatchOrgId); // 校验派发部门存在

    // 派发部门 = 派发人「自己所在的机构」(部门或单位均可):没挂任何机构不能派发;派发部门只能是自己所在的机构。
    // orgIndex 顺带供下方「对口实时解析」复用。
    const orgIndex = await this.loadAdminOrgIndex();
    const actorUser = await this.users.findOne(actor.actorId);
    const myOrgIds = new Set(actorUser.memberships.admin.map((m) => m.orgId));
    if (myOrgIds.size === 0) {
      throw new ForbiddenException('你还没有被挂到任何机构,无法派发任务');
    }
    if (dispatchOrgId && !myOrgIds.has(dispatchOrgId)) {
      throw new ForbiddenException('派发部门只能是你自己所在的机构');
    }

    // 平级确认触发判定:发方是「L2 机关部门」时,派给「其他 L2 机关部门」需双方负责人确认(机关↔机关)。
    // 发给基层单位 / L3 / 个人不触发。发方负责人 = 派发部门 owner;派发人本人即负责人(或部门未设负责人)→ 发方自动通过。
    const senderIsL2Dept = this.isL2Dept(orgIndex, dispatchOrgId);
    const senderOwner = this.ownerOf(orgIndex, dispatchOrgId);
    const senderAutoApprove = !senderOwner || senderOwner === actor.actorId;

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
        let handlerOrgId: string | null = null;
        let status = 'pending';
        let confirmStatus = 'none';
        let senderConfirm: string | null = null;
        let senderConfirmById: string | null = null;
        if (tg.targetType === 'user') {
          // 直派个人:该人即责任人
          ownerUserId = tg.targetUserId ?? null;
          status = 'assigned';
        } else if (dispatchOrgId && tg.targetOrgId) {
          // 单位派发:按「组织对口上级」属性定责任部门(存一份快照;读取时实时重算)
          handlerOrgId = this.findHandlerDept(orgIndex, tg.targetOrgId, dispatchOrgId);
          // 机关↔机关:派给「其他 L2 机关部门」→ 挂起待双方负责人确认(发方可自动通过)
          if (senderIsL2Dept && this.isL2Dept(orgIndex, tg.targetOrgId) && tg.targetOrgId !== dispatchOrgId) {
            confirmStatus = 'pending';
            if (senderAutoApprove) {
              senderConfirm = 'approved';
              senderConfirmById = actor.actorId ?? null;
            }
          }
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
            confirmStatus,
            senderConfirm,
            senderConfirmById,
            ...(senderConfirm ? { confirmActedAt: new Date() } : {}),
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
    const isDeptById = new Map<string, boolean>();
    const isVirtualById = new Map<string, boolean>();
    for (const o of orgRows) {
      metaById.set(o.id, o.meta ?? null);
      parentOf.set(o.id, o.parentId ?? null);
      isDeptById.set(o.id, !!o.isDept);
      isVirtualById.set(o.id, !!o.isVirtual);
      if (o.parentId) {
        const arr = childrenOf.get(o.parentId) ?? [];
        arr.push(o.id);
        childrenOf.set(o.parentId, arr);
      }
    }
    return { childrenOf, metaById, parentOf, isDeptById, isVirtualById };
  }

  /**
   * 从某机构往上找它的「所在单位」= 最近的「非部门、非虚拟」祖先(含自身)。
   * 用于 subtree/own 范围锚定:派发人即便挂在部门(如「综合办公室」)上,也自动按其所属
   * 真实单位(如「塔运司」)的子树授权 —— 单位本身则锚自己。找不到真实单位则兜底用自身。
   */
  private owningUnitOf(index: OrgIndex, orgId: string): string {
    let cur: string | null = orgId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const isDept = index.isDeptById.get(cur) ?? false;
      const isVirtual = index.isVirtualById.get(cur) ?? false;
      if (!isDept && !isVirtual) return cur; // 命中真实单位
      cur = index.parentOf.get(cur) ?? null;
    }
    return orgId;
  }

  /* ─── 组织树「结构层级」判定(不依赖不可靠的 type 字段)──────────────
     虚拟壳(公司机关/基层单位)= L1;壳的直接下级 = L2(isDept→机关部门 / 否→基层单位);
     基层单位的下级 = L3;再下/人员 = L4。 */

  /** 顶层虚拟壳(公司机关/基层单位):虚拟 + 父非虚拟(直接挂在公司根下)。 */
  private isWrapper(index: OrgIndex, id: string): boolean {
    if (!index.isVirtualById.get(id)) return false;
    const p = index.parentOf.get(id) ?? null;
    return p === null || !index.isVirtualById.get(p);
  }

  /** L2 节点(机关部门 / 基层单位):非虚拟 + 父是虚拟壳。 */
  private isL2(index: OrgIndex, id: string): boolean {
    if (index.isVirtualById.get(id)) return false;
    const p = index.parentOf.get(id) ?? null;
    return !!p && this.isWrapper(index, p);
  }

  /** 所有 L2 单位(机关部门 + 基层单位)。 */
  private allL2(index: OrgIndex): string[] {
    const out: string[] = [];
    for (const id of index.parentOf.keys()) if (this.isL2(index, id)) out.push(id);
    return out;
  }

  /** 从某节点往上找它的 L2 祖先(含自身);无则 null。 */
  private l2AncestorOf(index: OrgIndex, id: string): string | null {
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (this.isL2(index, cur)) return cur;
      cur = index.parentOf.get(cur) ?? null;
    }
    return null;
  }

  /**
   * 解析派发人的「可派发范围」(单位 id 集合),按组织树「结构层级」算(不依赖 type 字段):
   *   - platform_admin / scope=all → 不限范围
   *   - L2 派发人(机关部门 / 基层单位)→ 规则A:所有其他 L2 单位(机关部门 + 基层单位),不含 L3
   *   - L3 及更深派发人 → 规则B:本「二级单位」下的其他直接下级(同级 L3)
   *   - custom → 显式锚点单位可选;self → 无范围
   * 末了排除派发人自己所在的节点(只发给「其他」单位/部门)。
   */
  private async resolveDispatchScope(
    actorId: string,
  ): Promise<{ unrestricted: boolean; orgIds: Set<string> }> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      actorId,
      'task:manage',
    );
    if (isPlatformAdmin || entries.some((e) => e.scope === 'all')) {
      return { unrestricted: true, orgIds: new Set() };
    }
    const index = await this.loadAdminOrgIndex();
    const orgIds = new Set<string>();
    // custom:显式锚点单位直接可选
    for (const e of entries) {
      if (e.scope === 'custom') for (const id of e.orgIds) orgIds.add(id);
    }
    // own/subtree:按派发人所在节点的「结构层级」给可见范围(规则 A / B)
    if (entries.some((e) => e.scope === 'own' || e.scope === 'subtree')) {
      const me = await this.users.findOne(actorId);
      const homes = me.memberships.admin.map((m) => m.orgId);
      for (const home of homes) {
        if (this.isL2(index, home)) {
          // 规则A:L2 派发人 → 所有 L2 单位(机关部门 + 基层单位)
          for (const id of this.allL2(index)) orgIds.add(id);
        } else {
          // 规则B:L3/更深派发人 → 本「二级单位」下的其他直接下级(同级 L3)
          const l2 = this.l2AncestorOf(index, home);
          if (l2) {
            for (const c of index.childrenOf.get(l2) ?? []) {
              if (!index.isVirtualById.get(c)) orgIds.add(c);
            }
          }
        }
      }
      // 只发给「其他」单位/部门 → 排除派发人自己所在的节点
      for (const home of homes) orgIds.delete(home);
    }
    return { unrestricted: false, orgIds };
  }

  /**
   * 派发范围(给前端「派发对象」选择器过滤用):
   *  - orgIds:可派发的「单位」(规则 A/B);
   *  - selfOrgIds:派发人「本单位/本部门」子树(给「个人」tab 过滤 = 规则 C:只能选本单位的人)。
   */
  async getDispatchScope(actorId: string) {
    const s = await this.resolveDispatchScope(actorId);
    let selfOrgIds: string[] = [];
    if (!s.unrestricted) {
      const me = await this.users.findOne(actorId);
      const index = await this.loadAdminOrgIndex();
      const area = new Set<string>();
      for (const m of me.memberships.admin) {
        const stack = [m.orgId];
        while (stack.length) {
          const id = stack.pop() as string;
          if (area.has(id)) continue;
          area.add(id);
          for (const c of index.childrenOf.get(id) ?? []) stack.push(c);
        }
      }
      selfOrgIds = [...area];
    }
    return { unrestricted: s.unrestricted, orgIds: [...s.orgIds], selfOrgIds };
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
          const parsed = JSON.parse(meta) as {
            counterpartParentOrgIds?: unknown;
            counterpartParentOrgId?: unknown;
          };
          const cp = parsed.counterpartParentOrgIds;
          if (Array.isArray(cp) && cp.includes(sourceId)) return id;
          // 兼容早期单值键 counterpartParentOrgId(前端已迁数组,但老数据可能还在)
          if (
            typeof parsed.counterpartParentOrgId === 'string' &&
            parsed.counterpartParentOrgId === sourceId
          ) {
            return id;
          }
        } catch {
          /* 忽略坏 meta */
        }
      }
      for (const c of index.childrenOf.get(id) ?? []) stack.push(c);
    }
    return null;
  }

  /** 读某机构在 meta 里登记的「部门负责人」userId(平级确认用);无则 null。 */
  private ownerOf(index: OrgIndex, orgId: string | null | undefined): string | null {
    if (!orgId) return null;
    const meta = index.metaById.get(orgId);
    if (!meta) return null;
    try {
      const parsed = JSON.parse(meta) as { ownerUserId?: unknown };
      return typeof parsed.ownerUserId === 'string' && parsed.ownerUserId
        ? parsed.ownerUserId
        : null;
    } catch {
      return null;
    }
  }

  /** 是否「L2 机关部门」(平级确认触发判定:机关↔机关 互派才需确认)。 */
  private isL2Dept(index: OrgIndex, id: string | null | undefined): boolean {
    if (!id) return false;
    return this.isL2(index, id) && (index.isDeptById.get(id) ?? false);
  }

  /** orgId 是否落在 actor 所在机构(任一 membership)的子树内(含自身)= 「所在部门及其下级」。 */
  private orgInActorArea(
    index: OrgIndex,
    membershipOrgIds: Iterable<string>,
    orgId: string,
  ): boolean {
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
        seriesId: t.seriesId,
        periodLabel: t.periodLabel,
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

    // 平级确认的双方负责人(发方 = 派发部门 owner,收方 = 各目标部门 owner)—— 供详情显示「待谁确认」
    const senderOwnerId = this.ownerOf(orgIndex, task.dispatchOrgId);
    const receiverOwnerByTarget = new Map<string, string | null>();
    for (const t of targets) {
      receiverOwnerByTarget.set(
        t.id,
        t.targetType === 'org' ? this.ownerOf(orgIndex, t.targetOrgId) : null,
      );
    }

    const orgIds = [
      ...targets
        .filter((t) => t.targetType === 'org' && t.targetOrgId)
        .map((t) => t.targetOrgId as string),
      ...[...liveHandler.values()].filter((x): x is string => !!x),
      ...(task.dispatchOrgId ? [task.dispatchOrgId] : []),
    ];
    const userIds = [
      ...targets.filter((t) => t.targetUserId).map((t) => t.targetUserId as string),
      ...targets.filter((t) => t.ownerUserId).map((t) => t.ownerUserId as string),
      ...(senderOwnerId ? [senderOwnerId] : []),
      ...[...receiverOwnerByTarget.values()].filter((x): x is string => !!x),
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
        // 平级确认(P2):confirmStatus + 双方负责人决定 + 负责人姓名(供详情显示「待 xx 确认」)
        confirmStatus: t.confirmStatus,
        senderConfirm: t.senderConfirm,
        receiverConfirm: t.receiverConfirm,
        confirmNote: t.confirmNote,
        senderOwnerName: senderOwnerId ? userInfo[senderOwnerId]?.name ?? null : null,
        receiverOwnerName: (() => {
          const rid = receiverOwnerByTarget.get(t.id) ?? null;
          return rid ? userInfo[rid]?.name ?? null : null;
        })(),
      };
    });

    // 周期系列:同系列各期(供期次切换);非周期任务为空
    const siblings = task.seriesId
      ? (
          await this.prisma.task.findMany({
            where: { seriesId: task.seriesId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, periodLabel: true, createdAt: true, dueAt: true },
          })
        ).map((s) => ({
          id: s.id,
          periodLabel: s.periodLabel,
          createdAt: s.createdAt,
          dueAt: s.dueAt,
          current: s.id === task.id,
        }))
      : [];

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
      dispatchOrgName: task.dispatchOrgId ? orgNames[task.dispatchOrgId] ?? null : null,
      seriesId: task.seriesId,
      periodLabel: task.periodLabel,
      siblings,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      targets: enriched,
      statusCounts: countByStatus(targets),
    };
  }

  /**
   * 我的待办(接收侧)：我负责的(ownerUserId==我)+ 我可接收的「待接收」的:
   * - 配了对口 → handlerOrgId∈我的行政归属(只有责任部门成员可见)
   * - 未配对口 → handlerOrgId 空 + targetOrgId == 我「所属单位」= 本单位全员可见可认领(不含上级/全公司)
   */
  async inbox(actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const me = await this.users.findOne(actorId);
    const myOrgIds = me.memberships.admin.map((m) => m.orgId);
    const myOrgSet = new Set(myOrgIds);
    const index = await this.loadAdminOrgIndex();
    // 指派权限(task:reception):有此权限者可对「所在部门(及其下级)」的待接收任务做指派
    const reception = await this.roles.getScopesForPermission(actorId, 'task:reception');
    const hasReception = reception.isPlatformAdmin || reception.entries.length > 0;
    const assignAnywhere = reception.isPlatformAdmin;
    // 候选范围:我所在部门 + 它们的所有祖先(任务派到这些上级单位时,我可能是其下「对口责任部门」,要捞到)
    const myUnits = new Set<string>(myOrgIds);
    for (const d of myOrgIds) for (const a of this.ancestorsOf(index, d)) myUnits.add(a);
    // 「我所属单位」= 我所在节点 + 各自上提到的所属单位(部门→所属真实单位)。
    // 未配对口的「全单位可认领」只在任务派到「我所属单位」时可见 —— 不含更上级/全公司单位,
    // 否则深层成员(如特车运输大队的人)会被塔运司/基层单位/全公司的任务淹没。
    const myOwnUnits = new Set<string>(myOrgIds);
    for (const d of myOrgIds) myOwnUnits.add(this.owningUnitOf(index, d));

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

    // 实时解析每个候选的责任部门:配了对口 → 仅该部门成员可见;未配对口 → 整单位全员可见可认领
    const rows: {
      t: (typeof candidates)[number];
      task: (typeof tasksList)[number];
      handlerOrgId: string | null;
    }[] = [];
    for (const t of candidates) {
      const task = taskById.get(t.taskId);
      if (!task) continue;
      // 平级确认未通过(待双方确认 / 被驳回)→ 不进任何人的待办,直到双方负责人通过
      if (t.confirmStatus === 'pending' || t.confirmStatus === 'rejected') continue;
      const handlerOrgId =
        t.targetType === 'org' && t.targetOrgId && task.dispatchOrgId
          ? this.findHandlerDept(index, t.targetOrgId, task.dispatchOrgId)
          : null;
      if (t.ownerUserId !== actorId) {
        if (handlerOrgId) {
          if (!myOrgSet.has(handlerOrgId)) continue; // 配了对口、但责任部门不是我 → 不可见
        } else if (!t.targetOrgId || !myOwnUnits.has(t.targetOrgId)) {
          continue; // 未配对口:只有派到「我所属单位」才可见(不含上级/全公司单位)
        }
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

    return rows.map(({ t, task, handlerOrgId }) => {
      const claimable = !t.ownerUserId && t.status !== 'done';
      // 承办部门 = 对口责任部门 / 否则目标单位本身;有 task:reception 权限 + 该部门在我所在区域 → 可「指派」
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
        dispatchOrgName: task.dispatchOrgId ? orgNames[task.dispatchOrgId] ?? null : null,
        targetOrgName: t.targetOrgId ? orgNames[t.targetOrgId] ?? null : null,
        handlerOrgName: handlerOrgId ? orgNames[handlerOrgId] ?? null : null,
        canAssign,
        assignOrgId: canAssign ? responsibleDept : null,
        assignOrgName: canAssign && responsibleDept ? orgNames[responsibleDept] ?? null : null,
        fieldCount: parseFields(task.fields).length,
        createdAt: task.createdAt,
      };
    });
  }

  /** 接收(认领):未被接收 + 我是责任部门成员 → 成为责任人(转填报中)。 */
  async claim(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId) throw new BadRequestException('该任务已被接收');
    if (target.confirmStatus === 'pending') {
      throw new BadRequestException('该派发对象正在等待双方部门负责人确认,暂不能接收');
    }
    if (target.confirmStatus === 'rejected') {
      throw new BadRequestException('该派发对象已被驳回,无法接收');
    }

    const me = await this.users.findOne(actorId);
    const myOrgIds = new Set(me.memberships.admin.map((m) => m.orgId));
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    const index = await this.loadAdminOrgIndex();
    // 实时解析责任部门:配了对口 → 必须是该部门成员;未配对口 → 整单位子树成员皆可认领
    const deptHandler =
      task?.dispatchOrgId && target.targetOrgId
        ? this.findHandlerDept(index, target.targetOrgId, task.dispatchOrgId)
        : null;
    let handlerOrgId: string | null;
    if (deptHandler) {
      if (!myOrgIds.has(deptHandler)) {
        throw new ForbiddenException('你不在该任务的责任部门,无法接收');
      }
      handlerOrgId = deptHandler;
    } else {
      // 未配对口:只能认领「派到我所属单位」的任务(我所在节点,或其上提到的所属单位),不含上级单位
      const myOwnUnits = new Set<string>([...myOrgIds]);
      for (const d of myOrgIds) myOwnUnits.add(this.owningUnitOf(index, d));
      if (!target.targetOrgId || !myOwnUnits.has(target.targetOrgId)) {
        throw new ForbiddenException('该任务不是派给你所属单位的,无法接收');
      }
      // 责任部门记为我「所属单位 == 目标单位」的那个归属部门(便于显示;取首个匹配)
      handlerOrgId =
        [...myOrgIds].find(
          (d) => d === target.targetOrgId || this.owningUnitOf(index, d) === target.targetOrgId,
        ) ?? null;
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

  /**
   * 指派承办人(承办部门负责人侧):把某「待接收」对象直接指定给本部门成员承办。
   * 授权 = 我是该承办部门负责人(meta.ownerUserId)或 platform_admin;承办人必须是该部门成员。
   * 指派后该成员即责任人(in_progress)。与成员自助认领二选一。
   */
  async assign(targetId: string, dto: { userId: string }, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const userId = dto.userId?.trim();
    if (!userId) throw new BadRequestException('请选择承办人');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId) throw new BadRequestException('该任务已被接收或指派');
    if (target.confirmStatus === 'pending') {
      throw new BadRequestException('该派发对象正在等待双方部门负责人确认,暂不能指派');
    }
    if (target.confirmStatus === 'rejected') {
      throw new BadRequestException('该派发对象已被驳回,无法指派');
    }

    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    const index = await this.loadAdminOrgIndex();
    // 承办部门 = 对口责任部门(配了对口)/ 否则目标单位本身(机关↔机关即收方部门)
    const handler =
      task?.dispatchOrgId && target.targetOrgId
        ? this.findHandlerDept(index, target.targetOrgId, task.dispatchOrgId)
        : null;
    const responsibleDept = handler ?? target.targetOrgId ?? null;
    if (!responsibleDept) throw new BadRequestException('该任务无法定位承办部门');

    // 指派权限 = task:reception(原计划「任务接收管理(分派/对口)」);有此权限者可对
    // 「自己所在部门(及其下级)」的任务做指派。platform_admin 直通。
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      actorId,
      'task:reception',
    );
    if (!isPlatformAdmin && entries.length === 0) {
      throw new ForbiddenException('你没有「任务接收管理(指派)」权限,无法指派承办人');
    }
    if (!isPlatformAdmin) {
      const actor2 = await this.users.findOne(actorId);
      const myOrgIds = actor2.memberships.admin.map((m) => m.orgId);
      if (!this.orgInActorArea(index, myOrgIds, responsibleDept)) {
        throw new ForbiddenException('只能指派你所在部门(及其下级)的任务');
      }
    }
    // 承办人必须是承办部门成员(前端选择器也只列该部门成员)
    const assignee = await this.users.findOne(userId);
    if (!assignee.memberships.admin.some((m) => m.orgId === responsibleDept)) {
      throw new BadRequestException('承办人必须是该承办部门的成员');
    }

    const updated = await this.prisma.taskTarget.update({
      where: { id: targetId },
      data: {
        ownerUserId: userId,
        handlerOrgId: responsibleDept,
        status: 'in_progress',
        assignedById: actorId,
        assignedAt: new Date(),
      },
    });
    await this.audit.log({
      ...actor,
      action: 'task.assign',
      target: targetId,
      detail: { taskId: target.taskId, assigneeId: userId, responsibleDept },
    });
    return { ok: true, status: updated.status };
  }

  /**
   * 平级确认队列(部门负责人侧):列出「待我确认」的跨部门(机关↔机关)派发对象。
   * 我是发方部门负责人且发方未决,或我是收方部门负责人且收方未决 → 进队列。
   */
  async confirmQueue(actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const pend = await this.prisma.taskTarget.findMany({
      where: { confirmStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pend.length === 0) return [];
    const index = await this.loadAdminOrgIndex();
    const tasksList = await this.prisma.task.findMany({
      where: { id: { in: [...new Set(pend.map((t) => t.taskId))] } },
    });
    const taskById = new Map(tasksList.map((t) => [t.id, t]));

    const rows: {
      t: (typeof pend)[number];
      task: (typeof tasksList)[number];
      asSender: boolean;
      asReceiver: boolean;
    }[] = [];
    for (const t of pend) {
      const task = taskById.get(t.taskId);
      if (!task) continue;
      const senderOwner = this.ownerOf(index, task.dispatchOrgId);
      const receiverOwner = this.ownerOf(index, t.targetOrgId);
      const asSender = senderOwner === actorId && !t.senderConfirm;
      const asReceiver = receiverOwner === actorId && !t.receiverConfirm;
      if (!asSender && !asReceiver) continue;
      rows.push({ t, task, asSender, asReceiver });
    }
    if (rows.length === 0) return [];

    const orgNames = await this.namesForOrgs(
      rows.flatMap((r) => [r.task.dispatchOrgId, r.t.targetOrgId]).filter((x): x is string => !!x),
    );
    const userInfo = await this.infoForUsers(
      rows.map((r) => r.task.dispatchUserId).filter((x): x is string => !!x),
    );

    return rows.map(({ t, task, asSender, asReceiver }) => ({
      targetId: t.id,
      taskId: task.id,
      title: task.title,
      dueAt: task.dueAt,
      dispatchUserName: userInfo[task.dispatchUserId]?.name ?? null,
      dispatchOrgName: task.dispatchOrgId ? orgNames[task.dispatchOrgId] ?? null : null,
      targetOrgName: t.targetOrgId ? orgNames[t.targetOrgId] ?? null : null,
      // 我以哪一方身份确认(同时是两方时极少,以 receiver 优先显示)
      side: asReceiver ? 'receiver' : 'sender',
      asSender,
      asReceiver,
      // 对方进度(让我知道另一方是否已同意)
      senderConfirm: t.senderConfirm,
      receiverConfirm: t.receiverConfirm,
      fieldCount: parseFields(task.fields).length,
      createdAt: task.createdAt,
    }));
  }

  /**
   * 平级确认决定(部门负责人侧):approve / reject。
   * 我对「我作为负责人且未决」的一方做出决定;双方都 approved → confirmStatus=approved(激活,进收方待办);
   * 任一方 reject → confirmStatus=rejected(该对象作废,不影响同任务其他对象)。
   * platform_admin 可代任一未决方推动(避免负责人未设导致死锁)。
   */
  async confirmTarget(
    targetId: string,
    dto: { decision: 'approve' | 'reject'; note?: string },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.confirmStatus !== 'pending') {
      throw new BadRequestException('该派发对象无需确认或已处理');
    }
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');

    const index = await this.loadAdminOrgIndex();
    const senderOwner = this.ownerOf(index, task.dispatchOrgId);
    const receiverOwner = this.ownerOf(index, target.targetOrgId);
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'task:manage');

    const isReject = dto.decision === 'reject';
    const note = dto.note?.trim() || null;
    if (isReject && !note) throw new BadRequestException('驳回必须填写原因');
    const decision = isReject ? 'rejected' : 'approved';

    const data: {
      senderConfirm?: string;
      senderConfirmById?: string;
      receiverConfirm?: string;
      receiverConfirmById?: string;
      confirmStatus?: string;
      confirmNote?: string | null;
      confirmActedAt?: Date;
    } = {};
    let acted = false;
    if ((actorId === senderOwner || isPlatformAdmin) && !target.senderConfirm) {
      data.senderConfirm = decision;
      data.senderConfirmById = actorId;
      acted = true;
    }
    if ((actorId === receiverOwner || isPlatformAdmin) && !target.receiverConfirm) {
      data.receiverConfirm = decision;
      data.receiverConfirmById = actorId;
      acted = true;
    }
    if (!acted) {
      throw new ForbiddenException('你不是该任务相关部门的负责人,无法确认');
    }

    const sc = data.senderConfirm ?? target.senderConfirm;
    const rc = data.receiverConfirm ?? target.receiverConfirm;
    let confirmStatus = 'pending';
    if (sc === 'rejected' || rc === 'rejected') confirmStatus = 'rejected';
    else if (sc === 'approved' && rc === 'approved') confirmStatus = 'approved';
    data.confirmStatus = confirmStatus;
    data.confirmActedAt = new Date();
    if (isReject) data.confirmNote = note;

    await this.prisma.taskTarget.update({ where: { id: targetId }, data });
    await this.audit.log({
      ...actor,
      action: isReject ? 'task.peer-confirm.reject' : 'task.peer-confirm.approve',
      target: targetId,
      detail: { taskId: target.taskId, confirmStatus, note },
    });
    return { ok: true, confirmStatus };
  }

  /**
   * 重新发起(派发人侧):被驳回的跨部门派发对象重置回「待确认」,再走一遍双方确认。
   * 发方按规则自动通过(派发人即发方负责人 / 发方部门未设负责人),收方重新待确认;清掉上次驳回原因。
   * 只有任务派发人可重新发起;只能对「已驳回」的对象操作。
   */
  async reinitiateConfirm(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以重新发起');
    }
    if (target.confirmStatus !== 'rejected') {
      throw new BadRequestException('只有「已驳回」的派发对象可以重新发起');
    }

    const index = await this.loadAdminOrgIndex();
    const senderOwner = this.ownerOf(index, task.dispatchOrgId);
    const senderAutoApprove = !senderOwner || senderOwner === actorId;

    await this.prisma.taskTarget.update({
      where: { id: targetId },
      data: {
        confirmStatus: 'pending',
        senderConfirm: senderAutoApprove ? 'approved' : null,
        senderConfirmById: senderAutoApprove ? actorId : null,
        receiverConfirm: null,
        receiverConfirmById: null,
        confirmNote: null,
        confirmActedAt: senderAutoApprove ? new Date() : null,
      },
    });
    await this.audit.log({
      ...actor,
      action: 'task.peer-confirm.reinitiate',
      target: targetId,
      detail: { taskId: target.taskId },
    });
    return this.get(target.taskId);
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
    const subStatus = submission?.status ?? 'draft';
    // 提交即锁定:已提交 / 已通过不可编辑(退回后回到可编辑)
    const editable = subStatus !== 'submitted' && subStatus !== 'approved';

    // 往期填报(同系列、同单位的历史回看,只读;最多近 6 期)
    let history: {
      taskId: string;
      periodLabel: string | null;
      submittedAt: Date | null;
      formData: Record<string, unknown>;
    }[] = [];
    if (task.seriesId) {
      const siblings = await this.prisma.task.findMany({
        where: { seriesId: task.seriesId, id: { not: task.id } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });
      if (siblings.length) {
        const unitWhere =
          target.targetType === 'org'
            ? { targetOrgId: target.targetOrgId }
            : { targetUserId: target.targetUserId };
        const sibTargets = await this.prisma.taskTarget.findMany({
          where: { taskId: { in: siblings.map((s) => s.id) }, ...unitWhere },
        });
        const tgtByTask = new Map(sibTargets.map((t) => [t.taskId, t]));
        const sibSubs = await this.prisma.taskSubmission.findMany({
          where: {
            targetId: { in: sibTargets.map((t) => t.id) },
            status: { in: ['submitted', 'approved'] },
          },
        });
        const subByTgt = new Map(sibSubs.map((s) => [s.targetId, s]));
        history = siblings
          .map((s) => {
            const tg = tgtByTask.get(s.id);
            const sub = tg ? subByTgt.get(tg.id) : undefined;
            return sub
              ? {
                  taskId: s.id,
                  periodLabel: s.periodLabel,
                  submittedAt: sub.submittedAt,
                  formData: safeJson(sub.formData),
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
      }
    }

    // 派发部门 + 派发人(姓名/电话)—— 填报页标题下展示,便于基层向上咨询
    const [dispatchOrgNameMap, dispatchUserInfo] = await Promise.all([
      task.dispatchOrgId ? this.namesForOrgs([task.dispatchOrgId]) : Promise.resolve({}),
      this.infoForUsers([task.dispatchUserId]),
    ]);

    return {
      targetId,
      taskId: task.id,
      taskTitle: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      periodLabel: task.periodLabel,
      seriesId: task.seriesId,
      fields: parseFields(task.fields),
      targetStatus: target.status,
      editable,
      // 派发来源(便于基层咨询)
      dispatchOrgName: task.dispatchOrgId ? dispatchOrgNameMap[task.dispatchOrgId] ?? null : null,
      dispatchUserName: dispatchUserInfo[task.dispatchUserId]?.name ?? null,
      dispatchUserPhone: dispatchUserInfo[task.dispatchUserId]?.phone ?? null,
      submission: {
        formData: submission ? safeJson(submission.formData) : {},
        status: subStatus,
        reviewNote: submission?.reviewNote ?? null,
        submittedAt: submission?.submittedAt ?? null,
        returnCount: submission?.returnCount ?? 0,
      },
      history,
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

    // 提交即锁定:已提交 / 已通过的回执不可再改,必须派发人退回后才能编辑
    const existing = await this.prisma.taskSubmission.findUnique({ where: { targetId } });
    if (existing && (existing.status === 'submitted' || existing.status === 'approved')) {
      throw new BadRequestException(
        '该任务已提交,正在等待审核;如需修改请联系派发人退回后再改',
      );
    }

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

  /**
   * 审核:派发人查看某派发对象的回执(填报内容 + 责任人 + 字段元数据)。
   * 只有任务派发人可看(回执含部门上报数据,不对无关人开放)。
   */
  async getSubmission(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以查看回执');
    }
    const submission = await this.prisma.taskSubmission.findUnique({ where: { targetId } });

    const orgIds = [target.targetOrgId, target.handlerOrgId].filter(
      (x): x is string => !!x,
    );
    const userIds = [target.ownerUserId, target.targetUserId].filter(
      (x): x is string => !!x,
    );
    const [orgNames, userInfo] = await Promise.all([
      this.namesForOrgs(orgIds),
      this.infoForUsers(userIds),
    ]);

    return {
      targetId,
      taskId: task.id,
      taskTitle: task.title,
      fields: parseFields(task.fields),
      targetType: target.targetType,
      targetName:
        target.targetType === 'org'
          ? target.targetOrgId
            ? orgNames[target.targetOrgId]
            : ''
          : target.targetUserId
            ? userInfo[target.targetUserId]?.name ?? ''
            : '',
      ownerName: target.ownerUserId ? userInfo[target.ownerUserId]?.name ?? null : null,
      ownerPhone: target.ownerUserId ? userInfo[target.ownerUserId]?.phone ?? null : null,
      handlerOrgName: target.handlerOrgId ? orgNames[target.handlerOrgId] ?? null : null,
      targetStatus: target.status,
      submission: submission
        ? {
            formData: safeJson(submission.formData),
            status: submission.status,
            reviewNote: submission.reviewNote,
            submittedAt: submission.submittedAt,
            reviewedAt: submission.reviewedAt,
            returnCount: submission.returnCount,
          }
        : null,
    };
  }

  /**
   * 审核:通过(approve → done)/ 退回重填(return → returned + 退回原因)。
   * 只有任务派发人可审;只能审「已提交」的回执。退回后责任人填报页显示退回原因、可改后再交。
   */
  async review(
    targetId: string,
    dto: { decision: 'approve' | 'return'; note?: string },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.taskTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    const task = await this.prisma.task.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以审核');
    }
    if (target.status !== 'submitted') {
      throw new BadRequestException('只有「已提交」的回执可以审核');
    }
    const submission = await this.prisma.taskSubmission.findUnique({ where: { targetId } });
    if (!submission) throw new BadRequestException('该派发对象尚无回执');

    const isReturn = dto.decision === 'return';
    const note = dto.note?.trim() || null;
    if (isReturn && !note) throw new BadRequestException('退回必须填写退回原因');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.taskSubmission.update({
        where: { targetId },
        data: {
          status: isReturn ? 'returned' : 'approved',
          reviewNote: note,
          reviewedById: actorId,
          reviewedAt: now,
          // 退回累计 +1(画像考核用);通过不动计数
          ...(isReturn ? { returnCount: { increment: 1 } } : {}),
        },
      }),
      this.prisma.taskTarget.update({
        where: { id: targetId },
        data: { status: isReturn ? 'returned' : 'done' },
      }),
    ]);

    await this.audit.log({
      ...actor,
      action: isReturn ? 'task.return' : 'task.approve',
      target: targetId,
      detail: { taskId: target.taskId, note },
    });
    return { ok: true, status: isReturn ? 'returned' : 'done' };
  }

  /**
   * 汇总(派发人侧):按 taskId 捞全部派发对象 + 回执,一行一对象。
   * 数字字段程序内求和(只统计「已提交 / 已通过」的回执),file/image 收集附件引用。
   * 只有任务派发人可看。org 量级几十~几百,直接内存聚合(非 SQL,见 CLAUDE.md 汇总备忘)。
   */
  async getSummary(taskId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以查看汇总');
    }
    const fields = parseFields(task.fields);
    const targets = await this.prisma.taskTarget.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    const submissions = await this.prisma.taskSubmission.findMany({ where: { taskId } });
    const subByTarget = new Map(submissions.map((s) => [s.targetId, s]));

    const orgIds = targets
      .filter((t) => t.targetType === 'org' && t.targetOrgId)
      .map((t) => t.targetOrgId as string);
    const userIds = [
      ...targets.filter((t) => t.targetUserId).map((t) => t.targetUserId as string),
      ...targets.filter((t) => t.ownerUserId).map((t) => t.ownerUserId as string),
    ];
    const [orgNames, userInfo] = await Promise.all([
      this.namesForOrgs(orgIds),
      this.infoForUsers(userIds),
    ]);

    const rows = targets.map((t) => {
      const sub = subByTarget.get(t.id);
      return {
        targetId: t.id,
        targetType: t.targetType,
        targetName:
          t.targetType === 'org'
            ? t.targetOrgId
              ? orgNames[t.targetOrgId]
              : ''
            : t.targetUserId
              ? userInfo[t.targetUserId]?.name ?? ''
              : '',
        ownerName: t.ownerUserId ? userInfo[t.ownerUserId]?.name ?? null : null,
        ownerPhone: t.ownerUserId ? userInfo[t.ownerUserId]?.phone ?? null : null,
        status: t.status,
        submissionStatus: sub?.status ?? null,
        submittedAt: sub?.submittedAt ?? null,
        values: sub ? safeJson(sub.formData) : {},
      };
    });

    const isFilled = (s: string | null) => s === 'submitted' || s === 'approved';

    // 数字字段合计(只算已提交 / 已通过的回执)
    const numberTotals: Record<
      string,
      { sum: number; count: number; decimals: number; unit: string | null }
    > = {};
    for (const f of fields) {
      if (f.type !== 'number') continue;
      let sum = 0;
      let count = 0;
      for (const r of rows) {
        if (!isFilled(r.submissionStatus)) continue;
        const raw = r.values[f.code];
        const n =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : NaN;
        if (!Number.isNaN(n)) {
          sum += n;
          count++;
        }
      }
      numberTotals[f.code] = { sum, count, decimals: f.decimals ?? 0, unit: f.unit ?? null };
    }

    const filledCount = rows.filter((r) => isFilled(r.submissionStatus)).length;
    return {
      taskId: task.id,
      title: task.title,
      dueAt: task.dueAt,
      periodLabel: task.periodLabel,
      seriesId: task.seriesId,
      fields,
      rows,
      numberTotals,
      counts: { total: rows.length, filled: filledCount, unfilled: rows.length - filledCount },
    };
  }

  /**
   * 附件批量打包(派发人侧):把所有 file/image 字段的附件收进一个 ZIP(扁平,不分文件夹)。
   * 命名 = 「{单位序号}-{单位(部门)名称}-{字段名}({同字段多文件时跟序号}).扩展名」,按单位序号排序;
   * 单位序号 = 各单位按中文名排序后的位次(补零,保证按文件名排序即单位顺序)。
   * 只收「已提交 / 已通过」的回执;读不到的文件跳过不阻断整包。
   */
  async getAttachmentsZip(
    taskId: string,
    actor: ActorContext,
  ): Promise<{ buffer: Buffer; filename: string; count: number }> {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以下载附件');
    }
    const fields = parseFields(task.fields);
    const fileFields = fields.filter((f) => f.type === 'file' || f.type === 'image');
    if (fileFields.length === 0) throw new BadRequestException('该任务没有附件类字段');

    const targets = await this.prisma.taskTarget.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    const submissions = await this.prisma.taskSubmission.findMany({ where: { taskId } });
    const subByTarget = new Map(submissions.map((s) => [s.targetId, s]));

    const orgIds = targets
      .filter((t) => t.targetType === 'org' && t.targetOrgId)
      .map((t) => t.targetOrgId as string);
    const userIds = targets
      .filter((t) => t.targetUserId)
      .map((t) => t.targetUserId as string);
    const [orgNames, userInfo] = await Promise.all([
      this.namesForOrgs(orgIds),
      this.infoForUsers(userIds),
    ]);

    // 收集 {单位, 字段, fileId, 原文件名},只取已提交 / 已通过
    const items: { unit: string; field: string; fileId: string; fileName: string }[] = [];
    for (const t of targets) {
      const sub = subByTarget.get(t.id);
      if (!sub || (sub.status !== 'submitted' && sub.status !== 'approved')) continue;
      const data = safeJson(sub.formData);
      const unit =
        (t.targetType === 'org'
          ? t.targetOrgId
            ? orgNames[t.targetOrgId]
            : ''
          : t.targetUserId
            ? userInfo[t.targetUserId]?.name ?? ''
            : '') || '未命名单位';
      for (const f of fileFields) {
        const v = data[f.code];
        if (!Array.isArray(v)) continue;
        for (const it of v) {
          const id =
            it && typeof it === 'object' ? (it as { id?: unknown }).id : it;
          const nm =
            it && typeof it === 'object' ? (it as { name?: unknown }).name : undefined;
          if (typeof id === 'string') {
            items.push({
              unit,
              field: f.label,
              fileId: id,
              fileName: typeof nm === 'string' && nm ? nm : '文件',
            });
          }
        }
      }
    }
    if (items.length === 0) throw new BadRequestException('暂无已提交的附件可下载');

    // 单位按名排序(中文)→ 每个单位编序号(补零);同「单位+字段」多文件时文件名末尾再跟序号
    const units = [...new Set(items.map((i) => i.unit))].sort((a, b) =>
      a.localeCompare(b, 'zh-Hans-CN'),
    );
    const unitNo = new Map(units.map((u, i) => [u, i + 1]));
    const unitPad = String(units.length).length;
    const groupKey = (it: { unit: string; field: string }) => `${it.unit} ${it.field}`;
    const groupTotal = new Map<string, number>();
    for (const it of items) {
      groupTotal.set(groupKey(it), (groupTotal.get(groupKey(it)) ?? 0) + 1);
    }
    // 排序:先单位序号,再字段名(同组文件保持原顺序)
    items.sort(
      (a, b) =>
        (unitNo.get(a.unit) ?? 0) - (unitNo.get(b.unit) ?? 0) ||
        a.field.localeCompare(b.field, 'zh-Hans-CN'),
    );

    // 扁平命名:「序号-单位(部门)名称-字段名(多文件跟序号).扩展名」
    const zip = new JSZip();
    const used = new Set<string>(); // 整包扁平,全局去重
    const groupSeq = new Map<string, number>();
    let count = 0;
    for (const it of items) {
      let buf: Buffer;
      try {
        buf = (await this.storage.getBuffer(it.fileId)).buffer;
      } catch {
        continue; // 文件缺失/读失败:跳过不阻断整包
      }
      const gk = groupKey(it);
      const total = groupTotal.get(gk) ?? 1;
      const seq = (groupSeq.get(gk) ?? 0) + 1;
      groupSeq.set(gk, seq);
      const dot = it.fileName.lastIndexOf('.');
      const ext = dot > 0 ? it.fileName.slice(dot) : '';
      const no = String(unitNo.get(it.unit) ?? 0).padStart(unitPad, '0');
      const suffix = total > 1 ? `-${String(seq).padStart(String(total).length, '0')}` : '';
      const baseName = sanitizeZipName(`${no}-${it.unit}-${it.field}${suffix}`);
      let name = `${baseName}${ext}`;
      let k = 1;
      while (used.has(name)) {
        k += 1;
        name = `${baseName}(${k})${ext}`;
      }
      used.add(name);
      zip.file(name, buf);
      count += 1;
    }
    if (count === 0) throw new BadRequestException('附件文件读取失败,暂无可下载内容');

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await this.audit.log({
      ...actor,
      action: 'task.attachments.download',
      target: taskId,
      detail: { count, title: task.title },
    });
    return { buffer, filename: `${sanitizeZipName(task.title)}-附件.zip`, count };
  }

  /**
   * 发起新一期(周期报表):把当前任务克隆为新一期。
   * - seriesId 串联(首次发起时源任务也并入系列,seriesId = 源任务 id)
   * - 上期「已提交 / 已通过」内容 → 本期 draft 预填(看得到上月、改增量)
   * - 同责任人 / 责任部门接力(有责任人 → in_progress 直接进其待办,无需重新认领)
   * - 老记录原样留存(快照),不被覆盖。只有派发人可发起。
   */
  async startNewPeriod(
    taskId: string,
    dto: { periodLabel?: string; dueAt?: string },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const src = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!src) throw new NotFoundException('任务不存在');
    if (src.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以发起新一期');
    }

    let dueAt: Date | null = null;
    if (dto.dueAt) {
      const d = new Date(dto.dueAt);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('截止时间格式不正确');
      dueAt = d;
    }
    const seriesId = src.seriesId ?? src.id;

    const srcTargets = await this.prisma.taskTarget.findMany({ where: { taskId: src.id } });
    const srcSubs = await this.prisma.taskSubmission.findMany({ where: { taskId: src.id } });
    const subByTarget = new Map(srcSubs.map((s) => [s.targetId, s]));

    const newTask = await this.prisma.$transaction(async (tx) => {
      // 首次发起:把源任务并入系列(seriesId = 自身 id)
      if (!src.seriesId) {
        await tx.task.update({ where: { id: src.id }, data: { seriesId } });
      }
      const t = await tx.task.create({
        data: {
          title: src.title,
          description: src.description,
          notes: src.notes,
          templateId: src.templateId,
          fields: src.fields,
          dispatchUserId: src.dispatchUserId,
          dispatchOrgId: src.dispatchOrgId,
          dueAt,
          noticeFileId: src.noticeFileId,
          noticeFileName: src.noticeFileName,
          status: 'open',
          seriesId,
          periodLabel: dto.periodLabel?.trim() || null,
        },
      });
      for (const tg of srcTargets) {
        const hadOwner = !!tg.ownerUserId;
        const newTarget = await tx.taskTarget.create({
          data: {
            taskId: t.id,
            targetType: tg.targetType,
            targetOrgId: tg.targetOrgId,
            targetUserId: tg.targetUserId,
            ownerUserId: tg.ownerUserId, // 同责任人接力
            handlerOrgId: tg.handlerOrgId,
            status: hadOwner ? 'in_progress' : 'pending',
            assignedById: hadOwner ? actorId : null,
            assignedAt: hadOwner ? new Date() : null,
          },
        });
        // 上期已提交/已通过 → 本期草稿预填(快照搬运)
        const sub = subByTarget.get(tg.id);
        if (sub && (sub.status === 'submitted' || sub.status === 'approved')) {
          await tx.taskSubmission.create({
            data: {
              taskId: t.id,
              targetId: newTarget.id,
              formData: sub.formData,
              fileIds: sub.fileIds,
              status: 'draft',
            },
          });
        }
      }
      return t;
    });

    await this.audit.log({
      ...actor,
      action: 'task.new-period',
      target: newTask.id,
      detail: {
        seriesId,
        fromTaskId: src.id,
        periodLabel: newTask.periodLabel,
        targetCount: srcTargets.length,
      },
    });
    return this.get(newTask.id);
  }

  /**
   * 配置对口(任务详情侧):把某责任部门的「对口上级」设为本任务派发部门。
   * 写的是组织属性(走 OrganizationService),所以一次配置、之后该派发部门的任务都自动路由;
   * 因责任部门实时解析,配完本任务即时生效。只有派发人可配。
   */
  async configureCounterpart(taskId: string, handlerOrgId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以配置对口');
    }
    if (!task.dispatchOrgId) {
      throw new BadRequestException('本任务未指定派发部门,请先设置派发部门再配置对口');
    }
    await this.orgs.findOne(handlerOrgId); // 校验存在
    await this.orgs.addCounterpartParent(handlerOrgId, task.dispatchOrgId);
    await this.audit.log({
      ...actor,
      action: 'task.counterpart.config',
      target: taskId,
      detail: { handlerOrgId, dispatchOrgId: task.dispatchOrgId },
    });
    return this.get(taskId);
  }

  /** 设置 / 补「派发部门」(任务详情侧):历史任务没派发部门时补上,对口才能匹配。只有派发人可设。 */
  async setDispatchOrg(taskId: string, dispatchOrgId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.dispatchUserId !== actorId) {
      throw new ForbiddenException('只有任务派发人可以设置派发部门');
    }
    const org = (await this.orgs.findOne(dispatchOrgId)) as { kind?: string };
    if (org.kind !== 'admin') {
      throw new BadRequestException('派发部门必须是行政机构');
    }
    await this.prisma.task.update({ where: { id: taskId }, data: { dispatchOrgId } });
    await this.audit.log({
      ...actor,
      action: 'task.dispatch-org.set',
      target: taskId,
      detail: { dispatchOrgId },
    });
    return this.get(taskId);
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

/** ZIP 内文件夹 / 文件名净化:去掉路径非法字符,空 → 占位 */
function sanitizeZipName(s: string): string {
  const cleaned = (s || '')
    .replace(/[/\\:*?"<>|]/g, '_') // 路径非法字符
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || '未命名';
}
