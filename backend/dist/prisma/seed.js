"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const PARTY_TREE = {
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
                { code: 'PARTY-BR-06', name: '第六党支部·市场运营部', kind: 'party', type: 'branch', sortOrder: 6 },
                { code: 'PARTY-BR-07', name: '第七党支部·法律合规处', kind: 'party', type: 'branch', sortOrder: 7 },
                { code: 'PARTY-BR-08', name: '第八党支部·后勤保障处', kind: 'party', type: 'branch', sortOrder: 8 },
                { code: 'PARTY-BR-09', name: '第九党支部·安全管理处', kind: 'party', type: 'branch', sortOrder: 9 },
                { code: 'PARTY-BR-10', name: '第十党支部·宣传文化处', kind: 'party', type: 'branch', sortOrder: 10 },
            ],
        },
    ],
};
const ADMIN_TREE = {
    code: 'ADMIN-ROOT',
    name: '集团公司',
    kind: 'admin',
    type: 'level1',
    sortOrder: 0,
    children: [
        { code: 'ADMIN-HQ', name: '总部办公室', kind: 'admin', type: 'level2', sortOrder: 1 },
        { code: 'ADMIN-GEN', name: '机关综合处', kind: 'admin', type: 'level2', sortOrder: 2 },
        { code: 'ADMIN-FIN', name: '财务审计处', kind: 'admin', type: 'level2', sortOrder: 3 },
        { code: 'ADMIN-HR', name: '人力资源处', kind: 'admin', type: 'level2', sortOrder: 4 },
        { code: 'ADMIN-BIZ', name: '业务发展部', kind: 'admin', type: 'level2', sortOrder: 5 },
        { code: 'ADMIN-IT', name: '信息技术中心', kind: 'admin', type: 'level2', sortOrder: 6 },
        { code: 'ADMIN-MKT', name: '市场运营部', kind: 'admin', type: 'level2', sortOrder: 7 },
        { code: 'ADMIN-LAW', name: '法律合规处', kind: 'admin', type: 'level2', sortOrder: 8 },
        { code: 'ADMIN-LOG', name: '后勤保障处', kind: 'admin', type: 'level2', sortOrder: 9 },
        { code: 'ADMIN-SEC', name: '安全管理处', kind: 'admin', type: 'level2', sortOrder: 10 },
        { code: 'ADMIN-PR', name: '宣传文化处', kind: 'admin', type: 'level2', sortOrder: 11 },
    ],
};
async function upsertNode(node, parentId) {
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
const VIRTUAL_ORGS = [
    { node: { code: 'VPARTY-TASKFORCE', name: '党建学习专班', kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 100 }, parentCode: 'PARTY-ROOT' },
    { node: { code: 'VPARTY-COMMANDO', name: '党员突击队', kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 101 }, parentCode: 'PARTY-ROOT' },
    { node: { code: 'VPARTY-SERVICE', name: '党员服务队', kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 102 }, parentCode: 'PARTY-ROOT' },
    { node: { code: 'VADMIN-DIGITAL', name: '数字化转型项目组', kind: 'admin', type: 'level2', isVirtual: true, sortOrder: 100 }, parentCode: 'ADMIN-ROOT' },
    { node: { code: 'VADMIN-AUDIT-25', name: '2025 年度审计专班', kind: 'admin', type: 'level3', isVirtual: true, sortOrder: 101 }, parentCode: 'ADMIN-FIN' },
];
async function seedVirtualOrgs() {
    for (const { node, parentCode } of VIRTUAL_ORGS) {
        const parent = await prisma.organization.findUnique({ where: { code: parentCode } });
        await upsertNode(node, parent?.id ?? null);
    }
}
async function seedRolesAndPermissions() {
    const permissions = [
        { code: 'admin:menu', name: '管理后台菜单', category: 'menu' },
        { code: 'admin:org:read', name: '查看组织树', category: 'operation' },
        { code: 'admin:org:write', name: '管理组织树', category: 'operation' },
        { code: 'admin:user:read', name: '查看用户', category: 'operation' },
        { code: 'admin:user:write', name: '管理用户', category: 'operation' },
        { code: 'admin:role:read', name: '查看角色', category: 'operation' },
        { code: 'admin:role:write', name: '管理角色与权限', category: 'operation' },
        { code: 'admin:plugin:manage', name: '管理插件', category: 'operation' },
        { code: 'portal:view', name: '访问门户首页', category: 'menu' },
    ];
    for (const p of permissions) {
        await prisma.permission.upsert({
            where: { code: p.code },
            create: { ...p, builtin: true },
            update: { name: p.name, category: p.category, builtin: true },
        });
    }
    const roles = [
        { code: 'platform_admin', name: '平台管理员', perms: permissions.map((p) => p.code) },
        { code: 'party_secretary', name: '党支部书记', perms: ['portal:view', 'admin:org:read', 'admin:user:read'] },
        { code: 'dept_manager', name: '部门经理', perms: ['portal:view', 'admin:user:read'] },
        { code: 'member', name: '普通用户', perms: ['portal:view'] },
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
async function seedDemoUsers() {
    const orgByCode = async (code) => {
        const o = await prisma.organization.findUnique({ where: { code } });
        if (!o)
            throw new Error(`org ${code} not found`);
        return o;
    };
    const roleByCode = async (code) => {
        const r = await prisma.role.findUnique({ where: { code } });
        if (!r)
            throw new Error(`role ${code} not found`);
        return r;
    };
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
    const deptMgrRole = await roleByCode('dept_manager');
    const memberRole = await roleByCode('member');
    const wang = await prisma.user.upsert({
        where: { username: 'wang_zs' },
        create: { username: 'wang_zs', name: '王总书记', email: 'wang@dyy.local', active: true },
        update: { name: '王总书记' },
    });
    const partyRoot = await orgByCode('PARTY-ROOT');
    const branch01 = await orgByCode('PARTY-BR-01');
    const adminRoot = await orgByCode('ADMIN-ROOT');
    const vPartyTf = await orgByCode('VPARTY-TASKFORCE');
    const vAdminDig = await orgByCode('VADMIN-DIGITAL');
    await prisma.userOrganization.deleteMany({ where: { userId: wang.id } });
    await prisma.userOrganization.createMany({
        data: [
            { userId: wang.id, orgId: branch01.id, position: '党员', isPrimary: true },
            { userId: wang.id, orgId: partyRoot.id, position: '党委书记', isPrimary: false },
            { userId: wang.id, orgId: adminRoot.id, position: '总经理', isPrimary: true },
            { userId: wang.id, orgId: vPartyTf.id, position: '专班组长', isPrimary: false },
            { userId: wang.id, orgId: vAdminDig.id, position: '项目组组长', isPrimary: false },
        ],
    });
    await prisma.userRole.deleteMany({ where: { userId: wang.id } });
    await prisma.userRole.createMany({
        data: [
            { userId: wang.id, roleId: partySecRole.id, scope: 'all' },
            { userId: wang.id, roleId: deptMgrRole.id, scope: 'all' },
        ],
    });
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
            { userId: li.id, orgId: branch02.id, position: '支部书记', isPrimary: true },
            { userId: li.id, orgId: adminFin.id, position: '财务审计处经理', isPrimary: true },
            { userId: li.id, orgId: vAuditTf.id, position: '审计专班组长', isPrimary: false },
        ],
    });
    await prisma.userRole.deleteMany({ where: { userId: li.id } });
    await prisma.userRole.create({
        data: {
            userId: li.id,
            roleId: partySecRole.id,
            scope: 'custom',
            scopeOrgs: { create: [{ orgId: branch02.id }] },
        },
    });
    await prisma.userRole.create({
        data: {
            userId: li.id,
            roleId: deptMgrRole.id,
            scope: 'custom',
            scopeOrgs: { create: [{ orgId: adminFin.id }, { orgId: vAuditTf.id }] },
        },
    });
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
            { userId: zhang.id, orgId: branch01.id, position: '党员', isPrimary: true },
            { userId: zhang.id, orgId: adminGen.id, position: '综合干事', isPrimary: true },
            { userId: zhang.id, orgId: vSvcZhang.id, position: '服务队队员', isPrimary: false },
            { userId: zhang.id, orgId: vAdminDig.id, position: '技术骨干', isPrimary: false },
        ],
    });
    await prisma.userRole.deleteMany({ where: { userId: zhang.id } });
    await prisma.userRole.create({
        data: { userId: zhang.id, roleId: memberRole.id, scope: 'self' },
    });
    const zhao = await prisma.user.upsert({
        where: { username: 'zhao_zy' },
        create: { username: 'zhao_zy', name: '赵专员', email: 'zhao@dyy.local', active: true },
        update: { name: '赵专员' },
    });
    const branch03 = await orgByCode('PARTY-BR-03');
    const adminHr = await orgByCode('ADMIN-HR');
    await prisma.userOrganization.deleteMany({ where: { userId: zhao.id } });
    await prisma.userOrganization.createMany({
        data: [
            { userId: zhao.id, orgId: branch03.id, position: '党员', isPrimary: true },
            { userId: zhao.id, orgId: adminHr.id, position: '人力资源专员', isPrimary: true },
            { userId: zhao.id, orgId: vPartyTf.id, position: '专班成员', isPrimary: false },
            { userId: zhao.id, orgId: vAdminDig.id, position: '项目协调', isPrimary: false },
        ],
    });
    await prisma.userRole.deleteMany({ where: { userId: zhao.id } });
    await prisma.userRole.create({
        data: { userId: zhao.id, roleId: memberRole.id, scope: 'self' },
    });
    const qian = await prisma.user.upsert({
        where: { username: 'qian_hero' },
        create: { username: 'qian_hero', name: '钱英雄', email: 'qian@dyy.local', active: true },
        update: { name: '钱英雄' },
    });
    const branch05 = await orgByCode('PARTY-BR-05');
    const adminIt = await orgByCode('ADMIN-IT');
    const vCmd = await orgByCode('VPARTY-COMMANDO');
    const vSvc = await orgByCode('VPARTY-SERVICE');
    await prisma.userOrganization.deleteMany({ where: { userId: qian.id } });
    await prisma.userOrganization.createMany({
        data: [
            { userId: qian.id, orgId: branch05.id, position: '支部副书记', isPrimary: true },
            { userId: qian.id, orgId: adminIt.id, position: 'IT 工程师', isPrimary: true },
            { userId: qian.id, orgId: vCmd.id, position: '突击队队长', isPrimary: false },
            { userId: qian.id, orgId: vSvc.id, position: '服务队队员', isPrimary: false },
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
const DICTIONARIES = [
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
                    { code: 'general_manager', label: '总经理' },
                    { code: 'deputy_general_manager', label: '副总经理' },
                    { code: 'chief_engineer', label: '总工程师' },
                    { code: 'chief_economist', label: '总经济师' },
                    { code: 'chief_accountant', label: '总会计师' },
                    { code: 'department_head', label: '部长 / 处长' },
                    { code: 'deputy_department_head', label: '副部长 / 副处长' },
                    { code: 'manager', label: '经理' },
                    { code: 'deputy_manager', label: '副经理' },
                    { code: 'director', label: '主任' },
                    { code: 'deputy_director', label: '副主任' },
                    { code: 'supervisor', label: '主管' },
                ],
            },
            {
                code: 'tech', label: '技术类',
                description: '工程技术系列岗位',
                children: [
                    { code: 'senior_engineer', label: '高级工程师' },
                    { code: 'engineer', label: '工程师' },
                    { code: 'assistant_engineer', label: '助理工程师' },
                    { code: 'technician', label: '技术员' },
                ],
            },
            {
                code: 'ops', label: '操作类',
                description: '日常行政 / 一线作业岗位',
                children: [
                    { code: 'specialist', label: '专员' },
                    { code: 'staff', label: '干事 / 职员' },
                    { code: 'team_leader', label: '班组长' },
                    { code: 'worker', label: '一线员工' },
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
                    { code: 'member', label: '党员' },
                    { code: 'probationary_member', label: '预备党员' },
                ],
            },
            {
                code: 'committee_role', label: '党委职务',
                children: [
                    { code: 'party_secretary', label: '党委书记' },
                    { code: 'deputy_party_secretary', label: '党委副书记' },
                    { code: 'party_committee_member', label: '党委委员' },
                ],
            },
            {
                code: 'general_role', label: '党总支职务',
                children: [
                    { code: 'general_secretary', label: '党总支书记' },
                    { code: 'deputy_general_secretary', label: '党总支副书记' },
                ],
            },
            {
                code: 'branch_role', label: '党支部职务',
                children: [
                    { code: 'branch_secretary', label: '支部书记' },
                    { code: 'deputy_branch_secretary', label: '支部副书记' },
                    { code: 'organization_member', label: '组织委员' },
                    { code: 'propaganda_member', label: '宣传委员' },
                    { code: 'discipline_member', label: '纪检委员' },
                    { code: 'youth_league_member', label: '青年委员' },
                ],
            },
            {
                code: 'group_role', label: '党小组职务',
                children: [
                    { code: 'group_leader', label: '党小组长' },
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
            { code: 'high_school', label: '高中 / 中专' },
            { code: 'junior_college', label: '大专' },
            { code: 'bachelor', label: '本科' },
            { code: 'master', label: '硕士' },
            { code: 'doctor', label: '博士' },
            { code: 'other', label: '其他' },
        ],
    },
    {
        code: 'user_political_status',
        name: '政治面貌',
        description: '用户政治面貌,1 级扁平字典 (无分类)',
        builtin: true,
        sortOrder: 40,
        items: [
            { code: 'party_member', label: '中共党员' },
            { code: 'probationary_member', label: '中共预备党员' },
            { code: 'league_member', label: '共青团员' },
            { code: 'democratic_party', label: '民主党派' },
            { code: 'masses', label: '群众' },
        ],
    },
    {
        code: 'user_gender',
        name: '性别',
        description: '用户性别,1 级扁平字典',
        builtin: true,
        sortOrder: 50,
        items: [
            { code: 'male', label: '男' },
            { code: 'female', label: '女' },
            { code: 'other', label: '其他' },
        ],
    },
    {
        code: 'user_marital_status',
        name: '婚姻状况',
        description: '用户婚姻状况,1 级扁平字典',
        builtin: true,
        sortOrder: 60,
        items: [
            { code: 'single', label: '未婚' },
            { code: 'married', label: '已婚' },
            { code: 'divorced', label: '离异' },
            { code: 'widowed', label: '丧偶' },
        ],
    },
];
const CUSTOM_FIELDS = [
    { code: 'gender', label: '性别', type: 'select', dictCode: 'user_gender', sortOrder: 10, builtin: true },
    { code: 'birth_date', label: '出生日期', type: 'date', sortOrder: 20, builtin: true },
    { code: 'id_card_no', label: '身份证号', type: 'text', placeholder: '18 位身份证号', sortOrder: 30, builtin: true },
    { code: 'hire_date', label: '入职日期', type: 'date', sortOrder: 40, builtin: true },
    { code: 'education', label: '学历', type: 'select', dictCode: 'user_education', sortOrder: 50, builtin: true },
    { code: 'political_status', label: '政治面貌', type: 'select', dictCode: 'user_political_status', sortOrder: 60, builtin: true },
    { code: 'marital_status', label: '婚姻状况', type: 'select', dictCode: 'user_marital_status', sortOrder: 70, builtin: true },
    { code: 'native_place', label: '籍贯', type: 'text', placeholder: '如 山东济南', sortOrder: 80, builtin: true },
    { code: 'address', label: '家庭住址', type: 'textarea', sortOrder: 90, builtin: true },
    { code: 'emergency_name', label: '紧急联系人', type: 'text', sortOrder: 100, builtin: true },
    { code: 'emergency_phone', label: '紧急联系电话', type: 'text', sortOrder: 110, builtin: true },
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
        for (let i = 0; i < d.items.length; i++) {
            const cat = d.items[i];
            if (!cat.children)
                continue;
            const parent = await prisma.dictItem.findUnique({
                where: { dictId_code: { dictId: dict.id, code: cat.code } },
            });
            if (!parent)
                continue;
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
    console.log(`\n📊 党组织 ${partyCount} · 行政机构 ${adminCount} · 虚拟 ${virtualCount}`);
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
//# sourceMappingURL=seed.js.map