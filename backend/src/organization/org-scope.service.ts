import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { RoleService } from '../role';

/**
 * 组织/用户管理的「数据范围」解析器(2026-07-12 三级数据权限)。
 *
 * 分工:功能权限(有没有这个操作)由全局 PermissionGuard 按 @Permission 校验;
 *       数据范围(这个操作能落在哪些组织/哪些人身上)由本服务解析、各接口在 service/controller 层强制。
 *
 * 范围按「维度」分开累计 —— 行政维(kind=admin)与党维(kind=party)互不放大:
 *   - platform_admin / 任一角色 scope=all         → 不限(unrestricted)
 *   - scope=custom                                → 锚点组织按其 kind 分维、整子树展开
 *   - scope=subtree / own                         → 只推导「行政维」:锚定本人所在单位
 *       (owningUnitOf:挂在部门上的人锚其真实单位;机关部门人员锚本部门 —— 管理授权
 *        不因挂靠机关就放大到全公司)。own 只含锚点自身,subtree 含全子树。
 *       党维不做归属推导 —— 党委管理员必须配 scope=custom 显式锚定「所在党委」,
 *       防止行政管理员因个人党员身份跨线获得党务管理权。
 *   - scope=self                                  → 不贡献管理范围
 *
 * 读范围(resolveUserRead)在管理范围之外额外附加:
 *   - counterpartOrgIds:可见行政机构 meta.counterpartParentOrgIds 指向的「对口上级机构」
 *     (只读、仅直接成员 —— 用户决策:对口上级要能看到节点+联系人)
 *   - fallbackOrgIds:任何登录人兜底可见「本人所在单位」子树(机关部门人员=全公司,
 *     与任务派发 owningUnitOf 口径一致)—— 保 AssignPicker / TargetPicker 个人 tab 等
 *     业务选人组件不回归;比收敛前的「任何登录人全库可见」严格得多。
 *
 * ⚠ 本服务只被 controller 入口路径消费;模块间 DI 调用(assessment/task 等拿成员、
 *   task 配对口写 meta)不走这里,行为不变。
 */

interface ScopeOrgIndex {
  parentOf: Map<string, string | null>;
  childrenOf: Map<string, string[]>;
  kindOf: Map<string, string>; // party | admin
  isDeptById: Map<string, boolean>;
  isVirtualById: Map<string, boolean>;
  metaById: Map<string, string | null>;
}

export interface UserReadScope {
  unrestricted: boolean;
  /** 行政维可见机构(管理口径,含子树展开) */
  adminOrgIds: Set<string>;
  /** 党维可见组织(管理口径,含子树展开) */
  partyOrgIds: Set<string>;
  /** 对口上级机构(只读、仅直接成员) */
  counterpartOrgIds: Set<string>;
  /** 兜底:本人所在单位子树(业务选人组件用) */
  fallbackOrgIds: Set<string>;
}

export interface OrgWriteScope {
  unrestricted: boolean;
  adminOrgIds: Set<string>;
  partyOrgIds: Set<string>;
  /** 锚点节点自身(所辖党委/单位本体):禁删、禁移出 */
  anchorIds: Set<string>;
}

export type MembersAccess = 'full' | 'direct' | 'none';

type WritePerm = 'admin:user:write' | 'admin:org:write' | 'directory:manage';

@Injectable()
export class OrgScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RoleService,
  ) {}

  /** 全量组织一次查入内存建索引(机构量级 ~1000,单请求成本可忽略;user.list 已有同款先例) */
  private async loadIndex(): Promise<ScopeOrgIndex> {
    const rows = await this.prisma.organization.findMany({
      select: { id: true, parentId: true, kind: true, isDept: true, isVirtual: true, meta: true },
    });
    const parentOf = new Map<string, string | null>();
    const childrenOf = new Map<string, string[]>();
    const kindOf = new Map<string, string>();
    const isDeptById = new Map<string, boolean>();
    const isVirtualById = new Map<string, boolean>();
    const metaById = new Map<string, string | null>();
    for (const r of rows) {
      parentOf.set(r.id, r.parentId);
      kindOf.set(r.id, r.kind);
      isDeptById.set(r.id, r.isDept);
      isVirtualById.set(r.id, r.isVirtual);
      metaById.set(r.id, r.meta);
      if (r.parentId) {
        const arr = childrenOf.get(r.parentId);
        if (arr) arr.push(r.id);
        else childrenOf.set(r.parentId, [r.id]);
      }
    }
    return { parentOf, childrenOf, kindOf, isDeptById, isVirtualById, metaById };
  }

  /** rootId 及其全部后代并入 out(含自身) */
  private subtreeInto(index: ScopeOrgIndex, rootId: string, out: Set<string>) {
    if (!index.parentOf.has(rootId)) return; // 不存在的锚点(已删机构)静默跳过
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop() as string;
      if (out.has(id)) continue;
      out.add(id);
      for (const c of index.childrenOf.get(id) ?? []) stack.push(c);
    }
  }

  /** 从某机构往上找「所在单位」= 最近的非部门、非虚拟祖先(含自身);找不到兜底自身。与 task 模块口径一致。 */
  private owningUnitOf(index: ScopeOrgIndex, orgId: string): string {
    let cur: string | null = orgId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const isDept = index.isDeptById.get(cur) ?? false;
      const isVirtual = index.isVirtualById.get(cur) ?? false;
      if (!isDept && !isVirtual) return cur;
      cur = index.parentOf.get(cur) ?? null;
    }
    return orgId;
  }

  /**
   * 行政维「管理授权」锚点:所在单位;但机关部门人员(owningUnit 会一路走到公司根)锚本部门 ——
   * 机关部门管理员管本部门,不因挂靠机关就管全公司(读兜底 fallback 才用全公司口径)。
   */
  private adminManageAnchor(index: ScopeOrgIndex, membershipOrgId: string): string {
    const unit = this.owningUnitOf(index, membershipOrgId);
    const isCompanyRoot = (index.parentOf.get(unit) ?? null) === null;
    return isCompanyRoot && unit !== membershipOrgId ? membershipOrgId : unit;
  }

  /** 本人全部行政归属 orgId */
  private async actorAdminOrgIds(actorId: string): Promise<string[]> {
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId: actorId, org: { kind: 'admin' } },
      select: { orgId: true },
    });
    return rows.map((r) => r.orgId);
  }

  /** 某机构 meta 里登记的「对口上级机构」id 列表(兼容早期单值键) */
  private counterpartsOf(index: ScopeOrgIndex, orgId: string): string[] {
    const meta = index.metaById.get(orgId);
    if (!meta) return [];
    try {
      const parsed = JSON.parse(meta) as {
        counterpartParentOrgIds?: unknown;
        counterpartParentOrgId?: unknown;
      };
      const out: string[] = [];
      if (Array.isArray(parsed.counterpartParentOrgIds)) {
        for (const x of parsed.counterpartParentOrgIds) if (typeof x === 'string') out.push(x);
      }
      if (typeof parsed.counterpartParentOrgId === 'string') out.push(parsed.counterpartParentOrgId);
      return out;
    } catch {
      return [];
    }
  }

  /** 按权限点把 scope entries 累计成分维集合(custom 分维展开 / subtree·own 只推导行政维) */
  private accumulate(
    index: ScopeOrgIndex,
    entries: { scope: string; orgIds: string[] }[],
    actorAdminOrgIds: string[],
    into: { adminOrgIds: Set<string>; partyOrgIds: Set<string>; anchorIds?: Set<string> },
  ) {
    for (const e of entries) {
      if (e.scope !== 'custom') continue;
      for (const anchor of e.orgIds) {
        const kind = index.kindOf.get(anchor);
        if (kind === 'admin') this.subtreeInto(index, anchor, into.adminOrgIds);
        else if (kind === 'party') this.subtreeInto(index, anchor, into.partyOrgIds);
        if (kind) into.anchorIds?.add(anchor);
      }
    }
    const wantSubtree = entries.some((e) => e.scope === 'subtree');
    const wantOwn = entries.some((e) => e.scope === 'own');
    if (wantSubtree || wantOwn) {
      for (const m of actorAdminOrgIds) {
        const anchor = this.adminManageAnchor(index, m);
        if (wantSubtree) this.subtreeInto(index, anchor, into.adminOrgIds);
        else into.adminOrgIds.add(anchor);
        into.anchorIds?.add(anchor);
      }
    }
  }

  /** 用户读范围(admin:user:read + 对口 + 兜底)。 */
  async resolveUserRead(actorId: string): Promise<UserReadScope> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(
      actorId,
      'admin:user:read',
    );
    const scope: UserReadScope = {
      unrestricted: false,
      adminOrgIds: new Set(),
      partyOrgIds: new Set(),
      counterpartOrgIds: new Set(),
      fallbackOrgIds: new Set(),
    };
    if (isPlatformAdmin || entries.some((e) => e.scope === 'all')) {
      scope.unrestricted = true;
      return scope;
    }
    const index = await this.loadIndex();
    const homes = await this.actorAdminOrgIds(actorId);
    this.accumulate(index, entries, homes, scope);
    // 对口上级:可见行政子树内任一机构配置的对口上级机构(只读、仅直接成员)。
    // 目标限定为「行政机构 + 部门」——对口上级按定义就是机关部门;这也堵住经可写 meta
    // 把 counterpart 指向公司根/党组织来自授大范围读权(finding #8:kind 校验 + 部门校验)。
    for (const id of scope.adminOrgIds) {
      for (const cp of this.counterpartsOf(index, id)) {
        if (scope.adminOrgIds.has(cp) || !index.parentOf.has(cp)) continue;
        if (index.kindOf.get(cp) !== 'admin') continue;
        if (!index.isDeptById.get(cp)) continue;
        scope.counterpartOrgIds.add(cp);
      }
    }
    // 兜底:本人所在单位子树(机关人员 owningUnit=公司根 → 全公司,与任务派发口径一致)
    for (const m of homes) this.subtreeInto(index, this.owningUnitOf(index, m), scope.fallbackOrgIds);
    return scope;
  }

  /** 写范围(admin:user:write / admin:org:write)。 */
  async resolveWrite(actorId: string, perm: WritePerm): Promise<OrgWriteScope> {
    const { isPlatformAdmin, entries } = await this.roles.getScopesForPermission(actorId, perm);
    const scope: OrgWriteScope = {
      unrestricted: false,
      adminOrgIds: new Set(),
      partyOrgIds: new Set(),
      anchorIds: new Set(),
    };
    if (isPlatformAdmin || entries.some((e) => e.scope === 'all')) {
      scope.unrestricted = true;
      return scope;
    }
    const index = await this.loadIndex();
    const homes = await this.actorAdminOrgIds(actorId);
    this.accumulate(index, entries, homes, scope);
    return scope;
  }

  /** 某组织落在写范围的对应维度内? */
  private orgWritable(ws: OrgWriteScope, orgKind: string, orgId: string): boolean {
    if (ws.unrestricted) return true;
    return orgKind === 'party' ? ws.partyOrgIds.has(orgId) : ws.adminOrgIds.has(orgId);
  }

  /** 成员名单可读级别:full=可递归 / direct=仅直接成员(对口上级) / none。 */
  async membersAccess(actorId: string, orgId: string): Promise<MembersAccess> {
    const s = await this.resolveUserRead(actorId);
    if (s.unrestricted) return 'full';
    if (s.adminOrgIds.has(orgId) || s.partyOrgIds.has(orgId) || s.fallbackOrgIds.has(orgId)) {
      return 'full';
    }
    if (s.counterpartOrgIds.has(orgId)) return 'direct';
    return 'none';
  }

  /* ─── 组织写操作校验(organization.controller 层调用)─── */

  /** 建组织:parentId 为空(建根)仅 unrestricted;否则父节点须在对应维写范围内。 */
  async assertOrgCreatable(actorId: string, parentId: string | null | undefined): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:org:write');
    if (ws.unrestricted) return;
    if (!parentId) throw new ForbiddenException('只有系统管理员可以创建根级组织');
    const parent = await this.prisma.organization.findUnique({
      where: { id: parentId },
      select: { kind: true },
    });
    if (!parent || !this.orgWritable(ws, parent.kind, parentId)) {
      throw new ForbiddenException('父组织不在你的管理范围内');
    }
  }

  /**
   * 改组织:目标在写范围内;改挂父节点时新父同维在范围内,且锚点本体不可被移走。
   * deactivating(PATCH active:false)= 软删的等价入口,对锚点本体一并拦截 ——
   * 否则可绕过 assertOrgRemovable 软删掉自己所辖的党委/单位锚点(finding #4)。
   */
  async assertOrgUpdatable(
    actorId: string,
    orgId: string,
    newParentId?: string | null,
    deactivating = false,
  ): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:org:write');
    if (ws.unrestricted) return;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { kind: true, parentId: true },
    });
    if (!org || !this.orgWritable(ws, org.kind, orgId)) {
      throw new ForbiddenException('该组织不在你的管理范围内');
    }
    if (deactivating && ws.anchorIds.has(orgId)) {
      throw new ForbiddenException('不能停用你所辖范围的锚点组织本身');
    }
    if (newParentId !== undefined && newParentId !== org.parentId) {
      if (ws.anchorIds.has(orgId)) {
        throw new ForbiddenException('不能移动你所辖范围的锚点组织本身');
      }
      if (!newParentId) {
        throw new ForbiddenException('只有系统管理员可以把组织移到根级');
      }
      if (!this.orgWritable(ws, org.kind, newParentId)) {
        throw new ForbiddenException('目标父组织不在你的管理范围内');
      }
    }
  }

  /** 拖拽移动:源在范围内且非锚点本体;落点父节点在范围内(挂到根级仅 unrestricted)。 */
  async assertOrgMovable(
    actorId: string,
    sourceId: string,
    targetId: string,
    position: 'before' | 'after' | 'inside',
  ): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:org:write');
    if (ws.unrestricted) return;
    const [source, target] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: sourceId }, select: { kind: true } }),
      this.prisma.organization.findUnique({
        where: { id: targetId },
        select: { kind: true, parentId: true },
      }),
    ]);
    if (!source || !this.orgWritable(ws, source.kind, sourceId)) {
      throw new ForbiddenException('该组织不在你的管理范围内');
    }
    if (ws.anchorIds.has(sourceId)) {
      throw new ForbiddenException('不能移动你所辖范围的锚点组织本身');
    }
    const newParentId = position === 'inside' ? targetId : (target?.parentId ?? null);
    if (!newParentId) throw new ForbiddenException('只有系统管理员可以把组织移到根级');
    if (!this.orgWritable(ws, source.kind, newParentId)) {
      throw new ForbiddenException('目标位置不在你的管理范围内');
    }
  }

  /** 删组织(软/硬):目标在范围内且非锚点本体。 */
  async assertOrgRemovable(actorId: string, orgId: string): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:org:write');
    if (ws.unrestricted) return;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { kind: true },
    });
    if (!org || !this.orgWritable(ws, org.kind, orgId)) {
      throw new ForbiddenException('该组织不在你的管理范围内');
    }
    if (ws.anchorIds.has(orgId)) {
      throw new ForbiddenException('不能删除你所辖范围的锚点组织本身');
    }
  }

  /** 党↔行政关联写:任一侧在其 kind 的写范围内即可。 */
  async assertLinkWritable(actorId: string, orgIdA: string, orgIdB: string): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:org:write');
    if (ws.unrestricted) return;
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: [orgIdA, orgIdB] } },
      select: { id: true, kind: true },
    });
    const ok = rows.some((o) => this.orgWritable(ws, o.kind, o.id));
    if (!ok) throw new ForbiddenException('关联的组织不在你的管理范围内');
  }

  /** 成员拖拽排序:成员管理动作,按 admin:user:write 维度校验。 */
  async assertMembersReorderable(actorId: string, orgId: string): Promise<void> {
    const ws = await this.resolveWrite(actorId, 'admin:user:write');
    if (ws.unrestricted) return;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { kind: true },
    });
    if (!org || !this.orgWritable(ws, org.kind, orgId)) {
      throw new ForbiddenException('该组织的成员不在你的管理范围内');
    }
  }
}
