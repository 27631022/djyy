/**
 * 党建益友 种子数据
 * 运行: npm run db:seed
 *
 * 构造两棵并行的组织树:
 *
 *   党组织 (kind=party)                          行政机构 (kind=admin)
 *   ─────────                                    ─────────
 *   集团党委 (committee)                          集团公司 (corp)
 *   ├─ 党委组织部 (general)                       ├─ 总部办公室 (dept)
 *   │   ├─ 第一党支部·机关综合处 (branch)         ├─ 机关综合处 (dept)        ◄ 第一支部对应
 *   │   └─ 第二党支部·财务审计处 (branch)         ├─ 财务审计处 (dept)        ◄ 第二支部对应
 *   ├─ 党群工作部 (general)                       ├─ 人力资源处 (dept)        ◄ 第三支部对应
 *   │   ├─ 第三党支部·人力资源处 (branch)         ├─ 业务发展部 (dept)        ◄ 第四支部对应
 *   │   └─ 第四党支部·业务发展部 (branch)         ├─ 信息技术中心 (dept)      ◄ 第五支部对应
 *   └─ 基层党委 (general)                         ├─ 市场运营部 (dept)
 *       ├─ 第五党支部·信息技术中心 (branch)        ├─ 法律合规处 (dept)
 *       ├─ ... (第六~第十支部)                    ├─ 后勤保障处 (dept)
 *                                                 ├─ 安全管理处 (dept)
 *                                                 └─ 宣传文化处 (dept)
 *
 * 演示用户:
 *   admin    平台管理员
 *   王总书记 集团党委 党委书记 + 集团公司 总经理         (kind 双归属, scope=all)
 *   李经理   第二党支部 支部书记 + 财务审计处 部门经理   (典型干部双重身份)
 *   张三     第一党支部 普通党员 + 机关综合处 综合干事   (普通职工)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedNode = {
  code: string;
  name: string;
  kind: 'party' | 'admin';
  type: string;
  isVirtual?: boolean;
  sortOrder?: number;
  children?: SeedNode[];
};

/* ─── 党组织树 ─── */
const PARTY_TREE: SeedNode = {
  code: 'PARTY-ROOT',
  name: '集团党委',
  kind: 'party',
  type: 'committee',
  sortOrder: 0,
  children: [
    {
      code: 'PARTY-ORG-DEPT',
      name: '党委组织部',
      kind: 'party',
      type: 'general',
      sortOrder: 10,
      children: [
        { code: 'PARTY-BR-01', name: '第一党支部·机关综合处', kind: 'party', type: 'branch', sortOrder: 1 },
        { code: 'PARTY-BR-02', name: '第二党支部·财务审计处', kind: 'party', type: 'branch', sortOrder: 2 },
      ],
    },
    {
      code: 'PARTY-MASS-WORK',
      name: '党群工作部',
      kind: 'party',
      type: 'general',
      sortOrder: 20,
      children: [
        { code: 'PARTY-BR-03', name: '第三党支部·人力资源处', kind: 'party', type: 'branch', sortOrder: 3 },
        { code: 'PARTY-BR-04', name: '第四党支部·业务发展部', kind: 'party', type: 'branch', sortOrder: 4 },
      ],
    },
    {
      code: 'PARTY-GRASSROOTS',
      name: '基层党委',
      kind: 'party',
      type: 'general',
      sortOrder: 30,
      children: [
        { code: 'PARTY-BR-05', name: '第五党支部·信息技术中心', kind: 'party', type: 'branch', sortOrder: 5 },
        { code: 'PARTY-BR-06', name: '第六党支部·市场运营部',   kind: 'party', type: 'branch', sortOrder: 6 },
        { code: 'PARTY-BR-07', name: '第七党支部·法律合规处',   kind: 'party', type: 'branch', sortOrder: 7 },
        { code: 'PARTY-BR-08', name: '第八党支部·后勤保障处',   kind: 'party', type: 'branch', sortOrder: 8 },
        { code: 'PARTY-BR-09', name: '第九党支部·安全管理处',   kind: 'party', type: 'branch', sortOrder: 9 },
        { code: 'PARTY-BR-10', name: '第十党支部·宣传文化处',   kind: 'party', type: 'branch', sortOrder: 10 },
      ],
    },
  ],
};

/* ─── 行政机构树 ─── */
/* 行政机构 type 表示企业层级:level1 集团总部 / level2 子公司或职能部门 / level3 分公司或二级部门 / level4 项目部班组 */
const ADMIN_TREE: SeedNode = {
  code: 'ADMIN-ROOT',
  name: '集团公司',
  kind: 'admin',
  type: 'level1',
  sortOrder: 0,
  children: [
    { code: 'ADMIN-HQ',    name: '总部办公室',     kind: 'admin', type: 'level2', sortOrder: 1 },
    { code: 'ADMIN-GEN',   name: '机关综合处',     kind: 'admin', type: 'level2', sortOrder: 2 },
    { code: 'ADMIN-FIN',   name: '财务审计处',     kind: 'admin', type: 'level2', sortOrder: 3 },
    { code: 'ADMIN-HR',    name: '人力资源处',     kind: 'admin', type: 'level2', sortOrder: 4 },
    { code: 'ADMIN-BIZ',   name: '业务发展部',     kind: 'admin', type: 'level2', sortOrder: 5 },
    { code: 'ADMIN-IT',    name: '信息技术中心',   kind: 'admin', type: 'level2', sortOrder: 6 },
    { code: 'ADMIN-MKT',   name: '市场运营部',     kind: 'admin', type: 'level2', sortOrder: 7 },
    { code: 'ADMIN-LAW',   name: '法律合规处',     kind: 'admin', type: 'level2', sortOrder: 8 },
    { code: 'ADMIN-LOG',   name: '后勤保障处',     kind: 'admin', type: 'level2', sortOrder: 9 },
    { code: 'ADMIN-SEC',   name: '安全管理处',     kind: 'admin', type: 'level2', sortOrder: 10 },
    { code: 'ADMIN-PR',    name: '宣传文化处',     kind: 'admin', type: 'level2', sortOrder: 11 },
  ],
};

async function upsertNode(node: SeedNode, parentId: string | null): Promise<string> {
  const existing = await prisma.organization.findUnique({ where: { code: node.code } });
  const data = {
    name: node.name,
    code: node.code,
    kind: node.kind,
    type: node.type,
    isVirtual: node.isVirtual ?? false,
    sortOrder: node.sortOrder ?? 0,
    active: true,
    parentId,
  };
  const saved = existing
    ? await prisma.organization.update({ where: { id: existing.id }, data })
    : await prisma.organization.create({ data });
  for (const c of node.children ?? []) {
    await upsertNode(c, saved.id);
  }
  return saved.id;
}

/* ─── 虚拟组织 ─── */
/*
 * 党组织的虚拟形态统一归为「临时党支部」(type=temp_branch):
 *   党员突击队、党员服务队、党建学习专班 ……
 * 行政机构的虚拟形态没有类型细分,只是 isVirtual=true:
 *   项目组、专班、攻关组 ……
 * 虚拟组织挂在某个实体组织下表示发起单位/牵头部门,成员可跨实体灵活进出。
 */
const VIRTUAL_ORGS: { node: SeedNode; parentCode: string }[] = [
  /* 党组织 · 临时党支部 (虚拟) */
  { node: { code: 'VPARTY-TASKFORCE', name: '党建学习专班', kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 100 }, parentCode: 'PARTY-ROOT' },
  { node: { code: 'VPARTY-COMMANDO',  name: '党员突击队',   kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 101 }, parentCode: 'PARTY-ROOT' },
  { node: { code: 'VPARTY-SERVICE',   name: '党员服务队',   kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 102 }, parentCode: 'PARTY-ROOT' },
  /* 行政 · 虚拟 (跨部门项目组,挂在父节点之下,层级跟随)  */
  { node: { code: 'VADMIN-DIGITAL',   name: '数字化转型项目组', kind: 'admin', type: 'level2', isVirtual: true, sortOrder: 100 }, parentCode: 'ADMIN-ROOT' },
  { node: { code: 'VADMIN-AUDIT-25',  name: '2025 年度审计专班', kind: 'admin', type: 'level3', isVirtual: true, sortOrder: 101 }, parentCode: 'ADMIN-FIN' },
];

async function seedVirtualOrgs() {
  for (const { node, parentCode } of VIRTUAL_ORGS) {
    const parent = await prisma.organization.findUnique({ where: { code: parentCode } });
    await upsertNode(node, parent?.id ?? null);
  }
}

/* ─── 权限点 + 内置角色 ─── */
async function seedRolesAndPermissions() {
  const permissions: Array<{ code: string; name: string; category: string }> = [
    { code: 'admin:menu',          name: '管理后台菜单',    category: 'menu' },
    { code: 'admin:org:read',      name: '查看组织树',      category: 'operation' },
    { code: 'admin:org:write',     name: '管理组织树',      category: 'operation' },
    { code: 'admin:user:read',     name: '查看用户',        category: 'operation' },
    { code: 'admin:user:write',    name: '管理用户',        category: 'operation' },
    { code: 'admin:role:read',     name: '查看角色',        category: 'operation' },
    { code: 'admin:role:write',    name: '管理角色与权限',  category: 'operation' },
    { code: 'admin:plugin:manage', name: '管理插件',        category: 'operation' },
    { code: 'portal:view',         name: '访问门户首页',    category: 'menu' },
    // 证书管理(V2)
    { code: 'certificate:issue',         name: '发证',             category: 'operation' },
    { code: 'certificate:revoke',        name: '撤销证书',         category: 'operation' },
    { code: 'certificate:bulk-download', name: '批量下载证书',     category: 'operation' },
  ];
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { ...p, builtin: true },
      update: { name: p.name, category: p.category, builtin: true },
    });
  }

  const roles = [
    { code: 'platform_admin', name: '平台管理员',    perms: permissions.map((p) => p.code) },
    { code: 'party_secretary', name: '党支部书记',   perms: ['portal:view', 'admin:org:read', 'admin:user:read'] },
    { code: 'dept_manager',    name: '部门经理',     perms: ['portal:view', 'admin:user:read'] },
    { code: 'member',          name: '普通用户',     perms: ['portal:view'] },
  ];
  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, builtin: true },
      update: { name: r.name, builtin: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of r.perms) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (perm) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
    }
  }
}

/* ─── 演示用户:展示双归属 ─── */
async function seedDemoUsers() {
  const orgByCode = async (code: string) => {
    const o = await prisma.organization.findUnique({ where: { code } });
    if (!o) throw new Error(`org ${code} not found`);
    return o;
  };
  const roleByCode = async (code: string) => {
    const r = await prisma.role.findUnique({ where: { code } });
    if (!r) throw new Error(`role ${code} not found`);
    return r;
  };

  // admin 用户
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      name: '系统管理员',
      email: 'admin@dyy.local',
      active: true,
      roles: { create: [{ role: { connect: { code: 'platform_admin' } }, scope: 'all' }] },
    },
    update: {},
  });

  const partySecRole = await roleByCode('party_secretary');
  const deptMgrRole  = await roleByCode('dept_manager');
  const memberRole   = await roleByCode('member');

  /* ────────────────────────────────────────────────────────
   * 重要约定:党员的"组织关系"挂在党支部,党委/总支只是层级容器。
   * 党委书记、总支书记是 POSITION (职务),持职者本人的党员关系仍在某个党支部。
   * ──────────────────────────────────────────────────────── */

  /* 王总书记 — 党员关系挂第一党支部,担任党委书记 + 集团总经理
     5 归属: 党支部党员(主) + 党委(职位) + 集团总经理(主) + 党建专班 + 数字化项目组 */
  const wang = await prisma.user.upsert({
    where: { username: 'wang_zs' },
    create: { username: 'wang_zs', name: '王总书记', email: 'wang@dyy.local', active: true },
    update: { name: '王总书记' },
  });
  const partyRoot   = await orgByCode('PARTY-ROOT');
  const branch01    = await orgByCode('PARTY-BR-01');
  const adminRoot   = await orgByCode('ADMIN-ROOT');
  const vPartyTf    = await orgByCode('VPARTY-TASKFORCE');
  const vAdminDig   = await orgByCode('VADMIN-DIGITAL');
  await prisma.userOrganization.deleteMany({ where: { userId: wang.id } });
  await prisma.userOrganization.createMany({
    data: [
      { userId: wang.id, orgId: branch01.id,  position: '党员',          isPrimary: true },
      { userId: wang.id, orgId: partyRoot.id, position: '党委书记',      isPrimary: false },
      { userId: wang.id, orgId: adminRoot.id, position: '总经理',        isPrimary: true },
      { userId: wang.id, orgId: vPartyTf.id,  position: '专班组长',      isPrimary: false },
      { userId: wang.id, orgId: vAdminDig.id, position: '项目组组长',    isPrimary: false },
    ],
  });
  await prisma.userRole.deleteMany({ where: { userId: wang.id } });
  await prisma.userRole.createMany({
    data: [
      { userId: wang.id, roleId: partySecRole.id, scope: 'all' },
      { userId: wang.id, roleId: deptMgrRole.id,  scope: 'all' },
    ],
  });

  /* 李经理 — 第二党支部书记 + 财务审计处部门经理 + 审计专班组长 (3 归属) */
  const li = await prisma.user.upsert({
    where: { username: 'li_mgr' },
    create: { username: 'li_mgr', name: '李经理', email: 'li@dyy.local', active: true },
    update: { name: '李经理' },
  });
  const branch02 = await orgByCode('PARTY-BR-02');
  const adminFin = await orgByCode('ADMIN-FIN');
  const vAuditTf = await orgByCode('VADMIN-AUDIT-25');
  await prisma.userOrganization.deleteMany({ where: { userId: li.id } });
  await prisma.userOrganization.createMany({
    data: [
      { userId: li.id, orgId: branch02.id, position: '支部书记',       isPrimary: true },
      { userId: li.id, orgId: adminFin.id, position: '财务审计处经理', isPrimary: true },
      { userId: li.id, orgId: vAuditTf.id, position: '审计专班组长',   isPrimary: false },
    ],
  });
  await prisma.userRole.deleteMany({ where: { userId: li.id } });
  // 党支书 — custom scope 指向第二党支部
  await prisma.userRole.create({
    data: {
      userId: li.id,
      roleId: partySecRole.id,
      scope: 'custom',
      scopeOrgs: { create: [{ orgId: branch02.id }] },
    },
  });
  // 部门经理 — custom scope 指向财务审计处 + 审计专班 (示范多选)
  await prisma.userRole.create({
    data: {
      userId: li.id,
      roleId: deptMgrRole.id,
      scope: 'custom',
      scopeOrgs: { create: [{ orgId: adminFin.id }, { orgId: vAuditTf.id }] },
    },
  });

  /* 张三 — 第一党支部党员 + 机关综合处干事 + 党员服务队 + 数字化项目组 (4 归属) */
  const zhang = await prisma.user.upsert({
    where: { username: 'zhang_san' },
    create: { username: 'zhang_san', name: '张三', email: 'zhang@dyy.local', active: true },
    update: { name: '张三' },
  });
  const adminGen = await orgByCode('ADMIN-GEN');
  const vSvcZhang = await orgByCode('VPARTY-SERVICE');
  await prisma.userOrganization.deleteMany({ where: { userId: zhang.id } });
  await prisma.userOrganization.createMany({
    data: [
      { userId: zhang.id, orgId: branch01.id,   position: '党员',         isPrimary: true },
      { userId: zhang.id, orgId: adminGen.id,   position: '综合干事',     isPrimary: true },
      { userId: zhang.id, orgId: vSvcZhang.id,  position: '服务队队员',   isPrimary: false },
      { userId: zhang.id, orgId: vAdminDig.id,  position: '技术骨干',     isPrimary: false },
    ],
  });
  await prisma.userRole.deleteMany({ where: { userId: zhang.id } });
  await prisma.userRole.create({
    data: { userId: zhang.id, roleId: memberRole.id, scope: 'self' },
  });

  /* 赵专员 — 第三党支部党员 + 人力资源处专员 + 党建专班 + 数字化项目组 (4 归属) */
  const zhao = await prisma.user.upsert({
    where: { username: 'zhao_zy' },
    create: { username: 'zhao_zy', name: '赵专员', email: 'zhao@dyy.local', active: true },
    update: { name: '赵专员' },
  });
  const branch03 = await orgByCode('PARTY-BR-03');
  const adminHr  = await orgByCode('ADMIN-HR');
  await prisma.userOrganization.deleteMany({ where: { userId: zhao.id } });
  await prisma.userOrganization.createMany({
    data: [
      { userId: zhao.id, orgId: branch03.id,  position: '党员',         isPrimary: true },
      { userId: zhao.id, orgId: adminHr.id,   position: '人力资源专员', isPrimary: true },
      { userId: zhao.id, orgId: vPartyTf.id,  position: '专班成员',     isPrimary: false },
      { userId: zhao.id, orgId: vAdminDig.id, position: '项目协调',     isPrimary: false },
    ],
  });
  await prisma.userRole.deleteMany({ where: { userId: zhao.id } });
  await prisma.userRole.create({
    data: { userId: zhao.id, roleId: memberRole.id, scope: 'self' },
  });

  /* 钱英雄 — 第五党支部副书记 + IT 中心工程师 + 党员突击队队长 + 党员服务队队员 (4 归属) */
  const qian = await prisma.user.upsert({
    where: { username: 'qian_hero' },
    create: { username: 'qian_hero', name: '钱英雄', email: 'qian@dyy.local', active: true },
    update: { name: '钱英雄' },
  });
  const branch05 = await orgByCode('PARTY-BR-05');
  const adminIt  = await orgByCode('ADMIN-IT');
  const vCmd     = await orgByCode('VPARTY-COMMANDO');
  const vSvc     = await orgByCode('VPARTY-SERVICE');
  await prisma.userOrganization.deleteMany({ where: { userId: qian.id } });
  await prisma.userOrganization.createMany({
    data: [
      { userId: qian.id, orgId: branch05.id, position: '支部副书记', isPrimary: true },
      { userId: qian.id, orgId: adminIt.id,  position: 'IT 工程师',  isPrimary: true },
      { userId: qian.id, orgId: vCmd.id,     position: '突击队队长', isPrimary: false },
      { userId: qian.id, orgId: vSvc.id,     position: '服务队队员', isPrimary: false },
    ],
  });
  await prisma.userRole.deleteMany({ where: { userId: qian.id } });
  await prisma.userRole.create({
    data: {
      userId: qian.id,
      roleId: partySecRole.id,
      scope: 'custom',
      scopeOrgs: { create: [{ orgId: branch05.id }] },
    },
  });
  await prisma.userRole.create({
    data: { userId: qian.id, roleId: memberRole.id, scope: 'self' },
  });
}

/* ─── 数据字典 ─── */
interface SeedDictItem {
  code: string;
  label: string;
  description?: string;
  children?: SeedDictItem[];  // 二级项 (parentId 指向当前)
}
interface SeedDictDef {
  code: string;
  name: string;
  description?: string;
  builtin?: boolean;
  sortOrder?: number;
  items: SeedDictItem[];
}

const DICTIONARIES: SeedDictDef[] = [
  {
    code: 'admin_position',
    name: '行政职务',
    description: '行政机构内人员的职务名称,在用户的行政归属"职务"字段下拉选用',
    builtin: true,
    sortOrder: 10,
    items: [
      {
        code: 'mgmt', label: '管理类',
        description: '集团领导 / 部门负责人 / 中层管理岗',
        children: [
          { code: 'general_manager',         label: '总经理' },
          { code: 'deputy_general_manager',  label: '副总经理' },
          { code: 'chief_engineer',          label: '总工程师' },
          { code: 'chief_economist',         label: '总经济师' },
          { code: 'chief_accountant',        label: '总会计师' },
          { code: 'department_head',         label: '部长 / 处长' },
          { code: 'deputy_department_head',  label: '副部长 / 副处长' },
          { code: 'manager',                 label: '经理' },
          { code: 'deputy_manager',          label: '副经理' },
          { code: 'director',                label: '主任' },
          { code: 'deputy_director',         label: '副主任' },
          { code: 'supervisor',              label: '主管' },
        ],
      },
      {
        code: 'tech', label: '技术类',
        description: '工程技术系列岗位',
        children: [
          { code: 'senior_engineer',         label: '高级工程师' },
          { code: 'engineer',                label: '工程师' },
          { code: 'assistant_engineer',      label: '助理工程师' },
          { code: 'technician',              label: '技术员' },
        ],
      },
      {
        code: 'ops', label: '操作类',
        description: '日常行政 / 一线作业岗位',
        children: [
          { code: 'specialist',              label: '专员' },
          { code: 'staff',                   label: '干事 / 职员' },
          { code: 'team_leader',             label: '班组长' },
          { code: 'worker',                  label: '一线员工' },
        ],
      },
    ],
  },
  {
    code: 'party_position',
    name: '党组织职务',
    description: '党组织内人员的职务名称,在用户的党组织归属"职务"字段下拉选用',
    builtin: true,
    sortOrder: 20,
    items: [
      {
        code: 'party_member_type', label: '党员身份',
        children: [
          { code: 'member',                  label: '党员' },
          { code: 'probationary_member',     label: '预备党员' },
        ],
      },
      {
        code: 'committee_role', label: '党委职务',
        children: [
          { code: 'party_secretary',         label: '党委书记' },
          { code: 'deputy_party_secretary',  label: '党委副书记' },
          { code: 'party_committee_member',  label: '党委委员' },
        ],
      },
      {
        code: 'general_role', label: '党总支职务',
        children: [
          { code: 'general_secretary',        label: '党总支书记' },
          { code: 'deputy_general_secretary', label: '党总支副书记' },
        ],
      },
      {
        code: 'branch_role', label: '党支部职务',
        children: [
          { code: 'branch_secretary',         label: '支部书记' },
          { code: 'deputy_branch_secretary',  label: '支部副书记' },
          { code: 'organization_member',      label: '组织委员' },
          { code: 'propaganda_member',        label: '宣传委员' },
          { code: 'discipline_member',        label: '纪检委员' },
          { code: 'youth_league_member',      label: '青年委员' },
        ],
      },
      {
        code: 'group_role', label: '党小组职务',
        children: [
          { code: 'group_leader',             label: '党小组长' },
        ],
      },
    ],
  },
  {
    code: 'user_education',
    name: '学历',
    description: '用户教育程度,1 级扁平字典 (无分类)',
    builtin: true,
    sortOrder: 30,
    items: [
      { code: 'high_school',     label: '高中 / 中专' },
      { code: 'junior_college',  label: '大专' },
      { code: 'bachelor',        label: '本科' },
      { code: 'master',          label: '硕士' },
      { code: 'doctor',          label: '博士' },
      { code: 'other',           label: '其他' },
    ],
  },
  {
    code: 'user_political_status',
    name: '政治面貌',
    description: '用户政治面貌,1 级扁平字典 (无分类)',
    builtin: true,
    sortOrder: 40,
    items: [
      { code: 'party_member',          label: '中共党员' },
      { code: 'probationary_member',   label: '中共预备党员' },
      { code: 'league_member',         label: '共青团员' },
      { code: 'democratic_party',      label: '民主党派' },
      { code: 'masses',                label: '群众' },
    ],
  },
  {
    code: 'user_gender',
    name: '性别',
    description: '用户性别,1 级扁平字典',
    builtin: true,
    sortOrder: 50,
    items: [
      { code: 'male',    label: '男' },
      { code: 'female',  label: '女' },
      { code: 'other',   label: '其他' },
    ],
  },
  {
    code: 'user_marital_status',
    name: '婚姻状况',
    description: '用户婚姻状况,1 级扁平字典',
    builtin: true,
    sortOrder: 60,
    items: [
      { code: 'single',    label: '未婚' },
      { code: 'married',   label: '已婚' },
      { code: 'divorced',  label: '离异' },
      { code: 'widowed',   label: '丧偶' },
    ],
  },
];

/* ─── 用户自定义字段定义 ─── */
interface SeedCustomFieldDef {
  code: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  dictCode?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  sortOrder: number;
  builtin?: boolean;
}

const CUSTOM_FIELDS: SeedCustomFieldDef[] = [
  { code: 'gender',           label: '性别',          type: 'select',   dictCode: 'user_gender',           sortOrder: 10,  builtin: true },
  { code: 'birth_date',       label: '出生日期',      type: 'date',                                       sortOrder: 20,  builtin: true },
  { code: 'id_card_no',       label: '身份证号',      type: 'text',     placeholder: '18 位身份证号',     sortOrder: 30,  builtin: true },
  { code: 'hire_date',        label: '入职日期',      type: 'date',                                       sortOrder: 40,  builtin: true },
  { code: 'education',        label: '学历',          type: 'select',   dictCode: 'user_education',        sortOrder: 50,  builtin: true },
  { code: 'political_status', label: '政治面貌',      type: 'select',   dictCode: 'user_political_status', sortOrder: 60,  builtin: true },
  { code: 'marital_status',   label: '婚姻状况',      type: 'select',   dictCode: 'user_marital_status',   sortOrder: 70,  builtin: true },
  { code: 'native_place',     label: '籍贯',          type: 'text',     placeholder: '如 山东济南',       sortOrder: 80,  builtin: true },
  { code: 'address',          label: '家庭住址',      type: 'textarea',                                   sortOrder: 90,  builtin: true },
  { code: 'emergency_name',   label: '紧急联系人',    type: 'text',                                       sortOrder: 100, builtin: true },
  { code: 'emergency_phone',  label: '紧急联系电话',  type: 'text',                                       sortOrder: 110, builtin: true },
];

async function seedCustomFields() {
  for (const f of CUSTOM_FIELDS) {
    await prisma.userCustomField.upsert({
      where: { code: f.code },
      create: {
        code: f.code,
        label: f.label,
        type: f.type,
        dictCode: f.dictCode,
        placeholder: f.placeholder,
        description: f.description,
        required: f.required ?? false,
        sortOrder: f.sortOrder,
        active: true,
        builtin: f.builtin ?? false,
      },
      update: {
        label: f.label,
        type: f.type,
        dictCode: f.dictCode,
        placeholder: f.placeholder,
        description: f.description,
        required: f.required ?? false,
        sortOrder: f.sortOrder,
        builtin: f.builtin ?? false,
      },
    });
  }
}

async function seedDictionaries() {
  for (const d of DICTIONARIES) {
    const dict = await prisma.dictionary.upsert({
      where: { code: d.code },
      create: {
        code: d.code,
        name: d.name,
        description: d.description,
        builtin: d.builtin ?? false,
        sortOrder: d.sortOrder ?? 0,
      },
      update: {
        name: d.name,
        description: d.description,
        builtin: d.builtin ?? false,
        sortOrder: d.sortOrder ?? 0,
      },
    });

    // 先 upsert 所有根级项 (parentId=null),拿到 id 备用
    for (let i = 0; i < d.items.length; i++) {
      const it = d.items[i];
      await prisma.dictItem.upsert({
        where: { dictId_code: { dictId: dict.id, code: it.code } },
        create: {
          dictId: dict.id,
          code: it.code,
          label: it.label,
          description: it.description,
          sortOrder: (i + 1) * 100,
          parentId: null,
        },
        update: {
          label: it.label,
          description: it.description,
          sortOrder: (i + 1) * 100,
          parentId: null,
        },
      });
    }

    // 再 upsert 所有二级项,parentId 指向同字典内根级项
    for (let i = 0; i < d.items.length; i++) {
      const cat = d.items[i];
      if (!cat.children) continue;
      const parent = await prisma.dictItem.findUnique({
        where: { dictId_code: { dictId: dict.id, code: cat.code } },
      });
      if (!parent) continue;
      for (let j = 0; j < cat.children.length; j++) {
        const ch = cat.children[j];
        await prisma.dictItem.upsert({
          where: { dictId_code: { dictId: dict.id, code: ch.code } },
          create: {
            dictId: dict.id,
            code: ch.code,
            label: ch.label,
            description: ch.description,
            sortOrder: (j + 1) * 10,
            parentId: parent.id,
          },
          update: {
            label: ch.label,
            description: ch.description,
            sortOrder: (j + 1) * 10,
            parentId: parent.id,
          },
        });
      }
    }
  }
}

/* ════════════════════════════════════════════════════
 * 首页导航数据 (6 大分类 + 24 项)
 * 用 upsert(by code/categoryId+label) 实现幂等
 * ════════════════════════════════════════════════════ */
const NAV_SEED: Array<{
  code: string;
  label: string;
  color: string;
  bgLight: string;
  icon: string;
  sortOrder: number;
  items: Array<{ icon: string; label: string; color: string; common: boolean; desc: string; views: number; likes: number; url?: string }>;
}> = [
  {
    code: 'party-affairs',
    label: '党务办理',
    color: 'rgb(200, 0, 30)',
    bgLight: 'rgb(255, 245, 245)',
    icon: 'ClipboardListIcon',
    sortOrder: 10,
    items: [
      { icon: 'CreditCardIcon', label: '党费缴纳',  color: 'rgb(200, 0, 30)', common: true,  desc: '在线完成党费缴纳登记,支持历史查询', likes: 234, views: 1820 },
      { icon: 'UsersIcon',      label: '组织关系',  color: 'rgb(200, 0, 30)', common: true,  desc: '党员组织关系转接、介绍信开具',       likes: 187, views: 1430 },
      { icon: 'CalendarIcon',   label: '活动报名',  color: 'rgb(200, 0, 30)', common: false, desc: '查看近期党内活动并完成在线报名',     likes: 95,  views: 762 },
      { icon: 'BellIcon',       label: '通知公告',  color: 'rgb(200, 0, 30)', common: true,  desc: '查阅党委最新通知、公告与文件',       likes: 312, views: 2546 },
    ],
  },
  {
    code: 'learning',
    label: '学习资源',
    color: 'rgb(232, 112, 10)',
    bgLight: 'rgb(255, 246, 237)',
    icon: 'BookOpenIcon',
    sortOrder: 20,
    items: [
      { icon: 'BookOpenIcon',    label: '党章学习', color: 'rgb(232, 112, 10)', common: true,  desc: '在线阅读党章全文,支持逐章标注',     likes: 408, views: 3210 },
      { icon: 'StarIcon',        label: '学习强国', color: 'rgb(232, 112, 10)', common: false, desc: '跳转学习强国平台,完成每日积分',     likes: 276, views: 2088 },
      { icon: 'ScrollTextIcon',  label: '经典文献', color: 'rgb(232, 112, 10)', common: false, desc: '系统阅读马列经典文献与历史文件',     likes: 143, views: 986 },
      { icon: 'GlobeIcon',       label: '红色网站', color: 'rgb(232, 112, 10)', common: false, desc: '精选推荐权威红色学习资源网站',       likes: 68,  views: 540 },
    ],
  },
  {
    code: 'statistics',
    label: '统计管理',
    color: 'rgb(26, 107, 200)',
    bgLight: 'rgb(238, 244, 255)',
    icon: 'BarChart2Icon',
    sortOrder: 30,
    items: [
      { icon: 'FileTextIcon',   label: '党务公开', color: 'rgb(26, 107, 200)', common: false, desc: '查阅本单位党务公开信息与公示',       likes: 119, views: 930 },
      { icon: 'AwardIcon',      label: '积分管理', color: 'rgb(26, 107, 200)', common: false, desc: '查询个人党建积分明细与兑换',         likes: 88,  views: 674 },
      { icon: 'BarChart2Icon',  label: '党建统计', color: 'rgb(26, 107, 200)', common: false, desc: '生成党支部组织数据统计报表',         likes: 201, views: 1576 },
      { icon: 'MapPinIcon',     label: '支部地图', color: 'rgb(26, 107, 200)', common: false, desc: '查看各党支部地理分布信息',           likes: 54,  views: 412 },
    ],
  },
  {
    code: 'rules',
    label: '条例制度',
    color: 'rgb(139, 0, 200)',
    bgLight: 'rgb(247, 238, 255)',
    icon: 'ScaleIcon',
    sortOrder: 40,
    items: [
      { icon: 'ScrollTextIcon',    label: '党章全文', color: 'rgb(139, 0, 200)', common: true,  desc: '中国共产党章程全文在线阅读',         likes: 312, views: 4560 },
      { icon: 'ScaleIcon',         label: '党纪条例', color: 'rgb(139, 0, 200)', common: false, desc: '中国共产党纪律处分条例查询',         likes: 176, views: 2310 },
      { icon: 'ClipboardCheckIcon',label: '廉洁准则', color: 'rgb(139, 0, 200)', common: false, desc: '中国共产党廉洁自律准则',             likes: 98,  views: 1480 },
      { icon: 'BookMarkedIcon',    label: '党规汇编', color: 'rgb(139, 0, 200)', common: false, desc: '党内法规规章制度汇编查询',           likes: 65,  views: 890 },
    ],
  },
  {
    code: 'tools',
    label: '工具软件',
    color: 'rgb(0, 120, 180)',
    bgLight: 'rgb(235, 248, 255)',
    icon: 'WrenchIcon',
    sortOrder: 50,
    items: [
      { icon: 'MonitorIcon',    label: '党建平台', color: 'rgb(0, 120, 180)', common: true,  desc: '综合党建信息化管理平台入口',         likes: 407, views: 6820 },
      { icon: 'DatabaseIcon',   label: '档案系统', color: 'rgb(0, 120, 180)', common: false, desc: '党员档案数字化管理系统',             likes: 253, views: 4130 },
      { icon: 'SettingsIcon',   label: '党务管理', color: 'rgb(0, 120, 180)', common: false, desc: '党务工作流程化管理工具',             likes: 134, views: 2200 },
      { icon: 'BarChart2Icon',  label: '统计报表', color: 'rgb(0, 120, 180)', common: false, desc: '一键生成各类党建统计报表',           likes: 87,  views: 1350 },
    ],
  },
  {
    code: 'tutorials',
    label: '党建教程',
    color: 'rgb(45, 160, 88)',
    bgLight: 'rgb(237, 250, 243)',
    icon: 'GraduationCapIcon',
    sortOrder: 60,
    items: [
      { icon: 'VideoIcon',      label: '视频课程', color: 'rgb(45, 160, 88)', common: false, desc: '党建工作专题视频培训课程',           likes: 228, views: 3870 },
      { icon: 'PlayCircleIcon', label: '学习专栏', color: 'rgb(45, 160, 88)', common: false, desc: '系列化党建学习专题专栏',             likes: 155, views: 2640 },
      { icon: 'LibraryIcon',    label: '知识库',   color: 'rgb(45, 160, 88)', common: false, desc: '党建工作知识库与问答中心',           likes: 76,  views: 1180 },
      { icon: 'BookOpenIcon',   label: '操作手册', color: 'rgb(45, 160, 88)', common: false, desc: '各类党务工作操作指南手册',           likes: 42,  views: 720 },
    ],
  },
];

async function seedNavigation() {
  for (const cat of NAV_SEED) {
    const navCat = await prisma.navCategory.upsert({
      where: { code: cat.code },
      create: {
        code: cat.code, label: cat.label, color: cat.color, bgLight: cat.bgLight,
        icon: cat.icon, sortOrder: cat.sortOrder, active: true,
      },
      update: {
        label: cat.label, color: cat.color, bgLight: cat.bgLight,
        icon: cat.icon, sortOrder: cat.sortOrder, active: true,
      },
    });
    // 项目层面用 (categoryId + label) 做幂等键(NavItem 没有自带 unique,这里实现用先删后建)
    const existingItems = await prisma.navItem.findMany({ where: { categoryId: navCat.id } });
    for (let i = 0; i < cat.items.length; i++) {
      const it = cat.items[i];
      const found = existingItems.find((e) => e.label === it.label);
      if (found) {
        await prisma.navItem.update({
          where: { id: found.id },
          data: {
            icon: it.icon, color: it.color, common: it.common, desc: it.desc,
            likes: it.likes, views: it.views, sortOrder: (i + 1) * 10,
            url: it.url ?? null, active: true,
          },
        });
      } else {
        await prisma.navItem.create({
          data: {
            categoryId: navCat.id,
            icon: it.icon, label: it.label, color: it.color, common: it.common,
            desc: it.desc, likes: it.likes, views: it.views,
            sortOrder: (i + 1) * 10, url: it.url ?? null, active: true,
          },
        });
      }
    }
  }
}

async function main() {
  console.log('🌱 开始 seed 数据...');

  await upsertNode(PARTY_TREE, null);
  console.log('  ✓ 党组织树已写入');

  await upsertNode(ADMIN_TREE, null);
  console.log('  ✓ 行政机构树已写入');

  await seedVirtualOrgs();
  console.log('  ✓ 虚拟组织已写入');

  await seedDictionaries();
  console.log('  ✓ 数据字典已写入');

  await seedCustomFields();
  console.log('  ✓ 用户自定义字段已写入');

  await seedRolesAndPermissions();
  console.log('  ✓ 角色与权限已写入');

  await seedDemoUsers();
  console.log('  ✓ 演示用户已写入');

  await seedNavigation();
  console.log('  ✓ 首页导航已写入');

  const partyCount = await prisma.organization.count({ where: { kind: 'party' } });
  const adminCount = await prisma.organization.count({ where: { kind: 'admin' } });
  const virtualCount = await prisma.organization.count({ where: { isVirtual: true } });
  const roleCount = await prisma.role.count();
  const permCount = await prisma.permission.count();
  const userCount = await prisma.user.count();
  const membershipCount = await prisma.userOrganization.count();
  const dictCount = await prisma.dictionary.count();
  const dictItemCount = await prisma.dictItem.count();
  const cfCount = await prisma.userCustomField.count();
  console.log(`   字典 ${dictCount} · 字典项 ${dictItemCount} · 自定义字段 ${cfCount}`);
  console.log(
    `\n📊 党组织 ${partyCount} · 行政机构 ${adminCount} · 虚拟 ${virtualCount}`,
  );
  console.log(`   用户 ${userCount} · 归属记录 ${membershipCount} · 角色 ${roleCount} · 权限 ${permCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
