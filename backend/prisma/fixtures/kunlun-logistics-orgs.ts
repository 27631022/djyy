/**
 * 中国石油昆仑物流有限公司 — 真实组织结构 fixture。
 *
 * 来源:Y:\01软件-2工具箱\00AI工具\行政单位和组织信息.xls(2026-05-25 导入)
 * 共 46 条记录:35 条二级单位 + 11 条公司机关下属部门。
 *
 * 数据结构:两个平行树 — 行政机构(admin) + 党组织(party),都以「中国石油昆仑物流」为根。
 *
 *   行政机构(admin)                                         党组织(party)
 *   ───────────────────                                    ─────────────────
 *   中国石油昆仑物流有限公司 (level1)                       中共中国石油昆仑物流有限公司委员会 (committee, 隐含)
 *   ├─ 塔运司 ...                  (level2 × 35)            ├─ 塔运司党委 ...           (committee × 34)
 *   │                                                        ├─ 哈萨克分公司党总支         (general × 1)
 *   └─ 公司机关 (level2)                                    └─ 公司机关党委 (committee)
 *      ├─ 党委办公室 ...           (level3 × 11)              ├─ 机关第一党支部 ...    (branch × 11)
 *
 * 已修正的源数据问题:
 *  - R36-R46(机关支部)党组织简称列原表全部是「机关第一党支部」(应是 1~11)→ 这里按全称里
 *    「第一/第二/…第十一」对应回填简称。
 *  - R44 科技信息部 党组织全称原表「机关第三支部委员会」与 R38 财务部重复,按上下文(R43=第八,
 *    R45=第十)修正为「机关第九支部委员会」,对应简称「机关第九党支部」。
 *  - 党组织根节点「中共中国石油昆仑物流有限公司委员会」在原表中未单列,这里补齐作为 L2 级的父节点。
 *
 * code 命名规则:
 *  - KL = Kunlun Logistics(项目内固定前缀,跟其他客户数据隔开)
 *  - ADMIN / PARTY 分两树
 *  - ROOT / L2-NNN / L3-NNN 表层级
 */

export type AdminOrgType = 'level1' | 'level2' | 'level3' | 'level4';
export type PartyOrgType = 'committee' | 'general' | 'branch' | 'temp_branch';

export interface KunlunAdminSeed {
  code: string;
  /** 单位/部门简称 */
  shortName: string;
  /** 单位/部门全称 */
  fullName: string;
  type: AdminOrgType;
  sortOrder: number;
  /** 顶级时为 undefined */
  parentCode?: string;
}

export interface KunlunPartySeed {
  code: string;
  /** 党组织简称(例:塔运司党委、机关第一党支部) */
  shortName: string;
  /** 党组织全称(例:中共中国石油昆仑物流有限公司塔运司委员会) */
  fullName: string;
  type: PartyOrgType;
  sortOrder: number;
  /** 顶级时为 undefined */
  parentCode?: string;
}

/* ─── 行政机构 ─── */

export const KUNLUN_ADMIN_ORGS: KunlunAdminSeed[] = [
  {
    code: 'KL-ADMIN-ROOT',
    shortName: '中国石油昆仑物流有限公司',
    fullName: '中国石油昆仑物流有限公司',
    type: 'level1',
    sortOrder: 0,
  },
  // L2 × 35(行政表 R1-R35),按表内顺序保留 sortOrder
  { code: 'KL-ADMIN-L2-001', shortName: '塔运司',           fullName: '中国石油昆仑物流有限公司塔运司',           type: 'level2', sortOrder: 1,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-002', shortName: '新疆油田运输分公司', fullName: '中国石油昆仑物流有限公司新疆油田运输分公司', type: 'level2', sortOrder: 2,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-003', shortName: '长庆运输分公司',     fullName: '中国石油昆仑物流有限公司长庆运输分公司',     type: 'level2', sortOrder: 3,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-004', shortName: '华北运输分公司',     fullName: '中国石油昆仑物流有限公司华北运输分公司',     type: 'level2', sortOrder: 4,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-005', shortName: '哈萨克分公司',       fullName: '中国石油昆仑物流有限公司哈萨克分公司',       type: 'level2', sortOrder: 5,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-006', shortName: '黑龙江分公司',       fullName: '中国石油昆仑物流有限公司黑龙江分公司',       type: 'level2', sortOrder: 6,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-007', shortName: '吉林分公司',         fullName: '中国石油昆仑物流有限公司吉林分公司',         type: 'level2', sortOrder: 7,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-008', shortName: '辽宁分公司',         fullName: '中国石油昆仑物流有限公司辽宁分公司',         type: 'level2', sortOrder: 8,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-009', shortName: '内蒙古分公司',       fullName: '中国石油昆仑物流有限公司内蒙古分公司',       type: 'level2', sortOrder: 9,  parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-010', shortName: '北京分公司',         fullName: '中国石油昆仑物流有限公司北京分公司',         type: 'level2', sortOrder: 10, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-011', shortName: '河北分公司',         fullName: '中国石油昆仑物流有限公司河北分公司',         type: 'level2', sortOrder: 11, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-012', shortName: '山东分公司',         fullName: '中国石油昆仑物流有限公司山东分公司',         type: 'level2', sortOrder: 12, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-013', shortName: '苏皖分公司',         fullName: '中国石油昆仑物流有限公司苏皖分公司',         type: 'level2', sortOrder: 13, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-014', shortName: '浙江分公司',         fullName: '中国石油昆仑物流有限公司浙江分公司',         type: 'level2', sortOrder: 14, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-015', shortName: '湘鄂分公司',         fullName: '中国石油昆仑物流有限公司湘鄂分公司',         type: 'level2', sortOrder: 15, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-016', shortName: '闽赣分公司',         fullName: '中国石油昆仑物流有限公司闽赣分公司',         type: 'level2', sortOrder: 16, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-017', shortName: '广东分公司',         fullName: '中国石油昆仑物流有限公司广东分公司',         type: 'level2', sortOrder: 17, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-018', shortName: '广西分公司',         fullName: '中国石油昆仑物流有限公司广西分公司',         type: 'level2', sortOrder: 18, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-019', shortName: '云贵分公司',         fullName: '中国石油昆仑物流有限公司云贵分公司',         type: 'level2', sortOrder: 19, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-020', shortName: '重庆分公司',         fullName: '中国石油昆仑物流有限公司重庆分公司',         type: 'level2', sortOrder: 20, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-021', shortName: '四川分公司',         fullName: '中国石油昆仑物流有限公司四川分公司',         type: 'level2', sortOrder: 21, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-022', shortName: '西藏分公司',         fullName: '中国石油昆仑物流有限公司西藏分公司',         type: 'level2', sortOrder: 22, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-023', shortName: '陕豫分公司',         fullName: '中国石油昆仑物流有限公司陕豫分公司',         type: 'level2', sortOrder: 23, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-024', shortName: '甘肃分公司',         fullName: '中国石油昆仑物流有限公司甘肃分公司',         type: 'level2', sortOrder: 24, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-025', shortName: '宁夏分公司',         fullName: '中国石油昆仑物流有限公司宁夏分公司',         type: 'level2', sortOrder: 25, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-026', shortName: '青海分公司',         fullName: '中国石油昆仑物流有限公司青海分公司',         type: 'level2', sortOrder: 26, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-027', shortName: '新疆分公司',         fullName: '中国石油昆仑物流有限公司新疆分公司',         type: 'level2', sortOrder: 27, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-028', shortName: '东北分公司',         fullName: '中国石油昆仑物流有限公司东北分公司',         type: 'level2', sortOrder: 28, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-029', shortName: '西北分公司',         fullName: '中国石油昆仑物流有限公司西北分公司',         type: 'level2', sortOrder: 29, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-030', shortName: '物资分公司',         fullName: '中国石油昆仑物流有限公司物资分公司',         type: 'level2', sortOrder: 30, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-031', shortName: '华油信通公司',       fullName: '中国石油昆仑物流有限公司华油信通公司',       type: 'level2', sortOrder: 31, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-032', shortName: '建安公司',           fullName: '中国石油昆仑物流有限公司建安公司',           type: 'level2', sortOrder: 32, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-033', shortName: '公共事务中心',       fullName: '中国石油昆仑物流有限公司公共事务中心',       type: 'level2', sortOrder: 33, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-034', shortName: '教育培训中心',       fullName: '中国石油昆仑物流有限公司教育培训中心',       type: 'level2', sortOrder: 34, parentCode: 'KL-ADMIN-ROOT' },
  { code: 'KL-ADMIN-L2-035', shortName: '公司机关',           fullName: '中国石油昆仑物流有限公司公司机关',           type: 'level2', sortOrder: 35, parentCode: 'KL-ADMIN-ROOT' },

  // L3 × 11(行政表 R36-R46),挂在公司机关下
  { code: 'KL-ADMIN-L3-001', shortName: '党委办公室',         fullName: '中国石油昆仑物流有限公司党委办公室',         type: 'level3', sortOrder: 1,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-002', shortName: '发展计划部',         fullName: '中国石油昆仑物流有限公司发展计划部',         type: 'level3', sortOrder: 2,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-003', shortName: '财务部',             fullName: '中国石油昆仑物流有限公司财务部',             type: 'level3', sortOrder: 3,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-004', shortName: '党委组织部',         fullName: '中国石油昆仑物流有限公司党委组织部',         type: 'level3', sortOrder: 4,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-005', shortName: '运行管理部',         fullName: '中国石油昆仑物流有限公司运行管理部',         type: 'level3', sortOrder: 5,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-006', shortName: '物资管理部',         fullName: '中国石油昆仑物流有限公司物资管理部',         type: 'level3', sortOrder: 6,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-007', shortName: '质量健康安全环保部', fullName: '中国石油昆仑物流有限公司质量健康安全环保部', type: 'level3', sortOrder: 7,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-008', shortName: '设备技术部',         fullName: '中国石油昆仑物流有限公司设备技术部',         type: 'level3', sortOrder: 8,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-009', shortName: '科技信息部',         fullName: '中国石油昆仑物流有限公司科技信息部',         type: 'level3', sortOrder: 9,  parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-010', shortName: '纪委办公室',         fullName: '中国石油昆仑物流有限公司纪委办公室',         type: 'level3', sortOrder: 10, parentCode: 'KL-ADMIN-L2-035' },
  { code: 'KL-ADMIN-L3-011', shortName: '党群工作部',         fullName: '中国石油昆仑物流有限公司党群工作部',         type: 'level3', sortOrder: 11, parentCode: 'KL-ADMIN-L2-035' },
];

/* ─── 党组织 ─── */

export const KUNLUN_PARTY_ORGS: KunlunPartySeed[] = [
  {
    code: 'KL-PARTY-ROOT',
    shortName: '昆仑物流党委',
    fullName: '中共中国石油昆仑物流有限公司委员会',
    type: 'committee',
    sortOrder: 0,
  },
  // L2 × 35(对应行政表 R1-R35 的党组织信息):34 个党委 + 1 个党总支(哈萨克)
  { code: 'KL-PARTY-L2-001', shortName: '塔运司党委',           fullName: '中共中国石油昆仑物流有限公司塔运司委员会',           type: 'committee', sortOrder: 1,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-002', shortName: '新疆油田运输分公司党委', fullName: '中共中国石油昆仑物流有限公司新疆油田运输分公司委员会', type: 'committee', sortOrder: 2,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-003', shortName: '长庆运输分公司党委',     fullName: '中共中国石油昆仑物流有限公司长庆运输分公司委员会',     type: 'committee', sortOrder: 3,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-004', shortName: '华北运输分公司党委',     fullName: '中共中国石油昆仑物流有限公司华北运输分公司委员会',     type: 'committee', sortOrder: 4,  parentCode: 'KL-PARTY-ROOT' },
  // 党总支(唯一一个非党委的 L2)
  { code: 'KL-PARTY-L2-005', shortName: '哈萨克分公司党总支',     fullName: '中共中国石油昆仑物流有限公司哈萨克分公司总支部委员会', type: 'general',   sortOrder: 5,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-006', shortName: '黑龙江分公司党委',       fullName: '中共中国石油昆仑物流有限公司黑龙江分公司委员会',       type: 'committee', sortOrder: 6,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-007', shortName: '吉林分公司党委',         fullName: '中共中国石油昆仑物流有限公司吉林分公司委员会',         type: 'committee', sortOrder: 7,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-008', shortName: '辽宁分公司党委',         fullName: '中共中国石油昆仑物流有限公司辽宁分公司委员会',         type: 'committee', sortOrder: 8,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-009', shortName: '内蒙古分公司党委',       fullName: '中共中国石油昆仑物流有限公司内蒙古分公司委员会',       type: 'committee', sortOrder: 9,  parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-010', shortName: '北京分公司党委',         fullName: '中共中国石油昆仑物流有限公司北京分公司委员会',         type: 'committee', sortOrder: 10, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-011', shortName: '河北分公司党委',         fullName: '中共中国石油昆仑物流有限公司河北分公司委员会',         type: 'committee', sortOrder: 11, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-012', shortName: '山东分公司党委',         fullName: '中共中国石油昆仑物流有限公司山东分公司委员会',         type: 'committee', sortOrder: 12, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-013', shortName: '苏皖分公司党委',         fullName: '中共中国石油昆仑物流有限公司苏皖分公司委员会',         type: 'committee', sortOrder: 13, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-014', shortName: '浙江分公司党委',         fullName: '中共中国石油昆仑物流有限公司浙江分公司委员会',         type: 'committee', sortOrder: 14, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-015', shortName: '湘鄂分公司党委',         fullName: '中共中国石油昆仑物流有限公司湘鄂分公司委员会',         type: 'committee', sortOrder: 15, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-016', shortName: '闽赣分公司党委',         fullName: '中共中国石油昆仑物流有限公司闽赣分公司委员会',         type: 'committee', sortOrder: 16, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-017', shortName: '广东分公司党委',         fullName: '中共中国石油昆仑物流有限公司广东分公司委员会',         type: 'committee', sortOrder: 17, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-018', shortName: '广西分公司党委',         fullName: '中共中国石油昆仑物流有限公司广西分公司委员会',         type: 'committee', sortOrder: 18, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-019', shortName: '云贵分公司党委',         fullName: '中共中国石油昆仑物流有限公司云贵分公司委员会',         type: 'committee', sortOrder: 19, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-020', shortName: '重庆分公司党委',         fullName: '中共中国石油昆仑物流有限公司重庆分公司委员会',         type: 'committee', sortOrder: 20, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-021', shortName: '四川分公司党委',         fullName: '中共中国石油昆仑物流有限公司四川分公司委员会',         type: 'committee', sortOrder: 21, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-022', shortName: '西藏分公司党委',         fullName: '中共中国石油昆仑物流有限公司西藏分公司委员会',         type: 'committee', sortOrder: 22, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-023', shortName: '陕豫分公司党委',         fullName: '中共中国石油昆仑物流有限公司陕豫分公司委员会',         type: 'committee', sortOrder: 23, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-024', shortName: '甘肃分公司党委',         fullName: '中共中国石油昆仑物流有限公司甘肃分公司委员会',         type: 'committee', sortOrder: 24, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-025', shortName: '宁夏分公司党委',         fullName: '中共中国石油昆仑物流有限公司宁夏分公司委员会',         type: 'committee', sortOrder: 25, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-026', shortName: '青海分公司党委',         fullName: '中共中国石油昆仑物流有限公司青海分公司委员会',         type: 'committee', sortOrder: 26, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-027', shortName: '新疆分公司党委',         fullName: '中共中国石油昆仑物流有限公司新疆分公司委员会',         type: 'committee', sortOrder: 27, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-028', shortName: '东北分公司党委',         fullName: '中共中国石油昆仑物流有限公司东北分公司委员会',         type: 'committee', sortOrder: 28, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-029', shortName: '西北分公司党委',         fullName: '中共中国石油昆仑物流有限公司西北分公司委员会',         type: 'committee', sortOrder: 29, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-030', shortName: '物资分公司党委',         fullName: '中共中国石油昆仑物流有限公司物资分公司委员会',         type: 'committee', sortOrder: 30, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-031', shortName: '华油信通公司党委',       fullName: '中共中国石油昆仑物流有限公司华油信通公司委员会',       type: 'committee', sortOrder: 31, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-032', shortName: '建安公司党委',           fullName: '中共中国石油昆仑物流有限公司建安公司委员会',           type: 'committee', sortOrder: 32, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-033', shortName: '公共事务中心党委',       fullName: '中共中国石油昆仑物流有限公司公共事务中心委员会',       type: 'committee', sortOrder: 33, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-034', shortName: '教育培训中心党委',       fullName: '中共中国石油昆仑物流有限公司教育培训中心委员会',       type: 'committee', sortOrder: 34, parentCode: 'KL-PARTY-ROOT' },
  { code: 'KL-PARTY-L2-035', shortName: '公司机关党委',           fullName: '中共中国石油昆仑物流有限公司机关委员会',           type: 'committee', sortOrder: 35, parentCode: 'KL-PARTY-ROOT' },

  // L3 × 11 党支部(行政表 R36-R46 对应党组织),挂在公司机关党委下
  // 简称按全称的「第 N 支部」回填(源表 R36-R46 的简称列因数据错填全部是「机关第一党支部」,已修正)
  { code: 'KL-PARTY-L3-001', shortName: '机关第一党支部',   fullName: '中共中国石油昆仑物流有限公司机关第一支部委员会',   type: 'branch', sortOrder: 1,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-002', shortName: '机关第二党支部',   fullName: '中共中国石油昆仑物流有限公司机关第二支部委员会',   type: 'branch', sortOrder: 2,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-003', shortName: '机关第三党支部',   fullName: '中共中国石油昆仑物流有限公司机关第三支部委员会',   type: 'branch', sortOrder: 3,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-004', shortName: '机关第四党支部',   fullName: '中共中国石油昆仑物流有限公司机关第四支部委员会',   type: 'branch', sortOrder: 4,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-005', shortName: '机关第五党支部',   fullName: '中共中国石油昆仑物流有限公司机关第五支部委员会',   type: 'branch', sortOrder: 5,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-006', shortName: '机关第六党支部',   fullName: '中共中国石油昆仑物流有限公司机关第六支部委员会',   type: 'branch', sortOrder: 6,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-007', shortName: '机关第七党支部',   fullName: '中共中国石油昆仑物流有限公司机关第七支部委员会',   type: 'branch', sortOrder: 7,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-008', shortName: '机关第八党支部',   fullName: '中共中国石油昆仑物流有限公司机关第八支部委员会',   type: 'branch', sortOrder: 8,  parentCode: 'KL-PARTY-L2-035' },
  // 第九:R44 原表全称写成「第三支部委员会」与 R38 重复,按上下文修正为「第九」
  { code: 'KL-PARTY-L3-009', shortName: '机关第九党支部',   fullName: '中共中国石油昆仑物流有限公司机关第九支部委员会',   type: 'branch', sortOrder: 9,  parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-010', shortName: '机关第十党支部',   fullName: '中共中国石油昆仑物流有限公司机关第十支部委员会',   type: 'branch', sortOrder: 10, parentCode: 'KL-PARTY-L2-035' },
  { code: 'KL-PARTY-L3-011', shortName: '机关第十一党支部', fullName: '中共中国石油昆仑物流有限公司机关第十一支部委员会', type: 'branch', sortOrder: 11, parentCode: 'KL-PARTY-L2-035' },
];

/**
 * 行政机构 ↔ 党组织 的 1:1 对应关系(按源表 R1-R46 的同行配对)。
 * 用途:发证时若用户指定行政单位,可一键拿到对应党组织(反之亦然)。
 * **仅 R1-R35 是真 1:1**;R36-R46 的行政部门 → 党组织对应关系在源表里语义不明
 *  (行政部门有 11 个、党支部也有 11 个,但 1:1 还是分组关系源表没说),这里保留行政→党的
 *  顺位映射(R36↔KL-PARTY-L3-001,R37↔L3-002,...),后续若发现不准再调。
 */
export const KUNLUN_ADMIN_TO_PARTY: Array<{ adminCode: string; partyCode: string }> = [
  ...Array.from({ length: 35 }, (_, i) => ({
    adminCode: `KL-ADMIN-L2-${String(i + 1).padStart(3, '0')}`,
    partyCode: `KL-PARTY-L2-${String(i + 1).padStart(3, '0')}`,
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    adminCode: `KL-ADMIN-L3-${String(i + 1).padStart(3, '0')}`,
    partyCode: `KL-PARTY-L3-${String(i + 1).padStart(3, '0')}`,
  })),
];
