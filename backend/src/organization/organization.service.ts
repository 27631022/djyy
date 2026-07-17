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
import type {
  OrgMatchVia,
  OrgNameScope,
  ResolvedPartyOrg,
} from './dto/resolve-org.dto';
import { normalizeName, stripPartySuffix } from './org-name';

/** loadOrgNameIndex 的行形态 —— 只取名称匹配/建树/判虚拟壳需要的列 */
interface OrgNameRow {
  id: string;
  name: string;
  parentId: string | null;
  kind: string;
  isVirtual: boolean;
}

interface OrgNameIndex {
  byId: Map<string, OrgNameRow>;
  childrenOf: Map<string, string[]>;
  /** 归一化名 → 同名组织(名称允许重复,故是数组) */
  byNormName: Map<string, OrgNameRow[]>;
}

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
  /** 成员在本机构内的排序号(拖拽排序;仅直接成员有意义) */
  sortOrder: number;
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
    const where: { active?: boolean; kind?: OrgKind } = {};
    if (!opts.includeInactive) where.active = true;
    if (opts.kind) where.kind = opts.kind;
    return this.prisma.organization.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 批量 id→机构名(跨模块展示用,如考核「责任部门」)。不存在/已删的 id 不出现在结果里。 */
  async namesByIds(ids: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
    if (!uniq.length) return {};
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.id] = r.name;
    return out;
  }

  /* ─── 按名称解析组织(证书发证「按姓名+单位匹配」/「按党组织匹配单位」用)─── */

  /**
   * 一次全量查组织建索引 —— 名称匹配 + 路径 + 子树都靠它。
   *
   * 成本与既有 loadIndex(org-scope)/collectDescendantIds 同款:机构量级 ~1000 行,
   * 单请求一次全表扫可忽略。**不要在循环里调**(会退化成 N 次全表扫)。
   *
   * active=false 的组织**要**计入(软删机构下仍挂着人,与 collectDescendantIds 同口径);
   * 是否参与「名称命中」由调用方按 isVirtual 等另行过滤。
   */
  private async loadOrgNameIndex(): Promise<OrgNameIndex> {
    const rows = await this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        parentId: true,
        kind: true,
        isVirtual: true,
      },
    });
    const byId = new Map<string, OrgNameRow>();
    const childrenOf = new Map<string, string[]>();
    const byNormName = new Map<string, OrgNameRow[]>();
    for (const r of rows) {
      byId.set(r.id, r);
      if (r.parentId) {
        const arr = childrenOf.get(r.parentId);
        if (arr) arr.push(r.id);
        else childrenOf.set(r.parentId, [r.id]);
      }
      const key = normalizeName(r.name);
      const bucket = byNormName.get(key);
      if (bucket) bucket.push(r);
      else byNormName.set(key, [r]);
    }
    return { byId, childrenOf, byNormName };
  }

  /** 由 index 反查全称路径「昆仑物流 / 基层单位 / 云贵分公司」。带环保护。 */
  private pathOf(index: OrgNameIndex, orgId: string): string {
    const trail: string[] = [];
    let cur = index.byId.get(orgId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      trail.unshift(cur.name);
      cur = cur.parentId ? index.byId.get(cur.parentId) : undefined;
    }
    return trail.join(' / ');
  }

  /** 收集 rootId 的子树全部 orgId(含自身)。 */
  private subtreeIdsOf(index: OrgNameIndex, rootId: string, out: Set<string>): void {
    if (out.has(rootId)) return;
    out.add(rootId);
    for (const cid of index.childrenOf.get(rootId) ?? []) {
      this.subtreeIdsOf(index, cid, out);
    }
  }

  /**
   * 批量「单位名 → 该单位子树的全部 orgId」。
   *
   * 给「姓名 + 单位 → 员工编号」用:文件里写的是「云贵分公司」,而人实际挂在
   * 「云贵分公司 / 昆明配送中心」—— **必须按子树匹配,不能拿单位名去精确匹配
   * membership**(真实库实测:没有任何人直接挂在「云贵分公司」本身上)。
   *
   * 匹配阶梯(逐级下降,命中即停,绝不混级):
   *   1. exact        —— 归一化名全等
   *   2. strip-suffix —— 双向:去党组织后缀后全等(「云贵分公司党委」→「云贵分公司」),
   *                      或查询名等于某组织去后缀后的名(让「云贵分公司」也能命中党树的
   *                      「云贵分公司党委」)
   *   3. contains     —— 互相包含(**只放大候选范围**,结果必然走人工点选,不会误绑)
   *
   * 跨 kind 是**特性不是 bug**:「云贵分公司」同时命中行政的分公司与党树的分公司党委,
   * 子树并集覆盖两种 membership → 匹配率更高;多义由「只回候选不选人」兜住。
   */
  async resolveNameScopes(
    names: string[],
    opts: { maxRoots?: number } = {},
  ): Promise<Record<string, OrgNameScope>> {
    const maxRoots = opts.maxRoots ?? 5;
    const uniq = [...new Set(names.map((n) => (n ?? '').trim()).filter(Boolean))];
    const out: Record<string, OrgNameScope> = {};
    if (!uniq.length) return out;

    const index = await this.loadOrgNameIndex();
    // 虚拟壳(公司机关/基层单位)不参与名称命中:没人直接挂上面,且名字极易误命中
    const candidates = [...index.byId.values()].filter((o) => !o.isVirtual);

    for (const raw of uniq) {
      const q = normalizeName(raw);
      let hits: { row: OrgNameRow; via: OrgMatchVia }[] = [];

      // 1. exact
      const exact = (index.byNormName.get(q) ?? []).filter((o) => !o.isVirtual);
      if (exact.length) {
        hits = exact.map((row) => ({ row, via: 'exact' as const }));
      } else {
        // 2. strip-suffix(双向)
        const qStripped = normalizeName(stripPartySuffix(raw));
        const bySuffix = candidates.filter(
          (o) =>
            (qStripped && qStripped !== q && normalizeName(o.name) === qStripped) ||
            normalizeName(stripPartySuffix(o.name)) === q,
        );
        if (bySuffix.length) {
          hits = bySuffix.map((row) => ({ row, via: 'strip-suffix' as const }));
        } else if (q.length >= 3) {
          // 3. contains —— 长度守卫防「机关」这种短词炸开
          const byContains = candidates.filter((o) => {
            const n = normalizeName(o.name);
            return n.includes(q) || q.includes(n);
          });
          if (byContains.length) {
            hits = byContains.map((row) => ({ row, via: 'contains' as const }));
          }
        }
      }

      // 命中太多 → 视为解析失败(与其给一堆噪音,不如让调用方退化成全量同名候选)
      if (!hits.length || hits.length > maxRoots) {
        out[raw] = { roots: [], orgIds: [], ambiguous: hits.length > maxRoots, exact: false };
        continue;
      }

      const idSet = new Set<string>();
      for (const h of hits) this.subtreeIdsOf(index, h.row.id, idSet);

      out[raw] = {
        roots: hits.map((h) => ({
          orgId: h.row.id,
          name: h.row.name,
          path: this.pathOf(index, h.row.id),
          kind: h.row.kind as 'admin' | 'party',
          via: h.via,
        })),
        orgIds: [...idSet],
        ambiguous: hits.length > 1,
        exact: hits.some((h) => h.via === 'exact'),
      };
    }
    return out;
  }

  /**
   * 批量「党组织名 → 对口行政机构」。给「先进基层党委/党支部」这类集体荣誉
   * 自动带出「所在单位」用。
   *
   * 四级阶梯(真实库实测决定了主路径):
   *   1. 党组织树里按名找到党组织(exact 优先;重名 → 回多条候选交由人工点选)
   *   2. PartyAdminLink 显式关联 → via='link'(**唯一可信档**,党委 33/35 走这里)
   *   3. 去后缀名匹配行政机构 → via='name'(补上 2/35 没配 link 的党委)
   *   4. 沿 parentId 上溯最近的祖先党组织,对它重跑 2/3 → via='ancestor'
   *      (**党支部的主路径** —— 支部自己有 link 的只有 4/361;
   *       如 酒泉配送中心党支部 → 甘肃分公司党委 → link → 甘肃分公司)
   *   都不中 → via='none'
   */
  async resolvePartyOrgs(names: string[]): Promise<Record<string, ResolvedPartyOrg[]>> {
    const uniq = [...new Set(names.map((n) => (n ?? '').trim()).filter(Boolean))];
    const out: Record<string, ResolvedPartyOrg[]> = {};
    for (const n of uniq) out[n] = [];
    if (!uniq.length) return out;

    const index = await this.loadOrgNameIndex();
    const links = await this.getAllLinks();
    const adminByParty = new Map<string, string>();
    for (const l of links) if (!adminByParty.has(l.partyOrgId)) adminByParty.set(l.partyOrgId, l.adminOrgId);

    const adminByNormName = new Map<string, OrgNameRow[]>();
    for (const o of index.byId.values()) {
      if (o.kind !== 'admin' || o.isVirtual) continue;
      const k = normalizeName(o.name);
      const b = adminByNormName.get(k);
      if (b) b.push(o);
      else adminByNormName.set(k, [o]);
    }

    /** 党组织 → 行政机构:link 优先,其次去后缀名匹配。名称多义(如「特车运输大队」
     *  在塔运司与新疆油田运输分公司下各有一个)→ 返回 null 交由上层继续上溯/人工点选。 */
    const directResolve = (
      partyId: string,
    ): { adminId: string; via: 'link' | 'name' } | null => {
      const linked = adminByParty.get(partyId);
      if (linked && index.byId.has(linked)) return { adminId: linked, via: 'link' };
      const row = index.byId.get(partyId);
      if (!row) return null;
      const base = normalizeName(stripPartySuffix(row.name));
      if (!base) return null;
      const cands = adminByNormName.get(base) ?? [];
      if (cands.length === 1) return { adminId: cands[0].id, via: 'name' };
      return null;
    };

    for (const raw of uniq) {
      const q = normalizeName(raw);
      const partyHits = (index.byNormName.get(q) ?? []).filter((o) => o.kind === 'party');
      // 党组织树里没有这个名字 → 不回退到「用名字猜行政机构」(那是 resolveNameScopes 的活)
      if (!partyHits.length) continue;

      const results: ResolvedPartyOrg[] = [];
      for (const p of partyHits) {
        const base: Omit<ResolvedPartyOrg, 'adminOrgId' | 'adminOrgName' | 'adminOrgPath' | 'via'> = {
          partyOrgId: p.id,
          partyOrgName: p.name,
          partyOrgPath: this.pathOf(index, p.id),
        };

        const direct = directResolve(p.id);
        if (direct) {
          const a = index.byId.get(direct.adminId);
          results.push({
            ...base,
            adminOrgId: direct.adminId,
            adminOrgName: a?.name ?? null,
            adminOrgPath: a ? this.pathOf(index, direct.adminId) : null,
            via: direct.via,
          });
          continue;
        }

        // 上溯祖先党组织(带环保护)
        let cur = p.parentId ? index.byId.get(p.parentId) : undefined;
        const seen = new Set<string>([p.id]);
        let done = false;
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          if (cur.kind === 'party') {
            const up = directResolve(cur.id);
            if (up) {
              const a = index.byId.get(up.adminId);
              results.push({
                ...base,
                adminOrgId: up.adminId,
                adminOrgName: a?.name ?? null,
                adminOrgPath: a ? this.pathOf(index, up.adminId) : null,
                via: 'ancestor',
                ancestorPartyOrgName: cur.name,
              });
              done = true;
              break;
            }
          }
          cur = cur.parentId ? index.byId.get(cur.parentId) : undefined;
        }
        if (done) continue;

        results.push({
          ...base,
          adminOrgId: null,
          adminOrgName: null,
          adminOrgPath: null,
          via: 'none',
        });
      }
      out[raw] = results;
    }
    return out;
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
        sortOrder: r.sortOrder,
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
      // 直接成员优先按拖拽 sortOrder 排;传递成员(来自下级)无本机构排序号,退回姓名
      if (a.isDirect && b.isDirect && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });
  }

  /**
   * 拖拽排序:按传入的 userId 顺序,给「本机构的直接成员」重排 sortOrder(10,20,30…)。
   * 只认在本机构里的 userId,其余忽略;不在列表里的直接成员保持原 sortOrder(排到后面)。
   */
  async reorderMembers(orgId: string, userIds: string[]): Promise<void> {
    await this.findOne(orgId);
    const existing = await this.prisma.userOrganization.findMany({
      where: { orgId },
      select: { userId: true },
    });
    const valid = new Set(existing.map((e) => e.userId));
    const ordered = [...new Set(userIds)].filter((u) => valid.has(u));
    if (!ordered.length) return;
    await this.prisma.$transaction(
      ordered.map((userId, i) =>
        this.prisma.userOrganization.update({
          where: { userId_orgId: { userId, orgId } },
          data: { sortOrder: (i + 1) * 10 },
        }),
      ),
    );
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

  /**
   * 给某机构的「对口上级机构」追加一个上级 org id —— 合并进 meta.counterpartParentOrgIds(去重),
   * 并把早期单值键 counterpartParentOrgId 一并迁入数组。供「任务详情里直接配置对口」复用。
   */
  async addCounterpartParent(orgId: string, parentOrgId: string): Promise<Organization> {
    const org = await this.findOne(orgId);
    let obj: Record<string, unknown> = {};
    if (org.meta) {
      try {
        const parsed: unknown = JSON.parse(org.meta);
        if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
      } catch {
        /* 坏 meta:直接重建 */
      }
    }
    const set = new Set<string>();
    const arr = obj.counterpartParentOrgIds;
    if (Array.isArray(arr)) for (const x of arr) if (typeof x === 'string') set.add(x);
    if (typeof obj.counterpartParentOrgId === 'string') set.add(obj.counterpartParentOrgId);
    set.add(parentOrgId);
    delete obj.counterpartParentOrgId;
    obj.counterpartParentOrgIds = [...set];
    return this.update(orgId, { meta: JSON.stringify(obj) });
  }

  // ─── 党组织 ↔ 行政机构 关联(N:M;党委/党总支当前 1:1;手动维护)───
  // assessment 等模块据此把党组织考核对象解析到行政机构去取业务数据(任务完成率/证书荣誉等)。
  // 松引用:两端都是 Organization,只存 id 不建 @relation。

  /** 列出某组织(任一侧)的关联:党组织→其关联的行政机构;行政机构→其关联的党组织。各带 linkId。 */
  async listLinksFor(orgId: string): Promise<{ linkId: string; org: Organization }[]> {
    const org = await this.findOne(orgId);
    const isParty = org.kind === 'party';
    const links = await this.prisma.partyAdminLink.findMany({
      where: isParty ? { partyOrgId: orgId } : { adminOrgId: orgId },
      orderBy: { createdAt: 'asc' },
    });
    if (!links.length) return [];
    const otherIds = links.map((l) => (isParty ? l.adminOrgId : l.partyOrgId));
    const others = await this.prisma.organization.findMany({ where: { id: { in: otherIds } } });
    const byId = new Map(others.map((o) => [o.id, o] as const));
    return links
      .map((l) => ({ linkId: l.id, org: byId.get(isParty ? l.adminOrgId : l.partyOrgId) }))
      .filter((x): x is { linkId: string; org: Organization } => !!x.org);
  }

  /** 关联「一个党组织 + 一个行政机构」(传入两端任意顺序,按 kind 自动归位)。 */
  async linkByOrgIds(orgId: string, otherOrgId: string, createdById?: string) {
    if (orgId === otherOrgId) throw new BadRequestException('不能把组织关联到自己');
    const a = await this.findOne(orgId);
    const b = await this.findOne(otherOrgId);
    let partyOrgId: string;
    let adminOrgId: string;
    if (a.kind === 'party' && b.kind === 'admin') {
      partyOrgId = a.id;
      adminOrgId = b.id;
    } else if (a.kind === 'admin' && b.kind === 'party') {
      partyOrgId = b.id;
      adminOrgId = a.id;
    } else {
      throw new BadRequestException('关联必须是「一个党组织 + 一个行政机构」');
    }
    const dup = await this.prisma.partyAdminLink.findUnique({
      where: { partyOrgId_adminOrgId: { partyOrgId, adminOrgId } },
    });
    if (dup) throw new ConflictException('该关联已存在');
    return this.prisma.partyAdminLink.create({
      data: { partyOrgId, adminOrgId, createdById: createdById ?? null },
    });
  }

  /** 按 linkId 查关联(controller 做范围校验用)。 */
  async findLink(linkId: string): Promise<{ id: string; partyOrgId: string; adminOrgId: string }> {
    const link = await this.prisma.partyAdminLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('关联不存在');
    return { id: link.id, partyOrgId: link.partyOrgId, adminOrgId: link.adminOrgId };
  }

  /** 解除关联(按 linkId)。 */
  async unlinkOrg(linkId: string): Promise<void> {
    const existing = await this.prisma.partyAdminLink.findUnique({ where: { id: linkId } });
    if (!existing) throw new NotFoundException('关联不存在');
    await this.prisma.partyAdminLink.delete({ where: { id: linkId } });
  }

  /** 消费方(assessment):党组织 → 关联的行政机构列表(1:1 时即唯一对应单位)。 */
  async getLinkedAdminOrgs(partyOrgId: string): Promise<Organization[]> {
    const links = await this.prisma.partyAdminLink.findMany({ where: { partyOrgId } });
    if (!links.length) return [];
    return this.prisma.organization.findMany({ where: { id: { in: links.map((l) => l.adminOrgId) } } });
  }

  /** 消费方:行政机构 → 关联的党组织列表。 */
  async getLinkedPartyOrgs(adminOrgId: string): Promise<Organization[]> {
    const links = await this.prisma.partyAdminLink.findMany({ where: { adminOrgId } });
    if (!links.length) return [];
    return this.prisma.organization.findMany({ where: { id: { in: links.map((l) => l.partyOrgId) } } });
  }

  /** 全量党组织↔行政机构关联(供 assessment 构建「考核区域」索引)。 */
  async getAllLinks(): Promise<{ partyOrgId: string; adminOrgId: string }[]> {
    return this.prisma.partyAdminLink.findMany({
      select: { partyOrgId: true, adminOrgId: true },
    });
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
