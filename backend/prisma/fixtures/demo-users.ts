/**
 * 演示 / Mock 人员名册 —— 固化的样例用户数据(单一事实来源)。
 *
 * 2026-05-31:用户要求把人员数据固化到 mock。原先散在 seed.ts 的 seedDemoUsers() 里,
 * 现抽到本 fixture(与 kunlun-logistics-orgs.ts 同一套路),seed 消费它。
 * 以后增删演示人员只改这一处。
 *
 * 约定:
 *  - position      挂「主行政归属」(行政机构),= 名册截图的「职务」列
 *  - partyPosition 挂「党组织归属」(党支部),可空(空 = 普通党员,列表不显示职务徽章)
 *  - 行政、党组织各自 isPrimary=true,用户列表才会分列显示「主行政岗位 / 党组织归属」
 *  - 角色:每人基础 member(self) + extraRoles(custom scope 指向某组织 code)
 *  - 平台 admin 账号在 seed.ts 单独 upsert(platform_admin / scope=all),不在此名册
 *
 * 组织 code 见 fixtures/kunlun-logistics-orgs.ts:
 *  - KL-ADMIN-L3-HQ-11 党群工作部 / KL-ADMIN-L3-HQ-04 党委组织部
 *  - KL-ADMIN-L4-TYS-01 塔运司·领导班子 / -02 综合办公室 / -03 特车运输大队
 *  - KL-PARTY-L3-HQ-11 机关第十一党支部 / KL-PARTY-L3-HQ-04 机关第四党支部
 *  - KL-PARTY-L3-TYS-01 塔运司机关党支部 / KL-PARTY-L3-TYS-02 特车运输大队党支部
 */

export interface DemoUserSeed {
  /** 员工编号(= 登录名,唯一) */
  username: string;
  name: string;
  /** 部门(行政机构 code) */
  adminCode: string;
  /** 行政职务 */
  position: string;
  /** 所在党支部(party branch code) */
  partyCode: string;
  /** 党组织职务(空 = 普通党员) */
  partyPosition?: string;
  /** 附加角色,custom scope 指向某组织 code(基础 member 由 seed 自动加) */
  extraRoles?: Array<{ code: string; scopeCode: string }>;
}

export const DEMO_USERS: DemoUserSeed[] = [
  // 朱海君 —— 紧挨 admin。党群工作部 经理(行政) + 机关第十一党支部 书记(党内)
  {
    username: '80545411',
    name: '朱海君',
    adminCode: 'KL-ADMIN-L3-HQ-11',
    position: '经理',
    partyCode: 'KL-PARTY-L3-HQ-11',
    partyPosition: '书记',
    extraRoles: [
      { code: 'dept_manager', scopeCode: 'KL-ADMIN-L3-HQ-11' },
      { code: 'party_secretary', scopeCode: 'KL-PARTY-L3-HQ-11' },
    ],
  },

  // ─── 名册截图 8 人 ───
  { username: '81243632', name: '张明',   adminCode: 'KL-ADMIN-L3-HQ-11',  position: '党建管理岗',   partyCode: 'KL-PARTY-L3-HQ-11' },
  { username: '80543400', name: '杨一凡', adminCode: 'KL-ADMIN-L3-HQ-11',  position: '副经理',       partyCode: 'KL-PARTY-L3-HQ-11',  extraRoles: [{ code: 'dept_manager', scopeCode: 'KL-ADMIN-L3-HQ-11' }] },
  { username: '50267848', name: '李月',   adminCode: 'KL-ADMIN-L3-HQ-11',  position: '共青团管理岗', partyCode: 'KL-PARTY-L3-HQ-11' },
  { username: '80523865', name: '王金雨', adminCode: 'KL-ADMIN-L3-HQ-04',  position: '组织部部长',   partyCode: 'KL-PARTY-L3-HQ-04',  extraRoles: [{ code: 'dept_manager', scopeCode: 'KL-ADMIN-L3-HQ-04' }] },
  { username: '86293664', name: '安丽',   adminCode: 'KL-ADMIN-L3-HQ-04',  position: '党建管理岗',   partyCode: 'KL-PARTY-L3-HQ-04' },
  { username: '80523911', name: '李峰',   adminCode: 'KL-ADMIN-L4-TYS-01', position: '书记',         partyCode: 'KL-PARTY-L3-TYS-01', extraRoles: [{ code: 'party_secretary', scopeCode: 'KL-PARTY-L3-TYS-01' }] },
  { username: '80523419', name: '孙彩霞', adminCode: 'KL-ADMIN-L4-TYS-02', position: '党建管理岗',   partyCode: 'KL-PARTY-L3-TYS-01' },
  { username: '80530489', name: '李桂红', adminCode: 'KL-ADMIN-L4-TYS-03', position: '书记',         partyCode: 'KL-PARTY-L3-TYS-02', extraRoles: [{ code: 'party_secretary', scopeCode: 'KL-PARTY-L3-TYS-02' }] },
];
