/**
 * 中国石油昆仑物流有限公司 — 真实组织结构 fixture(2026-05-25 v2)。
 *
 * 来源:Y:\01软件-2工具箱\00AI工具\行政单位和组织信息.xls(46 行)
 *
 * 树形(用户确认版本):
 *
 *   行政机构(admin)                                                党组织(party)
 *   ───────────────────                                            ──────────────
 *   中国石油昆仑物流有限公司 (level1, name:昆仑物流)                中共中国石油昆仑物流有限公司委员会 (committee, name:昆仑物流党委)
 *   ├─ 公司机关 (level2, isVirtual=true 虚拟分组)                  ├─ 公司机关党委 (committee, L2)
 *   │   ├─ 党委办公室 (level3)                                       │   ├─ 机关第一党支部 (branch, L3)
 *   │   ├─ … 11 个部门                                               │   ├─ … 11 个机关支部
 *   │   └─ 党群工作部 (level3)                                       │   └─ 机关第十一党支部 (branch)
 *   └─ 基层单位 (level2, isVirtual=true 虚拟分组)                   ├─ 塔运司党委 (committee, L2)
 *       ├─ 塔运司 (level3)                                           ├─ 哈萨克分公司党总支 (general, L2)
 *       ├─ 哈萨克分公司 (level3)                                     ├─ … 共 34 个 L2 党组织
 *       ├─ … 共 34 个分公司/中心                                     └─ 教育培训中心党委 (committee, L2)
 *       └─ 教育培训中心 (level3)
 *
 * 关键差异(对比 v1 老版本):
 *  - L2 行政加入虚拟分组节点「基层单位」 → 34 个分公司/中心改挂在它下面(降到 L3)
 *  - L1 admin name 从全名「中国石油昆仑物流有限公司」改为简称「昆仑物流」
 *  - 党侧不加虚拟节点(用户决策)—— 34 个 L2 党组织直接挂 PARTY-ROOT 下
 *
 * 已修正的源数据问题:
 *  - R36-R46 党组织简称列错填,按全称回填正确简称(机关第一/二/三…十一)
 *  - R44「机关第三支部委员会」与 R38 重复,修正为「机关第九支部委员会」
 *  - 党根节点「中共中国石油昆仑物流有限公司委员会」原表未列,补齐
 *
 * code 命名:
 *  - KL = Kunlun Logistics
 *  - ADMIN / PARTY 两棵树
 *  - L1 ROOT,L2 HQ/BASE/NNN,L3 HQ-NN/BASE-NNN
 *  - HQ 后缀代表公司机关支,BASE 后缀代表基层单位支(虚拟)
 */

export type AdminOrgType = 'level1' | 'level2' | 'level3' | 'level4';
export type PartyOrgType = 'committee' | 'general' | 'branch' | 'temp_branch';

export interface KunlunAdminSeed {
  code: string;
  /** 单位/部门简称 — 直接写入 Organization.name */
  shortName: string;
  /** 单位/部门全称 — 当前 schema 没 fullName 列,写注释里以备后续 migration */
  fullName: string;
  type: AdminOrgType;
  sortOrder: number;
  /** 顶级时为 undefined */
  parentCode?: string;
  /** 虚拟分组节点(基层单位) */
  isVirtual?: boolean;
}

export interface KunlunPartySeed {
  code: string;
  shortName: string;
  fullName: string;
  type: PartyOrgType;
  sortOrder: number;
  parentCode?: string;
}

/* ─── 行政机构 ─── */

export const KUNLUN_ADMIN_ORGS: KunlunAdminSeed[] = [
  // L1 顶级
  {
    code: 'KL-ADMIN-ROOT',
    shortName: '昆仑物流',
    fullName: '中国石油昆仑物流有限公司',
    type: 'level1',
    sortOrder: 0,
  },

  // L2 公司机关(虚拟分组节点 — 用户决策:不直接挂业务实体,11 个部门挂它下面)
  {
    code: 'KL-ADMIN-L2-HQ',
    shortName: '公司机关',
    fullName: '中国石油昆仑物流有限公司公司机关',
    type: 'level2',
    sortOrder: 1,
    parentCode: 'KL-ADMIN-ROOT',
    isVirtual: true,
  },
  // L2 基层单位(虚拟分组节点)
  {
    code: 'KL-ADMIN-L2-BASE',
    shortName: '基层单位',
    fullName: '基层单位',
    type: 'level2',
    sortOrder: 2,
    parentCode: 'KL-ADMIN-ROOT',
    isVirtual: true,
  },

  // L3 公司机关下属 11 个部门
  { code: 'KL-ADMIN-L3-HQ-01', shortName: '党委办公室',         fullName: '中国石油昆仑物流有限公司党委办公室',         type: 'level3', sortOrder: 1,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-02', shortName: '发展计划部',         fullName: '中国石油昆仑物流有限公司发展计划部',         type: 'level3', sortOrder: 2,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-03', shortName: '财务部',             fullName: '中国石油昆仑物流有限公司财务部',             type: 'level3', sortOrder: 3,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-04', shortName: '党委组织部',         fullName: '中国石油昆仑物流有限公司党委组织部',         type: 'level3', sortOrder: 4,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-05', shortName: '运行管理部',         fullName: '中国石油昆仑物流有限公司运行管理部',         type: 'level3', sortOrder: 5,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-06', shortName: '物资管理部',         fullName: '中国石油昆仑物流有限公司物资管理部',         type: 'level3', sortOrder: 6,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-07', shortName: '质量健康安全环保部', fullName: '中国石油昆仑物流有限公司质量健康安全环保部', type: 'level3', sortOrder: 7,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-08', shortName: '设备技术部',         fullName: '中国石油昆仑物流有限公司设备技术部',         type: 'level3', sortOrder: 8,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-09', shortName: '科技信息部',         fullName: '中国石油昆仑物流有限公司科技信息部',         type: 'level3', sortOrder: 9,  parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-10', shortName: '纪委办公室',         fullName: '中国石油昆仑物流有限公司纪委办公室',         type: 'level3', sortOrder: 10, parentCode: 'KL-ADMIN-L2-HQ' },
  { code: 'KL-ADMIN-L3-HQ-11', shortName: '党群工作部',         fullName: '中国石油昆仑物流有限公司党群工作部',         type: 'level3', sortOrder: 11, parentCode: 'KL-ADMIN-L2-HQ' },

  // L3 基层单位下属 34 个分公司/中心
  { code: 'KL-ADMIN-L3-BASE-001', shortName: '塔运司',           fullName: '中国石油昆仑物流有限公司塔运司',           type: 'level3', sortOrder: 1,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-002', shortName: '新疆油田运输分公司', fullName: '中国石油昆仑物流有限公司新疆油田运输分公司', type: 'level3', sortOrder: 2,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-003', shortName: '长庆运输分公司',     fullName: '中国石油昆仑物流有限公司长庆运输分公司',     type: 'level3', sortOrder: 3,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-004', shortName: '华北运输分公司',     fullName: '中国石油昆仑物流有限公司华北运输分公司',     type: 'level3', sortOrder: 4,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-005', shortName: '哈萨克分公司',       fullName: '中国石油昆仑物流有限公司哈萨克分公司',       type: 'level3', sortOrder: 5,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-006', shortName: '黑龙江分公司',       fullName: '中国石油昆仑物流有限公司黑龙江分公司',       type: 'level3', sortOrder: 6,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-007', shortName: '吉林分公司',         fullName: '中国石油昆仑物流有限公司吉林分公司',         type: 'level3', sortOrder: 7,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-008', shortName: '辽宁分公司',         fullName: '中国石油昆仑物流有限公司辽宁分公司',         type: 'level3', sortOrder: 8,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-009', shortName: '内蒙古分公司',       fullName: '中国石油昆仑物流有限公司内蒙古分公司',       type: 'level3', sortOrder: 9,  parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-010', shortName: '北京分公司',         fullName: '中国石油昆仑物流有限公司北京分公司',         type: 'level3', sortOrder: 10, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-011', shortName: '河北分公司',         fullName: '中国石油昆仑物流有限公司河北分公司',         type: 'level3', sortOrder: 11, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-012', shortName: '山东分公司',         fullName: '中国石油昆仑物流有限公司山东分公司',         type: 'level3', sortOrder: 12, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-013', shortName: '苏皖分公司',         fullName: '中国石油昆仑物流有限公司苏皖分公司',         type: 'level3', sortOrder: 13, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-014', shortName: '浙江分公司',         fullName: '中国石油昆仑物流有限公司浙江分公司',         type: 'level3', sortOrder: 14, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-015', shortName: '湘鄂分公司',         fullName: '中国石油昆仑物流有限公司湘鄂分公司',         type: 'level3', sortOrder: 15, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-016', shortName: '闽赣分公司',         fullName: '中国石油昆仑物流有限公司闽赣分公司',         type: 'level3', sortOrder: 16, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-017', shortName: '广东分公司',         fullName: '中国石油昆仑物流有限公司广东分公司',         type: 'level3', sortOrder: 17, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-018', shortName: '广西分公司',         fullName: '中国石油昆仑物流有限公司广西分公司',         type: 'level3', sortOrder: 18, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-019', shortName: '云贵分公司',         fullName: '中国石油昆仑物流有限公司云贵分公司',         type: 'level3', sortOrder: 19, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-020', shortName: '重庆分公司',         fullName: '中国石油昆仑物流有限公司重庆分公司',         type: 'level3', sortOrder: 20, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-021', shortName: '四川分公司',         fullName: '中国石油昆仑物流有限公司四川分公司',         type: 'level3', sortOrder: 21, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-022', shortName: '西藏分公司',         fullName: '中国石油昆仑物流有限公司西藏分公司',         type: 'level3', sortOrder: 22, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-023', shortName: '陕豫分公司',         fullName: '中国石油昆仑物流有限公司陕豫分公司',         type: 'level3', sortOrder: 23, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-024', shortName: '甘肃分公司',         fullName: '中国石油昆仑物流有限公司甘肃分公司',         type: 'level3', sortOrder: 24, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-025', shortName: '宁夏分公司',         fullName: '中国石油昆仑物流有限公司宁夏分公司',         type: 'level3', sortOrder: 25, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-026', shortName: '青海分公司',         fullName: '中国石油昆仑物流有限公司青海分公司',         type: 'level3', sortOrder: 26, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-027', shortName: '新疆分公司',         fullName: '中国石油昆仑物流有限公司新疆分公司',         type: 'level3', sortOrder: 27, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-028', shortName: '东北分公司',         fullName: '中国石油昆仑物流有限公司东北分公司',         type: 'level3', sortOrder: 28, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-029', shortName: '西北分公司',         fullName: '中国石油昆仑物流有限公司西北分公司',         type: 'level3', sortOrder: 29, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-030', shortName: '物资分公司',         fullName: '中国石油昆仑物流有限公司物资分公司',         type: 'level3', sortOrder: 30, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-031', shortName: '华油信通公司',       fullName: '中国石油昆仑物流有限公司华油信通公司',       type: 'level3', sortOrder: 31, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-032', shortName: '建安公司',           fullName: '中国石油昆仑物流有限公司建安公司',           type: 'level3', sortOrder: 32, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-033', shortName: '公共事务中心',       fullName: '中国石油昆仑物流有限公司公共事务中心',       type: 'level3', sortOrder: 33, parentCode: 'KL-ADMIN-L2-BASE' },
  { code: 'KL-ADMIN-L3-BASE-034', shortName: '教育培训中心',       fullName: '中国石油昆仑物流有限公司教育培训中心',       type: 'level3', sortOrder: 34, parentCode: 'KL-ADMIN-L2-BASE' },
];

/* ─── 党组织 ─── */
/* 35 个 L2 党组织全部直挂 PARTY-ROOT(用户决策:不加虚拟分组节点) */

export const KUNLUN_PARTY_ORGS: KunlunPartySeed[] = [
  // L1 党组织根
  {
    code: 'KL-PARTY-ROOT',
    shortName: '昆仑物流党委',
    fullName: '中共中国石油昆仑物流有限公司委员会',
    type: 'committee',
    sortOrder: 0,
  },

  // L2 公司机关党委(实体)
  {
    code: 'KL-PARTY-L2-HQ',
    shortName: '公司机关党委',
    fullName: '中共中国石油昆仑物流有限公司机关委员会',
    type: 'committee',
    sortOrder: 1,
    parentCode: 'KL-PARTY-ROOT',
  },

  // L2 × 34(各分公司党委 / 党总支)直挂顶级党委下
  { code: 'KL-PARTY-L2-001', shortName: '塔运司党委',           fullName: '中共中国石油昆仑物流有限公司塔运司委员会',           type: 'committee', sortOrder: 2,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-002', shortName: '新疆油田运输分公司党委', fullName: '中共中国石油昆仑物流有限公司新疆油田运输分公司委员会', type: 'committee', sortOrder: 3,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-003', shortName: '长庆运输分公司党委',     fullName: '中共中国石油昆仑物流有限公司长庆运输分公司委员会',     type: 'committee', sortOrder: 4,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-004', shortName: '华北运输分公司党委',     fullName: '中共中国石油昆仑物流有限公司华北运输分公司委员会',     type: 'committee', sortOrder: 5,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-005', shortName: '哈萨克分公司党总支',     fullName: '中共中国石油昆仑物流有限公司哈萨克分公司总支部委员会', type: 'general',   sortOrder: 6,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-006', shortName: '黑龙江分公司党委',       fullName: '中共中国石油昆仑物流有限公司黑龙江分公司委员会',       type: 'committee', sortOrder: 7,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-007', shortName: '吉林分公司党委',         fullName: '中共中国石油昆仑物流有限公司吉林分公司委员会',         type: 'committee', sortOrder: 8,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-008', shortName: '辽宁分公司党委',         fullName: '中共中国石油昆仑物流有限公司辽宁分公司委员会',         type: 'committee', sortOrder: 9,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-009', shortName: '内蒙古分公司党委',       fullName: '中共中国石油昆仑物流有限公司内蒙古分公司委员会',       type: 'committee', sortOrder: 10, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-010', shortName: '北京分公司党委',         fullName: '中共中国石油昆仑物流有限公司北京分公司委员会',         type: 'committee', sortOrder: 11, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-011', shortName: '河北分公司党委',         fullName: '中共中国石油昆仑物流有限公司河北分公司委员会',         type: 'committee', sortOrder: 12, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-012', shortName: '山东分公司党委',         fullName: '中共中国石油昆仑物流有限公司山东分公司委员会',         type: 'committee', sortOrder: 13, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-013', shortName: '苏皖分公司党委',         fullName: '中共中国石油昆仑物流有限公司苏皖分公司委员会',         type: 'committee', sortOrder: 14, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-014', shortName: '浙江分公司党委',         fullName: '中共中国石油昆仑物流有限公司浙江分公司委员会',         type: 'committee', sortOrder: 15, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-015', shortName: '湘鄂分公司党委',         fullName: '中共中国石油昆仑物流有限公司湘鄂分公司委员会',         type: 'committee', sortOrder: 16, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-016', shortName: '闽赣分公司党委',         fullName: '中共中国石油昆仑物流有限公司闽赣分公司委员会',         type: 'committee', sortOrder: 17, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-017', shortName: '广东分公司党委',         fullName: '中共中国石油昆仑物流有限公司广东分公司委员会',         type: 'committee', sortOrder: 18, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-018', shortName: '广西分公司党委',         fullName: '中共中国石油昆仑物流有限公司广西分公司委员会',         type: 'committee', sortOrder: 19, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-019', shortName: '云贵分公司党委',         fullName: '中共中国石油昆仑物流有限公司云贵分公司委员会',         type: 'committee', sortOrder: 20, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-020', shortName: '重庆分公司党委',         fullName: '中共中国石油昆仑物流有限公司重庆分公司委员会',         type: 'committee', sortOrder: 21, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-021', shortName: '四川分公司党委',         fullName: '中共中国石油昆仑物流有限公司四川分公司委员会',         type: 'committee', sortOrder: 22, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-022', shortName: '西藏分公司党委',         fullName: '中共中国石油昆仑物流有限公司西藏分公司委员会',         type: 'committee', sortOrder: 23, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-023', shortName: '陕豫分公司党委',         fullName: '中共中国石油昆仑物流有限公司陕豫分公司委员会',         type: 'committee', sortOrder: 24, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-024', shortName: '甘肃分公司党委',         fullName: '中共中国石油昆仑物流有限公司甘肃分公司委员会',         type: 'committee', sortOrder: 25, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-025', shortName: '宁夏分公司党委',         fullName: '中共中国石油昆仑物流有限公司宁夏分公司委员会',         type: 'committee', sortOrder: 26, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-026', shortName: '青海分公司党委',         fullName: '中共中国石油昆仑物流有限公司青海分公司委员会',         type: 'committee', sortOrder: 27, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-027', shortName: '新疆分公司党委',         fullName: '中共中国石油昆仑物流有限公司新疆分公司委员会',         type: 'committee', sortOrder: 28, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-028', shortName: '东北分公司党委',         fullName: '中共中国石油昆仑物流有限公司东北分公司委员会',         type: 'committee', sortOrder: 29, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-029', shortName: '西北分公司党委',         fullName: '中共中国石油昆仑物流有限公司西北分公司委员会',         type: 'committee', sortOrder: 30, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-030', shortName: '物资分公司党委',         fullName: '中共中国石油昆仑物流有限公司物资分公司委员会',         type: 'committee', sortOrder: 31, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-031', shortName: '华油信通公司党委',       fullName: '中共中国石油昆仑物流有限公司华油信通公司委员会',       type: 'committee', sortOrder: 32, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-032', shortName: '建安公司党委',           fullName: '中共中国石油昆仑物流有限公司建安公司委员会',           type: 'committee', sortOrder: 33, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-033', shortName: '公共事务中心党委',       fullName: '中共中国石油昆仑物流有限公司公共事务中心委员会',       type: 'committee', sortOrder: 34, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-034', shortName: '教育培训中心党委',       fullName: '中共中国石油昆仑物流有限公司教育培训中心委员会',       type: 'committee', sortOrder: 35, parentCode: 'KL-PARTY-ROOT' },

  // L3 公司机关党委下属 11 个党支部(简称按全称回填,源表的简称列错填了)
  { code: 'KL-PARTY-L3-HQ-01', shortName: '机关第一党支部',   fullName: '中共中国石油昆仑物流有限公司机关第一支部委员会',   type: 'branch', sortOrder: 1,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-02', shortName: '机关第二党支部',   fullName: '中共中国石油昆仑物流有限公司机关第二支部委员会',   type: 'branch', sortOrder: 2,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-03', shortName: '机关第三党支部',   fullName: '中共中国石油昆仑物流有限公司机关第三支部委员会',   type: 'branch', sortOrder: 3,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-04', shortName: '机关第四党支部',   fullName: '中共中国石油昆仑物流有限公司机关第四支部委员会',   type: 'branch', sortOrder: 4,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-05', shortName: '机关第五党支部',   fullName: '中共中国石油昆仑物流有限公司机关第五支部委员会',   type: 'branch', sortOrder: 5,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-06', shortName: '机关第六党支部',   fullName: '中共中国石油昆仑物流有限公司机关第六支部委员会',   type: 'branch', sortOrder: 6,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-07', shortName: '机关第七党支部',   fullName: '中共中国石油昆仑物流有限公司机关第七支部委员会',   type: 'branch', sortOrder: 7,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-08', shortName: '机关第八党支部',   fullName: '中共中国石油昆仑物流有限公司机关第八支部委员会',   type: 'branch', sortOrder: 8,  parentCode: 'KL-PARTY-L2-HQ' },
  // 第九:源表 R44 写错了「第三」,修正为「第九」
  { code: 'KL-PARTY-L3-HQ-09', shortName: '机关第九党支部',   fullName: '中共中国石油昆仑物流有限公司机关第九支部委员会',   type: 'branch', sortOrder: 9,  parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-10', shortName: '机关第十党支部',   fullName: '中共中国石油昆仑物流有限公司机关第十支部委员会',   type: 'branch', sortOrder: 10, parentCode: 'KL-PARTY-L2-HQ' },
  { code: 'KL-PARTY-L3-HQ-11', shortName: '机关第十一党支部', fullName: '中共中国石油昆仑物流有限公司机关第十一支部委员会', type: 'branch', sortOrder: 11, parentCode: 'KL-PARTY-L2-HQ' },
];

/**
 * 行政 ↔ 党组织 1:1 对应表(按源表同行配对)。
 * - L3 公司机关 11 部门 ↔ 11 机关党支部
 * - L3 基层单位 34 分公司/中心 ↔ 34 二级党委/党总支
 * 注:R44 科技信息部 对应 机关第九党支部(修正过)。
 */
export const KUNLUN_ADMIN_TO_PARTY: Array<{ adminCode: string; partyCode: string }> = [
  // 公司机关 11 个部门 ↔ 11 个机关党支部
  ...Array.from({ length: 11 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      adminCode: `KL-ADMIN-L3-HQ-${n}`,
      partyCode: `KL-PARTY-L3-HQ-${n}`,
    };
  }),
  // 基层单位 34 个 ↔ 34 个分公司党委/党总支
  ...Array.from({ length: 34 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return {
      adminCode: `KL-ADMIN-L3-BASE-${n}`,
      partyCode: `KL-PARTY-L2-${n}`,
    };
  }),
];
