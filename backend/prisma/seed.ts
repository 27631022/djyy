/**
 * 党建益友 种子数据
 * 运行: npm run db:seed
 *
 * 组织结构(2026-05-25 固化为「中国石油昆仑物流有限公司」真实结构,
 * 详见 fixtures/kunlun-logistics-orgs.ts):
 *
 *   行政机构(kind=admin)                            党组织(kind=party)
 *   ─────────                                       ─────────
 *   昆仑物流 (level1)                                昆仑物流党委 (committee)
 *   ├─ 公司机关 (level2, virtual)                   ├─ 公司机关党委 (committee, L2)
 *   │   └─ 11 个部门 (level3,党委办公室~党群工作部)  │   └─ 11 个机关党支部 (branch, L3)
 *   └─ 基层单位 (level2, virtual)                   └─ 34 个二级党组织(直挂顶级)
 *       └─ 34 个分公司/中心 (level3)                     ├─ 33 个分公司党委 (committee)
 *                                                        └─ 哈萨克分公司党总支 (general)
 *
 * 演示用户(2026-05-31:人员名册已固化到 fixtures/demo-users.ts,此处只留概览):
 *   admin    平台管理员(非自然人,seed 单独 upsert,保留用于管理 + Mock 登录)
 *   朱海君 80545411 党群工作部 经理 / 机关第十一党支部 书记(+dept_manager +party_secretary)
 *   张明 / 杨一凡 / 李月        党群工作部   / 机关第十一党支部
 *   王金雨 / 安丽               党委组织部   / 机关第四党支部
 *   李峰 / 孙彩霞 / 李桂红      塔运司各科室 / 塔运司各党支部
 *
 * 约定:position 挂主行政归属,partyPosition 挂党组织归属(可空);
 *       行政、党组织各 isPrimary=true,列表才会分别在「主行政岗位 / 党组织归属」列显示。
 *       增删演示人员请改 fixtures/demo-users.ts(单一事实来源)。
 */

import { PrismaClient } from '@prisma/client';
import {
  KUNLUN_ADMIN_ORGS,
  KUNLUN_PARTY_ORGS,
  type KunlunAdminSeed,
  type KunlunPartySeed,
} from './fixtures/kunlun-logistics-orgs';
import { DEMO_USERS } from './fixtures/demo-users';

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

// 删除 2026-05-25 以前的演示 demo 组织(老 `PARTY-` 与 `ADMIN-` 前缀树)。
// 老 demo 数据没有任何客户在用,只是开发期 placeholder。
// 这些 code 的 userOrganization / userRoleScope FK 都设了 onDelete:Cascade,
// 删 org 时会自动清掉用户归属/角色 scope,不会 FK 失败。
//
// 反复删叶子直到树清空(parentId 自引用,DB 没设 cascade,得手动反向)。
const LEGACY_DEMO_ORG_CODES = [
  // 老 PARTY 树
  'PARTY-ROOT', 'PARTY-ORG-DEPT', 'PARTY-MASS-WORK', 'PARTY-GRASSROOTS',
  'PARTY-BR-01', 'PARTY-BR-02', 'PARTY-BR-03', 'PARTY-BR-04', 'PARTY-BR-05',
  'PARTY-BR-06', 'PARTY-BR-07', 'PARTY-BR-08', 'PARTY-BR-09', 'PARTY-BR-10',
  // 老 ADMIN 树
  'ADMIN-ROOT', 'ADMIN-HQ', 'ADMIN-GEN', 'ADMIN-FIN', 'ADMIN-HR', 'ADMIN-BIZ',
  'ADMIN-IT', 'ADMIN-MKT', 'ADMIN-LAW', 'ADMIN-LOG', 'ADMIN-SEC', 'ADMIN-PR',
];

async function purgeLegacyDemoOrgs(): Promise<number> {
  let total = 0;
  for (let i = 0; i < 100; i++) {
    const leaves = await prisma.organization.findMany({
      where: {
        code: { in: LEGACY_DEMO_ORG_CODES },
        children: { none: {} },
      },
      select: { id: true },
    });
    if (leaves.length === 0) break;
    const r = await prisma.organization.deleteMany({
      where: { id: { in: leaves.map((l) => l.id) } },
    });
    total += r.count;
  }
  return total;
}

/* ─── 主组织树:消费 fixtures/kunlun-logistics-orgs.ts ─── */
async function seedKunlunOrgs() {
  const upsertOne = async (
    node: KunlunAdminSeed | KunlunPartySeed,
    kind: 'admin' | 'party',
    parentIdByCode: Map<string, string>,
  ): Promise<void> => {
    const parentId = node.parentCode
      ? (parentIdByCode.get(node.parentCode) ?? null)
      : null;
    if (node.parentCode && !parentId) {
      throw new Error(
        `[seed] node ${node.code} 的父节点 ${node.parentCode} 未找到 —— fixture 顺序错误?`,
      );
    }
    const isVirtual = (node as KunlunAdminSeed).isVirtual === true;
    const data = {
      name: node.shortName,
      fullName: node.fullName,
      code: node.code,
      kind,
      type: node.type,
      isVirtual,
      sortOrder: node.sortOrder,
      active: true,
      parentId,
    };
    const existing = await prisma.organization.findUnique({
      where: { code: node.code },
    });
    const saved = existing
      ? await prisma.organization.update({ where: { id: existing.id }, data })
      : await prisma.organization.create({ data });
    parentIdByCode.set(node.code, saved.id);
  };

  const adminMap = new Map<string, string>();
  for (const n of KUNLUN_ADMIN_ORGS) await upsertOne(n, 'admin', adminMap);

  const partyMap = new Map<string, string>();
  for (const n of KUNLUN_PARTY_ORGS) await upsertOne(n, 'party', partyMap);
}

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
  /* 党组织 · 临时党支部(虚拟)— 挂在昆仑物流党委下 */
  { node: { code: 'VPARTY-TASKFORCE', name: '党建学习专班', kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 100 }, parentCode: 'KL-PARTY-ROOT' },
  { node: { code: 'VPARTY-COMMANDO',  name: '党员突击队',   kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 101 }, parentCode: 'KL-PARTY-ROOT' },
  { node: { code: 'VPARTY-SERVICE',   name: '党员服务队',   kind: 'party', type: 'temp_branch', isVirtual: true, sortOrder: 102 }, parentCode: 'KL-PARTY-ROOT' },
  /* 行政 · 虚拟(跨部门项目组)—— 挂在公司机关 / 财务部 */
  { node: { code: 'VADMIN-DIGITAL',   name: '数字化转型项目组', kind: 'admin', type: 'level3', isVirtual: true, sortOrder: 100 }, parentCode: 'KL-ADMIN-L2-HQ' },
  { node: { code: 'VADMIN-AUDIT-25',  name: '2025 年度审计专班', kind: 'admin', type: 'level4', isVirtual: true, sortOrder: 101 }, parentCode: 'KL-ADMIN-L3-HQ-03' },
];

async function seedVirtualOrgs() {
  for (const { node, parentCode } of VIRTUAL_ORGS) {
    const parent = await prisma.organization.findUnique({ where: { code: parentCode } });
    await upsertNode(node, parent?.id ?? null);
  }
}

/* ─── 外部 API 接入(LLM 等)预置 ─── */
async function seedExternalApis() {
  const items: Array<{
    provider: string;
    name: string;
    description: string;
    apiUrl: string;
    model: string;
    visionModel?: string;
    imageModel?: string;
    model3d?: string;
    rechargeUrl: string;
    priority: number;
    capabilities: string;
  }> = [
    {
      provider: 'deepseek',
      name: 'DeepSeek 大模型',
      description:
        '深度求索,性价比首选,中文能力强。证书 AI 提取推荐 v4-flash(便宜+快)。' +
        '主线产品当前为纯文本,vision 未公开。base_url 用 OpenAI 兼容那个。',
      apiUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      rechargeUrl: 'https://platform.deepseek.com/top_up',
      priority: 80,
      capabilities: 'chat,reasoning',
    },
    {
      provider: 'doubao',
      name: '字节豆包',
      description:
        '火山引擎豆包,长上下文 + 多模态(支持 OCR/图像理解)。' +
        '注意:model 是带日期后缀的 ID(如 doubao-1-5-pro-32k-250115)。' +
        '可到「模型推理 → 在线推理」复制账户实际开通的 model ID,或自建端点用 ep-xxx。',
      apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-1-5-pro-32k-250115',
      visionModel: 'doubao-1-5-vision-pro-32k-250115',
      imageModel: 'doubao-seedream-5-0-260128',
      model3d: 'doubao-seed3d-2-0-260328',
      rechargeUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
      priority: 70,
      // image=Seedream 图生图(AI 头像)、3d=Seed3D 图生 3D(模型台)。
      // ⚠ 能力路由按标签过滤,且下方 update 每次 reseed 会刷新 capabilities ——
      // 这里少了标签,reseed 就会把 UI 里勾的能力冲掉,头像/3D 生成随即报「未找到可用模型」
      capabilities: 'chat,vision,reasoning,image,3d',
    },
    {
      provider: 'qwen',
      name: '阿里通义千问',
      description:
        'Qwen 系列,阿里云出品,国内访问稳定。VL 模型(qwen-vl-max)支持图像理解。',
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      visionModel: 'qwen-vl-max',
      rechargeUrl: 'https://dashscope.console.aliyun.com/billing',
      priority: 70,
      capabilities: 'chat,vision',
    },
    {
      provider: 'openai',
      name: 'OpenAI GPT',
      description:
        'GPT-4o 系列,通用能力最强,英文+逻辑突出,多模态原生支持。',
      apiUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      visionModel: 'gpt-4o',
      rechargeUrl: 'https://platform.openai.com/account/billing/overview',
      priority: 60,
      capabilities: 'chat,vision,reasoning',
    },
    {
      provider: 'ernie',
      name: '百度文心一言',
      description: 'ERNIE 系列(千帆平台),党政场景适配好,支持多模态。',
      apiUrl: 'https://qianfan.baidubce.com/v2',
      model: 'ernie-4.0-8k',
      visionModel: 'ernie-4.0-turbo-vl',
      rechargeUrl: 'https://console.bce.baidu.com/qianfan/overview',
      priority: 50,
      capabilities: 'chat,vision',
    },
  ];
  for (const i of items) {
    await prisma.externalApi.upsert({
      where: { provider: i.provider },
      create: {
        provider: i.provider,
        name: i.name,
        description: i.description,
        apiUrl: i.apiUrl,
        model: i.model,
        visionModel: i.visionModel,
        rechargeUrl: i.rechargeUrl,
        priority: i.priority,
        capabilities: i.capabilities,
        active: true,
        // apiKey 故意留空 — 管理员到 UI 录入
      },
      // 不覆盖管理员已配的 apiKey/apiUrl/model/active,
      // 但刷新:元数据 + 新引入字段 + 默认 priority(用户可后续 UI 改)
      // 注:priority/capabilities 是新加字段,首次 seed 覆盖到位是合理默认,
      //     用户在 UI 调整后会被保留(下次 seed 不会覆盖,因为 upsert.update 内
      //     已是 idempotent;如果想强制重置,可以手动改 seed 加备份字段)
      update: {
        name: i.name,
        description: i.description,
        rechargeUrl: i.rechargeUrl,
        visionModel: i.visionModel,
        imageModel: i.imageModel,
        model3d: i.model3d,
        capabilities: i.capabilities,
        priority: i.priority,
      },
    });
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
    // 删除证书(V3)— 仅 platform_admin 拥有(其余内置角色不含),实现"只有管理员可删"
    { code: 'certificate:delete',        name: '删除证书',         category: 'operation' },
    // 文件存储(storage)— file:upload 发给能发证的角色(当前内置仅 platform_admin),file:delete 仅管理员
    { code: 'file:upload',               name: '上传文件',         category: 'operation' },
    { code: 'file:delete',               name: '删除文件',         category: 'operation' },
    // 任务分派(task)— manage:建模板/派发/汇总;review:审核通过退回;reception:接收管理员分派+对口;fill:填报
    { code: 'task:manage',               name: '任务管理(建模板/派发)',  category: 'operation' },
    { code: 'task:review',               name: '任务审核(通过/退回)',    category: 'operation' },
    { code: 'task:reception',            name: '任务接收管理(分派/对口)', category: 'operation' },
    { code: 'task:fill',                 name: '任务填报',                category: 'operation' },
    // 虚拟展厅(exhibition)— 布展管理(建厅/编辑空间 JSON/删厅);浏览公开免权限
    { code: 'exhibition:manage',         name: '展厅管理(布展)',          category: 'operation' },
    // 会场管理(venue)— manage:会议室/会场图设计 + 选座
    { code: 'venue:manage',              name: '会场管理(会议室/会场图/选座)', category: 'operation' },
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
    // 企业管理员:全套企业管理权限(不含 角色授权 admin:role:write / 插件 / 删除证书 / 删除文件 等高危权限,留 platform_admin)。
    // 一级 vs 二级 = 同角色不同 scope:分配时 scope=all(一级,全集团)或 scope=subtree(二级,自动锚到派发人所在单位的子树)。
    // 任务域已按 scope 强制;组织/用户管理的范围限制后续按需加。
    { code: 'enterprise_admin', name: '企业管理员', perms: ['portal:view', 'admin:menu', 'admin:org:read', 'admin:org:write', 'admin:user:read', 'admin:user:write', 'admin:role:read', 'certificate:issue', 'certificate:revoke', 'certificate:bulk-download', 'task:manage', 'task:review', 'task:reception', 'task:fill', 'file:upload', 'exhibition:manage', 'venue:manage'] },
    { code: 'party_secretary', name: '党支部书记',   perms: ['portal:view', 'admin:org:read', 'admin:user:read', 'task:manage', 'task:review', 'task:reception', 'task:fill', 'file:upload'] },
    { code: 'dept_manager',    name: '部门经理',     perms: ['portal:view', 'admin:user:read', 'task:manage', 'task:review', 'task:reception', 'task:fill', 'file:upload'] },
    // 任务派发:给各级机关部门的派发人;配合 UserRole.scope(本组织+下级 / 自定义单位)限定派发范围
    { code: 'task_dispatcher', name: '任务派发',     perms: ['portal:view', 'task:manage', 'task:review', 'file:upload'] },
    { code: 'member',          name: '普通用户',     perms: ['portal:view', 'task:fill'] },
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

/* ─── 虚拟展厅:示例厅「企业文化展厅」 ───
 * 布局(米,原点=平面图中心):外墙 24×14,x=-5 处一道带 2.4m 门洞的内隔墙,
 * 分出西侧序厅(7×14,入口 LOGO 立体字)与东侧主展区(17×14)。
 * seed 无 StorageService,素材全空 → 客户端渲染「精致占位」;荣誉墙/公开板
 * 用 text-only manual 内容,空厅也有真实观感。
 */
async function seedExhibitionHall() {
  const walls = [
    // 外墙(逆时针围合)
    { id: 'w1', x1: -12, y1: -7, x2: 12, y2: -7 }, // 南
    { id: 'w2', x1: 12, y1: -7, x2: 12, y2: 7 }, // 东
    { id: 'w3', x1: 12, y1: 7, x2: -12, y2: 7 }, // 北
    { id: 'w4', x1: -12, y1: 7, x2: -12, y2: -7 }, // 西
    // 内隔墙(x=-5,中间留 2.4m 门洞:y∈[-1.2,1.2])
    { id: 'w5', x1: -5, y1: -7, x2: -5, y2: -1.2 },
    { id: 'w6', x1: -5, y1: 1.2, x2: -5, y2: 7 },
  ];
  // rot 约定:0=朝-Y(平面图下方),90=朝+X,180=朝+Y,270=朝-X
  const fixtures = [
    // ── 序厅(x∈[-12,-5]) ──
    {
      id: 'fx_logo', type: 'text_3d', x: -11.5, y: 0, rot: 90, w: 6, d: 0.4,
      label: '展厅标题',
      source: { mode: 'manual', content: { text: '企业文化展厅', sizeM: 0.85, depthM: 0.16, finish: 'metal', mount: 'wall' } },
    },
    {
      id: 'fx_door', type: 'door', x: -5, y: 0, rot: 90, w: 2.4, d: 0.5,
      label: '主展区入口',
      source: { mode: 'manual', content: null },
    },
    // ── 主展区(x∈[-5,12]) ──
    {
      id: 'fx_slogan', type: 'text_3d', x: -4.7, y: 3.5, rot: 90, w: 5.5, d: 0.3,
      label: '标语',
      source: { mode: 'manual', content: { text: '凝心聚力 · 共创未来', sizeM: 0.45, depthM: 0.1, finish: 'glow', mount: 'wall' } },
    },
    {
      id: 'fx_honor', type: 'honor_wall', x: 4, y: 6.7, rot: 0, w: 4.5, d: 0.3,
      label: '荣誉墙',
      source: {
        mode: 'manual',
        content: {
          items: [
            { title: '全国五一劳动奖状', level: '国家级', year: 2023 },
            { title: '国家高新技术企业', level: '国家级', year: 2022 },
            { title: '省级文明单位', level: '省部级', year: 2024 },
            { title: '省安全生产先进集体', level: '省部级', year: 2023 },
            { title: '行业质量标杆企业', level: '行业级', year: 2024 },
            { title: '五四红旗团委', level: '省部级', year: 2025 },
          ],
        },
      },
    },
    {
      id: 'fx_notice', type: 'notice_board', x: -1.5, y: 6.7, rot: 0, w: 2.6, d: 0.3,
      label: '党务公开板',
      source: {
        mode: 'manual',
        content: {
          items: [
            { title: '支部换届选举结果公示', date: '2026-05' },
            { title: '六月主题党日活动通知', date: '2026-06' },
            { title: '党费收缴情况公示(上半年)', date: '2026-06' },
          ],
        },
      },
    },
    {
      id: 'fx_img1', type: 'image_case', x: 0, y: -6.7, rot: 180, w: 1.8, d: 0.6,
      label: '企业发展历程',
      source: { mode: 'manual', content: { images: [] } },
    },
    {
      id: 'fx_img2', type: 'image_case', x: 4.5, y: -6.7, rot: 180, w: 1.8, d: 0.6,
      label: '党建活动掠影',
      source: { mode: 'manual', content: { images: [] } },
    },
    {
      id: 'fx_video', type: 'video_wall', x: 11.7, y: 0, rot: 270, w: 4.2, d: 0.3,
      label: '企业宣传片',
      source: { mode: 'manual', content: {} },
    },
    {
      id: 'fx_model', type: 'model_stand', x: 3.5, y: 0, rot: 0, w: 1.2, d: 1.2,
      label: '产品模型',
      source: { mode: 'manual', content: {} },
    },
  ];
  const meta = {
    gridM: 0.5,
    wallH: 4.5, // 挑高显大气
    spawn: { x: -8.5, y: 0, rot: 90 }, // 序厅中心,面向主展区
    theme: { preset: 'modern_light', accent: '#C8001E' },
  };
  await prisma.hall.upsert({
    where: { id: 'hall-demo-culture' },
    create: {
      id: 'hall-demo-culture',
      name: '企业文化展厅',
      metaJson: JSON.stringify(meta),
      wallsJson: JSON.stringify(walls),
      fixturesJson: JSON.stringify(fixtures),
      published: true,
      sortOrder: 0,
    },
    update: {
      name: '企业文化展厅',
      metaJson: JSON.stringify(meta),
      wallsJson: JSON.stringify(walls),
      fixturesJson: JSON.stringify(fixtures),
      published: true,
    },
  });
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

  // admin 平台账号(非真实自然人,保留用于平台管理 + Mock 登录)。
  // update 固化身份:即使有人在界面上改过 admin 的姓名/邮箱,re-seed 也会归位(防串号)。
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      name: '系统管理员',
      email: 'admin@dyy.local',
      active: true,
      roles: { create: [{ role: { connect: { code: 'platform_admin' } }, scope: 'all' }] },
    },
    update: {
      name: '系统管理员',
      email: 'admin@dyy.local',
      active: true,
    },
  });

  // 清理 2026-05 之前的虚构演示用户(王总书记/李经理/张三/赵专员/钱英雄)。
  // 用户已要求把默认用户替换为塔运司真实样例 8 人。
  // 删 user 会级联清 UserOrganization / UserRole;Certificate.recipientUserId 为 SetNull,不会 FK 失败。
  const OBSOLETE_DEMO_USERNAMES = ['wang_zs', 'li_mgr', 'zhang_san', 'zhao_zy', 'qian_hero'];
  await prisma.user.deleteMany({ where: { username: { in: OBSOLETE_DEMO_USERNAMES } } });

  /* ─── 样例人员名册(固化在 fixtures/demo-users.ts,含朱海君 + 截图 8 人)─── */
  // position 挂主行政归属;partyPosition 挂党组织归属(可空)。
  // 行政、党组织各 isPrimary=true 才会在列表分列显示「主行政岗位 / 党组织归属」。
  const memberRole = await roleByCode('member');

  for (const spec of DEMO_USERS) {
    // update 同样固化 name/email/active —— mock 是权威,re-seed 自愈界面上的手动漂移。
    const user = await prisma.user.upsert({
      where: { username: spec.username },
      create: { username: spec.username, name: spec.name, email: `${spec.username}@dyy.local`, active: true },
      update: { name: spec.name, email: `${spec.username}@dyy.local`, active: true },
    });

    const adminOrg = await orgByCode(spec.adminCode);
    const partyOrg = await orgByCode(spec.partyCode);

    // 归属:行政主岗(带职务,isPrimary) + 党支部(可带党内职务,isPrimary 以便列表展示)
    await prisma.userOrganization.deleteMany({ where: { userId: user.id } });
    await prisma.userOrganization.createMany({
      data: [
        { userId: user.id, orgId: adminOrg.id, position: spec.position,            isPrimary: true },
        { userId: user.id, orgId: partyOrg.id, position: spec.partyPosition ?? null, isPrimary: true },
      ],
    });

    // 角色:基础 member(self) + 附加角色(custom scope 指向部门/支部)
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: memberRole.id, scope: 'self' },
    });
    for (const er of spec.extraRoles ?? []) {
      const role = await roleByCode(er.code);
      const scopeOrg = await orgByCode(er.scopeCode);
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scope: 'custom',
          scopeOrgs: { create: [{ orgId: scopeOrg.id }] },
        },
      });
    }
  }
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
  {
    code: 'cert_honor_level',
    name: '荣誉等级',
    description: '证书模板的荣誉等级。模板设计器下拉用,发证 Step 2 + 模板浏览页按此分组/过滤',
    builtin: true,
    sortOrder: 70,
    items: [
      { code: 'company',     label: '公司级' },
      { code: 'department',  label: '部门级' },
      { code: 'subsidiary',  label: '分公司级' },
    ],
  },
  {
    code: 'venue_roster_group',
    name: '会议名单默认分组',
    description: '会议排座导入人员时的默认分组(名单工作台的快捷建组按钮)。在此增删改即改默认分组,无需改代码',
    builtin: true,
    sortOrder: 80,
    items: [
      { code: 'jiguan',   label: '机关组' },
      { code: 'jiceng',   label: '基层组' },
      { code: 'shangtai', label: '上台领奖组' },
    ],
  },
  {
    code: 'venue_special_type',
    name: '会议特殊人员类别',
    description: '会议排座中标记「特殊人员」的类别(来宾/记者/列席…)。特殊人员默认不参与自动排座、待手动指定座并锁定。在此增删改即改可选类别,无需改代码',
    builtin: true,
    sortOrder: 81,
    items: [
      { code: 'guest',    label: '来宾' },
      { code: 'press',    label: '记者' },
      { code: 'observer', label: '列席' },
      { code: 'staff',    label: '工作人员' },
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

  await seedKunlunOrgs();
  console.log(
    `  ✓ 昆仑物流真实组织树已写入(行政 ${KUNLUN_ADMIN_ORGS.length} + 党组织 ${KUNLUN_PARTY_ORGS.length})`,
  );

  await seedVirtualOrgs();
  console.log('  ✓ 虚拟组织(临时党支部 / 跨部门项目组)已写入');

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

  await seedExternalApis();
  console.log('  ✓ 外部 API 预置已写入');

  await seedExhibitionHall();
  console.log('  ✓ 示例展厅「企业文化展厅」已写入');

  // 收尾清理:此时所有 user 归属 / 虚拟组织都已重新指向 KL-* 节点,
  // 老的 PARTY-*/ADMIN-* 节点既无业务引用也无 children,可放心删。
  const purged = await purgeLegacyDemoOrgs();
  if (purged > 0) {
    console.log(`  ✓ 清理老 demo 组织 ${purged} 条`);
  }

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

  await seedVenueExamples();
}

/** 预置示例会议室 + 一张已发布座次图(幂等 upsert,可改可删);开箱即用看会场/排座 */
async function seedVenueExamples() {
  const room = await prisma.meetingRoom.upsert({
    where: { id: 'seed-venue-room-1' },
    update: {},
    create: {
      id: 'seed-venue-room-1',
      name: '综合楼三楼大会议室',
      location: '综合楼 3F',
      capacity: 120,
      description: '示例会议室(可改可删)',
      facilities: JSON.stringify(['视频会议', '音响系统', '投屏']),
      active: true,
    },
  });

  // 手写「标准表彰布局」:横幅 + 主席台 + 6 排 × 10 座
  const base = { rotation: 0, opacity: 1, visible: true, locked: false };
  const elements: unknown[] = [
    {
      id: 'banner1', type: 'banner', x: 200, y: 30, width: 800, height: 60, ...base,
      name: '横幅', text: '表彰大会', fontFamily: '"Microsoft YaHei", sans-serif', fontSize: 32, color: '#FFFFFF', bg: '#C8001E',
    },
    {
      id: 'pre1', type: 'presidium', x: 400, y: 120, width: 400, height: 60, ...base,
      name: '主席台', fill: '#FCA5A5', stroke: '#C8001E', strokeWidth: 2, label: '主席台',
    },
  ];
  const cols = 10, rows = 6, seatW = 36, seatH = 36, gapX = 16, gapY = 22;
  const startX = Math.round((1200 - (cols * seatW + (cols - 1) * gapX)) / 2);
  const startY = 240;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      elements.push({
        id: `seat_${r + 1}_${c + 1}`, type: 'seat',
        x: startX + c * (seatW + gapX), y: startY + r * (seatH + gapY),
        width: seatW, height: seatH, ...base, name: `${r + 1}排${c + 1}号`, fill: '#DBEAFE', seatNo: '',
      });
    }
  }
  const layoutJson = JSON.stringify({
    elements,
    background: { type: 'color', color: '#FFFFFF' },
    canvasWidth: 1200, canvasHeight: 700, gridSize: 20, showGrid: true,
  });
  await prisma.venueLayout.upsert({
    where: { id: 'seed-venue-layout-1' },
    update: {},
    create: {
      id: 'seed-venue-layout-1', roomId: room.id, name: '标准表彰布局(60座)',
      layoutJson, width: 1200, height: 700, gridSize: 20, seatCount: n, status: 'published', active: true,
    },
  });
  console.log(`   会场 示例会议室 1 · 座次图 1(${n} 座,已发布)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
