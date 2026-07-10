/**
 * 员工真实数据导入 — 一次性迁移脚本(独立 tsx 入口,不经 Nest DI / 通用 ImportService)。
 *
 * 源文件 `导入单位姓名/员工.xls`(实为 GBK 制表符文本,非二进制 Excel),20705 名员工(全体,含非党员),列:
 *   序号 | 二级报表单位 | 组织单位编码(8 位) | 组织单位 | 员工编号 | 姓名 | 岗位 | 性别
 *
 * 落库规则(按用户要求「按员工组织单位编码 + 员工编号对照导入,已导入的补行政机构关联 + 岗位」):
 *   1. 用户以「员工编号」为唯一键(建号 / 命中复用)。命中已存在的党员/账号 → 只补关联+岗位,不改其姓名/党组织归属。
 *   2. 行政机构关联:按「组织单位编码」精确匹配现库 admin 组织(code 全局唯一)→ 挂 1 条行政归属,
 *      position = 岗位;isPrimary = 该用户此前无任何行政归属时为主岗(党组织主岗独立、不受影响)。
 *   3. 性别:文件「性别」列 男/女 → gender(male/female);已有 gender 的(党员按身份证推过)不覆盖
 *      (实测 5305 名重叠党员 身份证推导 与 文件性别列 100% 一致)。
 *   4. 无任何角色的用户补默认「普通用户 member」(scope=self)。
 *   5. ★「组织单位编码」在现库匹配不到的行(公司机关的真实部门 / 配送中心分队 / 区域中心 等,行政机构.xls 未含):
 *      员工仍建号;按用户方案把这些人**放进「待分配人员」暂存机构** —— 在其「二级报表单位」对应的系统二级单位
 *      下建 1 个「待分配人员」子机构(幂等,已存在复用),把人挂进去(position=岗位,主岗)。以后用户再逐一移到真实部门。
 *   6. 「二级报表单位」都对不上系统二级单位的(如 机关附属机构 / 华油国际)→ 不臆造机构,只汇总报告,由用户逐一确认处理。
 *
 * 用法(cwd = backend):
 *   npx tsx prisma/import-employees.ts             # dry-run,只打印计划不写库
 *   npx tsx prisma/import-employees.ts --commit    # 真正写库
 *   npx tsx prisma/import-employees.ts --commit "路径/员工.xls"
 *
 * 幂等:建号/归属/角色均 skipDuplicates;岗位在归属**创建时**写入(重跑不改已存在归属的岗位)。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.xlsx?$/i.test(a));
const DEFAULT_PATH = 'C:/Users/zhangming/Desktop/导入单位姓名/员工.xls';
const FILE_PATH = argPath ? path.resolve(argPath) : DEFAULT_PATH;

interface Rec {
  rowNo: number;
  unit2: string; // 二级报表单位(仅作报告分组用)
  orgCode: string; // 组织单位编码(匹配 admin 组织 code)
  orgName: string; // 组织单位(仅报告)
  empNo: string; // 员工编号 = username
  name: string;
  post: string; // 岗位 → membership.position
  gender: string; // 男/女
}

// 文件「二级报表单位」名 → 现库二级单位名(与 import-admin-orgs 同一套别名)
const UNIT2_ALIAS: Record<string, string> = {
  教培中心: '教育培训中心',
  华北运输公司: '华北运输分公司',
  哈萨克斯坦分公司: '哈萨克分公司',
  江苏分公司: '苏皖分公司',
  湖北分公司: '湘鄂分公司',
  福建分公司: '闽赣分公司',
  云南分公司: '云贵分公司',
  陕西分公司: '陕豫分公司',
};
const PENDING_ORG_NAME = '待分配人员';

function s(v: unknown): string {
  return String(v ?? '').trim();
}
// 员工编号标准化:纯数字且 <8 位 → 前补 0 到 8 位。
// ⚠ 员工.xls 的编号被 Excel 当数字存、丢了前导零(如 855844),不补零会与党员.xlsx 的 8 位文本码(00855844)
//   建成重复账号。补零后与党员账号命中同一 username,只补归属不重复建号。
function empNo(v: unknown): string {
  const t = s(v);
  return /^\d+$/.test(t) && t.length < 8 ? t.padStart(8, '0') : t;
}
function norm(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, '').trim();
}
function genderCode(v: string): 'male' | 'female' | null {
  return v === '男' ? 'male' : v === '女' ? 'female' : null;
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function readRecords(): Rec[] {
  if (!fs.existsSync(FILE_PATH)) throw new Error(`源文件不存在:${FILE_PATH}`);
  const buf = fs.readFileSync(FILE_PATH);
  let text: string;
  try {
    text = new TextDecoder('gbk').decode(buf);
  } catch {
    text = new TextDecoder('gb18030').decode(buf);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('文件为空');
  const header = lines[0].split('\t').map(s);
  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) col[h] = i;
  });
  for (const n of ['组织单位编码', '员工编号', '姓名']) if (!(n in col)) throw new Error(`表头缺少必需列「${n}」`);
  const g = (c: string[], n: string): string => (n in col ? s(c[col[n]]) : '');
  return lines.slice(1).map((l, i) => {
    const c = l.split('\t');
    return {
      rowNo: i + 2,
      unit2: g(c, '二级报表单位'),
      orgCode: g(c, '组织单位编码'),
      orgName: g(c, '组织单位'),
      empNo: empNo(g(c, '员工编号')), // 标准化补零到 8 位,防与党员账号重复
      name: g(c, '姓名'),
      post: g(c, '岗位'),
      gender: g(c, '性别'),
    };
  });
}

async function main() {
  console.log('━━━━ 员工真实数据导入 ━━━━');
  console.log(`模式:${COMMIT ? '★ 写库(--commit)' : 'dry-run(只打印,不写库)'}`);
  console.log(`源文件:${FILE_PATH}\n`);

  const recs = readRecords();
  console.log(`读到 ${recs.length} 名员工`);
  const abort: string[] = [];

  // 必填
  const missKey = recs.filter((r) => !r.empNo || !r.name || !r.orgCode);
  if (missKey.length) abort.push(`有 ${missKey.length} 行缺 员工编号/姓名/组织单位编码,首例第 ${missKey[0].rowNo} 行`);

  // 员工编号唯一(同编号多行 = 多岗;本表实测唯一)
  const byEmp = new Map<string, Rec[]>();
  for (const r of recs) {
    if (!r.empNo) continue;
    (byEmp.get(r.empNo) ?? byEmp.set(r.empNo, []).get(r.empNo)!).push(r);
  }
  const dupEmp = [...byEmp.entries()].filter(([, a]) => a.length > 1);
  if (dupEmp.length) {
    // 不中止:同编号多行按多条行政归属处理(第一条为主岗)
    console.log(`ℹ 员工编号出现多行(多岗/多单位)${dupEmp.length} 组,将各建一条行政归属`);
  }

  // 性别
  let male = 0,
    female = 0,
    noGender = 0;
  for (const r of recs) {
    const g = genderCode(r.gender);
    if (g === 'male') male++;
    else if (g === 'female') female++;
    else noGender++;
  }

  // 组织匹配(按 code)
  const admin = await prisma.organization.findMany({
    where: { kind: 'admin' },
    select: { id: true, code: true, name: true, type: true, isVirtual: true, parentId: true },
  });
  const codeToOrgId = new Map(admin.map((o) => [o.code, o.id]));
  const matchedRows = recs.filter((r) => codeToOrgId.has(r.orgCode));
  const unmatchedRows = recs.filter((r) => !codeToOrgId.has(r.orgCode));

  // 未匹配组织按「二级报表单位」汇总(供报告)
  const gapByUnit2 = new Map<string, { people: number; codes: Set<string> }>();
  for (const r of unmatchedRows) {
    const k = r.unit2 || '(空)';
    const o = gapByUnit2.get(k) ?? { people: 0, codes: new Set<string>() };
    o.people++;
    o.codes.add(r.orgCode);
    gapByUnit2.set(k, o);
  }

  // ── 未匹配员工 → 按「二级报表单位」放进对应系统二级单位下的「待分配人员」暂存机构 ──
  // 系统二级单位候选 = root 下两个虚拟壳(公司机关/基层单位)本身 + 壳的直接子级(34 分公司 + 机关部门等)
  const rootAdmin = admin.find((o) => !o.parentId);
  const wrappers = admin.filter((o) => o.isVirtual && rootAdmin && o.parentId === rootAdmin.id);
  const wrapperIds = new Set(wrappers.map((w) => w.id));
  const unit2Candidates = [...wrappers, ...admin.filter((o) => wrapperIds.has(o.parentId ?? ''))];
  const unit2ByName = new Map<string, typeof admin>();
  for (const o of unit2Candidates) {
    (unit2ByName.get(norm(o.name)) ?? unit2ByName.set(norm(o.name), []).get(norm(o.name))!).push(o);
  }
  // 每个「二级报表单位」映射到唯一系统二级单位;映射不到的(如 机关附属机构 / 华油国际)
  // 按用户方案统一兜底进「公司机关 / 待分配人员」。
  const hqWrapper = wrappers.find((w) => norm(w.name) === norm('公司机关'));
  interface Bucket {
    unit: (typeof admin)[number];
    rows: Rec[];
  }
  const buckets = new Map<string, Bucket>(); // systemUnitId → bucket
  const fallbackByUnit2 = new Map<string, number>(); // 兜底进公司机关的:二级报表单位 → 人数
  const unmappable = new Map<string, Rec[]>(); // 连公司机关壳都没有(异常)
  for (const r of unmatchedRows) {
    const dbName = UNIT2_ALIAS[r.unit2] ?? r.unit2;
    const hits = unit2ByName.get(norm(dbName)) ?? [];
    let target = hits.length === 1 ? hits[0] : undefined;
    if (!target) {
      target = hqWrapper; // 兜底:公司机关壳
      if (target) fallbackByUnit2.set(r.unit2, (fallbackByUnit2.get(r.unit2) ?? 0) + 1);
    }
    if (target) {
      (buckets.get(target.id) ?? buckets.set(target.id, { unit: target, rows: [] }).get(target.id)!).rows.push(r);
    } else {
      (unmappable.get(r.unit2) ?? unmappable.set(r.unit2, []).get(r.unit2)!).push(r);
    }
  }
  const pendingPeople = [...buckets.values()].reduce((n, b) => n + b.rows.length, 0);
  const fallbackPeople = [...fallbackByUnit2.values()].reduce((n, v) => n + v, 0);
  const unmappablePeople = [...unmappable.values()].reduce((n, a) => n + a.length, 0);

  // 现有用户
  const allEmp = [...byEmp.keys()];
  const existing: { id: string; username: string; customFields: string | null }[] = [];
  for (const c of chunk(allEmp, 1000)) {
    existing.push(
      ...(await prisma.user.findMany({ where: { username: { in: c } }, select: { id: true, username: true, customFields: true } })),
    );
  }
  const existMap = new Map(existing.map((u) => [u.username, u]));
  const newEmps = allEmp.filter((e) => !existMap.has(e));

  // ── 打印计划 ──
  console.log('\n── 计划 ──');
  console.log(`员工总数:${recs.length}(命中现有用户 ${existing.length}、新建 ${newEmps.length})`);
  console.log(`性别:男 ${male}、女 ${female}、缺 ${noGender}`);
  console.log(`行政机构关联:可关联 ${matchedRows.length} 人(组织编码命中现库),无法关联 ${unmatchedRows.length} 人`);
  console.log(`岗位:非空 ${recs.filter((r) => r.post).length} / ${recs.length}`);
  console.log(`守卫:必填缺失 ${missKey.length}`);

  console.log(`\n组织编码匹配不到现库的 ${unmatchedRows.length} 人 → 放进「${PENDING_ORG_NAME}」暂存机构:`);
  console.log(`  · 可归入二级单位 ${buckets.size} 个(各建/复用 1 个「${PENDING_ORG_NAME}」),共 ${pendingPeople} 人`);
  const bucketSorted = [...buckets.values()].sort((a, b) => b.rows.length - a.rows.length);
  for (const b of bucketSorted) console.log(`      ${String(b.rows.length).padStart(4)}人  ${b.unit.name}${b.unit.isVirtual ? '(虚拟壳)' : ''} / ${PENDING_ORG_NAME}`);
  if (fallbackPeople > 0) {
    console.log(`  · 二级报表单位对不上系统二级单位、兜底进「公司机关 / ${PENDING_ORG_NAME}」的:${fallbackPeople} 人`);
    for (const [u2, n] of fallbackByUnit2) console.log(`      ${String(n).padStart(4)}人  「${u2}」→ 公司机关 / ${PENDING_ORG_NAME}`);
  }
  if (unmappablePeople > 0) console.log(`  · ★ 连公司机关壳都找不到(异常,需查):${unmappablePeople} 人`);

  if (abort.length) {
    console.error('\n✗ 存在阻断问题,已中止(未写库):');
    for (const a of abort) console.error('  · ' + a);
    process.exitCode = 1;
    return;
  }
  if (!COMMIT) {
    console.log('\n(dry-run 结束,如无异常请加 --commit 写库)');
    return;
  }

  // ═══════════════ 写库 ═══════════════
  console.log('\n── 写库 ──');

  // Phase 1:批量建新用户(name + gender)
  const newRecs = recs.filter((r) => existMap.has(r.empNo) === false);
  // 同编号多行只建一次号(取首行);行政归属稍后按每行建
  const newByEmp = new Map<string, Rec>();
  for (const r of newRecs) if (!newByEmp.has(r.empNo)) newByEmp.set(r.empNo, r);
  let created = 0;
  for (const c of chunk([...newByEmp.values()], 500)) {
    const res = await prisma.user.createMany({
      data: c.map((r) => {
        const g = genderCode(r.gender);
        const cf = g ? JSON.stringify({ gender: g }) : null;
        return { username: r.empNo, name: r.name, active: true, customFields: cf };
      }),
      skipDuplicates: true,
    });
    created += res.count;
  }
  console.log(`✓ Phase 1:新建用户 ${created} / ${newByEmp.size}`);

  // Phase 2:已存在用户补性别(仅当当前缺 gender;不覆盖党员按身份证推的值)
  let genderFilled = 0;
  for (const r of recs) {
    const u = existMap.get(r.empNo);
    if (!u) continue;
    const g = genderCode(r.gender);
    if (!g) continue;
    let cf: Record<string, string> = {};
    if (u.customFields) {
      try {
        cf = JSON.parse(u.customFields);
      } catch {
        cf = {};
      }
    }
    if (cf.gender) continue; // 已有性别,不动
    cf.gender = g;
    await prisma.user.update({ where: { id: u.id }, data: { customFields: JSON.stringify(cf) } });
    u.customFields = JSON.stringify(cf); // 防同编号多行重复更新
    genderFilled++;
  }
  console.log(`✓ Phase 2:为缺性别的已存在用户补 gender ${genderFilled}`);

  // 取全部 username → id
  const idByEmp = new Map<string, string>();
  for (const c of chunk(allEmp, 1000)) {
    const us = await prisma.user.findMany({ where: { username: { in: c } }, select: { id: true, username: true } });
    for (const u of us) idByEmp.set(u.username, u.id);
  }

  // Phase 3:行政机构关联(按 code 命中的行)。position=岗位;isPrimary=该用户此前无任何**真实**admin 归属。
  // ★ 若该员工此前被放进「待分配人员」暂存(如后来补了组织编码),命中真实组织后把暂存归属移除(重新分配)。
  const userIds = [...idByEmp.values()];
  const bucketOrgIds = new Set(
    (await prisma.organization.findMany({ where: { name: PENDING_ORG_NAME, kind: 'admin' }, select: { id: true } })).map((o) => o.id),
  );
  const adminMemByUser = new Map<string, Set<string>>(); // userId → 已有 admin orgId 集(含暂存桶)
  for (const c of chunk(userIds, 1000)) {
    const ms = await prisma.userOrganization.findMany({
      where: { userId: { in: c }, org: { kind: 'admin' } },
      select: { userId: true, orgId: true },
    });
    for (const m of ms) (adminMemByUser.get(m.userId) ?? adminMemByUser.set(m.userId, new Set()).get(m.userId)!).add(m.orgId);
  }
  const plannedCount = new Map<string, number>(); // 每用户本次已计划 admin 归属数(决定主岗)
  const memRows: Prisma.UserOrganizationCreateManyInput[] = [];
  const bucketRemovals = new Map<string, string[]>(); // bucketOrgId → 要移出的 userId[]
  for (const r of matchedRows) {
    const uid = idByEmp.get(r.empNo);
    const orgId = codeToOrgId.get(r.orgCode);
    if (!uid || !orgId) continue;
    const already = adminMemByUser.get(uid) ?? new Set<string>();
    // 命中真实组织 → 该员工在任何「待分配人员」桶里的归属都应移除(重新分配到真实部门)
    for (const oid of already) {
      if (bucketOrgIds.has(oid)) {
        (bucketRemovals.get(oid) ?? bucketRemovals.set(oid, []).get(oid)!).push(uid);
        already.delete(oid);
      }
    }
    if (already.has(orgId)) continue; // 已在目标真实组织(重跑)→ 跳过
    const hasReal = [...already].some((oid) => !bucketOrgIds.has(oid));
    const plannedSoFar = plannedCount.get(uid) ?? 0;
    const isPrimary = !hasReal && plannedSoFar === 0; // 无真实 admin 归属、且本次首条 → 主岗
    plannedCount.set(uid, plannedSoFar + 1);
    memRows.push({ userId: uid, orgId, isPrimary, position: r.post || null });
    already.add(orgId);
    adminMemByUser.set(uid, already);
  }
  let memCreated = 0;
  for (const c of chunk(memRows, 1000)) {
    const res = await prisma.userOrganization.createMany({ data: c, skipDuplicates: true });
    memCreated += res.count;
  }
  // 移除被重新分配者的「待分配人员」暂存归属
  let rehomed = 0;
  for (const [oid, uids] of bucketRemovals) {
    for (const c of chunk(uids, 1000)) {
      const res = await prisma.userOrganization.deleteMany({ where: { orgId: oid, userId: { in: c } } });
      rehomed += res.count;
    }
  }
  console.log(
    `✓ Phase 3:新增行政机构归属 ${memCreated}(其中主岗 ${memRows.filter((m) => m.isPrimary).length})` +
      (rehomed ? `;从「${PENDING_ORG_NAME}」重新分配到真实部门 ${rehomed} 人` : '') +
      `;无法匹配组织的 ${unmatchedRows.length} 人走 Phase 5`,
  );

  // Phase 4:无任何角色的用户补 member
  const member = await prisma.role.findUnique({ where: { code: 'member' } });
  if (!member) {
    console.error('  ⚠ 缺少 member 角色,跳过(请先 npm run db:seed)');
  } else {
    const roled = new Set<string>();
    for (const c of chunk(userIds, 1000)) {
      const rs = await prisma.userRole.findMany({ where: { userId: { in: c } }, select: { userId: true } });
      for (const x of rs) roled.add(x.userId);
    }
    const roleRows = userIds.filter((uid) => !roled.has(uid)).map((uid) => ({ userId: uid, roleId: member.id, scope: 'self' }));
    let roleCreated = 0;
    for (const c of chunk(roleRows, 1000)) {
      const res = await prisma.userRole.createMany({ data: c, skipDuplicates: true });
      roleCreated += res.count;
    }
    console.log(`✓ Phase 4:补默认 member 角色 ${roleCreated}(已有角色跳过 ${roled.size})`);
  }

  // Phase 5:未匹配组织的员工 → 各自二级单位下的「待分配人员」暂存机构(幂等,已存在复用)
  let bucketOrgCreated = 0;
  const bucketOrgId = new Map<string, string>(); // systemUnitId → 待分配人员 orgId
  for (const b of buckets.values()) {
    // 按「父 + 名」找现有桶(robust:即便父单位的 code 后来被更新,也不会重复建桶)
    const found = await prisma.organization.findFirst({
      where: { parentId: b.unit.id, name: PENDING_ORG_NAME, kind: 'admin' },
      select: { id: true },
    });
    if (found) {
      bucketOrgId.set(b.unit.id, found.id);
    } else {
      const code = `PENDING-${b.unit.code}`;
      const org = await prisma.organization.create({
        data: {
          code,
          name: PENDING_ORG_NAME,
          kind: 'admin',
          type: 'level3',
          isDept: false,
          isVirtual: false,
          parentId: b.unit.id,
          active: true,
          sortOrder: 99990,
        },
      });
      bucketOrgId.set(b.unit.id, org.id);
      bucketOrgCreated++;
    }
  }
  // 只把「当前无任何行政归属」的员工挂到待分配人员(主岗);已有行政归属的(种子演示账号)不动
  const bucketMemRows: Prisma.UserOrganizationCreateManyInput[] = [];
  for (const b of buckets.values()) {
    const orgId = bucketOrgId.get(b.unit.id)!;
    for (const r of b.rows) {
      const uid = idByEmp.get(r.empNo);
      if (!uid) continue;
      if ((adminMemByUser.get(uid)?.size ?? 0) > 0) continue;
      bucketMemRows.push({ userId: uid, orgId, isPrimary: true, position: r.post || null });
      (adminMemByUser.get(uid) ?? adminMemByUser.set(uid, new Set()).get(uid)!).add(orgId);
    }
  }
  let bucketMemCreated = 0;
  for (const c of chunk(bucketMemRows, 1000)) {
    const res = await prisma.userOrganization.createMany({ data: c, skipDuplicates: true });
    bucketMemCreated += res.count;
  }
  console.log(`✓ Phase 5:「${PENDING_ORG_NAME}」机构 ${buckets.size} 个(本次新建 ${bucketOrgCreated})、暂存关联 ${bucketMemCreated} 人`);
  if (fallbackPeople > 0) {
    console.log(`  · 其中二级报表单位对不上系统的 ${fallbackPeople} 人(${[...fallbackByUnit2].map(([u, n]) => `${u} ${n}`).join('、')})→ 已兜底进「公司机关 / ${PENDING_ORG_NAME}」`);
  }
  if (unmappablePeople > 0) console.log(`  ★ 仍有 ${unmappablePeople} 人无处安放(连公司机关壳都没有,异常需查)`);

  await prisma.auditLog.create({
    data: {
      action: 'import.employees',
      actorName: '系统导入(员工.xls)',
      detail: JSON.stringify({
        total: recs.length,
        created,
        memberships: memCreated,
        pendingBuckets: buckets.size,
        pendingAssociated: bucketMemCreated,
        fallbackToHq: fallbackPeople,
        unmappable: unmappablePeople,
        male,
        female,
        source: path.basename(FILE_PATH),
      }),
    },
  });

  console.log(`\nℹ 组织不在树里的 ${unmatchedRows.length} 人已全部进「${PENDING_ORG_NAME}」暂存(其中 ${fallbackPeople} 人二级报表单位对不上、兜底进公司机关);可在组织管理里逐一移到真实部门。`);
  console.log('\n━━━━ 完成 ━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
