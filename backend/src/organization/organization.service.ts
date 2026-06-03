import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ADMIN_TYPES,
  CreateOrganizationDto,
  OrgKind,
  PARTY_TYPES,
} from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

export interface OrgTreeNode extends Organization {
  children: OrgTreeNode[];
  /** 仅直接挂在本组织下的去重用户数 */
  directMembers: number;
  /** 本组织 + 所有后代组织汇总的去重用户数 (传递性归属) */
  transitiveMembers: number;
}

export interface OrgMember {
  userId: string;
  username: string;
  name: string;
  phone: string | null;
  /** 通过哪个组织进入名单 (直接=本组织id;传递=某后代org的id) */
  viaOrgId: string;
  viaOrgName: string;
  position: string | null;
  isPrimary: boolean;
  isDirect: boolean;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 校验 kind 与 type 是否匹配 */
  private validateKindType(kind: OrgKind, type: string) {
    const allowed: readonly string[] = kind === 'party' ? PARTY_TYPES : ADMIN_TYPES;
    if (!allowed.includes(type)) {
      throw new BadRequestException(
        `kind=${kind} 下不允许 type=${type},允许的类型: ${allowed.join(', ')}`,
      );
    }
  }

  /** 平铺列表 (按 sortOrder 升序),可按 kind 过滤 */
  async findAll(opts: { kind?: OrgKind; includeInactive?: boolean } = {}): Promise<Organization[]> {
    const where: any = {};
    if (!opts.includeInactive) where.active = true;
    if (opts.kind) where.kind = opts.kind;
    return this.prisma.organization.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 嵌套树 (从根节点开始),可按 kind 过滤。
   * 每个节点带:
   *   directMembers     = 仅直接挂本组织下的去重用户数
   *   transitiveMembers = 本组织 + 所有后代组织汇总的去重用户数 (体现"下级自动归属上级")
   */
  async findTree(opts: { kind?: OrgKind; includeInactive?: boolean } = {}): Promise<OrgTreeNode[]> {
    const flat = await this.findAll(opts);

    // 一次性查全部归属记录(规模上去后可按 kind 加 where 过滤)
    const memberships = await this.prisma.userOrganization.findMany({
      select: { userId: true, orgId: true },
    });

    // orgId → Set<userId> (本组织直接归属去重)
    const directByOrg = new Map<string, Set<string>>();
    memberships.forEach((m) => {
      if (!directByOrg.has(m.orgId)) directByOrg.set(m.orgId, new Set());
      directByOrg.get(m.orgId)!.add(m.userId);
    });

    // 构建节点
    const map = new Map<string, OrgTreeNode>();
    flat.forEach((o) => {
      map.set(o.id, {
        ...o,
        children: [],
        directMembers: directByOrg.get(o.id)?.size ?? 0,
        transitiveMembers: 0,
      });
    });

    // 父子串联
    const roots: OrgTreeNode[] = [];
    flat.forEach((o) => {
      const node = map.get(o.id)!;
      if (o.parentId && map.has(o.parentId)) {
        map.get(o.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // 后序遍历:每个节点的 transitiveMembers = 自身子树内所有 userId 的并集大小
    const computeTransitive = (node: OrgTreeNode): Set<string> => {
      const all = new Set<string>(directByOrg.get(node.id) ?? []);
      for (const c of node.children) {
        computeTransitive(c).forEach((u) => all.add(u));
      }
      node.transitiveMembers = all.size;
      return all;
    };
    roots.forEach(computeTransitive);

    return roots;
  }

  /**
   * 列出组织成员
   *   recursive=false (默认):仅 UserOrganization 直接挂本组织的人
   *   recursive=true        :含所有后代组织成员 (按 userId 去重,展示其"通过哪个组织进入")
   */
  async listMembers(id: string, recursive = false): Promise<OrgMember[]> {
    await this.findOne(id);

    let orgIds: string[];
    if (recursive) {
      const desc = await this.collectDescendantIds(id);
      orgIds = [id, ...desc];
    } else {
      orgIds = [id];
    }

    const rows = await this.prisma.userOrganization.findMany({
      where: { orgId: { in: orgIds } },
      include: {
        user: { select: { id: true, username: true, name: true, phone: true } },
        org:  { select: { id: true, name: true } },
      },
    });

    /* 去重:同一 userId 只保留一条(优先直接归属、其次 isPrimary、最后任意) */
    const byUser = new Map<string, OrgMember>();
    for (const r of rows) {
      const isDirect = r.orgId === id;
      const existing = byUser.get(r.userId);
      const m: OrgMember = {
        userId: r.userId,
        username: r.user.username,
        name: r.user.name,
        phone: r.user.phone,
        viaOrgId: r.org.id,
        viaOrgName: r.org.name,
        position: r.position,
        isPrimary: r.isPrimary,
        isDirect,
      };
      if (!existing) {
        byUser.set(r.userId, m);
        continue;
      }
      // 优先级:isDirect > isPrimary
      if (m.isDirect && !existing.isDirect) byUser.set(r.userId, m);
      else if (m.isDirect === existing.isDirect && m.isPrimary && !existing.isPrimary) {
        byUser.set(r.userId, m);
      }
    }

    return Array.from(byUser.values()).sort((a, b) => {
      if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`组织 ${id} 不存在`);
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    this.validateKindType(dto.kind, dto.type);

    // 父组织存在性 + kind 一致性 (党组织和行政机构不允许跨树嫁接)
    if (dto.parentId) {
      const parent = await this.prisma.organization.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`父组织 ${dto.parentId} 不存在`);
      if (parent.kind !== dto.kind) {
        throw new BadRequestException(
          `kind=${dto.kind} 的组织不能挂到 kind=${parent.kind} 的父节点下`,
        );
      }
    }
    const codeDup = await this.prisma.organization.findUnique({ where: { code: dto.code } });
    if (codeDup) throw new ConflictException(`组织编码 ${dto.code} 已被占用`);

    // 名称允许重复:每个二级单位下的部门(如「综合办公室」「安全部」)同名很正常,唯一性靠 code 保证。

    return this.prisma.organization.create({ data: { ...dto, parentId: dto.parentId ?? null } });
  }

  /**
   * 拖拽移动:把 sourceId 节点放到 targetId 的相对位置
   *   position=before / after  → 与 target 成为兄弟
   *   position=inside          → 作为 target 的子节点 (追加末尾)
   *
   * 会自动:
   *   - 校验同 kind (跨树拒绝)
   *   - 防环 (不能把节点拖到自己子孙下)
   *   - 重新规整受影响父节点下所有兄弟的 sortOrder (10, 20, 30 ...)
   */
  async move(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<Organization> {
    if (sourceId === targetId) {
      throw new BadRequestException('源节点和目标节点相同');
    }
    const source = await this.findOne(sourceId);
    const target = await this.findOne(targetId);

    if (source.kind !== target.kind) {
      throw new BadRequestException(`不能跨树拖拽:${source.kind} → ${target.kind}`);
    }

    // 新父节点
    const newParentId = position === 'inside' ? target.id : target.parentId;

    // 防环:newParentId 不能是 source 的后代,也不能是 source 自己
    if (newParentId) {
      if (newParentId === sourceId) {
        throw new BadRequestException('不能挂到自己');
      }
      const descendants = await this.collectDescendantIds(sourceId);
      if (descendants.has(newParentId)) {
        throw new BadRequestException('不能挂到自己的子孙节点下');
      }
    }

    // 获取新父节点下所有兄弟节点(按 sortOrder 升序),排除自己
    const siblings = await this.prisma.organization.findMany({
      where: {
        parentId: newParentId,
        active: true,
        NOT: { id: sourceId },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // 决定插入位置
    let insertIndex: number;
    if (position === 'inside') {
      insertIndex = siblings.length;
    } else {
      const targetIdx = siblings.findIndex((s) => s.id === targetId);
      if (targetIdx === -1) {
        // target 不在新父下(理论上不应发生,但兜底)
        insertIndex = siblings.length;
      } else {
        insertIndex = position === 'before' ? targetIdx : targetIdx + 1;
      }
    }

    // 构建最终顺序数组并规整 sortOrder
    const final = [...siblings];
    const sourceRow = { ...source, parentId: newParentId } as Organization;
    final.splice(insertIndex, 0, sourceRow);

    // 一次性事务更新所有相关节点的 sortOrder + source 的 parentId
    await this.prisma.$transaction(
      final.map((node, idx) => {
        const newSortOrder = (idx + 1) * 10;
        if (node.id === sourceId) {
          return this.prisma.organization.update({
            where: { id: sourceId },
            data: { parentId: newParentId, sortOrder: newSortOrder },
          });
        }
        return this.prisma.organization.update({
          where: { id: node.id },
          data: { sortOrder: newSortOrder },
        });
      }),
    );

    return this.findOne(sourceId);
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const current = await this.findOne(id);

    const nextKind = (dto.kind ?? current.kind) as OrgKind;
    const nextType = dto.type ?? current.type;
    this.validateKindType(nextKind, nextType);

    if (dto.parentId === id) {
      throw new BadRequestException('父组织不能是自己');
    }
    if (dto.parentId) {
      const descendants = await this.collectDescendantIds(id);
      if (descendants.has(dto.parentId)) {
        throw new BadRequestException('不能把组织挂到自己的子孙节点下');
      }
      const parent = await this.prisma.organization.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException(`父组织 ${dto.parentId} 不存在`);
      if (parent.kind !== nextKind) {
        throw new BadRequestException(
          `kind=${nextKind} 的组织不能挂到 kind=${parent.kind} 的父节点下`,
        );
      }
    }
    if (dto.code) {
      const dup = await this.prisma.organization.findFirst({
        where: { code: dto.code, NOT: { id } },
      });
      if (dup) throw new ConflictException(`组织编码 ${dto.code} 已被占用`);
    }

    // 名称允许重复(各单位同名部门),不再校验重名。

    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  /** 软删除:置 active=false。如果想硬删,在前端二次确认后调 hardDelete */
  async softDelete(id: string): Promise<Organization> {
    await this.findOne(id);
    return this.prisma.organization.update({ where: { id }, data: { active: false } });
  }

  /** 硬删除:有子节点或挂着用户时拒绝 */
  async hardDelete(id: string): Promise<void> {
    await this.findOne(id);
    const childCount = await this.prisma.organization.count({ where: { parentId: id } });
    if (childCount > 0) throw new BadRequestException(`存在 ${childCount} 个子组织,不能直接删除`);
    const memberCount = await this.prisma.userOrganization.count({ where: { orgId: id } });
    if (memberCount > 0) throw new BadRequestException(`组织下还有 ${memberCount} 个成员,不能直接删除`);
    await this.prisma.organization.delete({ where: { id } });
  }

  /** 收集某节点的全部后代 id (用于环检测、批量操作) */
  private async collectDescendantIds(rootId: string): Promise<Set<string>> {
    const all = await this.prisma.organization.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    all.forEach((o) => {
      if (o.parentId) {
        const arr = childrenMap.get(o.parentId) ?? [];
        arr.push(o.id);
        childrenMap.set(o.parentId, arr);
      }
    });
    const result = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      const kids = childrenMap.get(cur) ?? [];
      kids.forEach((k) => {
        if (!result.has(k)) {
          result.add(k);
          stack.push(k);
        }
      });
    }
    return result;
  }
}
